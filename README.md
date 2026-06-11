# Vible Writing · AI 小说创作与长篇一致性检查工作台

> 面向长篇小说作者的 AI 创作 IDE：提示词优化 → 设定 / 大纲 / 章节生成 → 事实抽取 → Story Bible → 一致性检查 → 修复建议。

打开应用后**直接进入工作台**，不提供营销首页。

---

## 功能闭环

1. **创建作品**：输入原始创意 + 题材 + 篇幅 + 风格
2. **提示词优化**：AI 返回完整度评分、结构化 brief、3 个方向、追问问题
3. **采用 brief**：一键生成 Story Bible 初始条目
4. **大纲管理**：生成 / 编辑章节大纲（goal / summary / 必备节拍 / 关联角色 / 关联伏笔）
5. **章节编辑器**（左：章节列表 · 中：正文 · 右：AI 助手）
   - 生成本章 / 续写一段 / 润色全文 / 润色选段
   - 抽取事实 → 全部写入 Story Bible（支持查看抽取历史）
   - 一键运行一致性检查
6. **一致性检查**：每条问题带严重程度、证据（含原文引用）、修复建议按钮
7. **修复建议**：3 套方案 + 推荐方案 + 可直接复制的 patch 文本

---

## 技术栈

- **Next.js 14** App Router + Server Actions
- **Prisma 5.22** + **SQLite**（零配置启动，可平滑迁移 PostgreSQL）
- **TypeScript 5.6** strict mode
- **Zod 3.23** 全链路 schema 校验
- **Tailwind CSS 3.4** 样式
- **Vitest 1.6** + `@vitest/coverage-v8`（**92 个单测**覆盖 7 个核心纯逻辑模块）

---

## 快速开始

```bash
# 1. 安装依赖（自动 prisma generate）
npm install

# 2. 初始化数据库（SQLite，零配置）
npx prisma db push

# 3. 启动开发服务器
npm run dev
```

打开 http://localhost:3000 进入工作台。

> **Mock 模式**：如果你不配置 `OPENAI_API_KEY`，所有 AI 能力都会自动使用确定性 mock 数据，让你完整体验整个闭环，**不阻断任何流程**。

### Dev Login

首次访问时页面会显示一个 Dev 登录入口（`/dev/login`）。点击即可创建一个本地 `User` 并以 cookie 写入会话。生产环境请替换为真实 OAuth/SSO。

---

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（含 Next.js 热重载 + middleware rate limit） |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | 启动生产服务器 |
| `npm run lint` | ESLint |
| `npm test` | 跑一次全部测试（**92 tests / 7 files**） |
| `npm run test:watch` | 监听模式 |
| `npm run test:coverage` | 跑测试 + v8 覆盖率（阈值 90/80） |

---

## 环境变量

复制 `.env.example` 为 `.env` 即可。**所有变量都是可选的**。

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI-compatible API key | 留空 → Mock 模式 |
| `OPENAI_BASE_URL` | API 基础地址 | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 模型名 | `gpt-4o-mini` |
| `DATABASE_URL` | SQLite 路径 | `file:./dev.db` |

应用支持任何 OpenAI 兼容服务（OpenAI、Azure、DeepSeek、Moonshot、Together、OpenRouter 等），只要把 `OPENAI_BASE_URL` 指向对应服务即可。

---

## 启用真实 AI

1. 编辑 `.env`：
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_BASE_URL=https://api.openai.com/v1
   OPENAI_MODEL=gpt-4o-mini
   ```
2. 重启 `npm run dev`，右上角徽章会从 `Mock 模式` 变为 `已连接 API`。

---

## 项目结构

```
src/
├── app/
│   ├── actions.ts                # Server Actions 单一入口（barrel re-export）
│   ├── actions/                  # 6 个 domain actions（按领域拆分）
│   │   ├── _shared.ts            # 共享 helpers：revalidate / owner 校验
│   │   ├── project.ts            # 创建 / 查询 / 列表
│   │   ├── bible.ts              # Story Bible CRUD
│   │   ├── outline.ts            # 大纲生成 / 编辑
│   │   ├── chapter.ts            # 章节内容 / AI 生成 / 润色
│   │   ├── extraction.ts         # 事实抽取 + apply
│   │   ├── consistency.ts        # 一致性检查 + fix 方案
│   │   └── dev-auth.ts           # 本地 dev 登录
│   ├── layout.tsx                # 根布局 + 状态徽章
│   ├── page.tsx                  # 工作台首页（作品列表 + 创建 + dev login）
│   └── projects/[projectId]/
│       ├── layout.tsx            # 项目级布局 + 顶部导航
│       ├── prompt/page.tsx       # 提示词优化
│       ├── outline/page.tsx      # 大纲管理
│       ├── bible/page.tsx        # Story Bible（7 个分类 tabs）
│       ├── chapters/             # 章节列表 + 三栏式编辑器
│       │   ├── page.tsx
│       │   └── [chapterId]/
│       │       ├── page.tsx           # 编辑器
│       │       └── extractions/page.tsx  # 抽取历史视图
│       └── consistency/page.tsx  # 一致性检查 + 修复建议
│
├── components/                   # 所有 UI 组件（client + server 混合）
│
├── lib/
│   ├── ai/
│   │   ├── prompts.ts            # 全部 prompt 模板集中管理
│   │   ├── service.ts            # 统一 AI 入口
│   │   ├── retry.ts              # withRetry / isRetryableError（5xx/429/网络）
│   │   ├── mock.ts               # 每种能力的 mock fallback
│   │   └── providers/            # OpenAI-compatible 适配器 + registry
│   ├── auth.ts                   # currentUserId / requireProjectOwner / requireChapterOwner
│   ├── bible.ts                  # Story Bible 读写
│   ├── db.ts                     # Prisma client 单例
│   ├── errors.ts                 # UserError / InfraError + formatUserFacingError
│   ├── extraction.ts             # payloadToBibleRecords / summarizePayload
│   ├── json.ts                   # 安全 JSON 解析/序列化
│   ├── rate-limit.ts             # 内存 token-bucket
│   ├── validation.ts             # 全部 Zod schemas
│   └── middleware.ts             # 边缘 middleware 限流
│
├── types/
│   └── domain.ts                 # 全部领域类型（Brief / BibleRecord / Issue / Fix / ...）
│
└── middleware.ts                 # 边缘 middleware 限流
```

---

## 数据模型

- **User** — 用户（cookie-based dev session）
- **Project** — 作品（`ownerId` → User）
- **Chapter** — 章节（含 outline / content / summary / status）
- **StoryBible** — 7 大类（characters / locations / items / worldRules / plotThreads / foreshadowing / timelineEvents），每条记录都是 JSON
- **FactExtraction** — 章节级事实抽取快照（pending / applied / dismissed），支持历史查看
- **ConsistencyReport** — 章节级一致性报告（含 issues 数组，单条 issue 可标记 resolved / dismissed）

所有 JSON 列都已类型化（见 `src/types/domain.ts`），未来切换到 PostgreSQL + `pgvector` 只需要修改 `datasource`。

---

## 安全与可靠性

- **IDOR 防护**：所有 server actions 都经过 `requireProjectOwner` / `requireChapterOwner` / `requireReportOwner` 校验，不允许越权读写
- **错误分类**：`UserError`（用户输入问题，原样返回）vs `InfraError`（基础设施问题，统一英文 + 服务端日志），前端用 `formatUserFacingError` 统一展示
- **LLM 重试**：`withRetry` 自动退避重试 5xx / 429 / 网络错，非可重试错误立即抛
- **限流**：内存 token-bucket + Next.js edge middleware，所有 server action 入口限流
- **输入校验**：Zod schemas 在 server action 入口 + AI 响应出口双向校验

---

## 测试

```bash
npm test                  # 跑 7 个文件 / 92 个测试
npm run test:coverage     # 跑覆盖率
```

当前覆盖：
- `errors.test.ts` — 19 tests（错误分类 / 格式化 / 日志）
- `validation.test.ts` — 34 tests（Zod schema 边界）
- `actions-shared.test.ts` — 9 tests（owner 校验 / revalidate）
- `retry.test.ts` — 10 tests（5xx/429/网络/退避）
- `rate-limit.test.ts` — 6 tests（token-bucket 行为）
- `extraction.test.ts` — 11 tests（payload → BibleRecord 转换）
- `dev-auth.test.ts` — 3 tests（dev session 读写）

覆盖率阈值：`lines 90%` / `branches 80%`（v8 provider）。

---

## 推荐的扩展方向

代码结构刻意保持简单，便于未来扩展：

- **多模型**：`src/lib/ai/providers/registry.ts` 已是统一入口，添加新模型只需新增一个 provider
- **多 Agent**：每个 AI 能力都是独立函数，可独立替换为「一致性 Agent」「修复 Agent」等
- **PostgreSQL + pgvector**：将 `provider = "sqlite"` 改为 `postgresql`，并把 `String` JSON 字段改为 `Json` 类型即可
- **Tiptap / Lexical 富文本**：`ChapterEditor` 已是受控 `value/onChange` 模式，把 `<textarea>` 替换为 Tiptap 即可接入
- **OAuth 登录**：替换 `dev-auth.ts` 为 NextAuth / Auth.js 即可

---

## 常见问题

**Q：数据库被改坏了怎么办？**
A：删掉 `prisma/dev.db`，再 `npx prisma db push` 即可重置。

**Q：AI 返回的不是 JSON？**
A：应用内置 JSON 解析失败兜底，会自动回退到 mock 数据，并在控制台打印警告。不会阻塞流程。

**Q：可以导入已有作品吗？**
A：MVP 不包含导入/导出，但所有数据都在 SQLite 文件中，可直接备份 `dev.db`。

**Q：测试为什么不需要数据库？**
A：7 个测试文件都只覆盖纯逻辑模块（errors / validation / retry / rate-limit / extraction / auth helpers / shared actions helpers），通过 `vi.mock` 隔离 Prisma / Next.js。集成测试用 `prisma db push` + Vitest 启动一个临时 DB 即可。

---

## License

MIT
