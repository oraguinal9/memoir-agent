import { NextRequest, NextResponse } from "next/server";
import { getBook, saveBook } from "@/lib/store";
import { buildBook, bookToMarkdown } from "@/lib/writer";

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
    const { force } = await req.json().catch(() => ({}));
    const book = await buildBook();
    saveBook(book);
    return NextResponse.json({ ok: true, book, force: !!force });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
