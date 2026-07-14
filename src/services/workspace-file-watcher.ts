/**
 * 工作区文件监控服务（渲染进程）
 *
 * 接收主进程推送的文件变更事件，
 * 根据 CheckpointPolicy 决定是否自动创建存档点。
 */

import { useWorkspaceStore } from '../stores/workspace-store'
import { workspaceVCSService } from './workspace-vcs-service'
import type { CheckpointPolicy } from '../types'

const api = () => window.electronAPI

// ---- 文件变更事件类型 ----

interface FileChangeEvent {
  eventType: 'created' | 'modified' | 'deleted'
  filePath: string
  timestamp: number
}

interface WatcherChangeData {
  folderPath: string
  events: FileChangeEvent[]
  timestamp: number
}

// ---- 防抖定时器 ----

let autoCheckpointTimer: ReturnType<typeof setTimeout> | null = null
const AUTO_CHECKPOINT_DEBOUNCE = 3000 // 3 秒防抖后自动创建存档

// ---- 文件监控服务 ----

export const workspaceFileWatcher = {
  /** 取消监听的回调函数 */
  _unsubscribe: null as (() => void) | null,
  /** 当前正在监控的目录路径 */
  _watchedPath: null as string | null,

  /**
   * 开始监控工作区目录
   *
   * 同时注册文件变更回调，根据策略自动触发存档。
   */
  async startWatching(
    folderPath: string,
    policy: CheckpointPolicy
  ): Promise<{ success: boolean; error?: string }> {
    // 先停止之前的监控
    await this.stopWatching()

    const result = await api().workspace.watcher.start(folderPath)

    if (result.success) {
      this._watchedPath = folderPath

      // 注册文件变更回调
      this._unsubscribe = api().workspace.watcher.onChange((data: { folderPath: string; events: unknown[]; timestamp: number }) => {
        this._handleFileChange(data as WatcherChangeData, policy)
      })

      // 更新 store 状态
      useWorkspaceStore.getState().setWatcherActive(true)
    }

    return result
  },

  /**
   * 停止监控
   */
  async stopWatching(): Promise<void> {
    // 取消事件监听
    if (this._unsubscribe) {
      this._unsubscribe()
      this._unsubscribe = null
    }

    // 清除可能残留的定时器
    if (autoCheckpointTimer) {
      clearTimeout(autoCheckpointTimer)
      autoCheckpointTimer = null
    }

    // 使用内部记录的路径停止监控（不依赖 store 状态，因为 deactivate 可能先执行）
    if (this._watchedPath) {
      await api().workspace.watcher.stop(this._watchedPath)
      this._watchedPath = null
    }

    useWorkspaceStore.getState().setWatcherActive(false)
  },

  /**
   * 处理文件变更事件
   */
  _handleFileChange(data: WatcherChangeData, policy: CheckpointPolicy): void {
    if (!data.events || data.events.length === 0) return

    // 根据策略决定是否自动创建存档
    if (policy === 'auto-before-modify') {
      this._scheduleAutoCheckpoint(data)
    }
    // 'manual' 策略不自动创建
    // 'timed' 策略由定时器管理（此处不做处理，由 UI 层启动定时器）
  },

  /**
   * 防抖调度自动存档
   */
  _scheduleAutoCheckpoint(data: WatcherChangeData): void {
    // 清除之前的定时器
    if (autoCheckpointTimer) {
      clearTimeout(autoCheckpointTimer)
    }

    // 防抖：等待文件变更停止后才创建存档
    autoCheckpointTimer = setTimeout(async () => {
      autoCheckpointTimer = null

      const store = useWorkspaceStore.getState()
      const workspace = store.getActiveWorkspace()
      if (!workspace) return

      // 生成变更描述
      const changeCount = data.events.length
      const fileNames = data.events
        .slice(0, 5)
        .map((e) => e.filePath)
        .join(', ')
      const description = changeCount > 5
        ? `自动存档：${fileNames}... 等 ${changeCount} 个文件变更`
        : `自动存档：${fileNames}`

      try {
        await workspaceVCSService.createCheckpoint({
          folderPath: workspace.folderPath,
          description,
          type: 'auto',
          workspaceId: workspace.id,
          filePaths: data.events.map((e) => e.filePath),
        })
      } catch (err) {
        console.error('[workspace-file-watcher] 自动存档失败:', err)
      }
    }, AUTO_CHECKPOINT_DEBOUNCE)
  },

  /**
   * 查询监控状态
   */
  async getStatus(folderPath: string): Promise<{ active: boolean; watching: boolean }> {
    return api().workspace.watcher.status(folderPath)
  },
}
