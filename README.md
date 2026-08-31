# AI 前端助手

一个面向前端开发场景的 AI 对话应用：基于 **Next.js App Router + AI SDK v6**，支持流式回复、Markdown 渲染、代码高亮与**多会话管理**（本地持久化，无需后端数据库）。

> 本项目从零手写，未使用任何现成 UI 库（无 shadcn/ui、无组件库），全部基于 Tailwind CSS 定制。

## ✨ 功能特性

- **流式对话**：基于 AI SDK v6 `streamText`，逐字流式输出，体验接近 ChatGPT
- **Markdown 渲染**：支持 GFM（表格、任务列表）+ 代码高亮（highlight.js）+ 一键复制
- **多会话管理**：侧边栏新建 / 切换 / 删除（二次确认），互不干扰
- **本地持久化**：会话数据存入 `localStorage`，刷新不丢失
- **发送即落盘**：两阶段保存策略，流式中断也不丢用户输入
- **跨标签页同步**：多个标签页打开时，任一侧修改自动同步到其他标签页
- **健壮的错误处理**：API Key 失效 / 余额不足 / 限流 / 超时均有友好提示
- **深浅色模式**：跟随系统，含移动端适配（响应式布局）

## 🛠 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | Next.js 16（App Router）、React 19 |
| AI | AI SDK v6（`ai` + `@ai-sdk/react` + `@ai-sdk/openai`，OpenAI 兼容协议接入 DeepSeek） |
| 样式 | Tailwind CSS 4 |
| Markdown | react-markdown + remark-gfm + rehype-highlight + highlight.js |
| 语言 | TypeScript |

## 📁 项目结构

```
ai-frontend-assistant/
├── app/
│   ├── api/chat/route.ts        # LLM 流式接口（Route Handler）
│   ├── chat/
│   │   ├── [id]/page.tsx        # 动态路由（server，解析 params）
│   │   └── layout.tsx           # /chat/* 布局（Sidebar + 聊天区）
│   ├── components/
│   │   ├── ChatPage.tsx         # 会话页入口（useSyncExternalStore 三态）
│   │   ├── ChatArea.tsx         # 聊天主体（发送 / 流式 / 落盘）
│   │   ├── Sidebar.tsx          # 侧边栏（会话列表 / 新建 / 删除）
│   │   ├── Markdown.tsx         # Markdown + 代码高亮渲染
│   │   └── CodeBlock.tsx        # 代码块 + 复制按钮
│   ├── layout.tsx               # 根布局（metadata / themeColor / favicon）
│   ├── page.tsx                 # 首页（自动进入最近会话 / 新建）
│   └── globals.css
├── lib/
│   └── storage.ts               # 存储抽象层（核心：发布订阅 + 快照缓存）
├── .env.local                   # 环境变量（已 gitignore，不会上传）
└── PLAN.md                      # 开发计划与阶段记录
```

## 🚀 快速开始

### 1. 克隆并安装

```bash
git clone <your-repo-url>
cd ai-frontend-assistant
npm install
```

### 2. 配置环境变量

创建 `.env.local`（参考 `.env.local.example`）：

```bash
# 必填：API Key（OpenAI 兼容协议）
OPENAI_API_KEY=sk-xxxx

# 可选：自定义 Base URL（默认 https://api.openai.com/v1）
# 接入 DeepSeek 时用：https://api.deepseek.com/v1
# OPENAI_BASE_URL=https://api.deepseek.com/v1
```

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

### 常用脚本

```bash
npm run dev     # 开发模式
npm run build   # 生产构建
npm run start   # 启动生产服务器
npm run lint    # ESLint 检查
```

## 🧠 设计亮点

**为什么数据层值得关注**：本项目没有用任何全局状态库（Redux / Zustand），而是围绕一个约 200 行的 `lib/storage.ts` 构建了完整的数据流：

1. **存储抽象层**：所有组件只依赖 `storage.ts` 暴露的 7 个函数（`getChats` / `saveChat` / `createChat` / `subscribeChats` 等），不直接碰 `localStorage`。将来迁移到 IndexedDB 或服务端数据库，只需修改该文件内部，组件零改动。

2. **发布订阅 + `useSyncExternalStore`**：自定义的发布订阅机制（版本号 `version` + 监听器 `Set`）替代了不可靠的原生 `storage` 事件（同页内修改不触发），并通过 `useSyncExternalStore` 与 React 桥接——任何写操作都会自动触发所有订阅组件重渲染，无需手动刷新。

3. **版本号 + 快照缓存**：`getSnapshot` 在版本号不变时返回同一引用，满足 React 对快照稳定性的硬性要求，避免无限重渲染循环（这也是 `useSyncExternalStore` 最常见的坑）。

4. **两阶段落盘**：发送消息时立即保存 user 输入，AI 回复完成后覆盖为完整记录——刷新页面最多丢半个回复，绝不丢用户输入。

5. **`key` 强制重挂载**：切换会话时通过 `key={chat.id}` 让聊天组件彻底重置状态（输入框、滚动位置、流式状态），避免了"复用旧实例导致数据错乱"的经典 bug。

6. **动态路由拆层**：`/chat/[id]` 采用 server 组件解析 `params`（Next 16 中为 Promise）+ client 组件读取存储，各司其职。

## 🗺️ 开发路线

当前进度与规划详见 [PLAN.md](./PLAN.md)：

- ✅ 阶段 1：流式对话最小闭环
- ✅ 阶段 2：Markdown 渲染 / 代码高亮 / 交互细节
- ✅ 阶段 3：多会话管理（localStorage 持久化 + 动态路由 + 侧边栏）
- ✅ 阶段 6：代码审查完善（数据健壮性 / 错误处理 / 跨标签同步 / 小缺陷扫尾）
- ⬜ 阶段 4：数据迁移到 IndexedDB / 服务端数据库
- ⬜ 阶段 5：深色模式切换 / 移动端抽屉 / 部署与文档

## 📄 许可证

[MIT](./LICENSE)
