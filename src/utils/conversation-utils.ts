
/**
 * 从消息内容生成简单的对话标题
 * 不依赖 AI，纯本地函数
 */
export function generateTitleFromContent(content: string): string {
  if (!content || !content.trim()) return '新对话'

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

  // 限制标题长度
  const MAX_LENGTH = 30
  if (firstLine.length > MAX_LENGTH) {
    return firstLine.slice(0, MAX_LENGTH) + '...'
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
