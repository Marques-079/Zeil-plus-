// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);
export const runtime = "nodejs";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  try {
    // 1) read file from form-data
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const name = file.name || "upload";
    const ext = path.extname(name).toLowerCase();
    const typeOk = ALLOWED_MIME.has(file.type) || ALLOWED_EXT.has(ext);
    if (!typeOk) {
      return NextResponse.json({ error: "Only PDF/DOC/DOCX allowed." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (>${MAX_BYTES / (1024 * 1024)}MB).` }, { status: 413 });
    }

    // 2) save to ./pdf_collection
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploadDir = path.join(process.cwd(), "pdf_collection");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeBase = path.basename(name, ext).replace(/[^\w.-]+/g, "_");
    const unique = `${safeBase}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
    const savedPath = path.join(uploadDir, unique);
    await fs.writeFile(savedPath, bytes);

    // 3) run Python scorer (blocking in this request for simplicity)
    //    Configure your Python binary + keywords via env if you want.
    const PY = process.env.PYTHON_BIN || "python3";
    const scorerPath = path.join(process.cwd(), "scorer", "cv_ranker_fast.py");
    const jobPath = path.join(process.cwd(), "scorer", "job.txt");
    const keywords = process.env.SCORER_KEYWORDS || "POS,sales,EFTPOS,brand";

    // Use fast path; disable OCR for speed; quick extract
    const args = [
      scorerPath,
      "--pdf", savedPath,
      "--job", jobPath,
      "--keywords", keywords,
      "--speed", "fast",
      "--no-ocr",
      "--quick-extract",
      "--print-json",            // << we’ll parse this
    ];

    let score = null;
    let resultObj: any = null;
    try {
      const { stdout } = await execFileP(PY, args, {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 32, // 32MB just in case
      });
      // stdout should be exactly one JSON line
      resultObj = JSON.parse(stdout.trim().split("\n").pop() || "{}");
      score = resultObj?.final_score ?? null;
    } catch (err: any) {
      // Optional fallback: keep the upload but return a warning
      console.error("[scorer] failed:", err?.stderr || err?.message || err);
    }

    // 4) append to a JSON-lines txt file for later use
    //    Easy to extend with more keys later.
    const logLine = JSON.stringify({
      file: unique,
      path: savedPath,
      score,
      meta: resultObj,          // keep full scorer output for debug/analytics
      ts: new Date().toISOString(),
    }) + "\n";
    const scoresPath = path.join(uploadDir, "scores.txt");
    await fs.appendFile(scoresPath, logLine, "utf8");

    return NextResponse.json({
      ok: true,
      filename: unique,
      score,
      saved_to: savedPath,
      logged_to: scoresPath,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed." }, { status: 500 });
  }
}
