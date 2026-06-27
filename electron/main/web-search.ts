/**
 * 网页搜索服务 - 运行在 Electron 主进程中
 * 多引擎支持：DuckDuckGo (主) → Bing (备) → Bing 简化查询 (兜底)
 * 包含结果关联度过滤，避免返回无关内容
 */

import { net } from 'electron'

export interface SearchResult {
  title: string
  snippet: string
  url: string
  /** 内部使用：关联度分数 */
  _score?: number
}

// ==================== HTML 实体解码 ====================

/** 完整的 HTML 实体映射表 */
const HTML_ENTITIES: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  const entries: [string, string][] = [
    ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
    ['nbsp', ' '], ['ensp', ' '], ['emsp', ' '], ['thinsp', ' '],
    ['ndash', '\u2013'], ['mdash', '\u2014'],
    ['lsquo', '\u2018'], ['rsquo', '\u2019'], ['ldquo', '\u201C'], ['rdquo', '\u201D'],
    ['bull', '\u2022'], ['middot', '\u00B7'], ['hellip', '\u2026'],
    ['copy', '\u00A9'], ['reg', '\u00AE'], ['trade', '\u2122'],
    ['cent', '\u00A2'], ['pound', '\u00A3'], ['yen', '\u00A5'],
    ['euro', '\u20AC'], ['sect', '\u00A7'], ['para', '\u00B6'],
    ['larr', '\u2190'], ['rarr', '\u2192'], ['uarr', '\u2191'], ['darr', '\u2193'],
  ]
  for (const [name, char] of entries) {
    map['&' + name + ';'] = char
  }
  return map
})()

/**
 * 解码 HTML 实体（支持命名实体和数字实体）
 */
function decodeHTMLEntities(text: string): string {
  let result = text
  // 命名实体
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char)
  }
  // 数字实体 &#123; 或 &#x1F;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return _ }
  })
  result = result.replace(/&#(\d+);/g, (_, dec) => {
    try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return _ }
  })
  return result
}

/**
 * 去除 HTML 标签并解码实体
 */
function stripHTML(html: string): string {
  return decodeHTMLEntities(html)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ==================== HTTP 请求 ====================

/**
 * 发起 HTTP GET 请求获取 HTML 内容
 */
function fetchHTML(url: string, timeoutMs: number = 12_000): Promise<string> {
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
          fetchHTML(redirectUrl, timeoutMs).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      response.on('data', (chunk: Buffer) => {
        responseData += chunk.toString('utf-8')
      })

      response.on('end', () => {
        resolve(responseData)
      })

      response.on('error', (error: Error) => {
        reject(new Error(`响应读取失败: ${error.message}`))
      })
    })

    request.on('error', (error: Error) => {
      reject(new Error(`请求失败: ${error.message}`))
    })

    setTimeout(() => {
      request.abort()
      reject(new Error('请求超时'))
    }, timeoutMs)

    request.end()
  })
}

/**
 * 发起 HTTP POST 请求获取 HTML 内容
 */
function fetchHTMLPost(url: string, body: string, timeoutMs: number = 12_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'POST',
    })

    request.setHeader(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )
    request.setHeader('Content-Type', 'application/x-www-form-urlencoded')
    request.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    request.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')

    let responseData = ''

    request.on('response', (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers['location']
        if (location) {
          const redirectUrl = Array.isArray(location) ? location[0] : location
          fetchHTML(redirectUrl, timeoutMs).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      response.on('data', (chunk: Buffer) => {
        responseData += chunk.toString('utf-8')
      })

      response.on('end', () => resolve(responseData))
      response.on('error', (error: Error) => reject(new Error(`响应读取失败: ${error.message}`)))
    })

    request.on('error', (error: Error) => reject(new Error(`请求失败: ${error.message}`)))

    setTimeout(() => {
      request.abort()
      reject(new Error('请求超时'))
    }, timeoutMs)

    request.write(body)
    request.end()
  })
}

// ==================== 关联度过滤 ====================

/**
 * 过滤和排序搜索结果，按关键词命中率排序，剔除明显无关的结果
 */
function filterAndRankResults(results: SearchResult[], query: string, maxResults: number): SearchResult[] {
  if (results.length === 0) return []

  // 提取查询关键词（去掉过短的词）
  const keywords = query
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')  // 保留中英文和数字
    .split(/\s+/)
    .filter(k => k.length >= 2)

  if (keywords.length === 0) {
    return results.slice(0, maxResults)
  }

  // 计算每个结果的关联度分数
  const scored = results.map(r => {
    const text = (r.title + ' ' + r.snippet).toLowerCase()
    let matchedKeywords = 0
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matchedKeywords++
      }
    }
    const score = matchedKeywords / keywords.length
    return { ...r, _score: score }
  })

  // 过滤掉关联度为 0 的结果（完全无关）
  const relevant = scored.filter(r => r._score > 0)

  // 如果过滤后没有结果，放宽条件返回原始结果的前几个（去掉 _score）
  if (relevant.length === 0) {
    return scored.slice(0, maxResults).map(({ _score, ...rest }) => rest)
  }

  // 按关联度降序排序
  relevant.sort((a, b) => (b._score ?? 0) - (a._score ?? 0))

  // 去掉内部分数字段，返回结果
  return relevant.slice(0, maxResults).map(({ _score, ...rest }) => rest)
}

/**
 * 简化查询词：去掉限定词，只保留核心关键词
 */
function simplifyQuery(query: string): string {
  // 去掉常见无意义的停用词
  const stopWords = ['的', '了', '是', '在', '和', '有', '这', '个', '那', '些', '什么', '怎么', '如何', '哪里', '哪个', '哪些']
  const words = query.split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 0)
  // 如果简化后为空，返回原始查询
  return words.length > 0 ? words.join(' ') : query
}

// ==================== DuckDuckGo 搜索引擎 ====================

/**
 * DuckDuckGo HTML 版搜索
 * 使用 POST 请求 html.duckduckgo.com/html/
 * 优点：HTML 结构简单稳定，解析可靠
 */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const body = `q=${encodeURIComponent(query)}&b=&kl=cn-zh`
  const html = await fetchHTMLPost('https://html.duckduckgo.com/html/', body)
  return parseDuckDuckGoResults(html, maxResults)
}

/**
 * 解析 DuckDuckGo HTML 搜索结果
 * 结果在 <div class="result"> 中，包含 <a class="result__a"> 和 <a class="result__snippet">
 */
function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // DuckDuckGo 结果块：<div class="result results_links ...">
  const resultBlockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*result[^"]*"|<div[^>]*class="[^"]*nav-link|$)/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1]

    // 提取标题和链接：<a class="result__a" href="url">title</a>
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!titleMatch || !titleMatch[1]) continue

    const url = decodeHTMLEntities(titleMatch[1])
    const title = stripHTML(titleMatch[2]).trim()

    // 提取摘要：<a class="result__snippet">snippet</a>
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
    const snippet = snippetMatch && snippetMatch[1] ? stripHTML(snippetMatch[1]).trim() : ''

    // 跳过无效 URL
    if (!url.startsWith('http') || !title) continue

    results.push({
      title,
      snippet: snippet || '(无摘要)',
      url
    })
  }

  // 备用解析：更宽松的匹配
  if (results.length === 0) {
    return parseDuckDuckGoFallback(html, maxResults)
  }

  return results
}

/**
 * DuckDuckGo 备用解析：匹配 result__a 链接
 */
function parseDuckDuckGoFallback(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
    const url = decodeHTMLEntities(match[1])
    const title = stripHTML(match[2]).trim()

    if (title && url.startsWith('http')) {
      results.push({ title, snippet: '(无摘要)', url })
    }
  }

  return results
}

// ==================== Bing 搜索引擎 ====================

/**
 * Bing HTML 搜索
 * 使用 cn.bing.com 以获得更好的中国网络连通性
 */
async function searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults * 2}`
  const html = await fetchHTML(url)
  return parseBingResults(html, maxResults)
}

/**
 * 解析 Bing 搜索结果
 * Bing 的自然搜索结果在 <li class="b_algo"> 中
 * 需要过滤掉广告、知识面板等非自然结果
 */
function parseBingResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // Bing 自然搜索结果块：<li class="b_algo">
  const resultBlockRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1]

    // 提取标题和链接：<h2><a href="url">title</a></h2>
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!titleMatch || !titleMatch[1] || !titleMatch[2]) continue

    const url = decodeHTMLEntities(titleMatch[1])
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
    return parseBingFallback(html, maxResults)
  }

  return results
}

/**
 * Bing 备用解析：匹配 <h2> 中的链接
 */
function parseBingFallback(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  const linkRegex = /<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
    const url = decodeHTMLEntities(match[1])
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

// ==================== 主搜索函数 ====================

/**
 * 搜索网页 - 多引擎自动 fallback + 结果关联度过滤
 *
 * 策略：
 * 1. 先用 DuckDuckGo（HTML 结构简单，解析可靠）
 * 2. 如果失败或结果不足，用 Bing 兜底
 * 3. 如果仍然失败，用简化查询重试 Bing
 * 4. 所有结果都经过关联度过滤，剔除完全无关的内容
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  const errors: string[] = []

  // 策略 1：DuckDuckGo
  try {
    const rawResults = await searchDuckDuckGo(query, maxResults * 3)
    const filtered = filterAndRankResults(rawResults, query, maxResults)
    if (filtered.length > 0) {
      console.log(`[web-search] DuckDuckGo 成功，返回 ${filtered.length} 条结果`)
      return filtered
    }
    errors.push('DuckDuckGo: 结果为空')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[web-search] DuckDuckGo 失败: ${msg}`)
    errors.push(`DuckDuckGo: ${msg}`)
  }

  // 策略 2：Bing
  try {
    const rawResults = await searchBing(query, maxResults * 3)
    const filtered = filterAndRankResults(rawResults, query, maxResults)
    if (filtered.length > 0) {
      console.log(`[web-search] Bing 成功，返回 ${filtered.length} 条结果`)
      return filtered
    }
    errors.push('Bing: 结果为空')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[web-search] Bing 失败: ${msg}`)
    errors.push(`Bing: ${msg}`)
  }

  // 策略 3：简化查询重试 Bing
  const simplified = simplifyQuery(query)
  if (simplified !== query) {
    try {
      console.log(`[web-search] 使用简化查询重试: "${simplified}"`)
      const rawResults = await searchBing(simplified, maxResults * 3)
      const filtered = filterAndRankResults(rawResults, query, maxResults)
      if (filtered.length > 0) {
        console.log(`[web-search] Bing(简化查询) 成功，返回 ${filtered.length} 条结果`)
        return filtered
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`Bing(简化): ${msg}`)
    }
  }

  // 所有策略均失败
  throw new Error(`搜索失败: ${errors.join('; ')}`)
}

// ==================== 网页内容抓取 ====================

/**
 * 抓取指定 URL 的网页内容并提取正文
 * @param url 网页地址
 * @param maxLength 最大返回字符数，默认 8000
 */
export async function fetchWebpage(url: string, maxLength: number = 8000): Promise<string> {
  const html = await fetchHTML(url, 15_000)
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
  content = decodeHTMLEntities(content)

  // 清理多余空白和空行
  content = content
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()

  return content
}
