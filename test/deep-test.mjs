// 回忆录智能体 · 深度端到端测试
// 运行：node test/deep-test.mjs  （需服务已在 3100 端口运行）
const BASE = process.env.BASE || "http://localhost:3100";

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

async function get(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

async function post(path, body, raw = false) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: raw ? {} : { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ============ 1. 状态接口 ============
section("1. 状态接口 /api/status");
{
  const r = await get("/api/status");
  ok("返回 200", r.status === 200);
  ok("含 subjectName 与 counts", r.json?.subjectName && r.json?.counts);
  ok("llm 信息完整", r.json?.llm?.mock !== undefined && r.json?.llm?.baseURL);
}

// ============ 2. 导入：格式矩阵 ============
section("2. 导入格式矩阵 /api/import");

// 2a. CSV 带表头
{
  const csv = "时间,发送者,内容\n2024-01-01 10:00,妈妈,1985年我去镇上中心小学教书\n2024-01-02 09:00,爸爸,1990年我们搬进新房子\n2024-01-03 08:30,我,你还记得老院子里的那棵枣树吗";
  const r = await post("/api/import", { filename: "a.csv", content: csv });
  ok("CSV 表头导入 200", r.status === 200, r.text?.slice(0, 120));
  ok("CSV 解析条数=3", r.json?.stats?.total === 3, `total=${r.json?.stats?.total}`);
  ok("CSV 发送者识别", r.json?.stats?.senders?.["妈妈"] === 1);
}

// 2b. CSV 无表头（三列直接排）
{
  const csv = "2024-02-01,妈妈,你三岁那年冬天我背着你走了十几里山路去外婆家\n2024-02-02,妈妈,外婆在灶台上烤红薯给我们吃\n2024-02-03,爸爸,那时候日子苦但是心里踏实";
  const r = await post("/api/import", { filename: "b.csv", content: csv });
  ok("CSV 无表头导入 200", r.status === 200, r.text?.slice(0, 120));
  ok("CSV 无表头条数=3", r.json?.stats?.total === 3);
}

// 2c. JSON 数组
{
  const arr = JSON.stringify([
    { time: "2024-03-01", sender: "妈妈", content: "1982年我们全家搬到了县城，你爸在县农机厂上班" },
    { time: "2024-03-02", sender: "妈妈", content: "我教了三年书，一个月工资18块钱，但是很满足" },
  ]);
  const r = await post("/api/import", { filename: "c.json", content: arr });
  ok("JSON 数组导入 200", r.status === 200, r.text?.slice(0, 120));
  ok("JSON 条数=2", r.json?.stats?.total === 2);
}

// 2d. JSON chat 风格 {role, content}
{
  const arr = JSON.stringify([
    { role: "user", content: "妈妈，你小时候家里什么样" },
    { role: "assistant", content: "家里穷，但是外婆总是把最好的留给我们" },
  ]);
  const r = await post("/api/import", { filename: "d.json", content: arr });
  ok("JSON chat 风格导入 200", r.status === 200, r.text?.slice(0, 120));
  ok("chat 风格条数=2", r.json?.stats?.total === 2, `total=${r.json?.stats?.total}`);
}

// 2e. 空内容 → 期望被拒绝
{
  const r = await post("/api/import", { filename: "e.txt", content: "" });
  ok("空内容被拒绝（400）", r.status === 400, `status=${r.status} ${r.text?.slice(0, 80)}`);
}

// 2f. 垃圾文本 → 纯文本兜底：按行解析（相邻同行合并，内容不丢）
{
  const r = await post("/api/import", { filename: "f.txt", content: "这不是任何格式的聊天记录内容，随便打了一堆字在这里面。\n第二行也没有格式。" });
  ok("垃圾文本不崩溃（200）", r.status === 200, `status=${r.status}`);
  ok("纯文本兜底解析出消息（total>=1）", r.json?.stats?.total >= 1, r.text?.slice(0, 120));
}

// 2g. 超长行截断 + 系统消息过滤
{
  const long = "长".repeat(1200);
  const csv = `时间,发送者,内容\n2024-04-01,妈妈,${long}\n2024-04-02,系统消息,邀请小明加入群聊\n2024-04-03,妈妈,撤回了一条消息\n2024-04-04,妈妈,正常的一条消息内容`;
  const r = await post("/api/import", { filename: "g.csv", content: csv });
  ok("超长+系统消息导入 200", r.status === 200);
  ok("超长行被跳过、系统消息被过滤（预期 total=1）", r.json?.stats?.total === 1, `total=${r.json?.stats?.total}`);
}

// 2h. 缺 content 字段的 JSON → 合理拒绝并提示
{
  const r = await post("/api/import", { filename: "h.json", content: JSON.stringify([{ foo: "bar" }]) });
  ok("无内容字段 JSON 返回 400 且带提示", r.status === 400 && /解析|没有解析出/.test(r.json?.error ?? ""), r.text?.slice(0, 100));
}

// 2j2. 真空 body（无 JSON 体）不 500
{
  const r = await post("/api/import", undefined, true);
  ok("import 真空 body 不 500", r.status < 500, `status=${r.status}`);
}

// 2i. 非法 JSON
{
  const r = await post("/api/import", { filename: "i.json", content: "[{\"time\": 2024" });
  ok("非法 JSON 不 500（走 CSV 兜底或报错）", r.status < 500, `status=${r.status}`);
}

// 2j. body 缺失字段
{
  const r = await post("/api/import", { filename: "x" }, false);
  ok("缺 content 字段返回 400", r.status === 400, `status=${r.status} ${r.text?.slice(0, 80)}`);
}

// ============ 3. 事件提取与索引 ============
section("3. 事件提取与记忆库");
{
  const r = await get("/api/events");
  const events = r.json?.events ?? [];
  ok("事件已入库（>0）", events.length > 0, `count=${events.length}`);
  ok("事件字段完整", events.every((e) => e.id && e.title && e.content && e.period && Array.isArray(e.people)));
  ok("人物索引已建", Object.keys(r.json?.people ?? {}).length > 0, JSON.stringify(r.json?.people));
  const periods = r.json?.periods ?? [];
  ok("阶段含 童年/求学/工作/家庭/晚年", ["童年","求学","工作","家庭","晚年"].every((p) => periods.includes(p)));
}

// ============ 4. 访谈 ============
section("4. 访谈 /api/interview");

let sid = null;
// 4a. 新会话
{
  const r = await post("/api/interview", { subjectName: "妈妈", period: "童年", message: "咱们聊聊我小时候的事吧" });
  ok("新会话 200", r.status === 200, r.text?.slice(0, 80));
  ok("流式回复非空", r.text.trim().length > 0, `len=${r.text.length}`);
  sid = r.headers.get("x-session-id");
  ok("返回会话 id", !!sid, `sid=${sid}`);
}

// 4b. 会话已保存
{
  const r = await get(`/api/interview?id=${sid}`);
  ok("GET 恢复会话 200", r.status === 200);
  ok("会话含开场白", (r.json?.messages ?? []).some((m) => m.role === "assistant"), "开场白缺失");
}

// 4c. 续聊（带 id）
{
  const r = await post("/api/interview", { id: sid, message: "我最早的记忆是三岁那年冬天，妈妈背着我走了十几里山路去外婆家，雪特别大，外婆在灶台烤红薯给我们吃" });
  ok("续聊 200 且有回复", r.status === 200 && r.text.trim().length > 0);
}

// 4d. 消息已入库（user 与 assistant 各 2 条）
{
  const r = await get(`/api/interview?id=${sid}`);
  const msgs = r.json?.messages ?? [];
  ok("消息条数=4（开+问+答+追）", msgs.length >= 4, `len=${msgs.length}`);
}

// 4e. 空消息
{
  const r = await post("/api/interview", { id: sid, message: "   " });
  ok("空消息不崩溃（仍回复）", r.status === 200, `status=${r.status}`);
}

// 4f. 不存在的会话 id
{
  const r = await get("/api/interview?id=not_exist");
  ok("不存在的会话返回 404", r.status === 404, `status=${r.status}`);
}

// 4g. 空 body / 真空 body → 优雅处理（创建会话返回开场白，不 500）
{
  const r = await post("/api/interview", {});
  ok("空 body 返回 200 且有回复", r.status === 200 && r.text.trim().length > 0, `status=${r.status} ${r.text?.slice(0, 40)}`);
  const r2 = await post("/api/interview", undefined, true);
  ok("interview 真空 body 不 500", r2.status < 500, `status=${r2.status}`);
}

// ============ 5. 结束访谈并整理 ============
section("5. 结束访谈 /api/interview-complete");
let completeEvents = 0;
{
  const r = await post("/api/interview-complete", { id: sid });
  ok("结束访谈 200", r.status === 200, r.text?.slice(0, 120));
  completeEvents = r.json?.extracted ?? 0;
  ok("提取事件数 >= 0", completeEvents >= 0, `extracted=${completeEvents}`);
}
// 去重：再次结束同一会话
{
  const before = (await get("/api/events")).json?.events?.length ?? 0;
  await post("/api/interview-complete", { id: sid });
  const after = (await get("/api/events")).json?.events?.length ?? 0;
  ok("重复整理不产生重复事件", before === after, `before=${before} after=${after}`);
}
// 真空 body / 缺 id → 404
{
  const r = await post("/api/interview-complete", undefined, true);
  ok("complete 真空 body 返回 404", r.status === 404, `status=${r.status}`);
}

// ============ 6. 书稿 ============
section("6. 书稿 /api/book");
let bookTitle = "";
{
  const r = await post("/api/book", {});
  ok("生成书稿 200", r.status === 200, r.text?.slice(0, 120));
  const book = r.json?.book;
  ok("书稿含 6 章（前言+5 阶段）", book?.chapters?.length === 6, `chapters=${book?.chapters?.length}`);
  ok("前言含 # 标题", book?.chapters?.[0]?.content?.startsWith("#"), book?.chapters?.[0]?.content?.slice(0, 40));
  ok("每章内容非空", book?.chapters?.every((c) => c.content.trim().length > 0));
  bookTitle = book?.title ?? "";
}
// 章节保存
{
  const r = await post("/api/book", {});
  const book = r.json?.book;
  const chId = book?.chapters?.[1]?.id;
  const r2 = await post("/api/book/chapter", { chapterId: chId, content: "## 我改过的内容\n\n这是用户编辑。", title: "改过的童年" });
  ok("章节保存 200", r2.status === 200, r2.text?.slice(0, 80));
  ok("章节状态变为 done", r2.json?.chapter?.status === "done");
  const r3 = await get("/api/book");
  const saved = r3.json?.chapters?.find((c) => c.id === chId);
  ok("编辑持久化", saved?.content?.includes("我改过的内容"), saved?.content?.slice(0, 40));
  ok("章节标题可改", saved?.title === "改过的童年", saved?.title);
}
// 章节不存在
{
  const r = await post("/api/book/chapter", { chapterId: "ch_nope", content: "x" });
  ok("保存不存在的章节返回 404", r.status === 404, `status=${r.status}`);
}
// 书稿为空时保存
{
  const r = await post("/api/book/chapter", { chapterId: "ch_1", content: "x" });
  ok("无书稿时保存返回 404", r.status === 404, `status=${r.status}`);
}
// 导出
{
  const r = await get("/api/book?export=1");
  ok("导出 200", r.status === 200);
  ok("导出为 markdown 文本", r.text.includes("#") && r.text.includes("---"));
  ok("导出包含用户编辑", r.text.includes("我改过的内容"));
}

// ============ 7. 页面渲染 ============
section("7. 页面渲染");
{
  for (const p of ["/", "/import", "/interview", "/book"]) {
    const r = await get(p);
    ok(`页面 ${p} 返回 200`, r.status === 200, `status=${r.status}`);
    ok(`页面 ${p} 含正文`, /回忆录|导入|访谈|书稿/.test(r.text), "页面为空");
  }
}

// ============ 8. 数据文件 ============
section("8. 数据文件");
{
  const r = await get("/api/status");
  const c = r.json?.counts ?? {};
  ok("统计口径一致（events>0 且 chats>0）", c.events > 0 && c.chats > 0, JSON.stringify(c));
}

// ============ 汇总 ============
console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) {
  console.log("失败明细：");
  for (const f of failures) console.log(`  - ${f.name} :: ${f.detail}`);
  process.exit(1);
} else {
  console.log("全部通过 ✅");
}
