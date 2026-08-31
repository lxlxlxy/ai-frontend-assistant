"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getChatSnapshot, subscribeChats } from "@/lib/storage";
import type { Chat } from "@/lib/storage";
import ChatArea from "./ChatArea";

/**
 * 会话页的客户端入口：
 * localStorage 只能在浏览器访问，用 useSyncExternalStore 订阅存储版本。
 * undefined = 尚未挂载（SSR/首帧）；null = 会话不存在；否则为已加载的会话。
 */
export default function ChatPage({ chatId }: { chatId: string }) {
  const router = useRouter();
  const chat = useSyncExternalStore<Chat | null | undefined>(
    subscribeChats,
    () => getChatSnapshot(chatId),
    () => undefined, // server snapshot：SSR 时显示加载中，避免访问 window
  );

  if (chat === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400 dark:bg-zinc-950">
        加载中…
      </div>
    );
  }

  if (chat === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-50 text-sm text-zinc-400 dark:bg-zinc-950">
        <p>会话不存在或已被删除</p>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          新建对话
        </button>
      </div>
    );
  }

  return <ChatArea key={chat.id} initialChat={chat} />;
}
