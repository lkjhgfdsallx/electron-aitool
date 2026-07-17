<p align="center">
  <img src="build/icon-256.png" alt="LocalForge" width="128" height="128" />
</p>

<h1 align="center">LocalForge</h1>

<p align="center">
  <strong>Forge AI. Locally. Privately.</strong><br />
  <em>本地锻造你的 AI 工作台</em>
</p>

<p align="center">
  No Login · Purely Local · Your Keys, Your Control · Professional AI Desktop Workbench
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
  <a href="#-quick-start"><strong>Quick Start</strong></a>
  ·
  <a href="#-features"><strong>Features</strong></a>
  ·
  <a href="#-core-philosophy"><strong>Philosophy</strong></a>
  ·
  <a href="#-license"><strong>License</strong></a>
</p>

<p align="center">
  <a href="README.zh-CN.md"><strong>🌏 中文版本介绍</strong></a>
  <span> · </span>
  <sub>Prefer Chinese? Read the localized guide.</sub>
</p>

---

Take control of your **API Key**. Conversations, knowledge base, Agent configurations, and workspace data are all stored locally — **no third-party intermediaries**, **no account required**, and no forced cloud uploads.

| Cloud Models | Local Models | Offline Ready |
|:--------:|:--------:|:--------:|
| OpenAI / DeepSeek, etc. | Ollama and local inference | Browse historical conversations and knowledge base |

Vector search, file parsing, memory, and backups are all performed locally; when the Base URL points to `localhost`, you can leave the Key blank, and inference can remain entirely on your machine.

---

## Table of Contents

| Getting Started | Capabilities | Deep Dive |
|:-----|:-----|:-----|
| [Core Philosophy](#-core-philosophy) | [Smart Chat](#-smart-chat) | [Settings Guide](#️-settings-guide) |
| [Features Overview](#-features) | [Agent](#-agent) | [Configuration Reference](#-configuration-reference) |
| [Interface & Navigation](#️-interface--navigation) | [Tools](#-tools) · [Knowledge Base](#-knowledge-base) | [Usage Guide](#-usage-guide) |
| [Quick Start](#-quick-start) | [Workspace](#-workspace) · [Prompts & Skills](#-prompts--skills) | [Workflow Guide](#-workflow-guide) |
| [Tech Stack](#️-tech-stack) | [Data & Privacy](#-data--privacy) | [License](#-license) |

---

## 🔒 Core Philosophy

| | Philosophy | Description |
|:--:|:-----|:-----|
| 🚪 | **No Login Required** | Open and use immediately. No registration, no login, no binding to phone numbers or third-party accounts. |
| 💻 | **Local-First** | Conversation metadata, messages, knowledge base files and vectors, Agent/prompts/Skills, workspace configuration and checkpoint indexes are all saved locally (localStorage + IndexedDB + VCS data within workspace directories). |
| 🔑 | **Key Holding** | API Keys are only stored in your local configuration. Requests are sent directly from the Electron app to your configured Base URL (OpenAI / DeepSeek / Ollama, etc.) without forced intermediaries. |
| 🛡️ | **Privacy Controlled** | One-click API Key clearing, time-range conversation deletion, export/backup/restore, cache and storage statistics — sensitive data can be self-managed. |
| ⚒️ | **Professional Toolchain** | More than a chat window: Agent planning and tool calls, MCP extensions, local knowledge base, workspace files/terminal/checkpoints, site analysis, web search, math tools, prompt engineering and Skills packaging — a complete professional AI workbench. |

<details>
<summary><strong>Local vs Network Boundary (click to expand)</strong></summary>

<br />

| Boundary | Content |
|------|------|
| **Always Local** | UI, conversation storage, knowledge base chunks and vectors, BM25, file tree, checkpoints, memory KV, settings and backup packaging |
| **Only Outbound When Enabled** | Your configured LLM API; `web_search` / `fetch_webpage`; MCP subprocess and external servers; site analyzer crawling and AI analysis interfaces; optional **WebDAV** backup |
| **Local Model Path** | When Base URL points to `localhost` / `127.0.0.1` (e.g., Ollama), API Key can be left blank. Conversations and inference can be completed entirely locally |

</details>

---

## ✨ Features

| Module | What You Can Do |
|:-----|:-----------|
| 💬 **Smart Chat** | Multi-provider/multi-model, streaming output, reasoning chain, image attachments, edit/regenerate/continue, Token usage, system notifications and sound |
| 🕵️ **Agent** | ReAct / Plan-and-Execute / Trial-and-Error, structured plans (create_plan), workflow state machine, human choice questions, step visualization, Todo panel |
| 🧰 **Tools** | Built-in web/calculation/knowledge/math/memory/requirements/site-analysis/workspace tools; MCP; Custom tools; Tool group permissions and auto-approval; **Cross-session memory** (`remember`/`recall`/`forget`/`list_memories`, with conversation pause injection and advanced blocking switches) |
| 📚 **Knowledge Base** | Multi-collection, multi-format upload, local embedding, hybrid search, conversation injection, query simulator, configurable chunking/retrieval parameters |
| 🗂️ **Workspace** | Bind folders, Leader/team Agents, file read/write and command approval, terminal panel, checkpoints and restore, context compression, Slash commands, project templates |
| 📝 **Prompts / Skills** | Template variables, `{{kb:}}` / `{{tool:}}` injection, prompt chains, version history and diff, playground; Skills SKILL.md + resource package import/export |
| 💾 **Data Management** | Full ZIP backup and restore, optional WebDAV cloud sync, conversation JSON/Markdown/HTML export, cache cleanup, privacy cleanup |
| 🎨 **Interface** | Custom title bar, sidebar conversation list, themes and fonts, shortcuts, settings search and navigation rail |

---

## 🖥️ Interface & Navigation

Application main layout:

1. **Custom Title Bar** ([`TitleBar`](src/components/layout/TitleBar.tsx)) — Borderless window + window control buttons  
2. **Sidebar** (only in normal chat mode) — Conversation list, new conversation, entries to knowledge base/workspace/settings  
3. **Main Area** — Switches based on view mode:

| View Mode | Description |
|----------|------|
| `chat` | Chat page: top bar + message list + input area; optional Agent/model selection |
| `knowledge-base` | Full-page knowledge base: collection tabs, file type navigation, file list/preview, query simulator |
| `workspace` | Three-column workspace layout: project explorer, chat panel, terminal/timeline (does not share the normal sidebar) |
| `settings` | Settings page: left navigation rail + section content + settings search |

**Global Capabilities:**

- Shortcuts registered to Electron `globalShortcut` (see [`use-shortcuts`](src/hooks/use-shortcuts.ts))
- In workspace mode, **command approval** and **file write operation approval** dialogs are mounted at the root component, uniformly intercepting across panels
- On startup: MCP config sync, conversation messages migrated from localStorage to IndexedDB ([`conversation-db`](src/services/conversation-db.ts))

---

## 💬 Smart Chat

### Capabilities

- **Multi-Provider, Multi-Model**  
  Maintain multiple Providers in "AI Providers" (API Key, Base URL, model list, connection health check, request timeout/retry/custom Headers). Switch models via [`ModelSelector`](src/components/chat/ModelSelector.tsx) at the top of conversations; default global parameters are configured in "Model Parameters".

- **Streaming Output**  
  [`aiService.streamChat`](src/services/ai-service.ts) is compatible with OpenAI Chat Completions streaming protocol, supporting:
  - Body token streaming
  - **Reasoning/thinking chain** token streaming (e.g., `reasoningContent` from DeepSeek R1, displayed in UI via [`ThinkingSection`](src/components/chat/ThinkingSection.tsx))
  - **Native tool_calls** parsing and callbacks
  - Token usage statistics
  - `finishReason`: `stop` / `length` (reached max_tokens) / `abort` (interrupted), etc., with UI indicators for truncation/interruption

- **Multimodal Attachments**  
  Messages support `MessageAttachment` (image base64 data URLs, text attachments, etc.), sent as multimodal content structures (depending on model capabilities).

- **Message Lifecycle**  
  - Send, stop generation  
  - **Edit user message and resend**  
  - **Regenerate** assistant reply (linked via `parentId`)  
  - **Continue generating / resume Agent** (restore from existing `agentSteps`)  
  - Error states and streaming markers (`isStreaming` / `isError`)

- **Markdown Rendering**  
  [`MarkdownRenderer`](src/components/ui/MarkdownRenderer.tsx): code highlighting (highlight.js), math formulas (KaTeX), tables, etc.

- **Conversation Management** ([`ConversationList`](src/components/conversation/ConversationList.tsx) + conversation store)  
  Create, select, search, pin, delete; titles can be inferred from content or assisted by main process title generation capabilities; workspace conversations are isolated from regular conversations (conversations with `workspaceId` won't mistakenly remain in the regular conversation area after exiting workspace).

- **Storage Architecture**  
  - Conversation **metadata**: Zustand + localStorage  
  - **Message body**: IndexedDB database `ConversationData`, stored item by item
  - Lazy loading: prefer keeping active conversation messages in memory  

- **Experience Enhancements (UI Preferences)**  
  Theme (light/dark/follow system), message/code font and size, code highlight theme, message alignment, avatar, timestamp, Token usage display, Enter to send vs line break, **web search total switch**, system **notifications** and **sound** after completion.

---

## 🕵️ Agent

### Engine Mechanism

The core engine [`agent-engine.ts`](src/services/agent-engine.ts) drives the **think → act → observe** loop:

1. Assemble system prompt (including memory, knowledge, skills, workflow state snippets, tool descriptions)  
2. Call LLM (streaming + tool calls)  
3. Parse final response or tool calls (native function calling **or** text-formatted tool calls)  
4. Execute tools via **ToolExecutor registry**, results written back to context  
5. Repeat until termination condition (max steps, timeout, workflow terminal state, user abort, etc.)

**Callback Capabilities (real-time UI):** Each step `onStep`, token/reasoning stream, state changes, error/completion, **human input** `onHumanInput`, site analysis progress and HTML report ready.

### Planning Strategies

| Strategy | Use Case |
|------|----------|
| **ReAct** | Open-ended tasks, think-act-observe iteratively |
| **Plan-and-Execute** | Break down subtasks then execute (default common path) |
| **Trial-and-Error** | Exploration tasks allowing trial and error |

### Structured Plan (Planner)

[`PlannerToolExecutor`](src/services/agent/planner.ts) provides:

- `create_plan` — Goal + task list → engine writes Plan, emits `plan_created` event  
- `update_task` — Update task status  
- `get_plan` — Read current plan  

UI side can have **Todo panel** ([`AgentTodoPanel`](src/components/chat/AgentTodoPanel.tsx)), step display ([`AgentStepDisplay`](src/components/chat/AgentStepDisplay.tsx)), tool call display ([`ToolCallDisplay`](src/components/chat/ToolCallDisplay.tsx)).

### Workflow State Machine

[`workflow-engine`](src/services/agent/workflow-engine.ts):

- **Whitelist filter tools** based on current state (`allowedTools`)  
- Inject state-level `systemPromptSection`  
- **Transition states** based on tool call success/failure, plan status, message keywords, etc.  
- Runtime serializable,便于 checkpoint recovery  

Visual editor entry: [`AgentWorkflowEditor`](src/components/chat/AgentWorkflowEditor.tsx).

### Preset Agents (excerpt)

Defined in [`default-agents.ts`](src/constants/default-agents.ts):

| ID / Role | Responsibility (summary) |
|-----------|--------------------------|
| **Requirements Analysis Expert** | Only requirements clarification and structured output; `ask_self` / `define_requirement` / `review_requirements` / `ask_human` / memory and knowledge search, etc.; **No code writing, workspace file/command operations, site analysis, math tools, task dispatch** |
| **Site Analysis Expert** | Drive site crawling and analysis toolchain, output reports |
| **Workspace AI Leader (Leader)** | Project-level command: read project, plan, dispatch subtasks, create team Agents (`workspace_dispatch_task` / `workspace_create_agent`, etc.) |
| **Task Decomposition Executor** | Execution-focused decomposition and implementation |

Agents can be configured: system prompts, enabled tool list, planning strategy, memory (history rounds, long-term memory), termination conditions, **model parameter overrides**, auto-approval and tool group permissions, etc. (see Settings "Agent Management" and types [`agent.ts`](src/types/agent.ts)).

### Human Collaboration

- `ask_human`: Key nodes pop up choice questions/multi-select ([`VariableFillDialog`](src/components/chat/VariableFillDialog.tsx) and other interaction paths)  
- Workspace command/file approval: approve once, allow always, deny, deny always  

### Event Bus

[`agentEventBus`](src/services/agent/event-bus.ts) decouples engine and UI (plan creation/task updates, sub-Agent activities, etc.).

---

## 🧰 Tools

### Built-in Tools (excerpt, see [`built-in-tools.ts`](src/services/built-in-tools.ts))

| Category | Tool Name | Purpose |
|------|--------|------|
| Web | `web_search` | Multi-engine search (main process DuckDuckGo → Bing → simplified query fallback, with relevance filtering) |
| Web | `fetch_webpage` | Fetch body by URL (noise removal, length-limited) |
| General | `get_current_time` | Current date and time |
| General | `calculate` | Safe math expression evaluation (arithmetic, power, functions, constants, factorial, etc.) |
| Knowledge Base | `knowledge_search` | Local knowledge base semantic/hybrid search, can limit `collection_ids` |
| Advanced Math | `math_analyze` | Limits, series, numerical differentiation/integration, Taylor, etc. |
| Advanced Math | `math_algebra` | Determinants, eigenvalues, matrix inverse, matrix multiplication, polynomial root-finding, etc. |
| Advanced Math | Geometry/Number Theory/Symbolic/Verification, etc. | `math_geometry`, `math_number`, `math_symbolic`, `math_verify`, etc. (implementations in `math-*.ts` / `math-tools.ts`) |
| Agent-Specific | `remember` / `recall` | Long-term memory KV (per agentId) |
| Agent-Specific | `ask_self`, `define_requirement`, `review_requirements` | Requirements analysis pipeline |
| Agent-Specific | `ask_human` | Structured input from user |
| Site Analysis | `site_analyzer_start` / `cancel`, etc. | Start/cancel site analysis tasks |
| Workspace | `workspace_list_files`, `workspace_read_file`, `workspace_write_file` | Directory and file read/write |
| Workspace | `workspace_execute_command` | Terminal command (approval policy control) |
| Workspace | `workspace_dispatch_task`, `workspace_create_agent` | Leader dispatch and dynamic Agent creation |
| Planning | `create_plan`, `update_task`, `get_plan` | Structured task planning |

**Web Search Total Switch:** When `webSearchEnabled` is false in UI preferences, `web_search` / `fetch_webpage` are filtered from available tools.  
**Disable Built-in Tools:** Maintain `disabledBuiltinToolIds` in settings; corresponding tools are marked as disabled at runtime.

### Tool Groups and Auto-Approval

[`tool-group-service`](src/services/tool-group-service.ts) groups tools into (referencing Roo Code approach):

`read` · `edit` · `terminal` · `browser` · `mcp` · `dispatch` · `analysis` …

Facilitates group-based authorization, combined with **AutoApprovalConfig** to determine whether an operation requires popup approval.

### MCP (Model Context Protocol)

- Render process [`mcp-service`](src/services/mcp-service.ts) proxied through Electron main process (stdio JSON-RPC subprocess)  
- `fetchTools` / `callTool` / batch fetch for multiple servers  
- Config changes automatically sync tool lists via [`mcp-tool-store`](src/stores/mcp-tool-store.ts)  
- Preset servers see [`preset-mcp-servers.ts`](src/constants/preset-mcp-servers.ts)  
- UI: [`MCPConfig`](src/components/settings/MCPConfig.tsx)

### Custom Tools

- User-defined name, description, JSON Schema parameters  
- [`custom-tool-store`](src/stores/custom-tool-store.ts) persistence  
- Main process can have custom tool handling ([`custom-tool-handler.ts`](electron/main/custom-tool-handler.ts))  
- Unclassified tools handled by `GenericToolExecutor` fallback  

### Tool Statistics

[`tool-stats-store`](src/stores/tool-stats-store.ts) records tool usage for troubleshooting and optimization.

### Executor Architecture

On startup, [`registerAllExecutors`](src/services/agent/index.ts) registers:

Memory · Requirement · HumanInput · SiteAnalyzer · Workspace · Math · Planner · **Generic (fallback)**

---

## 📚 Knowledge Base

### Collections & Pages

- **Collections** ([`knowledge-collection-store`](src/stores/knowledge-collection-store.ts)): Multi-knowledge-base namespaces; system default "Default Knowledge Base"; create/rename/icon/delete; tab switch at top bar, or "View All"  
- **Page** ([`KnowledgeBasePage`](src/components/knowledge-base/KnowledgeBasePage.tsx)):  
  - File type navigation [`FileTypeNav`](src/components/knowledge-base/FileTypeNav.tsx)  
  - File list [`FileList`](src/components/knowledge-base/FileList.tsx)  
  - File preview [`FileViewer`](src/components/knowledge-base/FileViewer.tsx)  
  - Query simulator [`QuerySimulator`](src/components/knowledge-base/QuerySimulator.tsx) + results [`SearchResults`](src/components/knowledge-base/SearchResults.tsx)

### Supported Files & Extraction

Main process [`file-extractor.ts`](electron/main/file-extractor.ts) (IPC, avoiding UI blocking):

- **PDF** (pdfjs-dist)  
- **DOC/DOCX** (mammoth)  
- **HTML** (tag removal)  
- **Text and 40+ source code/config/log extensions** direct UTF-8 reading (md/json/csv, JS/TS/Python/Java/Go/Rust, shell, sql,…)

### Indexing & Retrieval ([`knowledge-base-service`](src/services/knowledge-base-service.ts))

- **Chunking**: By word count or paragraph; configurable chunkSize / overlap  
- **Vectors**: [`embedding-service`](src/services/embedding-service.ts) + Web Worker [`embedding-worker.ts`](src/workers/embedding-worker.ts), default local model path (transformers.js / Xenova series all-MiniLM, etc.), 384 dimensions; can also configure remote embedding  
- **BM25**: Chinese character + bigram, English words, camelCase/snake_case splitting  
- **Hybrid Search**: Vector cosine similarity + BM25, adjustable hybrid weight, Top-K, minimum score threshold  
- **Storage**: IndexedDB `KnowledgeBase` (files, chunks, vectors, collections)  
- **Progressive Migration**: Batch processing for large volumes of chunks, yielding main thread  

### Integration with Conversations/Agents

- Knowledge base search can be enabled in conversation input area, relevant snippets injected into context  
- Agent tool `knowledge_search` targeted retrieval  
- Prompt variable `{{kb:collection_id}}` injects search results at render time (see below)

### Knowledge Base Settings Items

Embedding provider, chunking mode/size/overlap, retrieval Top-K, minScore, hybridWeight, etc. (settings section `knowledge-base`).

---

## 📂 Workspace

### Concept

Workspace = **Bind local folder** + **Leader Agent (and optional team Agents)** + **Policies** (checkpoints, command approval, context compression) + **Independent conversation context**.

When creating, you can choose templates ([`workspace-templates.ts`](src/constants/workspace-templates.ts)): e.g., Node.js, Python, generic projects, with preset checkpoint policies, command policies, context Token limits, whether to allow dynamic Agents, etc., and suggested steps after creation.

### Layout & Components

| Component | Purpose |
|------|------|
| [`WorkspacePage`](src/components/workspace/WorkspacePage.tsx) | Workspace main page |
| [`WorkspaceSelector`](src/components/workspace/WorkspaceSelector.tsx) / CreateDialog | Select/create workspace |
| [`ProjectExplorer`](src/components/workspace/ProjectExplorer.tsx) + [`FileTree`](src/components/workspace/FileTree.tsx) + [`FilePreview`](src/components/workspace/FilePreview.tsx) | Project tree and preview |
| [`WorkspaceChatPanel`](src/components/workspace/WorkspaceChatPanel.tsx) | Workspace conversation |
| [`TerminalPanel`](src/components/workspace/TerminalPanel.tsx) | Terminal output and command logs |
| [`ContextTimelinePanel`](src/components/workspace/ContextTimelinePanel.tsx) | Context/checkpoint timeline |
| [`CheckpointMarker`](src/components/workspace/CheckpointMarker.tsx) | Checkpoint marker |
| [`CompressionIndicator`](src/components/workspace/CompressionIndicator.tsx) | Compression status indicator |
| [`CommandApprovalDialog`](src/components/workspace/CommandApprovalDialog.tsx) | Command approval |
| [`FileActionApprovalDialog`](src/components/workspace/FileActionApprovalDialog.tsx) | File operation approval |
| [`AgentDetailDialog`](src/components/workspace/AgentDetailDialog.tsx) / Leader prompt editing | Team and Leader configuration |

### File System & Watching

- [`workspace-fs-service`](src/services/workspace-fs-service.ts): readDir / readFile (truncate large files) / writeFile, etc. IPC wrappers  
- [`workspace-file-watcher`](src/services/workspace-file-watcher.ts) + main process watcher: external IDE/Git changes reflected in tree  

### Command Execution

- [`workspace-command-executor`](src/services/workspace-command-executor.ts) + main process [`workspace-command-handler`](electron/main/workspace-command-handler.ts)  
- Policies: `all-need-approval` / `auto-approve-safe` / `auto-approve-all`  
- Risk grading: safe / medium / high / critical  
- Approval results: approved-once / always / denied / denied-always  
- Terminal log types: stdout / stderr / command / system, can link to approval request ID  

### Version-Control Checkpoints (VCS)

[`workspace-vcs-service`](src/services/workspace-vcs-service.ts) + main process VCS handler:

| Capability | Description |
|------|------|
| init | Initialize VCS metadata in workspace directory |
| createCheckpoint | Create archive; types include auto / manual / pre-command / **pre-restore** / **pre-compression** |
| list / details | Index and details |
| restore | Restore to specified checkpoint; **auto-create pre-restore protective snapshot before restore** |

Policies: `auto-before-modify` / `manual` / `timed` (interval in minutes, max retention configurable).

### Context Compression

[`context-manager`](src/services/agent/context-manager.ts) + [`use-workspace-compression`](src/hooks/use-workspace-compression.ts):

- maxTokens, compressionEnabled, compressionThreshold (e.g., 90%)  
- Sliding window fallback, overflow retry count  
- Automatic checkpoint before compression  

### Slash Commands

[`slash-command-service`](src/services/slashCommand-service.ts) + [`SlashCommandMenu`](src/components/chat/SlashCommandMenu.tsx):

| Command | Description |
|------|------|
| `/init` | Initialize project analysis, generate planning suggestions |
| `/checkpoint` | Manually create checkpoint |
| `/restore` | Restore to specified checkpoint |
| `/agents` | View and manage team Agents |
| … | Support workspace custom commands: `.ai-workspace-vcs/commands/*.md` (frontmatter + templates) |

Categories: workspace / agent / context / custom.

### Multi-Agent Collaboration

- Leader can `workspace_create_agent` / `workspace_dispatch_task`  
- [`workspace-agent-store`](src/stores/workspace-agent-store.ts) manages teams  
- Sub-Agent activity events can be presented in UI  

---

## 📝 Prompts & Skills

### Prompt System

- **Management**: [`PromptManager`](src/components/settings/PromptManager.tsx), [`PromptEditor`](src/components/settings/PromptEditor.tsx)  
- **Variable Engine** [`prompt-variable-engine`](src/services/prompt-variable-engine.ts):  
  - `{{variable}}` normal variable (type validation, default values)  
  - `{{kb:collection_id}}` knowledge base injection  
  - `{{tool:tool_name}}` tool result binding  
  - Built-in context: `current_date` / `current_time`, etc.  
- **Prompt Chains** [`PromptChainEditor`](src/components/settings/PromptChainEditor.tsx): multi-step chaining  
- **Playground** [`PromptPlayground`](src/components/settings/PromptPlayground.tsx): real-time trial runs  
- **Versions** [`prompt-version-service`](src/services/prompt-version-service.ts): snapshots, up to ~20 versions, rollback, diff  
- **In-conversation search insertion**: [`PromptSearchPanel`](src/components/chat/PromptSearchPanel.tsx)  
- **Variable fill dialog**: fill required variables before sending  

### Skills

- Organized with **SKILL.md** (YAML frontmatter: name / description + body) +附属 resources  
- [`skill-store`](src/stores/skill-store.ts): create, edit, JSZip import/export, text/binary resource encoding  
- UI: [`SkillManager`](src/components/settings/SkillManager.tsx), [`SkillEditor`](src/components/settings/SkillEditor.tsx)  
- Agent runtime can inject enabled Skill content (collaborates with agent-engine / tool-service)  

---

## 🌐 Special Capabilities: Site Analysis & Web Search

### Site Analyzer

- Main process modules: `electron/main/site-analyzer/` (browser management, crawler, request capture, AI analysis, report generation)  
- Configuration dimensions ([`site-analyzer-service`](src/services/site-analyzer-service.ts)):  
  - Target URL  
  - Login: password / Cookie / manual  
  - Crawling: depth, page count, URL include/exclude, delay  
  - Proxy, anti-bot (UA, random delay, human simulation)  
  - AI connection parameters for analysis  
- Progress stages: browser → login → crawling → analyzing → report → completed/error  
- UI: [`SiteAnalyzerForm`](src/components/chat/SiteAnalyzerForm.tsx), [`SiteAnalyzerProgressPanel`](src/components/chat/SiteAnalyzerProgressPanel.tsx)  
- Report HTML can be stored in IndexedDB (`SiteAnalyzerReports` / [`report-store`](src/services/report-store.ts)), message `hasReport` marker  

### Web Search

Main process [`web-search.ts`](electron/main/web-search.ts): multi-engine fallback, HTML entity decoding, snippet extraction, relevance scoring filtering; works with `web_search` / `fetch_webpage` tools.

---

## 💾 Data & Privacy

| Capability | Description |
|------|------|
| **Full Backup** [`backup-service`](src/services/backup-service.ts) | localStorage key keys + knowledge base IDB + conversation IDB + reports + Skills, etc. packed into **ZIP**; progress callbacks; selective restore by module |
| **WebDAV Sync** [`webdav-sync-service`](src/services/webdav-sync-service.ts) | Optional: upload backups to your own WebDAV, remote restore and scheduled auto-backup (Settings → Data Management) |
| **Conversation Export** [`export-service`](src/services/export-service.ts) | Single/batch → **JSON / Markdown / HTML** |
| **Cache Statistics & Cleanup** [`cache-service`](src/services/cache-service.ts) | Regional statistics for localStorage / IndexedDB / embedding model file cache, etc.; cleanable items and storage estimation |
| **Privacy Cleanup** [`privacy-service`](src/services/privacy-service.ts) | Scan sensitive data summary; one-click clear API Key; clear MCP credentials; delete conversations by time range |
| **Memory** [`memory-service`](src/services/memory-service.ts) | Agent long-term memory localStorage KV (remember/recall) |
| **Config Hierarchy View** | [`ConfigHierarchyView`](src/components/settings/ConfigHierarchyView.tsx) helps understand global / Provider / Agent override relationships |

---

## ⚙️ Settings Guide

Settings entry: sidebar or shortcut → **Settings**. Left **Navigation Rail** ([`SettingsNavRail`](src/components/settings/SettingsNavRail.tsx)) + **Settings Search** ([`SettingsSearchBar`](src/components/settings/SettingsSearchBar.tsx)), metadata centered in [`settings-registry.ts`](src/constants/settings-registry.ts).

| Section | Content |
|------|------|
| **AI Providers** | Add/edit providers, fetch model list, connection test, request config (timeout/retry/Headers) |
| **Model Parameters** | Default temperature, maxTokens, streaming switch, currently active Provider |
| **UI Preferences** | Theme, font size, code highlight, alignment, avatar/Token/timestamp, Enter to send, web search switch, notifications and sound, sidebar width, shortcuts |
| **Agent Management** | Agent CRUD, prompts, tools, strategies, memory, termination conditions, model overrides, workflows, etc. |
| **Prompts** | Templates, variables, chains, playground, version history |
| **MCP / Tools** | MCP servers and tool list; custom tools; built-in tool enable/disable |
| **Knowledge Base** | Embedding and chunking, retrieval parameters |
| **Skills** | Skill package management and editing |
| **Data Management** | Backup/restore, WebDAV sync, export, cache, privacy, storage overview |
| **Workspace Settings** | Name, path, Leader, checkpoint policy, command policy, context compression, etc. (also has in-workspace Popover quick entry) |

---

## 🔧 Configuration Reference

### AI Providers

| Field | Description |
|------|------|
| name | Display name |
| apiKey | Key (can be empty for local models) |
| baseUrl | e.g., `https://api.openai.com/v1` or `http://127.0.0.1:11434/v1` |
| models | Fetch or manually fill model IDs |
| requestConfig | Timeout, retries, Headers |

Compatible with: OpenAI, DeepSeek, Ollama, and any OpenAI-compatible Chat Completions interface.

### MCP Server Example

```json
{
  "name": "File System Tools",
  "url": "http://localhost:3001",
  "enabled": true,
  "description": "Provides file read/write operations"
}
```

Actual connection forms are as per in-app MCP configuration (including stdio subprocess servers, proxied by main process).

### Common Agent Items

| Item | Description | Common Default |
|------|------|----------------|
| System Prompt | Role and boundaries | Preset templates |
| Bound Tools / Tool Groups | Callable capabilities | Preset per Agent |
| Planning Strategy | ReAct / Plan-and-Execute / Trial-and-Error | Plan-and-Execute |
| History Rounds | Short-term context | e.g., 20 |
| Long-term Memory | remember/recall | Optional |
| Max Steps / Timeout | Termination conditions | e.g., 20 steps / 120s |
| Model Override | Override global temperature, etc. | Optional |

### Knowledge Base Parameter Suggestions

| Parameter | Suggestion |
|------|------|
| Chunking Mode | General text by word count; structured documents try by paragraph |
| chunkSize / overlap | Default ~500 / 50; code try 800–1000 |
| topK | 3–8 |
| minScore | 0.2–0.4 depending on noise tolerance |
| hybridWeight | Higher vector weight for semantics; higher BM25 for keywords |

### Workspace Policy Summary

| Config | Option Meaning |
|------|----------------|
| checkpointPolicy | Auto before modify / Manual / Timed |
| maxCheckpoints | Max retained |
| commandPolicy | All approve / Safe commands auto-pass / All auto (not recommended) |
| contextConfig | maxTokens, compression switch and threshold, overflow retry, checkpoint before compression |

---

## 📖 Usage Guide

### First Time Use

1. `pnpm install` && `pnpm dev` (or `node dev.cjs`)  
2. Open **Settings → AI Providers**, add Key and Base URL, test connection and select model  
3. Return to chat page, send messages directly to verify streaming replies  
4. (Optional) Upload knowledge base files and enable knowledge base search in conversations  
5. (Optional) Select preset Agent for requirements analysis or site analysis  
6. (Optional) Create workspace binding project directory, use Leader for project-level tasks  

### Daily Chat

1. New/search conversations in sidebar  
2. Model selector to switch models; select Agent when needed  
3. Attach images in input box; `/` or prompt panel to insert templates (fill variables first if needed)  
4. Enable web search (UI preferences) for Agent/tools to search web pages  
5. Edit messages, regenerate, stop generation, view thinking chain and tool call cards  
6. Export Markdown/HTML from data management for sharing, or create ZIP backup  

### Knowledge Base

1. Enter knowledge base view → select/create collection  
2. Drag and drop to upload → wait for chunking and vectorization  
3. Verify recall with query simulator  
4. Return to conversation, enable knowledge base switch, or let Agent call `knowledge_search`  

### Agent

1. Select Agent → describe task  
2. Observe steps, Todo/plan, tool results  
3. Complete choice questions when they appear  
4. Tighten tools and max steps in Agent management to prevent over-privilege or infinite loops  

### Workspace

1. New workspace, select template and folder  
2. Confirm Leader and command/checkpoint policies  
3. Use natural language or `/init` to start analysis  
4. Approve file writes and dangerous commands; verify results with file tree and terminal  
5. Key nodes `/checkpoint`; use timeline `/restore` when issues arise (note pre-restore protection)  
6. Long tasks watch the compression indicator,必要时提高 maxTokens 或清理无关上下文  

---

## 📐 Workflow Guide (Complete Workspace Flow)

```
Create Workspace (optional template)
    → Bind local folder, initialize VCS metadata
    → Select Leader Agent (and team)
    → Input goal or /init
    → Leader planning (create_plan / Todo)
    → Execute in loop:
         Read files/search knowledge base/math and analysis tools
         Write files → approve (when policy allows) → optional auto checkpoint
         Execute commands → approve → terminal logs
         Dispatch sub-Agents → sub-task results summary
    → Context near limit → compress (optional checkpoint first)
    → Task complete summary; user can manually checkpoint or restore
```

**Safety Default Recommendations:** Do not use "Auto-Approve All" for command policy; manually checkpoint before production directories first; confirm pre-restore was generated before restoring.

**Difference from Regular Chat:** Workspace conversations bind to `workspaceId`. Exiting workspace view deactivates the workspace and switches back to non-workspace conversations to avoid mixing.

---

## 🚀 Quick Start

### Environment Requirements

| Dependency | Version |
|------|------|
| Node.js | ≥ 18 |
| pnpm | ≥ 8 |

### Development

```bash
pnpm install    # Dependencies; postinstall handles chromium-bidi compatibility and electron deps
pnpm dev        # Via dev.cjs to clean ELECTRON_RUN_AS_NODE before starting electron-vite dev
```

> **VS Code / Cursor Terminal Tip**
> If Electron cannot initialize properly in the integrated terminal, use `node dev.cjs` instead.
> Host editors may inject `ELECTRON_RUN_AS_NODE`; [`dev.cjs`](dev.cjs) clears this variable before starting.

### Build & Packaging

```bash
pnpm build           # electron-vite build
pnpm build:win       # Windows installer
pnpm build:mac       # macOS
pnpm build:linux     # Linux
pnpm build:unpack    # Unpacked directory output
pnpm preview         # Preview build result
```

Output directory is as per electron-builder config (typically `dist/`). `appId` is `com.localforge.app`, product name **LocalForge**.

### Testing

```bash
pnpm test
pnpm test:coverage
```

Covers Agent engine, use-chat send/regenerate/workspace paths, continue generation and resume, etc. (see `src/__tests__/`).

---

## 🛠️ Tech Stack

| Layer | Choice |
|:-----|:-----|
| 🖥️ Desktop Shell | Electron 33 + electron-vite 3 |
| ⚛️ Frontend | React 19 + TypeScript 5 |
| ⚡ Build | Vite 6, pnpm |
| 🎨 Styles | Tailwind CSS 3 |
| 📦 State | Zustand 5 (persist) |
| 💾 Storage | localStorage, IndexedDB (idb), workspace disk VCS |
| 🤖 AI Protocol | OpenAI-compatible Chat Completions (streaming + tools) |
| 🔍 Local Vector | @xenova/transformers + Worker |
| 📄 Document Parsing | pdfjs-dist, mammoth, unified main process extraction |
| 📝 Markdown | marked + highlight.js + KaTeX |
| ✏️ Editor | Monaco (prompts/settings scenarios) |
| 📦 Packaging | electron-builder |
| 🧪 Testing | Jest + jsdom + ts-jest |

---

## 📄 License

This project is open source under the [**MIT License**](LICENSE).

<p align="center">
  <img src="build/icon-32.png" alt="" width="32" height="32" /><br />
  <sub>LocalForge — Forge AI. Locally. Privately.</sub>
</p>
