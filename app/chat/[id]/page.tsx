import ChatPage from "../../components/ChatPage";

/** 会话页：server 组件只取 id，实际聊天逻辑在客户端 ChatPage 里（localStorage 只能在浏览器读） */
export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatPage chatId={id} />;
}
