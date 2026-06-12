/**
 * 网站功能分析工具 - 类型定义
 */

// ==================== 分析配置 ====================

/** 登录方式 */
export type LoginType = 'password' | 'cookie' | 'manual'

/** 登录凭证 */
export interface LoginCredential {
  /** 用户名（password模式） */
  username?: string
  /** 密码（password模式） */
  password?: string
  /** Cookie字符串（cookie模式） */
  cookie?: string
  /** Token（cookie模式） */
  token?: string
  /** Token头名（cookie模式），默认 "Authorization" */
  tokenHeader?: string
}

/** AI服务配置 */
export interface SiteAnalyzerAIConfig {
  /** AI服务地址 */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型ID */
  modelId: string
  /** Temperature */
  temperature?: number
  /** Max tokens */
  maxTokens?: number
}

/** 爬取规则 */
export interface CrawlRules {
  /** 最大爬取深度 */
  maxDepth?: number
  /** 最大页面数量 */
  maxPages?: number
  /** URL包含过滤（正则） */
  urlIncludePatterns?: string[]
  /** URL排除过滤（正则） */
  urlExcludePatterns?: string[]
  /** CSS选择器：指定需要分析的元素 */
  contentSelectors?: string[]
  /** 爬取间隔（毫秒） */
  crawlDelay?: number
  /** 是否遵守robots.txt */
  respectRobotsTxt?: boolean
}

/** 代理配置 */
export interface ProxyConfig {
  /** 代理地址，如 "http://proxy:8080" 或 "socks5://proxy:1080" */
  server?: string
  /** 代理用户名 */
  username?: string
  /** 代理密码 */
  password?: string
}

/** 反爬虫配置 */
export interface AntiBotConfig {
  /** 自定义 User-Agent */
  userAgent?: string
  /** 请求延迟范围 [min, max] 毫秒 */
  requestDelay?: [number, number]
  /** 是否模拟人类行为（随机滚动、点击等） */
  simulateHuman?: boolean
}

/** 完整分析配置 */
export interface SiteAnalyzerConfig {
  /** 目标网址 */
  targetUrl: string
  /** 登录方式 */
  loginType: LoginType
  /** 登录凭证 */
  loginCredential: LoginCredential
  /** AI配置 */
  aiConfig: SiteAnalyzerAIConfig
  /** 爬取规则 */
  crawlRules?: CrawlRules
  /** 代理配置 */
  proxy?: ProxyConfig
  /** 反爬虫配置 */
  antiBot?: AntiBotConfig
  /** 分析任务ID */
  taskId: string
}

// ==================== 网络请求 ====================

/** 捕获的网络请求 */
export interface CapturedRequest {
  /** 请求URL */
  url: string
  /** 请求方法 */
  method: string
  /** 请求头 */
  headers: Record<string, string>
  /** 查询参数 */
  params?: Record<string, string>
  /** 请求体 */
  body?: string
  /** 响应状态码 */
  statusCode: number
  /** 响应头 */
  responseHeaders?: Record<string, string>
  /** 响应内容 */
  response?: string
  /** 响应大小（字节） */
  responseSize?: number
  /** 请求时间戳 */
  timestamp: number
  /** 请求耗时（毫秒） */
  duration?: number
  /** 资源类型 */
  resourceType?: string
  /** 是否为API请求（XHR/Fetch） */
  isApiRequest: boolean
  /** 调用频率（去重后统计） */
  frequency?: number
}

// ==================== 网站页面 ====================

/** 网站页面 */
export interface SitePage {
  /** 页面URL */
  url: string
  /** 页面标题 */
  title?: string
  /** 页面HTML内容 */
  html: string
  /** 页面截图（base64） */
  screenshot?: string
  /** 页面类型 */
  pageType?: string
  /** 页面中的链接 */
  links?: string[]
  /** 页面中的表单 */
  forms?: Array<{
    action: string
    method: string
    inputs: Array<{ name: string; type: string }>
  }>
  /** 该页面触发的API请求 */
  apiRequests?: CapturedRequest[]
  /** 爬取深度 */
  depth: number
}

// ==================== AI分析结果 ====================

/** 功能模块 */
export interface FunctionModule {
  /** 模块名称 */
  name: string
  /** 模块描述 */
  description: string
  /** 关联页面URL列表 */
  pages: string[]
  /** 关联API接口列表 */
  interfaces: string[]
  /** AI分析置信度 */
  confidence?: number
  /** 模块图标/类别 */
  category?: string
}

/** API接口参数 */
export interface ApiParam {
  name: string
  type: string
  required: boolean
  description?: string
}

/** API接口 */
export interface ApiInterface {
  /** 接口URL（可能包含域名前缀） */
  url: string
  /** 请求方法 */
  method: string
  /** 参数列表 */
  params?: ApiParam[]
  /** 返回值结构描述 */
  returnValue?: string
  /** 接口用途描述 */
  description: string
  /** 调用频率 */
  frequency?: number
  /** 示例请求头 */
  exampleHeaders?: Record<string, string>
  /** 示例请求体 */
  exampleBody?: string
  /** 示例响应 */
  exampleResponse?: string
  /** 来源页面 */
  sourcePages?: string[]
}

/** 完整分析结果 */
export interface SiteAnalyzerResult {
  /** 任务ID */
  taskId: string
  /** 目标网址 */
  targetUrl: string
  /** 爬取的页面列表 */
  pages: SitePage[]
  /** 捕获的所有网络请求 */
  requests: CapturedRequest[]
  /** AI识别的功能模块 */
  modules: FunctionModule[]
  /** AI识别的API接口 */
  apis: ApiInterface[]
  /** 分析开始时间 */
  startTime: number
  /** 分析结束时间 */
  endTime?: number
  /** 分析状态 */
  status: 'running' | 'completed' | 'error' | 'cancelled'
  /** 错误信息 */
  error?: string
}

// ==================== 进度事件 ====================

/** 进度事件类型 */
export type SiteAnalyzerProgressType =
  | 'started'
  | 'logging_in'
  | 'login_success'
  | 'login_failed'
  | 'crawling'
  | 'page_crawled'
  | 'analyzing'
  | 'ai_analyzing_page'
  | 'ai_analysis_done'
  | 'generating_report'
  | 'report_ready'
  | 'error'
  | 'completed'
  | 'cancelled'

/** 进度事件 */
export interface SiteAnalyzerProgress {
  /** 任务ID */
  taskId: string
  /** 事件类型 */
  type: SiteAnalyzerProgressType
  /** 进度消息 */
  message: string
  /** 已爬取页面数 */
  pagesCrawled?: number
  /** 总页面数（估计） */
  totalPages?: number
  /** 已识别API数 */
  apisFound?: number
  /** 已分析页面数 */
  pagesAnalyzed?: number
  /** 当前URL */
  currentUrl?: string
  /** 报告文件路径 */
  reportPath?: string
  /** 报告HTML内容 */
  reportHtml?: string
  /** 错误详情 */
  error?: string
  /** 附加数据 */
  data?: unknown
}
