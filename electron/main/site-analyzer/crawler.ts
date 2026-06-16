/**
 * 全站爬取服务
 * 自动爬取目标网站的所有页面，支持传统网站和SPA
 *
 * 核心改进：
 * 1. 复用单个 page 而非每个 URL 创建/关闭（保持登录态和浏览器状态）
 * 2. 自动处理同意弹窗（cookie banner、服务协议等）
 * 3. 浏览器断开自动恢复，避免后续全404
 * 4. URL模式去重，避免重复查看同类页面（如100篇详情页只看1个）
 * 5. 页面交互探索，点击按钮/Tab/菜单深入了解页面功能
 */

import type { Page } from 'playwright'
import type { BrowserManager } from './browser-manager'
import type { RequestCapture } from './request-capture'
import type {
  SiteAnalyzerConfig,
  SitePage,
  SiteAnalyzerProgress,
  CrawlRules,
  PageStructure,
  SidebarMenuItem,
  TableStructure,
  FormStructure,
  FormField,
  PageInteractionResult
} from './types'

/** 常见的同意/接受按钮选择器 */
const CONSENT_SELECTORS = [
  // Cookie 同意
  'button:has-text("Accept")',
  'button:has-text("Accept All")',
  'button:has-text("Accept Cookies")',
  'button:has-text("Allow")',
  'button:has-text("Allow All")',
  'button:has-text("I Agree")',
  'button:has-text("I Accept")',
  'button:has-text("Got It")',
  'button:has-text("OK")',
  // 中文同意
  'button:has-text("同意")',
  'button:has-text("我同意")',
  'button:has-text("接受")',
  'button:has-text("全部接受")',
  'button:has-text("同意并继续")',
  'button:has-text("我知道了")',
  'button:has-text("已阅读并同意")',
  'button:has-text("确认")',
  // checkbox + 同意模式
  'input[type="checkbox"][name*="agree"]',
  'input[type="checkbox"][name*="consent"]',
  'input[type="checkbox"][name*="protocol"]',
  // 常见框架的同意按钮
  '#onetrust-accept-btn-handler',          // OneTrust
  '.cc-btn.cc-dismiss',                     // Cookie Consent
  '.cookie-notice .accept',                 // 通用
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
  '.fc-cta-consent',                        // Funding Choices
  '[data-testid="cookie-policy-manage-dialog-btn-accept"]',
  // 表单中的同意复选框（登录页常见）
  'label:has-text("同意") input[type="checkbox"]',
  'label:has-text("已阅读") input[type="checkbox"]',
  'label:has-text("服务协议") input[type="checkbox"]',
  'label:has-text("个人信息保护") input[type="checkbox"]'
]

/**
 * 将URL路径中的数字ID段替换为占位符，生成URL模式
 * 例如: /api/article/12345/detail → /api/article/:id/detail
 *       /user/profile/67890 → /user/profile/:id
 */
function normalizeUrlPattern(url: string): string {
  try {
    const parsed = new URL(url)
    // 将路径中纯数字段或UUID替换为 :id
    const normalizedPath = parsed.pathname
      .split('/')
      .map((seg) => {
        if (!seg) return seg
        // 纯数字
        if (/^\d+$/.test(seg)) return ':id'
        // UUID格式
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':id'
        // MongoDB ObjectId格式（24位hex）
        if (/^[0-9a-f]{24}$/i.test(seg)) return ':id'
        return seg
      })
      .join('/')

    // 处理 hash 路由（SPA 站点的关键路径）
    // 例如: http://dp.cx.com/deepin.html#/dp/ProductList → hashPath = '/dp/ProductList'
    let hashPath = ''
    if (parsed.hash && parsed.hash.length > 1) {
      // 去掉 # 前缀，再去掉 hash 中的查询参数（如 #/list?page=1）
      const hashContent = parsed.hash.slice(1)
      const hashWithoutQuery = hashContent.split('?')[0]
      if (hashWithoutQuery) {
        // 对 hash 路径也做同样的动态段归一化
        hashPath = hashWithoutQuery
          .split('/')
          .map((seg) => {
            if (!seg) return seg
            if (/^\d+$/.test(seg)) return ':id'
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':id'
            if (/^[0-9a-f]{24}$/i.test(seg)) return ':id'
            return seg
          })
          .join('/')
      }
    }

    // 去除查询参数后返回模式，保留 hash 路径以区分 SPA 不同页面
    return `${parsed.origin}${normalizedPath}${hashPath ? '#' + hashPath : ''}`
  } catch {
    return url
  }
}

export class Crawler {
  private visitedUrls = new Set<string>()
  private urlQueue: Array<{ url: string; depth: number }> = []
  private pages: SitePage[] = []
  private cancelled = false
  private sharedPage: Page | null = null
  /** 已访问的URL模式集合，用于去重同类页面 */
  private visitedPatterns = new Set<string>()
  /** 每种URL模式已访问的代表数量，限制每种模式最多访问N个 */
  private patternVisitCount = new Map<string, number>()
  /** 每种模式最多访问的页面数 */
  private readonly MAX_PAGES_PER_PATTERN = 2

  constructor(
    private browserManager: BrowserManager,
    private requestCapture: RequestCapture,
    private config: SiteAnalyzerConfig,
    private onProgress: (progress: SiteAnalyzerProgress) => void,
    private loginPage?: Page
  ) {}

  /**
   * 开始爬取
   */
  async crawl(): Promise<SitePage[]> {
    const rules = this.config.crawlRules || {}
    const maxDepth = rules.maxDepth ?? 3
    const maxPages = rules.maxPages ?? 100
    const crawlDelay = rules.crawlDelay ?? 1000

    console.log(`[Crawler] ===== crawl 开始 ===== targetUrl: ${this.config.targetUrl}, maxDepth: ${maxDepth}, maxPages: ${maxPages}`)

    // 优先复用登录页面，保持登录状态；否则创建新页面
    if (this.loginPage) {
      this.sharedPage = this.loginPage
      console.log('[Crawler] 复用登录页面，当前URL:', this.sharedPage.url())
    } else {
      await this.recreateSharedPage()
    }

    // 开始捕获网络请求（只需注册一次，复用同一个 page）
    if (this.sharedPage) {
      this.requestCapture.startCapture(this.sharedPage)
    }

    // 连续失败计数，用于检测浏览器断开
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 5
    // 连续404/空响应计数，用于检测session丢失（页面返回null但不抛异常的情况）
    let consecutiveNullResponses = 0
    const MAX_CONSECUTIVE_NULL_RESPONSES = 3

    try {
      // 从首页开始
      this.urlQueue.push({ url: this.config.targetUrl, depth: 0 })

      while (this.urlQueue.length > 0 && !this.cancelled) {
        // 检查页面数量限制
        if (this.pages.length >= maxPages) {
          this.onProgress({
            taskId: this.config.taskId,
            type: 'crawling',
            message: `已达到最大页面数量限制 (${maxPages})，停止爬取`,
            pagesCrawled: this.pages.length
          })
          break
        }

        // 连续失败过多，说明浏览器可能已不可用
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(`[Crawler] 连续失败 ${consecutiveFailures} 次，尝试恢复浏览器...`)
          const recovered = await this.recoverBrowser()
          if (!recovered) {
            this.onProgress({
              taskId: this.config.taskId,
              type: 'error',
              message: `浏览器已断开且无法恢复，停止爬取（已爬取 ${this.pages.length} 个页面）`,
              pagesCrawled: this.pages.length,
              error: '浏览器连接断开'
            })
            break
          }
          consecutiveFailures = 0
        }

        const { url, depth } = this.urlQueue.shift()!

        // 跳过已访问的URL
        if (this.visitedUrls.has(url)) continue

        // 检查URL过滤规则
        if (!this.shouldCrawl(url, rules)) continue

        // 检查深度限制
        if (depth > maxDepth) continue

        // ===== 问题2修复：URL模式去重 =====
        const pattern = normalizeUrlPattern(url)
        const patternCount = this.patternVisitCount.get(pattern) || 0
        if (patternCount >= this.MAX_PAGES_PER_PATTERN) {
          console.log(`[Crawler] 跳过重复模式页面 (${patternCount}/${this.MAX_PAGES_PER_PATTERN}): ${url} → 模式: ${pattern}`)
          continue
        }

        // 连续多个页面返回null（404/导航失败等），可能是session丢失，尝试恢复
        if (consecutiveNullResponses >= MAX_CONSECUTIVE_NULL_RESPONSES) {
          console.warn(`[Crawler] 连续 ${consecutiveNullResponses} 个页面返回空响应，可能session丢失，尝试恢复浏览器...`)
          const recovered = await this.recoverBrowser()
          if (!recovered) {
            this.onProgress({
              taskId: this.config.taskId,
              type: 'error',
              message: `连续多个页面无法访问且浏览器无法恢复，停止爬取（已爬取 ${this.pages.length} 个页面）`,
              pagesCrawled: this.pages.length,
              error: '连续页面失败，浏览器可能已断开'
            })
            break
          }
          consecutiveNullResponses = 0
        }

        this.visitedUrls.add(url)
        this.patternVisitCount.set(pattern, patternCount + 1)

        this.onProgress({
          taskId: this.config.taskId,
          type: 'crawling',
          message: `正在爬取页面 (${this.pages.length + 1}): ${url}`,
          pagesCrawled: this.pages.length,
          currentUrl: url
        })

        try {
          const sitePage = await this.crawlPage(url, depth)
          if (sitePage) {
            this.pages.push(sitePage)
            consecutiveFailures = 0 // 重置失败计数
            consecutiveNullResponses = 0 // 重置空响应计数

            // 将新发现的链接加入队列（根据模式去重过滤）
            if (depth < maxDepth) {
              for (const link of sitePage.links || []) {
                if (!this.visitedUrls.has(link)) {
                  const linkPattern = normalizeUrlPattern(link)
                  const linkPatternCount = this.patternVisitCount.get(linkPattern) || 0
                  // 只有该模式还没达到上限的才加入队列
                  if (linkPatternCount < this.MAX_PAGES_PER_PATTERN) {
                    this.urlQueue.push({ url: link, depth: depth + 1 })
                  }
                }
              }
            }

            this.onProgress({
              taskId: this.config.taskId,
              type: 'page_crawled',
              message: `页面爬取完成: ${sitePage.title || url}`,
              pagesCrawled: this.pages.length,
              currentUrl: url
            })
          } else {
            // crawlPage 返回 null（404响应、导航失败等），计入空响应计数
            consecutiveNullResponses++
            console.warn(`[Crawler] 页面返回空响应 (${consecutiveNullResponses}/${MAX_CONSECUTIVE_NULL_RESPONSES}): ${url}`)
          }
        } catch (error) {
          consecutiveFailures++
          consecutiveNullResponses = 0 // 抛异常说明有明确错误，重置空响应计数
          const errorMsg = error instanceof Error ? error.message : '未知错误'
          console.error(`[Crawler] 爬取失败 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${url} - ${errorMsg}`)
          this.onProgress({
            taskId: this.config.taskId,
            type: 'error',
            message: `爬取页面失败: ${url} - ${errorMsg}`,
            pagesCrawled: this.pages.length,
            error: errorMsg
          })
        }

        // 爬取间隔
        if (crawlDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, crawlDelay))
        }

        // 模拟人类行为
        if (this.config.antiBot?.simulateHuman && this.sharedPage) {
          try {
            await this.browserManager.simulateHumanBehavior(this.sharedPage)
          } catch {
            // 忽略
          }
        }
      }
    } finally {
      // 爬取结束后才关闭共享 page
      if (this.sharedPage) {
        try {
          await this.sharedPage.close()
        } catch {
          // 忽略关闭错误
        }
        this.sharedPage = null
      }
    }

    return this.pages
  }

  /**
   * 重建共享页面（浏览器重连后使用）
   */
  private async recreateSharedPage(): Promise<void> {
    // 先清理旧页面的请求监听器，避免内存泄漏和重复注册
    this.requestCapture.stopCapture()

    const context = this.browserManager.getContext()
    if (!context) {
      throw new Error('浏览器上下文不可用')
    }
    this.sharedPage = await context.newPage()
    console.log('[Crawler] 创建了新页面')
    // 重新注册请求捕获
    this.requestCapture.startCapture(this.sharedPage)
  }

  /**
   * 恢复浏览器连接
   */
  private async recoverBrowser(): Promise<boolean> {
    console.log('[Crawler] 尝试恢复浏览器连接...')
    this.onProgress({
      taskId: this.config.taskId,
      type: 'error',
      message: '浏览器连接断开，正在尝试恢复...',
      pagesCrawled: this.pages.length,
      error: '浏览器断开'
    })

    const reconnected = await this.browserManager.tryReconnect()
    if (!reconnected) return false

    try {
      await this.recreateSharedPage()
      console.log('[Crawler] 浏览器恢复成功，登录态已自动恢复，继续爬取')
      this.onProgress({
        taskId: this.config.taskId,
        type: 'crawling',
        message: '浏览器已恢复（登录态已自动恢复），继续爬取...',
        pagesCrawled: this.pages.length
      })
      return true
    } catch (e) {
      console.error('[Crawler] 恢复后创建页面失败:', e)
      return false
    }
  }

  /**
   * 爬取单个页面（复用共享 page，通过 goto 导航）
   */
  private async crawlPage(url: string, depth: number): Promise<SitePage | null> {
    if (!this.sharedPage) return null

    const page = this.sharedPage

    try {
      const currentUrl = page.url()
      console.log(`[Crawler] crawlPage: 开始导航到 ${url}，当前URL: ${currentUrl}`)

      // 如果当前页面已经是目标URL，跳过导航
      const currentBase = currentUrl.split('#')[0].split('?')[0]
      const targetBase = url.split('#')[0].split('?')[0]
      const targetHash = new URL(url).hash

      if (currentUrl === url || (currentBase === targetBase && !targetHash)) {
        console.log(`[Crawler] crawlPage: 当前页面已是目标URL，跳过导航`)
      } else if (currentBase === targetBase && targetHash) {
        // SPA hash 路由：同 base URL 不同 hash，通过 JS 改变 hash 触发路由
        console.log(`[Crawler] crawlPage: SPA hash 路由导航到 ${targetHash}`)
        await page.evaluate((hash: string) => {
          window.location.hash = hash
        }, targetHash)
        // 等待 SPA 路由更新
        await new Promise((resolve) => setTimeout(resolve, 1500))
      } else {
        // 不同页面：使用 goto 导航，捕获响应状态码
        const response = await this.navigateToWithRetry(page, url)
        // 检查 HTTP 状态码，跳过 404/5xx 等错误页面
        if (response && response.status() >= 400) {
          console.warn(`[Crawler] crawlPage: 页面返回 ${response.status()}，跳过: ${url}`)
          return null
        }
        // 导航失败（返回null）且浏览器已断开，触发错误让外层处理恢复
        if (!response && !this.browserManager.isAlive()) {
          throw new Error('Browser has been closed after navigation failure')
        }
      }

      // 验证当前页面是否仍在目标域名下（防止被重定向到外部站点）
      const finalUrl = page.url()
      try {
        const finalHost = new URL(finalUrl).hostname
        const targetHost = new URL(this.config.targetUrl).hostname
        if (finalHost !== targetHost) {
          console.warn(`[Crawler] crawlPage: 页面被重定向到外部域名 ${finalHost}，跳过: ${url}`)
          return null
        }
      } catch {
        // URL 解析失败，继续处理
      }

      console.log(`[Crawler] crawlPage: 导航完成，当前URL: ${finalUrl}`)

      // 等待页面稳定
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 自动处理同意弹窗（cookie banner、服务协议等）
      await this.handleConsentDialogs(page)

      // 获取页面信息
      const title = await page.title()
      const rawHtml = await page.content()
      // P2优化：立即精简HTML（移除script/style/svg/comment），大幅减少内存占用
      const html = this.simplifyHtml(rawHtml)
      const links = await this.browserManager.getPageLinks(page, this.config.targetUrl)
      const forms = await this.browserManager.getPageForms(page)
      const screenshot = await this.browserManager.takeScreenshot(page)

      console.log(`[Crawler] crawlPage: 页面信息 - title="${title}", links=${links.length}, forms=${forms.length}, html=${(html.length / 1024).toFixed(0)}KB`)

      // 判断页面类型
      const pageType = this.detectPageType(url, title, html)

      // 提取页面结构化信息（侧边栏、表格详情、表单详情等）
      const pageStructure = await this.extractPageStructure(page)
      console.log(`[Crawler] crawlPage: 页面结构 - 表格=${pageStructure.tables.length}, 表单=${pageStructure.forms.length}, 侧边栏=${pageStructure.sidebar?.items.length || 0}项, 统计卡片=${pageStructure.statCards.length}`)

      // 页面交互探索
      const interactionResults = await this.explorePageInteractions(page, pageType)

      return {
        url,
        title,
        html,
        screenshot,
        pageType,
        links,
        forms,
        depth,
        interactionResults,
        pageStructure
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.log(`[Crawler] crawlPage: 异常 - ${errorMsg}`)

      // 检测浏览器断开并尝试恢复
      if (this.isBrowserDisconnectError(errorMsg)) {
        console.warn('[Crawler] crawlPage: 检测到浏览器断开，尝试恢复...')
        const recovered = await this.recoverBrowser()
        if (recovered && this.sharedPage) {
          // 恢复成功，使用新页面重试当前URL（直接返回结果，不重新抛出异常）
          try {
            const retryPage = this.sharedPage
            const retryResponse = await this.navigateToWithRetry(retryPage, url)
            if (retryResponse && retryResponse.status() >= 400) {
              console.warn(`[Crawler] 恢复后页面返回 ${retryResponse.status()}，跳过: ${url}`)
              return null
            }
            await new Promise((resolve) => setTimeout(resolve, 1000))
            const title = await retryPage.title()
            const rawHtml = await retryPage.content()
            const html = this.simplifyHtml(rawHtml)
            const links = await this.browserManager.getPageLinks(retryPage, this.config.targetUrl)
            const forms = await this.browserManager.getPageForms(retryPage)
            const screenshot = await this.browserManager.takeScreenshot(retryPage)
            const pageType = this.detectPageType(url, title, html)
            const pageStructure = await this.extractPageStructure(retryPage)
            return { url, title, html, screenshot, pageType, links, forms, depth, interactionResults: [], pageStructure }
          } catch (retryErr) {
            console.error('[Crawler] 恢复后重试仍然失败:', retryErr)
            return null
          }
        }
      }
      throw error
    }
  }

  /**
   * 导航到指定URL并支持重试，返回响应对象用于检查状态码
   */
  private async navigateToWithRetry(page: Page, url: string): Promise<import('playwright').Response | null> {
    // 第一次尝试：domcontentloaded（适合 SPA）
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      return response
    } catch (e1) {
      // 第一次失败：检查是否是浏览器断开，如果是则直接抛出，不做无意义的第二次尝试
      const errMsg1 = e1 instanceof Error ? e1.message : String(e1)
      if (this.isBrowserDisconnectError(errMsg1)) {
        throw e1
      }
      // 第二次尝试：load（更宽松）
      try {
        const response = await page.goto(url, { waitUntil: 'load', timeout: 20000 })
        return response
      } catch (e2) {
        // 如果错误是浏览器断开类型，直接抛出让上层处理恢复
        const errMsg2 = e2 instanceof Error ? e2.message : String(e2)
        if (this.isBrowserDisconnectError(errMsg2)) {
          throw e2
        }
        // 其他错误（如超时），返回 null 让上层跳过此页面
        console.warn(`[Crawler] navigateToWithRetry: 导航失败，跳过: ${url} - ${errMsg2}`)
        return null
      }
    }
  }

  /**
   * 判断错误是否是浏览器断开导致的
   */
  private isBrowserDisconnectError(errorMsg: string): boolean {
    const keywords = [
      // 原有关键词
      'Target closed', 'Browser closed', 'Browser has been closed',
      'Connection closed', 'Session closed', 'browser.newContext',
      'Target page, context or browser has been closed',
      'Navigation failed', 'net::ERR_', 'BROWSER_RECONNECTED',
      // Playwright 常见断开/上下文销毁错误
      'Execution context was destroyed',
      'Cannot find context with specified id',
      'Frame was detached',
      'Protocol error',
      'Connection refused',
      'Socket closed',
      'ECONNREFUSED',
      'browser has been closed',
      'target closed',
      'page has been closed',
      'context has been closed',
      'page was closed',
    ]
    // 大小写不敏感匹配，避免因大小写差异漏检
    const lowerMsg = errorMsg.toLowerCase()
    return keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()))
  }

  /**
   * 页面交互探索（问题3的核心修复）
   * 点击页面上的操作按钮、Tab、折叠面板等，深入了解页面功能
   */
  /** 每个页面交互探索的最大截图数（防止内存膨胀） */
  private readonly MAX_INTERACTION_SCREENSHOTS = 2

  private async explorePageInteractions(
    page: Page,
    pageType: string | undefined
  ): Promise<Array<{
    action: string
    element: string
    result: string
    screenshot?: string
  }>> {
    const results: Array<{
      action: string
      element: string
      result: string
      screenshot?: string
    }> = []

    // 对于某些页面类型，跳过深度交互（避免破坏登录状态等）
    const skipTypes = ['登录页', '注册页', 'API页面']
    if (pageType && skipTypes.includes(pageType)) {
      return results
    }

    console.log(`[Crawler] 开始页面交互探索: ${page.url()}`)

    // 设置交互探索总超时（30秒），防止某个交互卡住导致整个爬取停滞
    const explorationTimeout = setTimeout(() => {
      console.warn('[Crawler] 页面交互探索超时（30秒），强制结束')
    }, 30000)

    try {
      // 1. 探索 Tab 标签页
      await this.exploreTabs(page, results)

      // 2. 探索可折叠/展开的面板
      await this.exploreCollapsiblePanels(page, results)

      // 3. 探索下拉菜单
      await this.exploreDropdowns(page, results)

      // 4. 探索功能操作按钮（非导航、非同意类）
      await this.exploreActionButtons(page, results)

      console.log(`[Crawler] 页面交互探索完成: ${results.length} 个交互`)
    } catch (e) {
      console.warn('[Crawler] 页面交互探索异常:', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(explorationTimeout)
    }

    // P2优化：限制交互截图数量，只保留前N个截图，其余清空以节省内存
    let screenshotCount = 0
    for (const r of results) {
      if (r.screenshot) {
        screenshotCount++
        if (screenshotCount > this.MAX_INTERACTION_SCREENSHOTS) {
          r.screenshot = undefined // 释放截图内存
        }
      }
    }

    return results
  }

  /**
   * 探索Tab标签页
   */
  private async exploreTabs(
    page: Page,
    results: Array<{ action: string; element: string; result: string; screenshot?: string }>
  ): Promise<void> {
    try {
      const tabSelectors = [
        '[role="tab"]',
        '.ant-tabs-tab',
        '.el-tabs__item',
        '.tab-item',
        '.nav-tab',
        '[class*="tab-btn"]',
        '[class*="tab-button"]',
        '[data-toggle="tab"]',
      ]

      for (const selector of tabSelectors) {
        const tabs = await page.$$(selector)
        // 每种选择器最多点击前3个Tab
        const tabsToClick = tabs.slice(0, 3)

        for (const tab of tabsToClick) {
          try {
            if (!(await tab.isVisible().catch(() => false))) continue
            const tabText = await tab.textContent().catch(() => '')
            const trimmedText = (tabText || '').trim().substring(0, 30)
            if (!trimmedText) continue

            // 跳过已选中的Tab
            const isSelected = await tab.evaluate((el) => {
              return el.getAttribute('aria-selected') === 'true' ||
                el.classList.contains('active') ||
                el.classList.contains('is-active') ||
                el.classList.contains('ant-tabs-tab-active')
            }).catch(() => false)
            if (isSelected) continue

            // console.log(`[Crawler] 点击Tab: "${trimmedText}"`)
            await tab.click()
            await new Promise((resolve) => setTimeout(resolve, 1000))

            // 截图记录Tab内容
            const screenshot = await this.browserManager.takeScreenshot(page).catch(() => undefined)

            results.push({
              action: '点击Tab',
              element: trimmedText,
              result: `Tab "${trimmedText}" 已展开`,
              screenshot
            })
          } catch {
            // Tab点击失败，继续
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  /**
   * 探索可折叠/展开的面板
   */
  private async exploreCollapsiblePanels(
    page: Page,
    results: Array<{ action: string; element: string; result: string; screenshot?: string }>
  ): Promise<void> {
    try {
      const collapseSelectors = [
        '.ant-collapse-header',
        '.el-collapse-item__header',
        '[data-toggle="collapse"]',
        '.accordion-header',
        '.collapse-toggle',
        '[class*="expand-btn"]',
        '[class*="collapse-btn"]',
        '[class*="toggle-btn"]',
        // 通用的可点击标题（带箭头图标的）
        '[class*="header"] > [class*="arrow"]',
        '[class*="title"] > [class*="arrow"]',
      ]

      for (const selector of collapseSelectors) {
        const items = await page.$$(selector)
        const itemsToClick = items.slice(0, 3)

        for (const item of itemsToClick) {
          try {
            if (!(await item.isVisible().catch(() => false))) continue
            const itemText = await item.textContent().catch(() => '')
            const trimmedText = (itemText || '').trim().substring(0, 30)
            if (!trimmedText) continue

            // console.log(`[Crawler] 展开折叠面板: "${trimmedText}"`)
            await item.click()
            await new Promise((resolve) => setTimeout(resolve, 800))

            results.push({
              action: '展开折叠面板',
              element: trimmedText,
              result: `面板 "${trimmedText}" 已展开`
            })
          } catch {
            // 忽略
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  /**
   * 探索下拉菜单
   */
  private async exploreDropdowns(
    page: Page,
    results: Array<{ action: string; element: string; result: string; screenshot?: string }>
  ): Promise<void> {
    try {
      const dropdownSelectors = [
        '.ant-dropdown-trigger',
        '.el-dropdown',
        '[class*="dropdown-toggle"]',
        '[data-toggle="dropdown"]',
        '[aria-haspopup="true"]',
        '[aria-expanded="false"]',
      ]

      for (const selector of dropdownSelectors) {
        const triggers = await page.$$(selector)
        const triggersToClick = triggers.slice(0, 2)

        for (const trigger of triggersToClick) {
          try {
            if (!(await trigger.isVisible().catch(() => false))) continue
            const triggerText = await trigger.textContent().catch(() => '')
            const trimmedText = (triggerText || '').trim().substring(0, 20)

            // console.log(`[Crawler] 打开下拉菜单: "${trimmedText || selector}"`)
            await trigger.click()
            await new Promise((resolve) => setTimeout(resolve, 800))

            // 截图记录下拉菜单内容
            const screenshot = await this.browserManager.takeScreenshot(page).catch(() => undefined)

            results.push({
              action: '打开下拉菜单',
              element: trimmedText || selector,
              result: `下拉菜单已打开`,
              screenshot
            })

            // 关闭下拉菜单（点击其他地方）
            await page.keyboard.press('Escape')
            await new Promise((resolve) => setTimeout(resolve, 300))
          } catch {
            // 忽略
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  /**
   * 探索功能操作按钮
   * 排除导航链接、同意/取消按钮，只关注功能性操作
   */
  private async exploreActionButtons(
    page: Page,
    results: Array<{ action: string; element: string; result: string; screenshot?: string }>
  ): Promise<void> {
    try {
      // 收集页面上所有看起来像操作按钮的元素
      const actionButtons = await page.evaluate(() => {
        const buttonSelectors = [
          'button:not([type="submit"])',
          '[role="button"]',
          'a.btn', 'a.button',
          '[class*="btn"]:not([class*="close"]):not([class*="cancel"])',
          '[class*="action-btn"]',
          '[class*="tool-btn"]',
          '[class*="operate"]',
        ]

        // 排除关键词（导航、认证、表单操作、危险操作类按钮不应被点击）
        const excludeKeywords = [
          // 认证相关
          '登录', '登出', '注销', '退出', '注册', 'sign', 'login', 'logout', 'signin', 'signup',
          // 表单操作
          '同意', '接受', '取消', '关闭', '确定', '确认', 'confirm', 'cancel', 'close',
          'accept', 'agree', 'submit', '提交', '保存', 'save',
          // 导航相关
          '上一页', '下一页', '首页', '末页', 'prev', 'next', 'first', 'last',
          '返回', 'back', 'home', '主页', '返回首页', '返回上级',
          // 搜索/筛选
          '搜索', 'search', '筛选', 'filter',
          // 危险操作
          '删除', 'delete', '移除', 'remove', '清空', 'clear',
          // 下载/导出（可能触发文件下载弹窗）
          '下载', 'download', '导出', 'export', '打印', 'print',
          // 发布/上线（可能触发不可逆操作）
          '发布', 'publish', '上线', 'deploy', '生效', 'activate',
          // 授权/权限（可能改变系统状态）
          '授权', 'authorize', '审批', 'approve', '拒绝', 'reject',
        ]

        const candidates: Array<{ selector: string; text: string; tag: string }> = []

        for (const sel of buttonSelectors) {
          const elements = document.querySelectorAll(sel)
          for (const el of elements) {
            // 检查可见性
            const rect = el.getBoundingClientRect()
            if (rect.width < 30 || rect.height < 20) continue
            if (rect.width > 500 || rect.height > 100) continue // 太大的可能是容器

            const style = window.getComputedStyle(el)
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue

            const text = (el.textContent || '').trim()
            if (!text || text.length > 30 || text.length < 2) continue

            // 排除导航类按钮
            const textLower = text.toLowerCase()
            if (excludeKeywords.some(kw => textLower.includes(kw))) continue

            // 排除导航链接
            if (el.tagName === 'A' && (el as HTMLAnchorElement).href) {
              const href = (el as HTMLAnchorElement).href
              if (href.includes('#/') || href.includes('/page/') || href.includes('/list')) continue
            }

            // 排除已经被点击过的（有active/selected状态）
            if (el.classList.contains('active') || el.classList.contains('selected')) continue

            candidates.push({
              selector: sel,
              text: text.substring(0, 30),
              tag: el.tagName.toLowerCase()
            })
          }
        }

        // 去重并限制数量
        const seen = new Set<string>()
        return candidates.filter(c => {
          const key = `${c.text}_${c.tag}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }).slice(0, 5) // 最多探索5个操作按钮
      })

      for (const btnInfo of actionButtons) {
        try {
          // 通过文本内容查找按钮
          const btn = await page.locator(`${btnInfo.tag}:has-text("${btnInfo.text}")`).first()
          if (!btn || !(await btn.isVisible().catch(() => false))) continue

          // 记录点击前的 URL，用于检测是否发生了页面导航
          const urlBeforeClick = page.url()

          // console.log(`[Crawler] 点击操作按钮: "${btnInfo.text}"`)
          await btn.click()
          await new Promise((resolve) => setTimeout(resolve, 1000))

          // 检测是否发生了页面导航（URL 变化 = 按钮触发了跳转）
          const urlAfterClick = page.url()
          if (urlAfterClick !== urlBeforeClick) {
            // console.warn(`[Crawler] 按钮 "${btnInfo.text}" 触发了页面导航: ${urlBeforeClick} → ${urlAfterClick}，回退`)
            results.push({
              action: '点击操作按钮（已回退）',
              element: btnInfo.text,
              result: `按钮触发了页面导航，已回退到原页面`
            })
            // 导航回原页面
            try {
              await page.goto(urlBeforeClick, { waitUntil: 'domcontentloaded', timeout: 10000 })
              await new Promise((resolve) => setTimeout(resolve, 1000))
            } catch {
              // 回退失败，后续页面可能受影响，但不影响当前循环
            }
            continue
          }

          // 检查是否出现了弹窗/模态框/抽屉
          const hasNewContent = await page.evaluate(() => {
            const modalSelectors = [
              '.ant-modal', '.el-dialog', '.modal', '[role="dialog"]',
              '.ant-drawer', '.el-drawer', '.drawer',
              '[class*="popup"]', '[class*="panel"]'
            ]
            return modalSelectors.some(sel => {
              const el = document.querySelector(sel)
              if (!el) return false
              const style = window.getComputedStyle(el)
              return style.display !== 'none' && style.visibility !== 'hidden'
            })
          }).catch(() => false)

          const screenshot = await this.browserManager.takeScreenshot(page).catch(() => undefined)

          if (hasNewContent) {
            results.push({
              action: '点击操作按钮',
              element: btnInfo.text,
              result: `点击后出现了弹窗/面板`,
              screenshot
            })

            // 关闭弹窗
            await page.keyboard.press('Escape')
            await new Promise((resolve) => setTimeout(resolve, 500))
          } else {
            results.push({
              action: '点击操作按钮',
              element: btnInfo.text,
              result: `按钮已点击`,
              screenshot
            })
          }
        } catch {
          // 按钮点击失败，继续
        }
      }
    } catch {
      // 忽略
    }
  }

  /**
   * 自动处理同意弹窗
   * 尝试点击常见的"同意"、"接受"、"我已阅读"等按钮
   */
  private async handleConsentDialogs(page: Page): Promise<void> {
    for (const selector of CONSENT_SELECTORS) {
      try {
        const element = await page.$(selector)
        if (element) {
          // 检查元素是否可见
          const isVisible = await element.isVisible()
          if (isVisible) {
            await element.click()
            // 等待弹窗消失
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }
      } catch {
        // 选择器匹配失败或点击失败，继续尝试下一个
      }
    }

    // 额外处理：如果页面有 checkbox 类型的同意框（如"已阅读并同意服务协议"）
    // 通常这类 checkbox 需要先勾选才能继续
    try {
      const checkboxes = await page.$$('input[type="checkbox"]')
      for (const checkbox of checkboxes) {
        const isVisible = await checkbox.isVisible()
        if (!isVisible) continue

        // 检查关联的 label 或附近的文本是否包含同意关键词
        const parentText = await checkbox.evaluate((el) => {
          // 查找最近的 label 或父元素文本
          const label = el.closest('label')
          const parent = el.closest('[class*="agree"], [class*="consent"], [class*="protocol"], [class*="check"]')
          const text = (label?.textContent || parent?.textContent || '').toLowerCase()
          return text
        })

        const consentKeywords = ['同意', '已阅读', '服务协议', '隐私政策', '个人信息保护',
          'agree', 'accept', 'terms', 'privacy', 'policy', 'consent']

        if (consentKeywords.some((kw) => parentText.includes(kw))) {
          const isChecked = await checkbox.isChecked()
          if (!isChecked) {
            await checkbox.check()
            await new Promise((resolve) => setTimeout(resolve, 300))
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  /**
   * 判断页面类型
   */
  private detectPageType(url: string, title: string, html: string): string {
    const urlLower = url.toLowerCase()
    const titleLower = title.toLowerCase()
    const htmlLower = html.toLowerCase()

    if (urlLower.endsWith('/') || urlLower.endsWith('/index') || urlLower.endsWith('/index.html')) {
      return '首页'
    }
    if (urlLower.includes('/login') || urlLower.includes('/signin') || titleLower.includes('登录')) {
      return '登录页'
    }
    if (urlLower.includes('/register') || urlLower.includes('/signup') || titleLower.includes('注册')) {
      return '注册页'
    }
    if (urlLower.includes('/search') || titleLower.includes('搜索')) {
      return '搜索页'
    }
    if (urlLower.includes('/list') || urlLower.includes('/category') || htmlLower.includes('pagination')) {
      return '列表页'
    }
    if (urlLower.includes('/detail') || urlLower.includes('/article') || urlLower.includes('/post')) {
      return '详情页'
    }
    if (urlLower.includes('/admin') || urlLower.includes('/dashboard')) {
      return '管理页'
    }
    if (urlLower.includes('/api/')) {
      return 'API页面'
    }
    if (urlLower.includes('/about') || urlLower.includes('/contact')) {
      return '信息页'
    }

    return '其他'
  }

  /**
   * 检查URL是否应该爬取
   */
  private shouldCrawl(url: string, rules: CrawlRules): boolean {
    // 排除非HTTP(S)协议
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false

    // 排除静态资源
    const staticExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp',
      '.css', '.js', '.woff', '.woff2', '.ttf', '.eot',
      '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.avi'
    ]
    const urlPath = new URL(url).pathname.toLowerCase()
    if (staticExtensions.some((ext) => urlPath.endsWith(ext))) return false

    // URL包含过滤
    if (rules.urlIncludePatterns && rules.urlIncludePatterns.length > 0) {
      const matches = rules.urlIncludePatterns.some((pattern) => {
        try {
          return new RegExp(pattern).test(url)
        } catch {
          return url.includes(pattern)
        }
      })
      if (!matches) return false
    }

    // URL排除过滤
    if (rules.urlExcludePatterns && rules.urlExcludePatterns.length > 0) {
      const excluded = rules.urlExcludePatterns.some((pattern) => {
        try {
          return new RegExp(pattern).test(url)
        } catch {
          return url.includes(pattern)
        }
      })
      if (excluded) return false
    }

    return true
  }

  /**
   * 从页面DOM中提取结构化信息（侧边栏、表格详情、表单详情、页面头部等）
   * 这些结构化数据比原始HTML更有价值，可直接用于AI分析和报告生成
   */
  private async extractPageStructure(page: Page): Promise<PageStructure> {
    const structure: PageStructure = {
      tables: [],
      forms: [],
      statCards: [],
      allButtons: []
    }

    try {
      const data = await page.evaluate(() => {
        const result: {
          sidebar?: { items: Array<{ text: string; isActive: boolean; level: number }>; activeItem?: string }
          tables: Array<{
            title?: string
            columns: string[]
            rowCount: number
            hasCheckbox: boolean
            hasIndex: boolean
            hasAction: boolean
            actionButtons: string[]
            headerButtons: string[]
            hasPagination: boolean
          }>
          forms: Array<{
            title?: string
            fields: Array<{
              label: string
              type: string
              placeholder?: string
              required: boolean
              options?: string[]
              defaultValue?: string
            }>
            buttons: string[]
          }>
          pageHeader?: { title: string; breadcrumbs: string[]; headerActions: string[] }
          statCards: Array<{ label: string; value: string }>
          allButtons: string[]
        } = { tables: [], forms: [], statCards: [], allButtons: [] }

        // ===== 1. 提取侧边栏/导航菜单 =====
        const sidebarSelectors = [
          '.ant-menu', '.el-menu', '.el-aside', 'nav[role="navigation"]',
          '.sidebar', '.side-menu', '.side-nav', '.left-menu',
          '[class*="sidebar"]', '[class*="side-menu"]', '[class*="sider"]',
          '[class*="left-nav"]', '[class*="menu-nav"]'
        ]
        for (const sel of sidebarSelectors) {
          const sidebarEl = document.querySelector(sel)
          if (!sidebarEl) continue
          const rect = sidebarEl.getBoundingClientRect()
          if (rect.width < 50 || rect.width > 500) continue
          if (rect.height < 100) continue

          const menuItems: Array<{ text: string; isActive: boolean; level: number }> = []
          const itemSelectors = [
            '.ant-menu-item', '.el-menu-item', '.ant-menu-submenu-title',
            '.el-submenu__title', 'li[role="menuitem"]', 'a[class*="menu"]',
            'a[class*="nav-item"]', 'a[class*="sidebar-item"]'
          ]
          for (const itemSel of itemSelectors) {
            const items = sidebarEl.querySelectorAll(itemSel)
            for (const item of items) {
              const text = (item.textContent || '').trim().substring(0, 30)
              if (!text || text.length < 2) continue
              const isActive = item.classList.contains('ant-menu-item-selected') ||
                item.classList.contains('is-active') ||
                item.classList.contains('active') ||
                item.getAttribute('aria-selected') === 'true'
              const level = item.closest('.ant-menu-submenu') ? 1 : 0
              menuItems.push({ text, isActive, level })
            }
          }
          if (menuItems.length > 0) {
            const activeItem = menuItems.find(m => m.isActive)?.text
            result.sidebar = { items: menuItems, activeItem }
            break
          }
        }

        // ===== 2. 提取表格详情 =====
        const tableSelectors = [
          'table', '.ant-table', '.el-table', '[class*="data-table"]',
          '[class*="grid-table"]', '[role="grid"]'
        ]
        const processedTables = new Set<Element>()
        for (const sel of tableSelectors) {
          const tables = document.querySelectorAll(sel)
          for (const table of tables) {
            if (processedTables.has(table)) continue
            processedTables.add(table)

            const rect = table.getBoundingClientRect()
            if (rect.width < 200 || rect.height < 50) continue

            // 提取列头
            const headers = table.querySelectorAll('th')
            const columns: string[] = []
            for (const th of headers) {
              const text = (th.textContent || '').trim().substring(0, 30)
              if (text) columns.push(text)
            }
            if (columns.length === 0) continue

            // 提取数据行数
            const rows = table.querySelectorAll('tbody tr')
            const rowCount = rows.length

            // 检测特殊列
            const hasCheckbox = !!table.querySelector('input[type="checkbox"], .ant-checkbox, .el-checkbox, [class*="selection"]')
            const hasIndex = columns.some(c => /序号|编号|No\.|#|idx/i.test(c))
            const hasAction = columns.some(c => /操作|action|操作列/i.test(c))

            // 提取操作列按钮
            const actionButtons: string[] = []
            if (hasAction) {
              const lastTh = headers[headers.length - 1]
              if (lastTh) {
                const actionRow = table.querySelectorAll('tbody tr:first-child td:last-child a, tbody tr:first-child td:last-child button')
                for (const btn of actionRow) {
                  const text = (btn.textContent || '').trim().substring(0, 15)
                  if (text) actionButtons.push(text)
                }
              }
            }

            // 提取表格上方的操作按钮
            const headerButtons: string[] = []
            const parentContainer = table.closest('.ant-card, .el-card, [class*="table-wrapper"], [class*="table-container"]') || table.parentElement
            if (parentContainer) {
              const headerBtns = parentContainer.querySelectorAll('.ant-card-head button, .el-card__header button, [class*="toolbar"] button, [class*="header"] button, [class*="action-bar"] button')
              for (const btn of headerBtns) {
                const text = (btn.textContent || '').trim().substring(0, 20)
                if (text && text.length >= 2) headerButtons.push(text)
              }
            }

            // 检测分页
            const hasPagination = !!(
              table.closest('.ant-card, .el-card, [class*="table-wrapper"]')?.querySelector('.ant-pagination, .el-pagination, [class*="pagination"]') ||
              document.querySelector('.ant-pagination, .el-pagination, [class*="pagination"]')
            )

            // 表格标题
            let title: string | undefined
            const titleEl = parentContainer?.querySelector('.ant-card-head-title, .el-card__header h3, [class*="table-title"], [class*="card-title"]')
            if (titleEl) title = (titleEl.textContent || '').trim().substring(0, 50)

            result.tables.push({
              title,
              columns,
              rowCount,
              hasCheckbox,
              hasIndex,
              hasAction,
              actionButtons: [...new Set(actionButtons)],
              headerButtons: [...new Set(headerButtons)],
              hasPagination
            })
          }
        }

        // ===== 3. 提取表单详情 =====
        const formSelectors = [
          'form', '.ant-form', '.el-form', '[class*="search-form"]',
          '[class*="filter-form"]', '[class*="query-form"]'
        ]
        const processedForms = new Set<Element>()
        for (const sel of formSelectors) {
          const forms = document.querySelectorAll(sel)
          for (const form of forms) {
            if (processedForms.has(form)) continue
            processedForms.add(form)

            const rect = form.getBoundingClientRect()
            if (rect.width < 100 || rect.height < 30) continue

            const fields: Array<{
              label: string
              type: string
              placeholder?: string
              required: boolean
              options?: string[]
              defaultValue?: string
            }> = []

            // 提取表单项
            const formItems = form.querySelectorAll('.ant-form-item, .el-form-item, [class*="form-item"], [class*="form-group"]')
            for (const item of formItems) {
              const labelEl = item.querySelector('.ant-form-item-label, .el-form-item__label, label, [class*="form-label"]')
              const labelText = (labelEl?.textContent || '').trim().replace(/[:\s]*$/, '').substring(0, 30)
              if (!labelText) continue

              // 检测字段类型
              let fieldType = 'input'
              let placeholder: string | undefined
              let required = false
              let options: string[] | undefined
              let defaultValue: string | undefined

              const input = item.querySelector('input')
              const select = item.querySelector('select, .ant-select, .el-select')
              const textarea = item.querySelector('textarea')
              const datepicker = item.querySelector('.ant-picker, .el-date-editor, [class*="date-picker"], input[type="date"]')
              const switchEl = item.querySelector('.ant-switch, .el-switch, [class*="switch"]')
              const radio = item.querySelector('.ant-radio-group, .el-radio-group, [class*="radio-group"]')
              const checkbox = item.querySelector('.ant-checkbox-group, .el-checkbox-group, [class*="checkbox-group"]')
              const upload = item.querySelector('.ant-upload, .el-upload, [class*="upload"]')

              if (select) {
                fieldType = 'select'
                const optionEls = item.querySelectorAll('.ant-select-item-option, .el-select-dropdown__item, option')
                options = Array.from(optionEls).map(o => (o.textContent || '').trim().substring(0, 20)).filter(Boolean)
              } else if (datepicker) {
                fieldType = 'datepicker'
              } else if (textarea) {
                fieldType = 'textarea'
                placeholder = textarea.getAttribute('placeholder') || undefined
              } else if (switchEl) {
                fieldType = 'switch'
              } else if (radio) {
                fieldType = 'radio'
                const radioLabels = radio.querySelectorAll('.ant-radio-wrapper, .el-radio, label')
                options = Array.from(radioLabels).map(r => (r.textContent || '').trim().substring(0, 20)).filter(Boolean)
              } else if (checkbox) {
                fieldType = 'checkbox'
              } else if (upload) {
                fieldType = 'upload'
              } else if (input) {
                const inputType = input.getAttribute('type') || 'text'
                if (inputType === 'date' || inputType === 'datetime-local') {
                  fieldType = 'datepicker'
                } else {
                  fieldType = inputType
                }
                placeholder = input.getAttribute('placeholder') || undefined
                defaultValue = input.value || undefined
              }

              // 检测必填
              required = !!item.querySelector('.ant-form-item-required, [class*="required"], .el-form-item__label span[style*="red"]')
              if (!required) {
                const ariaRequired = (item.querySelector('[aria-required="true"]') !== null)
                if (ariaRequired) required = true
              }

              fields.push({ label: labelText, type: fieldType, placeholder, required, options, defaultValue })
            }

            if (fields.length === 0) continue

            // 提取表单按钮
            const buttons: string[] = []
            const formBtns = form.querySelectorAll('button, [type="submit"], [role="button"]')
            for (const btn of formBtns) {
              const text = (btn.textContent || '').trim().substring(0, 20)
              if (text && text.length >= 2) buttons.push(text)
            }

            // 表单标题
            let title: string | undefined
            const formTitle = form.closest('.ant-card, .el-card')?.querySelector('.ant-card-head-title, .el-card__header')
            if (formTitle) title = (formTitle.textContent || '').trim().substring(0, 50)

            result.forms.push({ title, fields, buttons: [...new Set(buttons)] })
          }
        }

        // ===== 4. 提取页面头部信息 =====
        const breadcrumbs: string[] = []
        const breadcrumbEls = document.querySelectorAll('.ant-breadcrumb-link, .el-breadcrumb__inner, [class*="breadcrumb"] a, [class*="breadcrumb"] span')
        for (const el of breadcrumbEls) {
          const text = (el.textContent || '').trim().substring(0, 30)
          if (text && text.length >= 2 && text !== '/' && text !== '>') breadcrumbs.push(text)
        }

        let headerTitle = ''
        const titleSelectors = [
          '.page-header h1', '.page-header h2', '.ant-page-header__title',
          '[class*="page-title"]', '[class*="page-header"] h1', '[class*="page-header"] h2',
          'h1[class*="title"]', '.content-header h2'
        ]
        for (const sel of titleSelectors) {
          const el = document.querySelector(sel)
          if (el) {
            headerTitle = (el.textContent || '').trim().substring(0, 50)
            if (headerTitle) break
          }
        }

        const headerActions: string[] = []
        const headerBtnEls = document.querySelectorAll('.page-header button, .ant-page-header__extra button, [class*="page-header"] button, [class*="header-action"] button')
        for (const btn of headerBtnEls) {
          const text = (btn.textContent || '').trim().substring(0, 20)
          if (text && text.length >= 2) headerActions.push(text)
        }

        if (headerTitle || breadcrumbs.length > 0 || headerActions.length > 0) {
          result.pageHeader = { title: headerTitle, breadcrumbs, headerActions: [...new Set(headerActions)] }
        }

        // ===== 5. 提取统计卡片 =====
        const statSelectors = [
          '.ant-statistic', '.el-statistic', '[class*="stat-card"]',
          '[class*="statistic"]', '[class*="overview-card"]', '[class*="info-card"]',
          '[class*="count-card"]', '[class*="data-card"]'
        ]
        const processedStats = new Set<Element>()
        for (const sel of statSelectors) {
          const stats = document.querySelectorAll(sel)
          for (const stat of stats) {
            if (processedStats.has(stat)) continue
            processedStats.add(stat)
            const rect = stat.getBoundingClientRect()
            if (rect.width < 80 || rect.height < 30) continue

            const valueEl = stat.querySelector('.ant-statistic-content-value, [class*="value"], [class*="num"], [class*="count"]')
            const labelEl = stat.querySelector('.ant-statistic-content-title, [class*="title"], [class*="label"], [class*="desc"]')
            const value = (valueEl?.textContent || '').trim().substring(0, 30)
            const label = (labelEl?.textContent || '').trim().substring(0, 30)
            if (value || label) {
              result.statCards.push({ label: label || '指标', value: value || '-' })
            }
          }
        }

        // ===== 6. 提取页面上所有主要按钮 =====
        const allBtnEls = document.querySelectorAll('button:not([type="submit"]), [role="button"]:not(a)')
        const seenBtns = new Set<string>()
        for (const btn of allBtnEls) {
          const rect = btn.getBoundingClientRect()
          if (rect.width < 30 || rect.height < 20) continue
          const style = window.getComputedStyle(btn)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          const text = (btn.textContent || '').trim().substring(0, 20)
          if (text && text.length >= 2 && !seenBtns.has(text)) {
            seenBtns.add(text)
            result.allButtons.push(text)
          }
        }
        result.allButtons = result.allButtons.slice(0, 30)

        return result
      })

      structure.sidebar = data.sidebar
      structure.tables = data.tables
      structure.forms = data.forms
      structure.pageHeader = data.pageHeader
      structure.statCards = data.statCards
      structure.allButtons = data.allButtons
    } catch (e) {
      console.warn('[Crawler] extractPageStructure 异常:', e instanceof Error ? e.message : String(e))
    }

    return structure
  }

  /**
   * 精简HTML（移除script/style/svg/comment/空白），大幅减少内存占用
   * 在爬取时立即精简，避免存储完整的原始HTML
   */
  private simplifyHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * 取消爬取
   */
  cancel(): void {
    this.cancelled = true
  }
}
