import { NextRequest, NextResponse } from "next/server";
import { chatStats, parseChatText } from "@/lib/parser";
import { extractFromChat } from "@/lib/extract";
import { saveChatRecord } from "@/lib/store";
import { getCookieMaxAge, getCookieName, llmGuard } from "@/lib/quota";

export const runtime = "nodejs";

/** POST /api/import — 导入聊天记录文本，解析并提取事件 */
export async function POST(req: NextRequest) {
  try {
    // LLM 配额守卫（mock 免费；真实调用每日限次）
    const guard = llmGuard(req);
    if (guard.response) return guard.response;

    const body = await req.json().catch(() => ({}));
    const filename: string = body.filename || "聊天记录.txt";
    const content: string = body.content || "";

    if (!content.trim()) {
      return NextResponse.json({ error: "内容为空" }, { status: 400 });
    }

    let record;
    try {
      record = parseChatText(filename, content);
    } catch (e) {
      return NextResponse.json(
        { error: `解析失败：${(e as Error).message}` },
        { status: 400 }
      );
    }

    if (record.lines.length === 0) {
      return NextResponse.json(
        { error: "没有解析出有效消息，请检查格式（CSV 或 JSON 数组）" },
        { status: 400 }
      );
    }

    saveChatRecord(record);
    const { events, mode } = await extractFromChat(record);

    const resp = NextResponse.json({
      recordId: record.id,
      stats: chatStats(record),
      extracted: events.length,
      mode,
      sampleEvents: events.slice(0, 10).map((e) => ({
        title: e.title,
        period: e.period,
        time: e.time,
      })),
    });
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
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
