// app/api/submissions/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type Scoring = {
  score?: number; overall?: number; final?: number; total?: number;
  [k: string]: unknown;
} | null;

export type Submission = {
  id: string;
  submittedAt: string;          // ISO
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

// One shared in-memory store for this server process (dev-friendly).
const store: Submission[] = (globalThis as any)._SUBMISSIONS =
  (globalThis as any)._SUBMISSIONS || [];

export async function GET() {
  return NextResponse.json({ success: true, data: [...store].reverse() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Submission>;
    if (!body?.id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    const sub: Submission = {
      id: body.id!,
      submittedAt: body.submittedAt || new Date().toISOString(),
      fileName: body.fileName ?? null,
      fileType: body.fileType ?? null,
      name: body.name || "",
      email: body.email || "",
      phone: body.phone || "",
      isNZCitizen: !!body.isNZCitizen,
      hasCriminalHistory: !!body.hasCriminalHistory,
      whyJoin: body.whyJoin || "",
      messageToHM: body.messageToHM || "",
      scoring: (body.scoring as Scoring) ?? null,
    };

    store.push(sub);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
