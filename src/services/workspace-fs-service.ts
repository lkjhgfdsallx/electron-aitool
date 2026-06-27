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
