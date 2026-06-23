export type {
  Prompt,
  PromptCreateInput,
  PromptUpdateInput,
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
  MCPServerConfig
} from './tool'
export type { GlobalConfig, ResolvedAIConfig } from './config'
export { DEFAULT_GLOBAL_CONFIG } from './config'
export type {
  KnowledgeBaseFile,
  KnowledgeBaseChunk,
  SearchResult
} from './knowledge-base'
export type {
  AIProvider,
  AIProviderCreateInput,
  AIProviderUpdateInput,
  AIModel,
  ConversationAIConfig
} from './ai-provider'

// ==================== 界面偏好类型 ====================

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UIPreferences {
  theme: ThemeMode
  showTokenUsage: boolean
  showTimestamp: boolean
  fontSize: 'small' | 'medium' | 'large'
  sidebarCollapsed: boolean
  sendWithEnter: boolean // Enter 发送, Shift+Enter 换行
  webSearchEnabled: boolean // 联网搜索开关
}
