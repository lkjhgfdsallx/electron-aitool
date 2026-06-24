/**
 * 统一文件文本提取器 - 在 Electron 主进程（Node.js 环境）中运行
 * 支持多种文件格式的文本提取：
 * - PDF: 使用 pdfjs-dist
 * - DOCX/DOC: 使用 mammoth
 * - HTML: 使用正则去除标签
 * - 源码/日志/文本: 直接读取 UTF-8 文本
 *
 * 渲染进程通过 IPC 调用，避免阻塞 UI
 */

import { readFile } from 'fs/promises'
import { extname } from 'path'

// ==================== 格式分类 ====================

/** 文本类文件扩展名（直接读取 UTF-8） */
const TEXT_EXTENSIONS = new Set([
  // 标记/数据
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.xml', '.yaml', '.yml', '.toml',
  // Web
  '.html', '.htm', '.xhtml', '.css', '.scss', '.sass', '.less',
  // JavaScript / TypeScript
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts',
  // Python
  '.py', '.pyw', '.pyx', '.pxd',
  // Java / Kotlin / Scala
  '.java', '.kt', '.kts', '.scala',
  // C / C++
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.hh',
  // Go / Rust / Swift
  '.go', '.rs', '.swift',
  // Shell / 脚本
  '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.ps1',
  // 其他编程语言
  '.rb', '.php', '.pl', '.pm', '.lua', '.r', '.R', '.m', '.mm',
  '.sql', '.graphql', '.gql', '.proto',
  // 配置/文档
  '.env', '.ini', '.cfg', '.conf', '.properties',
  '.gitignore', '.dockerignore', '.editorconfig',
  '.dockerfile', '.makefile',
  // 日志
  '.log', '.out', '.err',
])

/** 是否为文本类文件 */
function isTextFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

/** 是否为 PDF 文件 */
function isPdfFile(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.pdf'
}

/** 是否为 Word 文件 */
function isDocxFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return ext === '.docx' || ext === '.doc'
}

/** 是否为 HTML 文件 */
function isHtmlFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return ext === '.html' || ext === '.htm' || ext === '.xhtml'
}

// ==================== PDF 提取 ====================

async function extractPdfText(filePath: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs'

  const fileBuffer = await readFile(filePath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  )

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    disableAutoFetch: true,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  })

  let pdf
  try {
    pdf = await loadingTask.promise
  } catch (loadError) {
    throw new Error(
      `PDF 文件加载失败: ${loadError instanceof Error ? loadError.message : '未知错误'}`
    )
  }

  const textParts: string[] = []
  const numPages = pdf.numPages

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      const pageText = textContent.items
        .filter((item: unknown) => 'str' in (item as Record<string, unknown>))
        .map((item: unknown) => (item as { str: string }).str)
        .join('')

      if (pageText.trim()) {
        textParts.push(`[第 ${i} 页]\n${pageText}`)
      }
    } catch (pageError) {
      console.warn(`PDF 第 ${i} 页提取失败:`, pageError)
      textParts.push(`[第 ${i} 页提取失败]`)
    }
  }

  pdf.destroy()

  if (textParts.length === 0) {
    return '[PDF 文件无可提取的文本内容（可能是扫描件或纯图片 PDF）]'
  }

  return textParts.join('\n\n')
}

// ==================== Word (DOCX) 提取 ====================

async function extractDocxText(filePath: string): Promise<string> {
  const mammoth = await import('mammoth')
  const fileBuffer = await readFile(filePath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  )

  const result = await mammoth.extractRawText({ arrayBuffer })

  if (result.messages.some((m) => m.type === 'error')) {
    console.warn('Word 文档解析警告:', result.messages)
  }

  const text = result.value.trim()
  if (!text) {
    return '[Word 文档无可提取的文本内容]'
  }

  return text
}

// ==================== HTML 提取 ====================

/**
 * 从 HTML 中提取纯文本
 * 去除标签、脚本、样式，保留文本内容
 */
function extractHtmlText(html: string): string {
  let text = html

  // 移除 script 和 style 标签及其内容
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')

  // 移除 HTML 注释
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // 将块级标签转换为换行
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer|nav|pre)>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n')

  // 移除所有剩余标签
  text = text.replace(/<[^>]+>/g, '')

  // 解码常见 HTML 实体
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&/g, '&')
  text = text.replace(/</g, '<')
  text = text.replace(/>/g, '>')
  text = text.replace(/"/g, '"')
  text = text.replace(/'/g, "'")
  text = text.replace(/&[a-zA-Z]+;/g, '') // 移除未识别的实体

  // 清理多余空白
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n') // 最多保留两个连续换行
  text = text.trim()

  if (!text) {
    return '[HTML 文件无可提取的文本内容]'
  }

  return text
}

// ==================== 文本文件提取 ====================

async function extractPlainText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  // 尝试 UTF-8 解码
  const text = buffer.toString('utf-8')

  if (!text.trim()) {
    return '[文件内容为空]'
  }

  return text
}

// ==================== 统一入口 ====================

/**
 * 根据文件扩展名自动选择提取方式，返回纯文本内容
 * @param filePath 文件绝对路径
 * @returns 提取的纯文本
 */
export async function extractFileText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()

  // PDF 文件
  if (isPdfFile(filePath)) {
    return extractPdfText(filePath)
  }

  // Word 文件
  if (isDocxFile(filePath)) {
    return extractDocxText(filePath)
  }

  // HTML 文件（特殊处理：去除标签）
  if (isHtmlFile(filePath)) {
    const rawHtml = await readFile(filePath, 'utf-8')
    return extractHtmlText(rawHtml)
  }

  // 文本类文件（源码、日志、配置等）
  if (isTextFile(filePath)) {
    return extractPlainText(filePath)
  }

  // 未知格式：尝试作为文本读取
  try {
    const text = await extractPlainText(filePath)
    // 检查是否包含大量不可打印字符（可能是二进制文件）
    const nonPrintable = text.split('').filter((ch) => {
      const code = ch.charCodeAt(0)
      return code < 32 && code !== 10 && code !== 13 && code !== 9
    }).length
    const nonPrintableRatio = nonPrintable / text.length
    if (nonPrintableRatio > 0.1) {
      return `[不支持的二进制文件格式: ${ext}]`
    }
    return text
  } catch {
    throw new Error(`不支持的文件格式: ${ext}`)
  }
}
