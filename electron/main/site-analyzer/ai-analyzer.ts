/**
 * AI分析服务
 * 使用用户提供的AI服务分析网页内容和网络请求
 */

import type {
  SiteAnalyzerConfig,
  SiteAnalyzerAIConfig,
  SitePage,
  CapturedRequest,
  FunctionModule,
  ApiInterface,
  SiteAnalyzerProgress
} from './types'

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
   * 分析所有页面和请求
   */
  async analyzeAll(
    pages: SitePage[],
    requests: CapturedRequest[]
  ): Promise<{ modules: FunctionModule[]; apis: ApiInterface[] }> {
    const allModules: FunctionModule[] = []
    const allApis: ApiInterface[] = []

    // 第一步：逐页面分析
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
        const result = await this.analyzePage(page, requests)
        allModules.push(...result.modules)
        allApis.push(...result.apis)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'AI分析失败'
        this.onProgress({
          taskId: this.config.taskId,
          type: 'error',
          message: `AI分析页面失败: ${page.url} - ${errorMsg}`,
          error: errorMsg
        })
      }

      // 避免AI服务限流
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // 第二步：合并和去重
    const mergedModules = this.mergeModules(allModules)
    const mergedApis = this.mergeApis(allApis)

    // 第三步：全局分析 - 建立模块与API的关联
    this.onProgress({
      taskId: this.config.taskId,
      type: 'ai_analyzing_page',
      message: '正在进行全局关联分析...'
    })

    try {
      const globalResult = await this.globalAnalysis(mergedModules, mergedApis)
      return globalResult
    } catch {
      // 降级：使用本地合并的结果
      return { modules: mergedModules, apis: mergedApis }
    }
  }

  /**
   * 分析单个页面
   */
  private async analyzePage(
    page: SitePage,
    allRequests: CapturedRequest[]
  ): Promise<{ modules: FunctionModule[]; apis: ApiInterface[] }> {
    // 准备页面分析的上下文
    const pageRequests = allRequests.filter((r) =>
      page.apiRequests?.some((pr) => pr.url === r.url) || false
    )

    // 精简HTML（移除脚本、样式等）
    const simplifiedHtml = this.simplifyHtml(page.html)

    // 构建分析提示词
    const prompt = this.buildPageAnalysisPrompt(page.url, page.title || '', simplifiedHtml, pageRequests)

    // 调用AI
    const response = await this.callAI(prompt)

    // 解析AI响应
    return this.parseAnalysisResponse(response, page.url)
  }

  /**
   * 构建页面分析提示词
   */
  private buildPageAnalysisPrompt(
    url: string,
    title: string,
    html: string,
    requests: CapturedRequest[]
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

    return `你是一个网站功能分析专家。请分析以下网页内容和网络请求，识别功能模块和API接口。

## 页面信息
- URL: ${url}
- 标题: ${title}

## 页面HTML（精简版）
\`\`\`html
${truncatedHtml}
\`\`\`

## 页面触发的API请求
\`\`\`json
${JSON.stringify(requestInfo, null, 2)}
\`\`\`

## 分析要求
1. 识别该页面包含的功能模块（如登录、搜索、列表展示、详情查看等）
2. 识别页面中的API接口，分析其用途、参数和返回值
3. 建立功能模块与API接口的关联关系

请严格按照以下JSON格式返回：
\`\`\`json
{
  "modules": [
    {
      "name": "模块名称",
      "description": "模块描述",
      "category": "功能类别（如：认证、搜索、数据展示、表单、导航等）",
      "confidence": 0.9
    }
  ],
  "apis": [
    {
      "url": "API完整URL",
      "method": "GET/POST/PUT/DELETE",
      "description": "接口用途描述",
      "params": [
        { "name": "参数名", "type": "类型", "required": true/false, "description": "描述" }
      ],
      "returnValue": "返回值结构描述",
      "exampleBody": "示例请求体（如有）",
      "exampleResponse": "示例响应（截取前500字符）"
    }
  ]
}
\`\`\`

注意：
- 只分析有意义的功能模块和API接口，忽略静态资源请求
- API接口描述要具体说明用途，不要泛泛而谈
- 如果页面没有明显的API请求，仅基于HTML分析功能模块
- 确保返回的是合法JSON格式`
  }

  /**
   * 全局分析 - 建立模块与API的关联
   */
  private async globalAnalysis(
    modules: FunctionModule[],
    apis: ApiInterface[]
  ): Promise<{ modules: FunctionModule[]; apis: ApiInterface[] }> {
    const prompt = `你是一个网站功能分析专家。以下是对一个网站的初步分析结果，包含功能模块和API接口列表。
请审查并优化这些分析结果：
1. 合并重复或相似的功能模块
2. 合并重复的API接口
3. 为每个功能模块关联对应的API接口
4. 补充缺失的功能模块描述

## 功能模块列表
\`\`\`json
${JSON.stringify(modules, null, 2)}
\`\`\`

## API接口列表
\`\`\`json
${JSON.stringify(apis.map(a => ({
  url: a.url,
  method: a.method,
  description: a.description,
  params: a.params
})), null, 2)}
\`\`\`

请返回优化后的结果，严格按照以下JSON格式：
\`\`\`json
{
  "modules": [
    {
      "name": "模块名称",
      "description": "模块描述",
      "pages": ["相关页面URL列表"],
      "interfaces": ["关联的API URL列表"],
      "category": "功能类别",
      "confidence": 0.9
    }
  ],
  "apis": [
    {
      "url": "API URL",
      "method": "方法",
      "description": "用途描述",
      "params": [{ "name": "参数名", "type": "类型", "required": true/false, "description": "描述" }],
      "returnValue": "返回值描述",
      "sourcePages": ["来源页面URL"]
    }
  ]
}
\`\`\`

只返回JSON，不要包含其他文字说明。`

    const response = await this.callAI(prompt)
    return this.parseAnalysisResponse(response)
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
          content: '你是一个专业的网站功能分析AI助手，擅长分析网页结构、识别功能模块和API接口。请始终以JSON格式返回分析结果。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: aiConfig.temperature ?? 0.3,
      max_tokens: aiConfig.maxTokens ?? 4096
    }

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
      throw new Error(`AI服务调用失败 (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('AI服务返回空内容')
    }

    return content
  }

  /**
   * 解析AI分析响应
   */
  private parseAnalysisResponse(
    response: string,
    sourcePage?: string
  ): { modules: FunctionModule[]; apis: ApiInterface[] } {
    try {
      // 尝试从响应中提取JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : response

      // 尝试直接解析，或找到第一个 { 到最后一个 }
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        const start = jsonStr.indexOf('{')
        const end = jsonStr.lastIndexOf('}')
        if (start !== -1 && end !== -1) {
          parsed = JSON.parse(jsonStr.substring(start, end + 1))
        } else {
          throw new Error('无法解析JSON')
        }
      }

      const modules: FunctionModule[] = Array.isArray(parsed.modules)
        ? (parsed.modules as Array<Record<string, unknown>>).map((m) => ({
            name: String(m.name || '未命名模块'),
            description: String(m.description || ''),
            pages: Array.isArray(m.pages) ? m.pages.map(String) : sourcePage ? [sourcePage] : [],
            interfaces: Array.isArray(m.interfaces) ? m.interfaces.map(String) : [],
            confidence: typeof m.confidence === 'number' ? m.confidence : undefined,
            category: m.category ? String(m.category) : undefined
          }))
        : []

      const apis: ApiInterface[] = Array.isArray(parsed.apis)
        ? (parsed.apis as Array<Record<string, unknown>>).map((a) => ({
            url: String(a.url || ''),
            method: String(a.method || 'GET').toUpperCase(),
            description: String(a.description || ''),
            params: Array.isArray(a.params)
              ? (a.params as Array<Record<string, unknown>>).map((p) => ({
                  name: String(p.name || ''),
                  type: String(p.type || 'string'),
                  required: Boolean(p.required),
                  description: p.description ? String(p.description) : undefined
                }))
              : undefined,
            returnValue: a.returnValue ? String(a.returnValue) : undefined,
            exampleBody: a.exampleBody ? String(a.exampleBody) : undefined,
            exampleResponse: a.exampleResponse ? String(a.exampleResponse) : undefined,
            sourcePages: sourcePage ? [sourcePage] : undefined
          }))
        : []

      return { modules, apis }
    } catch {
      // 解析失败，返回空结果
      return { modules: [], apis: [] }
    }
  }

  /**
   * 合并重复模块
   */
  private mergeModules(modules: FunctionModule[]): FunctionModule[] {
    const merged = new Map<string, FunctionModule>()

    for (const mod of modules) {
      const key = mod.name.toLowerCase()
      if (merged.has(key)) {
        const existing = merged.get(key)!
        // 合并页面列表
        for (const page of mod.pages) {
          if (!existing.pages.includes(page)) {
            existing.pages.push(page)
          }
        }
        // 合并接口列表
        for (const iface of mod.interfaces) {
          if (!existing.interfaces.includes(iface)) {
            existing.interfaces.push(iface)
          }
        }
        // 取较高的置信度
        if (mod.confidence && (!existing.confidence || mod.confidence > existing.confidence)) {
          existing.confidence = mod.confidence
        }
      } else {
        merged.set(key, { ...mod })
      }
    }

    return Array.from(merged.values())
  }

  /**
   * 合并重复API
   */
  private mergeApis(apis: ApiInterface[]): ApiInterface[] {
    const merged = new Map<string, ApiInterface>()

    for (const api of apis) {
      const key = `${api.method}_${api.url}`
      if (merged.has(key)) {
        const existing = merged.get(key)!
        // 合并来源页面
        if (api.sourcePages) {
          for (const page of api.sourcePages) {
            if (!existing.sourcePages?.includes(page)) {
              if (!existing.sourcePages) existing.sourcePages = []
              existing.sourcePages.push(page)
            }
          }
        }
        // 合并参数（补充缺失的参数描述）
        if (api.params && existing.params) {
          for (const param of api.params) {
            const existingParam = existing.params.find((p) => p.name === param.name)
            if (!existingParam) {
              existing.params.push(param)
            } else if (param.description && !existingParam.description) {
              existingParam.description = param.description
            }
          }
        }
        // 增加频率
        existing.frequency = (existing.frequency || 1) + 1
      } else {
        merged.set(key, { ...api, frequency: 1 })
      }
    }

    return Array.from(merged.values())
  }

  /**
   * 精简HTML，移除不必要的内容
   */
  private simplifyHtml(html: string): string {
    return html
      // 移除script标签和内容
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // 移除style标签和内容
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // 移除注释
      .replace(/<!--[\s\S]*?-->/g, '')
      // 移除SVG
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      // 移除多余空白
      .replace(/\s+/g, ' ')
      .trim()
  }
}
