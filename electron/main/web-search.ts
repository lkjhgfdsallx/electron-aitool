/**
 * 网页搜索服务 - 运行在 Electron 主进程中
 * 使用 Bing HTML 搜索（国内可访问，无需 API Key）
 */

import { net } from 'electron'

export interface SearchResult {
  title: string
  snippet: string
  url: string
}

/**
 * 通过 Bing 搜索网页
 * @param query 搜索关键词
 * @param maxResults 最大结果数，默认 5
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`

  const html = await fetchHTML(url)

  return parseBingResults(html, maxResults)
}

/**
 * 发起 HTTP GET 请求获取 HTML 内容
 */
function fetchHTML(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET',
    })

    request.setHeader(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )
    request.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    request.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')

    let responseData = ''

    request.on('response', (response) => {
      // 处理重定向
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers['location']
        if (location) {
          const redirectUrl = Array.isArray(location) ? location[0] : location
          fetchHTML(redirectUrl).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`搜索请求失败，状态码: ${response.statusCode}`))
        return
      }

      response.on('data', (chunk: Buffer) => {
        responseData += chunk.toString('utf-8')
      })

      response.on('end', () => {
        resolve(responseData)
      })

      response.on('error', (error: Error) => {
        reject(new Error(`搜索响应读取失败: ${error.message}`))
      })
    })

    request.on('error', (error: Error) => {
      reject(new Error(`搜索请求失败: ${error.message}`))
    })

    // 超时保护：15 秒
    setTimeout(() => {
      request.abort()
      reject(new Error('搜索请求超时（15秒）'))
    }, 15_000)

    request.end()
  })
}

/**
 * 解析 Bing 搜索结果
 * Bing 的搜索结果在 <li class="b_algo"> 中，包含 <h2><a> 标题和 <p> 摘要
 */
function parseBingResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // Bing 搜索结果块：<li class="b_algo">
  const resultBlockRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1]

    // 提取标题和链接：<h2><a href="url">title</a></h2>
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!titleMatch || !titleMatch[1] || !titleMatch[2]) continue

    const url = titleMatch[1]
    const title = stripHTML(titleMatch[2]).trim()

    // 提取摘要：<p> 或 <div class="b_caption"><p>
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const snippet = snippetMatch && snippetMatch[1] ? stripHTML(snippetMatch[1]).trim() : ''

    // 跳过广告和无效结果
    if (!url.startsWith('http') || url.includes('bing.com/aclk') || url.includes('go.microsoft.com')) {
      continue
    }

    if (title) {
      results.push({
        title,
        snippet: snippet || '(无摘要)',
        url
      })
    }
  }

  // 备用解析：匹配更宽松的模式
  if (results.length === 0) {
    return parseFallbackResults(html, maxResults)
  }

  return results
}

/**
 * 备用解析：更宽松的正则匹配
 */
function parseFallbackResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // 尝试匹配 <h2> 标签中的链接
  const linkRegex = /<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
    const url = match[1]
    const title = stripHTML(match[2]).trim()

    if (title && url && !url.includes('bing.com/aclk') && !url.includes('go.microsoft.com')) {
      results.push({
        title,
        snippet: '(无摘要)',
        url
      })
    }
  }

  return results
}

/**
 * 抓取指定 URL 的网页内容并提取正文
 * @param url 网页地址
 * @param maxLength 最大返回字符数，默认 8000
 */
export async function fetchWebpage(url: string, maxLength: number = 8000): Promise<string> {
  const html = await fetchHTML(url)
  const text = extractReadableText(html)
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength) + '\n\n...(内容已截断，共 ' + text.length + ' 字符)'
}

/**
 * 从 HTML 中提取可读正文内容
 * 优先提取 <article>、<main>、<div class="content/post/article/body"> 等语义标签
 * 然后去除脚本、样式、导航等无关内容
 */
function extractReadableText(html: string): string {
  let content = html

  // 移除脚本、样式、注释、SVG 等无关标签及其内容
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  content = content.replace(/<!--[\s\S]*?-->/g, '')
  content = content.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
  content = content.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')

  // 尝试提取主要内容区域
  const mainPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*(?:content|post-content|article-content|entry-content|post-body|article-body|rich-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ]

  for (const pattern of mainPatterns) {
    const match = content.match(pattern)
    if (match && match[1] && match[1].length > 200) {
      content = match[1]
      break
    }
  }

  // 将块级标签转换为换行
  content = content.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|blockquote|pre)[^>]*>/gi, '\n')

  // 去除剩余 HTML 标签
  content = content.replace(/<[^>]+>/g, '')

  // 解码 HTML 实体
  content = content
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')

  // 清理多余空白和空行
  content = content
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()

  return content
}

/**
 * 去除 HTML 标签
 */
function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
