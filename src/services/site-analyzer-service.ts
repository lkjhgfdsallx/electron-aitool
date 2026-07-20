/**
 * 网站分析器服务（渲染进程端）
 * 封装与主进程的IPC通信，提供给Agent工具使用
 */

/** 分析配置 */
export interface SiteAnalyzerConfig {
  /** 网页分析使用的 Chrome / Edge 可执行文件路径 */
  browserExecutablePath: string
  targetUrl: string
  loginType: 'password' | 'cookie' | 'manual'
  loginCredential: {
    username?: string
    password?: string
    cookie?: string
    token?: string
    tokenHeader?: string
  }
  aiConfig: {
    baseUrl: string
    apiKey: string
    modelId: string
    temperature?: number
    maxTokens?: number
  }
  crawlRules?: {
    maxDepth?: number
    maxPages?: number
    urlIncludePatterns?: string[]
    urlExcludePatterns?: string[]
    crawlDelay?: number
  }
  proxy?: {
    server?: string
    username?: string
    password?: string
  }
  antiBot?: {
    userAgent?: string
    requestDelay?: [number, number]
    simulateHuman?: boolean
  }
  taskId: string
}

/** 进度事件 */
export interface SiteAnalyzerProgress {
  taskId: string
  type: string
  message: string
  pagesCrawled?: number
  totalPages?: number
  apisFound?: number
  pagesAnalyzed?: number
  currentUrl?: string
  reportPath?: string
  reportHtml?: string
  error?: string
  data?: unknown
}

/** UI组件类型 */
export type UIComponentType =
  | 'table' | 'form' | 'input' | 'select' | 'datepicker' | 'modal' | 'drawer'
  | 'tabs' | 'tree' | 'upload' | 'chart' | 'menu' | 'breadcrumb' | 'pagination'
  | 'search' | 'button' | 'card' | 'list' | 'dropdown' | 'steps' | 'transfer'
  | 'editor' | 'switch' | 'radio' | 'checkbox' | 'tag' | 'tooltip' | 'popover' | 'other'

/** UI组件属性 */
export interface UIComponentProp {
  name: string
  type: string
  description: string
}

/** UI组件操作 */
export interface UIComponentAction {
  name: string
  type: string
  description: string
  targetApi?: string
  targetComponent?: string
}

/** UI组件 */
export interface UIComponent {
  type: UIComponentType
  name: string
  description: string
  apiUrls: string[]
  props?: UIComponentProp[]
  actions?: UIComponentAction[]
  children?: UIComponent[]
}

/** 页面分析结果 */
export interface PageAnalysis {
  url: string
  title: string
  pageType: string
  uiDescription: string
  layoutSummary: string
  components: UIComponent[]
  exclusiveApis: string[]
  sharedComponentRefs: string[]
  sharedApiRefs: string[]
  depth: number
}

/** 公共组件 */
export interface SharedComponent {
  name: string
  type: UIComponentType
  description: string
  pages: string[]
  apiUrls: string[]
  commonProps?: UIComponentProp[]
}

/** 公用接口 */
export interface SharedApi {
  url: string
  method: string
  description: string
  params?: Array<{ name: string; type: string; required: boolean; description?: string }>
  returnValue?: string
  pages: string[]
  exampleBody?: string
  exampleResponse?: string
}

/** 分析结果 */
export interface SiteAnalyzerResult {
  taskId: string
  targetUrl: string
  pages: Array<{ url: string; title?: string; pageType?: string; depth: number }>
  requests: Array<{ url: string; method: string; statusCode: number }>
  modules: Array<{
    name: string
    description: string
    pages: string[]
    interfaces: string[]
    confidence?: number
    category?: string
  }>
  apis: Array<{
    url: string
    method: string
    description: string
    params?: Array<{ name: string; type: string; required: boolean; description?: string }>
    returnValue?: string
    frequency?: number
  }>
  /** 页面分析结果（前端开发者视角） */
  pageAnalyses: PageAnalysis[]
  /** 公共组件 */
  sharedComponents: SharedComponent[]
  /** 公用接口 */
  sharedApis: SharedApi[]
  startTime: number
  endTime?: number
  status: string
  error?: string
  reportHtml?: string
}

class SiteAnalyzerService {
  private progressListeners: Map<string, (progress: SiteAnalyzerProgress) => void> = new Map()
  private cleanupFn: (() => void) | null = null

  /** 检查 ElectronAPI 是否可用，并返回诊断信息 */
  private checkAvailability(): { available: boolean; reason: string } {
    if (typeof window === 'undefined') {
      return { available: false, reason: 'window 对象不存在（可能在 SSR/Node 环境中）' }
    }
    if (!window.electronAPI) {
      return { available: false, reason: 'window.electronAPI 未定义。请确认：1) 应用在 Electron 中运行（而非浏览器）；2) preload 脚本已正确加载' }
    }
    if (!window.electronAPI.siteAnalyzer) {
      return { available: false, reason: 'window.electronAPI.siteAnalyzer 未定义。preload 脚本可能未更新，请重启 Electron 应用（preload 不支持热更新）' }
    }
    return { available: true, reason: '' }
  }

  constructor() {
    // 注册全局进度监听
    const check = this.checkAvailability()
    if (check.available) {
      this.cleanupFn = window.electronAPI!.siteAnalyzer!.onProgress((progress: unknown) => {
        const p = progress as SiteAnalyzerProgress
        // 通知所有监听器
        this.progressListeners.forEach((listener) => {
          listener(p)
        })
      })
    } else if (process.env.NODE_ENV !== 'test') {
      // Jest/jsdom 不提供 Electron preload API；服务方法仍会在实际调用时
      // 返回不可用结果，避免模块导入阶段产生无意义的测试控制台警告。
      console.warn('[SiteAnalyzer] 初始化时 ElectronAPI 不可用:', check.reason)
    }
  }

  /**
   * 启动分析任务
   */
  async startAnalysis(config: SiteAnalyzerConfig): Promise<SiteAnalyzerResult> {
    const check = this.checkAvailability()
    if (!check.available) {
      throw new Error(`网站分析器不可用: ${check.reason}`)
    }

    const result = await window.electronAPI!.siteAnalyzer!.start(config as unknown as Record<string, unknown>)
    if (!result.success) {
      throw new Error(result.error || '分析启动失败')
    }

    return result.data as SiteAnalyzerResult
  }

  /**
   * 取消分析任务
   */
  async cancelAnalysis(taskId: string): Promise<boolean> {
    const check = this.checkAvailability()
    if (!check.available) return false
    const result = await window.electronAPI!.siteAnalyzer!.cancel(taskId)
    return result.success
  }

  /** 获取主进程中正在执行的分析任务。 */
  async getActiveTasks(): Promise<string[]> {
    const check = this.checkAvailability()
    if (!check.available) return []
    const result = await window.electronAPI!.siteAnalyzer!.getActiveTasks()
    return result.success && Array.isArray(result.data) ? result.data : []
  }

  /**
   * 注册进度监听器
   */
  addProgressListener(id: string, listener: (progress: SiteAnalyzerProgress) => void): void {
    this.progressListeners.set(id, listener)
  }

  /**
   * 移除进度监听器
   */
  removeProgressListener(id: string): void {
    this.progressListeners.delete(id)
  }

  /**
   * 从用户消息中解析分析配置
   */
  parseConfigFromMessage(message: string, globalConfig?: { baseUrl?: string; apiKey?: string; defaultModel?: string }): SiteAnalyzerConfig | null {
    // 尝试从消息中提取URL
    const urlMatch = message.match(/https?:\/\/[^\s"'<>]+/)
    if (!urlMatch) return null

    const targetUrl = urlMatch[0]
    const taskId = `sa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    // 默认配置
    const config: SiteAnalyzerConfig = {
      browserExecutablePath: '',
      targetUrl,
      loginType: 'manual', // 默认手动登录
      loginCredential: {},
      aiConfig: {
        baseUrl: globalConfig?.baseUrl || '',
        apiKey: globalConfig?.apiKey || '',
        modelId: globalConfig?.defaultModel || ''
      },
      taskId
    }

    // 尝试提取登录信息
    const usernameMatch = message.match(/(?:用户名|username)[：:]\s*(\S+)/i)
    const passwordMatch = message.match(/(?:密码|password)[：:]\s*(\S+)/i)
    if (usernameMatch && passwordMatch) {
      config.loginType = 'password'
      config.loginCredential.username = usernameMatch[1]
      config.loginCredential.password = passwordMatch[1]
    }

    // 尝试提取Cookie
    const cookieMatch = message.match(/(?:cookie)[：:]\s*([^\n]+)/i)
    if (cookieMatch) {
      config.loginType = 'cookie'
      config.loginCredential.cookie = cookieMatch[1].trim()
    }

    // 尝试提取Token
    const tokenMatch = message.match(/(?:token|bearer)[：:]\s*(\S+)/i)
    if (tokenMatch && !cookieMatch) {
      config.loginType = 'cookie'
      config.loginCredential.token = tokenMatch[1].trim()
    }

    // 尝试提取AI配置
    const aiUrlMatch = message.match(/(?:ai[_\s]?url|ai服务|ai地址)[：:]\s*(https?:\/\/\S+)/i)
    const aiKeyMatch = message.match(/(?:api[_\s]?key|apikey)[：:]\s*(\S+)/i)
    const modelMatch = message.match(/(?:model|模型)[：:]\s*(\S+)/i)
    if (aiUrlMatch) config.aiConfig.baseUrl = aiUrlMatch[1]
    if (aiKeyMatch) config.aiConfig.apiKey = aiKeyMatch[1]
    if (modelMatch) config.aiConfig.modelId = modelMatch[1]

    // 尝试提取爬取规则
    const depthMatch = message.match(/(?:深度|depth)[：:]\s*(\d+)/i)
    const maxPagesMatch = message.match(/(?:页面数|pages|max)[：:]\s*(\d+)/i)
    if (depthMatch || maxPagesMatch) {
      config.crawlRules = {}
      if (depthMatch) config.crawlRules.maxDepth = parseInt(depthMatch[1])
      if (maxPagesMatch) config.crawlRules.maxPages = parseInt(maxPagesMatch[1])
    }

    return config
  }

  /**
   * 生成分析摘要文本
   */
  generateSummary(result: SiteAnalyzerResult): string {
    const lines: string[] = []
    lines.push(`## 🔍 网站分析完成\n`)
    lines.push(`**目标网址**: ${result.targetUrl}`)
    lines.push(`**分析状态**: ${result.status === 'completed' ? '✅ 完成' : '❌ ' + result.status}`)
    lines.push(`**耗时**: ${result.endTime ? Math.round((result.endTime - result.startTime) / 1000) : 0}秒\n`)

    lines.push(`### 📊 统计概览`)
    lines.push(`- 爬取页面: **${result.pages.length}** 个`)
    lines.push(`- 识别功能模块: **${result.modules.length}** 个`)
    lines.push(`- 识别API接口: **${result.apis.length}** 个\n`)

    if (result.modules.length > 0) {
      lines.push(`### 📋 功能模块`)
      for (const mod of result.modules) {
        lines.push(`- **${mod.name}**: ${mod.description} (${mod.pages.length}个页面, ${mod.interfaces.length}个API)`)
      }
      lines.push('')
    }

    if (result.apis.length > 0) {
      lines.push(`### 🔌 主要API接口`)
      for (const api of result.apis.slice(0, 15)) {
        lines.push(`- \`${api.method} ${api.url}\` - ${api.description}`)
      }
      if (result.apis.length > 15) {
        lines.push(`- ... 还有 ${result.apis.length - 15} 个API接口`)
      }
      lines.push('')
    }

    lines.push(`\n> 详细的交互式报告已生成，可通过工具查看。`)

    return lines.join('\n')
  }

  destroy(): void {
    this.progressListeners.clear()
    if (this.cleanupFn) {
      this.cleanupFn()
      this.cleanupFn = null
    }
  }
}

export const siteAnalyzerService = new SiteAnalyzerService()
