// 回忆录智能体 · UI 真机测试（Playwright + Chromium headless）
// 运行：node test/ui-test.mjs
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright");

const BASE = "http://localhost:3100";
const SHOT_DIR = "test/screenshots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL  ${name}  ${detail}`); }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

console.log("=== UI 测试开始 ===");

// ---- 1. 首页 ----
console.log("--- 1. 首页 / ---");
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".nav-link", { timeout: 10000 });
ok("导航 4 个入口", (await page.locator(".nav-link").count()) === 4);
ok("统计卡片渲染", (await page.locator(".stat").count()) >= 6, `stats=${await page.locator(".stat").count()}`);
ok("演示模式徽标显示", (await page.getByText("演示模式").count()) > 0);
ok("三步引导渲染", (await page.locator(".step").count()) === 3);
await page.screenshot({ path: SHOT_DIR + "/01-home.png", fullPage: true });

// ---- 2. 导入页 ----
console.log("--- 2. 导入页 /import ---");
await page.goto(BASE + "/import", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "填入示例数据" }).click();
const taLen = await page.locator("textarea").inputValue().then((v) => v.length);
ok("示例数据填入文本框", taLen > 100, `len=${taLen}`);
await page.getByRole("button", { name: "解析并提取事件" }).click();
await page.waitForSelector(".evt-list li", { timeout: 15000 });
const evtCount = await page.locator(".evt-list li").count();
ok("提取出事件列表", evtCount > 0, `events=${evtCount}`);
ok("结果显示统计数字", (await page.locator(".stat .num").first().textContent()) !== "");
await page.screenshot({ path: SHOT_DIR + "/02-import.png", fullPage: true });

// ---- 3. 访谈页 ----
console.log("--- 3. 访谈页 /interview ---");
await page.goto(BASE + "/interview", { waitUntil: "domcontentloaded" });
// 首条消息
await page.locator("textarea").fill("咱们聊聊我小时候的事吧");
await page.getByRole("button", { name: "发送" }).click();
await page.waitForSelector(".msg.assistant", { timeout: 15000 });
await page.waitForFunction(
  () => { const m = document.querySelectorAll(".msg.assistant"); const last = m[m.length - 1]; return last && last.textContent.length > 15; },
  { timeout: 15000 }
);
const userCount1 = await page.locator(".msg.user").count();
const asstCount1 = await page.locator(".msg.assistant").count();
ok("用户消息出现", userCount1 === 1, `user=${userCount1}`);
ok("采访者回复出现", asstCount1 >= 1, `asst=${asstCount1}`);
// 续聊
await page.locator("textarea").fill("我最早的记忆是外婆家灶台上烤的红薯，冬天特别香，那是三岁时候的事");
await page.getByRole("button", { name: "发送" }).click();
await page.waitForFunction(() => document.querySelectorAll(".msg.user").length >= 2, { timeout: 15000 });
await page.waitForFunction(
  () => { const m = document.querySelectorAll(".msg.assistant"); const last = m[m.length - 1]; return last && last.textContent.length > 10; },
  { timeout: 15000 }
);
ok("多轮对话正常", (await page.locator(".msg.user").count()) === 2, `user=${await page.locator(".msg.user").count()}`);
await page.screenshot({ path: SHOT_DIR + "/03-interview.png", fullPage: true });

// ---- 4. 书稿页 ----
console.log("--- 4. 书稿页 /book ---");
await page.goto(BASE + "/book", { waitUntil: "domcontentloaded" });
const genBtn = page.getByRole("button", { name: "生成书稿" });
ok("生成书稿按钮存在", (await genBtn.count()) === 1);
await genBtn.click();
await page.waitForSelector(".chapter-nav .chip", { timeout: 30000 });
const chips = await page.locator(".chapter-nav .chip").count();
ok("章节 chip 出现（6 章）", chips === 6, `chips=${chips}`);
ok("正文渲染", (await page.locator(".chapter-body").textContent()).length > 0);
await page.screenshot({ path: SHOT_DIR + "/04-book.png", fullPage: true });

// 编辑章节
await page.locator(".chapter-nav .chip").nth(1).click();
await page.getByRole("button", { name: "编辑本章" }).click();
await page.locator("textarea").fill("## 改过的章节标题\n\n这是通过 UI 真机测试编辑的内容。");
await page.getByRole("button", { name: "保存" }).click();
await page.waitForFunction(() => document.body.textContent.includes("章节已保存"), { timeout: 10000 });
const savedText = await page.locator(".chapter-body").textContent();
ok("编辑保存后回显", savedText.includes("UI 真机测试"), savedText.slice(0, 40));
await page.screenshot({ path: SHOT_DIR + "/05-book-edit.png", fullPage: true });

// 导出按钮存在
ok("导出按钮存在", (await page.getByRole("button", { name: "导出 Markdown" }).count()) === 1);

// ---- 5. 控制台错误检查 ----
console.log("--- 5. 浏览器控制台错误 ---");
ok("无 console/page 错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n========== UI 测试：${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name} :: ${f.detail}`);
  process.exit(1);
}
console.log("全部通过 ✅");
