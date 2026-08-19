import { chatStream, isMockMode } from "./llm";
import { getMemoryStore } from "./store";
import { InterviewSession, LlmMessage } from "./types";
import { DEFAULT_PERIODS, SEED_QUESTIONS } from "./constants";

// ===== 采访者 Agent：设计问题、引导回忆、追问细节 =====

export { DEFAULT_PERIODS };

export function seedQuestions(period: string): string[] {
  return SEED_QUESTIONS[period] ?? SEED_QUESTIONS["其他"];
}

/** 开场白 */
export function openingLine(subjectName: string, period: string): string {
  return `你好，${subjectName}。今天想和你聊聊「${period}」那段日子。慢慢说，想到哪儿说到哪儿，咱们随便聊。${seedQuestions(period)[0]}`;
}

function systemPrompt(session: InterviewSession): string {
  const store = getMemoryStore();
  const related = store.events.filter((e) => e.period === session.period);
  const known = related
    .slice(-8)
    .map((e) => `· ${e.title}（${e.time || "时间未知"}）`)
    .join("\n");

  return `你是一位温柔耐心的回忆录采访者，正在采访「${session.subjectName}」，主题是${session.period}阶段。
要求：
1. 每次只问一个问题，一次只聚焦一个细节，像拉家常一样自然。
2. 对方回答后要：先共情回应一句，再追问一个更具体的细节（时间、场景、人物、感受），引导把故事讲完整。
3. 已有素材（来自聊天记录，可用于引导确认，但不要生硬念出来）：\n${known || "（暂无）"}
4. 回复控制在 80 字以内，用口语，不要用「总结」语气，不要一次抛多个问题。`;

  // 这个函数返回一个 string，但实际上它是 sync，用于构造 messages
}

/** 构造 LLM 上下文 */
export function buildInterviewMessages(session: InterviewSession): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt(session) }];
  for (const m of session.messages.slice(-12)) {
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

/** Mock 模式回复：轮询种子问题 + 简单追问 */
export function mockReply(session: InterviewSession): string {
  const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
  const pool = seedQuestions(session.period);
  const asked = session.messages.filter((m) => m.role === "assistant").length;
  const topicIdx = Math.floor(asked / 2);
  const shortAnswer = lastUser && lastUser.content.replace(/\s/g, "").length < 12;

  if (shortAnswer) {
    const followups = [
      "能再多说几句吗？当时是什么情形，你记得清清楚楚的场景是什么样的？",
      "那会儿周围的人是谁？他们说了什么，你当时心里怎么想？",
      "嗯，具体是哪一年、在哪儿发生的事？后来怎么样了？",
      "这件事后来有影响你的选择吗？你当时什么感觉？",
    ];
    return followups[asked % followups.length];
  }
  const next = pool[Math.min(topicIdx + 1, pool.length - 1)];
  const bridges = [
    "听着真有意思。",
    "这些回忆真珍贵。",
    "嗯，我记下了。",
    "说到这儿，我都有画面感了。",
  ];
  return `${bridges[asked % bridges.length]}${next}`;
}

/** 流式访谈回复（LLM 模式），返回 AsyncGenerator */
export async function* streamInterviewReply(session: InterviewSession): AsyncGenerator<string> {
  if (isMockMode()) {
    const reply = mockReply(session);
    for (let i = 0; i < reply.length; i += 3) {
      yield reply.slice(i, i + 3);
      await new Promise((r) => setTimeout(r, 8));
    }
    return;
  }
  yield* chatStream(buildInterviewMessages(session), { temperature: 0.8 });
}
