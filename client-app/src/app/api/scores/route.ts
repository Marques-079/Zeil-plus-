// src/app/api/scores/route.ts
import { NextResponse } from "next/server";
import { readScores, summarize } from "@/lib/scores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // no static cache
export const revalidate = 0;

export async function GET() {
  const rows = await readScores();
  const data = summarize(rows);
  return NextResponse.json(data);
}
