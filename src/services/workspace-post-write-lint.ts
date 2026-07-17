import type { PostWriteLintConfig } from '../types'
import { workspaceFsService } from './workspace-fs-service'

export type PostWriteLintDecision = 'allow' | 'block' | 'skip'

export interface PostWriteLintRun {
  linterId: string
  command: string
  files: string[]
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
}

export interface PostWriteLintResult {
  decision: PostWriteLintDecision
  runs: PostWriteLintRun[]
  reason?: string
  skippedReason?: string
}

interface LintCommand {
  id: string
  command: string
  files: string[]
}

interface PostWriteLintOptions {
  workspaceRoot: string
  relativePaths: string[]
  config: PostWriteLintConfig
}

const JAVASCRIPT_EXTENSIONS = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'])
const TYPESCRIPT_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts'])
const PYTHON_EXTENSIONS = new Set(['py'])
const RUBY_EXTENSIONS = new Set(['rb', 'rake', 'gemspec'])
const GO_EXTENSIONS = new Set(['go'])
const RUST_EXTENSIONS = new Set(['rs'])

function getExtension(filePath: string): string {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : ''
}

function quoteShellArgument(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function shellFiles(files: string[]): string {
  return files.map(quoteShellArgument).join(' ')
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/___DOUBLE_STAR___/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

export function matchesPostWriteLintGlob(filePath: string, glob: string): boolean {
  try {
    return globToRegExp(glob.trim()).test(filePath.replace(/\\/g, '/'))
  } catch {
    return false
  }
}

function applyCommandPlaceholders(command: string, workspaceRoot: string, filePath: string): string {
  return command
    .replace(/\{workspace\}/g, workspaceRoot)
    .replace(/\{relative\}/g, filePath)
    .replace(/\{file\}/g, quoteShellArgument(filePath))
}

async function rootFileExists(workspaceRoot: string, fileName: string): Promise<boolean> {
  const result = await workspaceFsService.readFile(`${workspaceRoot.replace(/[\\/]+$/, '')}/${fileName}`)
  return result.success
}

async function hasAnyRootFile(workspaceRoot: string, fileNames: string[]): Promise<boolean> {
  const results = await Promise.all(fileNames.map((fileName) => rootFileExists(workspaceRoot, fileName)))
  return results.some(Boolean)
}

async function readRootPackage(workspaceRoot: string): Promise<Record<string, unknown> | null> {
  const result = await workspaceFsService.readFile(`${workspaceRoot.replace(/[\\/]+$/, '')}/package.json`)
  if (!result.success || !result.content) return null
  try {
    const parsed: unknown = JSON.parse(result.content)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function packageDeclaresDependency(pkg: Record<string, unknown> | null, name: string): boolean {
  if (!pkg) return false
  return ['dependencies', 'devDependencies', 'peerDependencies'].some((section) => {
    const dependencies = pkg[section]
    return Boolean(dependencies && typeof dependencies === 'object' && name in dependencies)
  })
}

function appendCommand(commands: LintCommand[], disabled: Set<string>, command: LintCommand): void {
  if (!disabled.has(command.id) && !commands.some((item) => item.id === command.id && item.command === command.command)) {
    commands.push(command)
  }
}

async function detectLintCommands(options: PostWriteLintOptions): Promise<LintCommand[]> {
  const normalizedPaths = [...new Set(options.relativePaths.map((path) => path.replace(/\\/g, '/')))]
  const disabled = new Set(options.config.disabledLinters.map((id) => id.trim().toLowerCase()))
  const commands: LintCommand[] = []

  for (const custom of options.config.customCommands) {
    const matchingFiles = normalizedPaths.filter((filePath) => matchesPostWriteLintGlob(filePath, custom.glob))
    if (!matchingFiles.length || !custom.command.trim()) continue
    const id = (custom.id?.trim() || `custom:${custom.glob}`).toLowerCase()
    if (disabled.has(id)) continue
    for (const filePath of matchingFiles) {
      appendCommand(commands, disabled, {
        id,
        command: applyCommandPlaceholders(custom.command, options.workspaceRoot, filePath),
        files: [filePath],
      })
    }
  }

  const extensions = new Set(normalizedPaths.map(getExtension))
  const packageJson = await readRootPackage(options.workspaceRoot)
  const hasEslintConfig = await hasAnyRootFile(options.workspaceRoot, [
    'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc', '.eslintrc.json', '.eslintrc.js',
  ])
  const hasTsConfig = await rootFileExists(options.workspaceRoot, 'tsconfig.json')

  const javascriptFiles = normalizedPaths.filter((path) => JAVASCRIPT_EXTENSIONS.has(getExtension(path)))
  if (javascriptFiles.length && (hasEslintConfig || packageDeclaresDependency(packageJson, 'eslint'))) {
    appendCommand(commands, disabled, { id: 'eslint', command: `npx --no-install eslint --no-warn-ignored ${shellFiles(javascriptFiles)}`, files: javascriptFiles })
  }

  const typescriptFiles = normalizedPaths.filter((path) => TYPESCRIPT_EXTENSIONS.has(getExtension(path)))
  if (typescriptFiles.length && hasTsConfig) {
    appendCommand(commands, disabled, { id: 'tsc', command: 'npx --no-install tsc --noEmit --pretty false', files: typescriptFiles })
  }

  if ([...extensions].some((extension) => PYTHON_EXTENSIONS.has(extension))) {
    const pythonFiles = normalizedPaths.filter((path) => PYTHON_EXTENSIONS.has(getExtension(path)))
    const hasRuffConfig = await hasAnyRootFile(options.workspaceRoot, ['pyproject.toml', 'ruff.toml', '.ruff.toml'])
    if (hasRuffConfig) appendCommand(commands, disabled, { id: 'ruff', command: `ruff check ${shellFiles(pythonFiles)}`, files: pythonFiles })
  }

  if ([...extensions].some((extension) => RUBY_EXTENSIONS.has(extension))) {
    const rubyFiles = normalizedPaths.filter((path) => RUBY_EXTENSIONS.has(getExtension(path)))
    if (await hasAnyRootFile(options.workspaceRoot, ['.rubocop.yml', 'Gemfile'])) {
      appendCommand(commands, disabled, { id: 'rubocop', command: `rubocop ${shellFiles(rubyFiles)}`, files: rubyFiles })
    }
  }

  if ([...extensions].some((extension) => GO_EXTENSIONS.has(extension)) && await rootFileExists(options.workspaceRoot, 'go.mod')) {
    appendCommand(commands, disabled, { id: 'go-vet', command: 'go vet ./...', files: normalizedPaths.filter((path) => GO_EXTENSIONS.has(getExtension(path))) })
  }

  if ([...extensions].some((extension) => RUST_EXTENSIONS.has(extension)) && await rootFileExists(options.workspaceRoot, 'Cargo.toml')) {
    appendCommand(commands, disabled, { id: 'cargo-check', command: 'cargo check', files: normalizedPaths.filter((path) => RUST_EXTENSIONS.has(getExtension(path))) })
  }

  return commands
}

function trimOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output
  return `${output.slice(0, maxChars)}\n…（输出已截断）`
}

export function formatPostWriteLintBlock(result: PostWriteLintResult, maxOutputChars: number): string {
  const failures = result.runs.filter((run) => run.exitCode !== 0)
  const details = failures.map((run) => {
    const output = trimOutput([run.stderr, run.stdout].filter(Boolean).join('\n').trim(), maxOutputChars)
    return `[${run.linterId}] ${run.command}\n${output || `退出码：${run.exitCode ?? '未知'}`}`
  }).join('\n\n')
  return `POST_WRITE_LINT_BLOCKED\n文件已写入，但自动检查未通过。你必须先修复以下问题，再继续其他任务。\ndecision: block\n\n${details}`
}

/** 在文件写入完成后运行已配置或自动探测到的检查。检查失败不会回滚文件。 */
export async function runPostWriteLint(options: PostWriteLintOptions): Promise<PostWriteLintResult> {
  if (!options.config.enabled) return { decision: 'skip', runs: [], skippedReason: '写后自动检查已关闭' }
  if (!window.electronAPI?.workspace?.command?.execute) {
    return { decision: 'skip', runs: [], skippedReason: '当前环境不可执行工作区检查命令' }
  }

  const commands = await detectLintCommands(options)
  if (!commands.length) return { decision: 'skip', runs: [], skippedReason: '未检测到适用于已写入文件的检查器' }

  const runs: PostWriteLintRun[] = []
  for (const lint of commands) {
    const execution = await window.electronAPI.workspace.command.execute({
      commandId: `post-write-lint-${lint.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      command: lint.command,
      workingDir: options.workspaceRoot,
      timeoutMs: options.config.timeoutMs,
    })
    const output = [execution.stderr, execution.stdout, execution.error].filter(Boolean).join('\n')
    const timedOut = /超时|timeout|timed out/i.test(output)
    // 超时或无法启动的检查器不阻塞 Agent，避免本机工具链缺失导致死循环。
    if (timedOut || (execution.exitCode === null && !execution.success)) continue
    runs.push({
      linterId: lint.id,
      command: lint.command,
      files: lint.files,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr || execution.error || '',
      durationMs: execution.durationMs,
    })
  }

  const hasFailure = runs.some((run) => run.exitCode !== 0)
  const result: PostWriteLintResult = hasFailure
    ? { decision: 'block', runs, reason: '自动检查未通过' }
    : { decision: 'allow', runs }
  if (hasFailure) result.reason = formatPostWriteLintBlock(result, options.config.maxOutputChars)
  return result
}
