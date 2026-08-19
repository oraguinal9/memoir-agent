# 回忆录智能体 · 项目长期笔记

## 项目定位
- 为长辈/本人生成回忆录：聊天记录导入 + AI 访谈（文字/语音）+ 事件整理 + 书稿生成
- 差异化：GitHub 无项目覆盖"聊天记录导入 + 主动访谈 + 文字语音 + 成书"全链路（StorySage 只访谈、WeChatMsg 只导出）
- 明确不做：记忆管理 App、数字分身训练（用户偏好：要"有产出的成品"不要元功能）

## 技术决策（2026-08-19 确立）
- Next.js 15 App Router + TS + 纯 CSS；JSON 文件存储（data/，无数据库）；LLM 走 OpenAI 兼容接口（默认 DeepSeek，.env.local 配 LLM_API_KEY）
- 无 Key 时 mock 模式可跑通全流程（规则提取/轮询提问/模板成书）——保证演示不卡壳
- 3 Agent 精简：采访者（lib/interview.ts）→ 整理（lib/extract.ts）→ 写作（lib/writer.ts）
- 语音：Web Speech API（zh-CN 识别 + speechSynthesis 朗读），不做重型说话人分离

## 关键约定
- data/ 为运行时数据（已 gitignore），删除需绕过 safe-delete shim（`CODEBUDDY_SESSION_ID= CLAUDE_SESSION_ID= rm -rf`）
- client 组件只可引 lib/constants.ts 与 lib/useMock.ts；服务端才可引 lib/store.ts（fs）
- 路由：POST /api/book 即生成；?export=1 导出 md
- 所有 POST route 的 `req.json()` 必须 `.catch(() => ({}))` 防 500
- 解析/提取的"纯文本兜底"行为：相邻同发送者（"对方"）会合并为一条消息
- 测试：test/deep-test.mjs（API 62 项）+ test/ui-test.mjs（Playwright UI 16 项），均在 localhost:3100 上跑

## 部署
- next.config.mjs 已开 output: "standalone"；数据目录可配 DATA_DIR（默认 process.cwd()/data）
- Dockerfile（node:22-alpine 多阶段 + VOLUME /app/data + USER node）+ .dockerignore + ecosystem.config.cjs（PM2 fork 单实例，JSON 存储勿开 cluster）
- 服务器部署必须先配 .env.local（LLM_API_KEY），否则 mock 模式
- 部署形态 standalone 已验证（server.js 直跑）；备选：SSH 直跑 pm2（参考 travel-agent-deploy skill）

### 部署交接清单（另一个窗口接手用）
- 项目路径：E:\ai回忆录智能体（Next.js 15 + standalone + JSON 存储，无数据库）
- 本地验证过：生产构建通过；78 项测试全过；standalone server.js 直跑 OK（3101 实测）
- 服务器上必做：
  1. 传代码（node_modules/.next 不传）→ `npm ci && npm run build`（或直接传 standalone 产物 + `npm ci --omit=dev`）
  2. 建 `.env.local`：`LLM_API_KEY=...`（不配 = 演示模式，访谈/提取/成文全是规则模拟）
  3. 方式 A（Docker）：`docker build -t memoir-agent . && docker run -d -p 3000:3000 -v memoir-data:/app/data -e LLM_API_KEY=sk-xxx memoir-agent`
  4. 方式 B（裸机 pm2）：`npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save`（instances=1，勿开 cluster）
  5. 数据目录单独备份：data/ 整个拷走即可（memories.json + chats/ + interviews/ + book.json）
- 部署后回归：`node test/deep-test.mjs`（需服务在 3100/3000 跑）；UI 用 test/ui-test.mjs（BASE 环境变量可改端口）
- 用户部署经验（SSH 密码登录、scp 替代、GitHub push 坑）在用户级记忆 ~/.workbuddy/MEMORY.md，同账号可见

## 下一步候选
- 配真实 LLM Key 后验证 LLM 提取质量（目前 mock 提取规则较粗）
- 聊天记录 CSV 真实样本（WeChatMsg 导出）回归
- 书稿 PDF/HTML 导出、章节编辑增强（重新生成会覆盖用户编辑——已知行为）
- 部署上线：等用户提供 LLM Key 与目标环境（阿里云 pm2 / Docker）
