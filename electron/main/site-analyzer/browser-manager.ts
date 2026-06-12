/**
 * 浏览器生命周期管理
 * 使用 Playwright 管理 Chromium 浏览器实例
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { SiteAnalyzerConfig, ProxyConfig, AntiBotConfig } from './types'

export class BrowserManager {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private pages: Map<string, Page> = new Map()

  /**
   * 启动浏览器
   */
  async launch(config: SiteAnalyzerConfig): Promise<void> {
    const launchOptions: Record<string, unknown> = {
      headless: false, // 非无头模式，方便手动登录
      channel: 'chromium',
      args: ['--disable-blink-features=AutomationControlled']
    }

    // 代理配置
    if (config.proxy?.server) {
      launchOptions.proxy = {
        server: config.proxy.server,
        username: config.proxy.username,
        password: config.proxy.password
      }
    }

    this.browser = await chromium.launch(launchOptions)

    // 创建上下文
    const contextOptions: Record<string, unknown> = {
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    }

    // 自定义 User-Agent
    if (config.antiBot?.userAgent) {
      contextOptions.userAgent = config.antiBot.userAgent
    }

    this.context = await this.browser.newContext(contextOptions)

    // 注入反检测脚本
    await this.context.addInitScript(() => {
      // 隐藏 webdriver 标识
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
      // 伪造插件
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      })
      // 伪造语言
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en']
      })
    })
  }

  /**
   * 获取或创建页面
   */
  async getPage(url?: string): Promise<Page> {
    if (!this.context) {
      throw new Error('浏览器未启动，请先调用 launch()')
    }

    const page = await this.context.newPage()

    if (url) {
      this.pages.set(url, page)
    }

    return page
  }

  /**
   * 导航到指定URL
   */
  async navigateTo(page: Page, url: string, timeout = 30000): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle', timeout })
  }

  /**
   * 设置Cookie
   */
  async setCookies(cookies: string, domain: string): Promise<void> {
    if (!this.context) {
      throw new Error('浏览器未启动')
    }

    const cookieList = this.parseCookieString(cookies, domain)
    await this.context.addCookies(cookieList)
  }

  /**
   * 解析Cookie字符串为Playwright格式
   */
  private parseCookieString(
    cookieStr: string,
    domain: string
  ): Array<{ name: string; value: string; domain: string; path: string }> {
    return cookieStr
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const eqIdx = pair.indexOf('=')
        if (eqIdx === -1) return null
        const name = pair.substring(0, eqIdx).trim()
        const value = pair.substring(eqIdx + 1).trim()
        return { name, value, domain, path: '/' }
      })
      .filter(Boolean) as Array<{ name: string; value: string; domain: string; path: string }>
  }

  /**
   * 设置Token（通过注入请求头或Cookie）
   */
  async setToken(token: string, headerName = 'Authorization'): Promise<void> {
    if (!this.context) {
      throw new Error('浏览器未启动')
    }

    // 通过路由拦截注入Token头
    await this.context.route('**/*', async (route) => {
      const headers = {
        ...route.request().headers(),
        [headerName]: token.startsWith('Bearer ') ? token : `Bearer ${token}`
      }
      await route.continue({ headers })
    })
  }

  /**
   * 获取页面截图
   */
  async takeScreenshot(page: Page): Promise<string> {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 70 })
    return buffer.toString('base64')
  }

  /**
   * 获取页面HTML
   */
  async getPageHtml(page: Page): Promise<string> {
    return await page.content()
  }

  /**
   * 获取当前页面的所有链接
   */
  async getPageLinks(page: Page, baseUrl: string): Promise<string[]> {
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      return anchors.map((a) => (a as HTMLAnchorElement).href)
    })

    // 过滤和规范化链接
    const base = new URL(baseUrl)
    const uniqueLinks = new Set<string>()

    for (const link of links) {
      try {
        const url = new URL(link)
        // 只保留同域名的链接
        if (url.hostname === base.hostname) {
          // 去除hash
          url.hash = ''
          uniqueLinks.add(url.href)
        }
      } catch {
        // 无效URL，跳过
      }
    }

    return Array.from(uniqueLinks)
  }

  /**
   * 获取页面中的表单信息
   */
  async getPageForms(
    page: Page
  ): Promise<Array<{ action: string; method: string; inputs: Array<{ name: string; type: string }> }>> {
    return await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'))
      return forms.map((form) => ({
        action: form.action || '',
        method: (form.method || 'GET').toUpperCase(),
        inputs: Array.from(form.querySelectorAll('input, select, textarea')).map((el) => ({
          name: (el as HTMLInputElement).name || '',
          type: (el as HTMLInputElement).type || el.tagName.toLowerCase()
        }))
      }))
    })
  }

  /**
   * 模拟人类行为 - 随机滚动
   */
  async simulateHumanBehavior(page: Page): Promise<void> {
    // 随机滚动
    const scrollAmount = Math.floor(Math.random() * 500) + 200
    await page.mouse.wheel(0, scrollAmount)
    await this.randomDelay(500, 1500)

    // 随机移动鼠标
    const x = Math.floor(Math.random() * 800) + 100
    const y = Math.floor(Math.random() * 600) + 100
    await page.mouse.move(x, y)
    await this.randomDelay(300, 800)
  }

  /**
   * 随机延迟
   */
  async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  /**
   * 获取浏览器实例
   */
  getBrowser(): Browser | null {
    return this.browser
  }

  /**
   * 获取上下文实例
   */
  getContext(): BrowserContext | null {
    return this.context
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    this.pages.clear()
    if (this.context) {
      await this.context.close()
      this.context = null
    }
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
