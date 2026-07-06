/**
 * Leader Agent 提示词编辑模态框
 *
 * 提供全屏模态框查看和编辑 Leader Agent 的系统提示词，
 * 支持还原为默认提示词。
 *
 * 当 folderPath 提供时，优先保存到工作区专属 leader（workspace-agent-store）；
 * 否则回退到全局 agent-store（兼容遗留数据）。
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, RotateCcw, Save, Crown, FileText } from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { WORKSPACE_LEADER_PROMPT, WORKSPACE_LEADER_AGENT_ID } from '../../constants/default-agents'

interface LeaderPromptEditorModalProps {
  /** 是否显示模态框 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 工作区路径（可选），提供后提示词保存到工作区专属 leader */
  folderPath?: string
}

export function LeaderPromptEditorModal({ open, onClose, folderPath }: LeaderPromptEditorModalProps) {
  const getAgent = useAgentStore((s) => s.getAgent)
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const getLeaderAgent = useWorkspaceAgentStore((s) => s.getLeaderAgent)
  const updateLeaderAgent = useWorkspaceAgentStore((s) => s.updateLeaderAgent)

  // 优先使用工作区专属 leader，其次全局
  const leaderAgent = (folderPath ? getLeaderAgent() : null) ?? getAgent(WORKSPACE_LEADER_AGENT_ID)
  const defaultPrompt = WORKSPACE_LEADER_PROMPT

  const [editingPrompt, setEditingPrompt] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 打开时同步当前 leader agent 的提示词
  useEffect(() => {
    if (open && leaderAgent) {
      setEditingPrompt(leaderAgent.systemPrompt)
      setIsDirty(false)
      setShowConfirmReset(false)
    }
  }, [open, leaderAgent])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDirty) {
          setShowConfirmReset(false)
        }
        onClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose, isDirty])

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingPrompt(e.target.value)
    setIsDirty(true)
  }, [])

  const handleSave = useCallback(() => {
    if (!leaderAgent) return
    if (folderPath) {
      // 保存到工作区专属 leader
      updateLeaderAgent({
        id: leaderAgent.id,
        systemPrompt: editingPrompt,
      }, folderPath)
    } else {
      // 回退到全局（兼容旧数据）
      updateAgent({
        id: WORKSPACE_LEADER_AGENT_ID,
        systemPrompt: editingPrompt,
      })
    }
    setIsDirty(false)
    onClose()
  }, [leaderAgent, updateAgent, updateLeaderAgent, editingPrompt, onClose, folderPath])

  const handleResetToDefault = useCallback(() => {
    setEditingPrompt(defaultPrompt)
    setIsDirty(true)
    setShowConfirmReset(false)
  }, [defaultPrompt])

  const isDefaultPrompt = editingPrompt === defaultPrompt

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 模态框 */}
      <div className="relative w-[90vw] max-w-4xl h-[85vh] bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Crown size={16} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                AI 领导 · 系统提示词
              </h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {leaderAgent?.name || 'AI 领导'} · {leaderAgent?.avatar || '👑'}
                {isDirty && <span className="ml-2 text-amber-500">● 未保存</span>}
                {!isDirty && !isDefaultPrompt && <span className="ml-2 text-teal-500">已自定义</span>}
                {!isDirty && isDefaultPrompt && <span className="ml-2 text-gray-400">默认提示词</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 还原默认按钮 */}
            <button
              onClick={() => setShowConfirmReset(true)}
              disabled={isDefaultPrompt}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                isDefaultPrompt
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              }`}
              title="还原为默认提示词"
            >
              <RotateCcw size={13} />
              <span>还原默认</span>
            </button>
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 确认还原提示条 */}
        {showConfirmReset && (
          <div className="px-6 py-3 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <RotateCcw size={14} className="text-orange-500" />
              <span className="text-xs text-orange-700 dark:text-orange-300">
                确认还原为默认提示词？当前编辑内容将被替换。
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetToDefault}
                className="px-3 py-1 rounded text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors"
              >
                确认还原
              </button>
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1 rounded text-xs text-gray-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 编辑区域 */}
        <div className="flex-1 flex flex-col min-h-0 p-4">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <FileText size={14} className="text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">系统提示词</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
              {editingPrompt.length} 字符
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={editingPrompt}
            onChange={handlePromptChange}
            className="flex-1 min-h-0 w-full resize-none rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 dark:focus:border-teal-600 transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600"
            placeholder="输入 Leader Agent 的系统提示词..."
            spellCheck={false}
          />
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 flex-shrink-0">
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            提示词将在下次对话时生效
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDirty
                  ? 'text-white bg-teal-500 hover:bg-teal-600 shadow-sm shadow-teal-500/20'
                  : 'text-gray-300 dark:text-gray-600 bg-gray-100 dark:bg-surface-700 cursor-not-allowed'
              }`}
            >
              <Save size={13} />
              <span>保存</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
