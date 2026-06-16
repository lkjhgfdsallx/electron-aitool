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

/** 页面交互探索结果 */
export interface PageInteractionResult {
  /** 交互动作描述 */
  action: string
  /** 操作的元素描述 */
  element: string
  /** 交互结果描述 */
  result: string
  /** 交互后的截图（base64） */
  screenshot?: string
  /** 交互后出现的内容摘要（如弹窗中的表单字段、Tab下的内容等） */
  contentSummary?: string
}

/** 侧边栏/导航菜单项 */
export interface SidebarMenuItem {
  /** 菜单项文本 */
  text: string
  /** 是否为当前选中项 */
  isActive: boolean
  /** 层级（0=一级菜单，1=二级菜单...） */
  level: number
  /** 子菜单项 */
  children?: SidebarMenuItem[]
}

/** 表格结构详情 */
export interface TableStructure {
  /** 表格标题（如果有的话） */
  title?: string
  /** 列头文本列表 */
  columns: string[]
  /** 数据行数 */
  rowCount: number
  /** 是否有行选择框（checkbox） */
  hasCheckbox: boolean
  /** 是否有序号列 */
  hasIndex: boolean
  /** 是否有操作列 */
  hasAction: boolean
  /** 操作列中的按钮文本 */
  actionButtons: string[]
  /** 表格上方的操作按钮（新增、导出等） */
  headerButtons: string[]
  /** 是否有分页 */
  hasPagination: boolean
}

/** 表单字段详情 */
export interface FormField {
  /** 字段标签 */
  label: string
  /** 字段类型（input/select/datepicker/switch/textarea/radio/checkbox/upload等） */
  type: string
  /** 占位文本 */
  placeholder?: string
  /** 是否必填 */
  required: boolean
  /** 下拉选项（如果是select/radio） */
  options?: string[]
  /** 默认值 */
  defaultValue?: string
}

/** 表单结构详情 */
export interface FormStructure {
  /** 表单标题（如果有的话） */
  title?: string
  /** 字段列表 */
  fields: FormField[]
  /** 提交/操作按钮文本 */
  buttons: string[]
}

/** 页面结构化信息（从DOM中提取） */
export interface PageStructure {
  /** 侧边栏/导航菜单 */
  sidebar?: {
    /** 菜单项列表 */
    items: SidebarMenuItem[]
    /** 当前选中的菜单项文本（用于页面命名） */
    activeItem?: string
  }
  /** 表格详情列表 */
  tables: TableStructure[]
  /** 表单详情列表 */
  forms: FormStructure[]
  /** 页面头部信息 */
  pageHeader?: {
    /** 页面标题文本 */
    title: string
    /** 面包屑路径 */
    breadcrumbs: string[]
    /** 头部操作按钮 */
    headerActions: string[]
  }
  /** 统计卡片（仪表盘常见） */
  statCards: Array<{
    /** 指标名称 */
    label: string
    /** 指标值 */
    value: string
  }>
  /** 页面上所有可见的主要按钮文本 */
  allButtons: string[]
}

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
  /** 页面交互探索结果（点击按钮、Tab、折叠面板等） */
  interactionResults?: PageInteractionResult[]
  /** 页面结构化信息（从DOM中提取的表格/表单/侧边栏等） */
  pageStructure?: PageStructure
}

// ==================== AI分析结果 ====================

/** 功能模块（保留向后兼容） */
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

/** API接口（保留向后兼容） */
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

// ==================== 前端开发者视角的页面分析 ====================

/** UI组件类型 */
export type UIComponentType =
  | 'table'         // 表格/数据列表
  | 'form'          // 表单
  | 'input'         // 输入框
  | 'select'        // 下拉选择器
  | 'datepicker'    // 日期选择器
  | 'modal'         // 弹窗/对话框
  | 'drawer'        // 抽屉
  | 'tabs'          // 标签页
  | 'tree'          // 树形控件
  | 'upload'        // 上传组件
  | 'chart'         // 图表
  | 'menu'          // 菜单/导航
  | 'breadcrumb'    // 面包屑
  | 'pagination'    // 分页
  | 'search'        // 搜索框
  | 'button'        // 按钮组
  | 'card'          // 卡片
  | 'list'          // 列表
  | 'dropdown'      // 下拉菜单
  | 'steps'         // 步骤条
  | 'transfer'      // 穿梭框
  | 'editor'        // 富文本编辑器
  | 'switch'        // 开关
  | 'radio'         // 单选
  | 'checkbox'      // 多选
  | 'tag'           // 标签
  | 'tooltip'       // 提示
  | 'popover'       // 气泡卡片
  | 'other'         // 其他

/** 组件属性/字段描述 */
export interface UIComponentProp {
  /** 属性/字段名称 */
  name: string
  /** 属性类型（如 input, select, datepicker 等） */
  type: string
  /** 属性描述 */
  description: string
}

/** 组件操作描述 */
export interface UIComponentAction {
  /** 操作名称（如"新增"、"编辑"、"删除"） */
  name: string
  /** 操作类型：navigate(跳转) | modal(弹窗) | drawer(抽屉) | api_call(调接口) | download(下载) */
  type: string
  /** 操作描述 */
  description: string
  /** 触发的API（如 "POST /api/user/add"） */
  targetApi?: string
  /** 触发的目标组件名称（如 "新增用户弹窗"） */
  targetComponent?: string
}

/** 单个UI组件的描述 */
export interface UIComponent {
  /** 组件类型 */
  type: UIComponentType
  /** 组件名称（如"用户列表表格"、"搜索表单"） */
  name: string
  /** 组件描述 */
  description: string
  /** 关联的API接口列表（如 ["GET /api/user/list", "POST /api/user/add"]） */
  apiUrls: string[]
  /** 组件的关键属性/配置（如表格列定义、表单字段等） */
  props?: UIComponentProp[]
  /** 组件中的操作（如"新增"按钮触发的弹窗、"编辑"触发的表单等） */
  actions?: UIComponentAction[]
  /** 交互探索发现的子组件（如点击按钮后弹出的弹窗、Tab页中的内容等） */
  children?: UIComponent[]
}

/** 单个页面的分析结果 */
export interface PageAnalysis {
  /** 页面URL */
  url: string
  /** 页面标题 */
  title: string
  /** 页面类型（如：列表页、详情页、表单页、仪表盘、登录页、设置页等） */
  pageType: string
  /** 页面的整体UI描述（面向前端开发者的一句话概述） */
  uiDescription: string
  /** 页面布局概述（如：顶部搜索栏 + 数据表格 + 底部分页） */
  layoutSummary: string
  /** 页面中的UI组件列表 */
  components: UIComponent[]
  /** 该页面独占的API接口URL列表（仅在此页面使用） */
  exclusiveApis: string[]
  /** 该页面使用的公共组件名称列表 */
  sharedComponentRefs: string[]
  /** 该页面使用的公共接口URL列表 */
  sharedApiRefs: string[]
  /** 爬取深度 */
  depth: number
}

/** 公共组件（多个页面共同使用的组件模式） */
export interface SharedComponent {
  /** 组件名称 */
  name: string
  /** 组件类型 */
  type: UIComponentType
  /** 组件描述 */
  description: string
  /** 使用该组件的页面URL列表 */
  pages: string[]
  /** 该组件关联的API接口URL列表 */
  apiUrls: string[]
  /** 组件的通用配置/属性 */
  commonProps?: UIComponentProp[]
}

/** 公用接口（多个页面共同调用的API） */
export interface SharedApi {
  /** API URL */
  url: string
  /** 请求方法 */
  method: string
  /** API描述 */
  description: string
  /** 参数列表 */
  params?: ApiParam[]
  /** 返回值描述 */
  returnValue?: string
  /** 调用该接口的页面URL列表 */
  pages: string[]
  /** 示例请求体 */
  exampleBody?: string
  /** 示例响应 */
  exampleResponse?: string
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
  /** AI识别的功能模块（保留向后兼容） */
  modules: FunctionModule[]
  /** AI识别的API接口（保留向后兼容） */
  apis: ApiInterface[]
  /** 页面分析结果（前端开发者视角，核心数据） */
  pageAnalyses: PageAnalysis[]
  /** 公共组件（多个页面共同使用的组件） */
  sharedComponents: SharedComponent[]
  /** 公用接口（多个页面共同调用的API） */
  sharedApis: SharedApi[]
  /** 分析开始时间 */
  startTime: number
  /** 分析结束时间 */
  endTime?: number
  /** 分析状态 */
  status: 'running' | 'completed' | 'error' | 'cancelled'
  /** 错误信息 */
  error?: string
  /** 报告HTML内容 */
  reportHtml?: string
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
