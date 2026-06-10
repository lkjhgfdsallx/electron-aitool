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
 * 在 marked 解析前，将所有 LaTeX 公式提取为占位符
 * 避免 marked v15 GFM 内置数学公式支持干扰我们的 LaTeX 处理
 */
function extractLatex(markdown: string): {
  protectedMarkdown: string
  formulas: Array<{ placeholder: string; source: string; displayMode: boolean }>
} {
  const formulas: Array<{ placeholder: string; source: string; displayMode: boolean }> = []
  let counter = 0
  let result = markdown

  // 1. 提取 latex/tex 代码块 → 块级公式
  result = result.replace(/```(?:latex|tex)\s*\n([\s\S]*?)```/g, (_match, formula: string) => {
    const placeholder = `%%LATEX_BLOCK_${counter++}%%`
    formulas.push({ placeholder, source: formula.trim(), displayMode: true })
    return `\n${placeholder}\n`
  })

  // 2. 提取 \[ ... \] 块级公式
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => {
    const placeholder = `%%LATEX_BLOCK_${counter++}%%`
    formulas.push({ placeholder, source: formula.trim(), displayMode: true })
    return `\n${placeholder}\n`
  })

  // 3. 提取 $$ ... $$ 块级公式
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) => {
    const placeholder = `%%LATEX_BLOCK_${counter++}%%`
    formulas.push({ placeholder, source: formula.trim(), displayMode: true })
    return `\n${placeholder}\n`
  })

  // 4. 提取 \( ... \) 行内公式
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => {
    const placeholder = `%%LATEX_INLINE_${counter++}%%`
    formulas.push({ placeholder, source: formula.trim(), displayMode: false })
    return placeholder
  })

  // 5. 提取 $...$ 行内公式（避免匹配 $$）
  result = result.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (_match, formula: string) => {
    const placeholder = `%%LATEX_INLINE_${counter++}%%`
    formulas.push({ placeholder, source: formula.trim(), displayMode: false })
    return placeholder
  })

  return { protectedMarkdown: result, formulas }
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

/**
 * 将 marked 输出 HTML 中的占位符替换为 KaTeX 渲染结果
 */
function restoreLatex(
  html: string,
  formulas: Array<{ placeholder: string; source: string; displayMode: boolean }>
): string {
  let result = html

  for (const { placeholder, source, displayMode } of formulas) {
    const trimmedSource = source.trim()
    if (!trimmedSource) continue

    try {
      const katexHtml = katex.renderToString(trimmedSource, {
        displayMode,
        throwOnError: false
      })
      const wrapped = wrapFormula(katexHtml, trimmedSource, displayMode)

      if (displayMode) {
        // 块级公式：marked 可能将占位符包裹在 <p> 标签中，需要整行替换
        const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        result = result.replace(
          new RegExp(`<p>\\s*${escapedPlaceholder}\\s*</p>`, 'g'),
          wrapped
        )
      }
      // 行内公式或块级公式的回退：直接替换占位符文本
      result = result.split(placeholder).join(wrapped)
    } catch {
      // 渲染失败时保留原始源码
      const fallback = displayMode
        ? `<pre><code>${trimmedSource}</code></pre>`
        : `<code>${trimmedSource}</code>`
      result = result.split(placeholder).join(fallback)
    }
  }

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
      // 1. 在 marked 解析前，提取所有 LaTeX 公式为安全占位符
      const { protectedMarkdown, formulas } = extractLatex(content)

      // 2. marked 解析（不会干扰 LaTeX，因为已替换为占位符）
      const result = marked.parse(protectedMarkdown)

      // 处理 marked v15 可能返回 Promise 的情况
      if (typeof result !== 'string') {
        return plainTextToHtml(content)
      }

      // 3. 将占位符替换为 KaTeX 渲染结果
      const processed = restoreLatex(result, formulas)

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
