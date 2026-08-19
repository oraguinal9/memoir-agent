"use client";

import { useRef, useState } from "react";
import Nav from "@/components/Nav";
import { useMock } from "@/lib/useMock";

interface ImportResult {
  recordId: string;
  stats: { total: number; senders: Record<string, number>; totalChars: number };
  extracted: number;
  mode: string;
  sampleEvents: { title: string; period: string; time: string }[];
}

export default function ImportPage() {
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("聊天记录.txt");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mock = useMock();

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.readAsText(f);
  };

  const submit = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Nav />
      <div className="page">
        <h1>导入聊天记录</h1>
        <p className="sub">粘贴文本或上传文件，AI 会从对话中提取值得写进回忆录的人生事件</p>

        <div className="card">
          <h2>数据来源</h2>
          <p className="muted">
            支持两种格式（WeChatMsg 等工具导出后直接粘贴即可）：
          </p>
          <ul className="muted" style={{ paddingLeft: 18, margin: "8px 0 14px" }}>
            <li>
              <b>CSV</b>：表头含 时间 / 发送者 / 内容（或 time / sender / content），微信导出格式自动识别
            </li>
            <li>
              <b>JSON 数组</b>：<code>[{"{\"time\":\"2024-01-01\",\"sender\":\"妈妈\",\"content\":\"...\"}"}]</code>
            </li>
          </ul>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              className="btn secondary sm"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              选择文件…
            </button>
            <button
              className="btn secondary sm"
              type="button"
              onClick={() => {
                setContent(SAMPLE);
                setFilename("示例_家庭对话.csv");
              }}
            >
              填入示例数据
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.json,.md"
              style={{ display: "none" }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>

          <label className="field">聊天记录内容（{content.length} 字符）</label>
          <textarea
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"时间,发送者,内容\n2024-06-01 10:00,妈妈,你小时候在村里那棵大槐树下…"}
          />

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn" onClick={submit} disabled={busy || !content.trim()}>
              {busy ? (
                <>
                  <span className="spinner" /> 正在解析并提取事件…
                </>
              ) : (
                "解析并提取事件"
              )}
            </button>
            {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>}
          </div>
        </div>

        {result && (
          <div className="card">
            <h2>导入结果</h2>
            <div className="stat-grid" style={{ marginBottom: 8 }}>
              <div className="stat">
                <div className="num">{result.stats.total}</div>
                <div className="label">消息条数</div>
              </div>
              <div className="stat">
                <div className="num">{result.extracted}</div>
                <div className="label">提取事件</div>
              </div>
              <div className="stat">
                <div className="num">{(result.stats.totalChars / 1000).toFixed(1)}k</div>
                <div className="label">总字数</div>
              </div>
            </div>
            {result.mode === "mock" && (
              <p className="muted" style={{ color: "var(--teal)" }}>
                演示模式：事件由规则提取。配置 LLM Key 后会自动升级为 AI 提取。
              </p>
            )}
            {result.sampleEvents.length > 0 && (
              <>
                <h3>提取到的事件（样例）</h3>
                <ul className="evt-list">
                  {result.sampleEvents.map((e, i) => (
                    <li key={i}>
                      <span className="tag">{e.period}</span>
                      {e.time !== "未知" && <span className="tag">{e.time}</span>}
                      {e.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const SAMPLE = `时间,发送者,内容
2024-06-01 09:58,妈妈,你还记得咱们老家吗
2024-06-01 09:59,我,记得呀，那个小院子
2024-06-01 10:00,妈妈,1982年我们全家搬到了县城，你爸在县农机厂上班，我带着你在村里又住了半年
2024-06-01 10:01,妈妈,那半年你天天在村口那棵大槐树下等爸爸回来
2024-06-01 10:03,妈妈,后来你上小学，学校就在农机厂对面，你爸中午骑自行车来接你
2024-06-01 10:05,我,听说你年轻时还当过民办老师？
2024-06-01 10:06,妈妈,对，1985年到1988年，在镇上中心小学教书，教一二年级语文，一个月工资18块钱
2024-06-01 10:08,妈妈,你三岁那年冬天，我背着你走了十几里山路去外婆家，雪特别大
2024-06-01 10:10,我,那外婆家在哪？
2024-06-01 10:11,妈妈,在青山镇，外婆会在灶台上烤红薯给我们吃`;
