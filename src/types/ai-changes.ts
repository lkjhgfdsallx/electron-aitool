/**
 * AI Changes 类型定义
 * 仅记录 AI 写入工具在单个对话回合中的文件变更，用于对话内展示与按回合还原
 * 不包含全局 checkpoint、文件监控自动存档等非 AI 变更
 */

/** 单文件在一次 AI 回合中的变更详情 */
export interface AiFileChange {
  /** 相对工作区根路径 */
  filePath: string
  /** 变更类型 */
  changeType: 'added' | 'modified' | 'deleted'
  /** 新增行数（基于统一 diff 统计） */
  linesAdded: number
  /** 删除行数 */
  linesRemoved: number
  /** 改前内容哈希（用于去重/校验，大文件可选存哈希+可选磁盘快照路径） */
  beforeHash?: string
  /** 改后内容哈希 */
  afterHash?: string
  /** 统一 diff 文本；超长时截断并指向 snapshot 路径 */
  unifiedDiff?: string
  /** 相对 .ai-workspace-vcs/ai-turns/<turnId>/ 的 before 快照相对路径 */
  beforeSnapshotRel?: string
}

/** 挂在 assistant Message.metadata.aiChanges 上的完整回合变更记录 */
export interface AiTurnChanges {
  /** 本回合唯一 ID（可用 messageId 或生成） */
  turnId: string
  /** 所属对话 ID */
  conversationId: string
  /** 关联的 assistant 消息 ID */
  messageId: string
  /** 工作区 ID */
  workspaceId: string
  /** 创建时间戳 */
  createdAt: number
  /** 变更文件列表 */
  files: AiFileChange[]
  /** 汇总统计 */
  summary: {
    filesChanged: number
    linesAdded: number
    linesRemoved: number
  }
  /** 是否已成功写入全部快照，可供还原 */
  restorable: boolean
}

/** 写入前采集到的单文件草稿（内存中按回合合并） */
export interface AiFileChangeDraft {
  filePath: string
  changeType: 'added' | 'modified' | 'deleted'
  beforeContent: string
  afterContent: string
}

/** 每个 AI 回合的内存缓冲区 */
export interface AiTurnBuffer {
  turnId: string
  conversationId: string
  messageId: string
  workspaceId: string
  createdAt: number
  fileDrafts: Map<string, AiFileChangeDraft>
}

/** AiTurnChanges 持久化存储结构（写入消息 metadata） */
export interface AiTurnChangesStored extends AiTurnChanges {
  _persisted: true
}

/** 还原操作的结果 */
export interface AiTurnRestoreResult {
  success: boolean
  restoredFiles: string[]
  failedFiles: { filePath: string; error: string }[]
  message: string
}

/** 用于计算统一 diff 的工具类型 */
export interface UnifiedDiffOptions {
  contextLines?: number
  maxLength?: number
}

/** 计算行数统计的结果 */
export interface LineStats {
  linesAdded: number
  linesRemoved: number
}

/** 生成统一 diff 并统计行数 */
export function computeUnifiedDiffAndStats(
  oldContent: string,
  newContent: string,
  filePath: string,
  options: UnifiedDiffOptions = {}
): { diff: string; stats: LineStats } {
  const contextLines = options.contextLines ?? 3
  const maxLength = options.maxLength ?? 50000

  // 简单的 LCS diff 实现（行级）
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // 计算最长公共子序列
  const dp: number[][] = Array(oldLines.length + 1)
    .fill(null)
    .map(() => Array(newLines.length + 1).fill(0))

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // 回溯生成 diff
  const diffLines: string[] = []
  let i = 0
  let j = 0
  let linesAdded = 0
  let linesRemoved = 0

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffLines.push(` ${oldLines[i]}`)
      i++
      j++
    } else if (j < newLines.length && (i >= oldLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
      diffLines.push(`+${newLines[j]}`)
      linesAdded++
      j++
    } else {
      diffLines.push(`-${oldLines[i]}`)
      linesRemoved++
      i++
    }
  }

  let diff = diffLines.join('\n')
  if (diff.length > maxLength) {
    diff = diff.slice(0, maxLength) + '\n... (diff truncated)'
  }

  return { diff, stats: { linesAdded, linesRemoved } }
}

/** 简单哈希函数 */
export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}