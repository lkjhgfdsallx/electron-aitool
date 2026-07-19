/**
 * 网站分析器 - 主控制器
 * 协调浏览器管理、爬取、请求捕获、AI分析和报告生成
 */

import type { Page } from 'playwright'
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

/** 模态框/弹窗容器的选择器 */
const MODAL_CONTAINER_SELECTORS = [
  '.modal', '.dialog', '.popup', '.overlay',
  '[role="dialog"]', '[role="alertdialog"]', '[role="alert"]',
  '.ant-modal', '.el-dialog', '.el-message-box',
  '.ant-modal-wrap', '.el-overlay',
  '[class*="modal"]', '[class*="dialog"]', '[class*="popup"]',
  '[class*="overlay"]', '[class*="mask"]',
]

/** 在模态框上下文中匹配的同意按钮选择器 */
const CONSENT_BUTTON_SELECTORS_MODAL = [
  '#onetrust-accept-btn-handler',
  '.cc-btn.cc-dismiss',
  '.cookie-notice .accept',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '.fc-cta-consent',
  '[data-testid="cookie-policy-manage-dialog-btn-accept"]',
  'button:has-text("Accept All")',
  'button:has-text("Accept Cookies")',
  'button:has-text("Allow All")',
  'button:has-text("I Agree")',
  'button:has-text("I Accept")',
  'button:has-text("Got It")',
]

/** 同意/确认相关的中文文本关键词 */
const CONSENT_KEYWORDS_CN = [
  '同意', '我同意', '接受', '全部接受', '同意并继续',
  '我知道了', '已阅读并同意', '同意并进入', '确认并继续',
  '确认', '确定', '下一步', '继续', '进入系统', '我知道了',
]

/** 同意/确认相关的英文文本关键词 */
const CONSENT_KEYWORDS_EN = [
  'Accept', 'Accept All', 'I Agree', 'I Accept', 'Got It', 'Allow',
  'Confirm', 'Continue', 'Next', 'Submit', 'OK',
]

/**
 * CSS选择器：查找页面上所有"看起来像按钮"的元素
 * 包括标准按钮、role=button、以及用div/span模拟的按钮
 */
const CLICKABLE_BUTTON_SELECTOR = [
  'button',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'a.btn', 'a.button',
  '[class*="dialog-btn"]',    // 对话框按钮（如 dialog-btn confirm）
  '[class*="dialog-button"]',
  '[class*="modal-btn"]',
  '[class*="popup-btn"]',
  '[id*="dialog-confirm"]',   // 对话框确认按钮
  '[id*="dialog-agree"]',
  '[id*="confirm"]',
  '[id*="agree"]',
  '[id*="accept"]',
  '[id*="ok"]',
  '[class*="btn-confirm"]',
  '[class*="btn-agree"]',
  '[class*="btn-accept"]',
  '[class*="confirm-btn"]',
  '[class*="agree-btn"]',
  '[class*="accept-btn"]',
  '[class*="ok-btn"]',
  '[tabindex][class*="btn"]', // 有tabindex和btn类的元素
  '[tabindex]:not(input):not(select):not(textarea)', // 有tabindex的非表单元素
].join(', ')

/** 活跃的分析任务 */
interface TaskState {
  cancelled: boolean
  browserManager: BrowserManager
  crawler?: Crawler
}
const activeTasks = new Map<string, TaskState>()

/** 检查任务是否已取消 */
function isCancelled(taskState?: TaskState): boolean {
  return !!taskState?.cancelled
}

/**
 * 运行网站分析
 */
export async function runSiteAnalyzer(
  config: SiteAnalyzerConfig,
  onProgress: (progress: SiteAnalyzerProgress) => void
): Promise<SiteAnalyzerResult> {
  const taskId = config.taskId
  // console.log(`[SiteAnalyzer] ===== runSiteAnalyzer 开始 (v5) ===== taskId: ${taskId}`)
  // console.log(`[SiteAnalyzer] 登录方式: ${config.loginType}, 目标URL: ${config.targetUrl}`)
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
    pageAnalyses: [],
    sharedComponents: [],
    sharedApis: [],
    startTime: Date.now(),
    status: 'running'
  }

  try {
    // 1. 启动浏览器
    onProgress({ taskId, type: 'started', message: '正在启动浏览器...' })
    await browserManager.launch(config)
    onProgress({ taskId, type: 'started', message: '浏览器启动成功' })

    // 设置浏览器断开回调，主动通知进度
    browserManager.setDisconnectCallback(() => {
      onProgress({
        taskId,
        type: 'error',
        message: '检测到浏览器窗口已关闭，正在尝试自动恢复...',
        error: '浏览器断开'
      })
    })

    // 2. 登录处理
    const loginPage = await handleLogin(config, browserManager, taskState, onProgress)

    // 登录处理完成后，保存认证状态（cookies + localStorage），供浏览器重连后恢复
    await browserManager.saveAuthState(loginPage ?? undefined)

    if (isCancelled(taskState)) {
      result.status = 'cancelled'
      result.endTime = Date.now()
      return result
    }

    // 3. 全站爬取
    onProgress({ taskId, type: 'crawling', message: '开始全站爬取...' })

    const crawler = new Crawler(browserManager, requestCapture, config, onProgress, loginPage ?? undefined)
    taskState.crawler = crawler
    result.pages = await crawler.crawl()

    const allApiRequests = requestCapture.getApiRequests()
    const allRequests = requestCapture.getRequests()
    // console.log(`[SiteAnalyzer] 爬取完成: ${result.pages.length} 页面, ${allApiRequests.length} API请求, ${allRequests.length} 总请求`)
    // if (allApiRequests.length > 0) {
    //   console.log(`[SiteAnalyzer] API请求示例:`, allApiRequests.slice(0, 5).map(r => `${r.method} ${r.url}`))
    // } else {
    //   console.log(`[SiteAnalyzer] 警告: 没有捕获到任何API请求! 总请求数: ${allRequests.length}`)
    //   if (allRequests.length > 0) {
    //     console.log(`[SiteAnalyzer] 总请求示例:`, allRequests.slice(0, 5).map(r => `${r.method} ${r.url} (${r.resourceType})`))
    //   }
    // }
    for (const page of result.pages) {
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

    if (isCancelled(taskState)) {
      result.status = 'cancelled'
      result.endTime = Date.now()
      return result
    }

    // 4. 获取并脱敏网络请求
    result.requests = requestCapture.sanitizeRequests(requestCapture.getRequests())

    // 5. AI分析
    onProgress({ taskId, type: 'analyzing', message: '开始AI分析...' })
    const aiAnalyzer = new AIAnalyzer(config, onProgress)
    const analysisResult = await aiAnalyzer.analyzeAll(result.pages, result.requests)
    result.modules = analysisResult.modules
    result.apis = analysisResult.apis
    result.pageAnalyses = analysisResult.pageAnalyses || []
    result.sharedComponents = analysisResult.sharedComponents || []
    result.sharedApis = analysisResult.sharedApis || []

    onProgress({
      taskId,
      type: 'ai_analysis_done',
      message: `AI分析完成: ${result.pageAnalyses.length} 个页面分析, ${result.sharedComponents.length} 个公共组件, ${result.sharedApis.length} 个公用接口, ${result.apis.length} 个API接口`,
      apisFound: result.apis.length
    })

    if (isCancelled(taskState)) {
      result.status = 'cancelled'
      result.endTime = Date.now()
      return result
    }

    // 6. 生成报告
    onProgress({ taskId, type: 'generating_report', message: '正在生成分析报告...' })
    result.endTime = Date.now()
    result.status = 'completed'

    const reportHtml = reportGenerator.generateReport(result)
    result.reportHtml = reportHtml

    onProgress({ taskId, type: 'report_ready', message: '分析报告已生成', reportHtml })

    onProgress({
      taskId,
      type: 'completed',
      message: `分析完成！共 ${result.pages.length} 个页面, ${result.pageAnalyses.length} 个页面分析, ${result.sharedComponents.length} 个公共组件, ${result.sharedApis.length} 个公用接口`,
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
    onProgress({ taskId, type: 'error', message: `分析失败: ${errorMsg}`, error: errorMsg })
    return result
  } finally {
    activeTasks.delete(taskId)
    try { await browserManager.close() } catch { /* 忽略 */ }
  }
}

/**
 * 处理登录
 * @returns 登录使用的页面（供后续爬取复用），cookie/token模式返回null
 */
async function handleLogin(
  config: SiteAnalyzerConfig,
  browserManager: BrowserManager,
  taskState: TaskState,
  onProgress: (progress: SiteAnalyzerProgress) => void
): Promise<Page | null> {
  const { loginType, loginCredential, targetUrl } = config

  onProgress({ taskId: config.taskId, type: 'logging_in', message: `正在处理登录 (${loginType})...` })

  try {
    switch (loginType) {
      case 'cookie': {
        if (loginCredential.cookie) {
          const domain = new URL(targetUrl).hostname
          await browserManager.setCookies(loginCredential.cookie, domain)
          onProgress({ taskId: config.taskId, type: 'login_success', message: 'Cookie设置成功' })
        } else if (loginCredential.token) {
          await browserManager.setToken(loginCredential.token, loginCredential.tokenHeader)
          onProgress({ taskId: config.taskId, type: 'login_success', message: 'Token设置成功' })
        } else {
          throw new Error('未提供Cookie或Token')
        }
        return null
      }

      case 'password': {
        // console.log('[SiteAnalyzer] ===== 密码登录流程开始 (v5) =====')

        if (!loginCredential.username || !loginCredential.password) {
          throw new Error('未提供用户名或密码')
        }

        const page = await browserManager.getPage()
        // console.log('[SiteAnalyzer] 正在导航到目标页面:', targetUrl)
        await browserManager.navigateTo(page, targetUrl)
        // 关键：使用导航后的实际URL作为登录页URL（处理重定向场景）
        const loginPageUrl = page.url()
        // console.log('[SiteAnalyzer] 导航后实际URL:', loginPageUrl)

        // 查找登录表单
        // console.log('[SiteAnalyzer] 正在查找登录表单...')
        const loginForm = await findLoginForm(page)
        if (!loginForm) {
          // console.log('[SiteAnalyzer] 未找到登录表单')
          throw new Error('未找到登录表单，请尝试手动登录模式')
        }
        // console.log('[SiteAnalyzer] 找到登录表单:', JSON.stringify(loginForm))

        // 记录登录前页面快照，用于后续对比
        const preLoginSnapshot = await getPageSnapshot(page)

        // 填写表单
        if (loginForm.usernameSelector) {
          // console.log('[SiteAnalyzer] 填写用户名...')
          await page.fill(loginForm.usernameSelector, loginCredential.username)
        }
        if (loginForm.passwordSelector) {
          // console.log('[SiteAnalyzer] 填写密码...')
          await page.fill(loginForm.passwordSelector, loginCredential.password)
        }

        // 点击提交
        if (loginForm.submitSelector) {
          // console.log('[SiteAnalyzer] 点击登录按钮...')
          await page.click(loginForm.submitSelector)
          // console.log('[SiteAnalyzer] 登录按钮已点击，等待页面响应...')
        }

        // === 核心：循环检测登录结果并处理中间页面 ===
        const LOGIN_TIMEOUT = 45000
        const startTime = Date.now()
        let loginSucceeded = false
        let checkedForPopup = false

        while (Date.now() - startTime < LOGIN_TIMEOUT && !isCancelled(taskState)) {
          await new Promise(r => setTimeout(r, checkedForPopup ? 2000 : 1500))
          checkedForPopup = true

          try {
            await page.waitForLoadState('networkidle', { timeout: 5000 })
          } catch { /* 忽略 */ }

          // console.log(`[SiteAnalyzer] 登录等待循环，已用时 ${Date.now() - startTime}ms，当前URL: ${page.url()}`)

          // 检测1：密码框是否消失（最可靠的登录成功信号）
          const passwordGone = !(await page.isVisible('input[type="password"]').catch(() => true))
          if (passwordGone) {
            // console.log('[SiteAnalyzer] 密码框已消失 → 登录成功')
            loginSucceeded = true
            break
          }

          // 检测2：页面是否有明显变化
          const hasChanged = await hasPageChangedSince(page, preLoginSnapshot)

          // 检测3：尝试处理弹窗/协议页面（不限于模态框）
          const handledPopup = await tryHandlePostLoginPopup(page)
          if (handledPopup) {
            // console.log('[SiteAnalyzer] 自动处理了登录后弹窗/协议页面')
            onProgress({
              taskId: config.taskId,
              type: 'logging_in',
              message: '已自动处理登录后的确认/协议弹窗'
            })
            await new Promise(r => setTimeout(r, 2000))
            continue
          }

          // 检测3b：直接用Playwright选择器尝试点击确认按钮
          const handledDirect = await tryDirectClickConfirmButton(page)
          if (handledDirect) {
            // console.log('[SiteAnalyzer] 通过直接选择器点击了确认按钮')
            onProgress({
              taskId: config.taskId,
              type: 'logging_in',
              message: '已自动点击确认/同意按钮'
            })
            await new Promise(r => setTimeout(r, 2000))
            continue
          }

          // 检测3c：尝试处理机构选择弹窗
          const institutionHandled = await tryHandleInstitutionSelection(page)
          if (institutionHandled) {
            // console.log('[SiteAnalyzer] 自动选择了机构')
            onProgress({
              taskId: config.taskId,
              type: 'logging_in',
              message: '已自动选择第一个机构'
            })
            await new Promise(r => setTimeout(r, 2000))
            continue
          }

          // 检测4：检查是否有应用内容出现
          if (hasChanged) {
            const appState = await checkAppState(page)
            // console.log('[SiteAnalyzer] 应用状态检测:', JSON.stringify(appState))
            if (appState.hasAppContent && !appState.hasBlockingLoginOverlay) {
              // console.log('[SiteAnalyzer] 检测到应用内容已加载，登录覆盖层已消失 → 登录成功')
              loginSucceeded = true
              break
            }
          }
        }

        // 如果自动登录未成功，提示用户手动操作
        if (!loginSucceeded) {
          // console.log('[SiteAnalyzer] 自动登录流程超时或未完成，等待用户手动操作')
          onProgress({
            taskId: config.taskId,
            type: 'logging_in',
            message: '自动登录未检测到明确的成功信号。浏览器已打开，请手动完成登录步骤（如处理验证码、服务协议等）。完成后系统将自动继续...'
          })
          await waitForManualLogin(page, 120000, taskState)
          // console.log('[SiteAnalyzer] 用户手动操作完成，当前URL:', page.url())
        }

        // 关键修复：无论自动登录是否成功，都要处理登录后的中间页面
        // 服务协议弹窗可能在密码框消失（登录成功）之后才出现
        // console.log('[SiteAnalyzer] 开始处理登录后的中间页面/弹窗...')
        await handlePostLoginIntermediatePages(page, config, taskState, onProgress)
        // console.log('[SiteAnalyzer] 中间页面处理完成，当前URL:', page.url())

        // 最终确认登录状态
        const finalState = await checkAppState(page)
        const finalCheck = await isStillOnLoginPage(page, loginPageUrl)
        // console.log('[SiteAnalyzer] 最终状态:', JSON.stringify(finalState), '是否仍在登录页:', finalCheck)

        if (finalCheck) {
          onProgress({
            taskId: config.taskId,
            type: 'login_failed',
            message: '登录后仍在登录页面，可能登录失败。将以非登录状态继续分析。'
          })
        } else {
          onProgress({
            taskId: config.taskId,
            type: 'login_success',
            message: `登录成功，当前页面: ${page.url()}`
          })
          // console.log('[SiteAnalyzer] 登录成功!')
        }

        // console.log('[SiteAnalyzer] ===== 密码登录流程结束 (v5) =====')
        return page
      }

      case 'manual': {
        const page = await browserManager.getPage()
        await browserManager.navigateTo(page, targetUrl)

        // 专用分析 Profile 中已有登录态时，直接开始分析，不再无意义地等待两分钟。
        const initialState = await checkAppState(page)
        const alreadyLoggedIn = initialState.hasAppContent &&
          !initialState.hasPasswordField &&
          !initialState.hasBlockingLoginOverlay

        if (!alreadyLoggedIn) {
          onProgress({
            taskId: config.taskId,
            type: 'logging_in',
            message: '正在等待您操作：请切换到已打开的“网页分析”浏览器窗口，完成登录、验证码或服务协议确认。本次最多等待 2 分钟；登录成功后将自动继续，您也可以在聊天中点击“停止”取消。首次登录成功后会保存在专用分析浏览器中。'
          })
          const loginResult = await waitForManualLogin(page, 120000, taskState, (remainingSeconds) => {
            onProgress({
              taskId: config.taskId,
              type: 'logging_in',
              message: `仍在等待您在“网页分析”浏览器窗口完成登录或验证码（剩余约 ${remainingSeconds} 秒）。完成后会自动继续；如不再需要，请点击“停止”。`
            })
          })
          if (loginResult === 'timeout') {
            throw new Error('未检测到登录完成。请在网页分析浏览器中完成登录后重新开始分析。')
          }
        } else {
          onProgress({
            taskId: config.taskId,
            type: 'login_success',
            message: '已复用网页分析浏览器中的登录状态，继续分析...'
          })
        }

        if (isCancelled(taskState)) return page
        await handlePostLoginIntermediatePages(page, config, taskState, onProgress)

        onProgress({
          taskId: config.taskId,
          type: 'login_success',
          message: `登录步骤完成，当前页面: ${page.url()}，继续分析...`
        })

        return page
      }
    }

    return null
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '登录失败'
    onProgress({ taskId: config.taskId, type: 'login_failed', message: `登录失败，已停止分析: ${errorMsg}`, error: errorMsg })
    // 登录未完成时不能继续爬取，否则会把匿名页或登录页误当成目标网站内容。
    throw error
  }
}

/**
 * 获取页面快照，用于后续对比页面是否发生变化
 */
async function getPageSnapshot(page: Page): Promise<{
  url: string
  elementCount: number
  hasPasswordField: boolean
  visibleButtonCount: number
}> {
  try {
    return await page.evaluate(() => ({
      url: window.location.href,
      elementCount: document.querySelectorAll('*').length,
      hasPasswordField: !!document.querySelector('input[type="password"]'),
      visibleButtonCount: Array.from(document.querySelectorAll('button, [role="button"]')).filter(
        (el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        }
      ).length
    }))
  } catch {
    return { url: page.url(), elementCount: 0, hasPasswordField: true, visibleButtonCount: 0 }
  }
}

/**
 * 检查页面是否发生了明显变化（与快照对比）
 */
async function hasPageChangedSince(page: Page, snapshot: {
  elementCount: number
  visibleButtonCount: number
}): Promise<boolean> {
  try {
    const current = await getPageSnapshot(page)
    const elementChange = Math.abs(current.elementCount - snapshot.elementCount) / Math.max(snapshot.elementCount, 1)
    const buttonChange = Math.abs(current.visibleButtonCount - snapshot.visibleButtonCount)
    return elementChange > 0.1 || buttonChange >= 2
  } catch {
    return false
  }
}

/**
 * 检查页面的应用状态
 */
async function checkAppState(page: Page): Promise<{
  hasPasswordField: boolean
  hasAppContent: boolean
  hasBlockingLoginOverlay: boolean
  hasBlockingPopup: boolean
}> {
  try {
    return await page.evaluate(() => {
      const hasPasswordField = !!document.querySelector('input[type="password"]')

      // 检查是否有应用导航/内容
      const appNavSelectors = 'nav, .nav, .sidebar, [class*="sidebar"], [class*="menu"], [class*="header"], [class*="toolbar"], [class*="topbar"], [class*="app-main"], [class*="main-content"]'
      const hasAppContent = !!document.querySelector(appNavSelectors)

      // 检查是否有阻塞性的登录覆盖层
      let hasBlockingLoginOverlay = false
      if (hasPasswordField) {
        const pwInput = document.querySelector('input[type="password"]')
        if (pwInput) {
          const loginParent = pwInput.closest('[class*="login"], [class*="signin"], [class*="sign-in"], [class*="auth"]')
          if (loginParent) {
            const style = window.getComputedStyle(loginParent)
            const zIndex = parseInt(style.zIndex || '0')
            const pos = style.position
            if ((pos === 'fixed' || pos === 'absolute') && zIndex > 100) {
              hasBlockingLoginOverlay = true
            }
          }
        }
      }

      // 检查是否有阻塞性弹窗
      // 策略1: 检查有模态类名的元素
      let hasBlockingPopup = false
      const modalSelectors = '.modal, .dialog, .popup, .overlay, [role="dialog"], [role="alertdialog"], [class*="modal"], [class*="dialog-box"], [class*="popup"], [class*="mask"]'
      const modalEls = document.querySelectorAll(modalSelectors)
      for (const el of modalEls) {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 100 || rect.height < 50) continue
        const zIndex = parseInt(style.zIndex || '0')
        if (style.position === 'fixed' || (style.position === 'absolute' && zIndex > 50)) {
          hasBlockingPopup = true
          break
        }
      }

      // 策略2: 检查纯 inline style 的 fixed 弹窗（无模态类名）
      // 查找 position:fixed + 高 z-index + 居中定位 + 有一定面积的元素
      if (!hasBlockingPopup) {
        const allDivs = document.querySelectorAll('div')
        for (const el of allDivs) {
          const style = window.getComputedStyle(el)
          if (style.position !== 'fixed') continue
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
          const zIndex = parseInt(style.zIndex || '0')
          if (zIndex < 1000) continue // 高z-index才可能是弹窗
          const rect = el.getBoundingClientRect()
          if (rect.width < 200 || rect.height < 150) continue // 有一定面积
          // 检查是否居中（弹窗通常居中）
          const isCentered = Math.abs((rect.left + rect.right) / 2 - window.innerWidth / 2) < window.innerWidth * 0.3
          if (isCentered) {
            hasBlockingPopup = true
            break
          }
        }
      }

      return { hasPasswordField, hasAppContent, hasBlockingLoginOverlay, hasBlockingPopup }
    })
  } catch {
    return { hasPasswordField: false, hasAppContent: false, hasBlockingLoginOverlay: false, hasBlockingPopup: false }
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
  const usernameSelectors = [
    'input[name="username"]', 'input[name="email"]', 'input[name="account"]',
    'input[name="user"]', 'input[name="login"]', 'input[name="phone"]',
    'input[type="email"]',
    'input[type="text"][placeholder*="用户"]', 'input[type="text"][placeholder*="邮箱"]',
    'input[type="text"][placeholder*="手机"]', 'input[type="text"][placeholder*="账号"]',
    'input[id*="user"]', 'input[id*="email"]', 'input[id*="login"]'
  ]
  const passwordSelectors = [
    'input[name="password"]', 'input[name="passwd"]', 'input[name="pass"]',
    'input[type="password"]', 'input[id*="pass"]'
  ]
  const submitSelectors = [
    'button[type="submit"]', 'input[type="submit"]',
    'button:has-text("登录")', 'button:has-text("登 录")',
    'button:has-text("Login")', 'button:has-text("Sign in")',
    'button:has-text("登录/注册")', '.login-btn', '.submit-btn'
  ]

  let usernameSelector = ''
  let passwordSelector = ''
  let submitSelector = ''

  for (const sel of usernameSelectors) {
    try { if (await page.$(sel)) { usernameSelector = sel; break } } catch { /* ignore */ }
  }
  for (const sel of passwordSelectors) {
    try { if (await page.$(sel)) { passwordSelector = sel; break } } catch { /* ignore */ }
  }
  for (const sel of submitSelectors) {
    try { if (await page.$(sel)) { submitSelector = sel; break } } catch { /* ignore */ }
  }

  return passwordSelector ? { usernameSelector, passwordSelector, submitSelector } : null
}

/**
 * 检测是否仍在登录页面
 * 适配SPA场景：SPA中登录表单可能是覆盖层，URL不会变化
 */
async function isStillOnLoginPage(page: Page, loginPageUrl: string): Promise<boolean> {
  try {
    const currentUrl = page.url()
    const parsedCurrent = new URL(currentUrl)
    const parsedLogin = new URL(loginPageUrl)

    // 1. URL路径或hash发生了变化 → 已离开登录页
    const urlChanged = parsedCurrent.pathname !== parsedLogin.pathname ||
                       parsedCurrent.hash !== parsedLogin.hash
    if (urlChanged) {
      // console.log('[SiteAnalyzer] isStillOnLoginPage: URL已变化，判定为已离开登录页')
      return false
    }

    // 2. URL未变化（SPA场景），通过DOM状态判断
    const appState = await checkAppState(page)

    // 没有密码框且没有阻塞覆盖层 → 已离开登录页
    if (!appState.hasPasswordField && !appState.hasBlockingLoginOverlay) return false

    // 有应用内容且没有阻塞性登录覆盖层 → 登录成功（密码框是残留DOM）
    if (appState.hasAppContent && !appState.hasBlockingLoginOverlay) return false

    // 有阻塞性弹窗 → 不是登录页，是中间步骤
    if (appState.hasBlockingPopup) return false

    // 有密码框且有阻塞性登录覆盖层 → 仍在登录页
    if (appState.hasPasswordField && appState.hasBlockingLoginOverlay) return true

    // 有密码框但没有应用内容 → 可能仍在登录页
    if (appState.hasPasswordField && !appState.hasAppContent) return true

    return false
  } catch {
    return false
  }
}

/**
 * 尝试处理登录后的弹窗/协议页面
 * 不限于模态框，也处理全屏覆盖的协议页面
 * @returns 是否处理了弹窗
 */
async function tryHandlePostLoginPopup(page: Page): Promise<boolean> {
  // 策略1: 在模态框容器中查找同意按钮
  const handledByModal = await tryClickConsentInModal(page)
  if (handledByModal) return true

  // 策略2: 在全屏覆盖层/协议页面中查找同意按钮
  const handledByOverlay = await tryClickConsentInOverlay(page)
  if (handledByOverlay) return true

  // 策略3: 查找页面上的同意复选框
  const handledCheckbox = await tryCheckConsentCheckbox(page)
  if (handledCheckbox) return true

  return false
}

/**
 * 在模态框中查找并点击同意/确认按钮
 */
async function tryClickConsentInModal(page: Page): Promise<boolean> {
  const hasModal = await page.evaluate((selectors: string[]) => {
    return selectors.some((sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    })
  }, MODAL_CONTAINER_SELECTORS).catch(() => false)

  if (!hasModal) return false

  for (const modalSel of MODAL_CONTAINER_SELECTORS) {
    try {
      const modalEl = await page.$(modalSel)
      if (!modalEl) continue
      const isVisible = await modalEl.isVisible().catch(() => false)
      if (!isVisible) continue

      // 尝试特定选择器
      for (const selector of CONSENT_BUTTON_SELECTORS_MODAL) {
        const button = await modalEl.$(selector)
        if (button && (await button.isVisible().catch(() => false))) {
          await button.click()
          // console.log(`[SiteAnalyzer] 在模态框中点击了: ${selector}`)
          return true
        }
      }

      // 在弹窗中查找包含关键词的可点击元素（包括 div/span 等非标准按钮）
      const buttons = await modalEl.$$(CLICKABLE_BUTTON_SELECTOR)
      for (const btn of buttons) {
        if (!(await btn.isVisible().catch(() => false))) continue

        // 跳过包含子按钮的容器元素
        const isLeaf = await btn.evaluate((el: Element, sel: string) => {
          return el.querySelectorAll(sel).length === 0
        }, CLICKABLE_BUTTON_SELECTOR).catch(() => true)
        if (!isLeaf) continue

        const btnText = await btn.evaluate((el: Element) => (el.textContent || '').trim()).catch(() => '')
        if (!btnText || btnText.length > 15) continue

        // 排除同时包含取消和确认关键词的容器文本
        const hasCancel = ['取消', 'cancel', 'close', '关闭'].some(kw => btnText.toLowerCase().includes(kw))
        const hasConfirm = [...CONSENT_KEYWORDS_CN, ...CONSENT_KEYWORDS_EN].some((kw) => btnText.includes(kw))
        if (hasCancel && hasConfirm) continue

        if (hasConfirm) {
          await btn.click()
          // console.log(`[SiteAnalyzer] 在模态框中点击了按钮: "${btnText}"`)
          return true
        }
      }
    } catch { /* 继续 */ }
  }
  return false
}

/**
 * 在全屏覆盖层/协议页面中查找并点击同意/确认按钮
 * 处理非模态框的全屏协议页面（如登录后出现的服务协议确认页）
 * 也处理用 div/span 模拟的按钮（如 <div class="dialog-btn confirm" id="dialog-confirm">确定</div>）
 */
async function tryClickConsentInOverlay(page: Page): Promise<boolean> {
  try {
    const result = await page.evaluate(({
      keywords, clickSelector
    }: { keywords: string[]; clickSelector: string }) => {
      const allKeywords = [
        '同意', '我同意', '接受', '全部接受', '同意并继续', '我知道了',
        '已阅读并同意', '确认', '确定', '下一步', '继续', '进入系统',
        'Accept', 'I Agree', 'Confirm', 'Continue', 'Next', 'OK', 'Submit',
      ]
      const allKeywordsArr = [...keywords, ...allKeywords]

      // 策略A: 在覆盖层/遮罩层中查找按钮
      const candidates: Array<{ el: Element; area: number }> = []
      const allElements = document.querySelectorAll('div, section, article, aside, form, main')

      for (const el of allElements) {
        const style = window.getComputedStyle(el)
        if (style.position !== 'fixed' && style.position !== 'absolute') continue
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue

        const rect = el.getBoundingClientRect()
        // 降低阈值：20% 视口面积即可
        if (rect.width < window.innerWidth * 0.2 || rect.height < window.innerHeight * 0.2) continue

        const zIndex = parseInt(style.zIndex || '0')
        // 只要有 z-index 或 fixed 定位即可
        if (style.position === 'fixed' || zIndex > 10) {
          candidates.push({ el, area: rect.width * rect.height })
        }
      }

      // 按面积降序排列
      candidates.sort((a, b) => b.area - a.area)

      // 辅助函数：检查元素是否是"叶子按钮"（自身不含其他可点击子元素）
      function isLeafButton(el: Element, selector: string): boolean {
        // 如果该元素内部还有其他匹配选择器的子元素，说明它是容器而非按钮
        const childButtons = el.querySelectorAll(selector)
        return childButtons.length === 0
      }

      for (const candidate of candidates) {
        const buttons = candidate.el.querySelectorAll(clickSelector)
        for (const btn of buttons) {
          const btnRect = btn.getBoundingClientRect()
          if (btnRect.width === 0 || btnRect.height === 0) continue
          // 跳过太小的元素
          if (btnRect.width < 20 || btnRect.height < 10) continue

          // 关键：跳过包含子按钮的容器元素（如 dialog-btns）
          if (!isLeafButton(btn, clickSelector)) continue

          const btnText = (btn.textContent || '').trim()
          if (!btnText || btnText.length > 15) continue

          // 排除同时包含"取消"和"确认"类关键词的文本（这是容器）
          const hasCancel = ['取消', 'cancel', 'close', '关闭'].some(kw => btnText.toLowerCase().includes(kw))
          const hasConfirm = allKeywordsArr.some(kw => btnText.includes(kw))
          if (hasCancel && hasConfirm) continue

          if (hasConfirm) {
            (btn as HTMLElement).click()
            return { clicked: true, text: btnText, strategy: 'overlay' }
          }
        }
      }

      // 策略B: 直接在整个页面查找有特定id/class的确认按钮（不限于覆盖层内）
      // 优先用 id 选择器精确匹配
      const highPrioritySelectors = ['#dialog-confirm', '#confirm', '#agree', '#accept']
      for (const sel of highPrioritySelectors) {
        const btn = document.querySelector(sel) as HTMLElement | null
        if (!btn) continue
        const btnRect = btn.getBoundingClientRect()
        if (btnRect.width === 0 || btnRect.height === 0) continue
        if (btnRect.width < 20 || btnRect.height < 10) continue
        if (!isLeafButton(btn, clickSelector)) continue

        const btnText = (btn.textContent || '').trim()
        if (!btnText || btnText.length > 15) continue
        const hasCancel = ['取消', 'cancel', 'close', '关闭'].some(kw => btnText.toLowerCase().includes(kw))
        if (hasCancel) continue // 如果包含取消关键词就跳过

        btn.click()
        return { clicked: true, text: btnText, strategy: 'direct-by-id' }
      }

      // 策略C: 查找 class 含 confirm 且文本含确认关键词的叶子元素
      const directButtons = document.querySelectorAll(clickSelector)
      for (const btn of directButtons) {
        const btnRect = btn.getBoundingClientRect()
        if (btnRect.width === 0 || btnRect.height === 0) continue
        if (btnRect.width < 20 || btnRect.height < 10) continue
        if (!isLeafButton(btn, clickSelector)) continue

        const btnText = (btn.textContent || '').trim()
        if (!btnText || btnText.length > 15) continue

        const btnId = (btn as HTMLElement).id || ''
        const btnClass = (btn as HTMLElement).className || ''
        const btnAttrs = (btnId + ' ' + btnClass).toLowerCase()

        const isHighConfidence = btnAttrs.includes('confirm') || btnAttrs.includes('agree') || btnAttrs.includes('accept')
        const hasCancel = ['取消', 'cancel', 'close', '关闭'].some(kw => btnText.toLowerCase().includes(kw))
        if (hasCancel) continue

        if (isHighConfidence && allKeywordsArr.some(kw => btnText.includes(kw))) {
          (btn as HTMLElement).click()
          return { clicked: true, text: btnText, strategy: 'direct-high-confidence' }
        }
      }

      return { clicked: false }
    }, {
      keywords: [...CONSENT_KEYWORDS_CN, ...CONSENT_KEYWORDS_EN],
      clickSelector: CLICKABLE_BUTTON_SELECTOR
    })

    if (result?.clicked) {
      // console.log(`[SiteAnalyzer] 在覆盖层中点击了按钮: "${result.text}" (策略: ${result.strategy})`)
      return true
    }
  } catch (e) {
    // console.log('[SiteAnalyzer] tryClickConsentInOverlay 异常:', e instanceof Error ? e.message : String(e))
  }
  return false
}

/**
 * 尝试勾选同意复选框
 */
async function tryCheckConsentCheckbox(page: Page): Promise<boolean> {
  try {
    const checkboxes = await page.$$('input[type="checkbox"]')
    for (const checkbox of checkboxes) {
      if (!(await checkbox.isVisible().catch(() => false))) continue

      const parentText = await checkbox.evaluate((el: Element) => {
        const label = el.closest('label')
        const parent = el.closest('[class*="agree"], [class*="consent"], [class*="protocol"], [class*="check"]')
        return (label?.textContent || parent?.textContent || '').toLowerCase()
      }).catch(() => '')

      const consentKeywords = ['同意', '已阅读', '服务协议', '隐私政策', '个人信息保护',
        'agree', 'accept', 'terms', 'privacy', 'policy', 'consent']

      if (consentKeywords.some((kw) => parentText.includes(kw))) {
        const isChecked = await checkbox.isChecked().catch(() => true)
        if (!isChecked) {
          await checkbox.check()
          // console.log('[SiteAnalyzer] 勾选了同意复选框')
          return true
        }
      }
    }
  } catch { /* 忽略 */ }
  return false
}

/**
 * 尝试处理机构/组织选择弹窗
 * 检测到 "请选择" 类型的固定弹窗后，自动点击第一个选项
 */
async function tryHandleInstitutionSelection(page: Page): Promise<boolean> {
  try {
    const clicked = await page.evaluate(() => {
      // 查找包含"请选择"关键词的 fixed 弹窗
      const allDivs = document.querySelectorAll('div')
      for (const el of allDivs) {
        const style = window.getComputedStyle(el)
        if (style.position !== 'fixed') continue
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const zIndex = parseInt(style.zIndex || '0')
        if (zIndex < 1000) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 200 || rect.height < 150) continue

        const text = el.textContent || ''
        // 检测机构选择关键词
        const isSelectionPopup = text.includes('请选择') || text.includes('选择机构') ||
          text.includes('选择中心') || text.includes('select') || text.includes('Select')
        if (!isSelectionPopup) continue

        // 在弹窗中查找可点击的选项（flex布局的子元素，排除标题区域）
        const titleEl = el.querySelector('.title')
        const scrollEl = el.querySelector('.SCROLL, .scroll, [class*="list"], [class*="options"]')
        const container = scrollEl || el

        // 查找选项：通常是有 flex 布局、包含 img 或 span 的子 div
        const options = container.querySelectorAll(':scope > div')
        for (const opt of options) {
          const optStyle = window.getComputedStyle(opt)
          // 跳过标题等非选项元素
          if (opt === titleEl) continue
          const optRect = opt.getBoundingClientRect()
          if (optRect.width < 50 || optRect.height < 30) continue

          // 检查选项是否包含图片或文字（确认是机构选项）
          const hasImg = !!opt.querySelector('img')
          const hasSpan = !!opt.querySelector('span')
          if (hasImg || hasSpan) {
            (opt as HTMLElement).click()
            return true
          }
        }

        // 如果没找到 flex 子选项，尝试直接点击第一个非标题子div
        const allChildren = container.querySelectorAll(':scope > div')
        for (const child of allChildren) {
          if (child === titleEl) continue
          const childRect = child.getBoundingClientRect()
          if (childRect.width > 50 && childRect.height > 30) {
            (child as HTMLElement).click()
            return true
          }
        }
      }
      return false
    })

    if (clicked) {
      // console.log('[SiteAnalyzer] 自动选择了第一个机构选项')
      return true
    }
  } catch (e) {
    // console.log('[SiteAnalyzer] tryHandleInstitutionSelection 异常:', e instanceof Error ? e.message : String(e))
  }
  return false
}

/**
 * 使用Playwright原生选择器直接尝试点击确认按钮
 * 作为 page.evaluate 方案的补充，更可靠
 */
async function tryDirectClickConfirmButton(page: Page): Promise<boolean> {
  // 常见的确认/同意按钮选择器列表（Playwright支持的）
  const confirmSelectors = [
    '#dialog-confirm',
    '#confirm',
    '#agree',
    '#accept',
    '[class*="dialog-btn"][class*="confirm"]',
    '[class*="btn-confirm"]',
    '[class*="confirm-btn"]',
    '[class*="btn-agree"]',
    '[class*="agree-btn"]',
    '[class*="btn-accept"]',
    '[class*="accept-btn"]',
  ]

  for (const sel of confirmSelectors) {
    try {
      const el = await page.$(sel)
      if (!el) continue
      const visible = await el.isVisible().catch(() => false)
      if (!visible) continue

      const text = await el.textContent().catch(() => '')
      if (!text) continue

      const trimmedText = text.trim()
      // console.log(`[SiteAnalyzer] tryDirectClickConfirmButton: 找到可见元素 "${sel}" → "${trimmedText}"`)

      // 点击该元素
      await el.click({ timeout: 3000 })
      // console.log(`[SiteAnalyzer] tryDirectClickConfirmButton: 已点击 "${trimmedText}"`)
      return true
    } catch {
      // 继续尝试下一个选择器
    }
  }

  return false
}

/**
 * 处理登录后的中间页面（协议弹窗、机构选择等）
 * 使用 tryHandlePostLoginPopup 进行检测，更宽泛地覆盖各种弹窗形式
 */
async function handlePostLoginIntermediatePages(
  page: Page,
  config: SiteAnalyzerConfig,
  taskState: TaskState,
  onProgress: (progress: SiteAnalyzerProgress) => void
): Promise<void> {
  const MAX_ATTEMPTS = 5
  const OVERALL_TIMEOUT = 60000
  const startTime = Date.now()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (isCancelled(taskState)) return
    if (Date.now() - startTime > OVERALL_TIMEOUT) {
      // console.log('[SiteAnalyzer] handlePostLoginIntermediatePages: 总超时')
      return
    }

    // 等待页面稳定
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch { /* 忽略 */ }
    await new Promise(r => setTimeout(r, 1500))

    if (isCancelled(taskState)) return

    // 检测页面是否有密码框（还在登录页）
    const hasPassword = await page.isVisible('input[type="password"]').catch(() => false)
    if (hasPassword) {
      // console.log('[SiteAnalyzer] 中间页面处理: 检测到密码框，退出')
      break
    }

    // 检查页面状态（在尝试处理弹窗之前先记录）
    const appState = await checkAppState(page)
    // console.log(`[SiteAnalyzer] 中间页面处理 第${attempt + 1}轮:`, JSON.stringify(appState))

    // 尝试处理弹窗/协议页面
    const handled = await tryHandlePostLoginPopup(page)
    if (handled) {
      // console.log('[SiteAnalyzer] 中间页面处理: 成功自动处理了弹窗')
      onProgress({
        taskId: config.taskId,
        type: 'logging_in',
        message: '已自动处理登录后的确认/协议操作'
      })
      try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch { /* 忽略 */ }
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    // 额外策略：直接用Playwright选择器点击确认按钮（更可靠）
    const directClicked = await tryDirectClickConfirmButton(page)
    if (directClicked) {
      // console.log('[SiteAnalyzer] 中间页面处理: 通过直接点击策略处理了确认按钮')
      onProgress({
        taskId: config.taskId,
        type: 'logging_in',
        message: '已自动点击确认/同意按钮'
      })
      try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch { /* 忽略 */ }
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    // 尝试处理机构/组织选择弹窗（如 "请选择您要登录的机构中心"）
    const institutionHandled = await tryHandleInstitutionSelection(page)
    if (institutionHandled) {
      // console.log('[SiteAnalyzer] 中间页面处理: 自动选择了机构')
      onProgress({
        taskId: config.taskId,
        type: 'logging_in',
        message: '已自动选择第一个机构'
      })
      try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch { /* 忽略 */ }
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    // 如果有应用内容且没有阻塞覆盖层 → 已登录成功
    if (appState.hasAppContent && !appState.hasBlockingLoginOverlay && !appState.hasBlockingPopup) {
      // console.log('[SiteAnalyzer] 中间页面处理: 已检测到应用内容且无阻塞弹窗，退出')
      break
    }

    // 如果有应用内容（即使有弹窗），也尝试继续（弹窗可能不阻塞）
    if (appState.hasAppContent && attempt >= 2) {
      // console.log('[SiteAnalyzer] 中间页面处理: 已有应用内容，经过多轮尝试后退出')
      break
    }

    // 如果有下拉选择框（机构选择等），提示用户
    const hasSelectDropdown = await page.$('select:not([style*="display: none"])').then((el) => !!el).catch(() => false)
    if (hasSelectDropdown) {
      onProgress({
        taskId: config.taskId,
        type: 'logging_in',
        message: '检测到页面有选择框（如机构选择），请在浏览器中手动选择后继续...'
      })
      await waitForManualLogin(page, 30000, taskState)
      continue
    }

    // 最后一轮，提示用户手动操作
    if (attempt >= MAX_ATTEMPTS - 1) {
      onProgress({
        taskId: config.taskId,
        type: 'logging_in',
        message: '没有检测到需要自动处理的弹窗。如有需要请在浏览器中手动操作...'
      })
      await waitForManualLogin(page, 15000, taskState)
    }
  }
}

/**
 * 等待手动登录完成
 * 支持URL变化和密码框消失两种检测方式，支持任务取消
 */
async function waitForManualLogin(
  page: Page,
  timeout: number,
  taskState?: TaskState,
  onWaitingProgress?: (remainingSeconds: number) => void
): Promise<'url_changed' | 'password_gone' | 'navigated' | 'timeout' | 'cancelled' | 'page_error'> {
  const initialUrl = page.url()
  const hasPasswordInitially = await page.isVisible('input[type="password"]').catch(() => false)

  // console.log(`[SiteAnalyzer] waitForManualLogin: 开始等待, timeout=${timeout}ms, hasPassword=${hasPasswordInitially}`)
  const startedAt = Date.now()

  return new Promise<'url_changed' | 'password_gone' | 'navigated' | 'timeout' | 'cancelled' | 'page_error'>((resolve) => {
    let resolved = false
    const safeResolve = (reason: 'url_changed' | 'password_gone' | 'navigated' | 'timeout' | 'cancelled' | 'page_error') => {
      if (!resolved) {
        resolved = true
        // console.log(`[SiteAnalyzer] waitForManualLogin: 解除等待, reason=${reason}`)
        clearInterval(checkInterval)
        clearInterval(cancelCheckInterval)
        clearInterval(progressInterval)
        clearTimeout(timer)
        resolve(reason)
      }
    }

    const timer = setTimeout(() => safeResolve('timeout'), timeout)

    const cancelCheckInterval = setInterval(() => {
      if (isCancelled(taskState)) safeResolve('cancelled')
    }, 2000)

    // 每 30 秒反馈一次，避免用户误以为任务卡死；首次提示已在调用处立即发送。
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const remainingSeconds = Math.max(0, Math.ceil((timeout - elapsed) / 1000))
      onWaitingProgress?.(remainingSeconds)
    }, 30000)

    const checkInterval = setInterval(async () => {
      try {
        const currentUrl = page.url()
        if (currentUrl !== initialUrl) {
          safeResolve('url_changed')
          return
        }
        if (hasPasswordInitially) {
          const hasPasswordNow = await page.isVisible('input[type="password"]').catch(() => false)
          if (!hasPasswordNow) {
            safeResolve('password_gone')
            return
          }
        }
      } catch {
        safeResolve('page_error')
      }
    }, 1000)

    page.on('framenavigated', () => safeResolve('navigated'))
  })
}

/**
 * 取消分析任务
 */
export function cancelSiteAnalyzer(taskId: string): boolean {
  const task = activeTasks.get(taskId)
  if (!task) return false
  task.cancelled = true
  if (task.crawler) task.crawler.cancel()
  // 立即关闭受控浏览器，中断可能正在进行的导航、网络空闲等待或页面操作。
  void task.browserManager.close()
  return true
}

/**
 * 获取活跃任务列表
 */
export function getActiveTasks(): string[] {
  return Array.from(activeTasks.keys())
}
