import { useMemo } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import katex from 'katex'

// 自定义 renderer：同步代码高亮，避免 marked-highlight 导致 marked.parse() 返回 Promise
const renderer = new marked.Renderer()

renderer.code = function ({ text, lang }: { text: string; lang?: string }): string {
  const language = lang && hljs.getLanguage(lang) ? lang : undefined
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value
  return `<pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>`
}

// 配置 marked：同步模式，确保 marked.parse() 返回 string
marked.use({
  renderer,
  gfm: true,
  breaks: true,
  async: false
})

/**
 * 对 marked 输出的 HTML 进行 LaTeX 后处理
 * 避免在 renderer 中覆盖 paragraph/code 方法（marked v15 兼容性问题）
 */
function processLatex(html: string): string {
  let result = html

  // 1. 处理 latex/tex 代码块 → 块级公式
  result = result.replace(
    /<pre><code class="language-(?:latex|tex)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, formula: string) => {
      try {
        return katex.renderToString(decodeHtmlEntities(formula.trim()), {
          displayMode: true,
          throwOnError: false
        })
      } catch {
        return `<pre><code>${formula}</code></pre>`
      }
    }
  )

  // 2. 处理 $$...$$ 块级公式
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) => {
    try {
      return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return `<pre>${formula}</pre>`
    }
  })

  // 3. 处理 $...$ 行内公式（避免匹配到已渲染的 KaTeX span）
  result = result.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (_match, formula: string) => {
    // 跳过已经是 KaTeX 渲染的内容
    if (formula.includes('katex') || formula.includes('class=')) return _match
    try {
      return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return `<code>${formula}</code>`
    }
  })

  return result
}

/** 解码 HTML 实体（支持数字实体和命名实体） */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#\d+);/g, (_match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10)
      return String.fromCharCode(code)
    }
    switch (entity) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      default: return _match
    }
  })
}

/** 转义 HTML 特殊字符（使用 charCodeAt 动态生成实体，避免源码中的实体被解码） */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/** 将纯文本转换为 HTML（保留换行和段落） */
function plainTextToHtml(text: string): string {
  const escaped = escapeHtml(text)
  // 按双换行分段，段内单换行转 <br>
  return escaped
    .split(/\n\n+/)
    .map((paragraph) => {
      const lines = paragraph.split('\n').join('<br>\n')
      return `<p>${lines}</p>`
    })
    .join('\n')
}

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return ''
    try {
      const result = marked.parse(content)

      // 处理 marked v15 可能返回 Promise 的情况
      if (typeof result !== 'string') {
        return plainTextToHtml(content)
      }

      const processed = processLatex(result)

      // 如果 marked 输出为空但内容不为空，使用纯文本回退
      if (!processed || processed.trim() === '') {
        return plainTextToHtml(content)
      }

      return processed
    } catch {
      // 出错时回退到纯文本渲染
      return plainTextToHtml(content)
    }
  }, [content])

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
