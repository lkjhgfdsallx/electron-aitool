// ==================== 配置层级可视化组件 ====================
// 直观展示 Global → Provider → Agent 的模型参数覆盖关系

import { useState, useMemo } from 'react'
import {
  Globe, Server, Bot, ArrowDown, Check, ChevronDown, ChevronUp,
  Layers, Zap
} from 'lucide-react'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import { useAgentStore } from '../../stores/agent-store'

/** 覆盖来源标记 */
type OverrideSource = 'global' | 'provider' | 'agent'

interface ResolvedParam {
  label: string
  value: string
  source: OverrideSource
  sourceName: string
}

export function ConfigHierarchyView() {
  const globalConfig = useGlobalConfigStore()
  const { providers } = useAIProviderStore()
  const { agents } = useAgentStore()
  const [expanded, setExpanded] = useState(true)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  // 解析最终生效的配置
  const resolved = useMemo(() => {
    const agent = selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : undefined
    const providerId = agent?.modelConfig?.providerId || globalConfig.activeProviderId
    const provider = providers.find((p) => p.id === providerId)
    const defaultProvider = providers.find((p) => p.isDefault) || providers[0]

    const effectiveProviderId = providerId || defaultProvider?.id
    const effectiveProvider = providers.find((p) => p.id === effectiveProviderId)

    const params: ResolvedParam[] = [
      {
        label: 'AI 源',
        value: effectiveProvider?.name || '未配置',
        source: agent?.modelConfig?.providerId ? 'agent' : 'global',
        sourceName: agent?.modelConfig?.providerId
          ? (agent?.name || 'Agent')
          : '全局默认',
      },
      {
        label: '模型',
        value:
          agent?.modelConfig?.modelId ||
          effectiveProvider?.defaultModelId ||
          globalConfig.defaultModel ||
          '未选择',
        source: agent?.modelConfig?.modelId
          ? 'agent'
          : effectiveProvider?.defaultModelId
            ? 'provider'
            : 'global',
        sourceName: agent?.modelConfig?.modelId
          ? (agent?.name || 'Agent')
          : effectiveProvider?.defaultModelId
            ? (effectiveProvider?.name || 'Provider')
            : '全局默认',
      },
      {
        label: 'Temperature',
        value: String(
          agent?.modelConfig?.temperature ??
            globalConfig.temperature
        ),
        source: agent?.modelConfig?.temperature !== undefined ? 'agent' : 'global',
        sourceName: agent?.modelConfig?.temperature !== undefined
          ? (agent?.name || 'Agent')
          : '全局默认',
      },
      {
        label: 'Max Tokens',
        value: String(
          agent?.modelConfig?.maxTokens ??
            globalConfig.maxTokens
        ),
        source: agent?.modelConfig?.maxTokens !== undefined ? 'agent' : 'global',
        sourceName: agent?.modelConfig?.maxTokens !== undefined
          ? (agent?.name || 'Agent')
          : '全局默认',
      },
    ]

    return params
  }, [selectedAgentId, agents, providers, globalConfig])

  // 来源颜色映射
  const sourceColors: Record<OverrideSource, { bg: string; text: string; border: string }> = {
    global: {
      bg: 'bg-accent-50 dark:bg-accent-900/20',
      text: 'text-accent-600 dark:text-accent-400',
      border: 'border-accent-200 dark:border-accent-800/40',
    },
    provider: {
      bg: 'bg-accent-50 dark:bg-accent-900/20',
      text: 'text-accent-600 dark:text-accent-400',
      border: 'border-accent-200 dark:border-accent-800/40',
    },
    agent: {
      bg: 'bg-accent-50 dark:bg-accent-900/20',
      text: 'text-accent-600 dark:text-accent-400',
      border: 'border-accent-200 dark:border-accent-800/40',
    },
  }

  const sourceIcons: Record<OverrideSource, typeof Globe> = {
    global: Globe,
    provider: Server,
    agent: Bot,
  }

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-700/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500/20 to-accent-600/20 flex items-center justify-center">
            <Layers size={16} className="text-accent-500" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-surface-800 dark:text-surface-200">
              配置层级关系
            </h3>
            <p className="text-xs text-muted mt-0.5">
              查看全局 → Provider → Agent 的参数覆盖关系
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-muted" />
        ) : (
          <ChevronDown size={16} className="text-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Agent 选择器 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted flex-shrink-0">查看视角：</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="flex-1 text-xs bg-surface-100 dark:bg-surface-700/60 border border-surface-200 dark:border-surface-600 rounded-lg px-3 py-1.5 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              <option value="">全局默认（无 Agent 覆盖）</option>
              {agents.filter((a) => a.enabled).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar} {agent.name}
                  {agent.modelConfig?.providerId || agent.modelConfig?.modelId
                    ? ' (有自定义配置)'
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 层级图 */}
          <div className="space-y-2">
            {/* 全局层 */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-accent-200/60 dark:border-accent-800/30 bg-accent-50/50 dark:bg-accent-900/10">
              <div className="w-7 h-7 rounded-md bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Globe size={14} className="text-accent-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-accent-700 dark:text-accent-400 mb-1.5">全局默认</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-[11px] text-muted">AI 源: <span className="text-surface-600 dark:text-surface-400">{providers.find(p => p.id === globalConfig.activeProviderId)?.name || '未设置'}</span></span>
                  <span className="text-[11px] text-muted">模型: <span className="text-surface-600 dark:text-surface-400">{globalConfig.defaultModel || '未设置'}</span></span>
                  <span className="text-[11px] text-muted">Temperature: <span className="font-mono text-surface-600 dark:text-surface-400">{globalConfig.temperature}</span></span>
                  <span className="text-[11px] text-muted">Max Tokens: <span className="font-mono text-surface-600 dark:text-surface-400">{globalConfig.maxTokens}</span></span>
                </div>
              </div>
            </div>

            {/* 箭头 */}
            <div className="flex justify-center">
              <ArrowDown size={16} className="text-surface-300 dark:text-surface-600" />
            </div>

            {/* Provider 层 */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-accent-200/60 dark:border-accent-800/30 bg-accent-50/50 dark:bg-accent-900/10">
              <div className="w-7 h-7 rounded-md bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Server size={14} className="text-accent-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-accent-700 dark:text-accent-400 mb-1.5">Provider 层</div>
                {providers.length === 0 ? (
                  <span className="text-[11px] text-muted">暂无配置的 AI 源</span>
                ) : (
                  <div className="space-y-1">
                    {providers.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-[11px]">
                        {p.isDefault && (
                          <span className="w-4 h-4 rounded-full bg-accent-200 dark:bg-accent-800/40 flex items-center justify-center flex-shrink-0">
                            <Check size={10} className="text-accent-600 dark:text-accent-400" />
                          </span>
                        )}
                        <span className={`${p.isDefault ? 'font-medium text-accent-700 dark:text-accent-300' : 'text-muted'}`}>
                          {p.name}
                        </span>
                        <span className="text-surface-400 dark:text-surface-500">→</span>
                        <span className="text-surface-600 dark:text-surface-400 font-mono">
                          {p.defaultModelId || '未选模型'}
                        </span>
                        {p.id === globalConfig.activeProviderId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">当前激活</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 箭头 */}
            <div className="flex justify-center">
              <ArrowDown size={16} className="text-surface-300 dark:text-surface-600" />
            </div>

            {/* Agent 层 */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-accent-200/60 dark:border-accent-800/30 bg-accent-50/50 dark:bg-accent-900/10">
              <div className="w-7 h-7 rounded-md bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={14} className="text-accent-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-accent-700 dark:text-accent-400 mb-1.5">Agent 层</div>
                {agents.length === 0 ? (
                  <span className="text-[11px] text-muted">暂无 Agent 配置</span>
                ) : (
                  <div className="space-y-1">
                    {agents.filter((a) => a.enabled).map((agent) => {
                      const mc = agent.modelConfig
                      const hasOverride = !!(mc?.providerId || mc?.modelId || mc?.temperature !== undefined || mc?.maxTokens !== undefined)
                      return (
                        <div key={agent.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`${selectedAgentId === agent.id ? 'font-medium text-accent-700 dark:text-accent-300' : 'text-muted'}`}>
                            {agent.avatar} {agent.name}
                          </span>
                          {hasOverride ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {mc?.providerId && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                                  源: {providers.find(p => p.id === mc.providerId)?.name || mc.providerId}
                                </span>
                              )}
                              {mc?.modelId && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                                  模型: {mc.modelId}
                                </span>
                              )}
                              {mc?.temperature !== undefined && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                                  T: {mc.temperature}
                                </span>
                              )}
                              {mc?.maxTokens !== undefined && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                                  MT: {mc.maxTokens}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-surface-400 dark:text-surface-500">使用全局配置</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 当前生效配置 */}
          <div className="mt-4 p-3 rounded-lg bg-accent-50/50 dark:bg-accent-900/10 border border-accent-200/60 dark:border-accent-800/30">
            <div className="flex items-center gap-2 mb-2.5">
              <Zap size={14} className="text-accent-500" />
              <span className="text-xs font-medium text-accent-700 dark:text-accent-400">
                {selectedAgentId
                  ? `当前生效 (${agents.find(a => a.id === selectedAgentId)?.name || 'Agent'})`
                  : '当前生效 (全局默认)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {resolved.map((param) => {
                const colors = sourceColors[param.source]
                const SourceIcon = sourceIcons[param.source]
                return (
                  <div key={param.label} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted w-20 flex-shrink-0">{param.label}</span>
                    <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border} flex items-center gap-1`}>
                      <SourceIcon size={10} />
                      {param.value}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 图例 */}
            <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-accent-200/40 dark:border-accent-800/20">
              <span className="text-[10px] text-muted">来源：</span>
              {(['global', 'provider', 'agent'] as OverrideSource[]).map((source) => {
                const colors = sourceColors[source]
                const Icon = sourceIcons[source]
                const labels = { global: '全局', provider: 'Provider', agent: 'Agent' }
                return (
                  <span key={source} className={`text-[10px] flex items-center gap-1 ${colors.text}`}>
                    <Icon size={10} />
                    {labels[source]}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
