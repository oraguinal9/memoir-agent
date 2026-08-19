import { NextRequest, NextResponse } from "next/server";
import { getMemoryStore, listChatRecords, listInterviews } from "@/lib/store";
import { llmInfo } from "@/lib/llm";
import { getBook } from "@/lib/store";

export const runtime = "nodejs";

/** GET /api/status — 全局总览（首页用） */
export async function GET() {
  const store = getMemoryStore();
  const book = getBook();
  return NextResponse.json({
    llm: llmInfo(),
    subjectName: store.subjectName,
    counts: {
      events: store.events.length,
      people: Object.keys(store.people).length,
      places: Object.keys(store.places).length,
      chats: listChatRecords().length,
      interviews: listInterviews().length,
      chapters: book ? book.chapters.filter((c) => c.status === "done").length : 0,
      bookReady: !!book,
    },
    periodBreakdown: store.periods.map((p) => ({
      period: p,
      count: store.events.filter((e) => e.period === p).length,
    })),
    peopleTop: Object.entries(store.people)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, v]) => ({ name, count: v.count })),
  });
}
