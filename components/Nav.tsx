"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMock } from "@/lib/useMock";

const LINKS = [
  { href: "/", label: "总览" },
  { href: "/import", label: "导入聊天" },
  { href: "/interview", label: "访谈" },
  { href: "/book", label: "书稿" },
];

export default function Nav() {
  const path = usePathname();
  const mock = useMock();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-brand">回忆录</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`nav-link${path === l.href ? " active" : ""}`}>
            {l.label}
          </Link>
        ))}
        {mock ? (
          <span className="nav-mock" title="未配置大模型 Key，当前用规则模拟回复">
            演示模式
          </span>
        ) : (
          <span className="nav-mock">AI 已连接</span>
        )}
      </div>
    </nav>
  );
}
