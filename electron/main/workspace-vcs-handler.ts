/**
 * 工作区版本控制（VCS）Handler
 *
 * 在 Electron 主进程中管理 `.ai-workspace-vcs/` 目录，
 * 提供存档点的创建、列出、还原、清理等文件系统操作。
 *
 * 目录结构：
 *   .ai-workspace-vcs/
 *   ├── index.json          ← 存档点索引
 *   ├── checkpoints/
 *   │   ├── cp-uuid-1/
 *   │   │   ├── metadata.json
 *   │   │   ├── snapshot/   ← 文件快照（相对路径副本）
 *   │   │   └── messages.json  ← 压缩前消息快照（可选）
 *   │   └── cp-uuid-2/ ...
 *   └── config.json         ← 工作区配置副本
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { join, relative, dirname } from 'path'
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  copyFile,
  rm,
  rmdir,
  access,
  constants,
} from 'fs/promises'

// ---- 内部类型（与渲染进程共享结构，但主进程不导入前端类型） ----

interface CheckpointIndexEntry {
  id: string
  workspaceId: string
  conversationId?: string
  description: string
  type: string
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  filePaths: string[]
  createdAt: number
}

interface CheckpointFileChange {
  filePath: string
  changeType: 'added' | 'modified' | 'deleted'
  linesAdded: number
  linesRemoved: number
  /** 统一格式的 diff 内容（每行格式：+ 新增, - 删除, 空格 不变） */
  unifiedDiff?: string
}

interface CheckpointMetadata {
  id: string
  workspaceId: string
  conversationId?: string
  description: string
  type: string
  fileChanges: CheckpointFileChange[]
  createdAt: number
}

// ---- 工具函数 ----

const VCS_DIR = '.ai-workspace-vcs'
const INDEX_FILE = 'index.json'
const CHECKPOINTS_DIR = 'checkpoints'
const AGENTS_FILE = 'agents.json'

/** 获取 .ai-workspace-vcs 目录路径 */
function getVcsDir(folderPath: string): string {
  return join(folderPath, VCS_DIR)
}

/** 确保目录存在 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await access(dirPath, constants.F_OK)
  } catch {
    await mkdir(dirPath, { recursive: true })
  }
}

/** 安全读取 JSON 文件 */
async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return defaultValue
  }
}

/** 安全写入 JSON 文件 */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/** 递归复制目录 */
async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest)
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

/** 递归统计目录中的文件行数变化（简化版：统计文件大小差异） */
async function getFileStats(filePath: string): Promise<{ lines: number }> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n').length
    return { lines }
  } catch {
    return { lines: 0 }
  }
}

/**
 * 计算两个字符串的 unified diff
 * 返回格式化的 diff 字符串，每行前缀：+ 新增, - 删除, 空格 不变
 */
function computeUnifiedDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  
  // 使用 LCS（最长公共子序列）算法计算 diff
  const m = oldLines.length
  const n = newLines.length
  
  // 构建 LCS 表格
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0))
  
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
  const diffLines: string[] = []
  let i = m
  let j = n
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffLines.unshift(' ' + oldLines[i - 1])
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffLines.unshift('+' + newLines[j - 1])
      j--
    } else if (i > 0) {
      diffLines.unshift('-' + oldLines[i - 1])
      i--
    }
  }
  
  return diffLines.join('\n')
}

/** 读取文件内容，失败时返回空字符串 */
async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

/** 获取前一个存档点的文件状态 */
async function getPreviousFileChanges(
  vcsDir: string,
  checkpointId: string
): Promise<Map<string, { content: string; changeType: string }>> {
  const index = await readJson<CheckpointIndexEntry[]>(join(vcsDir, INDEX_FILE), [])
  
  // 按时间正序排列（索引文件中可能是正序）
  const sortedIndex = [...index].sort((a, b) => a.createdAt - b.createdAt)
  const cpIndex = sortedIndex.findIndex((cp) => cp.id === checkpointId)
  
  if (cpIndex <= 0) {
    return new Map()
  }
  
  // 找到前一个存档点（按时间顺序的前一个）
  const prevCp = sortedIndex[cpIndex - 1]
  if (!prevCp) {
    return new Map()
  }
  
  const prevCpDir = join(vcsDir, CHECKPOINTS_DIR, prevCp.id)
  const metadataPath = join(prevCpDir, 'metadata.json')
  const metadata = await readJson<CheckpointMetadata | null>(metadataPath, null)
  
  if (!metadata || !metadata.fileChanges) {
    return new Map()
  }
  
  const result = new Map<string, { content: string; changeType: string }>()
  for (const change of metadata.fileChanges) {
    const snapshotPath = join(vcsDir, CHECKPOINTS_DIR, prevCp.id, 'snapshot', change.filePath)
    const content = await readFileSafe(snapshotPath)
    result.set(change.filePath, { content, changeType: change.changeType })
  }
  
  return result
}

/** 忽略的目录列表 */
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
])

/** 检查路径是否应被忽略 */
function shouldIgnore(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/)
  return parts.some((part) => IGNORED_DIRS.has(part))
}

// ---- 核心操作 ----

/**
 * 初始化工作区 VCS 目录结构
 */
async function initWorkspaceVCS(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    await ensureDir(join(vcsDir, CHECKPOINTS_DIR))

    // 写入初始索引（如果不存在）
    const indexPath = join(vcsDir, INDEX_FILE)
    try {
      await access(indexPath, constants.F_OK)
    } catch {
      await writeJson(indexPath, [])
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 创建存档点
 */
async function createCheckpoint(
  folderPath: string,
  checkpointId: string,
  description: string,
  type: string,
  workspaceId: string,
  conversationId?: string,
  filePaths?: string[]
): Promise<{ success: boolean; checkpointId?: string; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    await ensureDir(join(vcsDir, CHECKPOINTS_DIR))

    const cpDir = join(vcsDir, CHECKPOINTS_DIR, checkpointId)
    await ensureDir(cpDir)

    const snapshotDir = join(cpDir, 'snapshot')

    let fileChanges: CheckpointFileChange[] = []
    let totalFilesChanged = 0
    let totalLinesAdded = 0
    let totalLinesRemoved = 0
    const changedPaths: string[] = []

    // 获取前一个存档点的文件状态（用于计算 diff）
    const previousFileMap = await getPreviousFileChanges(vcsDir, checkpointId)

    if (filePaths && filePaths.length > 0) {
      // 指定文件快照模式：只复制指定的文件
      await ensureDir(snapshotDir)
      for (const fp of filePaths) {
        const absPath = join(folderPath, fp)
        const destPath = join(snapshotDir, fp)
        try {
          await ensureDir(dirname(destPath))
          await copyFile(absPath, destPath)
          
          const newContent = await readFileSafe(absPath)
          const stats = await getFileStats(absPath)
          
          // 计算 diff
          const oldEntry = previousFileMap.get(fp)
          let changeType: 'added' | 'modified' | 'deleted' = 'modified'
          let unifiedDiff = ''
          let linesAdded = 0
          let linesRemoved = 0
          
          if (!oldEntry || oldEntry.changeType === 'deleted') {
            // 新文件
            changeType = 'added'
            unifiedDiff = newContent.split('\n').map(line => '+' + line).join('\n')
            linesAdded = newContent.split('\n').length
          } else {
            // 修改的文件，计算 diff
            const oldContent = oldEntry.content
            if (oldContent !== newContent) {
              changeType = 'modified'
              unifiedDiff = computeUnifiedDiff(oldContent, newContent)
              // 计算增减行数
              const diffLines = unifiedDiff.split('\n')
              linesAdded = diffLines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length
              linesRemoved = diffLines.filter(line => line.startsWith('-') && !line.startsWith('---')).length
            } else {
              // 内容相同，但仍然是修改类型的存档（如手动存档）
              linesAdded = stats.lines
            }
          }
          
          fileChanges.push({
            filePath: fp,
            changeType,
            linesAdded,
            linesRemoved,
            unifiedDiff: unifiedDiff || undefined,
          })
          totalLinesAdded += linesAdded
          totalLinesRemoved += linesRemoved
          totalFilesChanged++
          changedPaths.push(fp)
        } catch {
          // 文件可能不存在（新增或已删除），跳过
        }
      }
    } else {
      // 全量快照模式：扫描工作区目录
      await ensureDir(snapshotDir)
      const scanned = await scanAndCopyFolder(folderPath, snapshotDir, previousFileMap)
      fileChanges = scanned.fileChanges
      totalFilesChanged = scanned.totalFiles
      totalLinesAdded = scanned.totalLinesAdded
      totalLinesRemoved = scanned.totalLinesRemoved
      changedPaths.push(...scanned.allPaths)
    }

    // 写入存档点元数据
    const metadata: CheckpointMetadata = {
      id: checkpointId,
      workspaceId,
      conversationId,
      description,
      type,
      fileChanges,
      createdAt: Date.now(),
    }
    await writeJson(join(cpDir, 'metadata.json'), metadata)

    // 更新索引
    const indexPath = join(vcsDir, INDEX_FILE)
    const index = await readJson<CheckpointIndexEntry[]>(indexPath, [])
    const indexEntry: CheckpointIndexEntry = {
      id: checkpointId,
      workspaceId,
      conversationId,
      description,
      type,
      filesChanged: totalFilesChanged,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      filePaths: changedPaths.slice(0, 10), // 只保留前 10 个
      createdAt: metadata.createdAt,
    }
    index.push(indexEntry)
    await writeJson(indexPath, index)

    return { success: true, checkpointId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 递归扫描并复制文件夹内容（跳过忽略目录）
 */
async function scanAndCopyFolder(
  src: string,
  dest: string,
  previousFileMap?: Map<string, { content: string; changeType: string }>
): Promise<{ fileChanges: CheckpointFileChange[]; totalFiles: number; totalLines: number; totalLinesAdded: number; totalLinesRemoved: number; allPaths: string[] }> {
  const fileChanges: CheckpointFileChange[] = []
  const allPaths: string[] = []
  let totalFiles = 0
  let totalLines = 0
  let totalLinesAdded = 0
  let totalLinesRemoved = 0

  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const relPath = entry.name
    if (shouldIgnore(relPath)) continue

    const srcPath = join(src, relPath)
    const destPath = join(dest, relPath)

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
      // 统计子目录中的文件
      const subFiles = await countFiles(srcPath)
      totalFiles += subFiles.count
      totalLines += subFiles.lines
      allPaths.push(...subFiles.paths)
    } else {
      await copyFile(srcPath, destPath)
      const newContent = await readFileSafe(srcPath)
      const stats = await getFileStats(srcPath)
      totalLines += stats.lines
      totalFiles++
      allPaths.push(relPath)
      
      // 计算 diff
      let changeType: 'added' | 'modified' | 'deleted' = 'modified'
      let unifiedDiff = ''
      let linesAdded = stats.lines
      let linesRemoved = 0
      
      if (previousFileMap) {
        const oldEntry = previousFileMap.get(relPath)
        if (!oldEntry || oldEntry.changeType === 'deleted') {
          changeType = 'added'
          unifiedDiff = newContent.split('\n').map(line => '+' + line).join('\n')
          linesRemoved = 0
        } else {
          const oldContent = oldEntry.content
          if (oldContent !== newContent) {
            changeType = 'modified'
            unifiedDiff = computeUnifiedDiff(oldContent, newContent)
            const diffLines = unifiedDiff.split('\n')
            linesAdded = diffLines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length
            linesRemoved = diffLines.filter(line => line.startsWith('-') && !line.startsWith('---')).length
          } else {
            changeType = 'modified'
            linesAdded = stats.lines
            linesRemoved = 0
          }
        }
      }
      
      fileChanges.push({
        filePath: relPath,
        changeType,
        linesAdded,
        linesRemoved,
        unifiedDiff: unifiedDiff || undefined,
      })
      totalLinesAdded += linesAdded
      totalLinesRemoved += linesRemoved
    }
  }

  return { fileChanges, totalFiles, totalLines, totalLinesAdded, totalLinesRemoved, allPaths }
}

/** 递归统计文件数量和行数 */
async function countFiles(
  dirPath: string
): Promise<{ count: number; lines: number; paths: string[] }> {
  let count = 0
  let lines = 0
  const paths: string[] = []

  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue

    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const sub = await countFiles(fullPath)
      count += sub.count
      lines += sub.lines
      paths.push(...sub.paths)
    } else {
      count++
      const stats = await getFileStats(fullPath)
      lines += stats.lines
      paths.push(entry.name)
    }
  }

  return { count, lines, paths }
}

/**
 * 列出工作区的所有存档点索引
 */
async function listCheckpoints(
  folderPath: string
): Promise<{ success: boolean; checkpoints?: CheckpointIndexEntry[]; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const indexPath = join(vcsDir, INDEX_FILE)
    const checkpoints = await readJson<CheckpointIndexEntry[]>(indexPath, [])
    // 按时间倒序
    checkpoints.sort((a, b) => b.createdAt - a.createdAt)
    return { success: true, checkpoints }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 获取存档点详情
 */
async function getCheckpointDetail(
  folderPath: string,
  checkpointId: string
): Promise<{ success: boolean; detail?: CheckpointMetadata; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const cpDir = join(vcsDir, CHECKPOINTS_DIR, checkpointId)
    const metadataPath = join(cpDir, 'metadata.json')
    const metadata = await readJson<CheckpointMetadata | null>(metadataPath, null)
    if (!metadata) {
      return { success: false, error: '存档点不存在' }
    }
    return { success: true, detail: metadata }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 还原到指定存档点
 * 将存档点快照中的文件复制回工作区目录
 */
async function restoreCheckpoint(
  folderPath: string,
  checkpointId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const cpDir = join(vcsDir, CHECKPOINTS_DIR, checkpointId)
    const snapshotDir = join(cpDir, 'snapshot')

    // 检查快照是否存在
    try {
      await access(snapshotDir, constants.F_OK)
    } catch {
      return { success: false, error: '存档点快照不存在' }
    }

    // 读取元数据获取变更的文件列表
    const metadata = await readJson<CheckpointMetadata | null>(
      join(cpDir, 'metadata.json'),
      null
    )

    if (metadata && metadata.fileChanges.length > 0) {
      // 增量还原：只还原变更的文件
      for (const change of metadata.fileChanges) {
        const srcPath = join(snapshotDir, change.filePath)
        const destPath = join(folderPath, change.filePath)

        if (change.changeType === 'deleted') {
          // 还原时需要删除该文件（原始快照中不存在）
          try {
            await rm(destPath)
          } catch {
            // 文件可能已经不存在
          }
        } else {
          // 复制快照文件到工作区
          try {
            await ensureDir(dirname(destPath))
            await copyFile(srcPath, destPath)
          } catch {
            // 文件可能在快照中不存在
          }
        }
      }
    } else {
      // 全量还原：将整个快照目录复制回工作区
      await copyDir(snapshotDir, folderPath)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 保存消息历史快照（压缩前保存）
 */
async function saveMessages(
  folderPath: string,
  checkpointId: string,
  messages: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const cpDir = join(vcsDir, CHECKPOINTS_DIR, checkpointId)
    await ensureDir(cpDir)
    await writeJson(join(cpDir, 'messages.json'), messages)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 读取消息历史快照
 */
async function loadMessages(
  folderPath: string,
  checkpointId: string
): Promise<{ success: boolean; messages?: unknown; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const cpDir = join(vcsDir, CHECKPOINTS_DIR, checkpointId)
    const messagesPath = join(cpDir, 'messages.json')
    const messages = await readJson<unknown>(messagesPath, null)
    if (messages === null) {
      return { success: false, error: '消息快照不存在' }
    }
    return { success: true, messages }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 保存工作区会话（消息 + 终端历史）到 .ai-workspace-vcs/session.json
 */
async function saveSession(
  folderPath: string,
  sessionData: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    await ensureDir(vcsDir)
    await writeJson(join(vcsDir, 'session.json'), sessionData)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 加载工作区会话（消息 + 终端历史）从 .ai-workspace-vcs/session.json
 */
async function loadSession(
  folderPath: string
): Promise<{ success: boolean; session?: unknown; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const sessionPath = join(vcsDir, 'session.json')
    const session = await readJson<unknown>(sessionPath, null)
    if (session === null) {
      return { success: true, session: null }
    }
    return { success: true, session }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 清理超过最大数量的旧存档点
 */
async function cleanupCheckpoints(
  folderPath: string,
  maxCheckpoints: number
): Promise<{ success: boolean; removed?: number; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const indexPath = join(vcsDir, INDEX_FILE)
    const index = await readJson<CheckpointIndexEntry[]>(indexPath, [])

    if (index.length <= maxCheckpoints) {
      return { success: true, removed: 0 }
    }

    // 按时间正序排列，保留最新的 maxCheckpoints 个
    index.sort((a, b) => a.createdAt - b.createdAt)
    const toRemove = index.slice(0, index.length - maxCheckpoints)
    const toKeep = index.slice(index.length - maxCheckpoints)

    // 删除旧存档点目录
    for (const entry of toRemove) {
      const cpDir = join(vcsDir, CHECKPOINTS_DIR, entry.id)
      try {
        await rm(cpDir, { recursive: true, force: true })
      } catch {
        // 忽略删除失败
      }
    }

    // 更新索引
    await writeJson(indexPath, toKeep)

    return { success: true, removed: toRemove.length }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 选择文件夹（打开系统对话框）
 */
async function selectFolder(): Promise<{
  success: boolean
  folderPath?: string
  canceled?: boolean
  error?: string
}> {
  try {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: '选择工作区文件夹',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true }
    }

    return { success: true, folderPath: result.filePaths[0] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ---- 工作区 Agent 操作 ----

/**
 * 加载工作区 Agent 列表
 */
async function loadWorkspaceAgents(
  folderPath: string
): Promise<{ success: boolean; agents?: unknown[]; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const agentsPath = join(vcsDir, AGENTS_FILE)
    const agents = await readJson<unknown[]>(agentsPath, [])
    return { success: true, agents }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 保存工作区 Agent 列表（全量覆盖）
 */
async function saveWorkspaceAgents(
  folderPath: string,
  agents: unknown[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    await ensureDir(vcsDir)
    await writeJson(join(vcsDir, AGENTS_FILE), agents)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 添加单个工作区 Agent
 */
async function addWorkspaceAgent(
  folderPath: string,
  agent: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    await ensureDir(vcsDir)
    const agentsPath = join(vcsDir, AGENTS_FILE)
    const agents = await readJson<Record<string, unknown>[]>(agentsPath, [])
    // 检查是否已存在
    if (agents.some((a) => a.id === agent.id)) {
      return { success: false, error: `Agent "${agent.id}" 已存在` }
    }
    agents.push(agent)
    await writeJson(agentsPath, agents)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 更新单个工作区 Agent
 */
async function updateWorkspaceAgent(
  folderPath: string,
  agent: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const agentsPath = join(vcsDir, AGENTS_FILE)
    const agents = await readJson<Record<string, unknown>[]>(agentsPath, [])
    const index = agents.findIndex((a) => a.id === agent.id)
    if (index === -1) {
      return { success: false, error: `Agent "${agent.id}" 不存在` }
    }
    agents[index] = agent
    await writeJson(agentsPath, agents)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 删除单个工作区 Agent
 */
async function deleteWorkspaceAgent(
  folderPath: string,
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const vcsDir = getVcsDir(folderPath)
    const agentsPath = join(vcsDir, AGENTS_FILE)
    const agents = await readJson<Record<string, unknown>[]>(agentsPath, [])
    const filtered = agents.filter((a) => a.id !== agentId)
    if (filtered.length === agents.length) {
      return { success: false, error: `Agent "${agentId}" 不存在` }
    }
    await writeJson(agentsPath, filtered)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ---- IPC Handler 注册 ----

export function setupWorkspaceVCSHandlers(): void {
  // 初始化 VCS 目录
  ipcMain.handle('workspace:vcs:init', async (_event, folderPath: string) => {
    return initWorkspaceVCS(folderPath)
  })

  // 创建存档点
  ipcMain.handle(
    'workspace:vcs:create-checkpoint',
    async (
      _event,
      params: {
        folderPath: string
        checkpointId: string
        description: string
        type: string
        workspaceId: string
        conversationId?: string
        filePaths?: string[]
      }
    ) => {
      return createCheckpoint(
        params.folderPath,
        params.checkpointId,
        params.description,
        params.type,
        params.workspaceId,
        params.conversationId,
        params.filePaths
      )
    }
  )

  // 列出存档点
  ipcMain.handle('workspace:vcs:list-checkpoints', async (_event, folderPath: string) => {
    return listCheckpoints(folderPath)
  })

  // 获取存档点详情
  ipcMain.handle(
    'workspace:vcs:get-checkpoint-detail',
    async (_event, folderPath: string, checkpointId: string) => {
      return getCheckpointDetail(folderPath, checkpointId)
    }
  )

  // 还原存档点
  ipcMain.handle(
    'workspace:vcs:restore-checkpoint',
    async (_event, folderPath: string, checkpointId: string) => {
      return restoreCheckpoint(folderPath, checkpointId)
    }
  )

  // 保存消息历史快照
  ipcMain.handle(
    'workspace:vcs:save-messages',
    async (_event, folderPath: string, checkpointId: string, messages: unknown) => {
      return saveMessages(folderPath, checkpointId, messages)
    }
  )

  // 读取消息历史快照
  ipcMain.handle(
    'workspace:vcs:load-messages',
    async (_event, folderPath: string, checkpointId: string) => {
      return loadMessages(folderPath, checkpointId)
    }
  )

  // 清理旧存档点
  ipcMain.handle(
    'workspace:vcs:cleanup',
    async (_event, folderPath: string, maxCheckpoints: number) => {
      return cleanupCheckpoints(folderPath, maxCheckpoints)
    }
  )

  // 选择文件夹
  ipcMain.handle('workspace:select-folder', async () => {
    return selectFolder()
  })

  // 保存工作区会话（消息 + 终端历史）
  ipcMain.handle(
    'workspace:vcs:save-session',
    async (_event, folderPath: string, sessionData: unknown) => {
      return saveSession(folderPath, sessionData)
    }
  )

  // 加载工作区会话（消息 + 终端历史）
  ipcMain.handle(
    'workspace:vcs:load-session',
    async (_event, folderPath: string) => {
      return loadSession(folderPath)
    }
  )

  // ---- 工作区 Agent Handler ----

  // 加载工作区 Agent 列表
  ipcMain.handle('workspace:vcs:load-agents', async (_event, folderPath: string) => {
    return loadWorkspaceAgents(folderPath)
  })

  // 保存工作区 Agent 列表（全量覆盖）
  ipcMain.handle(
    'workspace:vcs:save-agents',
    async (_event, folderPath: string, agents: unknown[]) => {
      return saveWorkspaceAgents(folderPath, agents)
    }
  )

  // 添加单个工作区 Agent
  ipcMain.handle(
    'workspace:vcs:add-agent',
    async (_event, folderPath: string, agent: Record<string, unknown>) => {
      return addWorkspaceAgent(folderPath, agent)
    }
  )

  // 更新单个工作区 Agent
  ipcMain.handle(
    'workspace:vcs:update-agent',
    async (_event, folderPath: string, agent: Record<string, unknown>) => {
      return updateWorkspaceAgent(folderPath, agent)
    }
  )

  // 删除单个工作区 Agent
  ipcMain.handle(
    'workspace:vcs:delete-agent',
    async (_event, folderPath: string, agentId: string) => {
      return deleteWorkspaceAgent(folderPath, agentId)
    }
  )

  console.log('[WorkspaceVCS] Handler 已注册')
}
