/**
 * AI Changes Service（渲染进程）
 *
 * 采集 AI 写入工具在单个对话回合中的文件变更，缓存于内存，
 * 回合结束时 flush 到消息 metadata.aiChanges 并落盘 before 快照。
 * 仅记录 AI 写入工具（workspace:write_file, workspace:str_replace_editor）。
 */
import type {
  AiFileChangeDraft,
  AiTurnBuffer,
  AiTurnChanges,
  AiFileChange,
  AiTurnRestoreResult,
} from '@/types/ai-changes'
import { computeUnifiedDiffAndStats, simpleHash } from '@/types/ai-changes'

/** 最大快照文件大小（超过则不存内容，仅存 hash） */
const MAX_SNAPSHOT_BYTES = 512 * 1024 // 512KB

/** 获取 Electron workspace.fs API（安全方式，不直接 import electron） */
function getWorkspaceFs() {
  if (typeof window === 'undefined' || !window.electronAPI?.workspace?.fs) {
    return null
  }
  return window.electronAPI.workspace.fs
}

function normalizeRoot(workspaceRoot: string): string {
  return workspaceRoot.replace(/[/\\]+$/, '')
}

function joinPath(root: string, relativePath: string): string {
  const normalizedRoot = normalizeRoot(root)
  const normalizedRel = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${normalizedRoot}/${normalizedRel}`
}

/** 将相对路径编码为可安全落盘的快照文件名（可逆） */
function encodeSnapshotFileName(filePath: string): string {
  return encodeURIComponent(filePath.replace(/\\/g, '/'))
}

/** 从快照文件名还原相对路径 */
function decodeSnapshotFileName(name: string): string {
  const base = name.endsWith('.before') ? name.slice(0, -'.before'.length) : name
  try {
    return decodeURIComponent(base)
  } catch {
    // 兼容旧版把路径中的分隔符直接替换为 _
    return base.replace(/_/g, '/')
  }
}

class AiChangesService {
  private buffers = new Map<string, AiTurnBuffer>()

  /** 生成回合 ID */
  private generateTurnId(): string {
    return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  /** 获取回合缓冲 key */
  private bufferKey(conversationId: string, messageId: string): string {
    return `${conversationId}:${messageId}`
  }

  /** 获取或创建回合缓冲区 */
  getOrCreateBuffer(
    conversationId: string,
    messageId: string,
    workspaceId: string
  ): AiTurnBuffer {
    const key = this.bufferKey(conversationId, messageId)
    let buffer = this.buffers.get(key)
    if (!buffer) {
      buffer = {
        turnId: this.generateTurnId(),
        conversationId,
        messageId,
        workspaceId,
        createdAt: Date.now(),
        fileDrafts: new Map(),
      }
      this.buffers.set(key, buffer)
    }
    return buffer
  }

  /**
   * 记录写入前文件快照（在写入前调用）。
   * 同一回合多次写同一文件时，仅保留首次 before。
   */
  async recordBeforeWrite(
    conversationId: string,
    messageId: string,
    workspaceId: string,
    workspaceRoot: string,
    filePath: string,
  ): Promise<void> {
    const buffer = this.getOrCreateBuffer(conversationId, messageId, workspaceId)
    if (buffer.fileDrafts.has(filePath)) return

    let beforeContent = ''
    const api = getWorkspaceFs()
    if (api) {
      try {
        const fullPath = joinPath(workspaceRoot, filePath)
        const result = await api.readFile(fullPath)
        if (result?.success && result.content !== undefined) {
          beforeContent = result.content
        }
      } catch {
        // 文件不存在：beforeContent 保持空 → added
      }
    }

    buffer.fileDrafts.set(filePath, {
      filePath,
      changeType: beforeContent ? 'modified' : 'added',
      beforeContent,
      afterContent: '',
    })
  }

  /** 记录写入后的内容 */
  recordAfterWrite(
    conversationId: string,
    messageId: string,
    filePath: string,
    afterContent: string,
  ): void {
    const key = this.bufferKey(conversationId, messageId)
    const buffer = this.buffers.get(key)
    if (!buffer) return

    const draft = buffer.fileDrafts.get(filePath)
    if (!draft) return

    draft.afterContent = afterContent
    if (!draft.beforeContent && afterContent) {
      draft.changeType = 'added'
    } else if (draft.beforeContent && !afterContent) {
      draft.changeType = 'deleted'
    } else {
      draft.changeType = 'modified'
    }
  }

  /**
   * 记录 str_replace 类编辑结果。
   * 同一回合多次写同一文件：保留最早 before，更新末次 after。
   */
  recordStrReplaceAfterWrite(
    conversationId: string,
    messageId: string,
    workspaceId: string,
    filePath: string,
    beforeContent: string,
    afterContent: string,
  ): void {
    const buffer = this.getOrCreateBuffer(conversationId, messageId, workspaceId)
    const existing = buffer.fileDrafts.get(filePath)
    if (!existing) {
      buffer.fileDrafts.set(filePath, {
        filePath,
        changeType: beforeContent ? (afterContent ? 'modified' : 'deleted') : 'added',
        beforeContent,
        afterContent,
      })
      return
    }
    existing.afterContent = afterContent
    if (!existing.beforeContent && afterContent) {
      existing.changeType = 'added'
    } else if (existing.beforeContent && !afterContent) {
      existing.changeType = 'deleted'
    } else {
      existing.changeType = 'modified'
    }
  }

  /** 刷新回合缓冲 → AiTurnChanges，并落盘快照 */
  async flushTurn(
    conversationId: string,
    messageId: string,
    workspaceId: string,
    workspaceRoot: string,
  ): Promise<AiTurnChanges | null> {
    const key = this.bufferKey(conversationId, messageId)
    const buffer = this.buffers.get(key)
    if (!buffer) return null

    // 过滤无变更 / 未完成 after 的文件
    const realChanges = [...buffer.fileDrafts.values()].filter(
      (d) => d.afterContent !== undefined && d.beforeContent !== d.afterContent
    )

    if (realChanges.length === 0) {
      this.buffers.delete(key)
      return null
    }

    const files: AiFileChange[] = []
    let totalLinesAdded = 0
    let totalLinesRemoved = 0

    const api = getWorkspaceFs()
    const root = normalizeRoot(workspaceRoot)
    const turnsRoot = `${root}/.ai-workspace-vcs/ai-turns`
    const vcsDir = `${turnsRoot}/${buffer.turnId}`

    if (api) {
      try { await api.createDir(`${root}/.ai-workspace-vcs`) } catch { /* ignore */ }
      try { await api.createDir(turnsRoot) } catch { /* ignore */ }
      try { await api.createDir(vcsDir) } catch { /* ignore */ }
    }

    // 写入 path map，便于还原时正确还原相对路径
    const pathMap: Record<string, string> = {}

    for (const draft of realChanges) {
      const { diff, stats } = computeUnifiedDiffAndStats(
        draft.beforeContent,
        draft.afterContent,
        draft.filePath,
      )
      totalLinesAdded += stats.linesAdded
      totalLinesRemoved += stats.linesRemoved

      const beforeHash = simpleHash(draft.beforeContent)
      const afterHash = simpleHash(draft.afterContent)

      let beforeSnapshotRel: string | undefined
      const safeFileName = encodeSnapshotFileName(draft.filePath)
      pathMap[safeFileName] = draft.filePath

      if (api && draft.changeType !== 'added' && draft.beforeContent.length <= MAX_SNAPSHOT_BYTES) {
        try {
          await api.writeFile(`${vcsDir}/${safeFileName}.before`, draft.beforeContent)
          beforeSnapshotRel = `${buffer.turnId}/${safeFileName}.before`
        } catch {
          // 快照写入失败：仍可展示 diff，但不可完整还原
        }
      }

      // added 文件无需 before 快照；还原时删除即可
      if (draft.changeType === 'added') {
        try {
          if (api) await api.writeFile(`${vcsDir}/${safeFileName}.added`, '')
        } catch { /* ignore */ }
      }

      files.push({
        filePath: draft.filePath,
        changeType: draft.changeType,
        linesAdded: stats.linesAdded,
        linesRemoved: stats.linesRemoved,
        beforeHash,
        afterHash,
        unifiedDiff: diff || undefined,
        beforeSnapshotRel,
      })
    }

    if (api) {
      try {
        await api.writeFile(`${vcsDir}/paths.json`, JSON.stringify(pathMap, null, 2))
      } catch { /* ignore */ }
    }

    const turnChanges: AiTurnChanges = {
      turnId: buffer.turnId,
      conversationId: buffer.conversationId,
      messageId: buffer.messageId,
      workspaceId: workspaceId || buffer.workspaceId,
      createdAt: buffer.createdAt,
      files,
      summary: {
        filesChanged: files.length,
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved,
      },
      // added 可删；modified/deleted 需 before 快照
      restorable: files.every((f) =>
        f.changeType === 'added' ? true : Boolean(f.beforeSnapshotRel)
      ),
    }

    this.buffers.delete(key)
    return turnChanges
  }

  /**
   * 按回合还原：
   * - added → 删除文件
   * - modified/deleted → 写回 before 快照
   */
  async restoreTurn(
    workspaceRoot: string,
    turnChanges: AiTurnChanges,
  ): Promise<AiTurnRestoreResult> {
    const api = getWorkspaceFs()
    if (!api) {
      return {
        success: false,
        restoredFiles: [],
        failedFiles: [{ filePath: '', error: '无法获取工作区 API' }],
        message: '还原失败：环境不可用',
      }
    }

    const root = normalizeRoot(workspaceRoot)
    const snapshotDir = `${root}/.ai-workspace-vcs/ai-turns/${turnChanges.turnId}`
    const restoredFiles: string[] = []
    const failedFiles: { filePath: string; error: string }[] = []

    // 优先用 metadata 中的文件列表还原
    for (const file of turnChanges.files) {
      const targetPath = joinPath(root, file.filePath)
      try {
        if (file.changeType === 'added') {
          await api.deleteFile(targetPath)
          restoredFiles.push(file.filePath)
          continue
        }

        if (!file.beforeSnapshotRel) {
          failedFiles.push({ filePath: file.filePath, error: '缺少 before 快照' })
          continue
        }

        const snapshotFilePath = `${root}/.ai-workspace-vcs/ai-turns/${file.beforeSnapshotRel}`
        const contentR = await api.readFile(snapshotFilePath)
        if (!contentR.success || contentR.content === undefined) {
          throw new Error('读取快照失败')
        }
        await api.writeFile(targetPath, contentR.content)
        restoredFiles.push(file.filePath)
      } catch (e) {
        failedFiles.push({
          filePath: file.filePath,
          error: e instanceof Error ? e.message : '还原失败',
        })
      }
    }

    // 若 metadata 为空，回退扫描快照目录
    if (turnChanges.files.length === 0) {
      try {
        const entries = await api.readDir(snapshotDir)
        if (entries?.success && Array.isArray(entries.entries)) {
          for (const entry of entries.entries) {
            if (!entry.name.endsWith('.before')) continue
            const originalPath = decodeSnapshotFileName(entry.name)
            try {
              const contentR = await api.readFile(`${snapshotDir}/${entry.name}`)
              if (!contentR.success || contentR.content === undefined) {
                throw new Error('读取快照失败')
              }
              await api.writeFile(joinPath(root, originalPath), contentR.content)
              restoredFiles.push(originalPath)
            } catch (e) {
              failedFiles.push({
                filePath: originalPath,
                error: e instanceof Error ? e.message : '还原失败',
              })
            }
          }
        }
      } catch {
        // ignore fallback errors
      }
    }

    return {
      success: failedFiles.length === 0 && restoredFiles.length > 0,
      restoredFiles,
      failedFiles,
      message:
        failedFiles.length === 0
          ? `已还原 ${restoredFiles.length} 个文件到回合写入前状态`
          : restoredFiles.length > 0
            ? `部分还原：成功 ${restoredFiles.length}，失败 ${failedFiles.length}`
            : '还原失败：找不到可用快照',
    }
  }

  /** 删除回合缓冲 */
  discardBuffer(conversationId: string, messageId: string): void {
    const key = this.bufferKey(conversationId, messageId)
    this.buffers.delete(key)
  }

  /** 检查是否有活跃 buffer */
  hasBuffer(conversationId: string, messageId: string): boolean {
    const key = this.bufferKey(conversationId, messageId)
    return this.buffers.has(key)
  }
}

export const aiChangesService = new AiChangesService()