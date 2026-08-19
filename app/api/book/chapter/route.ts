import { NextRequest, NextResponse } from "next/server";
import { getBook, saveBook } from "@/lib/store";

export const runtime = "nodejs";

/** POST /api/book/chapter — 保存单个章节（用户编辑） */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { chapterId, content, title } = body;
  const book = getBook();
  if (!book) return NextResponse.json({ error: "书稿不存在，请先生成" }, { status: 404 });

  const ch = book.chapters.find((c) => c.id === chapterId);
  if (!ch) return NextResponse.json({ error: "章节不存在" }, { status: 404 });

  if (typeof content === "string") ch.content = content;
  if (typeof title === "string") ch.title = title;
  ch.status = "done";
  saveBook(book);
  return NextResponse.json({ ok: true, chapter: ch });
}
