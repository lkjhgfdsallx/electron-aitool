/**
 * 工作区命令执行 Handler
 *
 * 在 Electron 主进程中执行 shell 命令，
 * 支持实时 stdout/stderr 流式输出、命令中止、超时保护。
 *
 * 命令审批逻辑在渲染进程层处理，此 handler 仅负责实际执行。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'

// ---- 命令执行状态管理 ----

interface RunningCommand {
  /** 命令 ID（由渲染进程生成） */
  commandId: string
  /** 子进程 */
  process: ChildProcess
  /** 启动时间 */
  startTime: number
  /** 超时定时器 */
  timeoutTimer: ReturnType<typeof setTimeout> | null
}

/** 正在执行的命令 Map */
const runningCommands = new Map<string, RunningCommand>()

/** 默认超时时间（毫秒）：5 分钟 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

/** 最大输出缓冲大小（字节）：10MB */
const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024

// ---- 平台检测 ----

const isWindows = platform() === 'win32'

/**
 * 将命令编码为 PowerShell 可接受的 Base64 字符串
 * PowerShell -EncodedCommand 要求使用 UTF-16LE 编码
 */
function encodePowerShellCommand(command: string): string {
  // 使用 UTF-16LE 编码（PowerShell 要求）
  const bytes = Buffer.from(command, 'utf-16le')
  return bytes.toString('base64')
}

/**
 * 获取适合当前平台的 shell 配置
 *
 * @returns { shell, args } - shell 是 shell 可执行文件路径，args 包含 shell 参数和命令
 */
function getShellConfig(command: string): { shell: string; args: string[] } {
  if (isWindows) {
    // Windows 上使用 powershell.exe
    // 使用 -NoProfile 快速启动，-EncodedCommand 执行 Base64 编码的命令
    const encodedCmd = encodePowerShellCommand(command)
    return {
      shell: 'powershell.exe',
      args: ['-NoProfile', '-EncodedCommand', encodedCmd],
    }
  }
  // Unix 上使用 /bin/sh -c "command"
  return {
    shell: '/bin/sh',
    args: ['-c', command],
  }
}

// ---- IPC Handlers ----

/**
 * 执行命令
 *
 * 返回 Promise，命令结束（或超时/中止）后 resolve。
 * 执行过程中通过 IPC 事件流式推送 stdout/stderr。
 */
async function executeCommand(
  commandId: string,
  command: string,
  workingDir: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  env?: Record<string, string>
): Promise<{
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  error?: string
  durationMs: number
}> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const { shell, args } = getShellConfig(command)

    // 合并环境变量
    const processEnv = { ...process.env, ...env }

    let stdoutChunks: string[] = []
    let stderrChunks: string[] = []
    let totalOutputSize = 0
    let killed = false

    try {
      const childProcess = spawn(shell, args, {
        cwd: workingDir,
        env: processEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Windows: 使用 CREATE_NO_WINDOW 隐藏控制台窗口
        ...(isWindows ? { windowsHide: true } : {}),
      })

      // 超时保护
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null
      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          killed = true
          childProcess.kill('SIGTERM')
          // 给进程 3 秒优雅退出，否则强制 kill
          setTimeout(() => {
            try { childProcess.kill('SIGKILL') } catch { /* 忽略 */ }
          }, 3000)
        }, timeoutMs)
      }

      // 注册到 runningCommands
      const runningCmd: RunningCommand = {
        commandId,
        process: childProcess,
        startTime,
        timeoutTimer,
      }
      runningCommands.set(commandId, runningCmd)

      // stdout 流式推送
      childProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        stdoutChunks.push(chunk)
        totalOutputSize += chunk.length

        // 防止输出缓冲区过大
        if (totalOutputSize > MAX_OUTPUT_BUFFER) {
          stdoutChunks = stdoutChunks.slice(-100) // 保留最近的 chunk
          stderrChunks = stderrChunks.slice(-100)
          totalOutputSize = stdoutChunks.join('').length + stderrChunks.join('').length
        }

        // 推送给渲染进程
        broadcastCommandOutput(commandId, 'stdout', chunk)
      })

      // stderr 流式推送
      childProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        stderrChunks.push(chunk)
        totalOutputSize += chunk.length

        broadcastCommandOutput(commandId, 'stderr', chunk)
      })

      // 进程结束
      childProcess.on('close', (code) => {
        // 清理
        if (timeoutTimer) clearTimeout(timeoutTimer)
        runningCommands.delete(commandId)

        const durationMs = Date.now() - startTime

        // 广播命令完成事件
        broadcastCommandComplete(commandId, code, killed)

        resolve({
          success: !killed,
          exitCode: code,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          error: killed ? (killed ? '命令已超时或被中止' : undefined) : undefined,
          durationMs,
        })
      })

      // 进程出错
      childProcess.on('error', (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        runningCommands.delete(commandId)

        const durationMs = Date.now() - startTime
        broadcastCommandComplete(commandId, 1, false)

        resolve({
          success: false,
          exitCode: 1,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          error: err.message,
          durationMs,
        })
      })
    } catch (err) {
      runningCommands.delete(commandId)
      resolve({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: String(err),
        durationMs: Date.now() - startTime,
      })
    }
  })
}

/**
 * 向渲染进程广播命令输出
 */
function broadcastCommandOutput(
  commandId: string,
  stream: 'stdout' | 'stderr',
  chunk: string
): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:command:output', {
        commandId,
        stream,
        chunk,
        timestamp: Date.now(),
      })
    }
  })
}

/**
 * 向渲染进程广播命令完成
 */
function broadcastCommandComplete(
  commandId: string,
  exitCode: number | null,
  killed: boolean
): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:command:complete', {
        commandId,
        exitCode,
        killed,
        timestamp: Date.now(),
      })
    }
  })
}

/**
 * 中止正在执行的命令
 */
function abortCommand(commandId: string): { success: boolean; error?: string } {
  const running = runningCommands.get(commandId)
  if (!running) {
    return { success: false, error: '命令不存在或已结束' }
  }

  try {
    // 清除超时定时器
    if (running.timeoutTimer) {
      clearTimeout(running.timeoutTimer)
    }

    // 先尝试 SIGTERM 优雅退出
    running.process.kill('SIGTERM')

    // 3 秒后强制 kill
    setTimeout(() => {
      try {
        running.process.kill('SIGKILL')
      } catch { /* 进程可能已退出 */ }
    }, 3000)

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * 获取正在执行的命令列表
 */
function getRunningCommands(): Array<{
  commandId: string
  startTime: number
  runningTime: number
}> {
  const now = Date.now()
  return Array.from(runningCommands.entries()).map(([, cmd]) => ({
    commandId: cmd.commandId,
    startTime: cmd.startTime,
    runningTime: now - cmd.startTime,
  }))
}

// ---- 风险评估辅助 ----

/**
 * 评估命令的风险等级（供渲染进程参考，主进程也可使用）
 * 注意：这只是一个粗略的评估，审批逻辑主要在渲染进程层
 */
function assessRiskLevel(command: string): 'safe' | 'medium' | 'high' | 'critical' {
  const cmd = command.trim().toLowerCase()

  // 危险命令关键词
  const criticalPatterns = [
    /\brm\s+(-[rf]+\s+)?\//,         // rm -rf /
    /\bformat\b/,                     // format
    /\bmkfs\b/,                       // mkfs
    /\bdd\s+.*of=\/dev/,              // dd of=/dev/...
    /\bshutdown\b/,                   // shutdown
    /\breboot\b/,                     // reboot
    /\binit\s+0\b/,                   // init 0
    />\s*\/dev\/sd/,                   // 写入磁盘设备
  ]

  const highPatterns = [
    /\brm\s+/,                         // rm（非根目录）
    /\brmdir\b/,                       // rmdir
    /\bchmod\s+777\b/,                // chmod 777
    /\bchown\b/,                       // chown
    /\bsudo\b/,                        // sudo
    /\bkill\s+-9\b/,                  // kill -9
    /\bpkill\b/,                       // pkill
  ]

  const mediumPatterns = [
    /\bnpm\s+(install|uninstall|publish)\b/,
    /\byarn\s+(add|remove|publish)\b/,
    /\bpnpm\s+(add|remove|publish)\b/,
    /\bgit\s+(push|force|reset\s+--hard|clean)\b/,
    /\bcurl\b.*\|\s*(bash|sh)\b/,    // curl | bash
    /\bwget\b.*\|\s*(bash|sh)\b/,    // wget | bash
  ]

  // 安全命令
  const safePatterns = [
    /^(ls|dir|cat|echo|pwd|whoami|date|env|printenv|which|where)\b/,
    /^(git\s+status|git\s+log|git\s+diff|git\s+branch)\b/,
    /^(node\s+--version|npm\s+--version|pnpm\s+--version)\b/,
    /^(tsc|eslint|prettier)\b/,
  ]

  for (const p of criticalPatterns) if (p.test(cmd)) return 'critical'
  for (const p of highPatterns) if (p.test(cmd)) return 'high'
  for (const p of mediumPatterns) if (p.test(cmd)) return 'medium'
  for (const p of safePatterns) if (p.test(cmd)) return 'safe'

  // 默认中等风险
  return 'medium'
}

// ---- 注册 IPC ----

export function setupWorkspaceCommandHandlers(): void {
  ipcMain.handle(
    'workspace:command:execute',
    async (
      _event,
      params: {
        commandId: string
        command: string
        workingDir: string
        timeoutMs?: number
        env?: Record<string, string>
      }
    ) => {
      const { commandId, command, workingDir, timeoutMs, env } = params
      return executeCommand(commandId, command, workingDir, timeoutMs, env)
    }
  )

  ipcMain.handle('workspace:command:abort', (_event, commandId: string) => {
    return abortCommand(commandId)
  })

  ipcMain.handle('workspace:command:running', () => {
    return getRunningCommands()
  })

  ipcMain.handle('workspace:command:assess-risk', (_event, command: string) => {
    return assessRiskLevel(command)
  })

  // 应用退出时清理所有正在执行的命令
  process.on('exit', () => {
    for (const [, cmd] of runningCommands) {
      try {
        cmd.process.kill('SIGKILL')
      } catch { /* 忽略 */ }
    }
    runningCommands.clear()
  })

  console.log('[workspace:command] 命令执行 Handler 已注册')
}
