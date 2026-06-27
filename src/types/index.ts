export type {
  AgentProfile,
  AgentProfileCreateInput,
  AgentProfileUpdateInput,
  AgentStep,
  AgentStepType,
  AgentRunStatus,
  AgentRunContext,
  PlanningStrategy,
  MemoryConfig,
  TerminationConfig,
  AgentModelConfig
} from './agent'
export type {
  Prompt,
  PromptCreateInput,
  PromptUpdateInput,
  PromptVariable,
  PromptVariableType,
  PromptSection,
  PromptSectionType,
  PromptVersion,
  PromptABTest,
  PromptChain,
  PromptChainNode,
  VariableValidationResult,
  VariableRenderResult,
  PromptRuntimeContext,
  BuiltinContextVariable,
  DiffResult,
  DiffLine,
} from './prompt'
export { BUILTIN_CONTEXT_VARIABLES, SECTION_TYPE_META } from './prompt'
export type {
  Message,
  MessageCreateInput,
  MessageAttachment,
  ToolCall,
  TokenUsage,
  SiteAnalyzerLiveProgress
} from './message'
export type { Conversation, ConversationCreateInput } from './conversation'
export type {
  Tool,
  ToolFunction,
  ToolDefinition,
  ToolExecuteResult,
  ToolCreateInput,
  ToolCallStats,
  MCPServerConfig
} from './tool'
export type { GlobalConfig, ResolvedAIConfig } from './config'
export { DEFAULT_GLOBAL_CONFIG } from './config'
export type {
  KnowledgeCollection,
  KnowledgeCollectionCreateInput,
  KnowledgeBaseFile,
  KnowledgeBaseChunk,
  SearchResult,
  EmbeddingProviderType,
  EmbeddingProviderConfig,
  TfidfProviderConfig,
  LocalModelProviderConfig,
  OllamaProviderConfig,
  OpenAIApiProviderConfig,
  EmbeddingEngineMode,
  EmbeddingLoadPhase,
  EmbeddingEngineStatus,
  WorkerRequest,
  WorkerResponse,
  ChunkingMode,
  ChunkingConfig,
  RetrievalConfig,
  FileTypeCategory,
  FileTypeCategoryDef,
  KBPageViewMode,
  SearchMode,
  KBSearchResult,
  SimulatorResult
} from './knowledge-base'
export {
  DEFAULT_LOCAL_MODEL_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_API_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_RETRIEVAL_CONFIG,
  FILE_TYPE_CATEGORIES
} from './knowledge-base'
export type {
  AIProvider,
  AIProviderCreateInput,
  AIProviderUpdateInput,
  AIModel,
  ConversationAIConfig,
  ProviderType,
  ConnectionStatus,
  ConnectionHealth,
  ProviderRequestConfig,
  LocalModelConfig
} from './ai-provider'
export type {
  SettingItemMeta,
  SettingsRegistry,
  GroupedSettingsRegistry
} from './settings-meta'
export type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  CheckpointIndex,
  CheckpointDetail,
  CheckpointFileChange,
  CheckpointPolicy,
  CheckpointType,
  CommandPolicy,
  CommandRiskLevel,
  CommandApprovalResult,
  CommandApprovalRequest,
  ContextConfig,
  FolderSelectResult,
  CreateCheckpointParams,
  RestoreConfirmInfo,
} from './workspace'
export { DEFAULT_CONTEXT_CONFIG, DEFAULT_WORKSPACE_INPUT } from './workspace'

// ==================== 界面偏好类型 ====================

export type ThemeMode = 'light' | 'dark' | 'system'

// ---- 代码高亮主题 ----
export type CodeHighlightTheme =
  | 'github-dark'
  | 'github'
  | 'vs2015'
  | 'atom-one-dark'
  | 'atom-one-light'
  | 'monokai-sublime'
  | 'nord'
  | 'tokyo-night-dark'
  | 'night-owl'

// ---- 消息布局 ----
export type MessageAlignment = 'left-right' | 'all-left' | 'all-right' | 'full-width'

// ---- 快捷键绑定 ----
export interface ShortcutBinding {
  key: string          // 如 'n', '/', ','
  modifiers: string[]  // 如 ['Ctrl', 'Shift']
}

export interface ShortcutConfig {
  newConversation: ShortcutBinding
  toggleSidebar: ShortcutBinding
  openSettings: ShortcutBinding
  switchNextAgent: ShortcutBinding
  switchPrevAgent: ShortcutBinding
  focusInput: ShortcutBinding
}

export const DEFAULT_SHORTCUT_CONFIG: ShortcutConfig = {
  newConversation: { key: 'n', modifiers: ['Ctrl'] },
  toggleSidebar: { key: 'b', modifiers: ['Ctrl'] },
  openSettings: { key: ',', modifiers: ['Ctrl'] },
  switchNextAgent: { key: ']', modifiers: ['Ctrl'] },
  switchPrevAgent: { key: '[', modifiers: ['Ctrl'] },
  focusInput: { key: '/', modifiers: ['Ctrl'] },
}

export interface UIPreferences {
  theme: ThemeMode
  showTokenUsage: boolean
  showTimestamp: boolean
  fontSize: number               // 12-24 px，精确字号
  fontFamily: string             // 消息字体族
  codeFontFamily: string         // 代码字体族
  codeFontSize: number           // 代码字号 12-20 px
  codeHighlightTheme: CodeHighlightTheme
  messageAlignment: MessageAlignment
  showAvatar: boolean            // 是否显示头像
  sidebarCollapsed: boolean
  sidebarWidth: number           // 侧边栏宽度 200-480 px
  sendWithEnter: boolean         // Enter 发送, Shift+Enter 换行
  webSearchEnabled: boolean      // 联网搜索开关
  // 通知设置
  enableNotification: boolean    // 后台对话完成系统通知
  enableSound: boolean           // 声音提示
  notificationSound: string      // 提示音文件名
  // 快捷键
  shortcuts: ShortcutConfig
}
