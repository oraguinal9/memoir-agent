"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";
import { useMock } from "@/lib/useMock";
import { DEFAULT_PERIODS } from "@/lib/constants";

interface Msg {
  role: "assistant" | "user";
  content: string;
  at?: string;
}

interface SessionMeta {
  id: string;
  subjectName: string;
  period: string;
}

const LS_KEY = "memoir_session";

export default function InterviewPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("妈妈");
  const [period, setPeriod] = useState("童年");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [voiceIn, setVoiceIn] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [listening, setListening] = useState(false);
  const [doneInfo, setDoneInfo] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const mock = useMock();

  // 恢复上次会话
  useEffect(() => {
    try {
      const meta = JSON.parse(localStorage.getItem(LS_KEY) || "null") as SessionMeta | null;
      if (meta?.id) {
        fetch(`/api/interview?id=${meta.id}`)
          .then((r) => r.json())
          .then((s) => {
            if (s?.messages) {
              setMessages(s.messages);
              setSessionId(s.id);
              setSubject(s.subjectName);
              setPeriod(s.period);
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    setError("");
    setBusy(true);

    setMessages((m) => [...m, { role: "user", content: msg }]);
    const placeholder = { role: "assistant" as const, content: "" };
    setMessages((m) => [...m, placeholder]);

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, subjectName: subject, period, message: msg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "请求失败");
      }
      const newId = res.headers.get("X-Session-Id");
      if (newId) {
        setSessionId(newId);
        localStorage.setItem(LS_KEY, JSON.stringify({ id: newId, subjectName: subject, period }));
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: full };
          return next;
        });
      }
      if (voiceOut && full) speak(full);
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => m.slice(0, -1)); // 去掉空占位
    } finally {
      setBusy(false);
    }
  };

  // ===== 语音输出 =====
  const speak = (text: string) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[#*`>]/g, ""));
      u.lang = "zh-CN";
      const voices = synth.getVoices();
      const zh = voices.find((v) => v.lang.startsWith("zh"));
      if (zh) u.voice = zh;
      synth.speak(u);
    } catch {}
  };

  // ===== 语音输入 =====
  const toggleMic = () => {
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("当前浏览器不支持语音输入，请使用 Chrome / Edge");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    setError("");
    const recog = new SR();
    recog.lang = "zh-CN";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) send(text);
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recogRef.current = recog;
    setListening(true);
    try {
      recog.start();
    } catch {
      setListening(false);
    }
  };

  const finish = async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setDoneInfo("");
    try {
      const res = await fetch("/api/interview-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDoneInfo(`本次访谈整理出 ${data.extracted} 条事件，已存入记忆库。可去「书稿」查看章节变化。`);
      localStorage.removeItem(LS_KEY);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <>
      <Nav />
      <div className="page">
        <h1>AI 访谈</h1>
        <p className="sub">采访者会按人生阶段提问，并追问细节。说的都是真事，聊完自动整理进记忆库。</p>

        <div className="card">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="field">访谈对象</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="field">人生阶段</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                {DEFAULT_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn secondary sm" type="button" onClick={toggleMic}>
              {listening ? "正在听…" : "语音输入"}
            </button>
            <button
              className="btn secondary sm"
              type="button"
              onClick={() => setVoiceOut((v) => !v)}
              style={voiceOut ? { background: "var(--accent-soft)", color: "var(--accent-strong)" } : {}}
            >
              {voiceOut ? "朗读已开" : "朗读关闭"}
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="empty">
              还没开始。选好阶段，发送任意一句话（比如「咱们聊聊我小时候的事」），
              或者直接点语音输入。
            </div>
          ) : (
            <div className="chat">
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.content || "…"}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          <form className="chat-input-row" onSubmit={onSubmit}>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="说点什么，或按回车发送…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>
              {busy ? <span className="spinner" /> : "发送"}
            </button>
          </form>

          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn secondary sm" onClick={finish} disabled={!sessionId || busy}>
              结束访谈并整理素材
            </button>
            {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>}
            {doneInfo && (
              <span style={{ color: "var(--teal)", fontSize: 13 }}>{doneInfo}</span>
            )}
          </div>
        </div>

        {mock && (
          <p className="muted" style={{ color: "var(--teal)" }}>
            演示模式：采访者用规则提问。配置 LLM Key 后会自动升级为自然对话 + 追问细节。
          </p>
        )}
      </div>
    </>
  );
}
