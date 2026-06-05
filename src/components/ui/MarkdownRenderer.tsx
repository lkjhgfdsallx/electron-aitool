import { useMemo, useCallback, type MouseEvent } from 'react'
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
/**
 * 在 markdown 解析前，将 LaTeX 分隔符转换为 KaTeX 可识别的格式
 * 因为 marked 会将 \( 转义为 (，导致 LaTeX 公式丢失
 */
function normalizeLatexDelimiters(markdown: string): string {
  let result = markdown

  // \[ ... \] → $$...$$（块级公式）
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => {
    return `\n$$${formula}$$\n`
  })

  // \( ... \) → $...$（行内公式）
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => {
    return `$${formula}$`
  })

  return result
}

/**
 * 将 KaTeX 渲染结果包裹在可复制的容器中
 * 悬停时显示边框，点击容器即可复制 LaTeX 源码
 * @param katexHtml KaTeX 渲染后的 HTML 字符串
 * @param source 原始 LaTeX 源码
 * @param displayMode 是否为块级公式
 */
function wrapFormula(katexHtml: string, source: string, displayMode: boolean): string {
  const escapedSource = source.replace(/&/g, '&').replace(/"/g, '"')
  const displayClass = displayMode ? 'katex-formula-block' : 'katex-formula-inline'
  return `<span class="katex-formula-wrapper ${displayClass}" data-source="${escapedSource}" data-copy-formula="true" title="双击复制公式">${katexHtml}</span>`
}

function processLatex(html: string): string {
  let result = html

  // 1. 处理 latex/tex 代码块 → 块级公式
  result = result.replace(
    /<pre><code class="language-(?:latex|tex)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, formula: string) => {
      try {
        const source = formula.trim()
        const katexHtml = katex.renderToString(decodeHtmlEntities(source), {
          displayMode: true,
          throwOnError: false
        })
        return wrapFormula(katexHtml, source, true)
      } catch {
        return `<pre><code>${formula}</code></pre>`
      }
    }
  )

  // 2. 处理 $$...$$ 块级公式
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) => {
    try {
      const source = formula.trim()
      const katexHtml = katex.renderToString(source, { displayMode: true, throwOnError: false })
      return wrapFormula(katexHtml, source, true)
    } catch {
      return `<pre>${formula}</pre>`
    }
  })

  // 3. 处理 $...$ 行内公式（避免匹配到已渲染的 KaTeX span）
  result = result.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (_match, formula: string) => {
    // 跳过已经是 KaTeX 渲染的内容
    if (formula.includes('katex') || formula.includes('class=')) return _match
    try {
      const source = formula.trim()
      const katexHtml = katex.renderToString(source, { displayMode: false, throwOnError: false })
      return wrapFormula(katexHtml, source, false)
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
      // 先将 LaTeX 分隔符标准化，避免 marked 消费反斜杠导致公式丢失
      const normalized = normalizeLatexDelimiters(content)
      const result = marked.parse(normalized)

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

  // 事件委托：点击公式容器直接复制 LaTeX 源码
  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const wrapper = target.closest<HTMLElement>('[data-copy-formula]')
    if (!wrapper) return

    e.preventDefault()
    e.stopPropagation()

    const source = wrapper.dataset.source
    if (!source) return

    const showSuccess = () => {
      wrapper.classList.add('katex-copy-success')
      setTimeout(() => wrapper.classList.remove('katex-copy-success'), 1500)
    }

    navigator.clipboard.writeText(source).then(showSuccess).catch(() => {
      // 降级方案：使用 textarea 复制
      const textarea = document.createElement('textarea')
      textarea.value = source
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      showSuccess()
    })
  }, [])

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onDoubleClick={handleClick}
    />
  )
}
