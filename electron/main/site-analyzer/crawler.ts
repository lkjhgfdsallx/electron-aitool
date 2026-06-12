/**
 * 全站爬取服务
 * 自动爬取目标网站的所有页面，支持传统网站和SPA
 *
 * 核心改进：
 * 1. 复用单个 page 而非每个 URL 创建/关闭（保持登录态和浏览器状态）
 * 2. 自动处理同意弹窗（cookie banner、服务协议等）
 */

import type { Page } from 'playwright'
import type { BrowserManager } from './browser-manager'
import type { RequestCapture } from './request-capture'
import type {
  SiteAnalyzerConfig,
  SitePage,
  SiteAnalyzerProgress,
  CrawlRules
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

export class Crawler {
  private visitedUrls = new Set<string>()
  private urlQueue: Array<{ url: string; depth: number }> = []
  private pages: SitePage[] = []
  private cancelled = false
  private sharedPage: Page | null = null

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

    // 优先复用登录页面，保持登录状态；否则创建新页面
    if (this.loginPage) {
      this.sharedPage = this.loginPage
    } else {
      const context = this.browserManager.getContext()
      if (!context) {
        throw new Error('浏览器上下文不可用')
      }
      this.sharedPage = await context.newPage()
    }

    // 开始捕获网络请求（只需注册一次，复用同一个 page）
    this.requestCapture.startCapture(this.sharedPage)

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

        const { url, depth } = this.urlQueue.shift()!

        // 跳过已访问的URL
        if (this.visitedUrls.has(url)) continue

        // 检查URL过滤规则
        if (!this.shouldCrawl(url, rules)) continue

        // 检查深度限制
        if (depth > maxDepth) continue

        this.visitedUrls.add(url)

        this.onProgress({
          taskId: this.config.taskId,
          type: 'crawling',
          message: `正在爬取页面 (${this.pages.length + 1}): ${url}`,
          pagesCrawled: this.pages.length,
          currentUrl: url
        })

        try {
          const page = await this.crawlPage(url, depth)
          if (page) {
            this.pages.push(page)

            // 将新发现的链接加入队列
            if (depth < maxDepth) {
              for (const link of page.links || []) {
                if (!this.visitedUrls.has(link)) {
                  this.urlQueue.push({ url: link, depth: depth + 1 })
                }
              }
            }

            this.onProgress({
              taskId: this.config.taskId,
              type: 'page_crawled',
              message: `页面爬取完成: ${page.title || url}`,
              pagesCrawled: this.pages.length,
              currentUrl: url
            })
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '未知错误'
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
   * 爬取单个页面（复用共享 page，通过 goto 导航）
   */
  private async crawlPage(url: string, depth: number): Promise<SitePage | null> {
    if (!this.sharedPage) return null

    const page = this.sharedPage

    try {
      // 导航到页面（复用同一个 page，保持登录态）
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

      // 等待页面稳定
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 自动处理同意弹窗（cookie banner、服务协议等）
      await this.handleConsentDialogs(page)

      // 获取页面信息
      const title = await page.title()
      const html = await page.content()
      const links = await this.browserManager.getPageLinks(page, this.config.targetUrl)
      const forms = await this.browserManager.getPageForms(page)
      const screenshot = await this.browserManager.takeScreenshot(page)

      // 判断页面类型
      const pageType = this.detectPageType(url, title, html)

      return {
        url,
        title,
        html,
        screenshot,
        pageType,
        links,
        forms,
        depth
      }
    } catch (error) {
      throw error
    }
    // 注意：不再关闭 page，复用共享 page
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
   * 取消爬取
   */
  cancel(): void {
    this.cancelled = true
  }
}
