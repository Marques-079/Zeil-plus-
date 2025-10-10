#!/usr/bin/env python3
"""
CV ↔ Job scoring (fast path):
- PDF-friendly text extraction (optional quick extractor)
- Keyword coverage (exact + fuzzy fallback)
- Embedding similarity (job vs whole CV)
- Evidence rerank on TOP-N lines only (big speed win)
- Batching + device auto-pick (cpu/cuda)

Usage (same as before):
  python cv_ranker_fast.py \
    --pdf sandbox/scorer/cv_Abigail_Brown.pdf \
    --job sandbox/scorer/job.txt \
    --keywords "POS,sales,EFTPOS,brand" \
    --speed fast

Extra options:
  --quick-extract   # faster but less layout-aware PDF text
  --no-ocr          # skip OCR fallback
  --batch 64        # override default batch size
  --device cpu|cuda|auto
"""

import argparse, os, re, math, subprocess, tempfile, statistics, sys
from typing import List, Tuple
import numpy as np
import json  # <-- added

# PDF
import fitz  # PyMuPDF

# NLP
from FlagEmbedding import FlagModel, FlagReranker  # bge-m3 + bge-reranker-v2-m3
from rapidfuzz import fuzz

# Optional device auto-detect
try:
    import torch
    _HAS_TORCH = True
except Exception:
    _HAS_TORCH = False

# ---------------------------
# Config: speed presets
# ---------------------------
SPEED_PRESETS = {
    # name: dict of caps/batches
    "fast":      {"max_segments": 900,  "topN_for_rerank": 140, "emb_batch": 96,  "rerank_batch": 64},
    "balanced":  {"max_segments": 1600, "topN_for_rerank": 240, "emb_batch": 64,  "rerank_batch": 48},
    "max":       {"max_segments": 3000, "topN_for_rerank": 400, "emb_batch": 48,  "rerank_batch": 32},
}

# ---------------------------
# PDF → structured text (with OCR fallback)
# ---------------------------
def ocr_if_needed(pdf_path: str, allow_ocr: bool) -> str:
    """If the PDF has little/no extractable text, try OCRmyPDF to add a text layer and return new path."""
    try:
        txt = extract_text_structured(pdf_path)
        if len(txt.strip()) > 400:  # heuristic: already has text
            return pdf_path
    except Exception:
        pass
    if not allow_ocr:
        return pdf_path
    out_pdf = os.path.join(tempfile.gettempdir(), f"ocr_{os.path.basename(pdf_path)}")
    try:
        subprocess.run(
            ["ocrmypdf", "--skip-text", "--fast-web-view", "1", pdf_path, out_pdf],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return out_pdf
    except Exception:
        return pdf_path  # fall back; caller will warn if text is tiny

def _remove_headers_footers(pages_text: List[str]) -> List[str]:
    """Remove lines likely to be headers/footers by finding lines repeated across pages."""
    counts = {}
    for t in pages_text:
        for ln in [x.strip() for x in t.splitlines() if x.strip()]:
            counts[ln] = counts[ln] + 1 if ln in counts else 1
    thresh = max(2, int(0.6 * len(pages_text)))  # lines on ≥60% pages
    repeated = {ln for ln, c in counts.items() if c >= thresh and len(ln) <= 80}
    cleaned = []
    for t in pages_text:
        keep = [ln for ln in t.splitlines() if ln.strip() and ln.strip() not in repeated]
        cleaned.append("\n".join(keep))
    return cleaned

def extract_text_structured(pdf_path: str) -> str:
    """
    Layout-aware PDF extraction with simple heading/bullet preservation.
    Uses PyMuPDF dict to access spans and sizes; joins blocks in reading order.
    """
    doc = fitz.open(pdf_path)
    page_texts = []
    for page in doc:
        pd = page.get_text("dict")
        lines_out, sizes = [], []

        # collect sizes (once)
        for b in pd.get("blocks", []):
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    sz = s.get("size")
                    if sz: sizes.append(sz)
        med_size = statistics.median(sizes) if sizes else 0.0

        for b in pd.get("blocks", []):
            block_lines, block_sizes = [], []
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    txt = (s.get("text") or "").strip()
                    if not txt:
                        continue
                    block_sizes.append(s.get("size", 0))
                    block_lines.append(txt)
            if not block_lines:
                continue

            is_heading = False
            if block_sizes and med_size:
                big = sum(sz > 1.2 * med_size for sz in block_sizes)
                is_heading = big >= max(1, int(0.6 * len(block_sizes)))

            text_block = " ".join(block_lines)
            if is_heading:
                lines_out += ["", text_block.upper(), ""]
            else:
                lines_out.append(text_block)

        page_texts.append("\n".join(lines_out))
    doc.close()

    # Remove repeated headers/footers
    page_texts = _remove_headers_footers(page_texts)
    return "\n\n".join(page_texts)

def extract_text_quick(pdf_path: str) -> str:
    """Faster, simpler extraction (no layout heuristics)."""
    doc = fitz.open(pdf_path)
    out = []
    for page in doc:
        out.append(page.get_text("text"))
    doc.close()
    return "\n\n".join(out)

def load_text_auto(path_or_text: str, quick_extract: bool, allow_ocr: bool) -> str:
    """
    If it's a path:
      - .pdf → extract (quick or structured; with optional OCR fallback)
      - other → read as text
    Else: treat as literal text.
    """
    if os.path.exists(path_or_text):
        if path_or_text.lower().endswith(".pdf"):
            use_path = ocr_if_needed(path_or_text, allow_ocr=allow_ocr)
            txt = extract_text_quick(use_path) if quick_extract else extract_text_structured(use_path)
            return txt
        with open(path_or_text, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    return path_or_text  # raw text

# ---------------------------
# Normalization & keyword matching
# ---------------------------
def normalize_text(s: str) -> str:
    s = s.replace("\u00A0", " ")  # nbsp
    s = re.sub(r"[^\w\s\-\+./]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def keyword_coverage(cv_text: str, keywords: List[str]) -> Tuple[float, List[str]]:
    if not keywords:
        return 0.0, []
    cv_norm = normalize_text(cv_text)
    found = []
    for kw in keywords:
        kw_norm = normalize_text(kw)
        if re.search(rf"\b{re.escape(kw_norm)}\b", cv_norm):
            found.append(kw)
            continue
        # fuzzy fallback (rarely hit due to exact phrase first)
        if fuzz.partial_ratio(kw_norm, cv_norm) >= 90:
            found.append(kw)
    return (len(found) / len(keywords)), found

# ---------------------------
# Embeddings + similarity (vectorized)
# ---------------------------
def l2_normalize(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9
    return mat / norms

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-9)
    b = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b))

# ---------------------------
# Segmentation
# ---------------------------
def segment_cv(cv_text: str, max_segments: int) -> List[str]:
    """
    Split into bullet-ish lines first, then sentences; keep medium-length lines.
    Cap total to avoid explosion.
    """
    candidates = re.split(r"(?:\n+|[•\-–]\s+)", cv_text)
    segs = []
    for c in candidates:
        c = c.strip()
        segs.extend([x.strip() for x in re.split(r"[.\n]", c) if x.strip()])
    # Keep informative lengths
    segs = [ln for ln in segs if 20 <= len(ln) <= 220]
    if len(segs) > max_segments:
        segs = segs[:max_segments]
    return segs

# ---------------------------
# Main scoring (fast path)
# ---------------------------
def score_cv_against_job_fast(
    cv_text: str,
    job_text: str,
    keywords: List[str],
    embedder: FlagModel,
    reranker: FlagReranker,
    max_segments: int,
    topN_for_rerank: int,
    emb_batch: int,
    rerank_batch: int,
) -> dict:
    # 1) keyword coverage (cheap)
    cov, matched = keyword_coverage(cv_text, keywords)
    cov_pct = 100.0 * cov

    # 2) embedding similarity (whole doc vs job)
    #    Keep separate from segment-level encoding to avoid unnecessary concat cost.
    if _HAS_TORCH:
        with torch.inference_mode():
            embs = embedder.encode([job_text, cv_text], batch_size=2)
    else:
        embs = embedder.encode([job_text, cv_text], batch_size=2)
    job_vec, cv_vec = np.array(embs[0]), np.array(embs[1])
    sim = cosine_sim(job_vec, cv_vec)
    sim_pct = 100.0 * ((sim + 1.0) / 2.0)

    # 3) Reranker evidence on TOP-N segments only
    segments = segment_cv(cv_text, max_segments=max_segments)
    rerank_pct = 0.0
    if segments:
        # Embed segments once (batched), cosine vs job, pick topN
        if _HAS_TORCH:
            with torch.inference_mode():
                seg_embs = embedder.encode(segments, batch_size=emb_batch)
        else:
            seg_embs = embedder.encode(segments, batch_size=emb_batch)
        seg_embs = np.array(seg_embs)
        job_norm = job_vec / (np.linalg.norm(job_vec) + 1e-9)
        seg_norm = l2_normalize(seg_embs)
        sims = seg_norm @ job_norm  # vectorized cosine

        # Get topN_for_rerank indices
        if len(segments) > topN_for_rerank:
            top_idx = np.argpartition(sims, -topN_for_rerank)[-topN_for_rerank:]
            # sort those by score descending for nicer logging
            top_idx = top_idx[np.argsort(sims[top_idx])[::-1]]
        else:
            # all
            top_idx = np.argsort(sims)[::-1]

        top_segments = [segments[i] for i in top_idx]
        pairs = [[job_text, ln] for ln in top_segments]

        # Rerank in one go (batched), then take top-k average as "evidence strength"
        if pairs:
            logits = reranker.compute_score(pairs, normalize=False, batch_size=rerank_batch)
            scores01 = [1.0 / (1.0 + math.exp(-x)) for x in logits]
            # use the best ~K (sqrt) to be a bit more stable on long CVs
            k = max(1, int(max(5, math.sqrt(len(scores01)))))
            topk = sorted(scores01, reverse=True)[:k]
            rerank_pct = 100.0 * (sum(topk) / len(topk))

    # 4) Blend
    final = 0.50 * cov_pct + 0.30 * sim_pct + 0.20 * rerank_pct
    return {
        "final_score": round(final, 2),
        "keyword_coverage_pct": round(cov_pct, 1),
        "semantic_similarity_pct": round(sim_pct, 1),
        "evidence_rerank_pct": round(rerank_pct, 1),
        "matched_keywords": matched[:50],
    }

def _pick_device(arg_device: str) -> str:
    if arg_device and arg_device.lower() != "auto":
        return arg_device
    if _HAS_TORCH and torch.cuda.is_available():
        return "cuda"
    return "cpu"

def main():
    ap = argparse.ArgumentParser(description="CV ↔ Job keyword/semantic scoring (fast).")
    ap.add_argument("--pdf", required=True, help="Path to applicant CV PDF (input is a .pdf)")
    ap.add_argument("--job", required=True,
                    help="Path to job description .txt/.pdf OR literal raw text")
    ap.add_argument("--keywords", default="",
                    help="Comma-separated keywords (e.g., 'python,fastapi,react,aws')")
    ap.add_argument("--device", default="auto", help="auto/cpu/cuda")
    ap.add_argument("--speed", default="fast", choices=list(SPEED_PRESETS.keys()),
                    help="Tune number of segments and batches")
    ap.add_argument("--quick-extract", action="store_true",
                    help="Faster PDF text extraction (less structure fidelity)")
    ap.add_argument("--no-ocr", action="store_true",
                    help="Disable OCR fallback (faster if you know PDF has text)")
    ap.add_argument("--batch", type=int, default=None,
                    help="Override embedding batch size for segments")
    ap.add_argument("--print-json", action="store_true",
                    help="Print final result as one-line JSON to stdout")  # <-- added
    args = ap.parse_args()

    if len(sys.argv) == 1:
        ap.print_help()
        sys.exit(1)

    device = _pick_device(args.device)
    preset = SPEED_PRESETS[args.speed].copy()
    if args.batch:
        preset["emb_batch"] = args.batch  # user override

    # ----- Load text from PDFs or raw text -----
    cv_text = load_text_auto(args.pdf, quick_extract=args.quick_extract, allow_ocr=not args.no_ocr)
    if len(cv_text.strip()) < 200:
        print("[warn] Very little text extracted from CV. Is this scanned without OCR?")

    job_text = load_text_auto(args.job, quick_extract=args.quick_extract, allow_ocr=False)
    if len(job_text.strip()) < 50:
        print("[warn] Job description text seems very short. Check the --job input.")

    kw_list = [k.strip() for k in args.keywords.split(",") if k.strip()]
    job_profile = job_text + ("\nRequired skills: " + ", ".join(kw_list) if kw_list else "")

    # ----- Models -----
    # Note: bge-m3 is strong; if you want even faster, consider "BAAI/bge-small-en-v1.5".
    embedder = FlagModel("BAAI/bge-m3", use_fp16=True, device=device)
    reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=True, device=device)

    # ----- Score (fast path with pre-filter) -----
    if _HAS_TORCH:
        torch.set_grad_enabled(False)
    result = score_cv_against_job_fast(
        cv_text=cv_text,
        job_text=job_profile,
        keywords=kw_list,
        embedder=embedder,
        reranker=reranker,
        max_segments=preset["max_segments"],
        topN_for_rerank=preset["topN_for_rerank"],
        emb_batch=preset["emb_batch"],
        rerank_batch=preset["rerank_batch"],
    )

    # ----- Output (JSON or pretty text) -----
    if args.print_json:  # <-- added
        out = {"file": args.pdf}
        out.update(result)
        print(json.dumps(out, ensure_ascii=False))
    else:
        print("\n=== CV ↔ JOB SCORE ===")
        for k, v in result.items():
            print(f"{k}: {v}")

if __name__ == "__main__":
    main()
