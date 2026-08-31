"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EMPTY_CHATS,
  getChatsSnapshot,
  subscribeChats,
  createChat,
  deleteChat,
  pruneEmptyChats,
} from "@/lib/storage";

/** 侧边栏：新建对话 + 会话列表 + 删除 */
export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // 订阅存储：任何写操作（新建/保存/删除）都会触发重新读取，无需手动刷新
  const chats = useSyncExternalStore(subscribeChats, getChatsSnapshot, () => EMPTY_CHATS);

  // 当前会话 id（/chat/xxx → xxx）
  const currentId = pathname?.split("/").pop();

  // 删除二次确认：正在等待确认的会话 id；null = 无
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // 挂载时清理一次超龄空会话（超过 24h 没发过消息的），避免空会话堆积
  useEffect(() => {
    pruneEmptyChats();
  }, []);

  // 进入"确认删除"态后 3 秒内未再次点击，自动取消
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  function handleNew() {
    const chat = createChat();
    router.push(`/chat/${chat.id}`);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation(); // 不触发列表项的跳转
    if (confirmId !== id) {
      setConfirmId(id); // 第一次点击：进入"确认删除"态
      return;
    }
    setConfirmId(null);
    deleteChat(id);
    if (id === currentId) {
      // 删除的是当前会话 → 回首页，由首页自动新建
      router.replace("/");
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* 顶部：新建对话 */}
      <div className="p-3">
        <button
          type="button"
          onClick={handleNew}
          className="w-full rounded-xl border border-dashed border-zinc-300 px-3 py-2.5 text-sm text-zinc-600 transition hover:border-blue-500 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
        >
          + 新建对话
        </button>
      </div>

      {/* 会话列表 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {chats.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
            还没有对话
          </p>
        )}
        {chats.map((chat) => {
          const active = chat.id === currentId;
          return (
            <div
              key={chat.id}
              onClick={() => router.push(`/chat/${chat.id}`)}
              className={`group mb-1 flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              <button
                type="button"
                onClick={(e) => handleDelete(e, chat.id)}
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs transition ${
                  confirmId === chat.id
                    ? "bg-red-600 font-medium text-white"
                    : "text-zinc-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-red-400"
                }`}
                aria-label={`${confirmId === chat.id ? "确认删除" : "删除"} ${chat.title}`}
              >
                {confirmId === chat.id ? "确认" : "✕"}
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
