# AI Frontend Assistant｜AI 前端聊天助手 — 开发方案

> 目标：用最小成本快速速成一个 React + AI 聊天项目，用于面试展示。
> 原则：**先跑通最小闭环，再逐层叠加功能**。任何阶段被打断，都能交付一个可演示的版本。

## 技术栈

- **React** + **Next.js 16** + **TypeScript**（工作区已脚手架）
- **Tailwind CSS v4**（已配置）
- **Vercel AI SDK**（`ai` + `@ai-sdk/react` + `@ai-sdk/openai`）
- **Markdown / 代码高亮**：`react-markdown` + `remark-gfm` + `rehype-highlight`
- **数据持久化**：本地存储 localStorage（通过自研 Storage 抽象层封装，阶段 3 引入）

---

## 如何拿到 API Key

> 核心思路：**选一个 OpenAI 兼容接口的国产大模型**（便宜、国内直连、无需科学上网），成本低到可以忽略（DeepSeek 新用户注册通常有赠送额度）。面试时还能顺带讲：“AI SDK 统一抽象，换模型只改一个 provider 配置。”

以下推荐按优先级排序：

### 方案一：DeepSeek（推荐，性价比最高）

1. 打开 https://platform.deepseek.com 注册账号
2. 进入「API Keys」页面 → 点击「创建 API Key」
3. 复制生成的一串 `sk-...`，**只显示一次，请立即保存**（建议存到 `.env.local`）
4. 进入「充值」页面，充 10~20 元即可用很久（对话类项目消耗极低）
5. 参数配置：
   - `OPENAI_BASE_URL = https://api.deepseek.com/v1`
   - 模型名：`deepseek-chat`（对话）/ `deepseek-reasoner`（推理）

### 方案二：智谱 GLM（国产，有免费额度）

1. 打开 https://open.bigmodel.cn 注册
2. 「API 密钥」页面 → 创建 API Key（格式为 `xxx.xxx`）
3. 新用户通常有赠送 token，足够演示
4. 参数配置：
   - `OPENAI_BASE_URL = https://open.bigmodel.cn/api/paas/v4`
   - 模型名：`glm-4-flash`（免费）/ `glm-4-plus`

### 方案三：阿里通义千问（有免费额度）

1. 打开 https://dashscope.console.aliyun.com 用支付宝/淘宝账号登录
2. 开通「百炼」服务 → 「API-KEY 管理」创建 Key
3. 新用户有免费额度
4. 参数配置：
   - `OPENAI_BASE_URL = https://dashscope.aliyuncs.com/compatible-mode/v1`
   - 模型名：`qwen-plus` / `qwen-turbo`

### 方案四：OpenAI 官方（最贵，不推荐首选用）

1. 打开 https://platform.openai.com 注册（需国外手机号 + 支付方式）
2. 「API Keys」→ 创建 Key
3. 参数配置：
   - `OPENAI_BASE_URL` 不填（默认就是官方地址）
   - 模型名：`gpt-4o-mini`（便宜）或 `gpt-4o`

### 安全提醒

- Key 一律放在 `.env.local`，**不要提交到 git**（`.gitignore` 已默认忽略）
- 所有 LLM 调用都在服务端 Route Handler 里做，Key 永不暴露给浏览器
- 面试时主动讲这一点：客户端拿不到 Key，请求由服务端代理转发

---

## 阶段 1：最小闭环 —— “输入 → Streaming → 实时渲染”（✅ 已完成）

> 本阶段代码已在项目里跑通并实测通过（流式逐词推送、多轮上下文均验证成功）。下面只贴关键代码，完整实现见对应文件链接。

### 1.1 安装依赖

```bash
npm i ai @ai-sdk/react @ai-sdk/openai
```

> ⚠️ 版本注意：本项目安装的是 **AI SDK v6**（`ai@6`），API 与网上大量 v5 教程完全不同，见下文「1.5.6 两个坑」。`react-markdown` 等留到阶段 2 再装。

### 1.2 创建 `.env.local`

```env
OPENAI_API_KEY=sk-你的key
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

模型名 `deepseek-chat` 写死在 `route.ts` 的 `openai('deepseek-chat')` 里，不放在 env。（本项目已配置 DeepSeek key。）

### 1.3 服务端：`app/api/chat/route.ts`

完整代码：[app/api/chat/route.ts](app/api/chat/route.ts)。核心就 3 步：

```ts
import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 60;

export async function POST(req: Request) {
  // ① 前端 useChat 发来 { messages: UIMessage[] }
  const { messages } = await req.json();

  // ② 格式转换：UIMessage({ role, parts[] }) → ModelMessage({ role, content })
  //    只保留 parts 里的文本段，拼成纯文本 content（为什么转见 1.5.6）
  const history = messages
    .filter((m: any) => m.role !== 'system')
    .map(
      (m: any): ModelMessage => ({
        role: m.role,
        content: m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text ?? '').join(''),
      })
    );

  // ③ streamText 发起 LLM 调用，返回流式生成器
  const result = streamText({
    model: openai('deepseek-chat'),      // 自动读 .env.local 的 Key / BaseURL
    system: '你是一个专业的前端开发助手……',
    messages: history,                    // 整段历史传回，模型才知道上文
  });

  return result.toUIMessageStreamResponse(); // ④ 转成 SSE 流式 Response
}
```

### 1.4 客户端：`app/page.tsx`

完整代码：[app/page.tsx](app/page.tsx)。核心只有 2 行：

```tsx
'use client';
const { messages, sendMessage, status, error } = useChat();
// status: 'submitted'（已提交）→ 'streaming'（正在流）→ 'ready'（完成）→ 'error'（出错）
```

- `sendMessage({ text })`：发消息，内部自动 POST `/api/chat`、解析 SSE、增量更新 `messages`
- `messages`：消息列表，流式期间最后一条会不断"变长"，React 重渲染 → 屏幕上文字"长"出来
- v6 不再提供 `input / handleSubmit / isLoading`：输入框用 `useState` 自管，loading 用 `status` 判断

### 1.5 原理讲解（面试必讲）

#### 1.5.1 整体链路

```
浏览器 (React)                  Next.js 服务端                  DeepSeek
┌─────────────┐    POST /api/chat    ┌──────────────┐   HTTP    ┌──────────┐
│  useChat()  │ ──── { messages } ──→ │  route.ts    │ ────────→ │   LLM    │
│  messages   │ ←── text/event-stream │  streamText  │ ←──────── │  流式    │
│  实时增长    │ ──── 逐块推送SSE ─────│   转成 Response │   token  │  生成    │
└─────────────┘                       └──────────────┘          └──────────┘
```
浏览器 → Next.js ：负责把用户的问题和历史消息交给服务端。
Next.js → DeepSeek： 负责真正调用大模型。
然后响应方向反过来。
如果直接调用就可能会泄露apikey，因此需要额外经过一个next.js服务端。
关键点：**整条链路不是"等 AI 说完再显示"，而是 AI 每吐出一个词就立刻推给浏览器**。

> 关键链路：前端基于 AI SDK 的 useChat 管理消息状态并发起请求，Next.js Route Handler 接收消息历史后通过 streamText 调用 OpenAI-compatible 模型，模型生成的增量结果经过 UI Message Stream 以 SSE 形式返回，useChat 持续消费并更新 messages，最终通过 React 状态更新实现 AI 回复的实时流式渲染。

#### 1.5.2 Streaming 的本质：SSE

LLM 是"逐词产出"的，为了不让人干等十几秒，服务端把响应包装成 **SSE（Server-Sent Events）**——一种基于 HTTP 的长连接流式协议。连接一旦建立，服务器可**持续不断地往同一个连接里写数据**，浏览器边收边渲染。本项目实测抓到的真实响应：

```
data: {"type":"start"}                        ← 流开始
data: {"type":"text-start","id":"xxx"}        ← 新文本块
data: {"type":"text-delta","delta":"Hi"}      ← 第 1 个词
data: {"type":"text-delta","delta":"!"}       ← 第 2 个词
data: {"type":"text-delta","delta":" How"}    ← 第 3 个词
...
data: {"type":"finish","finishReason":"stop"} ← 结束
data: [DONE]
```

> 面试话术：这是 AI 应用和普通 API 的本质区别——普通 API 是"一次请求，一次完整返回"；流式接口是"一次请求，长连接，数据分批到达"。

#### 1.5.3 服务端 `route.ts` 只做 3 件事

1. **收消息**：前端把整段对话历史 POST 过来
2. **`streamText()` 发起 LLM 调用**：`openai("deepseek-chat")` 是 AI SDK 的 OpenAI 兼容 provider，自动读 `.env.local` 的 Key 和 BaseURL，把请求发到 DeepSeek
3. **`toUIMessageStreamResponse()`**：把 DeepSeek 返回的 token 流转成浏览器能解析的 SSE 格式（协议转换由 SDK 封装，不用手写）
```
streamText()
    │
    ├── ① 找到模型 Provider
    │
    ├── ② 读取 API Key
    │
    ├── ③ 读取 Base URL
    │
    ├── ④ 组织请求参数
    │
    ├── ⑤ 请求 DeepSeek
    │
    └── ⑥ 获取 Streaming Response
```
#### 1.5.4 客户端 `useChat()` 封装了整条消费链路

```
sendMessage({ text })  → ① 把用户消息 push 进 messages
                       → ② 发起 POST /api/chat（携带全部历史）
                       → ③ 拿到 SSE 流，边收边解析
                       → ④ 每收到一个 text-delta，就往对应消息追加文字
messages 更新 → React 重渲染 → 屏幕上文字"长"出来
```

页面代码**没有写任何 fetch、没有解析 SSE、没有管理流状态**——全在 `useChat` 内部完成，它只暴露 `messages / sendMessage / status / stop / regenerate / error`。

#### 1.5.5 多轮上下文的原理

模型是"无记忆"的，它只能根据你这次给它的**全部文字**回答。所以前端每次发消息都把整段历史传回服务端，服务端原样拼给 DeepSeek。本项目实测：告诉它 "I am a cat"，再问 "What animal am I?"，它正确回答 "You are a cat."——证明历史消息完整生效。

#### 1.5.6 两个坑（面试加分点）

**坑 1：AI SDK v6 是全新 API。** 网上绝大多数教程是 v5 的 `input / handleInputChange / handleSubmit / isLoading` 写法，v6 全改成了 `sendMessage({ text })` + `status`，输入框也要自己用 `useState` 管。装包时注意 `ai@6` 与旧教程不通用。

**坑 2：`UIMessage` 和 `ModelMessage` 是两种格式。** `useChat` 发来的是 UI 消息（`{ role, parts[] }`），而 `streamText` 需要的是模型消息（`{ role, content }`）。直接透传**能过 TypeScript 类型检查，但运行时会被 AI SDK 的 schema 校验拦截**（本项目实测踩到 500）。所以 `route.ts` 里显式做了一次转换：提取 `parts` 里的文本拼成 `content`。

#### 1.5.7 面试问答速记

| 问题 | 怎么答 |
|------|--------|
| Streaming 怎么实现？ | 服务端 `streamText` 返回 SSE 流（`text/event-stream`），前端 `useChat` 逐块消费增量渲染 |
| 为什么选 AI SDK？ | 封装了流式传输、abort、错误处理、消息状态管理，避免手写 fetch + SSE 解析 |
| Key 安全怎么保证？ | 调用全部在服务端 Route Handler，浏览器永远拿不到 Key |
| 换模型怎么办？ | 只改 `route.ts` 的 model + `.env.local` 的 BASE_URL，组件零改动 |

### 1.6 验收标准（本项目已实测通过）

- [x] 输入问题 → 内容逐字流式出现（`text-delta` 逐词推送）
- [x] 结束后可继续追问，多轮上下文自动携带
- [x] 流式期间输入框禁用 / 按钮显示 loading
- [x] DevTools → Network 可见响应为 `text/event-stream` 分块推送

---

## 阶段 2：对话体验完善

在闭环基础上加入接近 ChatGPT 的交互。

### 2.1 安装依赖

```bash
npm i react-markdown remark-gfm rehype-highlight
```

### 2.2 Markdown + 代码高亮

AI 回答不再用 `<pre>` 裸文本，改为 Markdown 渲染：

```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
  {message.content}
</ReactMarkdown>
```

### 2.3 代码块复制按钮

写一个 `CodeBlock` 组件包住 `<pre>`：

- 监听 `<pre>` 的子节点渲染，右上角显示「复制」按钮
- 点击后用 `navigator.clipboard.writeText(code)` 复制
- 复制成功后按钮文案短暂变为「已复制」

### 2.4 完整交互清单

| 功能 | 实现方式 |
|------|----------|
| 停止生成 | `useChat` 返回的 `stop()`，配合 abort |
| 重新生成 | `regenerate()`，重新请求最后一条 user 消息 |
| 自动滚到底部 | 监听 `messages` 变化，`scrollIntoView` 到容器底部 |
| Enter 发送 / Shift+Enter 换行 | `onKeyDown` 拦截 |
| 空输入禁用 | `disabled={!input.trim() \|\| isLoading}` |
| Loading 光标 | `isLoading` 时在末尾渲染闪烁的 `▍` |
| 错误重试 | `error` 状态展示提示条 + 重试按钮 |
| 气泡样式 | user 右对齐蓝底 / assistant 左对齐白底，圆角卡片 |

### 2.5 验收标准

整体观感接近 ChatGPT 简化版：代码有高亮、可复制、可停止、可重生成，交互顺滑无报错。
多行输入框：Enter 发送 / Shift+Enter 换行 / 自动增高。
另外，e.nativeEvent.isComposing——中文输入法下按 Enter 是"选词确认"，不是发送意图。不加这个判断，用户打中文时一按 Enter 就误发送，是新手最容易踩的坑。
智能滚动到底部：用 100px 阈值判断用户是否在底部，避免强制滚动打断阅读——这是 ChatGPT 等产品都有的交互细节。
错误重试：重试分两种情况：assistant 消息存在说明流中断，用 regenerate 重新生成；只有 user 消息说明请求压根没发出去，用 setMessages 先移除失败消息再重发，避免界面出现重复气泡。

---

## 阶段 3：多会话管理（动态路由 + localStorage）（✅ 已完成）

> 本阶段代码已全部跑通：`npm run build` 构建通过（路由表 `/`、`/chat/[id]`、`/api/chat` 正常）、`npm run lint` 0 错误 0 警告。下面只贴关键代码，完整实现见对应文件链接。

### 3.0 目标与文件清单

改造前是"单页单会话"：消息只存在 React 内存里，刷新即丢。本阶段引入会话概念，用 localStorage 持久化，支持新建 / 切换 / 删除。

| 文件 | 动作 | 职责 |
|------|------|------|
| [lib/storage.ts](lib/storage.ts) | 🆕 | 存储抽象层：所有数据落地的唯一出口 |
| [app/chat/[id]/page.tsx](app/chat/[id]/page.tsx) | 🆕 | 动态路由会话页（server 组件，只取 id） |
| [app/components/ChatPage.tsx](app/components/ChatPage.tsx) | 🆕 | 会话加载入口（客户端，订阅外部存储） |
| [app/components/ChatArea.tsx](app/components/ChatArea.tsx) | 🆕 | 原 `page.tsx` 聊天主体整体迁入 + 持久化改造 |
| [app/components/Sidebar.tsx](app/components/Sidebar.tsx) | 🆕 | 侧边栏：新建 / 列表 / 删除 |
| [app/chat/layout.tsx](app/chat/layout.tsx) | 🆕 | `/chat/*` 共享布局（左栏 + 右聊天区） |
| [app/page.tsx](app/page.tsx) | ✏️ | 首页改为自动跳转入口 |

### 3.1 数据结构与存储抽象层

完整代码：[lib/storage.ts](lib/storage.ts)。核心是 `Chat` 类型 + 一组纯函数：

```ts
export type Chat = {
  id: string;         // crypto.randomUUID() 全局唯一
  title: string;      // 第一条用户消息前 20 字（buildTitle 生成）
  createdAt: number;  // 时间戳，用于列表倒序排序
  messages: UIMessage[]; // 直接复用 useChat 的消息格式，零转换
};
```

对外只暴露 5 个函数，组件完全不知道底层是 localStorage：

```ts
getChats(): Chat[]        // 全部会话（倒序），供侧边栏
getChat(id): Chat | null  // 单个会话，进会话时加载历史
saveChat(chat): void      // 覆盖写入（有则更新、无则追加）
deleteChat(id): void      // 删除
createChat(): Chat        // 生成 uuid 建空会话并落盘
```

**抽象层的意义（面试点）**：`localStorage`、存储 key、JSON 序列化全部封死在 `storage.ts` 内部。将来接数据库，只改这个文件内部实现，Sidebar / ChatArea 一行不用动——这就是简历上"可插拔接口，可无缝扩展为服务端数据库"的实体。

**层内两个附加设计**（不是纯 CRUD，它们服务 React 集成）：

① **发布订阅**：每次写操作 `version++` 并通知所有订阅者，让侧边栏在聊天保存后自动刷新，无需手动同步。

```ts
let version = 0;
const listeners = new Set<() => void>();
export function subscribeChats(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

② **缓存快照**：`getChatSnapshot(id)` / `getChatsSnapshot()` 在版本不变时返回**同一份引用**。这是配合 `useSyncExternalStore` 的必要条件——React 要求 `getSnapshot` 数据没变时返回同一引用，否则无限重渲染。

### 3.2 路由设计

- `/` → 自动跳转入口（client 组件）：
  ```ts
  const target = chats[0] ?? createChat(); // 有则进最近的，没有先新建
  router.replace(`/chat/${target.id}`);    // replace 而非 push：返回键不会退回空首页
  ```
- `/chat/[id]` → server 组件，只把 id 传给客户端（localStorage 在服务器上不存在，读取必须交给 client）：
  ```tsx
  // app/chat/[id]/page.tsx —— 注意 Next 16 的 params 是 Promise，要 await
  const { id } = await params;
  return <ChatPage chatId={id} />;
  ```

### 3.3 会话加载：`ChatPage` + `useSyncExternalStore`

完整代码：[app/components/ChatPage.tsx](app/components/ChatPage.tsx)。

```tsx
const chat = useSyncExternalStore<Chat | null | undefined>(
  subscribeChats,                 // 订阅：数据一变 React 自动重读
  () => getChatSnapshot(chatId),  // 浏览器端 snapshot
  () => undefined,                // server snapshot：SSR 首帧显示"加载中"
);
```

三种状态映射三种 UI：

| 值 | 含义 | 渲染 |
|----|------|------|
| `undefined` | 尚未挂载（SSR） | 加载中… |
| `null` | 会话不存在 / 已删除 | "会话不存在" + 新建按钮 |
| `Chat` | 正常 | `<ChatArea key={chat.id} initialChat={chat} />` |

**`useSyncExternalStore` 原理（面试点）**：React 官方提供的"订阅外部数据源"API，localStorage 就是外部数据源。三个参数分别是 订阅函数 / 读快照 / 服务端快照。数据变化时 React 自动触发重渲染——**不需要 `useEffect`、不需要手动 `setState`**。这比"useEffect 里读一次"更符合 React 数据流，也能天然跨组件同步。

**`key={chat.id}` 是切换会话的关键**：key 一变，整个 `ChatArea` 卸载重建，`useChat` 重新初始化、滚动容器重挂、输入框清空——所有状态归零，天然实现"切会话"。

### 3.4 聊天主体改造：`ChatArea`

完整代码：[app/components/ChatArea.tsx](app/components/ChatArea.tsx)。在原聊天 UI（停止 / 重新生成 / 错误重试 / 智能滚动）基础上，加 4 处改造：

**① v6 用 `messages` 字段注入历史**（v5 是 `initialMessages`，v6 已改名，网上 v5 教程会踩坑）：

```tsx
useChat({
  id: initialChat.id,             // 每个会话一个独立实例，避免默认 id 串会话
  messages: initialChat.messages, // ⚠️ v6 的字段名
  onFinish: ({ messages: all, isError }) => { ... },
});
```

**② `onFinish` 落盘**——保存时机为什么选这里：

```tsx
onFinish: ({ messages: all, isError }) => {
  if (isError) return;                       // 失败不保存
  const nextTitle = title !== "新对话" ? title : buildTitle(all);
  setTitle(nextTitle);                       // 顶栏标题
  saveChat({ id, title: nextTitle, createdAt, messages: all }); // 一次写整条会话
},
```

- **性能**：流式期间每来一个词写一次 localStorage = 高频序列化，卡顿；`onFinish` 一次写完整结果
- **完整性**：`isError` 时跳过，磁盘上永远是"上一次完整对话"，不会存进半个 AI 回复
- **联动**：`saveChat` → 版本号 +1 → 侧边栏通过订阅自动重读，标题立刻更新

**③ 滚动复位**——切换会话的"坑"：

```tsx
// 初始值由"该会话是否有历史"决定：有历史 → 停顶部；空会话 → 贴底
const [stickToBottom, setStickToBottom] = useState(
  () => initialChat.messages.length === 0,
);
```

如果初始固定 `true`，切换回旧会话时"贴底跟随"的 effect 会把滚动瞬间拉到底部，打断阅读。由历史决定初始值 + `key` 重挂载，两者配合解决。

**④ 错误条用 `key` 重置状态**：`set-state-in-effect`（React 19 新 lint 规则）禁止在 effect 里同步 setState，改为把错误条拆成 `ErrorBanner` 子组件，`key={error.message}`——新错误出现 → key 变 → 组件重挂载 → "已关闭"状态自动归零。**用 key 重置比 useEffect 更符合 React 哲学**。

### 3.5 侧边栏 `Sidebar`

完整代码：[app/components/Sidebar.tsx](app/components/Sidebar.tsx)。

```tsx
const chats = useSyncExternalStore(subscribeChats, getChatsSnapshot, () => []);
const currentId = usePathname()?.split("/").pop(); // 当前会话高亮
```

- 同样订阅外部存储：**ChatArea 一保存，侧边栏自动更新**，零手动刷新
- 新建：`createChat()` → `router.push(/chat/新id)`
- 删除：删当前会话 → `router.replace("/")` 回首页自动新建；删其他会话 → 留在当前页

### 3.6 数据流全景

```
用户发消息 → sendMessage → POST /api/chat → streamText → DeepSeek
    ↓                                            ↑
messages 实时增长（流式渲染） ←────────── SSE text-delta
    ↓
onFinish（流结束）→ saveChat → localStorage
    ↓
bumpVersion() 通知订阅者 → Sidebar 自动重读列表
```

### 3.7 验收标准（✅ 已实测）

- [x] 多个会话互不干扰，各自保留独立上下文
- [x] 刷新页面数据不丢（历史从 localStorage 恢复）
- [x] 新建 / 切换 / 删除会话，侧边栏实时联动
- [x] 切回旧会话滚动停在顶部，不被"贴底跟随"误拉到底
- [x] 删除当前会话后自动回到新建的空白会话

> 面试要点：
> 1. **持久化抽象成接口**：组件只依赖函数签名，不知道底层是 localStorage 还是数据库——接数据库只换 `storage.ts` 内部实现，组件零改动。这就是"可维护性与扩展性"
> 2. **`useSyncExternalStore` 订阅外部数据源**：localStorage 也是 store；配合版本号 + 缓存快照实现跨组件同步，避免 `useEffect + setState` 的过时模式
> 3. **`onFinish` 落盘时机**：流式结束一次性写入，兼顾性能与数据完整性（失败不落盘）
> 4. **`key` 强制重挂载**：切换会话时让 `useChat` 重新初始化、滚动/输入状态归零，比手动 `setMessages` 干净
> 5. **AI SDK v6 陷阱**：`useChat` 的历史注入字段是 `messages` 不是 `initialMessages`；`params` 在 Next 16 是 Promise 需 `await`

---

## 阶段 4（可选加分项）：本地存储增强 / 接入数据库

> 说明：主线方案已用 localStorage 完成全部持久化需求，本阶段仅在面试时间富余时做：
> - **不想碰数据库** → 方向 A：localStorage 扩容到 IndexedDB
> - **想对标原项目亮点** → 方向 B：PostgreSQL + Drizzle

### 方向 A：localStorage 扩容（5MB → IndexedDB）

localStorage 上限约 5MB，长对话 + 大量代码块可能逼近。用 `localforage` 一行替换，底层自动用 IndexedDB（容量可达数百 MB），`getItem / setItem` API 完全一致，`storage.ts` 内部只需改两行调用。

### 方向 B 实现：安装与配置

```bash
npm i drizzle-orm postgres
npm i -D drizzle-kit
```

数据库选型（面试演示够用）：

- 本地：安装 PostgreSQL（或 Docker 起一个）
- 云端：Neon（https://neon.tech，免费额度）或 Vercel Postgres

`.env.local` 追加：

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

`drizzle.config.ts`：

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### 4.2 表结构：`src/db/schema.ts`

```ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const chats = pgTable('chats', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull().default('新对话'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  chatId: uuid('chat_id').references(() => chats.id, { onDelete: 'cascade' }).notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

生成并执行建表语句：

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 4.3 服务端接口（全部走 Route Handler 或 Server Actions）

| 接口 | 说明 |
|------|------|
| `POST /api/chats` | 创建会话，返回新会话 id |
| `GET /api/chats` | 会话列表（只取 id/title，不取消息） |
| `GET /api/chats/[id]` | 会话详情 + 全部历史消息 |
| `DELETE /api/chats/[id]` | 删除会话（外键级联删消息） |
| `POST /api/chats/[id]/messages` | 追加消息 |

### 4.4 流式消息落库流程

1. 用户发送 → 先存一条 user 消息
2. 服务端流式生成 → 前端实时渲染
3. **流式结束后**把完整 assistant 回答追加落库
4. user + assistant 两条消息用数据库事务保证成对写入

### 4.5 验收标准

- 重启服务 / 换浏览器，历史会话和消息依然存在
- 删除会话，数据库里该会话的消息同步删除（级联）
- 再次进入会话，历史消息完整加载且多轮上下文正常

> 面试要点：
> 1. Drizzle schema-first + 类型安全，迁移用 drizzle-kit 管理
> 2. 事务保证消息成对写入，避免流式中断导致只有 user 没有 assistant
> 3. 阶段 3 的 `storage.ts` 抽象在这里体现价值：只改内部实现，不动 UI 组件

---

## 阶段 5：打磨与加分项（可选）

按“性价比”排序，时间富余再上：

1. **会话标题自动生成**：取第一条消息前 20 字，截断加 `...`
2. **空会话自动创建**：首页判断无会话时自动新建并跳转，保证永远有当前会话
3. **Token 用量 / 响应耗时**：`useChat` 的 metadata 或服务端返回统计信息
4. **深色模式**：Tailwind `dark:` 类 + `prefers-color-scheme`，记住用户选择
5. **移动端适配**：侧边栏在手机上变成抽屉式
6. **部署到 Vercel**：无数据库依赖，`vercel deploy` 一键上线（localStorage 数据在用户浏览器端，演示不受影响）
7. **README 与架构图**：画一张请求链路图（浏览器 → Route Handler → LLM → 流式返回 → 增量渲染），面试时直接指图讲解

---

## 阶段 6（完善清单）：阶段 1~3 代码走查后的待办项

> 来源：对阶段 1~3 全部代码（`route.ts` / `storage.ts` / 四个组件 / 布局）走查后的完善项。按「优先级 × 面试价值」排序，改动量都不大，可穿插在任何阶段完成后推进。

### 6.1 数据健壮性 ✅（已完成）

#### 6.1.1 发送即落盘，避免刷新丢消息 ✅

实现（两阶段落盘）：
- `handleSubmit` 里先手动构造 user 消息（`UIMessage`）并 `saveChat` 落盘，再 `sendMessage`
- 落盘时同步用 `buildTitle` 更新标题（顺带实现了 6.2 的"流式标题"）
- `onFinish` 仍以完整消息覆盖写入 → 最多丢半个 AI 回复，不丢用户输入

涉及：`app/components/ChatArea.tsx`、`lib/storage.ts`

#### 6.1.2 API 路由错误处理 + Key 校验 ✅

实现：
- `POST` 外包 `try/catch`，`streamText` 前校验 `OPENAI_API_KEY` 是否存在
- 错误统一转成"纯文本响应体 + 合理状态码"（401 → Key 失效、402 → 余额不足、429 → 限流，其余 500）

> ⚠️ 关键细节：**必须用纯文本而非 `Response.json`**。AI SDK v6 的 `useChat` 在非 2xx 时把 `response.text()` 原文作为 `error.message`，JSON 会被原样显示成 `{"error":...}`。

涉及：`app/api/chat/route.ts`

#### 6.1.3 跨标签页同步 ✅

实现：`storage.ts` 模块顶层（浏览器环境）监听原生 `storage` 事件，key 匹配则 `bumpVersion()`

```ts
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) bumpVersion();
  });
}
```

浏览器原生跨标签同步 + 自定义同页同步，两边都覆盖。面试谈资："外部数据源的 API 边界处理"。

涉及：`lib/storage.ts`

#### 6.1.4 空会话清理 + 删除确认 ✅

实现：
- `storage.ts` 新增 `pruneEmptyChats()`：清理超过 24h 且无消息的会话，无变化时不触发写盘/广播
- `Sidebar` 挂载时调用一次 `pruneEmptyChats()`（`/chat/*` 布局常驻，天然覆盖所有页面）
- 删除按钮二次确认：第一次点击进入红色"确认"态，3 秒未再点自动取消

涉及：`app/components/Sidebar.tsx`、`lib/storage.ts`

### 6.2 体验打磨（与阶段 5 部分重叠，UI 效果直观）

| 功能 | 现状 | 完善方向 | 面试价值 |
|------|------|---------|---------|
| 深色模式 | 只有跟随系统的 `dark:` 类 | 顶部切换按钮 + `localStorage` 记住选择 | 高（UI 立竿见影） |
| 移动端 | 侧边栏固定 256px，手机不可用 | `< 768px` 时抽屉式滑出 + 遮罩 | 中（响应式经验） |
| 流式标题 | 首条消息发出后标题仍为"新对话" | 发送时即用 `buildTitle` 更新 | 低（细节感） |
| 会话重命名 | 不支持 | 双击标题进入编辑 | 中（常见产品功能） |
| 复制 Markdown | CodeBlock 只支持复制纯代码 | 增加"复制 Markdown"按钮 | 低 |

### 6.3 架构扩展（与阶段 4 方向 A 呼应）

#### 6.3.1 localStorage → IndexedDB

痛点：5MB 上限 + 每次全量 `JSON.stringify` 整个 chats 数组。长对话 + 代码块逼近上限，且数据越大写入越卡。

方案：`localforage` 替换 `loadChats` / `saveChats` 内部两行（API 相同），容量提升到数百 MB。**正好实证 storage 抽象层的价值**——换底层存储，组件零改动。

涉及：`lib/storage.ts`

#### 6.3.2 列表渲染优化

现状：每次 `bumpVersion` 触发 Sidebar 全量 `map` 重渲染。会话多时：列表项抽 `ChatItem` + `React.memo`，或 `useDeferredValue` 降级。（会话少时收益不大，属于"性能意识"展示。）

涉及：`app/components/Sidebar.tsx`

### 6.4 小缺陷扫尾 ✅（已完成）

| 位置 | 问题 | 修复 |
|------|------|------|
| `app/page.tsx` | `useEffect` 跳转闪一帧"正在进入对话…" | loading 态加旋转 spinner（`animate-spin` + 无障碍 `role="status"`）。localStorage 只能在 client 读，跳转时机无法前移，但视觉不再单调 |
| `lib/storage.ts` | `crypto.randomUUID()` 需 HTTPS / secure context | 新增导出 `genId()`：secure context 用 `randomUUID`，否则降级 `时间戳36进制 + Math.random`，`createChat` 与 `ChatArea` 统一使用 |
| `app/api/chat/route.ts` | `maxDuration = 60` 对思考模型可能不够 | `maxDuration = 120`；`streamText` 加 `abortSignal: AbortSignal.timeout(120_000)` 显式超时；catch 中 `AbortError` 单独映射 504"请求超时" |
| `app/layout.tsx` | 全局 `<html>` 缺 metadata 补充 | 新增 `viewport` export（Next 14+ 规范）：`themeColor` 跟随系统深浅色；新增 `app/icon.svg`（Next 约定自动作为 favicon） |

### 6.5 建议推进顺序

```
1. 发送即落盘（数据安全）        ← 半天，最值得
2. API 错误处理 + Key 校验        ← 半天，面试不怕翻车
3. 跨标签页同步                  ← 10 行
4. 深色模式切换                  ← 半天，效果最直观
5. 移动端抽屉 / 删除确认          ← 可选
6. IndexedDB 迁移（阶段4方向A）    ← 面试加分的收尾动作
```

---

## 优先级总览

| 阶段 | 内容 | 面试权重 |
|------|------|----------|
| 0 | 环境 + API Key | 必须（能讲清 Streaming 原理） |
| 1 | 最小闭环：输入 → 流式 → 渲染 | 必须讲透 |
| 2 | Markdown / 代码高亮 / 交互细节 | 高 |
| 3 | 多会话 + 动态路由 + 本地存储持久化 | 高 |
| 4 | 可选：存储增强（IndexedDB / 数据库） | 加分 |
| 5 | 打磨 / 部署 / 文档 | 加分 |
| 6 | 代码审查完善（数据健壮性 → 体验 → 架构扩展） | 加分 |

## 关键建议

1. **阶段 1 没跑通之前，不要碰 Markdown 和多会话**——保证每天结束时都有一版能演示的产物。
2. 每次换模型只需改 `route.ts` 里的 `model` 和 `.env.local` 的 `BASE_URL`，组件零改动——面试时演示这一点很有说服力。
3. API Key 放 `.env.local` 且永远不进 git；遇到 401/402 报错时先检查 Key 是否失效或余额不足。
4. 面试话术主线：**Streaming 链路 → 交互体验 → 会话状态 → 本地数据持久化**，正好对应阶段 1→3 的演进过程；结合 storage 抽象层，随时可以讲"将来如何扩展成数据库"。
