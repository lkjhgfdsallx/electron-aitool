/**
 * 浏览器生命周期管理
 * 使用 Playwright 管理 Chromium 浏览器实例
 */

import { app } from 'electron'
import { chromium, type Browser, type BrowserContext, type Page, type Cookie } from 'playwright'
import { join } from 'node:path'
import type { SiteAnalyzerConfig, ProxyConfig, AntiBotConfig } from './types'

export class BrowserManager {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private pages: Map<string, Page> = new Map()
  private _isAlive = false
  private _launchConfig: SiteAnalyzerConfig | null = null
  /** 浏览器断开连接时的回调 */
  private onBrowserDisconnected?: () => void
  /** 保存的认证状态（cookies），用于浏览器重连后恢复登录态 */
  private savedCookies: Cookie[] = []
  /** 保存的 localStorage 数据，用于浏览器重连后恢复 */
  private savedLocalStorage: Array<{ origin: string; items: Record<string, string> }> = []

  /**
   * 检查浏览器是否仍然存活
   */
  isAlive(): boolean {
    return this._isAlive && !!this.browser?.isConnected()
  }

  /**
   * 设置浏览器断开回调
   */
  setDisconnectCallback(callback: () => void): void {
    this.onBrowserDisconnected = callback
  }

  /**
   * 保存当前浏览器上下文的认证状态（cookies 和 localStorage）
   * 应在登录成功后调用，以便浏览器重连后恢复登录态
   */
  async saveAuthState(page?: Page): Promise<void> {
    try {
      if (this.context) {
        this.savedCookies = await this.context.cookies()
        console.log(`[BrowserManager] 已保存 ${this.savedCookies.length} 个 cookies`)
      }

      // 保存 localStorage（如果提供了页面）
      if (page && !page.isClosed()) {
        try {
          const storage = await page.evaluate(() => {
            const items: Record<string, string> = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key) {
                items[key] = localStorage.getItem(key) || ''
              }
            }
            return items
          })
          const origin = new URL(page.url()).origin
          this.savedLocalStorage = [{ origin, items: storage }]
          console.log(`[BrowserManager] 已保存 localStorage (${origin}): ${Object.keys(storage).length} 项`)
       } catch {
         // localStorage 保存失败不影响整体流程
         console.warn('[BrowserManager] 保存 localStorage 失败')
        }
      }
    } catch (e) {
      console.error('[BrowserManager] 保存认证状态失败:', e)
    }
  }

  /**
   * 恢复之前保存的认证状态到当前浏览器上下文
   */
  async restoreAuthState(): Promise<void> {
    if (!this.context) return

    // 恢复 cookies
    if (this.savedCookies.length > 0) {
      try {
        await this.context.addCookies(this.savedCookies)
       console.log(`[BrowserManager] 已恢复 ${this.savedCookies.length} 个 cookies`)
     } catch (e) {
       console.error('[BrowserManager] 恢复 cookies 失败:', e)
      }
    }

    // 恢复 localStorage（需要先导航到对应 origin）
    if (this.savedLocalStorage.length > 0) {
      for (const { origin, items } of this.savedLocalStorage) {
        if (Object.keys(items).length === 0) continue
        try {
          const page = await this.context.newPage()
          await page.goto(origin, { waitUntil: 'commit', timeout: 10000 }).catch(() => {})
          await page.evaluate((data: Record<string, string>) => {
            for (const [key, value] of Object.entries(data)) {
              try { localStorage.setItem(key, value) } catch { /* ignore */ }
            }
          }, items)
          await page.close()
          console.log(`[BrowserManager] 已恢复 localStorage (${origin}): ${Object.keys(items).length} 项`)
       } catch {
         console.warn(`[BrowserManager] 恢复 localStorage 失败 (${origin})`)
        }
      }
    }
  }

  /**
   * 尝试重启浏览器（如果已断开）
   * 返回是否重启成功
   * 重启后会自动恢复之前保存的认证状态（cookies/localStorage）
   */
  async tryReconnect(): Promise<boolean> {
    if (this.isAlive()) return true
    if (!this._launchConfig) return false
    
    console.log('[BrowserManager] 检测到浏览器断开，尝试重启...')
    try {
      // 清理旧资源
      this.pages.clear()
      this.context = null
      this.browser = null
      this._isAlive = false
      
      // 重新启动
      await this.launch(this._launchConfig)

      // 恢复认证状态（cookies + localStorage）
      await this.restoreAuthState()

      console.log('[BrowserManager] 浏览器重启成功，认证状态已恢复')
      return true
    } catch (e) {
      console.error('[BrowserManager] 浏览器重启失败:', e)
      return false
    }
  }

  /**
   * 启动浏览器
   */
  async launch(config: SiteAnalyzerConfig): Promise<void> {
    // 保存配置以便重连时使用
    this._launchConfig = config

    if (!config.browserExecutablePath?.trim()) {
      throw new Error('未配置网页分析浏览器，请前往“设置 > 工具”选择 Chrome 或 Microsoft Edge')
    }

    const launchOptions: Record<string, unknown> = {
      executablePath: config.browserExecutablePath,
      headless: false, // 非无头模式，方便手动登录
      args: [
        // 反自动化检测
        '--disable-blink-features=AutomationControlled',
        // 防止 GPU 崩溃（GPU 驱动不兼容时 Chromium 会直接崩溃）
        '--disable-gpu',
        '--disable-software-rasterizer',
        // 防止共享内存问题（/dev/shm 不足时会崩溃）
        '--disable-dev-shm-usage',
        '--no-sandbox',
        // 限制渲染进程内存，防止 OOM 崩溃
        '--js-flags=--max-old-space-size=512',
        // 禁用可能导致崩溃的后台功能
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        // 禁用崩溃报告弹窗（避免干扰用户）
        '--disable-crash-reporter',
        // 禁用默认浏览器检查
        '--no-first-run',
        '--no-default-browser-check',
      ]
    }

    // 代理配置
    if (config.proxy?.server) {
      launchOptions.proxy = {
        server: config.proxy.server,
        username: config.proxy.username,
        password: config.proxy.password
      }
    }

    // 使用应用专属的持久化 Profile：首次手动登录后，Cookie / localStorage 会在后续分析中复用。
    // 不直接使用用户日常浏览器的默认 Profile，避免 Chrome/Edge 的 Profile 锁冲突和数据损坏风险。
    const userDataDir = join(app.getPath('userData'), 'site-analyzer-browser-profile')
    const contextOptions: Record<string, unknown> = {
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    }
    if (config.antiBot?.userAgent) {
      contextOptions.userAgent = config.antiBot.userAgent
    }
    Object.assign(launchOptions, contextOptions)

    this.context = await chromium.launchPersistentContext(userDataDir, launchOptions)
    this.browser = this.context.browser()
    if (!this.browser) {
      throw new Error('无法获取网页分析浏览器实例')
    }

    // 监听浏览器断开连接事件
    this.browser.on('disconnected', () => {
      // 检测是否是异常崩溃（而非正常调用 close()）
      if (this._isAlive) {
        console.error('[BrowserManager] 浏览器异常崩溃！可能原因: 内存耗尽/渲染进程崩溃/GPU崩溃')
        console.error('[BrowserManager] 崩溃前状态: browser.isConnected()=', this.browser?.isConnected())
      } else {
        console.warn('[BrowserManager] 浏览器连接断开（正常关闭）')
      }
      this._isAlive = false
      if (this.onBrowserDisconnected) {
        this.onBrowserDisconnected()
      }
    })

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

    this._isAlive = true
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
    // 先检查浏览器是否存活
    if (!this.isAlive()) {
      const reconnected = await this.tryReconnect()
      if (!reconnected) {
        throw new Error('浏览器已断开连接且无法恢复')
      }
    }
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout })
    } catch (err) {
      // 如果导航失败是因为浏览器断开，尝试重连后重试
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('Target closed') || errMsg.includes('Browser closed') ||
          errMsg.includes('Connection closed') || errMsg.includes('Session closed')) {
        // console.warn('[BrowserManager] 导航时检测到浏览器断开，尝试重连...')
        const reconnected = await this.tryReconnect()
        if (reconnected) {
          // 重连后需要使用新页面
          throw new Error('BROWSER_RECONNECTED')
        }
      }
      throw err
    }
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
      // 收集所有链接来源：<a>标签、有onclick的元素、router-link等
      const allLinks: string[] = []

      // 1. 标准 <a href> 标签
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          allLinks.push(href)
        }
      }

      // 2. SPA 路由链接（#/path 形式）
      const hashAnchors = Array.from(document.querySelectorAll('a[href^="#"]'))
      for (const a of hashAnchors) {
        const hash = (a as HTMLAnchorElement).hash
        if (hash && hash.length > 1) {
          allLinks.push(window.location.origin + window.location.pathname + hash)
        }
      }

      return allLinks
    })

    // 过滤和规范化链接
    const base = new URL(baseUrl)
    const uniqueLinks = new Set<string>()

    // 检测是否是 SPA hash 路由（如果页面上有 hash 路由链接）
    const hasHashRouting = links.some(l => l.includes('#/'))

    for (const link of links) {
      try {
        const url = new URL(link)
        // 只保留同域名的链接
        if (url.hostname === base.hostname) {
          if (hasHashRouting) {
            // SPA hash 路由：保留 hash 作为唯一标识
            uniqueLinks.add(url.href)
          } else {
            // 传统路由：去除 hash
            url.hash = ''
            uniqueLinks.add(url.href)
          }
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
    this._isAlive = false
    this.pages.clear()
    if (this.context) {
      try { await this.context.close() } catch { /* 忽略 */ }
      this.context = null
    }
    if (this.browser) {
      try { await this.browser.close() } catch { /* 忽略 */ }
      this.browser = null
    }
  }
}
