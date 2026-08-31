import { streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";

// 流式接口允许最长运行 120 秒（思考型模型通常需要更长时间）
export const maxDuration = 120;

// useChat 发来的是 UIMessage（每条含 id + parts 数组），
// 而 streamText 需要 ModelMessage（role + content 字符串）。
// 这里提取文本部分，把 parts 转成纯文本，完成格式转换。
type UIMessageLike = {
  role: "system" | "user" | "assistant";
  parts: Array<{ type: string; text?: string }>;
};

export async function POST(req: Request) {
  try {
    // 1. Key 校验：缺失时给出明确提示，而不是裸 500
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        "服务端未配置 OPENAI_API_KEY，请在 .env.local 中设置后重启开发服务。",
        { status: 500 }
      );
    }

    // 2. 前端 useChat 发来的请求体：{ messages: UIMessage[] }
    const { messages } = (await req.json()) as { messages: UIMessageLike[] };

    // 3. 转换格式：UIMessage → ModelMessage
    //    - 丢弃 system 角色（system 提示词在下方单独传）
    //    - 丢弃 reasoning/tool 等非文本 parts，只保留文本拼成 content
    const history = messages
      .filter((m) => m.role !== "system")
      .map(
        (m): ModelMessage => ({
          role: m.role,
          content: m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text ?? "")
            .join(""),
        })
      );

    // 4. streamText：把"对话历史"交给 LLM，返回一个流式生成器
    //    - openai("deepseek-chat")：AI SDK 的 OpenAI 兼容 provider，
    //      自动读取 .env.local 里的 OPENAI_API_KEY 和 OPENAI_BASE_URL
    //    - history：把整段历史传回去，模型才知道上文，实现多轮上下文
    const result = streamText({
      model: openai("deepseek-chat"),
      system:
        "你是一个专业的前端开发助手，精通 React、Next.js、TypeScript。" +
        "回答要简洁，优先给出可运行的代码示例。",
      messages: history,
      // 显式超时：120 秒后中止底层请求，避免请求永远挂起
      abortSignal: AbortSignal.timeout(120_000),
    });

    // 5. 把流式结果转成浏览器可直接消费的流式响应
    //    （Content-Type: text/event-stream，逐块推送）
    return result.toUIMessageStreamResponse();
  } catch (e) {
    // 统一错误出口：把 SDK / provider 的异常转成"纯文本 + 合理状态码"。
    // 用纯文本响应体：AI SDK 的 useChat 在非 2xx 时会把 body 原文作为
    // error.message 展示，JSON 会原样显示成 {"error":...}，不友好。
    const err = e as { statusCode?: number; message?: string; name?: string };
    // 超时中止（AbortSignal.timeout 触发）单独识别为 504，避免误报 500
    if (err.name === "AbortError") {
      return new Response("请求超时，请稍后重试。", { status: 504 });
    }
    const status =
      typeof err.statusCode === "number" &&
      err.statusCode >= 400 &&
      err.statusCode < 600
        ? err.statusCode
        : 500;
    const message =
      status === 401
        ? "API Key 无效或已过期，请检查 .env.local 配置。"
        : status === 402
          ? "API 余额不足，请前往模型平台充值。"
          : status === 429
            ? "请求过于频繁，请稍后再试。"
            : err.message || "服务端异常，请稍后再试。";
    return new Response(message, { status });
  }
}
