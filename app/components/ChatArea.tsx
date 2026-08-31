"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import Markdown from "./Markdown";
import { saveChat, buildTitle, textOf, genId } from "@/lib/storage";
import type { Chat } from "@/lib/storage";

/**
 * 聊天主体：消息列表 + 输入区 + 停止/重新生成/错误重试。
 * 通过 key 强制重挂载来切换会话，因此每个实例只服务一个 chatId。
 */
export default function ChatArea({ initialChat }: { initialChat: Chat }) {
  //   sendMessage({ text }) 发送消息
  //   messages 是 UIMessage[]（每条消息含 parts 数组，文本在 part.type === 'text' 里）
  //   status: 'submitted' | 'streaming' | 'ready' | 'error'
  //   stop() 停止生成（保留已生成内容）、regenerate() 重新生成最后一条 AI 回复
  //   setMessages() 手动改写消息列表（错误重试时移除失败消息）
  // 注意 v6 用 messages 字段传初始历史（v5 是 initialMessages）
  const { messages, sendMessage, status, error, stop, regenerate, setMessages } =
    useChat({
      id: initialChat.id,
      messages: initialChat.messages,
      // 流式结束才落盘（避免流式期间每来一个词写一次 localStorage）
      onFinish: ({ messages: all, isError }) => {
        if (isError) return; // 失败不保存，保留上一次完整状态
        const nextTitle =
          title !== "新对话" ? title : buildTitle(all);
        setTitle(nextTitle);
        saveChat({
          id: initialChat.id,
          title: nextTitle,
          createdAt: initialChat.createdAt,
          messages: all,
        });
      },
    });
  const [input, setInput] = useState("");
  // 顶栏标题：从 storage 恢复后由 onFinish 更新（首次对话生成真实标题）
  const [title, setTitle] = useState(initialChat.title);

  // ---------- 自动滚动：只在"贴底"时跟随新内容 ----------
  const scrollRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 有历史消息的会话停留顶部（避免"贴底跟随"误触发），空会话贴底
  const [stickToBottom, setStickToBottom] = useState(
    () => initialChat.messages.length === 0,
  );

  // 监听滚动容器：距底部 < 100px 视为贴底
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
  }

  useEffect(() => {
    if (stickToBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, stickToBottom]);

  // ---------- 输入框：多行 textarea + 自动增高 ----------
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 根据内容高度自动调整 textarea（最高 160px ≈ 5 行，超出滚动）
  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // 提交后输入被清空，高度也要收缩回一行
  useEffect(() => {
    if (!input) autoResize();
  }, [input]);

  // ---------- 提交 / 快捷键 ----------
  const isGenerating = status === "submitted" || status === "streaming";

  // 最后一条 assistant 消息的 id（只给这条 AI 回复显示"重新生成"）
  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status !== "ready") return;
    setStickToBottom(true); // 主动发送：回到贴底跟随

    // ① 两阶段落盘之"发送即存"：先把 user 消息落盘。
    //    流式中断 / 刷新页面时最多丢半个 AI 回复，不丢用户输入；
    //    完整结果由 onFinish 覆盖写入（见上方 useChat 配置）。
    const userMsg: UIMessage = {
      id: genId(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    const nextMessages = [...messages, userMsg];
    const nextTitle = title !== "新对话" ? title : buildTitle(nextMessages);
    setTitle(nextTitle);
    saveChat({
      id: initialChat.id,
      title: nextTitle,
      createdAt: initialChat.createdAt,
      messages: nextMessages,
    });

    sendMessage({ text });
    setInput("");
  }

  // Enter 发送 / Shift+Enter 换行；中文输入法选词时的 Enter 不拦截
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // ---------- 错误重试 ----------
  // 最后一条消息是 user（请求根本没发出）→ 移除它再重发；
  // 是 assistant（流式中断，已有部分内容）→ 重新生成
  function handleRetry() {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === "assistant") {
      regenerate();
    } else {
      setMessages(messages.slice(0, -1));
      sendMessage({ text: textOf(last) });
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* 顶栏 */}
      <header className="flex items-center justify-center border-b border-zinc-200 bg-white py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="max-w-[70%] truncate text-center text-sm font-semibold tracking-wide text-zinc-800 dark:text-zinc-100">
          {title}
        </h1>
      </header>

      {/* 消息列表 */}
      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
            <p className="py-20 text-center text-sm text-zinc-400 dark:text-zinc-500">
              有什么前端问题想问？
              <br />
              试试 &ldquo;用 React 写一个防抖 Hook&rdquo;
            </p>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="max-w-[80%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm text-white"
              >
                {textOf(m)}
              </div>
            ) : (
              <div key={m.id} className="max-w-[85%] self-start">
                <div className="markdown break-words rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 text-sm leading-6 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                  {/* 流式期间 text 逐段增长 —— 这就是"实时渲染"；Markdown 会随每次增长重新解析 */}
                  {textOf(m) ? (
                    <Markdown content={textOf(m)} />
                  ) : isGenerating ? (
                    <span className="animate-pulse">▍</span>
                  ) : null}
                </div>
                {/* 只有最后一条 AI 回复显示"重新生成"（生成中禁用） */}
                {m.id === lastAssistantId && !isGenerating && (
                  <button
                    type="button"
                    onClick={() => regenerate()}
                    className="mt-1.5 ml-1 rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  >
                    重新生成
                  </button>
                )}
              </div>
            ),
          )}

          {error && (
            // key 绑定错误内容：新错误出现时组件重挂载，"已关闭"状态自动重置
            <ErrorBanner
              key={error.message}
              message={error.message}
              onRetry={handleRetry}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* 输入区 */}
      <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 py-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入你的前端问题…（Enter 发送，Shift+Enter 换行）"
            disabled={isGenerating}
            rows={1}
            className="max-h-40 flex-1 resize-none overflow-y-auto rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm leading-6 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          {isGenerating ? (
            // 生成中：发送按钮变"停止"，点击中断 LLM 流
            <button
              type="button"
              onClick={() => stop()}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500"
            >
              ■ 停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}

/** 错误提示条：内部持有"已关闭"状态，由父级 key 变化（新错误）自动重置 */
function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex items-center gap-3 self-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
      <span>请求失败：{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white transition hover:bg-red-500"
      >
        重试
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-red-400 transition hover:text-red-600"
        aria-label="关闭"
      >
        ✕
      </button>
    </div>
  );
}
