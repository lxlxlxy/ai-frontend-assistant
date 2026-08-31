import type { UIMessage } from "ai";

/**
 * 存储抽象层：组件只依赖这几个函数，不关心底层是 localStorage 还是数据库。
 * 将来扩展为服务端数据库时，只需替换本文件内部实现，组件零改动。
 */
export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  messages: UIMessage[];
};

const STORAGE_KEY = "ai-frontend-assistant.chats";

/**
 * 生成唯一 id。优先用 crypto.randomUUID（需 HTTPS / secure context），
 * 非安全环境（如局域网 http 部署）降级为时间戳 + 随机数，保证不冲突。
 */
export function genId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 简易发布订阅：所有写操作后 version+1 并通知订阅者。
 * 配合 useSyncExternalStore，组件可在不引入 effect 的前提下自动刷新，
 * 同时实现跨组件同步（如聊天保存后侧边栏列表自动更新）。
 */
let version = 0;
const listeners = new Set<() => void>();

//通知所有订阅的组件，当react重新获取数据时需要渲染这些订阅的组件
function bumpVersion() {
  version++;
  for (const l of listeners) l();
}

//订阅聊天数据变化
export function subscribeChats(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getChatsVersion(): number {
  return version;
}

//把 localStorage 里面保存的字符串拿出来 → 转成 JS 数组
function loadChats(): Chat[] {
  // SSR / 非浏览器环境没有 localStorage，直接返回空
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Chat[]) : [];
  } catch {
    // 数据损坏时静默降级为空列表，避免整页崩溃
    return [];
  }
}

//保存所有会话并通知react数据变化
function saveChats(chats: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  bumpVersion();
}

// 跨标签页同步：浏览器原生 storage 事件只在"其他标签页"修改时才触发，
// 与自定义的同页发布订阅互补——两个标签页同时打开时，任一侧的写操作
// 都能让另一侧通过 bumpVersion 刷新（快照缓存因版本号变化而重建）。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) bumpVersion();
  });
}

/**
 * 版本感知的缓存快照：同一版本下对同一 id 返回稳定引用，
 * 供 useSyncExternalStore 的 getSnapshot 使用（避免无限重渲染）。
 */
let cacheVersion = -1;
let chatCache = new Map<string, Chat | null>();

//给某一个聊天页面提供稳定的数据快照
export function getChatSnapshot(id: string): Chat | null {
  if (cacheVersion !== version) {
    cacheVersion = version;
    chatCache = new Map();
    for (const c of loadChats()) chatCache.set(c.id, c);
  }
  if (!chatCache.has(id)) chatCache.set(id, null);
  return chatCache.get(id)!;
}

/**
 * 稳定空列表：供 useSyncExternalStore 的 getServerSnapshot（SSR 占位）使用。
 * 必须返回常量引用，否则 React 判定快照不稳定 → 无限循环警告。
 */
export const EMPTY_CHATS: Chat[] = [];

/** 会话列表的稳定快照（版本不变时返回同一引用），供 Sidebar 的 useSyncExternalStore 使用 */
let chatsCacheVersion = -1;
let chatsCache: Chat[] = [];

export function getChatsSnapshot(): Chat[] {
  if (chatsCacheVersion !== version) {
    chatsCacheVersion = version;
    chatsCache = getChats();
  }
  return chatsCache;
}

/** 全部会话列表（最新的在前），用于侧边栏 */
export function getChats(): Chat[] {
  return [...loadChats()].sort((a, b) => b.createdAt - a.createdAt);
}

/** 单个会话（进会话时加载历史消息） */
export function getChat(id: string): Chat | null {
  return loadChats().find((c) => c.id === id) ?? null;
}

/** 保存 / 更新一个会话；不存在则追加 */
export function saveChat(chat: Chat): void {
  const chats = loadChats();
  const i = chats.findIndex((c) => c.id === chat.id);
  if (i >= 0) chats[i] = chat;
  else chats.unshift(chat);
  saveChats(chats);
}

/** 删除会话 */
export function deleteChat(id: string): void {
  saveChats(loadChats().filter((c) => c.id !== id));
}

/** 新建一个空会话并落盘，返回它 */
export function createChat(): Chat {
  const chat: Chat = {
    id: genId(),
    title: "新对话",
    createdAt: Date.now(),
    messages: [],
  };
  saveChat(chat);
  return chat;
}

/** 空会话最大存活时间：超过 24h 且从未发过消息的会话会被清理 */
const EMPTY_CHAT_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * 清理超龄空会话（超过 maxAgeMs 且没有任何消息）。
 * 返回清理数量；没有需要清理的会话时不触发写盘与广播。
 * Sidebar 挂载时调用一次即可（/chat/* 布局常驻）。
 */
export function pruneEmptyChats(maxAgeMs: number = EMPTY_CHAT_MAX_AGE): number {
  const chats = loadChats();
  const cutoff = Date.now() - maxAgeMs;
  const kept = chats.filter(
    (c) => !(c.messages.length === 0 && c.createdAt < cutoff)
  );
  if (kept.length === chats.length) return 0;
  saveChats(kept);
  return chats.length - kept.length;
}

/** 提取一条 UIMessage 的全部文本（过滤 reasoning/tool 等其他 parts） */
export function textOf(m: { parts: Array<{ type: string; text?: string }> }): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

/** 用第一条用户消息生成会话标题（前 20 字） */
export function buildTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "新对话";
  const text = textOf(firstUser).trim();
  if (!text) return "新对话";
  return text.length > 20 ? text.slice(0, 20) + "…" : text;
}
