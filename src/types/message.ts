// ==================== 消息相关类型 ====================

import type { AgentStep } from './agent'
import type { AgentPlan } from './agent-plan'

/** 网站分析实时进度 */
export interface SiteAnalyzerLiveProgress {
  /** 当前阶段 */
  phase: 'browser' | 'login' | 'crawling' | 'analyzing' | 'report' | 'completed' | 'error'
  /** 进度消息 */
  message: string
  /** 已爬取页面数 */
  pagesCrawled?: number
  /** 总页面数（估计） */
  totalPages?: number
  /** 已发现API数 */
  apisFound?: number
  /** 已分析页面数 */
  pagesAnalyzed?: number
  /** 当前正在处理的URL */
  currentUrl?: string
  /** 分析开始时间 */
  startTime: number
  /** 错误信息 */
  error?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: string // JSON 字符串
  result?: string
  status: 'pending' | 'running' | 'completed' | 'error'
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 消息附件 */
export interface MessageAttachment {
  name: string
  type: string   // MIME 类型，如 'image/png'、'text/plain'
  content: string // 图片为 base64 data URL，文本为纯文本内容
  size: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoningContent?: string // 思考过程（如 DeepSeek R1）
  timestamp: number
  tokenUsage?: TokenUsage
  toolCalls?: ToolCall[]
  toolCallId?: string   // 工具返回结果时关联的调用 ID
  toolName?: string     // 工具返回结果时的工具名称
  isStreaming?: boolean
  isError?: boolean
  /** 任务是否被中断（应用重启后检测到残留的 isStreaming 标记） */
  wasInterrupted?: boolean
  /** 流式完成的 finish_reason：'stop' 正常结束、'length' 达到 max_tokens 截断、'abort' 中断 */
  finishReason?: string
  isEdited?: boolean
  parentId?: string     // 重新生成时关联的原始消息 ID
  attachments?: MessageAttachment[] // 附件列表
  /** 是否存在网站分析报告（报告 HTML 存储在 IndexedDB 中） */
  hasReport?: boolean
  /** 网站分析实时进度（分析进行中时填充，完成后清除） */
  siteAnalyzerProgress?: SiteAnalyzerLiveProgress
  /** Agent 执行步骤（Agent 模式下的思考链、工具调用等） */
  agentSteps?: AgentStep[]
  /** Agent 结构化执行计划（Phase 3：plan-and-execute 策略产出） */
  agentPlan?: AgentPlan
  /** 关联的 Agent ID */
  agentId?: string
  /** Agent 运行的唯一 ID（用于 checkpoint 恢复） */
  agentRunId?: string
  /** 分支索引（对话分支功能，0 为主分支） */
  branchIndex?: number
  /** 分支总数（仅在分支点用户消息上设置，表示该处分叉的数量） */
  branchCount?: number
  /** 扩展元数据（压缩标记、自定义数据等） */
  metadata?: Record<string, unknown>
}

export type MessageCreateInput = Omit<Message, 'id' | 'timestamp'>
