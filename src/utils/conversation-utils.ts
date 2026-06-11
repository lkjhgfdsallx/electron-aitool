
/**
 * 从消息内容生成对话标题（异步）
 * 使用主进程的 TextRank + jieba 分词算法，生成 5~10 字的提取式摘要标题
 * 如果主进程不可用，回退到简单的截断方式
 */
export async function generateTitleFromContent(content: string): Promise<string> {
  if (!content || !content.trim()) return '新对话'

  try {
    // 优先通过 IPC 调用主进程的 TextRank + jieba 分词标题生成
    if (window.electronAPI?.title?.generate) {
      const title = await window.electronAPI.title.generate(content)
      if (title && title !== '新对话') return title
    }
  } catch {
    // IPC 调用失败，回退到简单方式
  }

  // 回退方案：简单清理文本后截取前 10 字
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
