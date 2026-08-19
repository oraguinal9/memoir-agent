// 轻量级每日配额（进程内；单实例 PM2 足够，进程重启归零对本演示可接受）
//
// 限制维度：匿名身份 cookie（memoir_uid），无 cookie 时生成随机身份并写回 cookie。
// 作用：限制真实 LLM（DeepSeek）调用次数，防演示被刷；Mock 模式（无 Key）免费不占配额。
// 脚本类无视 cookie 的请求由 nginx limit_req 兜底拦洪水。

import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "./llm";

// 演示配额：AI 调用 10 次/天/身份（足够完整演示 2-3 轮全流程）
export const AI_DAILY_LIMIT = 10;

const COOKIE_NAME = "memoir_uid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

interface DayCount {
  date: string; // 服务器时区 YYYY-MM-DD
  ai: number;
}

// 用 globalThis 持久化，避免 Next 各 route 独立打包导致模块级 Map 不共享
const store: Map<string, DayCount> =
  ((globalThis as unknown as { __memoirQuota?: Map<string, DayCount> }).__memoirQuota) ||
  (((globalThis as unknown as { __memoirQuota?: Map<string, DayCount> }).__memoirQuota =
    new Map<string, DayCount>()));

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 清理非今天的旧记录，避免内存无限增长
function sweep(): void {
  const t = today();
  for (const [k, v] of store) {
    if (v.date !== t) store.delete(k);
  }
}

/** 解析请求身份：优先 cookie，否则生成随机身份（调用方负责写回 cookie） */
export function getIdentity(req: NextRequest): { uid: string; fromCookie: boolean } {
  const cookieHeader = req.headers.get("cookie") || "";
  const m = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (m && m[1]) return { uid: m[1], fromCookie: true };
  return { uid: genUid(), fromCookie: false };
}

export function genUid(): string {
  return "m" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function getCookieMaxAge(): number {
  return COOKIE_MAX_AGE;
}

function ensureToday(uid: string): DayCount {
  const t = today();
  let c = store.get(uid);
  if (!c || c.date !== t) {
    c = { date: t, ai: 0 };
    store.set(uid, c);
  }
  return c;
}

export interface QuotaResult {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  date: string;
}

export function checkQuota(uid: string): QuotaResult {
  sweep();
  const c = ensureToday(uid);
  const used = c.ai;
  return {
    allowed: used < AI_DAILY_LIMIT,
    limit: AI_DAILY_LIMIT,
    used,
    remaining: Math.max(0, AI_DAILY_LIMIT - used),
    date: c.date,
  };
}

export function consume(uid: string): QuotaResult {
  sweep();
  const c = ensureToday(uid);
  c.ai += 1;
  return checkQuota(uid);
}

/**
 * LLM 守卫：在走真实 LLM 的 POST 路由入口调用。
 * - Mock 模式（无 Key）：免费放行，不占配额
 * - 有 Key：检查并消耗一次配额；超限返回 429 Response
 * 注意：写 cookie 必须用返回的 uid（与 consume 同一个），否则计数落在丢弃身份上。
 */
export function llmGuard(req: NextRequest): {
  response: NextResponse | null;
  uid: string;
  fromCookie: boolean;
} {
  if (isMockMode()) return { response: null, uid: "", fromCookie: true };
  const idn = getIdentity(req);
  const quota = checkQuota(idn.uid);
  if (!quota.allowed) {
    return {
      response: NextResponse.json(
        {
          error: "今日 AI 次数已用完",
          code: "QUOTA_EXCEEDED",
          remaining: 0,
          limit: quota.limit,
          date: quota.date,
          message: `今日 AI 次数已用完（${quota.limit} 次/天），明天再来吧。`,
        },
        { status: 429 },
      ),
      uid: idn.uid,
      fromCookie: idn.fromCookie,
    };
  }
  consume(idn.uid);
  return { response: null, uid: idn.uid, fromCookie: idn.fromCookie };
}
