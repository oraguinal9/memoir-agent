import { chatJson, isMockMode } from "./llm";
import { addEvents, getMemoryStore } from "./store";
import { ChatLine, ChatRecord, InterviewSession, MemoryEvent, PERIODS } from "./types";
import { uid } from "./store";

// ===== 整理 Agent：从原始资料中提取结构化事件 =====

const SYSTEM_PROMPT = `你是"回忆录整理员"，负责从人物的聊天记录/访谈对话中提取值得写进回忆录的人生事件。
要求：
1. 只提取真实、具体、有叙事价值的事件（重要经历、家庭故事、成长节点、情感时刻），忽略寒暄、表情、日常琐碎问答。
2. 每条事件包含：title（10字以内标题）、content（第一人称叙述，50-120字，保留细节）、time（年份或"约X年"或"未知"，如 1980 / 1985年 / 未知）、people（相关人物）、places（相关地点，没有则空数组）、emotion（情感基调，如 自豪/怀念/遗憾/温暖/平淡）、period（人生阶段，只能从这些里选：童年/求学/工作/家庭/晚年/其他）、keywords（3-5个关键词）。
3. 输出 JSON 格式：{"events": [ ... ]}，不要输出其他内容。`;

const MOCK_PERIOD_WORDS: [string, string[]][] = [
  ["童年", ["小时候", "童年", "儿时", "几岁", "村里", "上小学前", "记得那时"]],
  ["求学", ["上学", "读书", "学校", "老师", "同学", "高考", "中学", "小学", "大学", "毕业"]],
  ["工作", ["上班", "工作", "单位", "工厂", "车间", "同事", "领导", "创业", "退休"]],
  ["家庭", ["结婚", "孩子", "儿子", "女儿", "媳妇", "婆婆", "公公", "丈夫", "老公", "家庭", "孙子"]],
  ["晚年", ["现在", "这些年", "养老", "身体", "孙子", "孙女"]],
];

function guessPeriod(text: string): string {
  for (const [period, words] of MOCK_PERIOD_WORDS) {
    if (words.some((w) => text.includes(w))) return period;
  }
  return "其他";
}

/** Mock 模式：基于规则提取候选事件（用于无 Key 演示） */
export function extractEventsMock(lines: ChatLine[]): MemoryEvent[] {
  const TIME_RE = /(19|20)\d{2}\s*年|(\d{1,2})\s*岁|(\d{1,2})\s*月|(\d{1,2})\s*日|小时候|童年|那年|当时/;
  const PLACE_RE = /(在|去|回|住)([\u4e00-\u9fa5]{2,6}(?:村|镇|县|市|省|学校|厂|山|街|路))/g;
  const events: MemoryEvent[] = [];
  for (const line of lines) {
    const text = line.content;
    if (text.length < 20) continue; // 太短不构成事件
    if (!TIME_RE.test(text)) continue;
    const places: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = PLACE_RE.exec(text)) !== null) {
      places.push(m[2]);
      if (places.length >= 3) break;
    }
    events.push({
      id: uid("evt"),
      source: "chat",
      title: text.slice(0, 18),
      content: text.slice(0, 120),
      people: [line.sender !== "对方" ? line.sender : "家人"],
      places,
      emotion: "温暖",
      period: guessPeriod(text),
      keywords: [line.sender],
      createdAt: new Date().toISOString(),
    });
    if (events.length >= 50) break;
  }
  return events;
}

function buildChatPrompt(record: ChatRecord, subjectName: string): string {
  // 控制 token：最多取前 120 条，超过则均匀抽样
  const lines = record.lines.slice(0, 120);
  const transcript = lines
    .map((l) => `[${l.sender}] ${l.content}`)
    .join("\n");
  return `以下是一段与「${subjectName}」相关的聊天记录（发送者可能包括 ${subjectName} 本人、家人等）。
请提取其中值得写入回忆录的人生事件，按 ${subjectName} 的第一人称叙述。

聊天记录：
${transcript.slice(0, 8000)}`;
}

/** 从聊天记录提取事件并入记忆库，返回本次提取的事件 */
export async function extractFromChat(record: ChatRecord): Promise<{ events: MemoryEvent[]; mode: string }> {
  const subjectName = getMemoryStore().subjectName;
  if (isMockMode()) {
    const events = extractEventsMock(record.lines);
    addEvents(events);
    return { events, mode: "mock" };
  }
  const reply = await chatJson<{ events: MemoryEvent[] }>(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildChatPrompt(record, subjectName) },
    ],
    { maxTokens: 4096 }
  );
  const events = (reply.events ?? []).map((e) => ({
    ...e,
    id: uid("evt"),
    source: "chat" as const,
    sourceRef: record.id,
    time: e.time || "未知",
    period: PERIODS.includes(e.period as (typeof PERIODS)[number]) ? e.period : "其他",
    people: e.people ?? [],
    places: e.places ?? [],
    keywords: e.keywords ?? [],
    createdAt: new Date().toISOString(),
  }));
  addEvents(events);
  return { events, mode: "llm" };
}

/** 从访谈对话提取事件（增量，避免与已有事件重复） */
export async function extractFromInterview(session: InterviewSession): Promise<{ events: MemoryEvent[]; mode: string }> {
  const existing = getMemoryStore().events;
  if (isMockMode()) {
    const userLines = session.messages.filter((m) => m.role === "user");
    const events = userLines
      .map((m): MemoryEvent | null => {
        const text = m.content;
        if (text.length < 15) return null;
        const dup = existing.some((e) => e.title.includes(text.slice(0, 8)) || text.slice(0, 8).includes(e.title));
        if (dup) return null;
        return {
          id: uid("evt"),
          source: "interview",
          sourceRef: session.id,
          time: "未知",
          title: text.slice(0, 18),
          content: text.slice(0, 120),
          people: [session.subjectName],
          places: [],
          emotion: "温暖",
          period: session.period,
          keywords: [session.period],
          createdAt: new Date().toISOString(),
        };
      })
      .filter((e): e is MemoryEvent => !!e);
    addEvents(events);
    return { events, mode: "mock" };
  }

  const transcript = session.messages
    .map((m) => `${m.role === "assistant" ? "采访者" : session.subjectName}：${m.content}`)
    .join("\n");
  const reply = await chatJson<{ events: MemoryEvent[] }>(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是一次关于「${session.subjectName}」${session.period}阶段的访谈对话，请提取新的人生事件（第一人称叙述）。
已有事件标题：${existing.map((e) => e.title).slice(-30).join("；") || "（无）"}
不要重复已有内容。

访谈对话：
${transcript.slice(0, 8000)}`,
      },
    ],
    { maxTokens: 4096 }
  );
  const events = (reply.events ?? []).map((e) => ({
    ...e,
    id: uid("evt"),
    source: "interview" as const,
    sourceRef: session.id,
    period: session.period,
    createdAt: new Date().toISOString(),
  }));
  addEvents(events);
  return { events, mode: "llm" };
}
