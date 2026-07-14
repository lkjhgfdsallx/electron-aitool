/**
 * 终端 & 审批面板 - 底栏
 * - 实时终端输出（通过 workspace-command-executor 和 IPC 事件流）
 * - 内嵌审批卡片（替代弹窗，终端区内直接显示审批流）
 * - 支持命令手动输入执行
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Terminal, CheckCircle, XCircle, AlertCircle, Play, Square,
  Trash2, ChevronDown, ChevronRight, Send,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useConversationStore } from '../../stores/conversation-store'
import { workspaceCommandExecutor } from '../../services/workspace-command-executor'
import type { Workspace, CommandApprovalRequest, TerminalLog } from '../../types'

interface TerminalPanelProps {
  workspace: Workspace
}

export function TerminalPanel({ workspace }: TerminalPanelProps) {
  const pendingCommandApproval = useWorkspaceStore((s) => s.pendingCommandApproval)
  const resolveCommandApproval = useWorkspaceStore((s) => s.resolveCommandApproval)
  const clearCommandApproval = useWorkspaceStore((s) => s.clearCommandApproval)

  const terminalHistory = useConversationStore((s) => s.getTerminalHistory(workspace.id))
  const addTerminalLog = useConversationStore((s) => s.addTerminalLog)
  const clearTerminalHistory = useConversationStore((s) => s.clearTerminalHistory)

  const [commandInput, setCommandInput] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null)
  const [showApprovalDetail, setShowApprovalDetail] = useState(true)
  const terminalRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalHistory])

  // B9: 监听命令实时输出事件
  useEffect(() => {
    const unsubscribeOutput = window.electronAPI.workspace.command.onOutput((data: { commandId: string; stream: string; chunk: string; timestamp: number }) => {
      addTerminalLog(workspace.id, {
        type: data.stream === 'stderr' ? 'stderr' : 'stdout',
        content: data.chunk,
      })
    })

    const unsubscribeComplete = window.electronAPI.workspace.command.onComplete((data: { commandId: string; exitCode: number | null; killed: boolean; timestamp: number }) => {
      addTerminalLog(workspace.id, {
        type: 'system',
        content: data.exitCode === 0
          ? `✓ 命令完成 (exit code: 0)`
          : data.killed
            ? `✗ 命令被中止`
            : `✗ 命令失败 (exit code: ${data.exitCode})`,
      })
      setIsExecuting(false)
      setRunningCommandId(null)
    })

    return () => {
      unsubscribeOutput()
      unsubscribeComplete()
    }
  }, [workspace.id, addTerminalLog])

  // 执行命令
  const handleExecuteCommand = useCallback(async (command?: string) => {
    const cmd = (command || commandInput).trim()
    if (!cmd || isExecuting) return

    setCommandInput('')
    setIsExecuting(true)

    // 记录命令到终端日志
    addTerminalLog(workspace.id, {
      type: 'command',
      content: `$ ${cmd}`,
    })

    try {
      const result = await workspaceCommandExecutor.executeCommand(
        cmd,
        workspace.folderPath,
        workspace.id,
        workspace.commandPolicy,
        {
          safeCommandWhitelist: workspace.safeCommandWhitelist,
          commandBlacklist: workspace.commandBlacklist,
          skipApproval: false,
        }
      )

      if (result.denied) {
        addTerminalLog(workspace.id, {
          type: 'system',
          content: `⊘ 命令被拒绝: ${result.error}`,
        })
      } else if (result.stdout || result.stderr) {
        // 输出已在 onOutput 事件中实时推送
        // 此处只在没有事件监听时做 fallback
        if (terminalHistory.length === 0 || !window.electronAPI.workspace.command.onOutput) {
          if (result.stdout) {
            addTerminalLog(workspace.id, { type: 'stdout', content: result.stdout })
          }
          if (result.stderr) {
            addTerminalLog(workspace.id, { type: 'stderr', content: result.stderr })
          }
        }
      }
    } catch (err) {
      addTerminalLog(workspace.id, {
        type: 'stderr',
        content: `执行错误: ${String(err)}`,
      })
    } finally {
      setIsExecuting(false)
    }
  }, [commandInput, isExecuting, workspace, addTerminalLog, terminalHistory.length])

  // 处理审批决策
  const handleApproval = useCallback(async (approved: boolean, always?: boolean) => {
    if (!pendingCommandApproval) return

    const result: 'approved-once' | 'approved-always' | 'denied' | 'denied-always' = approved
      ? (always ? 'approved-always' : 'approved-once')
      : (always ? 'denied-always' : 'denied')

    resolveCommandApproval(result)
  }, [pendingCommandApproval, resolveCommandApproval])

  // 中止正在执行的命令
  const handleAbort = useCallback(async () => {
    if (runningCommandId) {
      await workspaceCommandExecutor.abortCommand(runningCommandId)
    }
  }, [runningCommandId])

  // 终端日志颜色映射
  const getLogColor = (log: TerminalLog): string => {
    switch (log.type) {
      case 'command': return 'text-teal-400 font-medium'
      case 'stderr': return 'text-red-400'
      case 'system': return log.content.startsWith('✓') ? 'text-green-400' : log.content.startsWith('✗') ? 'text-red-400' : 'text-gray-400'
      default: return 'text-gray-300 dark:text-gray-400'
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-950 dark:bg-surface-900">
      {/* 终端头部 */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-surface-800 dark:border-surface-700/40 flex-shrink-0 dark:bg-surface-800/50">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-gray-400" />
          <span className="text-[11px] font-medium text-gray-400">终端</span>
          {isExecuting && (
            <span className="flex items-center gap-1 text-[10px] text-teal-400">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              执行中
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* 清除按钮 */}
          {terminalHistory.length > 0 && (
            <button
              onClick={() => clearTerminalHistory(workspace.id)}
              className="p-1 rounded hover:bg-surface-800 text-gray-500 hover:text-gray-300 transition-colors"
              title="清除终端"
            >
              <Trash2 size={11} />
            </button>
          )}
          {/* 命令执行状态指示 */}
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full ${
              workspace.commandExecutionEnabled ? 'bg-green-500' : 'bg-gray-500'
            }`} />
            {workspace.commandExecutionEnabled ? '就绪' : '已禁用'}
          </span>
        </div>
      </div>

      {/* B5: 内嵌审批卡片 */}
      {pendingCommandApproval && (
        <InlineApprovalCard
          request={pendingCommandApproval}
          showDetail={showApprovalDetail}
          onToggleDetail={() => setShowApprovalDetail(!showApprovalDetail)}
          onApprove={(always) => handleApproval(true, always)}
          onDeny={(always) => handleApproval(false, always)}
        />
      )}

      {/* B4: 终端输出区域 */}
      <div ref={terminalRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs select-text">
        {terminalHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Terminal size={28} className="text-gray-600 dark:text-gray-500 mb-2" />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              命令执行输出将在此显示
            </p>
            <p className="text-[10px] text-gray-600 dark:text-gray-500 mt-1">
              在下方输入命令或等待 AI 执行
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {terminalHistory.map((log) => (
              <div key={log.id} className={`${getLogColor(log)} leading-relaxed`}>
                {log.type === 'stdout' || log.type === 'stderr' ? (
                  <pre className="whitespace-pre-wrap break-all text-[11px]">{log.content}</pre>
                ) : (
                  <span className="text-[11px]">{log.content}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 命令输入栏 */}
      {workspace.commandExecutionEnabled && (
        <div className="flex-shrink-0 border-t border-surface-800 dark:border-surface-700/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-teal-500 text-xs font-mono flex-shrink-0">$</span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleExecuteCommand()
                }
              }}
              placeholder="输入命令..."
              disabled={isExecuting}
              className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none font-mono"
            />
            {isExecuting ? (
              <button
                onClick={handleAbort}
                className="p-1 rounded hover:bg-surface-800 text-red-400 hover:text-red-300 transition-colors"
                title="中止命令"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                onClick={() => handleExecuteCommand()}
                disabled={!commandInput.trim()}
                className="p-1 rounded hover:bg-surface-800 text-gray-500 hover:text-teal-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="执行命令"
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- B5: 内嵌审批卡片 ----

interface InlineApprovalCardProps {
  request: CommandApprovalRequest
  showDetail: boolean
  onToggleDetail: () => void
  onApprove: (always: boolean) => void
  onDeny: (always: boolean) => void
}

function InlineApprovalCard({ request, showDetail, onToggleDetail, onApprove, onDeny }: InlineApprovalCardProps) {
  const riskColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    safe: { bg: 'bg-green-900/20', border: 'border-green-700/30', text: 'text-green-300', badge: 'bg-green-800/40 text-green-400' },
    medium: { bg: 'bg-amber-900/20', border: 'border-amber-700/30', text: 'text-amber-300', badge: 'bg-amber-800/40 text-amber-400' },
    high: { bg: 'bg-orange-900/20', border: 'border-orange-700/30', text: 'text-orange-300', badge: 'bg-orange-800/40 text-orange-400' },
    critical: { bg: 'bg-red-900/20', border: 'border-red-700/30', text: 'text-red-300', badge: 'bg-red-800/40 text-red-400' },
  }

  const colors = riskColors[request.riskLevel] || riskColors.medium

  return (
    <div className={`mx-3 mt-2 mb-1 rounded-lg ${colors.bg} border ${colors.border} overflow-hidden`}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={13} className={colors.text} />
          <span className={`text-[11px] font-medium ${colors.text}`}>命令审批</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors.badge}`}>
            {request.riskLevel}
          </span>
        </div>
        <button
          onClick={onToggleDetail}
          className="p-0.5 rounded hover:bg-white/5 text-gray-500 transition-colors"
        >
          {showDetail ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {/* 命令内容 */}
      <div className="px-3 pb-2">
        <code className={`block text-[11px] ${colors.text} break-all font-mono bg-black/20 rounded px-2 py-1.5`}>
          $ {request.command}
        </code>
      </div>

      {/* 详细信息 */}
      {showDetail && (
        <div className="px-3 pb-2 space-y-1">
          {request.matchedRule && (
            <p className="text-[10px] text-gray-400">规则: {request.matchedRule}</p>
          )}
          {request.agentName && (
            <p className="text-[10px] text-gray-400">来自: {request.agentName}</p>
          )}
          <p className="text-[10px] text-gray-500">目录: {request.workingDir}</p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-white/5">
        <button
          onClick={() => onApprove(false)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
        >
          <CheckCircle size={12} />
          批准
        </button>
        <button
          onClick={() => onApprove(true)}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] text-green-500/70 hover:bg-green-600/10 transition-colors"
          title="始终批准此类命令"
        >
          始终批准
        </button>
        <div className="w-px h-4 bg-white/10" />
        <button
          onClick={() => onDeny(false)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
        >
          <XCircle size={12} />
          拒绝
        </button>
        <button
          onClick={() => onDeny(true)}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] text-red-500/70 hover:bg-red-600/10 transition-colors"
          title="始终拒绝此类命令"
        >
          始终拒绝
        </button>
      </div>
    </div>
  )
}
