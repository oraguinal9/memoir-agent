import { NextRequest, NextResponse } from "next/server";
import { getInterview, saveInterview } from "@/lib/store";
import { extractFromInterview } from "@/lib/extract";
import { getCookieMaxAge, getCookieName, llmGuard } from "@/lib/quota";

export const runtime = "nodejs";

/** POST /api/interview/complete — 结束访谈，将本次对话提取为事件入库 */
export async function POST(req: NextRequest) {
  // LLM 配额守卫（mock 免费；真实调用每日限次）
  const guard = llmGuard(req);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => ({}));
  const { id } = body;
  const session = id ? getInterview(id) : null;
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

  session.status = "done";
  session.updatedAt = new Date().toISOString();
  saveInterview(session);

  const { events, mode } = await extractFromInterview(session);
  const resp = NextResponse.json({ extracted: events.length, mode, events: events.map((e) => e.title) });
  // 关键：写回与本次 consume 相同的 uid
  if (guard.uid && !guard.fromCookie) {
    resp.cookies.set(getCookieName(), guard.uid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: getCookieMaxAge(),
    });
  }
  return resp;
}
