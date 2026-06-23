
import { useGlobalConfigStore } from '../stores/global-config-store'

/**
 * 清理用户消息中的 Markdown 和附件标记，提取纯文本
 */
function cleanMessageText(content: string): string {
  let text = content.trim()
  // 去除 markdown 图片语法 ![alt](url)
  text = text.replace(/!\[.*?\]\(.*?\)/g, '')
  // 去除 markdown 链接语法 [text](url)，保留 text
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1')
  // 去除 markdown 标题标记
  text = text.replace(/^#{1,6}\s+/gm, '')
  // 去除代码块
  text = text.replace(/```[\s\S]*?```/g, '')
  // 去除行内代码
  text = text.replace(/`([^`]+)`/g, '$1')
  // 去除粗体和斜体标记
  text = text.replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
  // 去除文件附件标记
  text = text.replace(/\[文件:.*?\]/g, '')
  text = text.replace(/\[附件:.*?\]/g, '')
  text = text.replace(/---\s*文件:.*?---[\s\S]*?---\s*文件结束\s*---/g, '')
  // 清理多余空白
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/**
 * 通过 AI 模型生成对话标题
 * 使用用户配置的 API 发送一个轻量级的非流式请求
 */
async function generateTitleWithAI(content: string): Promise<string | null> {
  try {
    const config = useGlobalConfigStore.getState()
    if (!config.apiKey || !config.baseUrl) return null

    // 清理文本，截取前 500 字避免 token 浪费
    const cleaned = cleanMessageText(content).slice(0, 500)
    if (!cleaned) return null

    const baseUrl = config.baseUrl.replace(/\/+$/, '')

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.defaultModel,
        messages: [
          {
            role: 'system',
            content:
              '你是一个标题生成器。根据用户的消息内容，生成一个简短的对话标题。' +
              '要求：1) 5-20个字符；2) 准确概括消息核心主题；3) 只输出标题文字本身，不要加引号、句号或其他标点符号；4) 使用与消息相同的语言'
          },
          {
            role: 'user',
            content: cleaned
          }
        ],
        temperature: 0.3,
        max_tokens: 50,
        stream: false
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) return null

    const data = await response.json()
    const title = data.choices?.[0]?.message?.content?.trim()

    if (!title) return null

    // 清理 AI 返回的标题：去除可能的引号、多余空白等
    const cleanedTitle = title
      .replace(/^["'"「『【（(]+/, '')
      .replace(/["'"」』】）)\s.。!！?？]+$/, '')
      .replace(/\n/g, '')
      .trim()

    // 验证标题合理性：长度在 2-30 之间
    if (cleanedTitle.length < 2 || cleanedTitle.length > 30) return null

    return cleanedTitle
  } catch {
    return null
  }
}

/**
 * 从消息内容生成对话标题（异步）
 * 优先使用 AI 模型生成语义准确的标题
 * 降级方案：主进程 TextRank + jieba 分词 → 简单截断
 */
export async function generateTitleFromContent(content: string): Promise<string> {
  if (!content || !content.trim()) return '新对话'

  // 1. 优先使用 AI 生成标题（最准确）
  const aiTitle = await generateTitleWithAI(content)
  if (aiTitle) return aiTitle

  // 2. 降级：通过 IPC 调用主进程的 TextRank + jieba 分词标题生成
  try {
    if (window.electronAPI?.title?.generate) {
      const title = await window.electronAPI.title.generate(content)
      if (title && title !== '新对话') return title
    }
  } catch {
    // IPC 调用失败，继续降级
  }

  // 3. 最终降级：简单清理文本后截取
  return fallbackGenerateTitle(content)
}

/**
 * 回退方案：简单清理文本后截取前 10 字作为标题
 */
function fallbackGenerateTitle(content: string): string {
  // 去除首尾空白
  let title = content.trim()

  // 去除 markdown 图片语法 ![alt](url)
  title = title.replace(/!\[.*?\]\(.*?\)/g, '')
  // 去除 markdown 链接语法 [text](url)，保留 text
  title = title.replace(/\[(.*?)\]\(.*?\)/g, '$1')
  // 去除 markdown 标题标记
  title = title.replace(/^#{1,6}\s+/gm, '')
  // 去除代码块
  title = title.replace(/```[\s\S]*?```/g, '')
  // 去除行内代码
  title = title.replace(/`([^`]+)`/g, '$1')
  // 去除粗体和斜体标记
  title = title.replace(/(\*{1,3}|_{1,3})(.*?)/g, '$2')
  // 去除文件附件标记
  title = title.replace(/\[文件:.*?\]/g, '')
  title = title.replace(/\[附件:.*?\]/g, '')
  title = title.replace(/---\s*文件:.*?---[\s\S]*?---\s*文件结束\s*---/g, '')

  // 清理多余空白
  title = title.replace(/\s+/g, ' ').trim()

  // 取第一行作为标题
  const firstLine = title.split('\n')[0].trim()

  if (!firstLine) return '新对话'

  // 限制标题长度为 10 字
  const MAX_LENGTH = 10
  if (firstLine.length > MAX_LENGTH) {
    return firstLine.slice(0, MAX_LENGTH)
  }

  return firstLine
}

/**
 * 格式化时间戳为友好的日期时间字符串
 */
export function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const fullDateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

  if (dateDay.getTime() === today.getTime()) {
    return `今天 ${timeStr}`
  } else if (dateDay.getTime() === yesterday.getTime()) {
    return `昨天 ${timeStr}`
  } else if (now.getTime() - timestamp < 7 * 86400000) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `${weekdays[date.getDay()]} ${timeStr}`
  }

  return fullDateStr
}

/**
 * 导出对话原始数据为 JSON 字符串
 * @param conversation 对话元数据
 * @param messages 该对话的所有消息
 * @returns 格式化的 JSON 字符串
 */
export function exportConversationToJson(
  conversation: { id: string; title: string; createdAt: number; updatedAt: number; agentId?: string },
  messages: Array<Record<string, unknown>>
): string {
  const exportData = {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: new Date(conversation.createdAt).toISOString(),
      updatedAt: new Date(conversation.updatedAt).toISOString(),
      agentId: conversation.agentId ?? null,
      messageCount: messages.length
    },
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      reasoningContent: msg.reasoningContent ?? null,
      timestamp: msg.timestamp ? new Date(msg.timestamp as number).toISOString() : null,
      toolCalls: msg.toolCalls ?? null,
      toolCallId: msg.toolCallId ?? null,
      toolName: msg.toolName ?? null,
      isError: msg.isError ?? false,
      isEdited: msg.isEdited ?? false,
      parentId: msg.parentId ?? null,
      attachments: msg.attachments ?? null,
      agentSteps: msg.agentSteps ?? null,
      agentId: msg.agentId ?? null,
      branchIndex: msg.branchIndex ?? null,
      branchCount: msg.branchCount ?? null
    }))
  }

  return JSON.stringify(exportData, null, 2)
}
