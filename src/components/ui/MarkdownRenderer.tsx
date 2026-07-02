import { useMemo, useCallback, useEffect, useState, useRef, type MouseEvent } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import katex from 'katex'
import { useSettingsStore } from '../../stores/settings-store'
import type { CodeHighlightTheme } from '../../types'

/** 动态加载 highlight.js 主题 CSS */
const HLJS_THEME_MAP: Record<CodeHighlightTheme, () => Promise<unknown>> = {
  'github-dark': () => import('highlight.js/styles/github-dark.css'),
  'github': () => import('highlight.js/styles/github.css'),
  'vs2015': () => import('highlight.js/styles/vs2015.css'),
  'atom-one-dark': () => import('highlight.js/styles/atom-one-dark.css'),
  'atom-one-light': () => import('highlight.js/styles/atom-one-light.css'),
  'monokai-sublime': () => import('highlight.js/styles/monokai-sublime.css'),
  'nord': () => import('highlight.js/styles/nord.css'),
  'tokyo-night-dark': () => import('highlight.js/styles/tokyo-night-dark.css'),
  'night-owl': () => import('highlight.js/styles/night-owl.css'),
}

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
  /** 是否启用节流解析（流式输出时建议启用，默认 true） */
  throttle?: boolean
}

/**
 * ⚡ 节流 Markdown 解析（替代防抖，解决内存爆炸问题）
 *
 * 旧方案（防抖）的问题：每次 content 变化都立即全量调用 parseMarkdown，
 * 流式输出时 content 每 ~16ms 变化一次，导致 ~60次/秒的 marked+KaTeX 解析，
 * 每次解析产生大量中间字符串对象，造成内存爆炸。
 *
 * 节流策略：
 * - 首次内容 → 立即解析（保证首屏响应）
 * - 之后每 throttleMs 最多解析一次（~6-7次/秒）
 * - 内容稳定后 catch-up 定时器保证最终版本正确渲染
 *
 * 效果：将解析频率从 ~60/s 降至 ~6-7/s，主线程阻塞减少 ~90%
 */
function useThrottledHtml(content: string, throttleMs: number): string {
  const [html, setHtml] = useState('')
  const contentRef = useRef(content)
  const lastParseTimeRef = useRef(0)
  const timerRef = useRef<number>(0)

  // 保持 contentRef 与最新 content 同步（定时器回调中使用）
  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    if (!content) {
      setHtml('')
      lastParseTimeRef.current = 0
      return
    }

    // 清除之前的 catch-up 定时器
    clearTimeout(timerRef.current)

    const now = performance.now()
    const elapsed = now - lastParseTimeRef.current

    if (lastParseTimeRef.current === 0 || elapsed >= throttleMs) {
      // 首次渲染或节流窗口已过 → 立即解析
      lastParseTimeRef.current = now
      setHtml(parseMarkdown(content))

      // 安排下一个节流窗口的 catch-up 定时器
      timerRef.current = window.setTimeout(() => {
        lastParseTimeRef.current = performance.now()
        setHtml(parseMarkdown(contentRef.current))
      }, throttleMs)
    } else {
      // 节流窗口内 → 不立即解析，在窗口结束时 catch-up
      const remaining = throttleMs - elapsed
      timerRef.current = window.setTimeout(() => {
        lastParseTimeRef.current = performance.now()
        setHtml(parseMarkdown(contentRef.current))
      }, remaining)
    }

    return () => clearTimeout(timerRef.current)
  }, [content, throttleMs])

  return html
}

/** 同步解析 Markdown（提取为独立函数，避免重复代码） */
function parseMarkdown(content: string): string {
  if (!content) return ''
  try {
    const { protectedMarkdown, formulas } = extractLatex(content)
    const result = marked.parse(protectedMarkdown)
    if (typeof result !== 'string') {
      return plainTextToHtml(content)
    }
    const processed = restoreLatex(result, formulas)
    if (!processed || processed.trim() === '') {
      return plainTextToHtml(content)
    }
    return processed
  } catch {
    return plainTextToHtml(content)
  }
}

export function MarkdownRenderer({ content, className = '', throttle = true }: MarkdownRendererProps) {
  const codeHighlightTheme = useSettingsStore((s) => s.codeHighlightTheme)

  // 动态加载代码高亮主题
  useEffect(() => {
    HLJS_THEME_MAP[codeHighlightTheme]?.()
  }, [codeHighlightTheme])

  // ⚡ 节流解析：流式输出时每 150ms 最多解析一次，避免内存爆炸
  // throttle=false 时传入 0ms 节流间隔，等同于即时解析（用于非流式场景如编辑器预览）
  const throttledHtml = useThrottledHtml(content, throttle ? 150 : 0)

  const html = throttledHtml

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
