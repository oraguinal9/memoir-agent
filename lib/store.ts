import fs from "fs";
import path from "path";
import {
  Book,
  ChatRecord,
  InterviewSession,
  MemoryEvent,
  MemoryStore,
  PERIODS,
} from "./types";

// ===== JSON 文件存储（data/ 目录）=====
// 单用户本地场景，用文件即可；后续可平滑替换为 SQLite/数据库
// 数据目录可用 DATA_DIR 环境变量覆盖（容器部署时挂载持久卷）

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memories.json");
const CHATS_DIR = path.join(DATA_DIR, "chats");
const INTERVIEWS_DIR = path.join(DATA_DIR, "interviews");
const BOOK_FILE = path.join(DATA_DIR, "book.json");

function ensureDirs() {
  for (const d of [DATA_DIR, CHATS_DIR, INTERVIEWS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch (e) {
    console.error("读取失败", file, e);
  }
  return fallback;
}

function writeJson(file: string, data: unknown) {
  ensureDirs();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ===== 记忆库 =====

export function getSubjectName(): string {
  return process.env.SUBJECT_NAME || "妈妈";
}

export function getMemoryStore(): MemoryStore {
  const store = readJson<MemoryStore | null>(MEMORY_FILE, null);
  if (store) return store;
  const fresh: MemoryStore = {
    version: 1,
    subjectName: getSubjectName(),
    events: [],
    people: {},
    places: {},
    periods: [...PERIODS],
    updatedAt: new Date().toISOString(),
  };
  writeJson(MEMORY_FILE, fresh);
  return fresh;
}

export function saveMemoryStore(store: MemoryStore) {
  store.updatedAt = new Date().toISOString();
  writeJson(MEMORY_FILE, store);
}

/** 追加事件并自动维护 人物/地点 索引 */
export function addEvents(events: MemoryEvent[]) {
  const store = getMemoryStore();
  for (const ev of events) {
    if (!ev.id) ev.id = uid("evt");
    store.events.push(ev);
    for (const p of ev.people) {
      if (!store.people[p]) store.people[p] = { count: 0 };
      store.people[p].count += 1;
    }
    for (const pl of ev.places) {
      if (!store.places[pl]) store.places[pl] = { count: 0 };
      store.places[pl].count += 1;
    }
  }
  saveMemoryStore(store);
}

// ===== 聊天记录 =====

export function saveChatRecord(rec: ChatRecord) {
  ensureDirs();
  writeJson(path.join(CHATS_DIR, `${rec.id}.json`), rec);
}

export function listChatRecords(): ChatRecord[] {
  ensureDirs();
  return fs
    .readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<ChatRecord | null>(path.join(CHATS_DIR, f), null))
    .filter((r): r is ChatRecord => !!r);
}

// ===== 访谈会话 =====

export function saveInterview(session: InterviewSession) {
  ensureDirs();
  writeJson(path.join(INTERVIEWS_DIR, `${session.id}.json`), session);
}

export function listInterviews(): InterviewSession[] {
  ensureDirs();
  return fs
    .readdirSync(INTERVIEWS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<InterviewSession | null>(path.join(INTERVIEWS_DIR, f), null))
    .filter((s): s is InterviewSession => !!s);
}

export function getInterview(id: string): InterviewSession | null {
  return readJson<InterviewSession | null>(path.join(INTERVIEWS_DIR, `${id}.json`), null);
}

// ===== 书稿 =====

export function getBook(): Book | null {
  return readJson<Book | null>(BOOK_FILE, null);
}

export function saveBook(book: Book) {
  book.updatedAt = new Date().toISOString();
  writeJson(BOOK_FILE, book);
}
