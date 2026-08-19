import { NextRequest, NextResponse } from "next/server";
import { getInterview, saveInterview } from "@/lib/store";
import { extractFromInterview } from "@/lib/extract";

export const runtime = "nodejs";

/** POST /api/interview/complete — 结束访谈，将本次对话提取为事件入库 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id } = body;
  const session = id ? getInterview(id) : null;
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

  session.status = "done";
  session.updatedAt = new Date().toISOString();
  saveInterview(session);

  const { events, mode } = await extractFromInterview(session);
  return NextResponse.json({ extracted: events.length, mode, events: events.map((e) => e.title) });
}
