import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 前端助手",
  description: "面向前端开发场景的 AI 智能助手",
};

// 浏览器地址栏 / 任务栏主题色，跟随系统的深浅模式
// （Next.js 14+ 将 themeColor 从 metadata 移到 viewport export）
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
