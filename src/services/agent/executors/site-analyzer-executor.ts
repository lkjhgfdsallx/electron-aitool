/**
 * SiteAnalyzerToolExecutor - 网站分析工具执行器
 *
 * 处理 site_analyzer_start / site_analyzer_cancel 两个网站分析工具。
 * 从 agent-engine.ts 的 handleSiteAnalyzerStartTool / handleSiteAnalyzerCancelTool 拆出。
 *
 * 关键设计：activeSiteAnalyzerTaskId 从引擎闭包变量迁移到此执行器的 ToolSessionContext。
 */

import { siteAnalyzerService } from '../../site-analyzer-service'
import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult } from '../../../types'

/** 网站分析工具的会话级状态 */
interface SiteAnalyzerSessionContext extends ToolSessionContext {
  /** 当前活跃的分析任务 ID */
  activeTaskId: string | null
  /** 捕获的报告 HTML（跨工具调用共享） */
  capturedReportHtml: string
}

export class SiteAnalyzerToolExecutor implements ToolExecutor {
  readonly toolNames = ['site_analyzer_start', 'site_analyzer_cancel']

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    return {
      activeTaskId: null,
      capturedReportHtml: '',
    } as SiteAnalyzerSessionContext
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const ctx = sessionCtx as SiteAnalyzerSessionContext
    switch (toolName) {
      case 'site_analyzer_start':
        return this.handleStart(args, ctx, agentSessionCtx)
      case 'site_analyzer_cancel':
        return this.handleCancel(args, ctx)
      default:
        return { success: false, data: '', error: `SiteAnalyzerToolExecutor: 未知工具 "${toolName}"` }
    }
  }

  destroy(sessionCtx: ToolSessionContext, _agentSessionCtx: AgentSessionContext): void {
    // 清理进度监听器
    siteAnalyzerService.removeProgressListener('agent-engine')
  }

  private async handleStart(
    args: Record<string, unknown>,
    ctx: SiteAnalyzerSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const targetUrl = String(args.target_url ?? '')
    if (!targetUrl) {
      return { success: false, data: '', error: 'site_analyzer_start 工具需要 target_url 参数' }
    }

    // 构建配置
    const taskId = `sa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const loginType = String(args.login_type ?? 'manual') as 'manual' | 'password' | 'cookie'

    const config: Record<string, unknown> = {
      targetUrl,
      loginType,
      loginCredential: {},
      aiConfig: {
        baseUrl: String(args.ai_base_url ?? agentSessionCtx.resolvedConfig.baseUrl ?? ''),
        apiKey: String(args.ai_api_key ?? agentSessionCtx.resolvedConfig.apiKey ?? ''),
        modelId: String(args.ai_model_id ?? agentSessionCtx.resolvedConfig.model ?? ''),
      },
      taskId,
    }

    // 填充登录凭证
    const cred = config.loginCredential as Record<string, unknown>
    if (args.username) cred.username = String(args.username)
    if (args.password) cred.password = String(args.password)
    if (args.cookie) cred.cookie = String(args.cookie)
    if (args.token) cred.token = String(args.token)

    // 填充爬取规则
    const crawlRules: Record<string, unknown> = {}
    if (args.max_depth) crawlRules.maxDepth = Number(args.max_depth)
    if (args.max_pages) crawlRules.maxPages = Number(args.max_pages)
    if (args.url_include_patterns) crawlRules.urlIncludePatterns = args.url_include_patterns
    if (args.url_exclude_patterns) crawlRules.urlExcludePatterns = args.url_exclude_patterns
    if (args.crawl_delay) crawlRules.crawlDelay = Number(args.crawl_delay)
    if (Object.keys(crawlRules).length > 0) config.crawlRules = crawlRules

    // 填充代理和反爬虫配置
    if (args.proxy_server) {
      config.proxy = { server: String(args.proxy_server) }
    }
    const antiBot: Record<string, unknown> = {}
    if (args.user_agent) antiBot.userAgent = String(args.user_agent)
    if (args.simulate_human) antiBot.simulateHuman = Boolean(args.simulate_human)
    if (Object.keys(antiBot).length > 0) config.antiBot = antiBot

    ctx.activeTaskId = taskId

    // 注册进度监听器，将进度转为观察步骤
    siteAnalyzerService.addProgressListener('agent-engine', (progress) => {
      // 捕获报告HTML内容
      if (progress.reportHtml) {
        ctx.capturedReportHtml = progress.reportHtml
      }
      // 实时转发进度到UI层
      agentSessionCtx.callbacks.onSiteAnalyzerProgress?.({
        taskId: progress.taskId,
        type: progress.type,
        message: progress.message,
        pagesCrawled: progress.pagesCrawled,
        totalPages: progress.totalPages,
        apisFound: progress.apisFound,
        pagesAnalyzed: progress.pagesAnalyzed,
        currentUrl: progress.currentUrl,
        error: progress.error,
      })
    })

    try {
      // 启动分析
      const result = await siteAnalyzerService.startAnalysis(config as unknown as Parameters<typeof siteAnalyzerService.startAnalysis>[0])

      // 移除监听器
      siteAnalyzerService.removeProgressListener('agent-engine')
      ctx.activeTaskId = null

      // 生成摘要
      const summary = siteAnalyzerService.generateSummary(result)

      // 附加API接口和模块的详细JSON数据
      const analysisData = {
        modules: result.modules,
        apis: result.apis.map(a => ({
          url: a.url,
          method: a.method,
          description: a.description,
          params: a.params,
          returnValue: a.returnValue,
          frequency: a.frequency,
        })),
        pagesCount: result.pages.length,
        requestsCount: result.requests.length,
        reportAvailable: !!(ctx.capturedReportHtml || result.reportHtml),
      }
      let fullData = summary
      fullData += `\n\n[ANALYSIS_DATA]\n${JSON.stringify(analysisData, null, 2)}\n[/ANALYSIS_DATA]`

      // 将报告HTML通过回调传递给UI层
      const reportHtml = ctx.capturedReportHtml || result.reportHtml
      if (reportHtml && agentSessionCtx.callbacks.onReportReady) {
        agentSessionCtx.callbacks.onReportReady(reportHtml)
      }

      return {
        success: true,
        data: fullData,
      }
    } catch (error) {
      siteAnalyzerService.removeProgressListener('agent-engine')
      ctx.activeTaskId = null
      const errorMsg = error instanceof Error ? error.message : '网站分析失败'
      return { success: false, data: '', error: errorMsg }
    }
  }

  private async handleCancel(
    args: Record<string, unknown>,
    ctx: SiteAnalyzerSessionContext,
  ): Promise<ToolExecuteResult> {
    const taskId = String(args.task_id ?? ctx.activeTaskId ?? '')
    if (!taskId) {
      return { success: false, data: '', error: '没有活跃的分析任务可取消' }
    }

    const cancelled = await siteAnalyzerService.cancelAnalysis(taskId)
    if (cancelled) {
      ctx.activeTaskId = null
      return { success: true, data: `分析任务 ${taskId} 已取消` }
    }
    return { success: false, data: '', error: `无法取消任务 ${taskId}，任务可能已完成或不存在` }
  }
}
