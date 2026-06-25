import { v4 as uuidv4 } from 'uuid'
import type { Prompt, PromptVersion, DiffResult, DiffLine } from '../types'

/** 最大保留版本数 */
const MAX_VERSIONS = 20

export const PromptVersionService = {
  /**
   * 保存当前 Prompt 状态为新版本快照
   */
  createSnapshot(prompt: Prompt, label?: string): PromptVersion {
    const nextVersion = prompt.currentVersion + 1
    return {
      id: uuidv4(),
      promptId: prompt.id,
      version: nextVersion,
      label: label ?? `v${nextVersion}`,
      snapshot: {
        name: prompt.name,
        description: prompt.description,
        content: prompt.content,
        sections: prompt.sections ? [...prompt.sections] : undefined,
        variables: prompt.variables ? [...prompt.variables] : undefined,
      },
      createdAt: Date.now(),
    }
  },

  /**
   * 将新版本添加到历史记录（自动裁剪超出上限的旧版本）
   */
  appendVersion(history: PromptVersion[], newVersion: PromptVersion): PromptVersion[] {
    const updated = [...history, newVersion]
    // 超出上限时移除最早的版本
    if (updated.length > MAX_VERSIONS) {
      return updated.slice(updated.length - MAX_VERSIONS)
    }
    return updated
  },

  /**
   * 回滚到指定版本 — 返回回滚后的 Prompt 字段更新
   */
  rollback(version: PromptVersion): {
    name: string
    description: string
    content: string
    sections?: Prompt['sections']
    variables: Prompt['variables']
  } {
    return {
      name: version.snapshot.name,
      description: version.snapshot.description,
      content: version.snapshot.content,
      sections: version.snapshot.sections,
      variables: version.snapshot.variables ?? [],
    }
  },

  /**
   * 计算两个版本之间的行级 Diff
   */
  computeDiff(v1: PromptVersion, v2: PromptVersion): DiffResult {
    const lines1 = v1.snapshot.content.split('\n')
    const lines2 = v2.snapshot.content.split('\n')
    return computeLineDiff(lines1, lines2)
  },

  /**
   * 计算任意两段文本的行级 Diff
   */
  computeTextDiff(text1: string, text2: string): DiffResult {
    const lines1 = text1.split('\n')
    const lines2 = text2.split('\n')
    return computeLineDiff(lines1, lines2)
  },
}

// ==================== 行级 LCS Diff 算法 ====================

function computeLineDiff(oldLines: string[], newLines: string[]): DiffResult {
  const m = oldLines.length
  const n = newLines.length

  // LCS DP 表
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', content: oldLines[i - 1], lineNumber: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', content: newLines[j - 1], lineNumber: j })
      j--
    } else {
      result.unshift({ type: 'removed', content: oldLines[i - 1] })
      i--
    }
  }

  const addedCount = result.filter((l) => l.type === 'added').length
  const removedCount = result.filter((l) => l.type === 'removed').length
  const unchangedCount = result.filter((l) => l.type === 'unchanged').length

  return { lines: result, addedCount, removedCount, unchangedCount }
}
