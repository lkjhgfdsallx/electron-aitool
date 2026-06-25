/**
 * 对话导出服务
 *
 * 支持将对话导出为 JSON / Markdown / HTML 三种格式
 * 支持单个对话导出和批量导出
 */

import type { Conversation, Message } from '../types'

// ==================== 格式化辅助函数 ====================

/** 格式化时间戳为可读字符串 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 角色显示名称映射 */
function getRoleLabel(role: string): string {
  switch (role) {
    case 'user': return 'User'
    case 'assistant': return 'Assistant'
    case 'system': return 'System'
    case 'tool': return 'Tool'
    default: return role
  }
}

/** 清理文件名中的非法字符 */
function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 100)
}

// ==================== JSON 导出 ====================

/**
 * 导出单个对话为 JSON 字符串
 */
export function exportToJSON(
  conversation: Conversation,
  messages: Message[]
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
      timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
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

// ==================== Markdown 导出 ====================

/**
 * 导出单个对话为 Markdown 字符串
 */
export function exportToMarkdown(
  conversation: Conversation,
  messages: Message[]
): string {
  const lines: string[] = []

  // 标题
  lines.push(`# ${conversation.title}`)
  lines.push('')
  lines.push(`> 导出时间: ${formatTimestamp(Date.now())} | 消息数: ${messages.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const msg of messages) {
    const roleLabel = getRoleLabel(msg.role)
    const timeStr = formatTimestamp(msg.timestamp)

    lines.push(`**${roleLabel}** (${timeStr})`)
    lines.push('')

    // 消息内容
    if (msg.content) {
      lines.push(msg.content)
    }

    // 思考过程
    if (msg.reasoningContent) {
      lines.push('')
      lines.push('<details>')
      lines.push('<summary>💭 思考过程</summary>')
      lines.push('')
      lines.push(msg.reasoningContent)
      lines.push('')
      lines.push('</details>')
    }

    // 工具调用
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push('')
      lines.push('<details>')
      lines.push('<summary>🔧 工具调用</summary>')
      lines.push('')
      for (const tc of msg.toolCalls) {
        lines.push(`- **${tc.name}** (${tc.status})`)
        if (tc.arguments) {
          lines.push('  ```json')
          lines.push(`  ${tc.arguments}`)
          lines.push('  ```')
        }
        if (tc.result) {
          lines.push(`  结果: ${tc.result.substring(0, 500)}`)
        }
      }
      lines.push('')
      lines.push('</details>')
    }

    // Agent 步骤
    if (msg.agentSteps && msg.agentSteps.length > 0) {
      lines.push('')
      lines.push('<details>')
      lines.push('<summary>🤖 Agent 步骤</summary>')
      lines.push('')
      for (const step of msg.agentSteps) {
        lines.push(`- [${step.type}] ${step.content?.substring(0, 200) ?? ''}`)
      }
      lines.push('')
      lines.push('</details>')
    }

    // 附件
    if (msg.attachments && msg.attachments.length > 0) {
      lines.push('')
      for (const att of msg.attachments) {
        if (att.type.startsWith('image/')) {
          lines.push(`📎 附件: ${att.name} (图片, ${formatFileSize(att.size)})`)
        } else {
          lines.push(`📎 附件: ${att.name} (${att.type}, ${formatFileSize(att.size)})`)
        }
      }
    }

    // 错误标记
    if (msg.isError) {
      lines.push('')
      lines.push('> ⚠️ 此消息为错误消息')
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ==================== HTML 导出 ====================

/**
 * 导出单个对话为 HTML 字符串（自包含页面）
 */
export function exportToHTML(
  conversation: Conversation,
  messages: Message[]
): string {
  const escapeHTML = (str: string): string =>
    str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;')

  const renderMessageContent = (content: string): string => {
    // 简单的 Markdown 转 HTML（基本支持）
    let html = escapeHTML(content)
    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 链接
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    // 换行
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  const messagesHTML = messages.map((msg) => {
    const roleLabel = getRoleLabel(msg.role)
    const timeStr = formatTimestamp(msg.timestamp)
    const roleClass = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system'

    let contentHTML = renderMessageContent(msg.content || '')

    // 工具调用
    let toolCallsHTML = ''
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      const items = msg.toolCalls.map((tc) => {
        const argsHTML = tc.arguments
          ? `<pre class="tool-args">${escapeHTML(tc.arguments)}</pre>`
          : ''
        const resultHTML = tc.result
          ? `<div class="tool-result">${escapeHTML(tc.result.substring(0, 500))}</div>`
          : ''
        return `<li><strong>${escapeHTML(tc.name)}</strong> <span class="badge">${tc.status}</span>${argsHTML}${resultHTML}</li>`
      }).join('')
      toolCallsHTML = `<details class="tool-calls"><summary>🔧 工具调用</summary><ul>${items}</ul></details>`
    }

    // 思考过程
    let reasoningHTML = ''
    if (msg.reasoningContent) {
      reasoningHTML = `<details class="reasoning"><summary>💭 思考过程</summary><div>${renderMessageContent(msg.reasoningContent)}</div></details>`
    }

    return `
    <div class="message ${roleClass}">
      <div class="message-header">
        <span class="role">${roleLabel}</span>
        <span class="time">${timeStr}</span>
        ${msg.isError ? '<span class="error-badge">错误</span>' : ''}
      </div>
      <div class="message-content">${contentHTML}</div>
      ${reasoningHTML}
      ${toolCallsHTML}
    </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(conversation.title)} - 对话导出</title>
  <style>
    :root {
      --bg: #ffffff;
      --bg-secondary: #f8f9fa;
      --text: #1a1a2e;
      --text-secondary: #6c757d;
      --border: #e9ecef;
      --user-bg: #e3f2fd;
      --assistant-bg: #f5f5f5;
      --system-bg: #fff3e0;
      --accent: #4361ee;
      --code-bg: #1e1e1e;
      --code-text: #d4d4d4;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }
    .header {
      text-align: center;
      padding: 32px 0;
      border-bottom: 2px solid var(--border);
      margin-bottom: 24px;
    }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .meta { color: var(--text-secondary); font-size: 14px; }
    .message {
      margin-bottom: 16px;
      border-radius: 12px;
      padding: 16px;
      border: 1px solid var(--border);
    }
    .message.user { background: var(--user-bg); }
    .message.assistant { background: var(--assistant-bg); }
    .message.system { background: var(--system-bg); }
    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .role {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--accent);
      color: white;
    }
    .message.user .role { background: #1976d2; }
    .message.assistant .role { background: #388e3c; }
    .message.system .role { background: #f57c00; }
    .time { color: var(--text-secondary); }
    .error-badge {
      background: #d32f2f;
      color: white;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 11px;
    }
    .message-content { white-space: pre-wrap; word-break: break-word; }
    .message-content a { color: var(--accent); }
    pre {
      background: var(--code-bg);
      color: var(--code-text);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
      margin: 8px 0;
    }
    code {
      background: #e8e8e8;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre code { background: none; padding: 0; }
    details { margin: 8px 0; }
    summary {
      cursor: pointer;
      font-weight: 500;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .tool-calls ul { list-style: none; padding-left: 16px; margin-top: 8px; }
    .tool-calls li { margin-bottom: 8px; }
    .tool-args { font-size: 12px; margin: 4px 0; }
    .tool-result { font-size: 12px; color: var(--text-secondary); }
    .badge {
      display: inline-block;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 4px;
      background: #e0e0e0;
    }
    .footer {
      text-align: center;
      padding: 24px 0;
      color: var(--text-secondary);
      font-size: 12px;
      border-top: 1px solid var(--border);
      margin-top: 32px;
    }
    @media print {
      body { max-width: none; padding: 0; }
      .message { break-inside: avoid; }
      details { display: block; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHTML(conversation.title)}</h1>
    <div class="meta">导出时间: ${formatTimestamp(Date.now())} · ${messages.length} 条消息</div>
  </div>
  ${messagesHTML}
  <div class="footer">
    由 Electron AI Tool 导出 · ${formatTimestamp(Date.now())}
  </div>
</body>
</html>`
}

// ==================== 批量导出 ====================

/** 导出格式类型 */
export type ExportFormat = 'json' | 'markdown' | 'html'

/** 导出选项 */
export interface ExportOptions {
  format: ExportFormat
  /** 要导出的对话 ID 列表，为空则导出全部 */
  conversationIds?: string[]
}

/**
 * 导出单个对话为指定格式
 */
export function exportConversation(
  conversation: Conversation,
  messages: Message[],
  format: ExportFormat
): { content: string; fileName: string; mimeType: string } {
  const safeName = sanitizeFileName(conversation.title)
  const dateStr = new Date().toISOString().slice(0, 10)

  switch (format) {
    case 'json':
      return {
        content: exportToJSON(conversation, messages),
        fileName: `${safeName}_${dateStr}.json`,
        mimeType: 'application/json'
      }
    case 'markdown':
      return {
        content: exportToMarkdown(conversation, messages),
        fileName: `${safeName}_${dateStr}.md`,
        mimeType: 'text/markdown'
      }
    case 'html':
      return {
        content: exportToHTML(conversation, messages),
        fileName: `${safeName}_${dateStr}.html`,
        mimeType: 'text/html'
      }
  }
}

/**
 * 批量导出对话（打包为 JSON 数组，每个格式一个文件）
 * 对于批量导出，返回一个以对话 ID 为 key 的文件映射
 */
export function batchExportConversations(
  conversations: Array<{ conversation: Conversation; messages: Message[] }>,
  format: ExportFormat
): { content: string; fileName: string; mimeType: string } {
  const dateStr = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    // 批量 JSON：打包为数组
    const exportData = conversations.map(({ conversation, messages }) => {
      const parsed = JSON.parse(exportToJSON(conversation, messages))
      return parsed
    })
    return {
      content: JSON.stringify({
        exportedAt: new Date().toISOString(),
        count: conversations.length,
        conversations: exportData
      }, null, 2),
      fileName: `对话导出_${dateStr}.json`,
      mimeType: 'application/json'
    }
  }

  if (format === 'markdown') {
    // 批量 Markdown：合并为一个文件
    const content = conversations
      .map(({ conversation, messages }) => exportToMarkdown(conversation, messages))
      .join('\n\n---\n\n')
    return {
      content,
      fileName: `对话导出_${dateStr}.md`,
      mimeType: 'text/markdown'
    }
  }

  // HTML: 合并为一个页面
  const htmlContents = conversations
    .map(({ conversation, messages }) => exportToHTML(conversation, messages))

  // 提取 body 内容合并
  const bodyRegex = /<body>([\s\S]*)<\/body>/
  const bodies = htmlContents.map((html) => {
    const match = bodyRegex.exec(html)
    return match ? match[1] : html
  })

  // 使用第一个文件的 head 作为模板
  const headRegex = /<head>([\s\S]*)<\/head>/
  const headMatch = headRegex.exec(htmlContents[0])
  const head = headMatch ? headMatch[1] : ''

  return {
    content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>${head}</head>
<body>
  <div style="text-align:center;padding:32px 0;border-bottom:2px solid #e9ecef;margin-bottom:24px;">
    <h1>对话批量导出</h1>
    <p style="color:#6c757d;">导出时间: ${formatTimestamp(Date.now())} · 共 ${conversations.length} 个对话</p>
  </div>
  ${bodies.join('<hr style="margin:48px 0;border:1px solid #e9ecef;"/>')}
  <div style="text-align:center;padding:24px 0;color:#6c757d;font-size:12px;border-top:1px solid #e9ecef;margin-top:32px;">
    由 Electron AI Tool 批量导出 · ${formatTimestamp(Date.now())}
  </div>
</body>
</html>`,
    fileName: `对话导出_${dateStr}.html`,
    mimeType: 'text/html'
  }
}
