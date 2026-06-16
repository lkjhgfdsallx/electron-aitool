/**
 * AI分析服务（v2 - 前端开发者视角）
 * 以页面为核心分析UI组件和关联接口
 * 当AI不可用时，使用本地规则进行回退分析
 */

import type {
  SiteAnalyzerConfig,
  SiteAnalyzerAIConfig,
  SitePage,
  CapturedRequest,
  FunctionModule,
  ApiInterface,
  ApiParam,
  SiteAnalyzerProgress,
  PageAnalysis,
  UIComponent,
  UIComponentType,
  UIComponentProp,
  UIComponentAction,
  SharedComponent,
  SharedApi,
  PageStructure
} from './types'

/** analyzeAll 的完整返回结果 */
export interface AnalysisResult {
  modules: FunctionModule[]
  apis: ApiInterface[]
  pageAnalyses: PageAnalysis[]
  sharedComponents: SharedComponent[]
  sharedApis: SharedApi[]
}

export class AIAnalyzer {
  private config: SiteAnalyzerConfig
  private onProgress: (progress: SiteAnalyzerProgress) => void

  constructor(
    config: SiteAnalyzerConfig,
    onProgress: (progress: SiteAnalyzerProgress) => void
  ) {
    this.config = config
    this.onProgress = onProgress
  }

  /**
   * 分析所有页面和请求（v2 - 页面为中心）
   */
  async analyzeAll(
    pages: SitePage[],
    requests: CapturedRequest[]
  ): Promise<AnalysisResult> {
    const allPageAnalyses: PageAnalysis[] = []
    // 同时收集模块和API用于向后兼容
    const allModules: FunctionModule[] = []
    const allApis: ApiInterface[] = []

    // 检查 AI 配置是否有效
    const aiConfig = this.config.aiConfig
    const hasValidAiConfig = !!(aiConfig?.baseUrl && aiConfig?.apiKey && aiConfig?.modelId)

    if (!hasValidAiConfig) {
      // console.log(`[AIAnalyzer] AI配置不完整，跳过AI分析，使用本地分析`)
      this.onProgress({
        taskId: this.config.taskId,
        type: 'ai_analyzing_page',
        message: 'AI配置不完整，使用本地规则分析...'
      })
      return this.localAnalysis(pages, requests)
    }

    // console.log(`[AIAnalyzer] 开始AI分析（v2页面视角）: ${pages.length} 个页面, ${requests.length} 个请求`)
    // console.log(`[AIAnalyzer] AI配置: baseUrl=${aiConfig.baseUrl}, model=${aiConfig.modelId}`)

    let aiSuccessCount = 0
    let aiFailCount = 0

    // 第一步：逐页面分析（页面为中心）
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]

      this.onProgress({
        taskId: this.config.taskId,
        type: 'ai_analyzing_page',
        message: `AI分析页面 (${i + 1}/${pages.length}): ${page.title || page.url}`,
        pagesAnalyzed: i,
        currentUrl: page.url
      })

      try {
        const pageAnalysis = await this.analyzePage(page, requests)
        allPageAnalyses.push(pageAnalysis)
        aiSuccessCount++
        // console.log(`[AIAnalyzer] 页面分析成功: ${page.url} -> ${pageAnalysis.components.length} 组件, 类型: ${pageAnalysis.pageType}`)
      } catch (error) {
        aiFailCount++
        const errorMsg = error instanceof Error ? error.message : 'AI分析失败'
        // console.log(`[AIAnalyzer] 页面分析失败 (${aiFailCount}): ${page.url} - ${errorMsg}`)
        this.onProgress({
          taskId: this.config.taskId,
          type: 'error',
          message: `AI分析页面失败: ${page.url} - ${errorMsg}`,
          error: errorMsg
        })

        // 失败时生成一个基础的PageAnalysis
        allPageAnalyses.push(this.createFallbackPageAnalysis(page, requests))
      }

      // 避免AI服务限流
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // console.log(`[AIAnalyzer] AI分析完成: 成功=${aiSuccessCount}, 失败=${aiFailCount}, 页面分析=${allPageAnalyses.length}`)

    // 如果AI分析全部失败，使用本地回退
    if (aiSuccessCount === 0 && allPageAnalyses.length > 0) {
      // console.log(`[AIAnalyzer] AI分析全部失败，启用本地回退分析`)
      this.onProgress({
        taskId: this.config.taskId,
        type: 'ai_analyzing_page',
        message: 'AI分析结果不理想，正在使用本地规则补充...'
      })
      return this.localAnalysis(pages, requests)
    }

    // 第二步：识别公共组件和公用接口
    this.onProgress({
      taskId: this.config.taskId,
      type: 'ai_analyzing_page',
      message: '正在识别公共组件和公用接口...'
    })

    const { sharedComponents, sharedApis } = this.identifySharedPatterns(allPageAnalyses)

    // 第三步：标记每个页面的公共引用
    this.markSharedReferences(allPageAnalyses, sharedComponents, sharedApis)

    // 第四步：收集独占API和兼容性模块/API
    for (const pa of allPageAnalyses) {
      // 生成兼容性模块
      allModules.push({
        name: pa.pageType + ' - ' + (pa.title || pa.url),
        description: pa.uiDescription,
        pages: [pa.url],
        interfaces: pa.components.flatMap(c => c.apiUrls),
        category: pa.pageType,
        confidence: 0.8
      })

      // 收集所有API（去重）
      const pageApiUrls = new Set(pa.components.flatMap(c => c.apiUrls))
      for (const apiUrl of pageApiUrls) {
        if (!allApis.find(a => a.url === apiUrl)) {
          // 尝试从捕获的请求中获取更多信息
          const capturedReq = requests.find(r => {
            try { return new URL(r.url).pathname === new URL(apiUrl, pa.url).pathname } catch { return false }
          })
          allApis.push({
            url: apiUrl,
            method: capturedReq?.method || 'GET',
            description: this.guessApiDescription(new URL(apiUrl, pa.url).pathname, capturedReq),
            params: capturedReq ? this.extractParams(capturedReq) : undefined,
            returnValue: capturedReq?.response ? this.describeResponse(capturedReq.response) : undefined,
            exampleBody: capturedReq?.body?.substring(0, 500),
            exampleResponse: capturedReq?.response?.substring(0, 500),
            sourcePages: [pa.url],
            frequency: 1
          })
        }
      }
    }

    return {
      modules: allModules,
      apis: allApis,
      pageAnalyses: allPageAnalyses,
      sharedComponents,
      sharedApis
    }
  }

  /**
   * 本地分析 - 不依赖AI，使用规则从请求和HTML中提取信息
   */
  private localAnalysis(
    pages: SitePage[],
    requests: CapturedRequest[]
  ): AnalysisResult {
    // console.log(`[AIAnalyzer] 本地分析开始（v2页面视角）: ${pages.length} 页面, ${requests.length} 请求`)

    // 1. 从捕获的请求中提取API接口
    const apis = this.extractApisFromRequests(requests)

    // 2. 为每个页面生成PageAnalysis
    const pageAnalyses: PageAnalysis[] = pages.map(page => {
      const pageApis = apis.filter(a =>
        a.sourcePages?.includes(page.url) ||
        this.isApiRelatedToPage(page.url, a.url)
      )
      return this.createLocalPageAnalysis(page, pageApis, requests)
    })

    // 3. 识别公共模式
    const { sharedComponents, sharedApis } = this.identifySharedPatterns(pageAnalyses)

    // 4. 标记公共引用
    this.markSharedReferences(pageAnalyses, sharedComponents, sharedApis)

    // 5. 生成兼容性模块
    const modules = this.extractModulesFromPages(pages, apis)

    // console.log(`[AIAnalyzer] 本地分析完成: ${pageAnalyses.length} 页面分析, ${sharedComponents.length} 公共组件, ${sharedApis.length} 公用接口`)

    return { modules, apis, pageAnalyses, sharedComponents, sharedApis }
  }

  /**
   * 分析单个页面（AI） - 返回 PageAnalysis
   */
  private async analyzePage(
    page: SitePage,
    allRequests: CapturedRequest[]
  ): Promise<PageAnalysis> {
    // 准备页面分析的上下文
    const pageRequests = allRequests.filter((r) =>
      page.apiRequests?.some((pr) => pr.url === r.url) || false
    )

    // 精简HTML（移除脚本、样式等）
    const simplifiedHtml = this.simplifyHtml(page.html)

    // 构建分析提示词（包含交互探索结果和页面结构化信息）
    const prompt = this.buildPageAnalysisPrompt(
      page.url, page.title || '', simplifiedHtml, pageRequests, page.interactionResults, page.pageStructure
    )

    // 调用AI
    // console.log(`[AIAnalyzer] 调用AI分析页面: ${page.url}, 请求数据: ${pageRequests.length} 个, 交互结果: ${page.interactionResults?.length || 0} 个`)
    const response = await this.callAI(prompt)
    // console.log(`[AIAnalyzer] AI响应长度: ${response.length}`)

    // 解析AI响应为 PageAnalysis
    const result = this.parsePageAnalysisResponse(response, page, pageRequests)
    // console.log(`[AIAnalyzer] 解析结果: 类型=${result.pageType}, 组件=${result.components.length}`)

    return result
  }

  /**
   * 构建页面分析提示词（v2 - 前端开发者视角）
   */
  private buildPageAnalysisPrompt(
    url: string,
    title: string,
    html: string,
    requests: CapturedRequest[],
    interactionResults?: Array<{ action: string; element: string; result: string; screenshot?: string }>,
    pageStructure?: PageStructure
  ): string {
    // 限制HTML长度
    const maxHtmlLength = 8000
    const truncatedHtml = html.length > maxHtmlLength
      ? html.substring(0, maxHtmlLength) + '\n... [HTML truncated]'
      : html

    // 准备请求信息
    const requestInfo = requests.slice(0, 30).map((r) => ({
      method: r.method,
      url: r.url,
      statusCode: r.statusCode,
      body: r.body ? r.body.substring(0, 500) : undefined,
      responsePreview: r.response ? r.response.substring(0, 500) : undefined
    }))

    // 准备交互探索结果
    const interactionInfo = (interactionResults && interactionResults.length > 0)
      ? `\n## 页面交互探索结果（通过自动化点击按钮、Tab、折叠面板等获得）\n\`\`\`json\n${JSON.stringify(
          interactionResults.map(r => ({
            action: r.action,
            element: r.element,
            result: r.result
          })), null, 2
        )}\n\`\`\`\n`
      : ''

    // 准备页面结构化信息（从DOM中精确提取的表格/表单/侧边栏等）
    let structureInfo = ''
    if (pageStructure) {
      const parts: string[] = []

      // 侧边栏信息（用于页面命名）
      if (pageStructure.sidebar?.activeItem) {
        parts.push(`- 当前导航菜单选中项: "${pageStructure.sidebar.activeItem}"（请用此名称作为页面的中文名称，而非通用标题）`)
        parts.push(`- 完整菜单: ${pageStructure.sidebar.items.map(i => `${i.isActive ? '【' : ''}${i.text}${i.isActive ? '】' : ''}`).join(' → ')}`)
      }

      // 表格详情
      if (pageStructure.tables.length > 0) {
        for (let i = 0; i < pageStructure.tables.length; i++) {
          const t = pageStructure.tables[i]
          const tableDesc = [`表格${i + 1}${t.title ? `「${t.title}」` : ''}: 列=[${t.columns.join(', ')}], ${t.rowCount}行数据`]
          if (t.hasCheckbox) tableDesc.push('有行选择框(checkbox)')
          if (t.hasIndex) tableDesc.push('有序号列')
          if (t.hasAction) tableDesc.push(`操作列按钮=[${t.actionButtons.join(', ')}]`)
          if (t.headerButtons.length > 0) tableDesc.push(`表格上方按钮=[${t.headerButtons.join(', ')}]`)
          if (t.hasPagination) tableDesc.push('有分页')
          parts.push(`- ${tableDesc.join(', ')}`)
        }
      }

      // 表单详情
      if (pageStructure.forms.length > 0) {
        for (let i = 0; i < pageStructure.forms.length; i++) {
          const f = pageStructure.forms[i]
          const fieldDescs = f.fields.map(field => {
            let desc = `${field.label}(${field.type})`
            if (field.required) desc += '[必填]'
            if (field.placeholder) desc += ` placeholder="${field.placeholder}"`
            if (field.options && field.options.length > 0) desc += ` 选项=[${field.options.slice(0, 5).join(', ')}]`
            return desc
          })
          parts.push(`- 表单${i + 1}${f.title ? `「${f.title}」` : ''}: 字段=[${fieldDescs.join(', ')}], 按钮=[${f.buttons.join(', ')}]`)
        }
      }

      // 统计卡片
      if (pageStructure.statCards.length > 0) {
        parts.push(`- 统计卡片: ${pageStructure.statCards.map(s => `${s.label}=${s.value}`).join(', ')}`)
      }

      // 页面头部
      if (pageStructure.pageHeader) {
        const h = pageStructure.pageHeader
        if (h.breadcrumbs.length > 0) parts.push(`- 面包屑: ${h.breadcrumbs.join(' > ')}`)
        if (h.headerActions.length > 0) parts.push(`- 页面头部按钮: [${h.headerActions.join(', ')}]`)
      }

      if (parts.length > 0) {
        structureInfo = `\n## 页面结构化数据（从DOM精确提取，非常可靠）\n${parts.join('\n')}\n`
      }
    }

    return `你是一个资深前端开发工程师，正在分析一个网站页面以便仿写开发。
请以"页面→UI组件→接口"的层次结构分析以下页面。

## 页面信息
- URL: ${url}
- 标题: ${title}
${pageStructure?.sidebar?.activeItem ? `- 导航菜单选中项: ${pageStructure.sidebar.activeItem}（请优先使用此名称作为页面标题）` : ''}

## 页面HTML（精简版）
\`\`\`html
${truncatedHtml}
\`\`\`

## 页面触发的API请求
\`\`\`json
${JSON.stringify(requestInfo, null, 2)}
\`\`\`
${interactionInfo}
${structureInfo}
## 分析要求
1. **页面概述**：用一句话描述页面的功能和用途
2. **页面类型**：从以下选择：列表页、详情页、表单页、仪表盘、登录页、设置页、混合页
3. **布局概述**：描述页面的整体布局结构（从上到下、从左到右）
4. **页面命名**：如果提供了导航菜单选中项，请使用它作为页面的中文名称
5. **组件拆解**：识别页面中的每个UI组件，包括：
   - 组件类型：table/form/modal/drawer/input/select/datepicker/tabs/tree/chart/search/pagination/button/card/list/dropdown/upload/steps/editor/switch/radio/checkbox/tag/other
   - 组件名称：给组件起一个有意义的中文名称，结合页面上下文（如"用户列表表格"而非"表格"）
   - 组件描述：描述组件的功能
   - **表格组件必须**：props中列出所有列名(columns)、是否有行选择(checkbox)、是否有操作列(action)及其按钮列表、是否有分页(pagination)
   - **表单组件必须**：props中列出所有字段(label+type)、是否必填(required)、placeholder、下拉选项(options)
   - 组件操作：如按钮点击触发弹窗、表单提交调用API等
   - 子组件：如弹窗中包含表单、Tab中包含表格等
6. **API映射**：每个组件调用的API接口

请严格按照以下JSON格式返回：
\`\`\`json
{
  "pageType": "列表页",
  "uiDescription": "用户管理列表页，提供用户数据的搜索、新增、编辑、删除功能",
  "layoutSummary": "顶部搜索表单 → 数据表格 → 底部分页",
  "components": [
    {
      "type": "form",
      "name": "搜索表单",
      "description": "用户搜索筛选表单",
      "props": [
        { "name": "username", "type": "input", "description": "用户名搜索" },
        { "name": "status", "type": "select", "description": "状态筛选" }
      ],
      "actions": [
        { "name": "查询", "type": "api_call", "description": "触发列表搜索", "targetApi": "GET /api/user/list" },
        { "name": "重置", "type": "api_call", "description": "清空筛选条件" }
      ],
      "apiUrls": ["GET /api/user/list"]
    },
    {
      "type": "table",
      "name": "用户表格",
      "description": "用户数据列表展示",
      "props": [
        { "name": "columns", "type": "array", "description": "用户名、手机号、角色、状态、创建时间、操作" },
        { "name": "checkbox", "type": "boolean", "description": "有行选择框" },
        { "name": "actionButtons", "type": "array", "description": "编辑、删除" }
      ],
      "actions": [
        { "name": "新增", "type": "modal", "description": "打开新增用户弹窗", "targetComponent": "新增用户弹窗" },
        { "name": "编辑", "type": "modal", "description": "打开编辑用户弹窗", "targetComponent": "编辑用户弹窗" },
        { "name": "删除", "type": "api_call", "description": "删除用户", "targetApi": "DELETE /api/user/{id}" }
      ],
      "apiUrls": ["GET /api/user/list"],
      "children": [
        {
          "type": "modal",
          "name": "新增/编辑用户弹窗",
          "description": "用户信息编辑弹窗",
          "props": [
            { "name": "username", "type": "input", "description": "用户名" },
            { "name": "password", "type": "input", "description": "密码（新增时必填）" },
            { "name": "roleId", "type": "select", "description": "角色选择" }
          ],
          "apiUrls": ["POST /api/user/add", "PUT /api/user/update", "GET /api/role/list"]
        }
      ]
    },
    {
      "type": "pagination",
      "name": "分页组件",
      "description": "表格分页控制",
      "apiUrls": []
    }
  ],
  "exclusiveApis": ["GET /api/user/list", "POST /api/user/add", "PUT /api/user/update", "DELETE /api/user/{id}"]
}
\`\`\`

注意：
- 组件类型要准确，使用英文标识（如 table, form, modal, input, select 等）
- 组件名称用中文，要具体有意义（如"用户列表表格"而非"表格"），优先使用导航菜单选中项来命名页面
- props 中的 type 也用组件类型标识（input/select/datepicker/switch 等）
- **表格的props必须包含**: columns(列名数组), checkbox(是否有行选择), index(是否有序号列), actionButtons(操作列按钮), pagination(是否有分页)
- **表单的props必须包含**: 每个字段的label、type(input/select/datepicker等)、required(是否必填)、placeholder、options(下拉选项)
- actions 中的 type 可选：navigate(跳转) | modal(弹窗) | drawer(抽屉) | api_call(调接口) | download(下载)
- 充分利用交互探索结果，识别隐藏的弹窗、Tab页内容等
- 充分利用页面结构化数据（表格列名、表单字段等），这些是从DOM精确提取的可靠信息
- 如果页面没有明显的API请求，仅基于HTML分析组件
- 确保返回合法JSON格式，只返回JSON，不要包含其他文字说明`
  }

  /**
   * 解析AI响应为 PageAnalysis
   */
  private parsePageAnalysisResponse(
    response: string,
    page: SitePage,
    pageRequests: CapturedRequest[]
  ): PageAnalysis {
    try {
      const parsed = this.extractJson(response)

      const components: UIComponent[] = Array.isArray(parsed.components)
        ? (parsed.components as Array<Record<string, unknown>>).map(c => this.parseComponent(c))
        : []

      const exclusiveApis: string[] = Array.isArray(parsed.exclusiveApis)
        ? parsed.exclusiveApis.map(String)
        : []

      return {
        url: page.url,
        title: page.title || page.url,
        pageType: String(parsed.pageType || '其他'),
        uiDescription: String(parsed.uiDescription || ''),
        layoutSummary: String(parsed.layoutSummary || ''),
        components,
        exclusiveApis,
        sharedComponentRefs: [],
        sharedApiRefs: [],
        depth: page.depth
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '解析失败'
      // console.log(`[AIAnalyzer] parsePageAnalysisResponse 异常: ${errorMsg}`)
      return this.createFallbackPageAnalysis(page, pageRequests)
    }
  }

  /**
   * 解析单个组件（递归处理children）
   */
  private parseComponent(obj: Record<string, unknown>): UIComponent {
    const type = String(obj.type || 'other') as UIComponentType
    const name = String(obj.name || '未命名组件')
    const description = String(obj.description || '')
    const apiUrls = Array.isArray(obj.apiUrls) ? obj.apiUrls.map(String) : []

    const props: UIComponentProp[] = Array.isArray(obj.props)
      ? (obj.props as Array<Record<string, unknown>>).map(p => ({
          name: String(p.name || ''),
          type: String(p.type || 'string'),
          description: String(p.description || '')
        }))
      : []

    const actions: UIComponentAction[] = Array.isArray(obj.actions)
      ? (obj.actions as Array<Record<string, unknown>>).map(a => ({
          name: String(a.name || ''),
          type: String(a.type || 'api_call'),
          description: String(a.description || ''),
          targetApi: a.targetApi ? String(a.targetApi) : undefined,
          targetComponent: a.targetComponent ? String(a.targetComponent) : undefined
        }))
      : []

    const children: UIComponent[] = Array.isArray(obj.children)
      ? (obj.children as Array<Record<string, unknown>>).map(c => this.parseComponent(c))
      : []

    return { type, name, description, apiUrls, props, actions, children }
  }

  /**
   * 从响应中提取JSON
   */
  private extractJson(response: string): Record<string, unknown> {
    // 尝试提取 ```json ... ``` 代码块
    let jsonStr = ''
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    } else {
      // 尝试提取 ``` ... ``` 代码块
      const codeMatch = response.match(/```\s*([\s\S]*?)\s*```/)
      if (codeMatch) {
        jsonStr = codeMatch[1].trim()
      } else {
        jsonStr = response
      }
    }

    // 尝试直接解析
    try {
      return JSON.parse(jsonStr) as Record<string, unknown>
    } catch {
      // 找第一个 { 到最后一个 }
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(jsonStr.substring(start, end + 1)) as Record<string, unknown>
      }
      throw new Error('无法解析JSON')
    }
  }

  /**
   * 创建回退的PageAnalysis（当AI分析失败时）
   */
  private createFallbackPageAnalysis(page: SitePage, allRequests: CapturedRequest[]): PageAnalysis {
    const pageRequests = allRequests.filter(r =>
      page.apiRequests?.some(pr => pr.url === r.url) || false
    )

    // 从HTML中检测基本组件
    const components: UIComponent[] = []
    const html = page.html || ''
    const text = `${page.title || ''} ${page.url} ${html}`

    // 检测表格
    if (/table|表格|list|列表|data-grid/i.test(text)) {
      components.push({
        type: 'table',
        name: '数据表格',
        description: '数据列表展示',
        apiUrls: pageRequests.filter(r => r.method === 'GET').map(r => r.method + ' ' + new URL(r.url).pathname).slice(0, 3)
      })
    }

    // 检测表单
    if (/form|表单|input|编辑/i.test(text)) {
      components.push({
        type: 'form',
        name: '数据表单',
        description: '数据录入和编辑',
        apiUrls: pageRequests.filter(r => ['POST', 'PUT'].includes(r.method)).map(r => r.method + ' ' + new URL(r.url).pathname).slice(0, 3)
      })
    }

    // 检测搜索
    if (/search|搜索|query|查询/i.test(text)) {
      components.push({
        type: 'search',
        name: '搜索组件',
        description: '数据搜索和筛选',
        apiUrls: []
      })
    }

    // 检测弹窗
    if (/modal|弹窗|dialog|对话框/i.test(text)) {
      components.push({
        type: 'modal',
        name: '弹窗组件',
        description: '弹窗交互',
        apiUrls: []
      })
    }

    // 如果没有检测到任何组件，添加一个通用组件
    if (components.length === 0) {
      components.push({
        type: 'other',
        name: '页面内容',
        description: '页面主要内容区域',
        apiUrls: pageRequests.map(r => r.method + ' ' + new URL(r.url).pathname).slice(0, 5)
      })
    }

    // 检测页面类型
    let pageType = '其他'
    if (/list|列表|table|表格/i.test(text)) pageType = '列表页'
    else if (/detail|详情|info/i.test(text)) pageType = '详情页'
    else if (/login|登录|signin/i.test(text)) pageType = '登录页'
    else if (/dashboard|仪表盘|overview|概览/i.test(text)) pageType = '仪表盘'
    else if (/setting|设置|config|配置/i.test(text)) pageType = '设置页'
    else if (/form|表单/i.test(text)) pageType = '表单页'

    return {
      url: page.url,
      title: page.title || page.url,
      pageType,
      uiDescription: `${page.title || '页面'} - ${pageType}`,
      layoutSummary: '（本地规则分析，可能不完整）',
      components,
      exclusiveApis: pageRequests.map(r => r.method + ' ' + new URL(r.url).pathname),
      sharedComponentRefs: [],
      sharedApiRefs: [],
      depth: page.depth
    }
  }

  /**
   * 从多个PageAnalysis中识别公共组件和公用接口
   */
  private identifySharedPatterns(
    pageAnalyses: PageAnalysis[]
  ): { sharedComponents: SharedComponent[]; sharedApis: SharedApi[] } {
    // === 识别公共组件 ===
    // 收集所有组件（递归展开children）
    const componentOccurrences = new Map<string, { component: UIComponent; pages: Set<string> }>()

    const collectComponents = (component: UIComponent, pageUrl: string) => {
      const key = `${component.type}::${component.name}`
      if (componentOccurrences.has(key)) {
        componentOccurrences.get(key)!.pages.add(pageUrl)
      } else {
        componentOccurrences.set(key, { component, pages: new Set([pageUrl]) })
      }
      // 递归处理子组件
      if (component.children) {
        for (const child of component.children) {
          collectComponents(child, pageUrl)
        }
      }
    }

    for (const pa of pageAnalyses) {
      for (const comp of pa.components) {
        collectComponents(comp, pa.url)
      }
    }

    // 过滤出出现在 >=2 个页面的组件
    const sharedComponents: SharedComponent[] = []
    for (const [, { component, pages }] of componentOccurrences) {
      if (pages.size >= 2) {
        sharedComponents.push({
          name: component.name,
          type: component.type,
          description: component.description,
          pages: Array.from(pages),
          apiUrls: component.apiUrls,
          commonProps: component.props
        })
      }
    }

    // === 识别公用接口 ===
    const apiOccurrences = new Map<string, { apiUrl: string; pages: Set<string>; description: string }>()

    const collectApis = (component: UIComponent, pageUrl: string) => {
      for (const apiUrl of component.apiUrls) {
        // 标准化API URL（去掉查询参数，提取method + pathname）
        const normalized = this.normalizeApiUrl(apiUrl)
        if (apiOccurrences.has(normalized)) {
          apiOccurrences.get(normalized)!.pages.add(pageUrl)
        } else {
          apiOccurrences.set(normalized, { apiUrl: normalized, pages: new Set([pageUrl]), description: '' })
        }
      }
      if (component.children) {
        for (const child of component.children) {
          collectApis(child, pageUrl)
        }
      }
    }

    for (const pa of pageAnalyses) {
      for (const comp of pa.components) {
        collectApis(comp, pa.url)
      }
      // 也收集exclusiveApis
      for (const apiUrl of pa.exclusiveApis) {
        const normalized = this.normalizeApiUrl(apiUrl)
        if (apiOccurrences.has(normalized)) {
          apiOccurrences.get(normalized)!.pages.add(pa.url)
        } else {
          apiOccurrences.set(normalized, { apiUrl: normalized, pages: new Set([pa.url]), description: '' })
        }
      }
    }

    // 过滤出被 >=2 个页面调用的接口
    const sharedApis: SharedApi[] = []
    for (const [, { apiUrl, pages }] of apiOccurrences) {
      if (pages.size >= 2) {
        // 提取method和path
        const parts = apiUrl.split(' ')
        const method = parts.length > 1 ? parts[0] : 'GET'
        const url = parts.length > 1 ? parts[1] : parts[0]

        sharedApis.push({
          url,
          method,
          description: this.guessApiDescription(new URL(url, 'http://localhost').pathname),
          pages: Array.from(pages)
        })
      }
    }

    return { sharedComponents, sharedApis }
  }

  /**
   * 标记每个页面的公共引用
   */
  private markSharedReferences(
    pageAnalyses: PageAnalysis[],
    sharedComponents: SharedComponent[],
    sharedApis: SharedApi[]
  ): void {
    for (const pa of pageAnalyses) {
      // 标记公共组件引用
      const componentNames = new Set<string>()
      const collectNames = (comp: UIComponent) => {
        componentNames.add(`${comp.type}::${comp.name}`)
        if (comp.children) comp.children.forEach(collectNames)
      }
      pa.components.forEach(collectNames)

      pa.sharedComponentRefs = sharedComponents
        .filter(sc => componentNames.has(`${sc.type}::${sc.name}`) && sc.pages.includes(pa.url))
        .map(sc => sc.name)

      // 标记公共接口引用
      const pageApiUrls = new Set<string>()
      const collectUrls = (comp: UIComponent) => {
        comp.apiUrls.forEach(u => pageApiUrls.add(this.normalizeApiUrl(u)))
        if (comp.children) comp.children.forEach(collectUrls)
      }
      pa.components.forEach(collectUrls)
      pa.exclusiveApis.forEach(u => pageApiUrls.add(this.normalizeApiUrl(u)))

      pa.sharedApiRefs = sharedApis
        .filter(sa => pageApiUrls.has(this.normalizeApiUrl(sa.method + ' ' + sa.url)) && sa.pages.includes(pa.url))
        .map(sa => sa.method + ' ' + sa.url)

      // 更新exclusiveApis：排除公共接口
      const sharedApiNormalized = new Set(sharedApis.map(sa => this.normalizeApiUrl(sa.method + ' ' + sa.url)))
      pa.exclusiveApis = pa.exclusiveApis.filter(a => !sharedApiNormalized.has(this.normalizeApiUrl(a)))
    }
  }

  /**
   * 标准化API URL（用于去重比较）
   */
  private normalizeApiUrl(apiUrl: string): string {
    // 去掉查询参数，保留 method + pathname
    const parts = apiUrl.split(' ')
    let method = 'GET'
    let urlStr = apiUrl
    if (parts.length > 1 && /^(GET|POST|PUT|DELETE|PATCH)$/i.test(parts[0])) {
      method = parts[0].toUpperCase()
      urlStr = parts[1]
    }
    try {
      const u = new URL(urlStr, 'http://localhost')
      return `${method} ${u.pathname}`
    } catch {
      // 如果不是完整URL，去掉查询参数
      const path = urlStr.split('?')[0]
      return `${method} ${path}`
    }
  }

  /**
   * 创建本地规则的PageAnalysis
   */
  private createLocalPageAnalysis(
    page: SitePage,
    pageApis: ApiInterface[],
    allRequests: CapturedRequest[]
  ): PageAnalysis {
    // 从HTML中检测组件
    const components: UIComponent[] = []
    const html = page.html || ''
    const title = page.title || ''
    const url = page.url
    const text = `${title} ${url} ${html}`

    // 检测表格
    if (/table|表格|data-grid/i.test(text)) {
      const tableApis = pageApis.filter(a => a.method === 'GET').map(a => a.url)
      components.push({
        type: 'table',
        name: '数据表格',
        description: '数据列表展示和管理',
        apiUrls: tableApis.slice(0, 3),
        props: [{ name: 'columns', type: 'array', description: '表格列定义' }]
      })
    }

    // 检测表单
    if (/form|表单|input/i.test(text)) {
      const formApis = pageApis.filter(a => ['POST', 'PUT'].includes(a.method)).map(a => a.url)
      components.push({
        type: 'form',
        name: '数据表单',
        description: '数据录入和编辑表单',
        apiUrls: formApis.slice(0, 3)
      })
    }

    // 检测搜索
    if (/search|搜索|query|查询/i.test(text)) {
      components.push({
        type: 'search',
        name: '搜索组件',
        description: '数据搜索和筛选',
        apiUrls: []
      })
    }

    // 检测弹窗
    if (/modal|弹窗|dialog|对话框/i.test(text)) {
      components.push({
        type: 'modal',
        name: '弹窗组件',
        description: '弹窗和对话框交互',
        apiUrls: []
      })
    }

    // 检测图表
    if (/chart|图表|echarts|d3|graph/i.test(text)) {
      components.push({
        type: 'chart',
        name: '图表组件',
        description: '数据可视化图表',
        apiUrls: pageApis.filter(a => a.method === 'GET').map(a => a.url).slice(0, 2)
      })
    }

    // 检测树形
    if (/tree|树|目录/i.test(text)) {
      components.push({
        type: 'tree',
        name: '树形组件',
        description: '树形结构数据展示',
        apiUrls: pageApis.filter(a => /tree|menu|nav/i.test(a.url)).map(a => a.url).slice(0, 2)
      })
    }

    // 检测上传
    if (/upload|上传|import|导入/i.test(text)) {
      components.push({
        type: 'upload',
        name: '上传组件',
        description: '文件上传功能',
        apiUrls: pageApis.filter(a => /upload|import/i.test(a.url)).map(a => a.url).slice(0, 2)
      })
    }

    // 检测下载/导出
    if (/download|下载|export|导出/i.test(text)) {
      components.push({
        type: 'button',
        name: '导出按钮',
        description: '数据导出功能',
        apiUrls: pageApis.filter(a => /download|export/i.test(a.url)).map(a => a.url).slice(0, 2)
      })
    }

    // 检测分页
    if (/page|分页|pager|pagination/i.test(text)) {
      components.push({
        type: 'pagination',
        name: '分页组件',
        description: '数据分页控制',
        apiUrls: []
      })
    }

    // 检测Tab标签页
    if (/tab|标签/i.test(text)) {
      components.push({
        type: 'tabs',
        name: '标签页组件',
        description: '标签页切换',
        apiUrls: []
      })
    }

    // 如果没有检测到任何组件
    if (components.length === 0) {
      components.push({
        type: 'other',
        name: '页面内容',
        description: '页面主要内容区域',
        apiUrls: pageApis.map(a => a.url).slice(0, 5)
      })
    }

    // 检测页面类型
    let pageType = '其他'
    if (/list|列表|table|表格/i.test(text)) pageType = '列表页'
    else if (/detail|详情|info|信息查看/i.test(text)) pageType = '详情页'
    else if (/login|登录|signin/i.test(text)) pageType = '登录页'
    else if (/register|注册/i.test(text)) pageType = '注册页'
    else if (/dashboard|仪表盘|overview|概览/i.test(text)) pageType = '仪表盘'
    else if (/setting|设置|config|配置/i.test(text)) pageType = '设置页'
    else if (/form|表单/i.test(text)) pageType = '表单页'

    return {
      url,
      title: title || url,
      pageType,
      uiDescription: `${title || '页面'} - ${pageType}`,
      layoutSummary: '（本地规则分析，可能不完整）',
      components,
      exclusiveApis: pageApis.map(a => a.url),
      sharedComponentRefs: [],
      sharedApiRefs: [],
      depth: page.depth
    }
  }

  // ==================== 以下为保留的兼容性方法 ====================

  /**
   * 从网络请求中提取API接口信息（兼容性保留）
   */
  private extractApisFromRequests(requests: CapturedRequest[]): ApiInterface[] {
    const apiMap = new Map<string, ApiInterface>()
    const apiRequests = requests.filter((r) => r.isApiRequest)

    // console.log(`[AIAnalyzer] 共 ${apiRequests.length} 个API请求待分析`)

    for (const req of apiRequests) {
      try {
        const url = new URL(req.url)
        const pathname = url.pathname
        if (this.isStaticResource(pathname)) continue

        const key = `${req.method}_${url.origin}${pathname}`
        if (apiMap.has(key)) {
          const existing = apiMap.get(key)!
          existing.frequency = (existing.frequency || 1) + 1
          continue
        }

        const api: ApiInterface = {
          url: `${url.origin}${pathname}`,
          method: req.method || 'GET',
          description: this.guessApiDescription(pathname, req),
          params: this.extractParams(req),
          returnValue: req.response ? this.describeResponse(req.response) : undefined,
          exampleBody: req.body ? req.body.substring(0, 500) : undefined,
          exampleResponse: req.response ? req.response.substring(0, 500) : undefined,
          sourcePages: [],
          frequency: 1
        }

        apiMap.set(key, api)
      } catch {
        // 无效URL，跳过
      }
    }

    return Array.from(apiMap.values())
  }

  /**
   * 从页面HTML中提取功能模块（兼容性保留）
   */
  private extractModulesFromPages(pages: SitePage[], apis: ApiInterface[]): FunctionModule[] {
    const modules: FunctionModule[] = []
    const moduleSet = new Set<string>()

    for (const page of pages) {
      const html = page.html || ''
      const title = page.title || ''
      const url = page.url || ''
      const detectedModules = this.detectModulesFromHtml(html, title, url)

      for (const mod of detectedModules) {
        const key = mod.name
        if (!moduleSet.has(key)) {
          moduleSet.add(key)
          modules.push({
            ...mod,
            pages: [url],
            interfaces: this.findRelatedApis(url, apis)
          })
        } else {
          const existing = modules.find((m) => m.name === key)
          if (existing && !existing.pages.includes(url)) {
            existing.pages.push(url)
          }
        }
      }
    }

    if (modules.length === 0 && pages.length > 0) {
      modules.push({
        name: '网站导航',
        description: '网站页面导航和路由系统',
        pages: pages.map((p) => p.url),
        interfaces: [],
        category: '导航',
        confidence: 0.6
      })
    }

    return modules
  }

  /**
   * 从单个页面HTML中检测功能模块（兼容性保留）
   */
  private detectModulesFromHtml(
    html: string, title: string, url: string
  ): Array<{ name: string; description: string; category: string; confidence: number }> {
    const modules: Array<{ name: string; description: string; category: string; confidence: number }> = []
    const checks: Array<{ patterns: RegExp[]; name: string; description: string; category: string; confidence: number }> = [
      { patterns: [/login|登录|signin|sign-in/i], name: '用户登录', description: '用户身份认证和登录功能', category: '认证', confidence: 0.9 },
      { patterns: [/register|注册|signup|sign-up/i], name: '用户注册', description: '新用户注册功能', category: '认证', confidence: 0.9 },
      { patterns: [/search|搜索|query|查询/i], name: '搜索查询', description: '数据搜索和查询功能', category: '搜索', confidence: 0.8 },
      { patterns: [/table|表格|list|列表|data-grid/i], name: '数据列表', description: '数据列表展示和管理', category: '数据展示', confidence: 0.8 },
      { patterns: [/form|表单|input|编辑/i], name: '表单编辑', description: '数据录入和编辑表单', category: '表单', confidence: 0.7 },
      { patterns: [/upload|上传|import|导入/i], name: '文件上传', description: '文件上传和导入功能', category: '文件', confidence: 0.8 },
      { patterns: [/download|下载|export|导出/i], name: '文件下载', description: '文件下载和导出功能', category: '文件', confidence: 0.8 },
      { patterns: [/dashboard|仪表盘|overview|概览/i], name: '仪表盘', description: '数据概览和仪表盘展示', category: '数据展示', confidence: 0.8 },
      { patterns: [/chart|图表|echarts|d3|graph/i], name: '图表展示', description: '数据可视化图表', category: '数据展示', confidence: 0.8 },
      { patterns: [/menu|菜单|nav|导航|sidebar/i], name: '导航菜单', description: '系统导航菜单', category: '导航', confidence: 0.7 },
      { patterns: [/user|用户|profile|个人/i], name: '用户管理', description: '用户信息管理功能', category: '用户', confidence: 0.7 },
      { patterns: [/role|角色|permission|权限/i], name: '权限管理', description: '角色和权限管理', category: '设置', confidence: 0.8 },
      { patterns: [/config|配置|setting|设置/i], name: '系统配置', description: '系统设置和配置管理', category: '设置', confidence: 0.7 },
      { patterns: [/log|日志|audit|审计/i], name: '日志管理', description: '系统日志和审计功能', category: '设置', confidence: 0.7 },
      { patterns: [/message|消息|notification|通知/i], name: '消息通知', description: '消息和通知管理', category: '消息', confidence: 0.7 },
      { patterns: [/detail|详情|info|信息查看/i], name: '详情查看', description: '数据详情查看功能', category: '数据展示', confidence: 0.6 },
      { patterns: [/modal|弹窗|dialog|对话框|popup/i], name: '弹窗交互', description: '弹窗和对话框交互', category: '表单', confidence: 0.5 },
    ]

    const text = `${title} ${url} ${html}`
    for (const check of checks) {
      if (check.patterns.some((p) => p.test(text))) {
        modules.push({ name: check.name, description: check.description, category: check.category, confidence: check.confidence })
      }
    }
    return modules
  }

  /**
   * 查找与页面相关的API（兼容性保留）
   */
  private findRelatedApis(pageUrl: string, apis: ApiInterface[]): string[] {
    try {
      const pageUrlObj = new URL(pageUrl)
      const pagePath = pageUrlObj.pathname
      return apis.filter((api) => {
        try {
          const apiUrl = new URL(api.url)
          if (apiUrl.origin === pageUrlObj.origin) return true
          const pageSegments = pagePath.split('/').filter(Boolean)
          const apiSegments = apiUrl.pathname.split('/').filter(Boolean)
          return pageSegments.filter((s) => apiSegments.includes(s)).length >= 1
        } catch { return false }
      }).map((api) => api.url).slice(0, 20)
    } catch { return apis.map((api) => api.url).slice(0, 20) }
  }

  /**
   * 判断API是否与页面相关
   */
  private isApiRelatedToPage(pageUrl: string, apiUrl: string): boolean {
    try {
      const pageUrlObj = new URL(pageUrl, 'http://localhost')
      const apiUrlObj = new URL(apiUrl, 'http://localhost')
      const pageSegments = pageUrlObj.pathname.split('/').filter(Boolean)
      const apiSegments = apiUrlObj.pathname.split('/').filter(Boolean)
      return pageSegments.filter(s => apiSegments.includes(s)).length >= 1
    } catch { return false }
  }

  /**
   * 判断是否为静态资源
   */
  private isStaticResource(pathname: string): boolean {
    const staticExts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.json']
    const lower = pathname.toLowerCase()
    return staticExts.some((ext) => lower.endsWith(ext))
  }

  /**
   * 根据URL路径和请求信息猜测API描述
   */
  private guessApiDescription(pathname: string, req?: CapturedRequest): string {
    const segments = pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1] || ''

    const patterns: Array<{ match: RegExp; desc: () => string }> = [
      { match: /login|signin|auth/i, desc: () => '用户登录认证' },
      { match: /logout|signout/i, desc: () => '用户登出' },
      { match: /register|signup/i, desc: () => '用户注册' },
      { match: /user|profile|account/i, desc: () => '用户信息管理' },
      { match: /list|query|search/i, desc: () => '列表查询' },
      { match: /detail|info|get/i, desc: () => '详情获取' },
      { match: /add|create|new/i, desc: () => '新增数据' },
      { match: /update|edit|modify/i, desc: () => '更新数据' },
      { match: /delete|remove|drop/i, desc: () => '删除数据' },
      { match: /upload|import/i, desc: () => '上传/导入' },
      { match: /download|export/i, desc: () => '下载/导出' },
      { match: /menu|nav|tree/i, desc: () => '菜单/导航数据' },
      { match: /config|setting/i, desc: () => '配置管理' },
      { match: /dict|dictionary|code/i, desc: () => '字典/编码数据' },
      { match: /dept|department|org/i, desc: () => '组织/部门数据' },
      { match: /role|permission/i, desc: () => '角色/权限管理' },
      { match: /log|audit/i, desc: () => '日志/审计' },
      { match: /stat|report|chart/i, desc: () => '统计/报表' },
      { match: /file|attach/i, desc: () => '文件管理' },
      { match: /message|notify/i, desc: () => '消息/通知' },
      { match: /token|refresh/i, desc: () => 'Token管理' },
      { match: /page|pager/i, desc: () => '分页查询' },
      { match: /count|total/i, desc: () => '统计计数' },
      { match: /check|validate|verify/i, desc: () => '数据校验' },
    ]

    for (const { match, desc } of patterns) {
      if (pathname.match(match)) return desc()
    }

    const method = (req?.method || 'GET').toUpperCase()
    if (method === 'GET') return `获取 ${lastSegment || '数据'}`
    if (method === 'POST') return `提交 ${lastSegment || '数据'}`
    if (method === 'PUT') return `更新 ${lastSegment || '数据'}`
    if (method === 'DELETE') return `删除 ${lastSegment || '数据'}`
    return `API: ${pathname}`
  }

  /**
   * 从请求中提取参数
   */
  private extractParams(req: CapturedRequest): Array<{ name: string; type: string; required: boolean; description?: string }> {
    const params: Array<{ name: string; type: string; required: boolean; description?: string }> = []
    if (req.params) {
      for (const [key, value] of Object.entries(req.params)) {
        params.push({ name: key, type: this.guessParamType(value), required: true, description: '查询参数' })
      }
    }
    if (req.body) {
      try {
        const body = JSON.parse(req.body)
        if (typeof body === 'object' && body !== null) {
          for (const [key, value] of Object.entries(body)) {
            params.push({ name: key, type: this.guessParamType(String(value)), required: true, description: '请求体参数' })
          }
        }
      } catch { /* 非JSON body */ }
    }
    return params
  }

  /**
   * 根据值猜测参数类型
   */
  private guessParamType(value: string): string {
    if (!value) return 'string'
    if (/^\d+$/.test(value)) return 'number'
    if (/^(true|false)$/i.test(value)) return 'boolean'
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
    if (/^[{[]/.test(value)) return 'object'
    return 'string'
  }

  /**
   * 描述响应内容
   */
  private describeResponse(response: string): string {
    if (!response) return '无响应'
    try {
      const parsed = JSON.parse(response)
      if (typeof parsed === 'object' && parsed !== null) {
        return `JSON对象，包含字段: ${Object.keys(parsed).slice(0, 10).join(', ')}`
      }
    } catch { /* 非JSON */ }
    return response.substring(0, 200)
  }

  /**
   * 调用AI服务
   */
  private async callAI(prompt: string): Promise<string> {
    const aiConfig = this.config.aiConfig
    const baseUrl = aiConfig.baseUrl.replace(/\/+$/, '')
    const url = `${baseUrl}/v1/chat/completions`

    const body = {
      model: aiConfig.modelId,
      messages: [
        {
          role: 'system',
          content: '你是一个资深前端开发工程师，擅长分析网页UI结构、识别组件类型和API接口映射。请始终以JSON格式返回分析结果。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: aiConfig.temperature ?? 0.3,
      max_tokens: aiConfig.maxTokens ?? 8192
    }

    // console.log(`[AIAnalyzer] callAI: 请求 ${url}, model=${aiConfig.modelId}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorText = await response.text()
      // console.error(`[AIAnalyzer] callAI 失败 (${response.status}): ${errorText.substring(0, 500)}`)
      throw new Error(`AI服务调用失败 (${response.status}): ${errorText.substring(0, 200)}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string }
    }

    if (data.error) {
      // console.error(`[AIAnalyzer] callAI API错误: ${data.error.message}`)
      throw new Error(`AI服务错误: ${data.error.message}`)
    }

    const content = data.choices?.[0]?.message?.content
    if (!content) {
      // console.error(`[AIAnalyzer] callAI 返回空内容:`, JSON.stringify(data).substring(0, 500))
      throw new Error('AI服务返回空内容')
    }

    // console.log(`[AIAnalyzer] callAI 成功，响应长度: ${content.length}`)
    return content
  }

  /**
   * 精简HTML，移除不必要的内容
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
}
