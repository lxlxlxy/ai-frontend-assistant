"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 覆盖 code 元素：
        //   className 形如 "language-tsx" → 是代码块，交给 CodeBlock（带高亮 + 复制）
        //   否则是行内代码，渲染成带底色的等宽样式
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          if (match) {
            return (
              <CodeBlock
                language={match[1]}
                code={String(children).replace(/\n$/, "")}
              />
            );
          }
          return (
            <code
              className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-pink-600 dark:bg-zinc-800 dark:text-pink-400"
              {...props}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
