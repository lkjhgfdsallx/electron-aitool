/**
 * 文件操作审批弹窗组件（阶段 1 新增，参考 ROO CODE Auto-Approve）
 *
 * 当 AI Agent 请求执行文件操作（写入/读取/列目录），且自动审批未通过时弹出，
 * 展示操作详情、风险等级，并提供审批/拒绝选项。
 *
 * 与 CommandApprovalDialog 风格保持一致。
 */

import { useState, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import type { FileActionApprovalResult } from '../../services/agent-engine'

// ---- 操作类型样式映射 ----

const ACTION_CONFIG: Record<string, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  description: string
}> = {
  'write-file': {
    label: '写入文件',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    icon: '✏️',
    description: '将创建或修改文件内容',
  },
  'read-file': {
    label: '读取文件',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: '📖',
    description: '读取文件内容（只读操作）',
  },
  'list-files': {
    label: '列目录',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    icon: '📁',
    description: '列出目录内容（只读操作）',
  },
}

// ---- 组件 ----

export function FileActionApprovalDialog() {
  const pendingApproval = useWorkspaceStore((s) => s.pendingFileActionApproval)
  const resolveApproval = useWorkspaceStore((s) => s.resolveFileActionApproval)

  // 键盘快捷键：Escape 拒绝，Enter 批准
  useEffect(() => {
    if (!pendingApproval) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        resolveApproval('denied')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pendingApproval, resolveApproval])

  if (!pendingApproval) return null

  const config = ACTION_CONFIG[pendingApproval.actionType] || ACTION_CONFIG['write-file']

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => resolveApproval('denied')}
      />

      {/* 弹窗 */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 animate-scale-in overflow-hidden">
        {/* 头部 */}
        <div className={`flex items-center gap-3 px-5 py-4 ${config.bgColor} border-b ${config.borderColor}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${config.bgColor} ${config.color} border ${config.borderColor}`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
              文件操作审批
            </h3>
            <p className={`text-xs mt-0.5 ${config.color}`}>
              {config.label} — {config.description}
            </p>
          </div>
          <button
            onClick={() => resolveApproval('denied')}
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

          {/* 工具名称 */}
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 block">
              工具
            </label>
            <div className="px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700">
              <span className="text-xs font-mono text-surface-600 dark:text-surface-300">
                {pendingApproval.toolName}
              </span>
            </div>
          </div>

          {/* 文件路径 */}
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 block">
              目标文件
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-xs font-mono text-surface-600 dark:text-surface-300 truncate">
                {pendingApproval.filePath}
              </span>
            </div>
          </div>

          {/* 写入内容预览 */}
          {pendingApproval.contentPreview && (
            <div>
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 block">
                写入内容预览（前 500 字符）
              </label>
              <div className="rounded-lg bg-surface-50 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700 overflow-hidden max-h-40">
                <pre className="px-4 py-3 text-xs font-mono text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-all leading-relaxed overflow-y-auto">
                  {pendingApproval.contentPreview}
                </pre>
              </div>
            </div>
          )}

          {/* 风险等级 */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
            <span className={`text-xs font-medium ${config.color}`}>
              ⚠️ 风险等级：{pendingApproval.riskLevel === 'high' ? '高' : pendingApproval.riskLevel === 'medium' ? '中' : '低'}
            </span>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-surface-50 dark:bg-surface-800/50 border-t border-surface-200 dark:border-surface-700">
          <button
            onClick={() => resolveApproval('denied')}
            className="px-4 py-2 text-xs font-medium text-surface-600 dark:text-surface-300 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            拒绝 (Esc)
          </button>
          <button
            onClick={() => resolveApproval('approved-once')}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            仅此一次批准
          </button>
          <button
            onClick={() => resolveApproval('approved-always')}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            永远允许此类操作
          </button>
        </div>
      </div>
    </div>
  )
}
