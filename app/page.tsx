import Link from "next/link";
import Nav from "@/components/Nav";
import { getBook, getMemoryStore, listChatRecords, listInterviews } from "@/lib/store";
import { isMockMode, llmInfo } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const store = getMemoryStore();
  const mock = isMockMode();
  const info = llmInfo();
  const chats = listChatRecords();
  const interviews = listInterviews();
  const book = getBook();
  const doneChapters = book ? book.chapters.filter((c) => c.status === "done").length : 0;
  const maxPeriod = Math.max(1, ...store.periods.map((p) => store.events.filter((e) => e.period === p).length));

  return (
    <>
      <Nav />
      <div className="page">
        <h1>回忆录智能体</h1>
        <p className="sub">
          为「{store.subjectName}」整理人生资料 —— 导入聊天记录、AI 陪聊访谈、自动生成书稿
        </p>

        {mock && (
          <div className="card" style={{ background: "var(--teal-soft)", borderColor: "var(--teal)" }}>
            <h3 style={{ color: "var(--teal)" }}>当前为演示模式</h3>
            <p className="muted" style={{ margin: 0 }}>
              未配置大模型 Key，访谈与整理使用规则模拟。配置方法：复制 <code>.env.example</code> 为{" "}
              <code>.env.local</code>，填入 <code>LLM_API_KEY</code>（DeepSeek / OpenAI 兼容接口均可），重启即可切换为真实 AI。
              当前接口：{info.baseURL} · {info.model}
            </p>
          </div>
        )}

        <div className="stat-grid">
          <div className="stat">
            <div className="num">{store.events.length}</div>
            <div className="label">已整理事件</div>
          </div>
          <div className="stat">
            <div className="num">{Object.keys(store.people).length}</div>
            <div className="label">相关人物</div>
          </div>
          <div className="stat">
            <div className="num">{Object.keys(store.places).length}</div>
            <div className="label">地点</div>
          </div>
          <div className="stat">
            <div className="num">{chats.length}</div>
            <div className="label">聊天记录</div>
          </div>
          <div className="stat">
            <div className="num">{interviews.length}</div>
            <div className="label">访谈场次</div>
          </div>
          <div className="stat">
            <div className="num">{doneChapters}</div>
            <div className="label">书稿章节</div>
          </div>
        </div>

        <div className="card">
          <h2>人生阶段素材分布</h2>
          {store.periods.map((p) => {
            const count = store.events.filter((e) => e.period === p).length;
            const pct = Math.round((count / maxPeriod) * 100);
            return (
              <div key={p} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-2)" }}>
                  <span>{p}</span>
                  <span>{count} 条</span>
                </div>
                <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, marginTop: 4 }}>
                  <div
                    style={{
                      width: `${Math.max(count > 0 ? pct : 0, 4)}%`,
                      height: "100%",
                      background: count > 0 ? "var(--accent)" : "var(--line)",
                      borderRadius: 4,
                      transition: "width .4s",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="steps">
          <div className="step">
            <span className="idx">1</span>
            <div className="t">导入聊天记录</div>
            <div className="d">粘贴或上传微信导出的 CSV / JSON，自动提取人生事件</div>
            <Link href="/import" className="btn sm">
              去导入
            </Link>
          </div>
          <div className="step">
            <span className="idx">2</span>
            <div className="t">AI 访谈</div>
            <div className="d">按人生阶段陪聊，支持语音输入输出，AI 会追问细节</div>
            <Link href="/interview" className="btn sm">
              去访谈
            </Link>
          </div>
          <div className="step">
            <span className="idx">3</span>
            <div className="t">生成书稿</div>
            <div className="d">把整理好的事件组织成章节，预览、编辑、导出 Markdown</div>
            <Link href="/book" className="btn sm">
              去成书
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
