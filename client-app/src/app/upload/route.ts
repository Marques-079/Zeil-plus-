// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

export const runtime = "nodejs"; // needed so we can use fs

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const name = file.name || "upload";
    const ext = path.extname(name).toLowerCase();

    const typeOk = ALLOWED_MIME.has(file.type) || ALLOWED_EXT.has(ext);
    if (!typeOk) {
      return NextResponse.json(
        { error: "Only PDF/DOC/DOCX files are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (>${MAX_BYTES / (1024 * 1024)}MB).` },
        { status: 413 }
      );
    }

    // Read bytes
    const bytes = Buffer.from(await file.arrayBuffer());

    // Ensure local folder exists
    const uploadDir = path.join(process.cwd(), "pdf_collection");
    await fs.mkdir(uploadDir, { recursive: true });

    // Safe, unique filename
    const baseNoExt = path.basename(name, ext).replace(/[^\w.-]+/g, "_");
    const unique = `${baseNoExt}_${Date.now()}_${crypto
      .randomUUID()
      .slice(0, 8)}${ext}`;
    const filePath = path.join(uploadDir, unique);

    await fs.writeFile(filePath, bytes);

    return NextResponse.json({ ok: true, filename: unique });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload failed." },
      { status: 500 }
    );
  }
}
