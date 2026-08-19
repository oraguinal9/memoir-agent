import { NextResponse } from "next/server";
import { getMemoryStore } from "@/lib/store";

export const runtime = "nodejs";

/** GET /api/events — 记忆库（事件列表 + 索引） */
export async function GET() {
  const store = getMemoryStore();
  return NextResponse.json(store);
}
