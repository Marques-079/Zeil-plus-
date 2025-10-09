#!/usr/bin/env python3
import argparse, os, re, math, subprocess, tempfile, statistics, time, sys
from typing import List, Tuple
import numpy as np

# -------- tiny logger --------
def log(*a): print("[cv_ranker]", *a, flush=True)

# PDF
import fitz  # PyMuPDF

# NLP
from FlagEmbedding import FlagModel, FlagReranker
from rapidfuzz import fuzz

# Optional device auto-detect
try:
    import torch
    _HAS_TORCH = True
except Exception:
    _HAS_TORCH = False

# =========================
#        PDF extract
# =========================
def extract_text_fast(pdf_path: str) -> str:
    """Fast plain text extraction (no layout heuristics)."""
    doc = fitz.open(pdf_path)
    chunks = []
    for p in doc:
        chunks.append(p.get_text("text"))
    doc.close()
    return "\n".join(chunks)

def _remove_headers_footers(pages_text: List[str]) -> List[str]:
    counts = {}
    for t in pages_text:
        for ln in [x.strip() for x in t.splitlines() if x.strip()]:
            counts[ln] = counts.get(ln, 0) + 1
    thresh = max(2, int(0.6 * len(pages_text)))
    repeated = {ln for ln, c in counts.items() if c >= thresh and len(ln) <= 80}
    cleaned = []
    for t in pages_text:
        keep = [ln for ln in t.splitlines() if ln.strip() and ln.strip() not in repeated]
        cleaned.append("\n".join(keep))
    return cleaned

def extract_text_structured(pdf_path: str) -> str:
    """Layout-aware (slower, higher quality) extraction."""
    doc = fitz.open(pdf_path)
    page_texts = []
    for page in doc:
        pd = page.get_text("dict")
        lines_out, sizes = [], []
        for b in pd.get("blocks", []):
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    if s.get("size"): sizes.append(s["size"])
        med = statistics.median(sizes) if sizes else 0
        for b in pd.get("blocks", []):
            block_lines, block_sizes = [], []
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    txt = (s.get("text") or "").strip()
                    if txt: 
                        block_lines.append(txt)
                        if s.get("size"): block_sizes.append(s["size"])
            if not block_lines: 
                continue
            is_heading = False
            if block_sizes and med:
                big = sum(1 for sz in block_sizes if sz > 1.2 * med)
                is_heading = big >= max(1, int(0.6 * len(block_sizes)))
            text_block = "\n".join(block_lines)
            lines_out += (["", text_block.upper(), ""] if is_heading else [text_block])
        page_texts.append("\n".join(lines_out))
    doc.close()
    page_texts = _remove_headers_footers(page_texts)
    return "\n\n".join(page_texts)

def ocr_if_needed(pdf_path: str, extractor) -> str:
    """Run extractor; if text tiny, try OCRmyPDF and return new path, else original."""
    try:
        txt = extractor(pdf_path)
        if len(txt.strip()) > 400:
            return pdf_path
    except Exception:
        pass
    out_pdf = os.path.join(tempfile.gettempdir(), f"ocr_{os.path.basename(pdf_path)}")
    try:
        log("Running OCRmyPDF …")
        subprocess.run(
            ["ocrmypdf", "--skip-text", "--fast-web-view", "1", pdf_path, out_pdf],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return out_pdf
    except Exception:
        log("OCR not available or failed; using original PDF")
        return pdf_path

def load_text_auto(path_or_text: str, extractor) -> str:
    if os.path.exists(path_or_text):
        if path_or_text.lower().endswith(".pdf"):
            use = ocr_if_needed(path_or_text, extractor)
            return extractor(use)
        with open(path_or_text, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    return path_or_text

# =========================
#   scoring utilities
# =========================
def normalize_text(s: str) -> str:
    s = s.replace("\u00A0", " ")
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
            found.append(kw); continue
        if fuzz.partial_ratio(kw_norm, cv_norm) >= 90:
            found.append(kw)
    return (len(found) / len(keywords)), found

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-9)
    b = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b))

def _pick_device(arg_device: str) -> str:
    if arg_device and arg_device.lower() != "auto":
        return arg_device
    if _HAS_TORCH:
        if torch.cuda.is_available(): return "cuda"
        try:
            if torch.backends.mps.is_available(): return "mps"  # Apple Silicon
        except Exception:
            pass
    return "cpu"

# =========================
#      main scorer
# =========================
def score_cv_against_job(cv_text: str, job_text: str, keywords: List[str],
                         embedder: FlagModel, reranker: "FlagReranker|None",
                         topk_evidence: int = 5, max_pairs: int = 300) -> dict:
    # 1) Keywords
    cov, matched = keyword_coverage(cv_text, keywords)
    cov_pct = 100.0 * cov

    # 2) Embedding similarity (doc-level)
    embs = embedder.encode([job_text, cv_text])
    sim = cosine_sim(embs[0], embs[1])
    sim_pct = 100.0 * ((sim + 1.0) / 2.0)

    # 3) Evidence:
    # Build candidate lines; prefilter with vector sim vs JD to keep only top-N
    pieces = re.split(r"(?:\n+|[•\-–]\s+)", cv_text)
    segs = []
    for c in pieces:
        c = c.strip()
        segs.extend([x.strip() for x in re.split(r"[.\n]", c) if x.strip()])
    lines = [ln for ln in segs if 20 <= len(ln) <= 220]
    if not lines:
        rerank_pct = 0.0
    else:
        # vector prefilter (very fast)
        jd = embedder.encode([job_text])[0]
        line_vecs = embedder.encode(lines, batch_size=128)
        sims = np.asarray([cosine_sim(jd, v) for v in line_vecs])
        top_idx = np.argsort(-sims)[:max_pairs]
        top_lines = [lines[i] for i in top_idx]

        if reranker is None:
            # FAST PATH: use mean of top-k sims as proxy for evidence
            k = min(topk_evidence, len(top_idx))
            topk = sims[top_idx][:k]
            rerank_pct = 100.0 * float(np.clip((topk.mean() + 1.0) / 2.0, 0.0, 1.0))
        else:
            pairs = [[job_text, ln] for ln in top_lines]
            logits = reranker.compute_score(pairs, normalize=False)
            scores01 = [1.0 / (1.0 + math.exp(-x)) for x in logits]
            k = min(topk_evidence, len(scores01))
            rerank_pct = 100.0 * (sum(sorted(scores01, reverse=True)[:k]) / k)

    # Blend (bias to keywords for hiring)
    final = 0.55 * cov_pct + 0.30 * sim_pct + 0.15 * rerank_pct
    return {
        "final_score": round(final, 2),
        "keyword_coverage_pct": round(cov_pct, 1),
        "semantic_similarity_pct": round(sim_pct, 1),
        "evidence_rerank_pct": round(rerank_pct, 1),
        "matched_keywords": matched[:50],
    }

def main():
    ap = argparse.ArgumentParser(description="Fast CV ↔ Job scoring")
    ap.add_argument("--pdf", required=True, help="CV PDF")
    ap.add_argument("--job", required=True, help="JD .txt/.pdf or raw string")
    ap.add_argument("--keywords", default="", help="Comma-separated skills")
    ap.add_argument("--device", default="auto", help="auto/cpu/cuda/mps")
    ap.add_argument("--speed", default="balanced",
                    choices=["fast", "balanced", "quality"],
                    help="Model size + extraction strategy")
    ap.add_argument("--max_pairs", type=int, default=300, help="Max segments for evidence stage")
    args = ap.parse_args()

    # Pick models + extractor by speed
    if args.speed == "fast":
        embedder_name = "BAAI/bge-small-en-v1.5"
        reranker_name = None
        extractor = extract_text_fast
    elif args.speed == "quality":
        embedder_name = "BAAI/bge-m3"
        reranker_name = "BAAI/bge-reranker-v2-m3"
        extractor = extract_text_structured
    else:  # balanced
        embedder_name = "BAAI/bge-base-en-v1.5"
        reranker_name = "BAAI/bge-reranker-base"
        extractor = extract_text_fast

    # Device + small perf env tweaks
    device = _pick_device(args.device)
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    if _HAS_TORCH and device == "cpu":
        try:
            torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
        except Exception:
            pass

    # Load texts
    cv_pdf_path = ocr_if_needed(args.pdf, extractor)
    cv_text = extractor(cv_pdf_path)
    job_text = load_text_auto(args.job, extractor)

    if len(cv_text.strip()) < 200:
        log("warn: very little text from CV (is it a scan without OCR?)")
    if len(job_text.strip()) < 50:
        log("warn: JD text looks very short")

    kw_list = [k.strip() for k in args.keywords.split(",") if k.strip()]
    job_profile = job_text + ("\nRequired skills: " + ", ".join(kw_list) if kw_list else "")

    # Models
    log(f"Device: {device} | Speed: {args.speed}")
    log(f"Embedder: {embedder_name}")
    embedder = FlagModel(embedder_name, use_fp16=(device != "cpu"), device=device)
    reranker = None
    if reranker_name:
        log(f"Reranker: {reranker_name}")
        reranker = FlagReranker(reranker_name, use_fp16=(device != "cpu"), device=device)

    # Score
    t0 = time.perf_counter()
    result = score_cv_against_job(cv_text, job_profile, kw_list, embedder, reranker,
                                  topk_evidence=5, max_pairs=args.max_pairs)
    took = time.perf_counter() - t0

    print("\n=== CV ↔ JOB SCORE ===")
    for k, v in result.items():
        print(f"{k}: {v}")
    log(f"Done in {took:.2f}s")

if __name__ == "__main__":
    main()
