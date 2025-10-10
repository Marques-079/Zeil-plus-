# app.py
from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import json
import numpy as np

from scoring import webm_to_wav, load_wav, score_user_reading

# ---- Paths (make everything file-relative) ----
BASE_DIR = Path(__file__).resolve().parent
PROMPTS_PATH = BASE_DIR / "prompts.json"

# ---- Server ----
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later to ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load prompts.json (relative to this file)
if not PROMPTS_PATH.exists():
    raise FileNotFoundError(f"prompts.json not found at: {PROMPTS_PATH}")
with open(PROMPTS_PATH, "r") as f:
    PROMPTS = {p["id"]: p for p in json.load(f)}

@app.get("/test")
def get_test():
    """Returns a test with two sentences and an id."""
    p = list(PROMPTS.values())[0]
    return {"prompt_id": p["id"], "sentences": p["lines"]}

@app.post("/score")
async def score(
    prompt_id: str = Form(...),
    started_ms: float = Form(...),
    ended_ms: float = Form(...),
    audio: UploadFile | None = None,
):
    if audio is None:
        raise HTTPException(400, "Missing audio file")
    if prompt_id not in PROMPTS:
        raise HTTPException(400, f"Unknown prompt_id {prompt_id}")

    # Read audio blob and decode to 16 kHz mono
    try:
        raw = await audio.read()
        user_audio = webm_to_wav(raw, target_sr=16000)
    except Exception as e:
        raise HTTPException(400, f"Audio decode failed: {e}")

    # Build expected text and load reference (file-relative)
    p = PROMPTS[prompt_id]
    expected_text = " ".join(p["lines"])
    ref_path = BASE_DIR / p["reference_wav"]
    if not ref_path.exists():
        raise HTTPException(500, f"Reference file missing: {ref_path}")
    ref_audio = load_wav(str(ref_path), sr=16000)

    # Score
    breakdown = score_user_reading(expected_text, user_audio, ref_audio, sr=16000)
    result = {
        "prompt_id": prompt_id,
        "frontend_duration_ms": float(ended_ms - started_ms),
        "scores": {
            "final": round(breakdown.final_0_100, 1),
            "accuracy": round(breakdown.accuracy, 3),
            "fluency": round(breakdown.fluency, 3),
            "prosody": round(breakdown.prosody, 3),
        },
        "details": breakdown.details,
    }
    return JSONResponse(result)
