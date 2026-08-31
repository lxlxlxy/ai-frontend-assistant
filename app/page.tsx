"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getChats, createChat } from "@/lib/storage";

/**
 * 首页：纯跳转入口。
 * 有历史会话 → 进入最近的会话；没有 → 先新建再进入。
 * 保证永远有一个"当前会话"，不会出现空页面。
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const chats = getChats();
    const target = chats[0] ?? createChat();
    router.replace(`/chat/${target.id}`);
  }, [router]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-zinc-50 text-sm text-zinc-400 dark:bg-zinc-950">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-600 dark:border-zinc-800 dark:border-t-blue-500"
        role="status"
        aria-label="加载中"
      />
      正在进入对话…
    </div>
  );
}
