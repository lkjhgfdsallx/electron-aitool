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

// ---- 工具组（参考 ROO CODE Tool Groups） ----

/** 工具组分类（参考 ROO CODE 的 read / edit / browser / mcp / terminal 分组） */
export type ToolGroup =
  | 'read'          // 只读：list_files, read_file, search_files
  | 'edit'          // 编辑：write_file, patch_file
  | 'terminal'      // 终端：execute_command
  | 'browser'       // 浏览器：web_search, fetch_webpage, site_analyzer
  | 'mcp'           // MCP 工具
  | 'dispatch'      // 指挥：dispatch_task, create_agent
  | 'analysis'      // 分析：math_*, knowledge_search, calculate
  | 'memory'        // 记忆：remember, recall, ask_human

/** Agent 的工具权限配置（替代纯 enabledToolIds 的灵活方案） */
export interface AgentToolPermission {
  /** 启用的工具组（粗粒度，便于快速配置） */
  groups: ToolGroup[]
  /** 额外白名单工具 ID（精确到单个工具，用于补充工具组外的工具） */
  allowedToolIds?: string[]
  /** 黑名单工具 ID（优先级最高，即使所属组已启用也会被排除） */
  deniedToolIds?: string[]
}

// ---- 精细自动审批矩阵（参考 ROO CODE Auto-Approve Dropdown） ----

/** 自动审批配置矩阵（按操作类型独立开关） */
export interface AutoApprovalConfig {
  /** 全局总开关（master pause/resume，关闭后所有自动审批失效） */
  enabled: boolean
  /** 自动批准读取文件（低风险，建议开启） */
  readFiles: boolean
  /** 自动批准列目录（低风险，建议开启） */
  listFiles: boolean
  /** 自动批准写入/修改文件（中风险，默认关闭需确认） */
  writeFiles: boolean
  /** 自动批准执行安全命令（基于 safeCommandWhitelist 判定） */
  executeSafeCommands: boolean
  /** 自动批准网页搜索/抓取（低风险） */
  browser: boolean
  /** 自动批准 MCP 工具调用（风险取决于具体 MCP，默认关闭） */
  mcpTools: boolean
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
  /** 自动审批矩阵（精细控制，参考 ROO CODE） */
  autoApproval: AutoApprovalConfig
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
  /** 关联的对话消息 ID（触发该检查点的消息） */
  messageId?: string
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
  /** 统一格式的 diff 内容（每行格式：+ 新增, - 删除, 空格 不变） */
  unifiedDiff?: string
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
  /** 关联的对话消息 ID（触发该检查点的消息） */
  messageId?: string
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

/**
 * 默认自动审批配置（保守策略，参考 ROO CODE Auto-Approve）
 *
 * 设计原则：低风险操作自动批准以减少打断，高风险操作默认需人工确认。
 */
export const DEFAULT_AUTO_APPROVAL_CONFIG: AutoApprovalConfig = {
  enabled: false,                // 默认关闭总开关，需用户显式启用
  readFiles: true,               // 读取文件：低风险，建议自动批准
  listFiles: true,               // 列目录：低风险，建议自动批准
  writeFiles: false,             // 写入文件：中风险，默认需确认
  executeSafeCommands: false,    // 安全命令：默认需确认（与 commandPolicy 配合）
  browser: true,                 // 网页操作：低风险，建议自动批准
  mcpTools: false,               // MCP 工具：风险不定，默认需确认
}

/** 默认工作区配置 */
export const DEFAULT_WORKSPACE_INPUT: Omit<WorkspaceCreateInput, 'folderPath'> = {
  name: '',
  description: '',
  // leaderAgentId 不再硬编码：工作区激活时由 workspace-agent-store 自动创建 leader 实例并回填
  leaderAgentId: undefined,
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
  autoApproval: DEFAULT_AUTO_APPROVAL_CONFIG,
}
