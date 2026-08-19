import { NextRequest, NextResponse } from "next/server";
import { getInterview, getMemoryStore, saveInterview, uid } from "@/lib/store";
import { openingLine, streamInterviewReply } from "@/lib/interview";
import { InterviewSession } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/interview?id=xxx — 获取会话历史 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const session = getInterview(id);
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  return NextResponse.json(session);
}

/** POST /api/interview — 发送一条消息，流式返回采访者回复 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, subjectName, period, message } = body;

  let session: InterviewSession | null = id ? getInterview(id) : null;
  const subject = subjectName || getMemoryStore().subjectName;
  const per = period || "童年";

  if (!session) {
    session = {
      id: uid("int"),
      subjectName: subject,
      period: per,
      messages: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };
    // 开场白
    session.messages.push({
      role: "assistant",
      content: openingLine(subject, per),
      at: new Date().toISOString(),
    });
  }

  if (message && message.trim()) {
    session.messages.push({ role: "user", content: String(message).trim(), at: new Date().toISOString() });
  }
  session.updatedAt = new Date().toISOString();
  saveInterview(session);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of streamInterviewReply(session as InterviewSession)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        const err = (e as Error).message;
        const note = err === "mock_mode" ? "" : `\n\n[出错了：${err}]`;
        controller.enqueue(encoder.encode(note));
      }
      if (full) {
        session!.messages.push({ role: "assistant", content: full, at: new Date().toISOString() });
        session!.updatedAt = new Date().toISOString();
        saveInterview(session!);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Session-Id": session.id,
    },
  });
}
