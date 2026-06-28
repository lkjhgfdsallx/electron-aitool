import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import JSZip from 'jszip'
import { dbService } from '../services/db-service'
import type { Skill, SkillCreateInput } from '../types'

// ==================== 辅助函数 ====================

/**
 * 解析 SKILL.md 的 YAML frontmatter
 */
function parseSkillFrontmatter(content: string): {
  name: string
  description: string
  body: string
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { name: '', description: '', body: content }
  }

  const frontmatterBlock = match[1]
  const body = match[2]

  const nameMatch = frontmatterBlock.match(/^name:\s*(.+)$/m)
  const descMatch = frontmatterBlock.match(/^description:\s*(.+)$/m)

  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    body: body.trim(),
  }
}

/**
 * 生成 SKILL.md 内容
 */
function generateSkillMarkdown(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
}

/**
 * 判断文件是否为文本类型
 */
function isTextFile(filePath: string): boolean {
  const textExtensions = [
    '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
    '.js', '.ts', '.py', '.sh', '.bat', '.ps1',
    '.html', '.css', '.xml', '.csv', '.env',
  ]
  const ext = '.' + filePath.split('.').pop()?.toLowerCase()
  return textExtensions.includes(ext)
}

/**
 * 从文件内容推断编码
 */
function inferEncoding(filePath: string): 'text' | 'base64' {
  return isTextFile(filePath) ? 'text' : 'base64'
}

/**
 * ArrayBuffer 转 base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ==================== File System Access API 辅助函数 ====================

/**
 * 检查目录句柄中是否存在指定文件
 */
async function hasFileInDir(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(fileName)
    return true
  } catch {
    return false
  }
}

/**
 * 从文件内容读取为文本或 base64
 */
async function readFileFromHandle(
  fileHandle: FileSystemFileHandle
): Promise<{ content: string; encoding: 'text' | 'base64' }> {
  const file = await fileHandle.getFile()
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  const textExtensions = [
    '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
    '.js', '.ts', '.py', '.sh', '.bat', '.ps1',
    '.html', '.css', '.xml', '.csv', '.env',
  ]

  if (textExtensions.includes(ext)) {
    const text = await file.text()
    return { content: text, encoding: 'text' }
  } else {
    const buffer = await file.arrayBuffer()
    return { content: arrayBufferToBase64(buffer), encoding: 'base64' }
  }
}

/**
 * 递归读取目录句柄中的所有资源文件
 */
async function readResourceFilesFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ''
): Promise<{ files: string[]; data: Record<string, { content: string; encoding: 'text' | 'base64' }> }> {
  const files: string[] = []
  const data: Record<string, { content: string; encoding: 'text' | 'base64' }> = {}

  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file' && name !== 'SKILL.md') {
      const relativePath = prefix ? `${prefix}/${name}` : name
      files.push(relativePath)
      try {
        data[relativePath] = await readFileFromHandle(entry as FileSystemFileHandle)
      } catch {
        // 忽略读取失败的文件
      }
    } else if (entry.kind === 'directory' && name !== 'node_modules' && name !== '.git') {
      const relativePath = prefix ? `${prefix}/${name}` : name
      const sub = await readResourceFilesFromHandle(entry as FileSystemDirectoryHandle, relativePath)
      files.push(...sub.files)
      Object.assign(data, sub.data)
    }
  }

  return { files, data }
}

/**
 * 从目录句柄导入单个 Skill 到 IndexedDB
 */
async function importSingleSkillFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
  targetDir: 'global' | 'project',
  get: () => { skills: Skill[] }
): Promise<{ imported?: string; error?: string }> {
  try {
    const skillMdHandle = await dirHandle.getFileHandle('SKILL.md')
    const skillMdFile = await skillMdHandle.getFile()
    const mdContent = await skillMdFile.text()
    const parsed = parseSkillFrontmatter(mdContent)

    const finalName = parsed.name || dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
    if (!finalName) {
      return { error: `无法从目录 "${dirName}" 确定 Skill 名称` }
    }

    // 读取资源文件
    const { files: resourceFiles, data: resourceFilesData } = await readResourceFilesFromHandle(dirHandle)

    // 检查是否已存在同名 skill
    const existing = get().skills.find((s) => s.name === finalName)
    const id = existing?.id || finalName

    const skill: Skill = {
      id,
      name: finalName,
      description: parsed.description,
      content: parsed.body,
      rawContent: mdContent,
      location: targetDir,
      dirPath: id,
      resourceFiles,
      resourceFilesData,
      enabled: existing?.enabled ?? true,
      updatedAt: Date.now(),
    }

    await dbService.saveSkill(skill)
    return { imported: finalName }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `导入 "${dirName}" 失败: ${msg}` }
  }
}

// ==================== Skill Store ====================

interface SkillStore {
  // ---- 状态 ----
  skills: Skill[]
  /** 是否正在加载 */
  loading: boolean

  // ---- 初始化 ----
  /** 从 IndexedDB 加载所有 Skills */
  loadSkills: () => Promise<void>

  // ---- CRUD ----
  /** 创建新技能 */
  createSkill: (input: SkillCreateInput) => Promise<Skill | null>
  /** 更新技能内容 */
  updateSkill: (params: {
    dirPath: string
    name?: string
    description?: string
    content?: string
  }) => Promise<Skill | null>
  /** 删除技能 */
  deleteSkill: (dirPath: string) => Promise<boolean>
  /** 切换启用/禁用 */
  toggleSkill: (dirPath: string) => void

  // ---- 查询 ----
  /** 获取所有启用的技能（用于 AI 工具返回） */
  getAllEnabledSkills: () => Skill[]
  /** 获取全局技能 */
  getGlobalSkills: () => Skill[]
  /** 获取项目技能 */
  getProjectSkills: (workspaceId?: string) => Skill[]

  // ---- 导入导出 ----
  /** 从 ZIP 导入（浏览器端解析 ZIP，存入 IndexedDB） */
  importFromZip: (zipData: number[], targetDir: 'global' | 'project') => Promise<{ imported: string[]; errors: string[] }>
  /** 从文件夹导入（使用浏览器 File System Access API 读取文件夹，存入 IndexedDB） */
  importFromFolder: (targetDir: 'global' | 'project') => Promise<{ imported: string[]; errors: string[] }>
  /** 导出为 ZIP（从 IndexedDB 读取生成 ZIP） */
  exportToZip: (skillIds: string[]) => Promise<number[] | null>

  // ---- 资源文件 ----
  /** 读取资源文件 */
  readResourceFile: (skillId: string, relativePath: string) => Promise<{ content?: string; encoding?: string } | null>
  /** 写入资源文件 */
  writeResourceFile: (skillId: string, relativePath: string, content: string, encoding: 'text' | 'base64') => Promise<boolean>
  /** 删除资源文件 */
  deleteResourceFile: (skillId: string, relativePath: string) => Promise<boolean>

  // ---- 刷新 ----
  /** 重新加载 */
  refresh: () => Promise<void>
}

export const useSkillStore = create<SkillStore>()((set, get) => ({
  skills: [],
  loading: false,

  // ==================== 初始化 ====================

  loadSkills: async () => {
    set({ loading: true })

    try {
      const skills = await dbService.getAllSkills()
      set({ skills, loading: false })
    } catch (e) {
      console.error('[SkillStore] 加载 Skills 失败:', e)
      set({ loading: false })
    }
  },

  // ==================== CRUD ====================

  createSkill: async (input) => {
    try {
      const id = input.name || uuidv4()
      const now = Date.now()

      const skill: Skill = {
        id,
        name: input.name,
        description: input.description,
        content: input.content,
        rawContent: generateSkillMarkdown(input.name, input.description, input.content),
        location: input.location,
        projectWorkspaceId: input.projectWorkspaceId,
        dirPath: id,
        resourceFiles: [],
        resourceFilesData: {},
        enabled: true,
        updatedAt: now,
      }

      await dbService.saveSkill(skill)
      set((state) => ({ skills: [...state.skills, skill] }))
      return skill
    } catch (e) {
      console.error('[SkillStore] 创建失败:', e)
      return null
    }
  },

  updateSkill: async (params) => {
    try {
      const existing = get().skills.find((s) => s.dirPath === params.dirPath || s.id === params.dirPath)
      if (!existing) {
        console.error('[SkillStore] 更新失败: 技能不存在')
        return null
      }

      const newName = params.name ?? existing.name
      const newDesc = params.description ?? existing.description
      const newContent = params.content ?? existing.content

      const updated: Skill = {
        ...existing,
        name: newName,
        description: newDesc,
        content: newContent,
        rawContent: generateSkillMarkdown(newName, newDesc, newContent),
        updatedAt: Date.now(),
      }

      // 如果名称变了，更新 id 和 dirPath
      if (params.name && params.name !== existing.name) {
        updated.id = params.name
        updated.dirPath = params.name
      }

      await dbService.saveSkill(updated)

      // 如果 id 变了，删除旧记录
      if (updated.id !== existing.id) {
        await dbService.deleteSkill(existing.id)
      }

      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === existing.id ? updated : s
        ),
      }))
      return updated
    } catch (e) {
      console.error('[SkillStore] 更新失败:', e)
      return null
    }
  },

  deleteSkill: async (dirPath) => {
    try {
      const existing = get().skills.find((s) => s.dirPath === dirPath || s.id === dirPath)
      if (!existing) return false

      await dbService.deleteSkill(existing.id)

      set((state) => ({
        skills: state.skills.filter((s) => s.id !== existing.id),
      }))
      return true
    } catch (e) {
      console.error('[SkillStore] 删除失败:', e)
      return false
    }
  },

  toggleSkill: async (dirPath) => {
    const existing = get().skills.find((s) => s.dirPath === dirPath || s.id === dirPath)
    if (!existing) return

    const updated = { ...existing, enabled: !existing.enabled }
    await dbService.saveSkill(updated)

    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === existing.id ? updated : s
      ),
    }))
  },

  // ==================== 查询 ====================

  getAllEnabledSkills: () => {
    return get().skills.filter((s) => s.enabled)
  },

  getGlobalSkills: () => {
    return get().skills.filter((s) => s.location === 'global')
  },

  getProjectSkills: () => {
    return get().skills.filter((s) => s.location === 'project')
  },

  // ==================== 导入导出 ====================

  importFromZip: async (zipData, targetDir) => {
    try {
      const zip = await JSZip.loadAsync(new Uint8Array(zipData))

      const imported: string[] = []
      const errors: string[] = []

      // 找到所有 SKILL.md 文件
      const skillMdPaths: string[] = []
      zip.forEach((relativePath, entry) => {
        if (!entry.dir && relativePath.endsWith('SKILL.md')) {
          skillMdPaths.push(relativePath)
        }
      })

      if (skillMdPaths.length === 0) {
        return { imported, errors: ['ZIP 中未找到 SKILL.md 文件'] }
      }

      for (const mdPath of skillMdPaths) {
        try {
          const skillDirInZip = mdPath.includes('/') ? mdPath.substring(0, mdPath.lastIndexOf('/')) : '.'
          const skillDirName = skillDirInZip === '.' ? 'imported-skill' : skillDirInZip.split('/').pop()!

          // 读取 SKILL.md
          const mdFile = zip.file(mdPath)
          if (!mdFile) continue
          const mdContent = await mdFile.async('string')
          const parsed = parseSkillFrontmatter(mdContent)

          const finalName = parsed.name || skillDirName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
          if (!finalName) {
            errors.push(`无法从路径 "${mdPath}" 确定 Skill 名称`)
            continue
          }

          // 收集资源文件
          const resourceFiles: string[] = []
          const resourceFilesData: Record<string, { content: string; encoding: 'text' | 'base64' }> = {}
          const prefix = skillDirInZip === '.' ? '' : skillDirInZip + '/'

          for (const [zipPath, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue
            if (zipPath === mdPath) continue
            if (!zipPath.startsWith(prefix) && skillDirInZip !== '.') continue

            const relativePath = skillDirInZip === '.' ? zipPath : zipPath.substring(prefix.length)
            if (!relativePath || relativePath.startsWith('..')) continue

            resourceFiles.push(relativePath)

            if (isTextFile(relativePath)) {
              const text = await entry.async('string')
              resourceFilesData[relativePath] = { content: text, encoding: 'text' }
            } else {
              const buffer = await entry.async('arraybuffer')
              resourceFilesData[relativePath] = { content: arrayBufferToBase64(buffer), encoding: 'base64' }
            }
          }

          // 检查是否已存在同名 skill
          const existing = get().skills.find((s) => s.name === finalName)
          const id = existing?.id || finalName

          const skill: Skill = {
            id,
            name: finalName,
            description: parsed.description,
            content: parsed.body,
            rawContent: mdContent,
            location: targetDir,
            dirPath: id,
            resourceFiles,
            resourceFilesData,
            enabled: existing?.enabled ?? true,
            updatedAt: Date.now(),
          }

          await dbService.saveSkill(skill)
          imported.push(finalName)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          errors.push(`导入 "${mdPath}" 失败: ${msg}`)
        }
      }

      // 刷新列表
      if (imported.length > 0) {
        await get().refresh()
      }

      return { imported, errors }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[SkillStore] importFromZip 异常:', e)
      return { imported: [], errors: [`导入 ZIP 时发生未知错误: ${msg}`] }
    }
  },

  /**
   * 递归读取目录句柄中的所有文件
   */
  async importFromFolder(targetDir) {
    try {
      // 使用浏览器 File System Access API 选择文件夹
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })

      const imported: string[] = []
      const errors: string[] = []

      // 检查目录本身是否是一个 Skill（直接包含 SKILL.md）
      const hasSkillMd = await hasFileInDir(dirHandle, 'SKILL.md')
      if (hasSkillMd) {
        const result = await importSingleSkillFromHandle(dirHandle, dirHandle.name, targetDir, get)
        if (result.imported) imported.push(result.imported)
        if (result.error) errors.push(result.error)
      } else {
        // 扫描子目录
        for await (const [name, entry] of dirHandle.entries()) {
          if (entry.kind === 'directory') {
            const subDirHandle = entry as FileSystemDirectoryHandle
            const subHasSkillMd = await hasFileInDir(subDirHandle, 'SKILL.md')
            if (subHasSkillMd) {
              const result = await importSingleSkillFromHandle(subDirHandle, name, targetDir, get)
              if (result.imported) imported.push(result.imported)
              if (result.error) errors.push(result.error)
            }
          }
        }
      }

      if (imported.length > 0) {
        await get().refresh()
      }

      return { imported, errors }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { imported: [], errors: [] } // 用户取消
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[SkillStore] importFromFolder 异常:', e)
      return { imported: [], errors: [`导入文件夹失败: ${msg}`] }
    }
  },

  exportToZip: async (skillIds) => {
    try {
      const zip = new JSZip()

      for (const skillId of skillIds) {
        const skill = get().skills.find((s) => s.id === skillId || s.dirPath === skillId)
        if (!skill) continue

        const folderName = skill.name
        zip.file(`${folderName}/SKILL.md`, skill.rawContent)

        // 添加资源文件
        if (skill.resourceFilesData) {
          for (const [relPath, data] of Object.entries(skill.resourceFilesData)) {
            if (data.encoding === 'base64') {
              zip.file(`${folderName}/${relPath}`, data.content, { base64: true })
            } else {
              zip.file(`${folderName}/${relPath}`, data.content)
            }
          }
        }
      }

      const blob = await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      return Array.from(new Uint8Array(blob))
    } catch (e) {
      console.error('[SkillStore] 导出失败:', e)
      return null
    }
  },

  // ==================== 资源文件 ====================

  readResourceFile: async (skillId, relativePath) => {
    const skill = get().skills.find((s) => s.id === skillId || s.dirPath === skillId)
    if (!skill || !skill.resourceFilesData) return null

    const data = skill.resourceFilesData[relativePath]
    if (!data) return null

    return { content: data.content, encoding: data.encoding }
  },

  writeResourceFile: async (skillId, relativePath, content, encoding) => {
    try {
      const skill = get().skills.find((s) => s.id === skillId || s.dirPath === skillId)
      if (!skill) return false

      const updated = { ...skill }
      if (!updated.resourceFilesData) updated.resourceFilesData = {}
      updated.resourceFilesData[relativePath] = { content, encoding }

      if (!updated.resourceFiles.includes(relativePath)) {
        updated.resourceFiles = [...updated.resourceFiles, relativePath]
      }

      updated.updatedAt = Date.now()
      await dbService.saveSkill(updated)

      set((state) => ({
        skills: state.skills.map((s) => (s.id === updated.id ? updated : s)),
      }))
      return true
    } catch (e) {
      console.error('[SkillStore] 写入资源文件失败:', e)
      return false
    }
  },

  deleteResourceFile: async (skillId, relativePath) => {
    try {
      const skill = get().skills.find((s) => s.id === skillId || s.dirPath === skillId)
      if (!skill) return false

      const updated = { ...skill }
      if (updated.resourceFilesData) {
        delete updated.resourceFilesData[relativePath]
      }
      updated.resourceFiles = updated.resourceFiles.filter((f) => f !== relativePath)
      updated.updatedAt = Date.now()

      await dbService.saveSkill(updated)

      set((state) => ({
        skills: state.skills.map((s) => (s.id === updated.id ? updated : s)),
      }))
      return true
    } catch (e) {
      console.error('[SkillStore] 删除资源文件失败:', e)
      return false
    }
  },

  // ==================== 刷新 ====================

  refresh: async () => {
    await get().loadSkills()
  },
}))
