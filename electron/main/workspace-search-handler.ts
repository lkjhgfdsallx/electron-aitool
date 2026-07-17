import { ipcMain } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { extname, join, relative } from 'path'
import * as ts from 'typescript'

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.ai-workspace-vcs', '.next', 'dist', 'build',
  '.cache', '__pycache__', '.DS_Store', '.idea', '.vscode', 'coverage',
])
const MAX_FILES_SCANNED = 10_000
const MAX_TEXT_BYTES_SCANNED = 20 * 1024 * 1024
const MAX_FILE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_RESULTS = 100
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

export interface SearchLimits {
  maxResults?: number
  maxFiles?: number
  maxBytes?: number
}

interface FileScanResult {
  files: string[]
  filesScanned: number
  truncated: boolean
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function toSafeLimit(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(Math.floor(value), maximum))
}

function globToRegExp(glob: string): RegExp {
  let source = '^'
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        index++
        if (glob[index + 1] === '/') {
          index++
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`${source}$`, 'i')
}

function matchesGlob(filePath: string, glob?: string): boolean {
  if (!glob || glob.trim() === '') return true
  return glob.split(',').map((part) => part.trim()).filter(Boolean).some((part) => globToRegExp(part).test(filePath))
}

async function collectFiles(rootPath: string, glob?: string, limits: SearchLimits = {}): Promise<FileScanResult> {
  const maxFiles = toSafeLimit(limits.maxFiles, MAX_FILES_SCANNED, MAX_FILES_SCANNED)
  const files: string[] = []
  let filesScanned = 0
  let truncated = false

  const visit = async (directory: string): Promise<void> => {
    if (truncated) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (truncated) return
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
      } else if (entry.isFile()) {
        filesScanned++
        if (filesScanned > maxFiles) {
          truncated = true
          return
        }
        const filePath = normalizeRelativePath(relative(rootPath, absolutePath))
        if (matchesGlob(filePath, glob)) files.push(filePath)
      }
    }
  }

  await visit(rootPath)
  return { files: files.sort((a, b) => a.localeCompare(b)), filesScanned, truncated }
}

function buildContext(lines: string[], lineIndex: number, contextLines: number): Array<{ line: number; text: string }> {
  const start = Math.max(0, lineIndex - contextLines)
  const end = Math.min(lines.length, lineIndex + contextLines + 1)
  return lines.slice(start, end).map((text, index) => ({ line: start + index + 1, text }))
}

export async function findWorkspaceFiles(rootPath: string, options: { glob?: string; maxResults?: number } = {}) {
  const maxResults = toSafeLimit(options.maxResults, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS)
  const scan = await collectFiles(rootPath, options.glob)
  const resultTruncated = scan.files.length > maxResults
  return {
    success: true,
    files: scan.files.slice(0, maxResults),
    count: Math.min(scan.files.length, maxResults),
    filesScanned: scan.filesScanned,
    truncated: scan.truncated || resultTruncated,
  }
}

export async function searchWorkspaceFiles(rootPath: string, options: {
  query: string
  glob?: string
  isRegex?: boolean
  caseSensitive?: boolean
  contextLines?: number
  maxResults?: number
}) {
  if (!options.query) return { success: false, error: 'query 必须是非空字符串' }
  const maxResults = toSafeLimit(options.maxResults, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS)
  const contextLines = toSafeLimit(options.contextLines, 2, 10)
  let matcher: RegExp
  try {
    matcher = options.isRegex
      ? new RegExp(options.query, options.caseSensitive ? 'g' : 'gi')
      : new RegExp(options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.caseSensitive ? 'g' : 'gi')
  } catch (error) {
    return { success: false, error: `无效正则表达式：${error instanceof Error ? error.message : '未知错误'}` }
  }

  const scan = await collectFiles(rootPath, options.glob)
  const matches: Array<{ file_path: string; line: number; column: number; line_text: string; context: Array<{ line: number; text: string }> }> = []
  let bytesScanned = 0
  let truncated = scan.truncated
  let hasMoreMatches = false
  for (const filePath of scan.files) {
    if (hasMoreMatches || bytesScanned >= MAX_TEXT_BYTES_SCANNED) {
      truncated = true
      break
    }
    const absolutePath = join(rootPath, filePath)
    try {
      const fileStat = await stat(absolutePath)
      if (fileStat.size > MAX_FILE_BYTES || bytesScanned + fileStat.size > MAX_TEXT_BYTES_SCANNED) {
        truncated = true
        continue
      }
      const content = await readFile(absolutePath, 'utf-8')
      if (content.includes('\0')) continue
      bytesScanned += fileStat.size
      const lines = content.split(/\r?\n/)
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        matcher.lastIndex = 0
        const match = matcher.exec(lines[lineIndex])
        if (!match) continue
        if (matches.length >= maxResults) {
          hasMoreMatches = true
          break
        }
        matches.push({
          file_path: filePath,
          line: lineIndex + 1,
          column: match.index + 1,
          line_text: lines[lineIndex],
          context: buildContext(lines, lineIndex, contextLines),
        })
      }
    } catch {
      // 无权限、读取失败或非 UTF-8 文件均跳过，继续扫描其余文件。
    }
  }
  return { success: true, matches, count: matches.length, filesScanned: scan.filesScanned, bytesScanned, truncated: truncated || hasMoreMatches }
}

function isExported(node: ts.Node): boolean {
  const modifiers = (node as ts.Node & { modifiers?: ts.NodeArray<ts.Modifier> }).modifiers
  return !!modifiers?.some((modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

function symbolKind(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node)) return 'function'
  if (ts.isClassDeclaration(node)) return 'class'
  if (ts.isVariableDeclaration(node)) return 'variable'
  return null
}

function symbolName(node: ts.Node): ts.Identifier | null {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) return node.name
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name
  return null
}

export async function findWorkspaceSymbols(rootPath: string, options: { query?: string; glob?: string; maxResults?: number } = {}) {
  const maxResults = toSafeLimit(options.maxResults, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS)
  const scan = await collectFiles(rootPath, options.glob)
  const sourceFiles = scan.files.filter((filePath) => SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase()))
  const query = options.query?.toLocaleLowerCase()
  const symbols: Array<{ name: string; kind: string; exported: boolean; file_path: string; line: number; column: number; signature: string }> = []
  let truncated = scan.truncated

  for (const filePath of sourceFiles) {
    if (symbols.length >= maxResults) {
      truncated = true
      break
    }
    try {
      const content = await readFile(join(rootPath, filePath), 'utf-8')
      if (Buffer.byteLength(content) > MAX_FILE_BYTES) continue
      const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : filePath.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS
      const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind)
      const visit = (node: ts.Node): void => {
        if (symbols.length >= maxResults) return
        const kind = symbolKind(node)
        const name = symbolName(node)
        if (kind && name && (!query || name.text.toLocaleLowerCase().includes(query))) {
          const position = source.getLineAndCharacterOfPosition(name.getStart(source))
          symbols.push({
            name: name.text,
            kind,
            exported: isExported(node.parent && ts.isVariableDeclaration(node) ? node.parent.parent : node),
            file_path: filePath,
            line: position.line + 1,
            column: position.character + 1,
            signature: node.getText(source).split(/\r?\n/)[0].slice(0, 300),
          })
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    } catch {
      // 解析失败时跳过该文件，保证单个损坏文件不会中断检索。
    }
  }
  return { success: true, symbols, count: symbols.length, filesScanned: scan.filesScanned, truncated }
}

export function setupWorkspaceSearchHandlers(): void {
  ipcMain.handle('workspace:search:findFiles', async (_event, rootPath: string, options) => findWorkspaceFiles(rootPath, options))
  ipcMain.handle('workspace:search:searchFiles', async (_event, rootPath: string, options) => searchWorkspaceFiles(rootPath, options))
  ipcMain.handle('workspace:search:findSymbols', async (_event, rootPath: string, options) => findWorkspaceSymbols(rootPath, options))
}
