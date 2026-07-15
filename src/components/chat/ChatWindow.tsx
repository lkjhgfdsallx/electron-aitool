import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { MessageSquareDashed, Bot, Plug, Globe, FileText, BookOpen, ChevronDown, Check, Brain, BrainCircuit } from 'lucide-react'
import { ChatViewCore } from './ChatViewCore'
import { AgentSelector } from './AgentSelector'
import { SiteAnalyzerForm } from './SiteAnalyzerForm'
import type { SiteAnalyzerFormData } from './SiteAnalyzerForm'
import { BrandLogo } from '../brand'
import { BRAND } from '../../constants/brand'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useChat, hasUsableAIProvider, MISSING_AI_PROVIDER_MESSAGE } from '../../hooks/use-chat'
import { WEBSITE_ANALYZER_AGENT_ID } from '../../constants/default-agents'
import type { Message, MessageAttachment, PromptRuntimeContext } from '../../types'
import type { SettingsSection } from '../settings/SettingsNavRail'

/** ⚡ 稳定的空数组引用，避免每次渲染创建新的 [] 导致 useMemo 失效 */
const EMPTY_MESSAGES: Message[] = []

type MessageAlignment = 'left-right' | 'all-left' | 'all-right' | 'full-width'

interface ChatWindowProps {
  onOpenPromptManager?: () => void
  onOpenAgentManager?: () => void
  onOpenSettings?: (section?: SettingsSection) => void
}

export function ChatWindow({ onOpenPromptManager, onOpenAgentManager, onOpenSettings }: ChatWindowProps) {
  const {
    currentConversationId,
    getVisibleMessages,
    switchBranch,
    getConversation,
    setConversationAgent,
    createConversation,
    selectConversation,
    setConversationKnowledgeBases,
    setMemoryInjectionPaused,
    loadConversationMessages,
  } = useConversationStore()
  const { showTimestamp, showTokenUsage, showAvatar, messageAlignment } = useSettingsStore()
  const { getAgent } = useAgentStore()
  const { collections, loadCollections } = useKnowledgeCollectionStore()

  const handleMissingProvider = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings('ai-providers')
    } else {
      window.alert(MISSING_AI_PROVIDER_MESSAGE)
    }
  }, [onOpenSettings])

  const { sendMessage, stopGeneration, regenerateMessage, editAndResend, continueGeneration, handleHumanInput, approvePlan, rejectPlan } = useChat({
    onMissingProvider: handleMissingProvider
  })

  /** 欢迎页/快捷问题前置校验：无 AI 源时不创建空对话 */
  const ensureProviderOrOpenSettings = useCallback((): boolean => {
    if (hasUsableAIProvider()) return true
    handleMissingProvider()
    return false
  }, [handleMissingProvider])

  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)
  const kbDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  // ⚡ 切换对话时从 IDB 懒加载消息到内存（不在内存中的对话才触发 IDB 读取）
  useEffect(() => {
    if (currentConversationId) {
      loadConversationMessages(currentConversationId)
    }
  }, [currentConversationId, loadConversationMessages])

  // 点击外部关闭知识库下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (kbDropdownRef.current && !kbDropdownRef.current.contains(e.target as Node)) {
        setKbDropdownOpen(false)
      }
    }
    if (kbDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [kbDropdownOpen])

  // ⚡ 使用稳定空数组引用，避免每次渲染创建新 [] 导致 useMemo 失效
  const messages = currentConversationId ? getVisibleMessages(currentConversationId) : EMPTY_MESSAGES
  const currentConversation = currentConversationId ? getConversation(currentConversationId) : undefined
  const activeBranches = currentConversation?.activeBranches ?? {}

  /** 切换分支 */
  const handleSwitchBranch = useCallback(
    (forkMessageId: string, branchIndex: number) => {
      if (currentConversationId) {
        switchBranch(currentConversationId, forkMessageId, branchIndex)
      }
    },
    [currentConversationId, switchBranch]
  )

  // 获取当前对话关联的 Agent
  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined

  // 构建 Prompt 运行时上下文
  const runtimeContext: PromptRuntimeContext = useMemo(() => ({
    currentAgentName: currentAgent?.name,
    defaultModel: currentAgent?.modelConfig?.modelId,
  }), [currentAgent?.name, currentAgent?.modelConfig?.modelId])

  const isStreaming = messages.some((m) => m.isStreaming)

  // 判断是否为网站分析 Agent 且对话为空（显示表单）
  const isWebsiteAnalyzer = currentConversation?.agentId === WEBSITE_ANALYZER_AGENT_ID
  const showAnalyzerForm = isWebsiteAnalyzer && messages.length === 0

  /** 将表单数据格式化为消息并发送 */
  const handleAnalyzerFormSubmit = useCallback(
    (formData: SiteAnalyzerFormData) => {
      // 无 AI 源时不发起分析，直接引导配置
      if (!ensureProviderOrOpenSettings()) return

      const lines: string[] = [
        `请分析以下网站：`,
        ``,
        `**目标网址**：${formData.targetUrl}`,
        `**登录方式**：${formData.loginType}`
      ]

      // 登录凭证
      if (formData.loginType === 'password') {
        lines.push(`**用户名**：${formData.username}`)
        lines.push(`**密码**：${formData.password}`)
      } else if (formData.loginType === 'cookie') {
        if (formData.cookie) lines.push(`**Cookie**：${formData.cookie}`)
        if (formData.token) lines.push(`**Token**：${formData.token}`)
      }

      // 分析范围
      lines.push(``, `**分析范围**：`)
      lines.push(`- 爬取深度：${formData.maxDepth}`)
      lines.push(`- 最大页面数：${formData.maxPages}`)
      lines.push(`- 爬取间隔：${formData.crawlDelay}ms`)

      // 高级配置（仅在非默认值时显示）
      const advancedParts: string[] = []
      if (formData.urlIncludePatterns) advancedParts.push(`- URL包含规则：\`${formData.urlIncludePatterns}\``)
      if (formData.urlExcludePatterns) advancedParts.push(`- URL排除规则：\`${formData.urlExcludePatterns}\``)
      if (formData.proxyServer) advancedParts.push(`- 代理服务器：${formData.proxyServer}`)
      if (formData.userAgent) advancedParts.push(`- 自定义UA：${formData.userAgent}`)
      if (formData.simulateHuman) advancedParts.push(`- 模拟人类行为：是`)

      if (advancedParts.length > 0) {
        lines.push(``, `**高级配置**：`)
        lines.push(...advancedParts)
      }

      lines.push(``, `请使用这些配置启动网站分析。如果AI配置未提供，请使用当前对话的AI配置。`)

      const content = lines.join('\n')
      sendMessage(content)
    },
    [sendMessage, ensureProviderOrOpenSettings]
  )

  const handleSend = useCallback(
    (content: string, attachments?: MessageAttachment[]) => {
      sendMessage(content, undefined, attachments)
    },
    [sendMessage]
  )

  const handleAgentSelect = useCallback(
    (agentId: string | undefined) => {
      if (currentConversationId) {
        setConversationAgent(currentConversationId, agentId)
      }
    },
    [currentConversationId, setConversationAgent]
  )

  /** 获取分支点消息的当前激活分支索引 */
  const getActiveBranchIndex = useCallback(
    (forkMessageId: string): number => {
      return activeBranches[forkMessageId] ?? 0
    },
    [activeBranches]
  )

  // 快捷提示词
  const quickPrompts = [
    { icon: '💡', text: '帮我写一篇关于 AI 发展趋势的文章', category: '写作' },
    { icon: '🔍', text: '解释一下量子计算的基本原理', category: '学习' },
    { icon: '💻', text: '用 Python 实现一个快速排序算法', category: '编程' },
    { icon: '📊', text: '分析这份销售数据并给出建议', category: '分析' },
    { icon: '🎨', text: '为我的产品起一个有创意的名字', category: '创意' },
    { icon: '📝', text: '帮我优化这段代码的性能', category: '编程' },
  ]

  const featureCards = [
    { icon: Bot, title: 'Agent 模式', desc: '自主规划、执行多步任务', color: 'from-accent-500 to-purple-600' },
    { icon: Plug, title: 'MCP 工具', desc: '连接外部服务和数据源', color: 'from-emerald-500 to-teal-600' },
    { icon: Globe, title: '网站分析', desc: '自动爬取分析网站功能', color: 'from-blue-500 to-indigo-600' },
    { icon: FileText, title: '知识库', desc: '基于文档的精准问答', color: 'from-amber-500 to-orange-600' },
  ]

  // 空状态 - 无对话选中：全屏欢迎页
  if (!currentConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-surface-50 via-white to-accent-50/30 dark:from-surface-900 dark:via-surface-950 dark:to-accent-950/10 overflow-y-auto">
        <div className="max-w-2xl w-full px-6 py-12 text-center animate-fade-in-up">
          {/* Logo + 标题 */}
          <div className="flex items-center justify-center mb-6">
            <div className="shadow-lg shadow-accent-500/20 rounded-2xl">
              <BrandLogo size="lg" showWordmark={false} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2 tracking-tight">
            欢迎使用 <span className="text-gradient-warm">{BRAND.name}</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {BRAND.tagline}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            {BRAND.taglineZh} · {BRAND.welcomeDescription}
          </p>

          {/* 功能亮点卡片 */}
          <div className="grid grid-cols-2 gap-3 mb-8 max-w-lg mx-auto">
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="group flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-surface-800/60 border border-surface-200/80 dark:border-surface-700/60 card-hover cursor-default text-left"
              >
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center shadow-sm`}>
                  <card.icon size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{card.title}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{card.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 快捷提示词 */}
          <div className="max-w-lg mx-auto">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wider">
              试试这些问题
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    // 无 AI 源时不创建空对话，直接引导配置
                    if (!ensureProviderOrOpenSettings()) return
                    // 创建新对话并发送提示词
                    const conv = createConversation(prompt.text.slice(0, 20) + '...')
                    selectConversation(conv.id)
                    // 稍后发送消息，确保状态已更新
                    setTimeout(() => sendMessage(prompt.text), 100)
                  }}
                  className="group flex items-start gap-2.5 p-3 rounded-xl bg-white/80 dark:bg-surface-800/40 border border-surface-200/60 dark:border-surface-700/40 hover:border-accent-300 dark:hover:border-accent-600 hover:bg-accent-50/50 dark:hover:bg-accent-950/20 transition-all text-left"
                >
                  <span className="text-base mt-0.5">{prompt.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors">
                      {prompt.text}
                    </p>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 inline-block">
                      {prompt.category}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const headerSlot = (
    <div className="relative z-10 flex items-center gap-3 px-4 py-2.5 border-b border-surface-200/80 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm">
      <AgentSelector
        selectedAgentId={currentConversation?.agentId}
        onSelect={handleAgentSelect}
        onOpenAgentManager={onOpenAgentManager}
      />
      {currentAgent && (
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-0.5 bg-accent-50 dark:bg-accent-950/30 text-accent-600 dark:text-accent-400 border border-accent-200/60 dark:border-accent-800/40 rounded-full font-medium">
            Agent 模式
          </span>
          <span className="text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{currentAgent.description}</span>
        </div>
      )}

      {/* 长期记忆注入：本对话暂停/恢复 */}
      {currentAgent?.memoryConfig?.longTermEnabled && currentConversationId && (
        <button
          type="button"
          onClick={() =>
            setMemoryInjectionPaused(
              currentConversationId,
              !currentConversation?.memoryInjectionPaused
            )
          }
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            currentConversation?.memoryInjectionPaused
              ? 'bg-surface-100 dark:bg-surface-800 text-muted border-surface-200 dark:border-surface-700'
              : 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border-violet-200/60 dark:border-violet-800/40'
          }`}
          title={
            currentConversation?.memoryInjectionPaused
              ? '本对话已暂停将长期记忆注入上下文（记忆仍保留，可点击恢复）'
              : '长期记忆将注入本对话上下文；点击可暂停注入，避免旧记忆污染'
          }
        >
          {currentConversation?.memoryInjectionPaused ? (
            <>
              <Brain size={13} />
              <span className="hidden sm:inline">记忆 · 已暂停</span>
            </>
          ) : (
            <>
              <BrainCircuit size={13} />
              <span className="hidden sm:inline">
                记忆 · {currentAgent.memoryConfig.crossSession ? '跨会话' : '本会话'}
              </span>
            </>
          )}
        </button>
      )}

      {/* 右侧弹性间隔 */}
      <div className="flex-1" />

      {/* 知识库集合快速切换 */}
      {collections.length > 0 && currentConversationId && (() => {
        const selectedIds = currentConversation?.activeKnowledgeBaseIds ?? []
        const selectedNames = collections
          .filter((c) => selectedIds.includes(c.id))
          .map((c) => c.icon + c.name)

        return (
          <div className="relative flex-shrink-0" ref={kbDropdownRef}>
            <button
              onClick={() => setKbDropdownOpen(!kbDropdownOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedIds.length > 0
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                  : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
              }`}
              title="选择知识库集合"
            >
              <BookOpen size={14} />
              <span className="hidden sm:inline max-w-[120px] truncate">
                {selectedIds.length > 0
                  ? selectedNames.length > 1
                    ? `${selectedNames[0]} 等${selectedNames.length}个`
                    : selectedNames[0]
                  : '知识库'}
              </span>
              <ChevronDown size={12} className={`transition-transform ${kbDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {kbDropdownOpen && (
              <div className="dropdown-panel absolute right-0 top-full mt-1 w-64 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-surface-200/80 dark:border-surface-700/60">
                  <p className="text-xs font-medium text-surface-600 dark:text-surface-400">选择对话使用的知识库</p>
                  <p className="text-[10px] text-muted mt-0.5">不选择则搜索全部知识库</p>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {collections.map((col) => {
                    const isSelected = selectedIds.includes(col.id)
                    return (
                      <button
                        key={col.id}
                        onClick={() => {
                          const newIds = isSelected
                            ? selectedIds.filter((id) => id !== col.id)
                            : [...selectedIds, col.id]
                          setConversationKnowledgeBases(currentConversationId, newIds.length > 0 ? newIds : undefined)
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                          isSelected
                            ? 'bg-accent-50/50 dark:bg-accent-950/20 text-accent-700 dark:text-accent-300'
                            : 'text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
                        }`}
                      >
                        <span className="text-base flex-shrink-0">{col.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{col.name}</span>
                          {col.description && (
                            <p className="text-xs text-muted truncate">{col.description}</p>
                          )}
                        </div>
                        {isSelected && (
                          <Check size={14} className="text-accent-500 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )

  const emptyStateSlot = showAnalyzerForm ? (
    <div className="flex-1 overflow-y-auto p-4">
      <SiteAnalyzerForm onSubmit={handleAnalyzerFormSubmit} />
    </div>
  ) : (
    <div className="flex items-center justify-center h-full px-6">
      <div className="max-w-md w-full text-center animate-fade-in-up">
        {currentAgent ? (
          <>
            {/* Agent 模式引导 */}
            <div className="flex items-center justify-center mb-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-purple-600 shadow-lg shadow-accent-500/20">
                <Bot size={24} className="text-white" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1.5">
              {currentAgent.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs mx-auto leading-relaxed">
              {currentAgent.description || '发送消息开始与 Agent 对话，它会自主规划并执行多步任务'}
            </p>
            {/* Agent 能力标签 */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {(currentAgent.enabledToolIds && currentAgent.enabledToolIds.length > 0 ? currentAgent.enabledToolIds.slice(0, 4) : ['自主规划', '多步执行', '工具调用']).map((tag: string, i: number) => (
                <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-accent-50 dark:bg-accent-950/30 text-accent-600 dark:text-accent-400 border border-accent-200/60 dark:border-accent-800/40">
                  {tag}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 普通模式引导 */}
            <div className="flex items-center justify-center mb-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-700 dark:to-surface-600">
                <MessageSquareDashed size={24} className="text-surface-500 dark:text-surface-400" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1.5">
              开始新的对话
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              发送消息或选择下方快捷提示开始
            </p>
          </>
        )}

        {/* 快捷提示词 */}
        <div className="grid grid-cols-1 gap-2 max-w-sm mx-auto">
          {quickPrompts.slice(0, 3).map((prompt, i) => (
            <button
              key={i}
              onClick={() => {
                if (!ensureProviderOrOpenSettings()) return
                sendMessage(prompt.text)
              }}
              className="group flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-surface-800/40 border border-surface-200/60 dark:border-surface-700/40 hover:border-accent-300 dark:hover:border-accent-600 hover:bg-accent-50/50 dark:hover:bg-accent-950/20 transition-all text-left"
            >
              <span className="text-base">{prompt.icon}</span>
              <span className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors">
                {prompt.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <ChatViewCore
      conversationId={currentConversationId}
      messages={messages}
      headerSlot={headerSlot}
      emptyStateSlot={emptyStateSlot}
      onSwitchBranch={handleSwitchBranch}
      getActiveBranchIndex={getActiveBranchIndex}
      onRegenerate={regenerateMessage}
      onEditAndResend={editAndResend}
      onContinueGeneration={continueGeneration}
      onHumanInput={handleHumanInput}
      onApprovePlan={approvePlan}
      onRejectPlan={rejectPlan}
      onSend={handleSend}
      onStop={stopGeneration}
      isStreaming={isStreaming}
      showTimestamp={showTimestamp}
      showTokenUsage={showTokenUsage}
      showAvatar={showAvatar}
      messageAlignment={messageAlignment as MessageAlignment}
      runtimeContext={runtimeContext}
      onOpenPromptManager={onOpenPromptManager}
    />
  )
}
