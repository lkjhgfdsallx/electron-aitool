/**
 * ContextManager - 上下文压缩管理器（Phase 4 / §4.3）
 *
 * 监控 Agent 消息列表的 token 估算，超过阈值时触发摘要压缩：
 * 1. 保留最近 N 轮原始消息（keepRecentTurns）
 * 2. 对更早的消息（含工具调用链）调用 LLM 生成摘要
 * 3. 用一条 system 消息 `[历史摘要] ...` 替换被压缩的部分
 *
 * 发布 `context_compressed` 事件供 UI 显示压缩指示器。
 *
 * 策略：
 * - 'fixed'：超阈值时直接丢弃早期消息（保留最近 N 轮），不调用 LLM
 * - 'compress'：超阈值时调用 LLM 摘要早期消息
 */

import type { ContextPolicy, ResolvedAIConfig } from '../../types'
import { agentEventBus } from './event-bus'

/** 压缩器操作的消息结构（与 agent-engine.ts 的 AgentMessage 兼容） */
export interface CompressibleMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  toolCallId?: string
  toolName?: string
}

/** 压缩结果 */
export interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: CompressibleMessage[]
  /** 是否实际发生了压缩 */
  compressed: boolean
  /** 压缩前的估算 token 数 */
  beforeTokens: number
  /** 压缩后的估算 token 数 */
  afterTokens: number
  /** 被压缩掉的原始轮数 */
  compressedTurns: number
}

/** 默认上下文策略（未配置 contextPolicy 时使用） */
export const DEFAULT_CONTEXT_POLICY: Required<ContextPolicy> = {
  strategy: 'fixed',
  maxTokens: 128000,
  keepRecentTurns: 6,
}

/**
 * 估算字符串的 token 数（字符数近似）
 *
 * 中文约 1 字 ≈ 1 token，英文约 4 字符 ≈ 1 token。
 * 采用混合近似：中文字符按 1:1，其余按 4:1，取上限避免低估。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // 统计 CJK 字符（中日韩统一表意 + 常见全角范围）
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const rest = text.length - cjk
  return cjk + Math.ceil(rest / 4)
}

/** 估算消息列表的总 token 数 */
export function estimateMessagesTokens(messages: CompressibleMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += estimateTokens(m.content)
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        total += estimateTokens(tc.arguments) + estimateTokens(tc.name)
      }
    }
  }
  // 每条消息的元数据开销（role 标记等）约 4 token
  return total + messages.length * 4
}

/**
 * 将消息序列列化为供 LLM 摘要的纯文本
 */
function messagesToTranscript(messages: CompressibleMessage[]): string {
  return messages.map((m) => {
    const roleLabel = { user: '用户', assistant: '助手', system: '系统', tool: '工具结果' }[m.role]
    let line = `[${roleLabel}] ${m.content}`
    if (m.toolCalls && m.toolCalls.length > 0) {
      line += `\n（工具调用: ${m.toolCalls.map((tc) => `${tc.name}(${tc.arguments})`).join('; ')}）`
    }
    if (m.toolName) {
      line += `\n（来自工具: ${m.toolName}）`
    }
    return line
  }).join('\n\n')
}

/**
 * 调用 LLM 生成摘要（非流式 fetch，兼容 OpenAI 格式）
 *
 * 不复用 aiService.streamChat 是因为它需要完整 Message[] 类型，
 * 摘要场景只需简单 system+user 两条消息，直接 fetch 更轻量。
 */
async function summarizeWithLLM(
  transcript: string,
  agentName: string,
  config: ResolvedAIConfig,
  signal: AbortSignal,
): Promise<string> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const isLocal = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey && !isLocal) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  const body = {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: `你是一个对话摘要助手。请将下面的 Agent "${agentName}" 的早期执行记录压缩为简洁的中文摘要，保留：关键决策、已完成的工具调用及其结果要点、未解决的问题、关键产物路径。忽略冗余的思考过程。用要点列表输出，不超过 500 字。`,
      },
      {
        role: 'user',
        content: `以下是早期执行记录，请生成摘要：\n\n${transcript}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 800,
    stream: false,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`摘要生成请求失败: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const summary: string = data?.choices?.[0]?.message?.content ?? ''
  return summary.trim() || '（摘要为空）'
}

/**
 * ContextManager
 */
export const contextManager = {
  /**
   * 按策略压缩消息列表（如未超阈值则原样返回）
   *
   * @param messages 当前消息列表
   * @param policy 上下文策略
   * @param agentName Agent 名称（用于摘要提示词）
   * @param config AI 配置（用于摘要 LLM 调用）
   * @param signal 中断信号
   * @param runId 关联的运行 id（用于事件）
   * @param agentId 关联的 Agent id（用于事件）
   */
  async compress(
    messages: CompressibleMessage[],
    policy: ContextPolicy | undefined,
    agentName: string,
    config: ResolvedAIConfig,
    signal: AbortSignal,
    runId: string,
    agentId: string,
  ): Promise<CompressionResult> {
    const p: Required<ContextPolicy> = { ...DEFAULT_CONTEXT_POLICY, ...policy }
    const beforeTokens = estimateMessagesTokens(messages)

    // 未超阈值，无需压缩
    if (beforeTokens <= p.maxTokens) {
      return {
        messages,
        compressed: false,
        beforeTokens,
        afterTokens: beforeTokens,
        compressedTurns: 0,
      }
    }

    // 计算保留边界：keepRecentTurns 表示保留最近的"轮"（一轮 = user + assistant + 可能的 tool）
    // 简化为按消息数：保留最后 keepRecentTurns 条消息
    const keepCount = Math.min(p.keepRecentTurns, messages.length)
    const toCompress = messages.slice(0, messages.length - keepCount)
    const toKeep = messages.slice(messages.length - keepCount)

    if (toCompress.length === 0) {
      return {
        messages,
        compressed: false,
        beforeTokens,
        afterTokens: beforeTokens,
        compressedTurns: 0,
      }
    }

    let compressedMessages: CompressibleMessage[]
    let afterTokens: number

    if (p.strategy === 'compress') {
      // 摘要压缩：调用 LLM 生成摘要
      const transcript = messagesToTranscript(toCompress)
      const summary = await summarizeWithLLM(transcript, agentName, config, signal)
      const summaryMessage: CompressibleMessage = {
        role: 'system',
        content: `[历史摘要]\n${summary}`,
      }
      compressedMessages = [summaryMessage, ...toKeep]
      afterTokens = estimateMessagesTokens(compressedMessages)
    } else {
      // fixed：直接丢弃早期消息
      compressedMessages = toKeep
      afterTokens = estimateMessagesTokens(compressedMessages)
    }

    const result: CompressionResult = {
      messages: compressedMessages,
      compressed: true,
      beforeTokens,
      afterTokens,
      compressedTurns: toCompress.length,
    }

    // 发布压缩事件
    agentEventBus.emit('context_compressed', {
      runId,
      agentId,
      payload: {
        beforeTokens,
        afterTokens,
        compressedTurns: toCompress.length,
        strategy: p.strategy,
      },
    })

    return result
  },

  /**
   * 判断是否需要压缩（不实际执行）
   */
  needsCompression(
    messages: CompressibleMessage[],
    policy: ContextPolicy | undefined,
  ): boolean {
    const p = { ...DEFAULT_CONTEXT_POLICY, ...policy }
    return estimateMessagesTokens(messages) > p.maxTokens
  },
}
