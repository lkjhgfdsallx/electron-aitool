/**
 * 工作区文件监控 Handler
 *
 * 在 Electron 主进程中监控工作区目录的文件变更，
 * 将变更事件推送给渲染进程，供其决定是否自动创建存档点。
 *
 * 使用 Node.js 原生 fs.watch（无需额外依赖），
 * 支持递归监控（Windows/macOS 原生支持，Linux 需逐目录）。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { watch, FSWatcher } from 'fs'
import { join, relative, extname } from 'path'
import { readdir, stat } from 'fs/promises'

// ---- 忽略配置 ----

/** 忽略的目录名集合 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.ai-workspace-vcs',
  '.next',
  'dist',
  'build',
  '.cache',
  '__pycache__',
  '.DS_Store',
  '.idea',
  '.vscode',
  'coverage',
])

/** 忽略的文件扩展名 */
const IGNORED_EXTENSIONS = new Set([
  '.tmp',
  '.swp',
  '.swo',
  '~',
  '.log',
])

/** 检查路径是否应被忽略 */
function shouldIgnore(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/)
  // 检查每一级目录名是否在忽略列表中
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) return true
  }
  // 检查文件扩展名
  const ext = extname(relativePath)
  if (IGNORED_EXTENSIONS.has(ext)) return true
  return false
}

// ---- 文件变更事件类型 ----

interface FileChangeEvent {
  /** 变更类型 */
  eventType: 'created' | 'modified' | 'deleted'
  /** 文件相对路径（相对于工作区根目录） */
  filePath: string
  /** 变更时间戳 */
  timestamp: number
}

// ---- Watcher 管理 ----

/** 每个工作区的 watcher 状态 */
interface WatcherState {
  /** 工作区文件夹路径 */
  folderPath: string
  /** 主 watcher（根目录） */
  rootWatcher: FSWatcher | null
  /** 子目录 watcher 列表（Linux 回退方案） */
  subWatchers: Map<string, FSWatcher>
  /** 防抖定时器 */
  debounceTimer: ReturnType<typeof setTimeout> | null
  /** 累积的变更事件 */
  pendingEvents: FileChangeEvent[]
  /** 是否活跃 */
  active: boolean
}

/** 全局 watcher 管理 Map（键为工作区文件夹路径） */
const watchers = new Map<string, WatcherState>()

/** 防抖间隔（毫秒）— 在此时间窗口内的多次文件变更会被合并 */
const DEBOUNCE_INTERVAL = 500

/** 最大子目录监控深度（Linux 回退用） */
const MAX_WATCH_DEPTH = 3

/** 批量事件发送间隔（毫秒） */
const BATCH_SEND_INTERVAL = 1000

/**
 * 获取或创建 watcher 状态
 */
function getOrCreateWatcher(folderPath: string): WatcherState {
  let state = watchers.get(folderPath)
  if (!state) {
    state = {
      folderPath,
      rootWatcher: null,
      subWatchers: new Map(),
      debounceTimer: null,
      pendingEvents: [],
      active: false,
    }
    watchers.set(folderPath, state)
  }
  return state
}

/**
 * 向所有渲染进程广播文件变更事件
 */
function broadcastFileChanges(folderPath: string, events: FileChangeEvent[]): void {
  if (events.length === 0) return

  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:watcher:on-change', {
        folderPath,
        events,
        timestamp: Date.now(),
      })
    }
  })
}

/**
 * 处理文件变更事件（带防抖）
 */
function handleFileChange(
  state: WatcherState,
  eventType: FileChangeEvent['eventType'],
  filePath: string
): void {
  // 忽略不应监控的路径
  if (shouldIgnore(filePath)) return

  const event: FileChangeEvent = {
    eventType,
    filePath,
    timestamp: Date.now(),
  }

  state.pendingEvents.push(event)

  // 防抖：清除旧定时器，设置新定时器
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
  }

  state.debounceTimer = setTimeout(() => {
    const events = [...state.pendingEvents]
    state.pendingEvents = []
    state.debounceTimer = null

    // 去重：同一文件在防抖窗口内的多次变更合并为最后一次
    const deduped = deduplicateEvents(events)

    if (deduped.length > 0) {
      broadcastFileChanges(state.folderPath, deduped)
    }
  }, DEBOUNCE_INTERVAL)
}

/**
 * 去重事件：同一文件只保留最后一次变更
 */
function deduplicateEvents(events: FileChangeEvent[]): FileChangeEvent[] {
  const map = new Map<string, FileChangeEvent>()
  for (const event of events) {
    const existing = map.get(event.filePath)
    if (!existing || event.timestamp >= existing.timestamp) {
      map.set(event.filePath, event)
    }
  }
  return Array.from(map.values())
}

/**
 * 递归注册子目录 watcher（Linux 回退方案）
 * Linux 上 fs.watch 不支持 recursive 选项，
 * 需要为每个子目录单独创建 watcher。
 */
async function watchSubdirectories(
  state: WatcherState,
  dirPath: string,
  depth: number
): Promise<void> {
  if (depth > MAX_WATCH_DEPTH) return

  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (IGNORED_DIRS.has(entry.name)) continue

      const subDir = join(dirPath, entry.name)
      const relPath = relative(state.folderPath, subDir)

      if (shouldIgnore(relPath)) continue

      try {
        const subWatcher = watch(subDir, (eventType, filename) => {
          if (!filename) return
          const filePath = join(relPath, filename)
          handleFileChange(state, eventType === 'rename' ? 'modified' : 'modified', filePath)
        })
        state.subWatchers.set(subDir, subWatcher)

        // 递归注册更深的子目录
        await watchSubdirectories(state, subDir, depth + 1)
      } catch {
        // 子目录可能无权限访问，忽略
      }
    }
  } catch {
    // 目录可能无权限读取，忽略
  }
}

/**
 * 关闭所有 watcher
 */
function closeAllWatchers(state: WatcherState): void {
  if (state.rootWatcher) {
    state.rootWatcher.close()
    state.rootWatcher = null
  }
  for (const [, watcher] of state.subWatchers) {
    watcher.close()
  }
  state.subWatchers.clear()

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }

  state.pendingEvents = []
  state.active = false
}

// ---- IPC Handlers ----

/**
 * 启动文件监控
 */
async function startWatching(
  folderPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const state = getOrCreateWatcher(folderPath)

    // 如果已经在监控，先停止
    if (state.active) {
      closeAllWatchers(state)
    }

    // 尝试使用 recursive 模式（Windows 和 macOS 原生支持）
    try {
      state.rootWatcher = watch(folderPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        handleFileChange(state, eventType === 'rename' ? 'deleted' : 'modified', filename)
      })
      state.active = true
      console.log(`[workspace:watcher] 开始监控（recursive 模式）: ${folderPath}`)
    } catch {
      // 如果 recursive 失败（如 Linux），回退到手动递归
      console.log(`[workspace:watcher] recursive 模式不可用，回退到手动递归: ${folderPath}`)
      state.rootWatcher = watch(folderPath, (eventType, filename) => {
        if (!filename) return
        handleFileChange(state, eventType === 'rename' ? 'modified' : 'modified', filename)
      })
      await watchSubdirectories(state, folderPath, 0)
      state.active = true
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 停止文件监控
 */
function stopWatching(
  folderPath: string
): { success: boolean; error?: string } {
  try {
    const state = watchers.get(folderPath)
    if (state) {
      closeAllWatchers(state)
      watchers.delete(folderPath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 查询监控状态
 */
function getWatcherStatus(
  folderPath: string
): { active: boolean; watching: boolean } {
  const state = watchers.get(folderPath)
  return {
    active: state?.active ?? false,
    watching: state?.active ?? false,
  }
}

// ---- 注册 IPC ----

export function setupWorkspaceWatcherHandlers(): void {
  ipcMain.handle('workspace:watcher:start', async (_event, folderPath: string) => {
    return startWatching(folderPath)
  })

  ipcMain.handle('workspace:watcher:stop', (_event, folderPath: string) => {
    return stopWatching(folderPath)
  })

  ipcMain.handle('workspace:watcher:status', (_event, folderPath: string) => {
    return getWatcherStatus(folderPath)
  })

  // 应用退出时清理所有 watcher
  process.on('exit', () => {
    for (const [, state] of watchers) {
      closeAllWatchers(state)
    }
    watchers.clear()
  })

  console.log('[workspace:watcher] 文件监控 Handler 已注册')
}
