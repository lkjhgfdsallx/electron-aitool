/**
 * 文件文本提取工具
 * 从 PDF、Word 等二进制文件中提取文本内容，供 AI 模型理解
 *
 * PDF 提取通过 IPC 在 Electron 主进程（Node.js）中执行，避免渲染进程兼容性问题
 * Word 提取使用 mammoth 库在渲染进程中执行
 */

/**
 * 检测是否在 Electron 环境中运行
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.file
}

/**
 * 从 PDF 文件中提取文本内容
 * 优先使用 Electron 主进程（Node.js 环境）提取，更可靠
 * 如果不在 Electron 环境中，则回退到渲染进程提取
 * @param file PDF 文件对象
 * @returns 提取的文本内容
 */
export async function extractPdfText(file: File): Promise<string> {
  // 优先使用 Electron 主进程提取
  if (isElectron()) {
    try {
      const filePath = window.electronAPI.file.getPathForFile(file)
      const result = await window.electronAPI.file.extractPdfText(filePath)

      if (result.success && result.text) {
        return result.text
      }

      throw new Error(result.error || 'PDF 提取失败')
    } catch (ipcError) {
      console.error('Electron 主进程 PDF 提取失败:', ipcError)
      throw new Error(
        `PDF 文本提取失败: ${ipcError instanceof Error ? ipcError.message : '未知错误'}`
      )
    }
  }

  // 回退：在渲染进程中使用 pdfjs-dist 提取
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const arrayBuffer = await file.arrayBuffer()

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
        .filter((item) => 'str' in item)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => item.str as string)
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

/**
 * 从 Word (.docx) 文件中提取文本内容
 * @param file Word 文件对象
 * @returns 提取的文本内容
 */
export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })

  if (result.messages.some(m => m.type === 'error')) {
    console.warn('Word 文档解析警告:', result.messages)
  }

  const text = result.value.trim()
  if (!text) {
    return '[Word 文档无可提取的文本内容]'
  }

  return text
}

/**
 * 根据文件类型自动提取文本内容
 * 支持 PDF 和 Word (.docx) 文件
 * @param file 文件对象
 * @returns 提取的文本内容，如果不支持提取则返回 null
 */
export async function extractFileText(file: File): Promise<string | null> {
  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return await extractPdfText(file)
    }

    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword' ||
      file.name.toLowerCase().endsWith('.docx') ||
      file.name.toLowerCase().endsWith('.doc')
    ) {
      return await extractDocxText(file)
    }

    return null
  } catch (error) {
    console.error(`文件文本提取失败 (${file.name}):`, error)
    return `[文件 ${file.name} 文本提取失败: ${error instanceof Error ? error.message : '未知错误'}]`
  }
}
