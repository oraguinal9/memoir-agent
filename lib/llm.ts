import { LlmMessage } from "./types";

// ===== LLM Provider（OpenAI 兼容接口）=====
// 未配置 API Key 时自动进入 Mock 模式：调用方可通过 isMockMode() 判断，
// 用规则逻辑返回演示内容，保证全流程无 Key 可跑通。

const BASE_URL = process.env.LLM_BASE_URL || "https://api.deepseek.com/v1";
const API_KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "deepseek-chat";

export function isMockMode(): boolean {
  return !API_KEY;
}

export function llmInfo() {
  return {
    mock: isMockMode(),
    baseURL: BASE_URL,
    model: MODEL,
  };
}

/** 一次性生成（非流式） */
export async function chat(messages: LlmMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  if (isMockMode()) {
    throw new Error("mock_mode");
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** 生成结构化 JSON（用 JSON 模式强约束） */
export async function chatJson<T>(messages: LlmMessage[], opts: { maxTokens?: number } = {}): Promise<T> {
  if (isMockMode()) {
    throw new Error("mock_mode");
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: 0.3,
      response_format: { type: "json_object" },
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    // 尝试剥离可能的 markdown 代码块
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1]) as T;
    throw new Error("LLM 未返回合法 JSON: " + raw.slice(0, 200));
  }
}

/**
 * 流式生成，返回 AsyncGenerator。
 * 前端通过 fetch + ReadableStream 逐块读取。
 */
export async function* chatStream(
  messages: LlmMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string> {
  if (isMockMode()) {
    throw new Error("mock_mode");
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.8,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 流式请求失败 ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE: data: {...}\n\n
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
