/**
 * PDF 文本提取器 - 在 Electron 主进程（Node.js 环境）中运行
 * 使用 pdfjs-dist 提取 PDF 文件中的文本内容
 * 在 Node.js 环境中比在渲染进程中更可靠
 */

import { readFile } from 'fs/promises'

/**
 * 从 PDF 文件中提取文本内容
 * @param filePath PDF 文件的绝对路径
 * @returns 提取的文本内容
 */
export async function extractPdfText(filePath: string): Promise<string> {
  // 动态导入 pdfjs-dist，在 Node.js 环境中更可靠
  const pdfjsLib = await import('pdfjs-dist')

  // 在 Node.js 中，pdfjs-dist 使用 import(this.workerSrc) 加载 worker
  // 必须指向实际的 worker 模块文件，不能设为空字符串
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs'

  // 读取文件为 ArrayBuffer
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
    console.error('PDF 加载失败:', loadError)
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

  // 清理资源
  pdf.destroy()

  if (textParts.length === 0) {
    return '[PDF 文件无可提取的文本内容（可能是扫描件或纯图片 PDF）]'
  }

  return textParts.join('\n\n')
}
