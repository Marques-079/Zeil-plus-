// app/api/scores/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type Scoring = {
  score?: number; overall?: number; final?: number; total?: number;
  [k: string]: unknown;
} | null;

type Submission = {
  id: string;
  submittedAt: string;
  fileName?: string | null;
  fileType?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  isNZCitizen?: boolean;
  hasCriminalHistory?: boolean;
  whyJoin?: string;
  messageToHM?: string;
  scoring?: Scoring;
};

// New pipeline in-memory store (populated by POST /api/submissions)
const subStore: Submission[] = (globalThis as any)._SUBMISSIONS =
  (globalThis as any)._SUBMISSIONS || [];

// --- Helpers ---
function extractScoreLike(obj: any): number {
  const candidates = [obj?.score, obj?.overall, obj?.final, obj?.total];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeFromSubmission(s: Submission) {
  const score = extractScoreLike(s.scoring ?? {});
  return {
    id: s.id,
    name: s.name || s.email || s.fileName || "Unknown",
    score,
    date: s.submittedAt || new Date().toISOString(),
    fileName: s.fileName || null,
    fileType: s.fileType || null,
    email: s.email || "",
    phone: s.phone || "",
    isNZCitizen: !!s.isNZCitizen,
    hasCriminalHistory: !!s.hasCriminalHistory,
    whyJoin: s.whyJoin || "",
    messageToHM: s.messageToHM || "",
    scoring: s.scoring ?? null,
    _source: "packaged",
  };
}

// Try to import your legacy reader if it exists
async function tryReadLegacyViaLib(): Promise<any[] | null> {
  try {
    // resolves "@/lib/scores"
    // Must exist and export readScores()
    const mod: any = await import("@/lib/scores");
    if (typeof mod.readScores === "function") {
      const rows = await mod.readScores();
      return Array.isArray(rows) ? rows : null;
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback: parse pdf_collection/scores.txt (NDJSON: one JSON per line)
async function tryReadLegacyFromFile(): Promise<any[] | null> {
  try {
    const root = process.cwd();
    const filePath = path.join(root, "pdf_collection", "scores.txt");
    const txt = await fs.readFile(filePath, "utf8");
    const rows: any[] = [];
    for (const line of txt.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      try {
        rows.push(JSON.parse(s));
      } catch {
        // ignore bad lines
      }
    }
    return rows;
  } catch {
    return null;
  }
}

function normalizeFromLegacy(row: any, idx: number) {
  // Accept common field names; be forgiving.
  const name =
    row?.name ??
    row?.candidate ??
    row?.file ??
    row?.fileName ??
    "Unknown";

  // Prefer explicit ISO date, else now.
  const dateRaw = row?.date ?? row?.submittedAt ?? new Date().toISOString();
  const dateIso = new Date(dateRaw).toString() === "Invalid Date"
    ? new Date().toISOString()
    : new Date(dateRaw).toISOString();

  const score = extractScoreLike(row);

  const id =
    row?.id ||
    row?.uuid ||
    `${name}-${score}-${dateIso}-${idx}`;

  return {
    id,
    name: String(name),
    score,
    date: dateIso,
    fileName: row?.fileName ?? row?.file ?? null,
    fileType: row?.fileType ?? null,
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    isNZCitizen: !!row?.isNZCitizen,
    hasCriminalHistory: !!row?.hasCriminalHistory,
    whyJoin: row?.whyJoin ?? "",
    messageToHM: row?.messageToHM ?? "",
    scoring: row || null,
    _source: "legacy",
  };
}

function dedupePreferPackaged(rows: any[]) {
  // key by (email || name || fileName) + rounded date minute
  const keyOf = (r: any) => {
    const who = (r.email || r.name || r.fileName || "unknown").toLowerCase();
    const t = new Date(r.date).getTime();
    const minute = Math.floor(t / 60000);
    return `${who}#${minute}`;
  };
  const map = new Map<string, any>();
  for (const r of rows) {
    const k = keyOf(r);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, r);
    } else {
      // packaged wins over legacy
      if (existing._source === "legacy" && r._source === "packaged") {
        map.set(k, r);
      }
    }
  }
  return Array.from(map.values());
}

export async function GET() {
  // 1) New packaged submissions (with full form fields)
  const packaged = subStore.map(normalizeFromSubmission);

  // 2) Legacy: first try @/lib/scores, fallback to scores.txt
  let legacyRows = await tryReadLegacyViaLib();
  if (!legacyRows) legacyRows = await tryReadLegacyFromFile();
  const legacy = (legacyRows || []).map(normalizeFromLegacy);

  // 3) Merge & de-dupe (packaged overrides legacy on collision)
  const merged = dedupePreferPackaged([...packaged, ...legacy]).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // 4) Metrics
  const scores = merged.map((n) => Number(n.score) || 0).filter(Number.isFinite);
  const averageScore =
    scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;

  const top5 = [...merged]
    .map((n) => ({ name: n.name, score: Number(n.score) || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // 5) Response shape that your dashboard already expects
  return NextResponse.json({
    totalCVs: merged.length,
    averageScore,
    top5,
    items: merged,
  });
}
