// ==================== Skills 技能相关类型 ====================

/**
 * 技能存储位置
 * - global: 全局技能，所有工作区可用
 * - project: 项目技能，仅当前工作区可用
 */
export type SkillLocation = 'global' | 'project'

/**
 * 技能数据模型
 *
 * Skills 是专家知识包，存储在 IndexedDB 中：
 * - 包含指令内容（Markdown 格式）和可选的资源文件
 * - 通过 Agent 的 enabledSkillIds 绑定到具体 Agent
 */
export interface Skill {
  /** 唯一标识 */
  id: string
  /** 技能名称 */
  name: string
  /** 描述 */
  description: string
  /** 指令正文内容（Markdown 格式） */
  content: string
  /** 完整原始文本（含 YAML frontmatter） */
  rawContent: string
  /** 存储位置 */
  location: SkillLocation
  /** 项目技能关联的工作区 ID */
  projectWorkspaceId?: string
  /** 兼容旧数据的标识符，等同于 id */
  dirPath: string
  /** 资源文件列表（相对路径） */
  resourceFiles: string[]
  /** 资源文件内容映射（相对路径 → 文件内容），存储在 IndexedDB 中 */
  resourceFilesData?: Record<string, { content: string; encoding: 'text' | 'base64' }>
  /** 是否启用（用户偏好，持久化到 IndexedDB） */
  enabled: boolean
  /** 最后修改时间 */
  updatedAt: number
}

/** 创建技能的输入参数 */
export type SkillCreateInput = {
  name: string
  description: string
  content: string
  location: SkillLocation
  projectWorkspaceId?: string
}

/** 更新技能的输入参数 */
export type SkillUpdateInput = {
  dirPath: string
  name?: string
  description?: string
  content?: string
}

/** 技能摘要（用于列表展示和 AI 工具返回） */
export interface SkillSummary {
  name: string
  description: string
  location: SkillLocation
  enabled: boolean
}
