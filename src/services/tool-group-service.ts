/**
 * 工具组服务（参考 ROO CODE Tool Groups）
 *
 * 提供工具组（ToolGroup）与具体工具 ID 之间的映射关系，
 * 以及基于自动审批矩阵（AutoApprovalConfig）的工具操作审批判断。
 *
 * 设计目标：
 * 1. 让 Agent 可以通过「工具组」快速配置权限，而非逐个勾选工具
 * 2. 为自动审批提供「操作类型 → 是否需要审批」的判断能力
 */

import type { ToolGroup, AgentToolPermission, AutoApprovalConfig, Tool } from '../types'

// ---- 工具组 → 工具 ID 映射 ----

/**
 * 工具组与内置工具 ID 的映射表
 *
 * 这里列举的是内置工具的 ID 前缀模式，MCP 工具和自定义工具
 * 会在运行时根据其属性动态归类（见 classifyToolToGroup）。
 */
export const TOOL_GROUP_MAP: Record<ToolGroup, string[]> = {
  /** 只读组：列目录、读文件、搜索文件 */
  read: [
    'workspace:list_files',
    'workspace:read_file',
    'workspace:find_files',
    'workspace:search_files',
    'workspace:find_symbols',
  ],
  /** 编辑组：写文件、精确文本编辑 */
  edit: [
    'workspace:write_file',
    'workspace:str_replace_editor',
  ],
  /** 终端组：执行命令 */
  terminal: [
    'workspace:execute_command',
  ],
  /** 浏览器组：网页搜索、抓取、网站分析 */
  browser: [
    'builtin:web_search',
    'builtin:fetch_webpage',
    'agent-builtin:site_analyzer_start',
    'agent-builtin:site_analyzer_cancel',
  ],
  /** MCP 组：由运行时动态填充（所有 isMCP=true 的工具） */
  mcp: [],
  /** 指挥组：分派任务、创建 Agent（仅 Leader 使用） */
  dispatch: [
    'workspace:dispatch_task',
    'workspace:create_agent',
  ],
  /** 分析组：数学工具、知识库搜索、计算 */
  analysis: [
    'builtin:calculate',
    'builtin:knowledge_search',
    'builtin:math_analyze',
    'builtin:math_algebra',
    'builtin:math_geometry',
    'builtin:math_number',
    'builtin:math_symbolic',
    'builtin:math_verify',
  ],
  /** 记忆组：记忆、回忆、遗忘、列表、人工输入、技能 */
  memory: [
    'agent-builtin:remember',
    'agent-builtin:recall',
    'agent-builtin:forget',
    'agent-builtin:list_memories',
    'agent-builtin:ask_self',
    'agent-builtin:ask_human',
    'agent-builtin:list_skills',
    'agent-builtin:use_skill',
    'agent-builtin:define_requirement',
    'agent-builtin:review_requirements',
    'builtin:get_current_time',
  ],
}

// ---- 工具组元数据（用于 UI 展示） ----

export interface ToolGroupMeta {
  group: ToolGroup
  label: string
  description: string
  icon: string
  /** 该组的默认风险等级（用于审批提示） */
  riskLevel: 'low' | 'medium' | 'high'
}

/** 工具组元数据列表（用于设置界面展示） */
export const TOOL_GROUP_META: ToolGroupMeta[] = [
  {
    group: 'read',
    label: '读取文件',
    description: '列目录、读取文件内容、搜索文件',
    icon: '📖',
    riskLevel: 'low',
  },
  {
    group: 'edit',
    label: '编辑文件',
    description: '创建、修改、删除文件',
    icon: '✏️',
    riskLevel: 'medium',
  },
  {
    group: 'terminal',
    label: '终端命令',
    description: '执行 shell 命令',
    icon: '🖥️',
    riskLevel: 'high',
  },
  {
    group: 'browser',
    label: '浏览器',
    description: '网页搜索、抓取、网站分析',
    icon: '🌐',
    riskLevel: 'low',
  },
  {
    group: 'mcp',
    label: 'MCP 工具',
    description: 'MCP 服务器提供的工具',
    icon: '🔌',
    riskLevel: 'medium',
  },
  {
    group: 'dispatch',
    label: '任务分派',
    description: '分派子任务、创建新 Agent（仅指挥者）',
    icon: '🎯',
    riskLevel: 'low',
  },
  {
    group: 'analysis',
    label: '分析计算',
    description: '数学计算、知识库搜索、数据分析',
    icon: '🔬',
    riskLevel: 'low',
  },
  {
    group: 'memory',
    label: '记忆与交互',
    description: '记忆、回忆、人工输入、技能',
    icon: '🧠',
    riskLevel: 'low',
  },
]

// ---- 工具 → 工具组 反向归类 ----

/**
 * 将一个工具动态归类到工具组
 *
 * 优先级：
 * 1. 内置工具通过 TOOL_GROUP_MAP 精确匹配
 * 2. MCP 工具（isMCP=true）归入 mcp 组
 * 3. 无法归类时返回 null
 */
export function classifyToolToGroup(tool: Tool): ToolGroup | null {
  // MCP 工具优先判定
  if (tool.isMCP) return 'mcp'

  // 精确匹配内置工具
  for (const [group, ids] of Object.entries(TOOL_GROUP_MAP)) {
    if ((ids as string[]).includes(tool.id)) {
      return group as ToolGroup
    }
  }
  return null
}

// ---- 工具权限解析 ----

/**
 * 根据 AgentToolPermission 解析出最终允许的工具 ID 集合
 *
 * 解析规则：
 * 1. 收集所有启用组对应的工具 ID
 * 2. 加入白名单（allowedToolIds）
 * 3. 移除黑名单（deniedToolIds）
 *
 * @param permission Agent 的工具权限配置
 * @param availableTools 当前所有可用工具列表（用于 MCP 动态归类）
 * @returns 允许使用的工具 ID 集合
 */
export function resolveAllowedToolIds(
  permission: AgentToolPermission,
  availableTools: Tool[]
): Set<string> {
  const allowed = new Set<string>()

  // 1. 收集启用组对应的工具 ID
  for (const group of permission.groups) {
    // 静态映射的工具 ID
    const staticIds = TOOL_GROUP_MAP[group] || []
    staticIds.forEach((id) => allowed.add(id))

    // 对于 mcp 组，动态收集所有 MCP 工具
    if (group === 'mcp') {
      availableTools
        .filter((t) => t.isMCP)
        .forEach((t) => allowed.add(t.id))
    }
  }

  // 2. 加入额外白名单
  if (permission.allowedToolIds) {
    permission.allowedToolIds.forEach((id) => allowed.add(id))
  }

  // 3. 移除黑名单（优先级最高）
  if (permission.deniedToolIds) {
    permission.deniedToolIds.forEach((id) => allowed.delete(id))
  }

  return allowed
}

/**
 * 从已有的 enabledToolIds 反向推导出 AgentToolPermission
 *
 * 用于兼容旧数据：当 Agent 还没有配置 toolPermission 时，
 * 从其现有的 enabledToolIds 推断出工具组配置。
 */
export function inferPermissionFromToolIds(
  toolIds: string[],
  availableTools: Tool[]
): AgentToolPermission {
  const groups = new Set<ToolGroup>()
  const unmatchedIds: string[] = []

  for (const id of toolIds) {
    const tool = availableTools.find((t) => t.id === id)
    const group = tool ? classifyToolToGroup(tool) : findGroupByToolId(id)
    if (group) {
      groups.add(group)
    } else {
      unmatchedIds.push(id)
    }
  }

  return {
    groups: Array.from(groups),
    allowedToolIds: unmatchedIds.length > 0 ? unmatchedIds : undefined,
  }
}

/** 通过工具 ID 查找所属组（不依赖 Tool 对象） */
function findGroupByToolId(toolId: string): ToolGroup | null {
  for (const [group, ids] of Object.entries(TOOL_GROUP_MAP)) {
    if ((ids as string[]).includes(toolId)) {
      return group as ToolGroup
    }
  }
  return null
}

// ---- 自动审批判断 ----

/**
 * 工具操作类型（用于自动审批判断）
 *
 * 与 ToolGroup 不同，这里关注的是「操作的影响类型」，
 * 因为一个工具组可能包含多种影响级别的操作。
 */
export type ToolActionType =
  | 'read-file'
  | 'list-files'
  | 'write-file'
  | 'execute-command'
  | 'browser'
  | 'mcp-tool'
  | 'analysis'
  | 'memory'
  | 'dispatch'
  | 'other'

/**
 * 根据工具判断其操作类型（用于自动审批）
 */
export function getToolActionType(tool: Tool): ToolActionType {
  const id = tool.id
  // 工作区文件操作
  if (id === 'workspace:read_file' || id === 'workspace:search_files' || id === 'workspace:find_symbols') return 'read-file'
  if (id === 'workspace:list_files' || id === 'workspace:find_files') return 'list-files'
  if (id === 'workspace:write_file' || id === 'workspace:str_replace_editor') return 'write-file'
  if (id === 'workspace:execute_command') return 'execute-command'
  if (id === 'workspace:dispatch_task' || id === 'workspace:create_agent') return 'dispatch'

  // MCP 工具
  if (tool.isMCP) return 'mcp-tool'

  // 浏览器
  if (
    id === 'builtin:web_search' ||
    id === 'builtin:fetch_webpage' ||
    id.startsWith('agent-builtin:site_analyzer')
  ) {
    return 'browser'
  }

  // 分析计算
  if (
    id === 'builtin:calculate' ||
    id === 'builtin:knowledge_search' ||
    id.startsWith('builtin:math_')
  ) {
    return 'analysis'
  }

  // 记忆与交互
  if (
    id.startsWith('agent-builtin:remember') ||
    id.startsWith('agent-builtin:recall') ||
    id.startsWith('agent-builtin:forget') ||
    id.startsWith('agent-builtin:ask_') ||
    id.startsWith('agent-builtin:') // 其余 agent-builtin 归类为 memory/交互
  ) {
    return 'memory'
  }

  return 'other'
}

/**
 * 判断一个工具操作是否可以被自动批准
 *
 * 参考 ROO CODE 的 Auto-Approve 矩阵逻辑：
 * 1. 总开关关闭 → 所有操作都需人工审批
 * 2. 根据操作类型查对应开关
 *
 * @param tool 要执行的工具
 * @param config 工作区的自动审批配置
 * @returns true 表示可自动批准，false 表示需要人工审批
 */
export function isToolAutoApproved(tool: Tool, config: AutoApprovalConfig): boolean {
  // 总开关关闭，全部需要审批
  if (!config.enabled) return false

  const actionType = getToolActionType(tool)

  switch (actionType) {
    case 'read-file':
      return config.readFiles
    case 'list-files':
      return config.listFiles
    case 'write-file':
      return config.writeFiles
    case 'execute-command':
      // 命令执行复用现有的 commandPolicy + executeSafeCommands
      return config.executeSafeCommands
    case 'browser':
      return config.browser
    case 'mcp-tool':
      return config.mcpTools
    case 'analysis':
    case 'memory':
    case 'dispatch':
    case 'other':
    default:
      // 低风险内部操作默认自动批准（分析、记忆、分派等不影响文件系统）
      return true
  }
}

/**
 * 获取工具操作的风险等级（用于 UI 提示）
 */
export function getToolActionRiskLevel(tool: Tool): 'low' | 'medium' | 'high' {
  const actionType = getToolActionType(tool)
  switch (actionType) {
    case 'write-file':
      return 'medium'
    case 'execute-command':
      return 'high'
    case 'mcp-tool':
      return 'medium'
    default:
      return 'low'
  }
}
