// src/app/api/english-scores/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // no static cache
export const revalidate = 0;

type EngRow = { name: string; score: number; date?: string };

// Configure where your FastAPI runs (fallback to localhost)
const ENGLISH_SCORES_URL =
  process.env.ENGLISH_SCORES_URL || "http://127.0.0.1:9000/english-scores";

function summarizeEnglish(items: EngRow[]) {
  const clean = (items || [])
    .filter(Boolean)
    .map((r) => ({
      name: r.name ?? "",
      score: Number(r.score ?? 0),
      date: r.date ?? new Date().toISOString(),
    }));

  const total = clean.length;
  const avg =
    total === 0
      ? 0
      : Math.round(
          (clean.reduce((a, b) => a + (Number.isFinite(b.score) ? b.score : 0), 0) /
            total) *
            10
        ) / 10;

  const top5 = [...clean]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5)
    .map((r) => ({ name: r.name, score: r.score }));

  return {
    totalEnglish: total,
    averageEnglish: avg,
    items: clean,
    top5English: top5,
  };
}

export async function GET() {
  try {
    const resp = await fetch(ENGLISH_SCORES_URL, {
      // ensure no caching between polls
      cache: "no-store",
      // If your FastAPI is HTTPS with a self-signed cert, you may need to proxy instead.
    });
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Upstream error ${resp.status}: ${text}` },
        { status: 502 },
      );
    }
    const rows = (await resp.json()) as EngRow[];
    const data = summarizeEnglish(rows);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to fetch English scores: ${err?.message || String(err)}` },
      { status: 500 },
    );
  }
}
