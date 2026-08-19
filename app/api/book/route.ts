import { NextRequest, NextResponse } from "next/server";
import { getBook, saveBook } from "@/lib/store";
import { buildBook, bookToMarkdown } from "@/lib/writer";
import { getCookieMaxAge, getCookieName, llmGuard } from "@/lib/quota";

export const runtime = "nodejs";

/** GET /api/book — 获取书稿；?export=1 导出整本 Markdown */
export async function GET(req: NextRequest) {
  const book = getBook();
  if (!book) return NextResponse.json({ empty: true });
  const wantExport = req.nextUrl.searchParams.get("export") === "1";
  if (wantExport) {
    return new NextResponse(bookToMarkdown(book), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
  return NextResponse.json(book);
}

/** POST /api/book/generate — 依据记忆库生成/更新书稿 */
export async function POST(req: NextRequest) {
  try {
    // LLM 配额守卫（mock 免费；真实调用每日限次）
    const guard = llmGuard(req);
    if (guard.response) return guard.response;

    const { force } = await req.json().catch(() => ({}));
    const book = await buildBook();
    saveBook(book);
    const resp = NextResponse.json({ ok: true, book, force: !!force });
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
