#!/usr/bin/env python3
import argparse, os, re, math, subprocess, tempfile, statistics
from typing import List, Tuple
import numpy as np

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
# PDF → structured text (with OCR fallback)
# ---------------------------
def ocr_if_needed(pdf_path: str) -> str:
    """If the PDF has little/no extractable text, try OCRmyPDF to add a text layer and return new path."""
    try:
        txt = extract_text_structured(pdf_path)
        if len(txt.strip()) > 400:  # heuristic: already has text
            return pdf_path
    except Exception:
        pass
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
    """
    Remove lines likely to be headers/footers by finding lines repeated across pages.
    """
    counts = {}
    for t in pages_text:
        for ln in [x.strip() for x in t.splitlines() if x.strip()]:
            counts[ln] = counts.get(ln, 0) + 1
    # lines that appear on >= 60% of pages → header/footer
    thresh = max(2, int(0.6 * len(pages_text)))
    repeated = {ln for ln, c in counts.items() if c >= thresh and len(ln) <= 80}
    cleaned = []
    for t in pages_text:
        keep = [ln for ln in t.splitlines() if ln.strip() and ln.strip() not in repeated]
        cleaned.append("\n".join(keep))
    return cleaned

def extract_text_structured(pdf_path: str) -> str:
    """
    Layout-aware PDF extraction with simple heading/bullet preservation.
    Uses PyMuPDF 'dict' to access spans and sizes; joins blocks in reading order.
    """
    doc = fitz.open(pdf_path)
    page_texts = []
    for page in doc:
        pd = page.get_text("dict")
        lines_out = []
        sizes = []
        # Collect spans to estimate median font size (for heading heuristic)
        for b in pd.get("blocks", []):
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    if s.get("size"): sizes.append(s["size"])

        med_size = statistics.median(sizes) if sizes else 0
        for b in pd.get("blocks", []):
            block_lines = []
            for l in b.get("lines", []):
                span_text = []
                for s in l.get("spans", []):
                    txt = (s.get("text") or "").strip()
                    if not txt: 
                        continue
                    # Preserve bullets/•/–/hyphens at line starts
                    span_text.append(txt)
                if span_text:
                    block_lines.append(" ".join(span_text))
            if not block_lines:
                continue

            # Heading heuristic: if majority of spans in this block are > 1.2× median size
            block_sizes = []
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    if s.get("size"): block_sizes.append(s["size"])
            is_heading = False
            if block_sizes and med_size:
                big = sum(1 for sz in block_sizes if sz > 1.2 * med_size)
                is_heading = big >= max(1, int(0.6 * len(block_sizes)))

            text_block = "\n".join(block_lines)
            if is_heading:
                # Mark heading with blank lines around to keep structure
                lines_out.append("")
                lines_out.append(text_block.upper())
                lines_out.append("")
            else:
                lines_out.append(text_block)

        page_texts.append("\n".join(lines_out))

    doc.close()
    # Remove repeated headers/footers
    page_texts = _remove_headers_footers(page_texts)
    # Join with page breaks preserved
    return "\n\n".join(page_texts)

def load_text_auto(path_or_text: str) -> str:
    """
    If it's an existing file path:
      - .pdf → structured PDF extraction (with OCR fallback if needed)
      - other → read as text
    Else: treat as literal text.
    """
    if os.path.exists(path_or_text):
        if path_or_text.lower().endswith(".pdf"):
            use_path = ocr_if_needed(path_or_text)
            txt = extract_text_structured(use_path)
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
        # exact phrase
        if re.search(rf"\b{re.escape(kw_norm)}\b", cv_norm):
            found.append(kw); continue
        # fuzzy fallback
        if fuzz.partial_ratio(kw_norm, cv_norm) >= 90:
            found.append(kw)
    return (len(found) / len(keywords)), found

# ---------------------------
# Embeddings + similarity
# ---------------------------
def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-9)
    b = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b))

# ---------------------------
# Main scoring
# ---------------------------
def score_cv_against_job(cv_text: str, job_text: str, keywords: List[str],
                         embedder: FlagModel, reranker: FlagReranker,
                         topk_evidence: int = 5) -> dict:
    # 1) keyword coverage
    cov, matched = keyword_coverage(cv_text, keywords)
    cov_pct = 100.0 * cov

    # 2) embedding similarity
    embs = embedder.encode([job_text, cv_text])
    sim = cosine_sim(embs[0], embs[1])
    sim_pct = 100.0 * ((sim + 1.0) / 2.0)

    # 3) reranker evidence
    # Prefer bullet/line units, then sentences
    candidates = re.split(r"(?:\n+|[•\-–]\s+)", cv_text)
    segs = []
    for c in candidates:
        c = c.strip()
        segs.extend([x.strip() for x in re.split(r"[.\n]", c) if x.strip()])
    lines = [ln for ln in segs if 20 <= len(ln) <= 220]
    pairs = [[job_text, ln] for ln in lines[:600]]  # cap for speed

    if pairs:
        logits = reranker.compute_score(pairs, normalize=False)
        scores01 = [1.0 / (1.0 + math.exp(-x)) for x in logits]
        topk = sorted(scores01, reverse=True)[:max(1, topk_evidence)]
        rerank_pct = 100.0 * (sum(topk) / len(topk))
    else:
        rerank_pct = 0.0

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
    ap = argparse.ArgumentParser(description="CV ↔ Job keyword/semantic scoring (PDF-friendly).")
    ap.add_argument("--pdf", required=True, help="Path to applicant CV PDF (input is a .pdf)")
    ap.add_argument("--job", required=True,
                    help="Path to job description .txt OR .pdf OR raw text")
    ap.add_argument("--keywords", default="",
                    help="Comma-separated keywords (e.g., 'python,fastapi,react,aws')")
    ap.add_argument("--device", default="auto", help="auto/cpu/cuda")
    args = ap.parse_args()

    device = _pick_device(args.device)

    # ----- Load text from PDFs or raw text -----
    cv_pdf_path = ocr_if_needed(args.pdf)
    cv_text = extract_text_structured(cv_pdf_path)
    if len(cv_text.strip()) < 200:
        print("[warn] Very little text extracted from CV. Is this scanned without OCR?")

    job_text = load_text_auto(args.job)
    if len(job_text.strip()) < 50:
        print("[warn] Job description text seems very short. Check the --job input.")

    kw_list = [k.strip() for k in args.keywords.split(",") if k.strip()]
    job_profile = job_text + ("\nRequired skills: " + ", ".join(kw_list) if kw_list else "")

    # ----- Models -----
    embedder = FlagModel("BAAI/bge-m3", use_fp16=True, device=device)
    reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=True, device=device)

    # ----- Score -----
    result = score_cv_against_job(cv_text, job_profile, kw_list, embedder, reranker)

    print("\n=== CV ↔ JOB SCORE ===")
    for k, v in result.items():
        print(f"{k}: {v}")

if __name__ == "__main__":
    main()
