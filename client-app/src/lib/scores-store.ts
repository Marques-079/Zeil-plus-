// Simple in-memory store. Survives per server process (not across deploys).
export type ScoreRow = {
  file: string;           // unique filename you created
  path: string;
  score: number | null;
  ts: string;             // ISO time
  meta?: any;             // full scorer payload
};

const store = new Map<string, ScoreRow>();

export function upsertScore(row: ScoreRow) {
  store.set(row.file, row);
}

export function getScores(): ScoreRow[] {
  return Array.from(store.values());
}
