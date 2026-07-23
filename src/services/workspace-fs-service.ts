/**
 * 工作区文件系统服务（渲染进程）
 *
 * 封装 workspace.fs.readDir / readFile IPC 调用，
 * 供 FileTree 和 FilePreview 组件使用。
 */

const api = () => window.electronAPI

// ---- 类型 ----

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  ext: string
}

export interface ReadFileResult {
  success: boolean
  content?: string
  truncated?: boolean
  totalSize?: number
  error?: string
}

export interface WorkspaceSearchMatch {
  file_path: string
  line: number
  column: number
  line_text: string
  context: Array<{ line: number; text: string }>
}

export interface WorkspaceSymbol {
  name: string
  kind: 'function' | 'class' | 'variable'
  exported: boolean
  file_path: string
  line: number
  column: number
  signature: string
}

export interface WorkspaceSearchResult<T> {
  success: boolean
  error?: string
  count?: number
  filesScanned?: number
  bytesScanned?: number
  truncated?: boolean
  files?: string[]
  matches?: T[]
  symbols?: T[]
}

// ---- 服务 ----

export const workspaceFsService = {
  /**
   * 读取目录内容
   * @param dirPath 目录绝对路径
   * @returns 目录条目列表（目录在前，文件在后，按名称排序）
   */
  async readDir(dirPath: string): Promise<DirEntry[]> {
    const result = await api().workspace.fs.readDir(dirPath)
    if (!result.success) {
      throw new Error(result.error || '读取目录失败')
    }
    return result.entries || []
  },

  /**
   * 读取文件文本内容
   * @param filePath 文件绝对路径
   * @param maxBytes 最大读取字节数（默认 512KB）
   */
  async readFile(filePath: string, maxBytes?: number): Promise<ReadFileResult> {
    return api().workspace.fs.readFile(filePath, maxBytes)
  },

  /**
   * 写入文件内容（创建或覆盖）
   * @param filePath 文件绝对路径
   * @param content 文件内容
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const result = await api().workspace.fs.writeFile(filePath, content)
    if (!result.success) {
      throw new Error(result.error || '写入文件失败')
    }
  },

  /** 按 glob 查找工作区文件（例如 TypeScript 源文件模式） */
  async findFiles(rootPath: string, options?: { glob?: string; maxResults?: number }): Promise<WorkspaceSearchResult<string>> {
    return api().workspace.search.findFiles(rootPath, options)
  },

  /** 在代码库中搜索文本或正则表达式 */
  async searchFiles(rootPath: string, options: { query: string; glob?: string; isRegex?: boolean; caseSensitive?: boolean; contextLines?: number; maxResults?: number }): Promise<WorkspaceSearchResult<WorkspaceSearchMatch>> {
    return api().workspace.search.searchFiles(rootPath, options)
  },

  /** 提取 TypeScript/JavaScript 的函数、类和变量定义 */
  async findSymbols(rootPath: string, options?: { query?: string; glob?: string; maxResults?: number }): Promise<WorkspaceSearchResult<WorkspaceSymbol>> {
    return api().workspace.search.findSymbols(rootPath, options)
  },

  /**
   * 创建目录（递归）
   * @param dirPath 目录绝对路径
   */
  async createDir(dirPath: string): Promise<void> {
    const result = await api().workspace.fs.createDir(dirPath)
    if (!result.success) {
      throw new Error(result.error || '创建目录失败')
    }
  },

  /**
   * 删除文件
   * @param filePath 文件绝对路径
   */
  async deleteFile(filePath: string): Promise<void> {
    const result = await api().workspace.fs.deleteFile(filePath)
    if (!result.success) {
      throw new Error(result.error || '删除文件失败')
    }
  },

  /**
   * 重命名文件/目录
   * @param oldPath 旧路径（绝对路径）
   * @param newPath 新路径（绝对路径）
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const result = await api().workspace.fs.rename(oldPath, newPath)
    if (!result.success) {
      throw new Error(result.error || '重命名失败')
    }
  },

  /**
   * 复制文件
   * @param srcPath 源文件路径（绝对路径）
   * @param destPath 目标文件路径（绝对路径）
   */
  async copyFile(srcPath: string, destPath: string): Promise<void> {
    const result = await api().workspace.fs.copyFile(srcPath, destPath)
    if (!result.success) {
      throw new Error(result.error || '复制文件失败')
    }
  },

  /**
   * 删除目录（递归）
   * @param dirPath 目录绝对路径
   */
  async deleteDir(dirPath: string): Promise<void> {
    const result = await api().workspace.fs.deleteDir(dirPath)
    if (!result.success) {
      throw new Error(result.error || '删除目录失败')
    }
  },

  /**
   * 在文件资源管理器中显示文件
   * @param filePath 文件绝对路径
   */
  async revealInExplorer(filePath: string): Promise<void> {
    const result = await api().workspace.fs.revealInExplorer(filePath)
    if (!result.success) {
      throw new Error(result.error || '打开文件资源管理器失败')
    }
  },

  /**
   * 根据文件扩展名判断是否为文本文件
   */
  isTextFile(ext: string): boolean {
    const textExts = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.json', '.jsonc', '.json5',
      '.md', '.mdx', '.txt', '.log', '.csv',
      '.html', '.htm', '.xml', '.svg',
      '.css', '.scss', '.sass', '.less',
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.cpp', '.h', '.hpp',
      '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
      '.yaml', '.yml', '.toml', '.ini', '.env', '.conf',
      '.sql', '.graphql', '.gql',
      '.vue', '.svelte', '.astro',
      '.dockerfile', '.gitignore', '.editorconfig',
      '.prisma', '.proto',
    ])
    return textExts.has(ext.toLowerCase())
  },

  /**
   * 根据文件扩展名获取语言标识（用于语法高亮预留）
   */
  getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
      '.json': 'json', '.md': 'markdown', '.html': 'html', '.css': 'css',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
      '.sh': 'shell', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
      '.sql': 'sql', '.vue': 'vue', '.svelte': 'svelte',
    }
    return map[ext.toLowerCase()] || 'text'
  },

  /**
   * 格式化文件大小
   */
  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  },
}
