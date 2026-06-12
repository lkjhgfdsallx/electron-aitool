/**
 * 网站分析器 - 主控制器
 * 协调浏览器管理、爬取、请求捕获、AI分析和报告生成
 */

import type { Page } from 'playwright-core'
import { BrowserManager } from './browser-manager'
import { RequestCapture } from './request-capture'
import { Crawler } from './crawler'
import { AIAnalyzer } from './ai-analyzer'
import { ReportGenerator } from './report-generator'
import type {
  SiteAnalyzerConfig,
  SiteAnalyzerResult,
  SiteAnalyzerProgress,
  CapturedRequest
} from './types'

/** 活跃的分析任务 */
interface TaskState {
  cancelled: boolean
  browserManager: BrowserManager
  crawler?: Crawler
}
const activeTasks = new Map<string, TaskState>()

/**
 * 运行网站分析
 */
export async function runSiteAnalyzer(
  config: SiteAnalyzerConfig,
  onProgress: (progress: SiteAnalyzerProgress) => void
): Promise<SiteAnalyzerResult> {
  const taskId = config.taskId
  const browserManager = new BrowserManager()
  const requestCapture = new RequestCapture()
  const reportGenerator = new ReportGenerator()

  // 注册活跃任务
  const taskState: TaskState = { cancelled: false, browserManager }
  activeTasks.set(taskId, taskState)

  const result: SiteAnalyzerResult = {
    taskId,
    targetUrl: config.targetUrl,
    pages: [],
    requests: [],
    modules: [],
    apis: [],
    startTime: Date.now(),
    status: 'running'
  }

  try {
    // 1. 启动浏览器
    onProgress({
      taskId,
      type: 'started',
      message: '正在启动浏览器...'
    })

    await browserManager.launch(config)

    onProgress({
      taskId,
      type: 'started',
      message: '浏览器启动成功'
    })

    // 2. 登录处理 - 返回登录页面以供后续爬取复用
    const loginPage = await handleLogin(config, browserManager, onProgress)

    // 检查取消
    if (taskState.cancelled) {
      result.status = 'cancelled'
      result.endTime = Date.now()
      return result
    }

    // 3. 全站爬取 - 复用登录页面，保持登录状态
    onProgress({
      taskId,
      type: 'crawling',
      message: '开始全站爬取...'
    })

    const crawler = new Crawler(browserManager, requestCapture, config, onProgress, loginPage ?? undefined)
    taskState.crawler = crawler

    result.pages = await crawler.crawl()

    // 为每个页面关联其API请求
    const allApiRequests = requestCapture.getApiRequests()
    for (const page of result.pages) {
      // 简单关联：同一时间段内的请求
      page.apiRequests = allApiRequests.filter((r) =>
        r.url.includes(new URL(page.url).hostname)
      )
    }

    onProgress({
      taskId,
      type: 'crawling',
      message: `爬取完成，共 ${result.pages.length} 个页面，${allApiRequests.length} 个API请求`,
      pagesCrawled: result.pages.length,
      apisFound: allApiRequests.length
    })

    // 检查取消
    if (taskState.cancelled) {
      result.status = 'cancelled'
      result.endTime = Date.now()
      return result
    }

    // 4. 获取并脱敏网络请求
    result.requests = requestCapture.sanitizeRequests(requestCapture.getRequests())

    // 5. AI分析
    onProgress({
      taskId,
      type: 'analyzing',
      message: '开始AI分析...'
    })

    const aiAnalyzer = new AIAnalyzer(config, onProgress)
    const analysisResult = await aiAnalyzer.analyzeAll(result.pages, result.requests)

    result.modules = analysisResult.modules
    result.apis = analysisResult.apis

    onProgress({
      taskId,
      type: 'ai_analysis_done',
      message: `AI分析完成: ${result.modules.length} 个功能模块, ${result.apis.length} 个API接口`,
      apisFound: result.apis.length
    })

    // 检查取消
    if (taskState.cancelled) {
      result.status = 'cancelled'
      result.endTime = Date.now()
      return result
    }

    // 6. 生成报告
    onProgress({
      taskId,
      type: 'generating_report',
      message: '正在生成分析报告...'
    })

    result.endTime = Date.now()
    result.status = 'completed'

    const reportHtml = reportGenerator.generateReport(result)

    onProgress({
      taskId,
      type: 'report_ready',
      message: '分析报告已生成',
      reportHtml
    })

    onProgress({
      taskId,
      type: 'completed',
      message: `分析完成！共 ${result.pages.length} 个页面, ${result.modules.length} 个功能模块, ${result.apis.length} 个API接口`,
      pagesCrawled: result.pages.length,
      apisFound: result.apis.length,
      reportHtml
    })

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    result.status = 'error'
    result.error = errorMsg
    result.endTime = Date.now()

    onProgress({
      taskId,
      type: 'error',
      message: `分析失败: ${errorMsg}`,
      error: errorMsg
    })

    return result
  } finally {
    // 清理资源
    activeTasks.delete(taskId)
    try {
      await browserManager.close()
    } catch {
      // 忽略关闭错误
    }
  }
}

/**
 * 处理登录
 * @returns 登录使用的页面（供后续爬取复用），cookie/token模式返回null
 */
async function handleLogin(
  config: SiteAnalyzerConfig,
  browserManager: BrowserManager,
  onProgress: (progress: SiteAnalyzerProgress) => void
): Promise<Page | null> {
  const { loginType, loginCredential, targetUrl } = config

  onProgress({
    taskId: config.taskId,
    type: 'logging_in',
    message: `正在处理登录 (${loginType})...`
  })

  try {
    switch (loginType) {
      case 'cookie': {
        // Cookie/Token 登录 - 不需要页面，设置在context级别
        if (loginCredential.cookie) {
          const domain = new URL(targetUrl).hostname
          await browserManager.setCookies(loginCredential.cookie, domain)
          onProgress({
            taskId: config.taskId,
            type: 'login_success',
            message: 'Cookie设置成功'
          })
        } else if (loginCredential.token) {
          await browserManager.setToken(loginCredential.token, loginCredential.tokenHeader)
          onProgress({
            taskId: config.taskId,
            type: 'login_success',
            message: 'Token设置成功'
          })
        } else {
          throw new Error('未提供Cookie或Token')
        }
        return null
      }

      case 'password': {
        // 自动密码登录
        if (!loginCredential.username || !loginCredential.password) {
          throw new Error('未提供用户名或密码')
        }

        const page = await browserManager.getPage()
        await browserManager.navigateTo(page, targetUrl)

        // 尝试查找登录表单
        const loginForm = await findLoginForm(page)
        if (!loginForm) {
          throw new Error('未找到登录表单，请尝试手动登录模式')
        }

        // 填写表单
        if (loginForm.usernameSelector) {
          await page.fill(loginForm.usernameSelector, loginCredential.username)
        }
        if (loginForm.passwordSelector) {
          await page.fill(loginForm.passwordSelector, loginCredential.password)
        }

        // 点击提交
        if (loginForm.submitSelector) {
          await page.click(loginForm.submitSelector)
          await page.waitForLoadState('networkidle', { timeout: 15000 })
        }

        // 验证登录是否成功
        await new Promise(resolve => setTimeout(resolve, 2000))
        onProgress({
          taskId: config.taskId,
          type: 'login_success',
          message: '自动登录完成'
        })

        // 不关闭页面，返回供爬取复用，保持登录状态
        return page
      }

      case 'manual': {
        // 手动登录 - 打开浏览器让用户自己登录
        const page = await browserManager.getPage()
        await browserManager.navigateTo(page, targetUrl)

        onProgress({
          taskId: config.taskId,
          type: 'logging_in',
          message: '浏览器已打开，请手动完成登录。登录完成后将自动继续...'
        })

        // 等待URL变化或页面内容变化（表示登录成功跳转）
        await waitForManualLogin(page, 120000) // 2分钟超时

        onProgress({
          taskId: config.taskId,
          type: 'login_success',
          message: '检测到登录完成，继续分析...'
        })

        // 不关闭页面，返回供爬取复用，保持登录状态
        return page
      }
    }

    return null
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '登录失败'
    onProgress({
      taskId: config.taskId,
      type: 'login_failed',
      message: `登录失败: ${errorMsg}`,
      error: errorMsg
    })
    // 登录失败不中断分析，以非登录状态继续
    return null
  }
}

/**
 * 查找登录表单
 */
async function findLoginForm(page: Page): Promise<{
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
} | null> {
  // 常见的用户名输入框选择器
  const usernameSelectors = [
    'input[name="username"]',
    'input[name="email"]',
    'input[name="account"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[name="phone"]',
    'input[type="email"]',
    'input[type="text"][placeholder*="用户"]',
    'input[type="text"][placeholder*="邮箱"]',
    'input[type="text"][placeholder*="手机"]',
    'input[type="text"][placeholder*="账号"]',
    'input[id*="user"]',
    'input[id*="email"]',
    'input[id*="login"]'
  ]

  const passwordSelectors = [
    'input[name="password"]',
    'input[name="passwd"]',
    'input[name="pass"]',
    'input[type="password"]',
    'input[id*="pass"]'
  ]

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("登录")',
    'button:has-text("登 录")',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
    'button:has-text("登录/注册")',
    '.login-btn',
    '.submit-btn'
  ]

  let usernameSelector = ''
  let passwordSelector = ''
  let submitSelector = ''

  for (const sel of usernameSelectors) {
    try {
      const el = await page.$(sel)
      if (el) { usernameSelector = sel; break }
    } catch { /* ignore */ }
  }

  for (const sel of passwordSelectors) {
    try {
      const el = await page.$(sel)
      if (el) { passwordSelector = sel; break }
    } catch { /* ignore */ }
  }

  for (const sel of submitSelectors) {
    try {
      const el = await page.$(sel)
      if (el) { submitSelector = sel; break }
    } catch { /* ignore */ }
  }

  if (passwordSelector) {
    return { usernameSelector, passwordSelector, submitSelector }
  }

  return null
}

/**
 * 等待手动登录完成
 */
async function waitForManualLogin(page: Page, timeout: number): Promise<void> {
  const initialUrl = page.url()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve() // 超时后也继续
    }, timeout)

    // 监听URL变化
    const checkInterval = setInterval(async () => {
      try {
        const currentUrl = page.url()
        if (currentUrl !== initialUrl) {
          clearInterval(checkInterval)
          clearTimeout(timer)
          resolve()
        }
      } catch {
        // 页面可能已关闭
        clearInterval(checkInterval)
        clearTimeout(timer)
        resolve()
      }
    }, 1000)

    // 也监听导航事件
    page.on('framenavigated', () => {
      clearInterval(checkInterval)
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * 取消分析任务
 */
export function cancelSiteAnalyzer(taskId: string): boolean {
  const task = activeTasks.get(taskId)
  if (!task) return false

  task.cancelled = true
  if (task.crawler) {
    task.crawler.cancel()
  }

  return true
}

/**
 * 获取活跃任务列表
 */
export function getActiveTasks(): string[] {
  return Array.from(activeTasks.keys())
}
