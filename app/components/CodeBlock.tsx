"use client";

import { useState } from "react";
import hljs from "highlight.js";

// 用 highlight.js 把代码转成带语法高亮标签的 HTML
//  - 有明确语言 → 按该语言高亮
//  - 没有 / 不认识 → 自动检测
function highlight(code: string, language?: string) {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language }).value;
  }
  return hljs.highlightAuto(code).value;
}

export default function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 在某些环境不可用（如非 HTTPS），静默失败 */
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-900">
      {/* 顶栏：语言标签 + 复制按钮 */}
      <div className="flex items-center justify-between border-b border-zinc-700/60 px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md px-2 py-0.5 text-xs text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>

      {/* 代码主体 */}
      <pre className="overflow-x-auto p-3 text-[13px] leading-6">
        <code
          className="font-mono text-zinc-100"
          dangerouslySetInnerHTML={{ __html: highlight(code, language) }}
        />
      </pre>
    </div>
  );
}
