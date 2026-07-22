/**
 * 工作区文件监控服务（渲染进程）
 *
 * 接收主进程推送的文件变更事件，用于 UI 高亮 / Git 刷新。
 * 已废弃：根据文件事件自动创建 .ai-workspace-vcs 存档点。
 * 文件历史与协作改由 Git 负责；AI 修改记录由对话回合快照负责。
 */

import { useWorkspaceStore } from '../stores/workspace-store'
import type { CheckpointPolicy } from '../types'

const api = () => window.electronAPI

// ---- 文件变更事件类型 ----

export interface FileChangeEvent {
  eventType: 'created' | 'modified' | 'deleted'
  filePath: string
  timestamp: number
}

export interface WatcherChangeData {
  folderPath: string
  events: FileChangeEvent[]
  timestamp: number
}

type FileChangeListener = (data: WatcherChangeData) => void

// ---- 文件监控服务 ----

export const workspaceFileWatcher = {
  /** 取消监听的回调函数 */
  _unsubscribe: null as (() => void) | null,
  /** 当前正在监控的目录路径 */
  _watchedPath: null as string | null,
  /** 额外变更监听（如 Git status 刷新） */
  _listeners: new Set<FileChangeListener>(),

  /**
   * 开始监控工作区目录（不再自动创建存档点）
   */
  async startWatching(
    folderPath: string,
    _policy?: CheckpointPolicy
  ): Promise<{ success: boolean; error?: string }> {
    await this.stopWatching()

    const result = await api().workspace.watcher.start(folderPath)

    if (result.success) {
      this._watchedPath = folderPath

      this._unsubscribe = api().workspace.watcher.onChange((data: { folderPath: string; events: unknown[]; timestamp: number }) => {
        const payload = data as WatcherChangeData
        for (const listener of this._listeners) {
          try {
            listener(payload)
          } catch (err) {
            console.warn('[workspace-file-watcher] listener error:', err)
          }
        }
      })

      useWorkspaceStore.getState().setWatcherActive(true)
    }

    return result
  },

  /**
   * 停止监控
   */
  async stopWatching(): Promise<void> {
    if (this._unsubscribe) {
      this._unsubscribe()
      this._unsubscribe = null
    }

    if (this._watchedPath) {
      await api().workspace.watcher.stop(this._watchedPath)
      this._watchedPath = null
    }

    useWorkspaceStore.getState().setWatcherActive(false)
  },

  /**
   * 订阅文件变更（UI / Git 刷新用）
   */
  subscribe(listener: FileChangeListener): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  },

  /**
   * @deprecated 自动存档已废弃，保留空实现以兼容旧调用
   */
  cancelPendingAutoCheckpoint(): void {
    // no-op
  },

  /**
   * 查询监控状态
   */
  async getStatus(folderPath: string): Promise<{ active: boolean; watching: boolean }> {
    return api().workspace.watcher.status(folderPath)
  },
}
