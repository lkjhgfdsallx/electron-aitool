/**
 * Windows 控制台 / 子进程 UTF-8 编码修复
 *
 * 中文 Windows 默认代码页为 936 (GBK)。Node/Electron 主进程 console 输出的是 UTF-8 字节，
 * 被控制台按 GBK 解读后会出现类似「澶辫触: 璇锋眰瓒呮椂」的乱码。
 *
 * 本模块在主进程启动最早阶段将控制台切到 UTF-8 (65001)，
 * 并为子进程提供统一的 UTF-8 环境变量。
 */

import { execSync } from 'child_process'
import { platform } from 'os'

const isWindows = platform() === 'win32'

let consoleEncodingInitialized = false

/**
 * 将当前进程的 Windows 控制台代码页切换为 UTF-8 (65001)，
 * 并尽量设置 stdout/stderr 编码。
 *
 * 应在主进程入口尽可能早调用（任何 console.log 中文之前）。
 */
export function setupConsoleUtf8(): void {
  if (consoleEncodingInitialized) return
  consoleEncodingInitialized = true

  // 所有平台都尽量声明 UTF-8 环境，便于子进程继承
  if (!process.env.PYTHONIOENCODING) {
    process.env.PYTHONIOENCODING = 'utf-8'
  }
  // 不强制覆盖已有 LANG（git 等工具可能依赖 C locale 解析）
  if (!process.env.LANG) {
    process.env.LANG = 'C.UTF-8'
  }
  if (!process.env.LC_ALL && process.platform !== 'win32') {
    process.env.LC_ALL = 'C.UTF-8'
  }

  if (!isWindows) return

  try {
    // 切换当前控制台输出代码页为 UTF-8
    // 使用 cmd.exe 显式执行，兼容 @types/node 对 shell 参数的类型约束
    execSync('chcp 65001 >NUL', {
      stdio: 'ignore',
      windowsHide: true,
      shell: process.env.ComSpec || 'cmd.exe',
    })
  } catch {
    // 忽略：非交互控制台 / 受限环境可能失败
  }

  // 尝试设置 Node 流默认编码（旧版 Node 支持；新版无害）
  try {
    const stdout = process.stdout as NodeJS.WriteStream & {
      setDefaultEncoding?: (enc: BufferEncoding) => void
    }
    const stderr = process.stderr as NodeJS.WriteStream & {
      setDefaultEncoding?: (enc: BufferEncoding) => void
    }
    stdout.setDefaultEncoding?.('utf8')
    stderr.setDefaultEncoding?.('utf8')
  } catch {
    // ignore
  }
}

/**
 * 返回适合在 Windows 上生成 UTF-8 输出的子进程环境变量补丁。
 * 与现有 env 合并时使用：{ ...process.env, ...getUtf8ChildEnv(), ...custom }
 */
export function getUtf8ChildEnv(): Record<string, string> {
  return {
    PYTHONIOENCODING: 'utf-8',
    // Windows 下部分工具识别这些变量
    ...(isWindows
      ? {
          // 提示 Node 子进程使用 UTF-8
          NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS, '--no-warnings'),
        }
      : {
          LANG: process.env.LANG || 'C.UTF-8',
          LC_ALL: process.env.LC_ALL || 'C.UTF-8',
        }),
  }
}

function mergeNodeOptions(existing: string | undefined, extra: string): string {
  if (!existing || !existing.trim()) return extra
  if (existing.includes(extra)) return existing
  return `${existing} ${extra}`
}

/**
 * 将 Buffer 解码为字符串。
 * 优先 UTF-8；若检测到典型的「UTF-8 被当 GBK 读」乱码模式则保持原样
 * （真正的 GBK 解码需要 iconv，这里通过强制子进程输出 UTF-8 避免该路径）。
 */
export function decodeBufferToString(data: Buffer): string {
  // 去掉 UTF-8 BOM
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return data.subarray(3).toString('utf8')
  }
  return data.toString('utf8')
}

/**
 * 为 PowerShell 命令前置 UTF-8 输出设置，
 * 确保 stdout/stderr 以 UTF-8 字节写出。
 */
export function wrapPowerShellUtf8(command: string): string {
  // 设置控制台与管道输出编码为 UTF-8（无 BOM）
  const preamble =
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
    '$OutputEncoding = [Console]::OutputEncoding; ' +
    'chcp 65001 > $null; '
  return preamble + command
}
