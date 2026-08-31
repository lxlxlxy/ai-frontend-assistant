import Sidebar from "../components/Sidebar";

/** /chat/* 的共享布局：左侧固定侧边栏，右侧为聊天主体 */
export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
