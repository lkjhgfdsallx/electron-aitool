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
