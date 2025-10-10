// src/lib/scores.ts
import fs from "fs/promises";
import path from "path";

export type ScoreRow = {
  file: string;
  meta: { final_score: number };
  // add more fields if you have them (id, timestamp, etc.)
};

const SCORES_TXT = path.join(process.cwd(), "pdf_collection", "scores.txt");

export async function readScores(): Promise<ScoreRow[]> {
  try {
    const raw = await fs.readFile(SCORES_TXT, "utf8");
    return raw
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ScoreRow);
  } catch (e: any) {
    if (e.code === "ENOENT") return []; // file not created yet
    throw e;
  }
}

export function summarize(rows: ScoreRow[]) {
  const totalCVs = rows.length;
  const avg =
    totalCVs === 0
      ? 0
      : Math.round(
          (rows.reduce((s, r) => s + Number(r.meta?.final_score ?? 0), 0) /
            totalCVs) * 10
        ) / 10;

  const items = rows
    .map((r) => ({
      name: path.basename(r.file),
      score: Number(r.meta?.final_score ?? 0),
      date: new Date(), // if you store a timestamp in each row, use that instead
    }))
    .sort((a, b) => b.score - a.score);

  const top5 = items.slice(0, 5);

  return { totalCVs, averageScore: avg, items, top5 };
}
