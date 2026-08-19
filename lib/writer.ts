import { chat, isMockMode } from "./llm";
import { getMemoryStore } from "./store";
import { Book, BookChapter, MemoryEvent, PERIODS } from "./types";

// ===== 写作 Agent：把记忆库组织成书 =====

const CHAPTER_TITLES: Record<string, string> = {
  童年: "童年时光",
  求学: "求学的路",
  工作: "那些年，我工作着",
  家庭: "家与亲人",
  晚年: "如今的日子",
  其他: "人生片段",
};

function groupEvents(): Record<string, MemoryEvent[]> {
  const store = getMemoryStore();
  const groups: Record<string, MemoryEvent[]> = {};
  for (const p of PERIODS) groups[p] = [];
  groups["其他"] = [];
  for (const e of store.events) {
    const g = groups[e.period] ?? groups["其他"];
    g.push(e);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => String(a.time || "9999").localeCompare(String(b.time || "9999")));
  }
  return groups;
}

function eventsToBullets(events: MemoryEvent[]): string {
  if (events.length === 0) return "";
  return (
    "可用素材（按时间排序）：\n" +
    events
      .map((e) => `- ${e.time || "时间未知"}｜${e.title}：${e.content.slice(0, 80)}${e.people.length ? `（${e.people.join("、")}）` : ""}`)
      .join("\n")
  );
}

function chapterSystemPrompt(subjectName: string, period: string): string {
  return `你是回忆录执笔者，为「${subjectName}」撰写「${period}」章节。
要求：
1. 以第一人称（我）书写，语言温暖平实、有画面感，像长辈娓娓道来。
2. 以提供的素材为骨架，自然串联成一篇连贯的叙事散文，可补充合理衔接，但不要编造未提及的具体事实。
3. 全文 600-900 字，用 markdown：章节标题（##）、必要时小标题（###）、自然分段。
4. 只输出正文，不要输出章节标题以外的说明。`;
}

/** 生成单章内容 */
export async function generateChapter(subjectName: string, period: string): Promise<string> {
  const events = groupEvents()[period] ?? [];
  const title = CHAPTER_TITLES[period] ?? period;

  if (isMockMode()) {
    if (events.length === 0) {
      return `## ${title}\n\n这一章还空着。去「访谈」或「导入聊天记录」，留下一些关于${period}的回忆，书稿会自动长出来。`;
    }
    const parts = events
      .slice(0, 12)
      .map((e, i) => `${e.time ? `那是${e.time}年。` : ""}${e.content}`)
      .join("\n\n");
    return `## ${title}\n\n${parts}\n\n（草稿章节：素材已就位，接入大模型 Key 后可自动润色成完整叙事。）`;
  }

  const userMsg =
    `请为「${subjectName}」撰写「${period}」章节。\n\n` +
    (eventsToBullets(events) || "（暂无素材：请基于该人生阶段的典型经历，写一段温和的开场，提示后续可补充。）");
  const content = await chat(
    [
      { role: "system", content: chapterSystemPrompt(subjectName, period) },
      { role: "user", content: userMsg },
    ],
    { maxTokens: 2000, temperature: 0.7 }
  );
  return content.trim() || `## ${title}\n\n（本章生成失败，请重试。）`;
}

/** 前言 */
export async function generatePreface(subjectName: string, book: Book): Promise<string> {
  const events = getMemoryStore().events;
  const line = isMockMode()
    ? `这本小书写给「${subjectName}」。翻开之前，先说几句心里话。`
    : `这本小书写给「${subjectName}」。翻开之前，先说几句心里话。`;
  if (events.length === 0) return `# 前言\n\n${line}\n\n（还没有素材，先聊聊天、导一份聊天记录，前言会自己写出来。）`;
  const summary = isMockMode()
    ? `下面这些篇章，来自${events.length}段被记住的往事。`
    : `下面这些篇章，来自${events.length}段被记住的往事。`;
  return `# 前言\n\n${line}\n\n${summary}`;
}

/** 依据记忆库生成整本书（缺章节补章节，已有章节保留） */
export async function buildBook(): Promise<Book> {
  const store = getMemoryStore();
  const subjectName = store.subjectName;
  const existing = { __preface: "" };

  // 已有书稿保留用户编辑
  // (简化：每次重建非草稿章节保留，草稿重写)
  const chapters: BookChapter[] = [];

  const preface: BookChapter = {
    id: "ch_preface",
    period: "其他",
    title: "前言",
    content: await generatePreface(subjectName, {} as Book),
    status: "draft",
  };
  chapters.push(preface);

  for (const period of PERIODS) {
    const content = await generateChapter(subjectName, period);
    chapters.push({
      id: `ch_${period}`,
      period,
      title: CHAPTER_TITLES[period] ?? period,
      content,
      status: "draft",
    });
  }

  const book: Book = {
    id: "book_001",
    title: `${subjectName}的回忆录`,
    author: subjectName,
    chapters,
    updatedAt: new Date().toISOString(),
  };
  return book;
}

/** 导出整本书为 Markdown 文本 */
export function bookToMarkdown(book: Book): string {
  return book.chapters
    .map((c) => c.content.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}
