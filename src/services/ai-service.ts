import type { Message, GlobalConfig, ToolDefinition } from '../types'

export interface StreamCallbacks {
  onToken: (token: string) => void
  onReasoningToken?: (token: string) => void
  onToolCalls?: (toolCalls: Array<{ id: string; name: string; arguments: string }>) => void
  onUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void
  onDone: () => void
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
 */
export const aiService = {
  /**
   * 发送聊天请求（流式）
   */
  async streamChat(
    messages: Message[],
    config: GlobalConfig,
    systemPrompt: string | null,
    tools: ToolDefinition[],
    signal: AbortSignal,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    const model = config.defaultModel
    const temperature = config.temperature
    const maxTokens = config.maxTokens

    if (!apiKey) {
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

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal
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
        callbacks.onError(errorMessage)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError('无法读取响应流')
        return
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
            // 处理累积的工具调用
            if (currentToolCalls.length > 0) {
              callbacks.onToolCalls?.(
                currentToolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments
                }))
              )
            }
            callbacks.onDone()
            return
          }

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            // 处理推理内容（DeepSeek R1 等模型）
            if (delta.reasoning_content) {
              callbacks.onReasoningToken?.(delta.reasoning_content)
            }

            // 处理普通内容
            if (delta.content) {
              callbacks.onToken(delta.content)
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
              callbacks.onUsage?.({
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens
              })
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      callbacks.onDone()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        callbacks.onDone()
        return
      }
      const message = error instanceof Error ? error.message : '未知错误'
      callbacks.onError(message)
    }
  }
}
