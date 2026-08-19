// ===== 全局类型定义 =====

/** 记忆库中的一条事件（回忆的最小单元） */
export interface MemoryEvent {
  id: string;
  source: "chat" | "interview" | "manual";
  sourceRef?: string; // 原始引用，如 "chat_c01|line 12" / "int_01|第 3 轮"
  /** 事件发生时间（年份或日期，未知为 null） */
  time?: string;
  title: string;
  content: string;
  people: string[];
  places: string[];
  emotion?: string;
  /** 人生阶段：童年 / 求学 / 工作 / 家庭 / 晚年 / 其他 */
  period: string;
  keywords: string[];
  createdAt: string;
}

/** 记忆库整体结构 */
export interface MemoryStore {
  version: number;
  subjectName: string;
  events: MemoryEvent[];
  people: Record<string, { relation?: string; count: number }>;
  places: Record<string, { count: number }>;
  periods: string[];
  updatedAt: string;
}

/** 解析后的聊天记录 */
export interface ChatRecord {
  id: string;
  filename: string;
  importedAt: string;
  lines: ChatLine[];
}

export interface ChatLine {
  time?: string;
  sender: string;
  content: string;
}

/** 访谈会话 */
export interface InterviewSession {
  id: string;
  subjectName: string;
  period: string;
  messages: { role: "assistant" | "user"; content: string; at: string }[];
  startedAt: string;
  updatedAt: string;
  status: "active" | "done";
}

/** 书稿 */
export interface Book {
  id: string;
  title: string;
  author: string;
  chapters: BookChapter[];
  updatedAt: string;
}

export interface BookChapter {
  id: string;
  period: string;
  title: string;
  content: string;
  status: "draft" | "done";
}

/** LLM 消息 */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 全局固定人生阶段 */
export const PERIODS = ["童年", "求学", "工作", "家庭", "晚年"] as const;
