import { ChatLine, ChatRecord } from "./types";
import { uid } from "./store";

// ===== 聊天记录解析器 =====
// 支持两种输入：
//  1) JSON 数组：[{"time":"2024-01-01 10:00","sender":"妈妈","content":"..."}, ...]
//     （兼容微信导出的 JSON / 手工整理）
//  2) CSV（WeChatMsg 等工具导出，列名自动识别：时间/发送者/内容）

const TIME_KEYS = ["time", "时间", "msgtime", "createtime", "created_at", "datetime", "日期", "timestamp"];
const SENDER_KEYS = ["sender", "发送者", "user", "nickname", "姓名", "talker", "fromuser", "creator", "发送人"];
const CONTENT_KEYS = ["content", "内容", "msg", "message", "text", "strcontent", "正文", "消息"];

/** 识别一行记录中的字段 */
function pickLine(row: Record<string, unknown>): ChatLine | null {
  const time = TIME_KEYS.map((k) => row[k]).find((v) => v !== undefined && v !== null && String(v).trim() !== "");
  const sender = SENDER_KEYS.map((k) => row[k]).find((v) => v !== undefined && v !== null && String(v).trim() !== "");
  const content = CONTENT_KEYS.map((k) => row[k]).find((v) => v !== undefined && v !== null && String(v).trim() !== "");
  if (content === undefined) return null;
  return {
    time: time ? String(time) : undefined,
    sender: sender ? String(sender) : "对方",
    content: String(content),
  };
}

/** 极简 CSV 解析（处理引号与逗号） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      if (cur.some((c) => c.trim() !== "")) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== "")) rows.push(cur);
  return rows;
}

/** 判断文本是否像 JSON 数组 */
function looksLikeJson(text: string): boolean {
  return text.trim().startsWith("[") || text.trim().startsWith("{");
}

function parseJsonInput(text: string): ChatLine[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : (data as { messages?: unknown[] }).messages ?? [];
  const lines: ChatLine[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      lines.push({ sender: "对方", content: item });
      continue;
    }
    const row = (item ?? {}) as Record<string, unknown>;
    // 兼容 chat 风格 {role, content}
    if (row.role && typeof row.content === "string") {
      const role = String(row.role);
      lines.push({
        time: row.time ? String(row.time) : undefined,
        sender: role === "assistant" ? "AI" : role === "user" ? "对方" : "群成员",
        content: row.content,
      });
      continue;
    }
    const line = pickLine(row);
    if (line) lines.push(line);
  }
  return lines;
}

function parseCsvInput(text: string): ChatLine[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const timeIdx = header.findIndex((h) => TIME_KEYS.some((k) => h.includes(k.toLowerCase())));
  const senderIdx = header.findIndex((h) => SENDER_KEYS.some((k) => h.includes(k.toLowerCase())));
  const contentIdx = header.findIndex((h) => CONTENT_KEYS.some((k) => h.includes(k.toLowerCase())));
  const knownHits = [timeIdx, senderIdx, contentIdx].filter((i) => i >= 0).length;

  // 1) 表头模式：至少识别出 2 个已知列（时间/发送者/内容）
  if (knownHits >= 2 && contentIdx >= 0) {
    const lines: ChatLine[] = [];
    for (const r of rows.slice(1)) {
      const content = r[contentIdx] ?? "";
      if (!content.trim()) continue;
      lines.push({
        time: timeIdx >= 0 ? r[timeIdx] : undefined,
        sender: senderIdx >= 0 ? r[senderIdx] : "对方",
        content,
      });
    }
    return lines;
  }

  // 2) 无表头的三列格式：时间, 发送者, 内容
  if (rows[0].length >= 3) {
    const lines: ChatLine[] = [];
    for (const r of rows) {
      lines.push({ time: r[0], sender: r[1] || "对方", content: r.slice(2).join(",") });
    }
    return lines;
  }

  // 3) 纯文本兜底：无法识别为结构化数据时，把每一行当作一条消息
  const lines: ChatLine[] = [];
  for (const r of rows) {
    const content = r.join(",").trim();
    if (!content) continue;
    lines.push({ sender: "对方", content });
  }
  return lines;
}

/** 主入口：解析文本为聊天记录 */
export function parseChatText(filename: string, text: string): ChatRecord {
  const trimmed = text.trim();
  let lines: ChatLine[];
  if (looksLikeJson(trimmed)) {
    lines = parseJsonInput(trimmed);
  } else {
    lines = parseCsvInput(trimmed);
  }

  // 清洗：去空、去系统消息、合并连续相同发送者、截断超长行
  const SYSTEM_PAT = /^[「【]?(系统消息|撤回了一条消息|以下为新消息|邀请.*加入群聊)[」】]?/;
  const cleaned: ChatLine[] = [];
  for (const l of lines) {
    const content = l.content.trim();
    if (!content || content.length > 800) continue;
    if (SYSTEM_PAT.test(content)) continue;
    const last = cleaned[cleaned.length - 1];
    if (last && last.sender === l.sender && !l.time && last.time === l.time) {
      last.content += "\n" + content; // 合并相邻
    } else {
      cleaned.push({ time: l.time, sender: l.sender, content });
    }
  }

  return {
    id: uid("chat"),
    filename,
    importedAt: new Date().toISOString(),
    lines: cleaned,
  };
}

/** 简单统计 */
export function chatStats(rec: ChatRecord) {
  const senders: Record<string, number> = {};
  let totalChars = 0;
  for (const l of rec.lines) {
    senders[l.sender] = (senders[l.sender] || 0) + 1;
    totalChars += l.content.length;
  }
  return {
    total: rec.lines.length,
    senders,
    totalChars,
  };
}
