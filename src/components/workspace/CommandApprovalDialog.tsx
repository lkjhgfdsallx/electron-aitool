/**
 * 命令审批弹窗组件
 *
 * 当 AI Agent 请求执行 shell 命令时弹出，
 * 展示命令内容、风险等级、匹配规则，并提供审批/拒绝选项。
 * 高风险命令需要输入确认文本。
 */

import { useState, useEffect, useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import type { CommandApprovalResult, CommandRiskLevel } from '../../types'

// ---- 风险等级样式映射 ----

const RISK_CONFIG: Record<CommandRiskLevel, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  description: string
}> = {
  safe: {
    label: '安全',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    icon: '✓',
    description: '此命令已被识别为安全操作',
  },
  medium: {
    label: '中等',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    icon: '⚠',
    description: '此命令可能产生副作用，请确认',
  },
  high: {
    label: '高风险',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: '⚡',
    description: '此命令可能导致不可逆的变更',
  },
  critical: {
    label: '危险',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: '✕',
    description: '此命令具有高破坏性，强烈建议拒绝',
  },
}

// ---- 确认文本 ----

const CONFIRM_TEXT = '我确认执行'

// ---- 组件 ----

export function CommandApprovalDialog() {
  const pendingApproval = useWorkspaceStore((s) => s.pendingCommandApproval)
  const resolveApproval = useWorkspaceStore((s) => s.resolveCommandApproval)

  const [confirmInput, setConfirmInput] = useState('')

  // 重置状态
  useEffect(() => {
    if (pendingApproval) {
      setConfirmInput('')
    }
  }, [pendingApproval?.id])

  // 键盘快捷键：Escape 关闭
  useEffect(() => {
    if (!pendingApproval) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleResolve('denied')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingApproval])

  const handleResolve = useCallback((result: CommandApprovalResult) => {
    resolveApproval(result)
  }, [resolveApproval])

  if (!pendingApproval) return null

  const risk = RISK_CONFIG[pendingApproval.riskLevel]
  const needsConfirm = pendingApproval.riskLevel === 'high' || pendingApproval.riskLevel === 'critical'
  const canApprove = !needsConfirm || confirmInput === CONFIRM_TEXT

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => handleResolve('denied')}
      />

      {/* 弹窗 */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 animate-scale-in overflow-hidden">
        {/* 头部 */}
        <div className={`flex items-center gap-3 px-5 py-4 ${risk.bgColor} border-b ${risk.borderColor}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${risk.bgColor} ${risk.color} border ${risk.borderColor}`}>
            {risk.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
              命令执行审批
            </h3>
            <p className={`text-xs mt-0.5 ${risk.color}`}>
              风险等级：{risk.label} — {risk.description}
            </p>
          </div>
          <button
            onClick={() => handleResolve('denied')}
            className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-4">
          {/* Agent 信息 */}
          {pendingApproval.agentName && (
            <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>由 <strong className="text-surface-700 dark:text-surface-300">{pendingApproval.agentName}</strong> 请求执行</span>
            </div>
          )}

          {/* 命令内容 */}
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 block">
              命令内容
            </label>
            <div className="relative rounded-lg bg-surface-50 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700 overflow-hidden">
              <pre className="px-4 py-3 text-sm font-mono text-surface-800 dark:text-surface-200 whitespace-pre-wrap break-all leading-relaxed">
                {pendingApproval.command}
              </pre>
            </div>
          </div>

          {/* 工作目录 */}
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 block">
              工作目录
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 shrink-0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-xs font-mono text-surface-600 dark:text-surface-300 truncate">
                {pendingApproval.workingDir}
              </span>
            </div>
          </div>

          {/* 匹配规则 */}
          {pendingApproval.matchedRule && (
            <div>
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 block">
                匹配规则
              </label>
              <div className="px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700">
                <span className="text-xs text-surface-600 dark:text-surface-300">
                  {pendingApproval.matchedRule}
                </span>
              </div>
            </div>
          )}

          {/* 高风险确认输入 */}
          {needsConfirm && (
            <div className={`p-3 rounded-lg ${risk.bgColor} border ${risk.borderColor}`}>
              <label className={`text-xs font-medium ${risk.color} mb-2 block`}>
                此命令具有较高风险，请输入「{CONFIRM_TEXT}」以确认执行
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={CONFIRM_TEXT}
                className="w-full px-3 py-2 text-sm rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 text-surface-800 dark:text-surface-200 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-orange-400 dark:focus:ring-orange-500"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30">
          <div className="flex items-center gap-2">
            {/* 拒绝一次 */}
            <button
              onClick={() => handleResolve('denied')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              拒绝
            </button>

            {/* 永远拒绝 */}
            <button
              onClick={() => handleResolve('denied-always')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              永远拒绝
            </button>

            {/* 批准一次 */}
            <button
              onClick={() => handleResolve('approved-once')}
              disabled={!canApprove}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              批准一次
            </button>

            {/* 始终批准 */}
            <button
              onClick={() => handleResolve('approved-always')}
              disabled={!canApprove}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              始终批准
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
