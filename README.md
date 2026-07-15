<p align="center">
  <img src="build/icon-256.png" alt="LocalForge" width="128" height="128" />
</p>

<h1 align="center">LocalForge</h1>

<p align="center">
  <strong>Forge AI. Locally. Privately.</strong><br />
  <em>本地锻造你的 AI 工作台</em>
</p>

<p align="center">
  无需登录 · 纯本地运行 · 密钥自持 · 专业 AI 桌面工作台
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Privacy" src="https://img.shields.io/badge/privacy-local--first-22c55e?style=flat-square" />
</p>

<p align="center">
  <a href="#-项目启动"><strong>快速开始</strong></a>
  ·
  <a href="#-功能总览"><strong>功能</strong></a>
  ·
  <a href="#-核心理念"><strong>理念</strong></a>
  ·
  <a href="#-开源协议"><strong>协议</strong></a>
</p>

---

把你的 **API Key** 握在自己手里。对话、知识库、Agent 配置与工作区数据全部存在本机——**不经第三方中转**、**不要求账号**、也没有强制云端上传。

| 云端模型 | 本地模型 | 离线可用 |
|:--------:|:--------:|:--------:|
| OpenAI / DeepSeek 等 | Ollama 等本机推理 | 历史对话与知识库可查阅 |

向量检索、文件解析、记忆与备份均在本地完成；Base URL 指向 `localhost` 时，可不填 Key，推理也可完全留在本机。

---

## 目录

| 入门 | 能力 | 深入 |
|:-----|:-----|:-----|
| [核心理念](#-核心理念) | [智能对话](#-智能对话) | [设置指南](#️-设置指南) |
| [功能总览](#-功能总览) | [Agent 智能体](#-agent-智能体) | [配置参考](#-配置参考) |
| [界面与导航](#-界面与导航) | [工具系统](#-工具系统) · [知识库](#-知识库) | [使用指南](#-使用指南) |
| [项目启动](#-项目启动) | [工作区](#-工作区) · [提示词与 Skills](#-提示词与-skills) | [工作指南](#-工作指南工作区完整流程) |
| [技术栈](#️-技术栈) | [数据与隐私](#-数据与隐私) | [开源协议](#-开源协议) |

---

## 🔒 核心理念

| | 理念 | 说明 |
|:--:|:-----|:-----|
| 🚪 | **无需登录** | 打开即可用。不注册、不登录、不绑定手机号或第三方账号。 |
| 💻 | **纯本地优先** | 对话元数据与消息、知识库文件与向量、Agent/提示词/Skills、工作区配置与检查点索引均保存在本机（localStorage + IndexedDB + 工作区目录内的 VCS 数据）。 |
| 🔑 | **密钥自持** | API Key 仅存在你本机的配置中。请求由 Electron 应用直接发往你配置的 Base URL（OpenAI / DeepSeek / Ollama 等），无强制中转。 |
| 🛡️ | **隐私可控** | 提供一键清除 API Key、按时间段清理对话、导出/备份/恢复、缓存与存储用量统计，敏感数据可自助清洗。 |
| ⚒️ | **专业工具链** | 不仅是聊天窗口：Agent 规划与工具调用、MCP 扩展、本地知识库、工作区文件/终端/检查点、网站分析、联网搜索、数学工具、提示词工程与 Skills 打包，构成完整专业 AI 工作台。 |

<details>
<summary><strong>本地 vs 网络边界（点开查看）</strong></summary>

<br />

| 边界 | 内容 |
|------|------|
| **始终本地** | UI、对话存储、知识库分块与向量、BM25、文件树、检查点、记忆 KV、设置与备份打包 |
| **仅在你启用时出网** | 你配置的 LLM API；`web_search` / `fetch_webpage`；MCP 子进程与外部服务器；网站分析爬取与 AI 分析接口；可选 **WebDAV** 备份 |
| **本地模型路径** | Base URL 指向 `localhost` / `127.0.0.1`（如 Ollama）时，可不填 API Key，对话与推理可完全在本机完成 |

</details>

---

## ✨ 功能总览

| 模块 | 你能做什么 |
|:-----|:-----------|
| 💬 **智能对话** | 多服务商/多模型、流式输出、思考链、图片附件、编辑/重生成/继续生成、Token 用量、系统通知与提示音 |
| 🕵️ **Agent** | ReAct / Plan-and-Execute / Trial-and-Error、结构化计划（create_plan）、工作流状态机、人机选择题、步骤可视化、Todo 面板 |
| 🧰 **工具** | 内置联网/计算/知识库/数学/记忆/需求/网站分析/工作区工具；MCP；自定义工具；工具组权限与自动审批 |
| 📚 **知识库** | 多集合、多格式上传、本地嵌入、混合检索、对话注入、查询模拟器、分块/检索参数可配 |
| 🗂️ **工作区** | 绑定文件夹、Leader/团队 Agent、文件读写与命令审批、终端面板、检查点与还原、上下文压缩、Slash 命令、项目模板 |
| 📝 **提示词 / Skills** | 模板变量、`{{kb:}}` / `{{tool:}}` 注入、提示词链、版本历史与 diff、演练场；Skills 的 SKILL.md + 资源包导入导出 |
| 💾 **数据管理** | 全量 ZIP 备份恢复、可选 WebDAV 云端同步、对话 JSON/Markdown/HTML 导出、缓存清理、隐私清洗 |
| 🎨 **界面** | 自定义标题栏、侧栏对话列表、主题与字体、快捷键、设置搜索与导航轨 |

---

## 🖥️ 界面与导航

应用主布局：

1. **自定义标题栏**（[`TitleBar`](src/components/layout/TitleBar.tsx)）— 无边框窗口 + 窗口控制按钮  
2. **侧边栏**（仅普通对话模式）— 对话列表、新建对话、进入知识库/工作区/设置等入口  
3. **主区域** — 根据视图模式切换：

| 视图模式 | 说明 |
|----------|------|
| `chat` | 对话页：顶部栏 + 消息列表 + 输入区；可选 Agent/模型选择 |
| `knowledge-base` | 知识库全页：集合标签、文件类型导航、文件列表/预览、查询模拟器 |
| `workspace` | 工作区三栏布局：项目资源管理器、聊天面板、终端/时间线等（不共用普通侧栏） |
| `settings` | 设置页：左侧导航轨 + 分区内容 + 设置项搜索 |

**全局能力：**

- 快捷键注册到 Electron `globalShortcut`（见 [`use-shortcuts`](src/hooks/use-shortcuts.ts)）
- 工作区模式下的**命令审批**与**文件写操作审批**对话框在根组件挂载，跨面板统一拦截
- 启动时：MCP 配置同步、对话消息从 localStorage 迁移/加载到 IndexedDB（[`conversation-db`](src/services/conversation-db.ts)）

---

## 💬 智能对话

### 能力清单

- **多服务商、多模型**  
  在「AI 服务商」中维护多个 Provider（API Key、Base URL、模型列表、连接健康检查、请求超时/重试/自定义 Headers）。对话顶部 [`ModelSelector`](src/components/chat/ModelSelector.tsx) 切换模型；全局默认参数在「模型参数」中配置。

- **流式输出**  
  [`aiService.streamChat`](src/services/ai-service.ts) 兼容 OpenAI Chat Completions 流式协议，支持：
  - 正文 token 流
  - **推理/思考链** token 流（如 DeepSeek R1 的 `reasoningContent`，UI 中 [`ThinkingSection`](src/components/chat/ThinkingSection.tsx) 展示）
  - **原生 tool_calls** 解析与回调
  - Token usage 统计
  - `finishReason`：`stop` / `length`（达 max_tokens）/ `abort`（中断）等，并在 UI 中给出截断/中断提示

- **多模态附件**  
  消息支持 `MessageAttachment`（图片 base64 data URL、文本类附件等），随请求以多模态 content 结构发送（取决于模型能力）。

- **消息生命周期**  
  - 发送、停止生成  
  - **编辑用户消息并重发**  
  - **重新生成**助手回复（`parentId` 关联）  
  - **继续生成 / resume Agent**（从已有 `agentSteps` 恢复）  
  - 错误态与流式中标记（`isStreaming` / `isError`）

- **Markdown 渲染**  
  [`MarkdownRenderer`](src/components/ui/MarkdownRenderer.tsx)：代码高亮（highlight.js）、数学公式（KaTeX）、表格等。

- **对话管理**（[`ConversationList`](src/components/conversation/ConversationList.tsx) + conversation store）  
  创建、选择、搜索、置顶、删除；标题可由内容推断或主进程标题生成能力辅助；工作区对话与普通对话隔离（带 `workspaceId` 的对话在退出工作区后不会误留在普通对话区）。

- **存储架构**  
  - 对话**元数据**：Zustand + localStorage  
  - **消息正文**：IndexedDB 库 `ConversationData`，按条存储，避免「改一条消息重写整份 5–10MB JSON」  
  - 惰性加载：内存中优先保留活跃对话消息  

- **体验增强（UI 偏好）**  
  主题（亮/暗/跟随系统）、消息/代码字体与字号、代码高亮主题、消息对齐、头像、时间戳、Token 用量显示、Enter 发送 vs 换行、**联网工具总开关**、回复完成**系统通知**与**提示音**。

---

## 🕵️ Agent 智能体

### 引擎机制

核心引擎 [`agent-engine.ts`](src/services/agent-engine.ts) 驱动 **思考 → 行动 → 观察** 循环：

1. 组装系统提示词（含记忆、知识、技能、工作流状态片段、工具描述）  
2. 调用 LLM（流式 + 工具调用）  
3. 解析最终回复或工具调用（原生 function calling **或** 文本格式工具调用）  
4. 经 **ToolExecutor 注册表** 执行工具，结果写回上下文  
5. 重复直至终止条件（最大步数、超时、工作流终态、用户中止等）

**回调能力（实时 UI）：** 每步 `onStep`、token/推理流、状态变化、错误/完成、**人机输入** `onHumanInput`、网站分析进度与 HTML 报告就绪。

### 规划策略

| 策略 | 适用场景 |
|------|----------|
| **ReAct** | 开放式任务，边想边做边观察 |
| **Plan-and-Execute** | 先拆子任务再执行（默认常见路径） |
| **Trial-and-Error** | 允许试错重试的探索型任务 |

### 结构化计划（Planner）

[`PlannerToolExecutor`](src/services/agent/planner.ts) 提供：

- `create_plan` — 目标 + 任务列表 → 引擎写入 Plan，发 `plan_created` 事件  
- `update_task` — 更新任务状态  
- `get_plan` — 读取当前计划  

UI 侧可有 **Todo 面板**（[`AgentTodoPanel`](src/components/chat/AgentTodoPanel.tsx)）、步骤展示（[`AgentStepDisplay`](src/components/chat/AgentStepDisplay.tsx)）、工具调用展示（[`ToolCallDisplay`](src/components/chat/ToolCallDisplay.tsx)）。

### 工作流状态机

[`workflow-engine`](src/services/agent/workflow-engine.ts)：

- 按当前状态 **白名单过滤工具**（`allowedTools`）  
- 注入状态级 `systemPromptSection`  
- 根据工具调用成功/失败、计划状态、消息关键词等 **转移状态**  
- 运行时可序列化，便于检查点恢复  

可视化编辑入口：[`AgentWorkflowEditor`](src/components/chat/AgentWorkflowEditor.tsx)。

### 预置 Agent（节选）

定义于 [`default-agents.ts`](src/constants/default-agents.ts)：

| ID / 角色 | 职责边界（摘要） |
|-----------|------------------|
| **需求分析专家** | 只做需求澄清与结构化输出；`ask_self` / `define_requirement` / `review_requirements` / `ask_human` / 记忆与知识库搜索等；**禁止写代码、操作工作区文件/命令、网站分析、数学工具、任务分派** |
| **网站分析专家** | 驱动站点爬取与分析工具链，输出报告 |
| **工作区 AI 领导（Leader）** | 项目级指挥：读项目、规划、分派子任务、创建团队 Agent（`workspace_dispatch_task` / `workspace_create_agent` 等） |
| **任务拆解执行师** | 面向执行的拆解与落地 |

Agent 可配置：系统提示词、启用工具列表、规划策略、记忆（历史轮数、长期记忆）、终止条件、**模型参数覆盖**、自动审批与工具组权限等（见设置「Agent 管理」与类型 [`agent.ts`](src/types/agent.ts)）。

### 人机协作

- `ask_human`：关键节点弹出选择题/多选（[`VariableFillDialog`](src/components/chat/VariableFillDialog.tsx) 等交互路径）  
- 工作区命令/写文件审批：一次批准、永远允许、拒绝、永远拒绝  

### 事件总线

[`agentEventBus`](src/services/agent/event-bus.ts) 解耦引擎与 UI（计划创建/任务更新、子 Agent 活动等）。

---

## 🧰 工具系统

### 内置工具（节选，见 [`built-in-tools.ts`](src/services/built-in-tools.ts)）

| 类别 | 工具名 | 作用 |
|------|--------|------|
| 联网 | `web_search` | 多引擎搜索（主进程 DuckDuckGo → Bing → 简化查询兜底，含相关度过滤） |
| 联网 | `fetch_webpage` | 按 URL 抓取正文（去噪、可限长） |
| 通用 | `get_current_time` | 当前日期时间 |
| 通用 | `calculate` | 安全数学表达式求值（四则、幂、函数、常量、阶乘等） |
| 知识库 | `knowledge_search` | 本地知识库语义/混合检索，可限定 `collection_ids` |
| 高级数学 | `math_analyze` | 极限、级数、数值微分/积分、Taylor 等 |
| 高级数学 | `math_algebra` | 行列式、特征值、逆矩阵、矩阵乘、多项式求根等 |
| 高级数学 | 几何/数论/符号/验证等 | `math_geometry`、`math_number`、`math_symbolic`、`math_verify` 等（实现见 `math-*.ts` / `math-tools.ts`） |
| Agent 专用 | `remember` / `recall` | 长期记忆 KV（按 agentId） |
| Agent 专用 | `ask_self`、`define_requirement`、`review_requirements` | 需求分析链路 |
| Agent 专用 | `ask_human` | 向用户索取结构化输入 |
| 网站分析 | `site_analyzer_start` / `cancel` 等 | 启动/取消站点分析任务 |
| 工作区 | `workspace_list_files`、`workspace_read_file`、`workspace_write_file` | 目录与文件读写 |
| 工作区 | `workspace_execute_command` | 终端命令（审批策略控制） |
| 工作区 | `workspace_dispatch_task`、`workspace_create_agent` | Leader 分派与动态创建 Agent |
| 规划 | `create_plan`、`update_task`、`get_plan` | 结构化任务计划 |

**联网总开关**：UI 偏好中的 `webSearchEnabled` 为 false 时，会从可用工具中过滤 `web_search` / `fetch_webpage`。  
**禁用内置工具**：设置中可维护 `disabledBuiltinToolIds`，运行时将对应工具标为 disabled。

### 工具组与自动审批

[`tool-group-service`](src/services/tool-group-service.ts) 将工具归入（参考 Roo Code 思路）：

`read` · `edit` · `terminal` · `browser` · `mcp` · `dispatch` · `analysis` …

便于按组授权，并结合 **AutoApprovalConfig** 判断某次操作是否需要弹窗审批。

### MCP（Model Context Protocol）

- 渲染进程 [`mcp-service`](src/services/mcp-service.ts) 经 Electron 主进程代理（stdio JSON-RPC 子进程）  
- `fetchTools` / `callTool` / 多服务器批量拉取  
- 配置变更时 [`mcp-tool-store`](src/stores/mcp-tool-store.ts) 自动同步工具列表  
- 预设服务器见 [`preset-mcp-servers.ts`](src/constants/preset-mcp-servers.ts)  
- UI：[`MCPConfig`](src/components/settings/MCPConfig.tsx)

### 自定义工具

- 用户定义名称、描述、JSON Schema 参数  
- [`custom-tool-store`](src/stores/custom-tool-store.ts) 持久化  
- 主进程可有自定义工具处理（[`custom-tool-handler.ts`](electron/main/custom-tool-handler.ts)）  
- 未分类工具由 `GenericToolExecutor` 兜底  

### 工具统计

[`tool-stats-store`](src/stores/tool-stats-store.ts) 记录工具使用情况，便于排查与优化。

### 执行器架构

启动时 [`registerAllExecutors`](src/services/agent/index.ts) 注册：

Memory · Requirement · HumanInput · SiteAnalyzer · Workspace · Math · Planner · **Generic（fallback）**

---

## 📚 知识库

### 集合与页面

- **集合**（[`knowledge-collection-store`](src/stores/knowledge-collection-store.ts)）：多知识库命名空间；系统默认「默认知识库」；可创建/改名/图标/删除；顶栏标签切换，或「查看全部」  
- **页面**（[`KnowledgeBasePage`](src/components/knowledge-base/KnowledgeBasePage.tsx)）：  
  - 文件类型导航 [`FileTypeNav`](src/components/knowledge-base/FileTypeNav.tsx)  
  - 文件列表 [`FileList`](src/components/knowledge-base/FileList.tsx)  
  - 文件预览 [`FileViewer`](src/components/knowledge-base/FileViewer.tsx)  
  - 查询模拟器 [`QuerySimulator`](src/components/knowledge-base/QuerySimulator.tsx) + 结果 [`SearchResults`](src/components/knowledge-base/SearchResults.tsx)

### 支持的文件与提取

主进程 [`file-extractor.ts`](electron/main/file-extractor.ts)（IPC，避免阻塞 UI）：

- **PDF**（pdfjs-dist）  
- **DOC/DOCX**（mammoth）  
- **HTML**（去标签）  
- **文本与 40+ 源码/配置/日志扩展名** 直接 UTF-8 读取（md/json/csv、JS/TS/Python/Java/Go/Rust、shell、sql…）

### 索引与检索（[`knowledge-base-service`](src/services/knowledge-base-service.ts)）

- **分块**：按字数或段落；可配置 chunkSize / overlap  
- **向量**：[`embedding-service`](src/services/embedding-service.ts) + Web Worker [`embedding-worker.ts`](src/workers/embedding-worker.ts)，默认本地模型路径（transformers.js / Xenova 系 all-MiniLM 等），384 维；也可配置远程 embedding  
- **BM25**：中英分词（中文单字+bigram、英文词、camelCase/snake_case 拆分）  
- **混合检索**：向量余弦相似度 + BM25，可调 hybrid 权重、Top-K、最低分数阈值  
- **存储**：IndexedDB `KnowledgeBase`（文件、分块、向量、集合）  
- **渐进迁移**：大批量 chunk 分批处理，让出主线程  

### 与对话/Agent 联动

- 对话输入区可开启知识库检索，相关片段注入上下文  
- Agent 工具 `knowledge_search` 定向检索  
- 提示词变量 `{{kb:collection_id}}` 可在渲染时注入检索结果（见下节）

### 知识库设置项

嵌入提供方、分块模式/大小/重叠、检索 Top-K、minScore、hybridWeight 等（设置分区 `knowledge-base`）。

---

## 📂 工作区

### 概念

工作区 = **绑定本地文件夹** + **Leader Agent（及可选团队 Agent）** + **策略**（检查点、命令审批、上下文压缩）+ **独立对话上下文**。

新建时可选用模板（[`workspace-templates.ts`](src/constants/workspace-templates.ts)）：如 Node.js、Python、通用项目等，预置检查点策略、命令策略、上下文 Token 上限、是否允许动态 Agent 等，并给出创建后建议步骤。

### 布局与组件

| 组件 | 作用 |
|------|------|
| [`WorkspacePage`](src/components/workspace/WorkspacePage.tsx) | 工作区主页面 |
| [`WorkspaceSelector`](src/components/workspace/WorkspaceSelector.tsx) / CreateDialog | 选择/创建工作区 |
| [`ProjectExplorer`](src/components/workspace/ProjectExplorer.tsx) + [`FileTree`](src/components/workspace/FileTree.tsx) + [`FilePreview`](src/components/workspace/FilePreview.tsx) | 项目树与预览 |
| [`WorkspaceChatPanel`](src/components/workspace/WorkspaceChatPanel.tsx) | 工作区对话 |
| [`TerminalPanel`](src/components/workspace/TerminalPanel.tsx) | 终端输出与命令日志 |
| [`ContextTimelinePanel`](src/components/workspace/ContextTimelinePanel.tsx) | 上下文/检查点时间线 |
| [`CheckpointMarker`](src/components/workspace/CheckpointMarker.tsx) | 检查点标记 |
| [`CompressionIndicator`](src/components/workspace/CompressionIndicator.tsx) | 压缩状态指示 |
| [`CommandApprovalDialog`](src/components/workspace/CommandApprovalDialog.tsx) | 命令审批 |
| [`FileActionApprovalDialog`](src/components/workspace/FileActionApprovalDialog.tsx) | 写文件等操作审批 |
| [`AgentDetailDialog`](src/components/workspace/AgentDetailDialog.tsx) / Leader 提示词编辑 | 团队与 Leader 配置 |

### 文件系统与监听

- [`workspace-fs-service`](src/services/workspace-fs-service.ts)：readDir / readFile（可截断大文件）/ writeFile 等 IPC 封装  
- [`workspace-file-watcher`](src/services/workspace-file-watcher.ts) + 主进程 watcher：外部 IDE/Git 改动可反映到树  

### 命令执行

- [`workspace-command-executor`](src/services/workspace-command-executor.ts) + 主进程 [`workspace-command-handler`](electron/main/workspace-command-handler.ts)  
- 策略：`all-need-approval` / `auto-approve-safe` / `auto-approve-all`  
- 风险分级：safe / medium / high / critical  
- 审批结果：approved-once / always / denied / denied-always  
- 终端日志类型：stdout / stderr / command / system，可关联审批请求 ID  

### 版本控制式检查点（VCS）

[`workspace-vcs-service`](src/services/workspace-vcs-service.ts) + 主进程 VCS handler：

| 能力 | 说明 |
|------|------|
| init | 在工作区目录初始化 VCS 元数据 |
| createCheckpoint | 创建存档；类型含 auto / manual / pre-command / **pre-restore** / **pre-compression** |
| list / 详情 | 索引与明细 |
| restore | 还原到指定检查点；**还原前自动创建 pre-restore 保护快照** |

策略：`auto-before-modify` / `manual` / `timed`（间隔分钟、最大保留数可配）。

### 上下文压缩

[`context-manager`](src/services/agent/context-manager.ts) + [`use-workspace-compression`](src/hooks/use-workspace-compression.ts)：

- maxTokens、compressionEnabled、compressionThreshold（如 90%）  
- 滑动窗口兜底、溢出重试次数  
- 压缩前是否自动打检查点  

### Slash 命令

[`slash-command-service`](src/services/slash-command-service.ts) + [`SlashCommandMenu`](src/components/chat/SlashCommandMenu.tsx)：

| 命令 | 说明 |
|------|------|
| `/init` | 初始化项目分析，生成规划建议 |
| `/checkpoint` | 手动创建存档点 |
| `/restore` | 还原到指定存档 |
| `/agents` | 查看与管理团队 Agent |
| … | 支持工作区自定义命令：`.ai-workspace-vcs/commands/*.md`（frontmatter + 模板） |

分类：workspace / agent / context / custom。

### 多 Agent 协作

- Leader 可 `workspace_create_agent` / `workspace_dispatch_task`  
- [`workspace-agent-store`](src/stores/workspace-agent-store.ts) 管理团队  
- 子 Agent 活动事件可在 UI 中呈现  

---

## 📝 提示词与 Skills

### 提示词系统

- **管理**：[`PromptManager`](src/components/settings/PromptManager.tsx)、[`PromptEditor`](src/components/settings/PromptEditor.tsx)  
- **变量引擎** [`prompt-variable-engine`](src/services/prompt-variable-engine.ts)：  
  - `{{variable}}` 普通变量（类型校验、默认值）  
  - `{{kb:collection_id}}` 知识库注入  
  - `{{tool:tool_name}}` 工具结果绑定  
  - 内置上下文：`current_date` / `current_time` 等  
- **提示词链** [`PromptChainEditor`](src/components/settings/PromptChainEditor.tsx)：多步串联  
- **演练场** [`PromptPlayground`](src/components/settings/PromptPlayground.tsx)：实时试跑  
- **版本** [`prompt-version-service`](src/services/prompt-version-service.ts)：快照、最多保留约 20 版、回滚、diff  
- **对话内搜索插入**：[`PromptSearchPanel`](src/components/chat/PromptSearchPanel.tsx)  
- **变量填写对话框**：发送前补齐必填变量  

### Skills

- 以 **SKILL.md**（YAML frontmatter：name / description + 正文）+ 附属资源组织  
- [`skill-store`](src/stores/skill-store.ts)：创建、编辑、JSZip 导入导出、文本/二进制资源编码  
- UI：[`SkillManager`](src/components/settings/SkillManager.tsx)、[`SkillEditor`](src/components/settings/SkillEditor.tsx)  
- Agent 运行时可注入已启用 Skill 内容（与 agent-engine / tool-service 协作）  

---

## 🌐 特殊能力：网站分析与联网搜索

### 网站分析器

- 主进程模块：`electron/main/site-analyzer/`（浏览器管理、爬虫、请求捕获、AI 分析、报告生成）  
- 配置维度（[`site-analyzer-service`](src/services/site-analyzer-service.ts)）：  
  - 目标 URL  
  - 登录：密码 / Cookie / 手动  
  - 爬取：深度、页数、URL 包含/排除、延迟  
  - 代理、反爬（UA、随机延迟、模拟人类）  
  - 用于分析的 AI 连接参数  
- 进度阶段：browser → login → crawling → analyzing → report → completed/error  
- UI：[`SiteAnalyzerForm`](src/components/chat/SiteAnalyzerForm.tsx)、[`SiteAnalyzerProgressPanel`](src/components/chat/SiteAnalyzerProgressPanel.tsx)  
- 报告 HTML 可存 IndexedDB（`SiteAnalyzerReports` / [`report-store`](src/services/report-store.ts)），消息上 `hasReport` 标记  

### 联网搜索

主进程 [`web-search.ts`](electron/main/web-search.ts)：多引擎回退、HTML 实体解码、片段提取、相关度打分过滤；与 `web_search` / `fetch_webpage` 工具配合。

---

## 💾 数据与隐私

| 能力 | 说明 |
|------|------|
| **全量备份** [`backup-service`](src/services/backup-service.ts) | localStorage 关键键 + 知识库 IDB + 对话 IDB + 报告 + Skills 等打成 **ZIP**；进度回调；按模块选择恢复 |
| **WebDAV 同步** [`webdav-sync-service`](src/services/webdav-sync-service.ts) | 可选：将备份上传到自有 WebDAV、远程恢复与定时自动备份（设置 → 数据管理） |
| **对话导出** [`export-service`](src/services/export-service.ts) | 单条/批量 → **JSON / Markdown / HTML** |
| **缓存统计与清理** [`cache-service`](src/services/cache-service.ts) | 分区域统计 localStorage / IndexedDB / 嵌入模型文件缓存等；可清理项与存储估算 |
| **隐私清洗** [`privacy-service`](src/services/privacy-service.ts) | 扫描敏感数据摘要；一键清 API Key；清 MCP 凭据；按时间范围删对话 |
| **记忆** [`memory-service`](src/services/memory-service.ts) | Agent 长期记忆 localStorage KV（remember/recall） |
| **配置层级视图** | [`ConfigHierarchyView`](src/components/settings/ConfigHierarchyView.tsx) 帮助理解全局 / Provider / Agent 覆盖关系 |

---

## ⚙️ 设置指南

设置入口：侧栏或快捷键 → **设置**。左侧 **导航轨**（[`SettingsNavRail`](src/components/settings/SettingsNavRail.tsx)）+ **设置搜索**（[`SettingsSearchBar`](src/components/settings/SettingsSearchBar.tsx)），元数据集中在 [`settings-registry.ts`](src/constants/settings-registry.ts)。

| 分区 | 内容 |
|------|------|
| **AI 服务商** | 增删改 Provider、拉模型列表、连接测试、请求配置（超时/重试/Headers） |
| **模型参数** | 默认 temperature、maxTokens、流式开关、当前活跃 Provider |
| **UI 偏好** | 主题、字体字号、代码高亮、对齐、头像/Token/时间戳、Enter 发送、联网开关、通知与提示音、侧栏宽度、快捷键 |
| **Agent 管理** | Agent CRUD、提示词、工具、策略、记忆、终止条件、模型覆盖、工作流等 |
| **提示词** | 模板、变量、链、演练场、版本历史 |
| **MCP / 工具** | MCP 服务器与工具列表；自定义工具；内置工具启停 |
| **知识库** | 嵌入与分块、检索参数 |
| **Skills** | Skill 包管理与编辑 |
| **数据管理** | 备份恢复、WebDAV 同步、导出、缓存、隐私、存储概览 |
| **工作区设置** | 名称、路径、Leader、检查点策略、命令策略、上下文压缩等（亦有工作区内 Popover 快捷入口） |

---

## 🔧 配置参考

### AI 服务商

| 字段 | 说明 |
|------|------|
| name | 显示名称 |
| apiKey | 密钥（本地模型可空） |
| baseUrl | 如 `https://api.openai.com/v1` 或 `http://127.0.0.1:11434/v1` |
| models | 拉取或手填模型 ID |
| requestConfig | 超时、重试、Headers |

兼容：OpenAI、DeepSeek、Ollama 及一切 OpenAI 兼容 Chat Completions 接口。

### MCP 服务器示例

```json
{
  "name": "文件系统工具",
  "url": "http://localhost:3001",
  "enabled": true,
  "description": "提供文件读写操作"
}
```

实际连接形态以应用内 MCP 配置为准（含 stdio 子进程类服务器，由主进程代理）。

### Agent 常用项

| 项 | 说明 | 常见默认 |
|----|------|----------|
| 系统提示词 | 角色与边界 | 预置模板 |
| 绑定工具 / 工具组 | 可调用能力 | 按 Agent 预设 |
| 规划策略 | ReAct / Plan-and-Execute / Trial-and-Error | Plan-and-Execute |
| 历史轮数 | 短期上下文 | 如 20 |
| 长期记忆 | remember/recall | 可选 |
| 最大步数 / 超时 | 终止条件 | 如 20 步 / 120s |
| 模型覆盖 | 覆盖全局 temperature 等 | 可选 |

### 知识库参数建议

| 参数 | 建议 |
|------|------|
| 分块模式 | 通用文本按字数；结构化文档可试按段落 |
| chunkSize / overlap | 默认约 500 / 50；代码可试 800–1000 |
| topK | 3–8 |
| minScore | 0.2–0.4 视噪声容忍度 |
| hybridWeight | 偏语义则向量权重更高；偏关键字则提高 BM25 |

### 工作区策略摘要

| 配置 | 选项含义 |
|------|----------|
| checkpointPolicy | 修改前自动 / 手动 / 定时 |
| maxCheckpoints | 保留上限 |
| commandPolicy | 全部审批 / 安全命令自动过 / 全部自动（不推荐） |
| contextConfig | maxTokens、压缩开关与阈值、溢出重试、压缩前存档 |

---

## 📖 使用指南

### 第一次使用

1. `pnpm install` && `pnpm dev`（或 `node dev.cjs`）  
2. 打开 **设置 → AI 服务商**，添加 Key 与 Base URL，测试连接并选择模型  
3. 回到对话页，直接发消息验证流式回复  
4. （可选）上传知识库文件并打开对话中的知识库检索  
5. （可选）选择预置 Agent 做需求分析或网站分析  
6. （可选）创建工作区绑定项目目录，用 Leader 做项目级任务  

### 日常对话

1. 侧栏新建/搜索对话  
2. 模型选择器切换模型；需要时选 Agent  
3. 输入框附件发图；`/` 或提示词面板插入模板（若有变量则先填写）  
4. 开启联网（UI 偏好）后 Agent/工具才可搜索网页  
5. 编辑消息、重新生成、停止生成、查看思考链与工具调用卡片  
6. 数据管理中导出 Markdown/HTML 分享，或做 ZIP 备份  

### 知识库

1. 进入知识库视图 → 选择/新建集合  
2. 拖拽上传 → 等待分块与向量化  
3. 用查询模拟器验证召回  
4. 回对话打开知识库开关，或让 Agent 调用 `knowledge_search`  

### Agent

1. 选中 Agent → 描述任务  
2. 观察步骤、Todo/计划、工具结果  
3. 出现人机选择题时完成选择  
4. 在 Agent 管理中收紧工具与最大步数，避免越权或死循环  

### 工作区

1. 新建工作区，选模板与文件夹  
2. 确认 Leader 与命令/检查点策略  
3. 用自然语言或 `/init` 启动分析  
4. 审批写文件与危险命令；用文件树与终端核对结果  
5. 关键节点 `/checkpoint`；出问题用时间线 `/restore`（注意 pre-restore 保护）  
6. 长任务关注压缩指示器，必要时提高 maxTokens 或清理无关上下文  

---

## 📐 工作指南（工作区完整流程）

```
创建工作区（可选模板）
    → 绑定本地文件夹，初始化 VCS 元数据
    → 选定 Leader Agent（及团队）
    → 输入目标 或 /init
    → Leader 规划（create_plan / Todo）
    → 循环执行：
         读文件/搜索知识库/数学与分析工具
         写文件 → 审批（策略允许时）→ 可选自动检查点
         执行命令 → 审批 → 终端日志
         分派子 Agent → 子任务结果汇总
    → 上下文接近上限 → 压缩（可选先检查点）
    → 任务完成摘要；用户可手动检查点或还原
```

**安全默认建议：** 命令策略不要用「全部自动批准」；生产目录先手动检查点；还原前确认 pre-restore 已生成。

**与普通对话的区别：** 工作区对话绑定 `workspaceId`，退出工作区视图会停用工作区并切回非工作区对话，避免串台。

---

## 🚀 项目启动

### 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | ≥ 18 |
| pnpm | ≥ 8 |

### 开发

```bash
pnpm install    # 依赖安装；postinstall 会处理 chromium-bidi 兼容与 electron 依赖
pnpm dev        # 经 dev.cjs 清理 ELECTRON_RUN_AS_NODE 后启动 electron-vite dev
```

> **VS Code / Cursor 终端提示**
> 集成终端里 Electron 若无法正常初始化，请改用 `node dev.cjs`。
> 宿主编辑器可能注入 `ELECTRON_RUN_AS_NODE`；[`dev.cjs`](dev.cjs) 会清除该变量后再启动。

### 构建与打包

```bash
pnpm build           # electron-vite 构建
pnpm build:win       # Windows 安装包
pnpm build:mac       # macOS
pnpm build:linux     # Linux
pnpm build:unpack    # 未打包目录输出
pnpm preview         # 预览构建结果
```

产物目录以 electron-builder 配置为准（通常为 `dist/`）。`appId` 为 `com.localforge.app`，产品名 **LocalForge**。

### 测试

```bash
pnpm test
pnpm test:coverage
```

覆盖 Agent 引擎、use-chat 发送/重生成/工作区路径、继续生成与 resume 等（见 `src/__tests__/`）。

---

## 🛠️ 技术栈

| 层级 | 选型 |
|:-----|:-----|
| 🖥️ 桌面壳 | Electron 33 + electron-vite 3 |
| ⚛️ 前端 | React 19 + TypeScript 5 |
| ⚡ 构建 | Vite 6、pnpm |
| 🎨 样式 | Tailwind CSS 3 |
| 📦 状态 | Zustand 5（persist） |
| 💾 存储 | localStorage、IndexedDB（idb）、工作区磁盘 VCS |
| 🤖 AI 协议 | OpenAI 兼容 Chat Completions（流式 + tools） |
| 🔍 本地向量 | @xenova/transformers + Worker |
| 📄 文档解析 | pdfjs-dist、mammoth、主进程统一提取 |
| 📝 Markdown | marked + highlight.js + KaTeX |
| ✏️ 编辑器 | Monaco（提示词/部分设置场景） |
| 📦 打包 | electron-builder |
| 🧪 测试 | Jest + jsdom + ts-jest |

---

## 📄 开源协议

本项目基于 [**MIT License**](LICENSE) 开源。

<p align="center">
  <img src="build/icon-32.png" alt="" width="32" height="32" /><br />
  <sub>LocalForge — Forge AI. Locally. Privately.</sub>
</p>
