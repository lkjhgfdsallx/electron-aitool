export type {
  AgentProfile,
  AgentScope,
  AgentProfileCreateInput,
  AgentProfileUpdateInput,
  AgentStep,
  AgentStepType,
  AgentRunStatus,
  AgentRunContext,
  PlanningStrategy,
  MemoryConfig,
  TerminationConfig,
  AgentModelConfig,
  SystemAgentTag,
  ContextPolicy,
  ApprovalPolicy
} from './agent'
export { SYSTEM_AGENT_TAGS } from './agent'

// Agent 工作流状态机
export type {
  AgentWorkflow,
  WorkflowState,
  WorkflowTransition,
  TransitionCondition,
  TransitionConditionType,
  WorkflowRuntimeState,
} from './agent-workflow'
export { isTerminalState, validateWorkflow } from './agent-workflow'

// 结构化任务规划
export type {
  AgentTaskStatus,
  AgentPlanStatus,
  AgentTask,
  AgentPlan,
  CreatePlanTaskInput,
  CreatePlanInput,
  UpdateTaskInput,
} from './agent-plan'
export {
  getPlanProgress,
  isPlanDone,
  hasPlanFailed,
  getReadyTasks,
  topologicalSort,
} from './agent-plan'
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
  TerminalLog,
  TerminalLogCreateInput,
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
export type {
  Skill,
  SkillCreateInput,
  SkillUpdateInput,
  SkillSummary,
  SkillLocation,
} from './skill'
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
  PostWriteLintConfig,
  PostWriteLintCustomCommand,
  FolderSelectResult,
  CreateCheckpointParams,
  RestoreConfirmInfo,
  ToolGroup,
  AgentToolPermission,
  AutoApprovalConfig,
} from './workspace'
export {
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_WORKSPACE_INPUT,
  DEFAULT_AUTO_APPROVAL_CONFIG,
  DEFAULT_POST_WRITE_LINT_CONFIG,
} from './workspace'

// AI Changes（对话回合级文件变更）
export type {
  AiFileChange,
  AiTurnChanges,
  AiFileChangeDraft,
  AiTurnBuffer,
  AiTurnChangesStored,
  AiTurnRestoreResult,
  UnifiedDiffOptions,
  LineStats,
} from './ai-changes'
export { computeUnifiedDiffAndStats, simpleHash } from './ai-changes'

// Git SCM
export type {
  GitFileStatus,
  GitChangeSide,
  GitFileChange,
  GitBranchInfo,
  GitRemoteInfo,
  GitStashEntry,
  GitTagInfo,
  GitLogEntry,
  GitRepoState,
  GitStatusResult,
  GitDiffResult,
  GitRunResult,
  GitOutputLine,
  GitCommitOptions,
  GitPushOptions,
  GitPullOptions,
  GitCloneOptions,
  GitCheckoutOptions,
  GitDiscardOptions,
  GitStashPushOptions,
  GitIpcResult,
} from './git'

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

/**
 * Electron globalShortcut 不支持的原始键名（如逗号、句号等标点符号）。
 * 这些快捷键组合在注册时会失败，UI 层需要提示用户。
 */
export const GLOBAL_SHORTCUT_UNSUPPORTED_KEYS = new Set([
  ',',  // Comma
  '.',  // Period
  "'",  // Quote（单引号）
  ';',  // Semicolon
])

/** 检查一个快捷键绑定是否被 Electron globalShortcut 支持 */
export function isShortcutBindingSupported(binding: ShortcutBinding): boolean {
  return !GLOBAL_SHORTCUT_UNSUPPORTED_KEYS.has(binding.key)
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
  /** 被禁用的内置工具 ID 列表（仅 BUILT_IN_TOOLS，不影响 AGENT_BUILTIN_TOOLS 和 WORKSPACE_TOOLS） */
  disabledBuiltinToolIds: string[]
  /** 网页分析使用的 Chrome / Edge 可执行文件路径 */
  browserExecutablePath: string
}
