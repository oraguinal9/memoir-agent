"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useMock } from "@/lib/useMock";
import { Book } from "@/lib/types";

export default function BookPage() {
  const [book, setBook] = useState<Book | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const mock = useMock();

  const load = useCallback(async () => {
    const res = await fetch("/api/book");
    const data = await res.json();
    setBook(data.empty ? null : data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = book?.chapters.find((c) => c.id === activeId) ?? null;

  const generate = async () => {
    setBusy(true);
    setError("");
    setMsg("正在整理记忆库、逐章生成…可能需要一点时间");
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setBook(data.book);
      setActiveId(data.book.chapters[0]?.id ?? null);
      setMsg("书稿已生成");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  const saveChapter = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await fetch("/api/book/chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: active.id, content: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setBook((b) =>
        b
          ? { ...b, chapters: b.chapters.map((c) => (c.id === active.id ? { ...c, content: draft, status: "done" } : c)) }
          : b
      );
      setEditing(false);
      setMsg("章节已保存");
      setTimeout(() => setMsg(""), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportMd = async () => {
    const res = await fetch("/api/book?export=1");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${book?.title ?? "回忆录"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventsCount = book?.chapters.reduce((n, c) => n + (c.content.match(/^\- |（草稿章节）/gm)?.length ?? 0), 0);

  return (
    <>
      <Nav />
      <div className="page">
        <h1>回忆录书稿</h1>
        <p className="sub">把记忆库里的素材按人生阶段组织成书 —— 生成后可逐章编辑、导出 Markdown</p>

        <div className="book-toolbar">
          <button className="btn" onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : book ? "重新生成书稿" : "生成书稿"}
          </button>
          {book && (
            <>
              <button className="btn secondary" onClick={exportMd}>
                导出 Markdown
              </button>
              <button className="btn secondary" onClick={() => setActiveId(book.chapters[0]?.id ?? null)}>
                跳到开头
              </button>
            </>
          )}
          {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>}
          {msg && <span style={{ color: "var(--teal)", fontSize: 13 }}>{msg}</span>}
        </div>

        {!loaded && <div className="empty">加载中…</div>}

        {loaded && !book && (
          <div className="card">
            <div className="empty">
              还没有书稿。
              <br />
              <br />
              先去「导入聊天记录」或「访谈」积累素材，再回来点「生成书稿」。
              <br />
              <span className="small">素材不足时也会生成框架章节，方便你手工补充。</span>
            </div>
          </div>
        )}

        {book && (
          <>
            <div className="card" style={{ paddingBottom: 14 }}>
              <h2 style={{ marginBottom: 4 }}>{book.title}</h2>
              <div className="muted" style={{ marginBottom: 10 }}>
                共 {book.chapters.length} 章 · 已完善 {book.chapters.filter((c) => c.status === "done").length} 章
              </div>
              <div className="chapter-nav">
                {book.chapters.map((c) => (
                  <button
                    key={c.id}
                    className={`chip${activeId === c.id ? " active" : ""}`}
                    onClick={() => {
                      setActiveId(c.id);
                      setEditing(false);
                    }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>

            {active && (
              <div className={`card ${editing ? "editing" : ""}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ margin: 0 }}>{active.title}</h2>
                  <div style={{ display: "flex", gap: 8 }}>
                    {!editing ? (
                      <button
                        className="btn secondary sm"
                        onClick={() => {
                          setDraft(active.content);
                          setEditing(true);
                        }}
                      >
                        编辑本章
                      </button>
                    ) : (
                      <>
                        <button className="btn sm" onClick={saveChapter} disabled={busy}>
                          保存
                        </button>
                        <button className="btn secondary sm" onClick={() => setEditing(false)}>
                          取消
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    style={{ width: "100%" }}
                  />
                ) : (
                  <div className="chapter-body">{active.content}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
