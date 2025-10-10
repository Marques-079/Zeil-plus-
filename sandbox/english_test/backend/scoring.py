# scoring.py
import os, tempfile, subprocess, math
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple

import math
import numpy as np
import librosa

import numpy as np
import librosa
import soundfile as sf
from jiwer import wer
from faster_whisper import WhisperModel



# --------- ASR ----------
# Use small.en for speed; switch to "medium.en"/"large-v3" for accuracy if you have compute
_ASR = WhisperModel("small.en", device="cpu", compute_type="int8")

def webm_to_wav(in_bytes: bytes, target_sr=16000) -> np.ndarray:
    """Decode webm/opus via ffmpeg to mono PCM float32 at target_sr; return samples array."""
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f_in:
        f_in.write(in_bytes)
        in_path = f_in.name
    out_path = in_path.replace(".webm", "_16k.wav")
    try:
        cmd = [
            "ffmpeg", "-y", "-i", in_path,
            "-ac", "1", "-ar", str(target_sr),
            out_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        audio, sr = sf.read(out_path, dtype="float32")
        if sr != target_sr:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=target_sr)
        return audio
    finally:
        for p in (in_path, out_path):
            try: os.remove(p)
            except: pass

def transcribe_with_words(audio: np.ndarray, sr=16000) -> Tuple[str, List[Dict[str, float]]]:
    """
    Returns (full_text, words) with per-word timestamps.
    words: [{ "word": str, "start": float, "end": float }]
    """
    segments, info = _ASR.transcribe(audio, language="en", word_timestamps=True, vad_filter=True)
    full = []
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
            full.append(w.word)
    return " ".join(full).strip(), words

# --------- Metrics ----------
def compute_accuracy(expected_text: str, hyp_text: str) -> float:
    w = wer(expected_text.lower(), hyp_text.lower())  # 0..1 where 0 perfect
    return max(0.0, 1.0 - w)

def compute_fluency(words: List[Dict[str, float]], total_words_expected: int) -> float:
    if not words:
        return 0.0
    dur = words[-1]["end"] - words[0]["start"]
    dur = max(dur, 1e-3)
    wpm = len(words) * (60.0 / dur)
    # Reward ~130–180 wpm as full; linearly decrease outside (clamped at 0)
    if wpm < 80:
        wpm_score = (wpm - 40) / (80 - 40)  # 40->0, 80->1
    elif wpm <= 180:
        wpm_score = 1.0
    else:
        wpm_score = max(0.0, 1.0 - (wpm - 180) / 120)  # 180->1 down to 300->0
    wpm_score = float(np.clip(wpm_score, 0.0, 1.0))

    # Pause penalty: gaps > 0.30s between consecutive words
    gaps = []
    for i in range(1, len(words)):
        gap = max(0.0, words[i]["start"] - words[i-1]["end"])
        if gap > 0.30: gaps.append(gap)
    # Normalize by expected length to be fair: fewer/shorter pauses → higher score
    if total_words_expected <= 0:
        pause_score = 1.0
    else:
        pause_rate = len(gaps) / total_words_expected  # pauses per word
        # 0 → 1.0, 0.2 → 0.3, >=0.4 → ~0
        pause_score = np.exp(-6.0 * pause_rate)
    # Blend
    return float(np.clip(0.7 * wpm_score + 0.3 * pause_score, 0.0, 1.0))

# scoring.py (replace your mfcc_dtw_similarity + prosody_similarity)
def mfcc_dtw_similarity(a: np.ndarray, b: np.ndarray, sr=16000, n_mfcc=20) -> float:
    # Compute MFCCs: shape = (K=n_mfcc, N_frames)
    A = librosa.feature.mfcc(y=a, sr=sr, n_mfcc=n_mfcc)
    B = librosa.feature.mfcc(y=b, sr=sr, n_mfcc=n_mfcc)

    # Early exits / guards
    # (very short clips can produce 0 or 1 frame -> DTW cannot run)
    if A.ndim != 2 or B.ndim != 2:
        return 0.0
    if A.shape[0] != B.shape[0]:   # K must match
        # should never happen since both use n_mfcc, but guard anyway
        K = min(A.shape[0], B.shape[0])
        A, B = A[:K], B[:K]
    if A.shape[1] < 2 or B.shape[1] < 2:
        # Fallback: cosine between global MFCC means, mapped to [0,1]
        mA, mB = A.mean(axis=1), B.mean(axis=1)
        num = float(np.dot(mA, mB))
        den = float(np.linalg.norm(mA) * np.linalg.norm(mB) + 1e-8)
        cos = num / den
        return float(np.clip((cos + 1.0) * 0.5, 0.0, 1.0))

    # Z-normalize per coefficient (along time)
    A = (A - A.mean(axis=1, keepdims=True)) / (A.std(axis=1, keepdims=True) + 1e-8)
    B = (B - B.mean(axis=1, keepdims=True)) / (B.std(axis=1, keepdims=True) + 1e-8)

    # DTW expects X:(K,N) and Y:(K,M). Do NOT transpose.
    try:
        D, wp = librosa.sequence.dtw(X=A, Y=B, metric="cosine")
        dist = float(D[-1, -1]) / max(1, len(wp))  # average per-step distance
        sim = math.exp(-dist)                       # smaller dist -> closer to 1
        return float(np.clip(sim, 0.0, 1.0))
    except Exception:
        # Robust fallback if DTW still complains
        mA, mB = A.mean(axis=1), B.mean(axis=1)
        num = float(np.dot(mA, mB))
        den = float(np.linalg.norm(mA) * np.linalg.norm(mB) + 1e-8)
        cos = num / den
        return float(np.clip((cos + 1.0) * 0.5, 0.0, 1.0))

def prosody_similarity(user_audio: np.ndarray, ref_audio: np.ndarray, sr=16000) -> float:
    return mfcc_dtw_similarity(user_audio, ref_audio, sr=sr)


@dataclass
class ScoreBreakdown:
    accuracy: float
    fluency: float
    prosody: float
    final_0_100: float
    details: Dict[str, Any]

def score_user_reading(
    expected_text: str,
    user_audio: np.ndarray,
    reference_audio: np.ndarray,
    sr=16000
) -> ScoreBreakdown:
    hyp_text, words = transcribe_with_words(user_audio, sr=sr)
    acc = compute_accuracy(expected_text, hyp_text)
    flu = compute_fluency(words, total_words_expected=len(expected_text.split()))
    pro = prosody_similarity(user_audio, reference_audio, sr=sr)
    final = 100.0 * (0.40*acc + 0.30*flu + 0.30*pro)
    details = {
        "transcript_user": hyp_text,
        "word_timestamps": words,
        "speech_rate_wpm": (len(words) * 60.0 /
                            max(1e-3, words[-1]["end"] - words[0]["start"])) if words else 0.0
    }
    return ScoreBreakdown(acc, flu, pro, final, details)

def load_wav(path: str, sr=16000) -> np.ndarray:
    a, s = librosa.load(path, sr=sr, mono=True)
    return a


