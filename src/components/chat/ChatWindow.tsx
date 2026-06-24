import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { MessageSquareDashed, Bot, Plug, Globe, FileText, Sparkles, BookOpen, ChevronDown, Check } from 'lucide-react'
import { MessageItem } from './MessageItem'
import { AssistantGroupBubble } from './AssistantGroupBubble'
import { MessageInput } from './MessageInput'
import { AgentSelector } from './AgentSelector'
import { SiteAnalyzerForm } from './SiteAnalyzerForm'
import type { SiteAnalyzerFormData } from './SiteAnalyzerForm'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useChat } from '../../hooks/use-chat'
import { WEBSITE_ANALYZER_AGENT_ID } from '../../constants/default-agents'
import type { Message, MessageAttachment } from '../../types'

/** 消息渲染组：单条消息或多条合并的 assistant 组 */
type RenderGroup =
  | { type: 'single'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

/**
 * 将消息列表分组：
 * - user / system / Agent 模式的 assistant → 独立渲染
 * - 普通模式下连续的 assistant + tool 消息 → 合并为一组
 */
function groupMessages(messages: Message[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  let pendingGroup: Message[] = []

  const flushGroup = () => {
    if (pendingGroup.length === 0) return
    if (pendingGroup.length === 1) {
      groups.push({ type: 'single', message: pendingGroup[0] })
    } else {
      groups.push({ type: 'assistant-group', messages: [...pendingGroup] })
    }
    pendingGroup = []
  }

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'system') {
      flushGroup()
      groups.push({ type: 'single', message: msg })
    } else if (msg.role === 'tool') {
      // 工具结果消息归入当前组
      pendingGroup.push(msg)
    } else if (msg.role === 'assistant') {
      // Agent 模式消息（有 agentSteps）独立渲染
      if (msg.agentSteps && msg.agentSteps.length > 0) {
        flushGroup()
        groups.push({ type: 'single', message: msg })
      } else {
        pendingGroup.push(msg)
      }
    }
  }
  flushGroup()
  return groups
}

interface ChatWindowProps {
  onOpenPromptManager?: () => void
  onOpenAgentManager?: () => void
}

export function ChatWindow({ onOpenPromptManager, onOpenAgentManager }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { currentConversationId, getVisibleMessages, switchBranch, getConversation, setConversationAgent, createConversation, selectConversation, setConversationKnowledgeBases } = useConversationStore()
  const { showTimestamp, showTokenUsage } = useSettingsStore()
  const { getAgent } = useAgentStore()
  const { collections, loadCollections } = useKnowledgeCollectionStore()
  const { sendMessage, stopGeneration, regenerateMessage, editAndResend, handleHumanInput, resumeAgentTask } = useChat()

  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)
  const kbDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

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

  // 使用可见消息（支持分支切换）
  const messages = currentConversationId ? getVisibleMessages(currentConversationId) : []
  const currentConversation = currentConversationId ? getConversation(currentConversationId) : undefined

  // 将消息分组：普通模式下连续的 assistant+tool 消息合并为一个气泡
  const renderGroups = useMemo(() => groupMessages(messages), [messages])
  const activeBranches = currentConversation?.activeBranches ?? {}

  // 获取当前对话关联的 Agent
  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 判断是否为网站分析 Agent 且对话为空（显示表单）
  const isWebsiteAnalyzer = currentConversation?.agentId === WEBSITE_ANALYZER_AGENT_ID
  const showAnalyzerForm = isWebsiteAnalyzer && messages.length === 0

  /** 将表单数据格式化为消息并发送 */
  const handleAnalyzerFormSubmit = useCallback(
    (formData: SiteAnalyzerFormData) => {
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
    [sendMessage]
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

  /** 切换分支 */
  const handleSwitchBranch = useCallback(
    (forkMessageId: string, branchIndex: number) => {
      if (currentConversationId) {
        switchBranch(currentConversationId, forkMessageId, branchIndex)
      }
    },
    [currentConversationId, switchBranch]
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
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-brand shadow-lg shadow-accent-500/20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.9" />
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2 tracking-tight">
            欢迎使用 <span className="text-gradient-warm">AI Tool</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            智能对话助手，支持 Agent 自主任务、MCP 工具集成、网站分析等功能
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Agent 选择栏 */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-200/80 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm">
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
                <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-xl z-50 overflow-hidden">
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

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          showAnalyzerForm ? (
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
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {renderGroups.map((group, idx) => {
              if (group.type === 'assistant-group') {
                return (
                  <AssistantGroupBubble
                    key={`group-${group.messages[0].id}`}
                    messages={group.messages}
                    showTimestamp={showTimestamp}
                    showTokenUsage={showTokenUsage}
                    onRegenerate={regenerateMessage}
                  />
                )
              }
              const msg = group.message
              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  showTimestamp={showTimestamp}
                  showTokenUsage={showTokenUsage}
                  onRegenerate={regenerateMessage}
                  onEditAndResend={editAndResend}
                  onHumanInput={handleHumanInput}
                  onResumeAgentTask={resumeAgentTask}
                  activeBranchIndex={getActiveBranchIndex(msg.id)}
                  onSwitchBranch={handleSwitchBranch}
                />
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入框 */}
      <MessageInput
        onSend={handleSend}
        onStop={stopGeneration}
        isStreaming={messages.some((m) => m.isStreaming)}
        onOpenPromptManager={onOpenPromptManager}
      />
    </div>
  )
}
