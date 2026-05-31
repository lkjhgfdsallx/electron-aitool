# AI Chat Tool

一款基于 **Electron + React + TypeScript** 构建的桌面端 AI 智能对话工具，支持多模型接入、Agent 自主规划执行、MCP 工具协议、知识库向量检索等高级功能。

## ✨ 功能特性

### 🤖 智能对话
- **多模型兼容** — 支持 OpenAI、DeepSeek、Ollama 等所有兼容 OpenAI API 格式的服务
- **流式输出** — 实时逐字显示 AI 回复，支持推理过程（如 DeepSeek R1 的思考链）展示
- **多模态输入** — 支持图片附件，可发送图片进行视觉理解
- **Markdown 渲染** — 完整支持代码高亮（highlight.js）、数学公式（KaTeX）、表格等
- **消息管理** — 支持重新生成、编辑消息、消息搜索

### 🕵️ Agent 智能体系统
- **自主规划执行** — Agent 可自动拆解任务、调用工具、分析结果、循环执行直到完成
- **多种规划策略**
  - **ReAct** — 思考-行动-观察循环模式
  - **Plan-and-Execute** — 先拆解子任务再逐步执行
  - **Trial-and-Error** — 允许试错重试
- **Agent 配置** — 自定义系统提示词、绑定工具、设置记忆策略和终止条件
- **内置 Agent** — 预置「需求分析专家」等开箱即用的 Agent
- **步骤可视化** — 实时展示 Agent 的思考过程、工具调用和执行结果
- **人机协作** — Agent 可在关键节点请求用户输入，支持单选/多选交互

### 🔧 工具系统
- **内置工具** — 获取当前时间、数学计算等常用工具
- **MCP 协议** — 支持 Model Context Protocol，可连接外部 MCP 服务器扩展工具能力
- **自定义工具** — 可自行定义工具的名称、描述和参数 Schema
- **Agent 专用工具** — 记忆（remember/recall）、自问自答（ask_self）、需求审查（review_requirements）等

### 📚 知识库
- **文件上传** — 支持 TXT、Markdown、JSON、CSV 等文本格式
- **文本分块** — 自动将长文本按语义分块（500 字符/块，50 字符重叠）
- **向量检索** — 基于 transformers.js（all-MiniLM-L6-v2 模型）本地生成 384 维向量嵌入
- **语义搜索** — 计算余弦相似度，返回最相关的知识片段
- **持久化存储** — 使用 IndexedDB 存储文件数据、分块和向量

### 💾 记忆系统
- **短期记忆** — 当前会话的对话历史
- **长期记忆** — 跨会话的关键事实存储（基于 localStorage）
- **记忆工具** — Agent 可通过 `remember`/`recall` 工具自主管理记忆

### 🎨 界面体验
- **暗色/亮色主题** — 支持主题切换，使用 Tailwind CSS 构建
- **响应式布局** — 侧边栏 + 主区域的经典三栏布局
- **对话管理** — 创建、搜索、置顶、删除对话
- **自定义标题栏** — macOS 风格的无边框窗口设计

## 🛠️ 技术栈

| 类别 | 技术选型 |
|------|----------|
| 框架 | Electron + React 19 + TypeScript |
| 构建工具 | electron-vite + Vite 6 |
| 包管理器 | pnpm |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 持久化 | localStorage + IndexedDB（idb） |
| Markdown 渲染 | marked + highlight.js + KaTeX |
| 向量化 | @huggingface/transformers（Xenova/all-MiniLM-L6-v2） |
| 图标库 | lucide-react |
| ID 生成 | uuid |

## 📁 项目结构

```
electron-aitool/
├── electron/                        # Electron 主进程
│   ├── main/
│   │   ├── index.ts                 # 主进程入口（窗口创建、IPC 处理）
│   │   └── mcp-proxy.ts            # MCP 代理（解决 CORS 跨域问题）
│   └── preload/
│       └── index.ts                 # 预加载脚本（安全暴露 API）
│
├── src/                             # React 渲染进程
│   ├── main.tsx                     # React 入口
│   ├── App.tsx                      # 根组件（布局管理）
│   │
│   ├── types/                       # TypeScript 类型定义
│   │   ├── agent.ts                 # Agent 相关类型
│   │   ├── message.ts               # 消息类型
│   │   ├── conversation.ts          # 对话类型
│   │   ├── tool.ts                  # 工具/MCP 类型
│   │   ├── config.ts                # 全局配置类型
│   │   └── knowledge-base.ts        # 知识库类型
│   │
│   ├── stores/                      # Zustand 状态管理
│   │   ├── agent-store.ts           # Agent 配置状态
│   │   ├── conversation-store.ts    # 对话和消息状态
│   │   ├── settings-store.ts        # 用户设置状态
│   │   ├── global-config-store.ts   # 全局配置状态
│   │   └── knowledge-base-store.ts  # 知识库状态
│   │
│   ├── services/                    # 核心服务层
│   │   ├── ai-service.ts            # AI API 流式请求服务
│   │   ├── agent-engine.ts          # Agent 引擎（ReAct 循环）
│   │   ├── tool-service.ts          # 工具定义与执行
│   │   ├── built-in-tools.ts        # 内置工具定义
│   │   ├── mcp-service.ts           # MCP 协议客户端
│   │   ├── memory-service.ts        # 记忆管理服务
│   │   ├── embedding-service.ts     # 文本向量化服务
│   │   ├── knowledge-base-service.ts # 知识库管理服务
│   │   └── db-service.ts            # IndexedDB 存储服务
│   │
│   ├── components/                  # UI 组件
│   │   ├── layout/                  # 布局组件
│   │   │   ├── Sidebar.tsx          # 侧边栏
│   │   │   ├── MainArea.tsx         # 主区域
│   │   │   └── TopBar.tsx           # 顶部栏
│   │   ├── chat/                    # 聊天组件
│   │   │   ├── ChatWindow.tsx       # 聊天窗口
│   │   │   ├── MessageItem.tsx      # 消息气泡
│   │   │   ├── MessageInput.tsx     # 输入框（支持图片上传）
│   │   │   ├── AgentSelector.tsx    # Agent 选择器
│   │   │   ├── AgentStepDisplay.tsx # Agent 步骤展示
│   │   │   ├── ThinkingSection.tsx  # 思考过程展示
│   │   │   └── ToolCallDisplay.tsx  # 工具调用展示
│   │   ├── conversation/            # 对话管理组件
│   │   │   └── ConversationList.tsx # 对话列表
│   │   ├── settings/                # 设置面板组件
│   │   │   ├── SettingsPanel.tsx    # 通用设置
│   │   │   ├── AgentManager.tsx     # Agent 管理
│   │   │   ├── KnowledgeBasePanel.tsx # 知识库面板
│   │   │   ├── ToolEditor.tsx       # 工具编辑器
│   │   │   └── MCPConfig.tsx        # MCP 服务器配置
│   │   └── ui/
│   │       └── MarkdownRenderer.tsx # Markdown 渲染组件
│   │
│   ├── hooks/                       # 自定义 Hooks
│   │   └── use-chat.ts             # 聊天逻辑 Hook
│   │
│   ├── constants/                   # 常量定义
│   │   └── default-agents.ts        # 默认 Agent 配置
│   │
│   ├── utils/                       # 工具函数
│   │   └── conversation-utils.ts    # 对话相关工具函数
│   │
│   └── styles/
│       └── globals.css              # 全局样式
│
├── prompts/                         # 提示词模板
│   └── requirement-analyst-agent.md # 需求分析 Agent 提示词
│
├── plans/                           # 设计文档
│   └── architecture.md              # 架构设计文档
│
├── electron.vite.config.ts          # electron-vite 构建配置
├── electron-builder.yml             # Electron Builder 打包配置
├── tailwind.config.js               # Tailwind CSS 配置
├── tsconfig.json                    # TypeScript 配置
├── package.json                     # 项目依赖和脚本
└── pnpm-lock.yaml                   # 依赖锁定文件
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **pnpm** >= 8

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

启动后将同时运行 Vite 开发服务器和 Electron 窗口，支持热模块替换（HMR）。

### 构建打包

```bash
# 仅构建
pnpm build

# 构建并打包（Windows）
pnpm build:win

# 构建并打包（macOS）
pnpm build:mac

# 构建并打包（Linux）
pnpm build:linux
```

打包产物将输出到 `dist/` 目录。

## ⚙️ 配置说明

### API 配置

首次使用需要在设置面板中配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 你的 API 密钥 | （必填） |
| Base URL | API 端点地址 | `https://api.openai.com/v1` |
| 模型 | 默认使用的模型 | `gpt-4o-mini` |
| Temperature | 生成随机性（0-2） | `0.7` |
| Max Tokens | 最大输出长度 | `4096` |
| 流式输出 | 是否启用流式响应 | `开启` |

**兼容的服务提供商：**
- OpenAI（GPT-4o、GPT-4o-mini 等）
- DeepSeek（DeepSeek-V3、DeepSeek-R1 等）
- Ollama（本地部署的开源模型）
- 其他兼容 OpenAI API 格式的服务

### MCP 服务器配置

可在设置面板中添加 MCP 服务器，配置格式：

```json
{
  "name": "文件系统工具",
  "url": "http://localhost:3001",
  "enabled": true,
  "description": "提供文件读写操作"
}
```

### Agent 配置

每个 Agent 可独立配置：

- **系统提示词** — 定义 Agent 的身份、目标和行为规范
- **绑定工具** — 选择 Agent 可使用的工具列表
- **规划策略** — ReAct / Plan-and-Execute / Trial-and-Error
- **记忆配置** — 历史轮数、长期记忆开关、跨会话记忆
- **终止条件** — 最大步数、超时时间、自动停止
- **模型覆盖** — 可为特定 Agent 指定不同的模型参数

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主进程                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  窗口管理    │  │  IPC 处理器   │  │  MCP 代理      │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ IPC
┌────────────────────────▼────────────────────────────────┐
│                    React 渲染进程                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │                    UI 层                            │  │
│  │  Sidebar │ ChatWindow │ Settings │ AgentManager    │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │                  状态管理层（Zustand）                │  │
│  │  AgentStore │ ConversationStore │ SettingsStore     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │                    服务层                            │  │
│  │  AI Service │ Agent Engine │ Tool Service           │  │
│  │  MCP Service │ Memory Service │ Knowledge Base      │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │                  存储层                              │  │
│  │          localStorage │ IndexedDB                   │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
   ┌─────────────┐             ┌──────────────┐
   │  OpenAI API  │             │  MCP 服务器   │
   └─────────────┘             └──────────────┘
```

## 📄 开源协议

[MIT License](LICENSE)
