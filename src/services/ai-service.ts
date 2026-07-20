import type { Message, ResolvedAIConfig, ToolDefinition, ProviderRequestConfig } from '../types'

/**
 * 按 baseUrl 记录上次请求完成时间，用于 Provider 级 API 请求频率限制。
 * key = 规范化后的 baseUrl
 */
const lastRequestAtByBaseUrl = new Map<string, number>()

/**
 * 在发起请求前按 minRequestIntervalSeconds 等待，支持 AbortSignal 中断。
 * 0 / 未配置 = 不限制。
 */
async function waitForRequestInterval(
  baseUrl: string,
  minRequestIntervalSeconds: number | undefined,
  signal: AbortSignal
): Promise<void> {
  const intervalMs = Math.max(0, (minRequestIntervalSeconds ?? 0) * 1000)
  if (intervalMs <= 0) return

  const key = baseUrl.replace(/\/+$/, '')
  const lastAt = lastRequestAtByBaseUrl.get(key) ?? 0
  const elapsed = Date.now() - lastAt
  const waitMs = intervalMs - elapsed
  if (waitMs <= 0) return

  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, waitMs)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function markRequestCompleted(baseUrl: string): void {
  lastRequestAtByBaseUrl.set(baseUrl.replace(/\/+$/, ''), Date.now())
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onReasoningToken?: (token: string) => void
  onToolCalls?: (toolCalls: Array<{ id: string; name: string; arguments: string }>) => void
  onUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void
  /**
   * @param finishReason - 完成原因: 'stop'(正常结束), 'length'(达到max_tokens截断), 'abort'(超时/中断), 'error'(异常结束)
   */
  onDone: (finishReason?: string) => void
  onError: (error: string) => void
}

interface ChatCompletionMessage {
  role: string
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

/**
 * AI 服务 - 兼容 OpenAI API 格式的流式请求
 * 支持：OpenAI、DeepSeek、Ollama 等兼容接口
 * 增强：支持自定义请求头、超时、重试
 */
export const aiService = {
  /**
   * 发送聊天请求（流式）
   */
  async streamChat(
    messages: Message[],
    config: ResolvedAIConfig,
    systemPrompt: string | null,
    tools: ToolDefinition[],
    signal: AbortSignal,
    callbacks: StreamCallbacks,
    requestConfig?: ProviderRequestConfig
  ): Promise<void> {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    const model = config.model
    const temperature = config.temperature
    const maxTokens = config.maxTokens

    // 对于本地模型，apiKey 可以为空
    const isLocal = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1')
    if (!apiKey && !isLocal) {
      callbacks.onError('请先配置 API Key')
      return
    }

    // 构建请求消息
    const requestMessages: ChatCompletionMessage[] = []

    // 系统提示词
    if (systemPrompt) {
      requestMessages.push({
        role: 'system',
        content: systemPrompt
      })
    }

    // 对话消息
    for (const msg of messages) {
      if (msg.role === 'tool') {
        requestMessages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId!,
          name: msg.toolName
        })
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        requestMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments
            }
          }))
        })
      } else if (msg.role === 'user') {
        // 处理附件
        if (msg.attachments && msg.attachments.length > 0) {
          const hasImages = msg.attachments.some(att => att.type.startsWith('image/'))
          
          if (hasImages) {
            // 多模态格式（含图片）
            const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
            
            // 构建文本部分：用户消息 + 非图片附件内容
            let textPart = msg.content || ''
            for (const att of msg.attachments) {
              if (!att.type.startsWith('image/') && att.content && !att.content.startsWith('data:')) {
                textPart += `\n\n--- 文件: ${att.name} ---\n${att.content}\n--- 文件结束 ---`
              }
            }
            if (textPart.trim()) {
              content.push({ type: 'text', text: textPart })
            }
            
            // 添加图片
            for (const att of msg.attachments) {
              if (att.type.startsWith('image/')) {
                content.push({
                  type: 'image_url',
                  image_url: { url: att.content }
                })
              }
            }
            
            requestMessages.push({
              role: 'user',
              content
            })
          } else {
            // 纯文本格式（含非图片附件的文本内容）
            let fullContent = msg.content || ''
            for (const att of msg.attachments) {
              if (att.content && !att.content.startsWith('data:')) {
                fullContent += `\n\n--- 文件: ${att.name} ---\n${att.content}\n--- 文件结束 ---`
              }
            }
            requestMessages.push({
              role: 'user',
              content: fullContent
            })
          }
        } else {
          requestMessages.push({
            role: msg.role,
            content: msg.content
          })
        }
      } else {
        requestMessages.push({
          role: msg.role,
          content: msg.content
        })
      }
    }

    // 构建请求体
    const body: Record<string, unknown> = {
      model,
      messages: requestMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    }

    // 添加工具定义（如果有）
    if (tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    // 构建请求 headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // 合并自定义 headers
    if (requestConfig?.customHeaders) {
      Object.assign(headers, requestConfig.customHeaders)
    }

    // Provider 级请求频率限制：两次请求之间的最短间隔
    try {
      await waitForRequestInterval(baseUrl, requestConfig?.minRequestIntervalSeconds, signal)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        callbacks.onDone('abort')
        return
      }
      throw error
    }

    // 单次请求（带重试）
    let lastError: string = ''
    const maxRetries = requestConfig?.maxRetries || 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this._doStreamRequest(
          `${baseUrl}/chat/completions`,
          headers,
          body,
          signal,
          requestConfig?.timeout,
          callbacks
        )
        markRequestCompleted(baseUrl)
        return // 请求成功，_doStreamRequest 内部已调用 onDone
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          callbacks.onDone('abort')
          return
        }
        lastError = error instanceof Error ? error.message : '未知错误'
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    // 如果重试全部失败
    if (lastError) {
      callbacks.onError(lastError)
    }
  },

  /**
   * 执行单次流式请求
   *
   * 特性：
   * - 无超时限制：只要数据还在流动就不会中断，完全依赖服务端和用户手动取消
   * - 检测 finish_reason：识别模型是否因达到 max_tokens 而被截断
   * - 检测流中断：连接关闭但未收到 [DONE] 标记时，标记为异常中断
   */
  async _doStreamRequest(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    signal: AbortSignal,
    _timeout?: number,
    callbacks?: StreamCallbacks
  ): Promise<void> {
    // 直接使用外部 signal，不做任何超时限制
    const controller = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }

    // 用于追踪是否正常收到 [DONE] 标记
    let receivedDone = false
    // 追踪模型返回的 finish_reason
    let lastFinishReason: string | undefined

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `API 请求失败 (${response.status})`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let currentToolCalls: Array<{
        index: number
        id: string
        name: string
        arguments: string
      }> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            receivedDone = true
            // 处理累积的工具调用（过滤稀疏数组空洞，防止 undefined 元素传播到渲染层）
            if (currentToolCalls.length > 0) {
              callbacks?.onToolCalls?.(
                currentToolCalls
                  .filter(Boolean)
                  .map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.arguments
                  }))
              )
            }
            callbacks?.onDone(lastFinishReason || 'stop')
            return
          }

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            const choice = parsed.choices?.[0]

            // 检测 finish_reason（某些 API 在 delta 中也会携带）
            if (choice?.finish_reason) {
              lastFinishReason = choice.finish_reason
            }

            if (!delta) continue

            // 处理推理内容（DeepSeek R1 等模型）
            if (delta.reasoning_content) {
              callbacks?.onReasoningToken?.(delta.reasoning_content)
            }

            // 处理普通内容
            if (delta.content) {
              callbacks?.onToken(delta.content)
            }

            // 处理工具调用增量
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0
                if (!currentToolCalls[index]) {
                  currentToolCalls[index] = {
                    index,
                    id: tc.id || '',
                    name: '',
                    arguments: ''
                  }
                }
                if (tc.id) currentToolCalls[index].id = tc.id
                if (tc.function?.name) currentToolCalls[index].name += tc.function.name
                if (tc.function?.arguments)
                  currentToolCalls[index].arguments += tc.function.arguments
              }
            }

            // 处理 token 用量
            if (parsed.usage) {
              callbacks?.onUsage?.({
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens
              })
            }
          } catch (parseError) {
            console.warn('[ai-service] 解析 SSE 数据块失败:', data.substring(0, 200), parseError)
          }
        }
      }

      // 流结束但未收到 [DONE] 标记 → 连接异常中断
      if (!receivedDone) {
        console.warn('[ai-service] 流连接异常中断：未收到 [DONE] 标记')
        // 如果有 finish_reason，说明模型侧正常结束但连接提前断开
        callbacks?.onDone(lastFinishReason || 'abort')
      } else {
        callbacks?.onDone(lastFinishReason || 'stop')
      }
    } finally {
      // 清理资源（无超时计时器需要清理）
    }
  }
}
