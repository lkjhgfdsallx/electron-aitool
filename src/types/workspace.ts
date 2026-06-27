// ==================== 工作区相关类型 ====================

// ---- 存档策略 ----

/** 存档策略类型 */
export type CheckpointPolicy =
  | 'auto-before-modify'  // 每次文件修改前自动存档
  | 'manual'              // 手动存档
  | 'timed'               // 定时存档

/** 存档点类型 */
export type CheckpointType =
  | 'auto'            // 自动存档（文件修改前）
  | 'manual'          // 手动存档
  | 'pre-command'     // 命令执行前
  | 'pre-restore'     // 还原前（保存还原前状态）
  | 'pre-compression' // 上下文压缩前

// ---- 命令审批策略 ----

/** 命令审批策略 */
export type CommandPolicy =
  | 'all-need-approval'   // 全部需要审批
  | 'auto-approve-safe'   // 自动批准安全命令
  | 'auto-approve-all'    // 全部自动批准（不推荐）

/** 命令风险等级 */
export type CommandRiskLevel = 'safe' | 'medium' | 'high' | 'critical'

/** 命令审批结果 */
export type CommandApprovalResult =
  | 'approved-once'     // 仅此一次批准
  | 'approved-always'   // 永远允许
  | 'denied'            // 拒绝
  | 'denied-always'     // 永远拒绝

// ---- 上下文管理 ----

/** 上下文管理配置 */
export interface ContextConfig {
  /** 最大上下文 Token 数 */
  maxTokens: number
  /** 是否启用智能压缩 */
  compressionEnabled: boolean
  /** 压缩触发阈值（百分比，如 90 表示 90%） */
  compressionThreshold: number
  /** 是否启用滑动窗口截断（压缩失败时兜底） */
  slidingWindow: boolean
  /** 是否启用溢出恢复（最多重试次数） */
  overflowRetry: boolean
  /** 溢出恢复最大重试次数 */
  maxOverflowRetries: number
  /** 压缩前是否保留存档点 */
  keepCheckpointBeforeCompression: boolean
}

// ---- 工作区实体 ----

/** 工作区配置 */
export interface Workspace {
  /** 工作区 ID */
  id: string
  /** 工作区名称 */
  name: string
  /** 工作区描述 */
  description: string
  /** 绑定的文件夹路径 */
  folderPath: string
  /** AI 领导 Agent ID */
  leaderAgentId?: string
  /** 是否允许 AI 领导动态创建临时 Agent */
  allowDynamicAgents: boolean
  /** 团队 Agent ID 列表 */
  teamAgentIds: string[]
  /** 存档策略 */
  checkpointPolicy: CheckpointPolicy
  /** 定时存档间隔（分钟，仅 timed 模式） */
  timedIntervalMinutes: number
  /** 最多保留存档点数量 */
  maxCheckpoints: number
  /** 命令执行策略 */
  commandPolicy: CommandPolicy
  /** 命令执行是否启用 */
  commandExecutionEnabled: boolean
  /** 安全命令白名单 */
  safeCommandWhitelist: string[]
  /** 命令黑名单（永远拒绝） */
  commandBlacklist: string[]
  /** 上下文管理配置 */
  contextConfig: ContextConfig
  /** 关联的知识库集合 ID 列表 */
  knowledgeBaseIds: string[]
  /** 关联的 MCP 服务器 ID 列表 */
  mcpServerIds: string[]
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

/** 创建工作区的输入参数 */
export type WorkspaceCreateInput = Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>

/** 更新工作区的输入参数 */
export type WorkspaceUpdateInput = Partial<Omit<Workspace, 'id' | 'createdAt'>> & { id: string }

// ---- 存档点 ----

/** 存档点索引（轻量，存 localStorage） */
export interface CheckpointIndex {
  /** 存档点 ID */
  id: string
  /** 所属工作区 ID */
  workspaceId: string
  /** 关联的对话 ID */
  conversationId?: string
  /** 存档描述 */
  description: string
  /** 存档类型 */
  type: CheckpointType
  /** 变更文件数 */
  filesChanged: number
  /** 新增行数 */
  linesAdded: number
  /** 删除行数 */
  linesRemoved: number
  /** 涉及的文件路径列表（摘要，最多显示前 10 个） */
  filePaths: string[]
  /** 创建时间 */
  createdAt: number
}

/** 存档点详情（从文件系统读取） */
export interface CheckpointDetail {
  /** 存档点 ID */
  id: string
  /** 元数据 */
  metadata: CheckpointIndex
  /** 变更文件详情 */
  fileChanges: CheckpointFileChange[]
}

/** 存档点中的单个文件变更 */
export interface CheckpointFileChange {
  /** 文件路径（相对于工作区根目录） */
  filePath: string
  /** 变更类型 */
  changeType: 'added' | 'modified' | 'deleted'
  /** 新增行数 */
  linesAdded: number
  /** 删除行数 */
  linesRemoved: number
}

// ---- 命令审批 ----

/** 命令审批请求 */
export interface CommandApprovalRequest {
  /** 请求 ID */
  id: string
  /** 要执行的命令 */
  command: string
  /** 工作目录 */
  workingDir: string
  /** 风险等级 */
  riskLevel: CommandRiskLevel
  /** 匹配的规则描述 */
  matchedRule?: string
  /** 发起请求的 Agent ID */
  agentId?: string
  /** 发起请求的 Agent 名称 */
  agentName?: string
  /** 请求时间 */
  timestamp: number
}

/** 文件夹选择结果 */
export interface FolderSelectResult {
  success: boolean
  folderPath?: string
  canceled?: boolean
  error?: string
}

/** 创建存档点参数（传给主进程） */
export interface CreateCheckpointParams {
  /** 工作区文件夹路径 */
  folderPath: string
  /** 存档点 ID */
  checkpointId: string
  /** 存档描述 */
  description: string
  /** 存档类型 */
  type: CheckpointType
  /** 所属工作区 ID */
  workspaceId: string
  /** 关联的对话 ID */
  conversationId?: string
  /** 需要快照的文件路径列表（相对于工作区根目录） */
  filePaths?: string[]
}

/** 存档还原确认信息 */
export interface RestoreConfirmInfo {
  /** 存档点 ID */
  checkpointId: string
  /** 存档点描述 */
  description: string
  /** 存档时间 */
  createdAt: number
  /** 受影响的文件列表 */
  affectedFiles: Array<{
    filePath: string
    changeType: 'added' | 'modified' | 'deleted'
  }>
}

// ---- 默认配置 ----

/** 默认上下文管理配置 */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxTokens: 8000,
  compressionEnabled: true,
  compressionThreshold: 90,
  slidingWindow: true,
  overflowRetry: true,
  maxOverflowRetries: 3,
  keepCheckpointBeforeCompression: true,
}

/** 默认工作区配置 */
export const DEFAULT_WORKSPACE_INPUT: Omit<WorkspaceCreateInput, 'folderPath'> = {
  name: '',
  description: '',
  leaderAgentId: 'default-workspace-leader',
  allowDynamicAgents: true,
  teamAgentIds: [],
  checkpointPolicy: 'auto-before-modify',
  timedIntervalMinutes: 30,
  maxCheckpoints: 50,
  commandPolicy: 'auto-approve-safe',
  commandExecutionEnabled: true,
  safeCommandWhitelist: ['npm', 'node', 'git', 'ls', 'dir', 'cat', 'echo', 'pnpm', 'yarn', 'npx'],
  commandBlacklist: ['rm -rf /', 'format', 'shutdown', 'mkfs'],
  contextConfig: DEFAULT_CONTEXT_CONFIG,
  knowledgeBaseIds: [],
  mcpServerIds: [],
}
