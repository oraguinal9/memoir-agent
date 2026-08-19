import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "回忆录智能体",
  description: "聊天记录导入 + AI 访谈 + 事件整理 + 书稿生成",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
