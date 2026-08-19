"use client";

import { useEffect, useState } from "react";

/** 客户端读取当前是否演示模式（未配置 LLM Key） */
export function useMock(): boolean {
  const [mock, setMock] = useState(false);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setMock(!!d?.llm?.mock))
      .catch(() => {});
  }, []);
  return mock;
}
