// ==================== 设置项元数据注册表 ====================
// 集中定义所有设置项的元数据，供搜索、UI 提示、文档生成等消费

import type { SettingItemMeta, GroupedSettingsRegistry } from '../types/settings-meta'
import type { SettingsSection } from '../components/settings/SettingsNavRail'

// ==================== UI 偏好 ====================

const UI_PREFS_ITEMS: SettingItemMeta[] = [
  {
    id: 'ui-prefs.theme',
    section: 'ui-prefs',
    key: 'theme',
    label: '主题模式',
    description: '切换浅色、深色或跟随系统主题',
    keywords: ['dark mode', '深色模式', '浅色模式', 'theme', 'light', 'dark', 'system'],
    controlType: 'select',
    tags: ['外观'],
  },
  {
    id: 'ui-prefs.fontSize',
    section: 'ui-prefs',
    key: 'fontSize',
    label: '消息字号',
    description: '调整聊天消息的字体大小，范围 12-24px',
    keywords: ['font size', '字体大小', '文字大小'],
    controlType: 'slider',
    tags: ['字体'],
  },
  {
    id: 'ui-prefs.fontFamily',
    section: 'ui-prefs',
    key: 'fontFamily',
    label: '消息字体',
    description: '选择聊天消息的字体族',
    keywords: ['font family', '字体', '字型'],
    controlType: 'select',
    tags: ['字体'],
  },
  {
    id: 'ui-prefs.codeFontFamily',
    section: 'ui-prefs',
    key: 'codeFontFamily',
    label: '代码字体',
    description: '选择代码块的等宽字体',
    keywords: ['code font', '等宽字体', 'monospace'],
    controlType: 'select',
    tags: ['字体', '代码'],
  },
  {
    id: 'ui-prefs.codeFontSize',
    section: 'ui-prefs',
    key: 'codeFontSize',
    label: '代码字号',
    description: '调整代码块的字体大小，范围 11-20px',
    keywords: ['code font size', '代码字体大小'],
    controlType: 'slider',
    tags: ['字体', '代码'],
  },
  {
    id: 'ui-prefs.codeHighlightTheme',
    section: 'ui-prefs',
    key: 'codeHighlightTheme',
    label: '代码高亮主题',
    description: '选择代码语法高亮的配色方案',
    keywords: ['syntax theme', '代码主题', 'highlight', '语法高亮'],
    controlType: 'select',
    tags: ['代码', '外观'],
  },
  {
    id: 'ui-prefs.messageAlignment',
    section: 'ui-prefs',
    key: 'messageAlignment',
    label: '消息对齐方式',
    description: '设置聊天消息的布局对齐方式',
    keywords: ['alignment', '对齐', '布局', 'layout'],
    controlType: 'select',
    tags: ['布局'],
  },
  {
    id: 'ui-prefs.showAvatar',
    section: 'ui-prefs',
    key: 'showAvatar',
    label: '显示头像',
    description: '在聊天消息旁显示用户/AI 头像',
    keywords: ['avatar', '头像', '图标'],
    controlType: 'toggle',
    tags: ['布局'],
  },
  {
    id: 'ui-prefs.showTokenUsage',
    section: 'ui-prefs',
    key: 'showTokenUsage',
    label: '显示 Token 用量',
    description: '在消息下方显示 Token 消耗统计',
    keywords: ['token', '用量', 'usage', '消耗'],
    controlType: 'toggle',
    tags: ['信息'],
  },
  {
    id: 'ui-prefs.showTimestamp',
    section: 'ui-prefs',
    key: 'showTimestamp',
    label: '显示时间戳',
    description: '在消息旁显示发送时间',
    keywords: ['timestamp', '时间', 'time'],
    controlType: 'toggle',
    tags: ['信息'],
  },
  {
    id: 'ui-prefs.sendWithEnter',
    section: 'ui-prefs',
    key: 'sendWithEnter',
    label: 'Enter 发送消息',
    description: '按 Enter 发送消息，Shift+Enter 换行；关闭后行为反转',
    keywords: ['enter', '发送', 'send', '快捷键'],
    controlType: 'toggle',
    tags: ['交互'],
  },
  {
    id: 'ui-prefs.webSearchEnabled',
    section: 'ui-prefs',
    key: 'webSearchEnabled',
    label: '联网搜索',
    description: '启用后 AI 可以搜索互联网获取最新信息',
    keywords: ['web search', '联网', '搜索', 'internet'],
    controlType: 'toggle',
    tags: ['功能'],
    requiresRestart: false,
  },
  {
    id: 'ui-prefs.enableNotification',
    section: 'ui-prefs',
    key: 'enableNotification',
    label: '系统通知',
    description: '后台对话完成时发送系统通知',
    keywords: ['notification', '通知', '提醒'],
    controlType: 'toggle',
    tags: ['通知'],
  },
  {
    id: 'ui-prefs.enableSound',
    section: 'ui-prefs',
    key: 'enableSound',
    label: '声音提示',
    description: '收到新消息时播放提示音',
    keywords: ['sound', '声音', '提示音', 'audio'],
    controlType: 'toggle',
    tags: ['通知'],
  },
  {
    id: 'ui-prefs.notificationSound',
    section: 'ui-prefs',
    key: 'notificationSound',
    label: '提示音效',
    description: '选择通知提示音的风格',
    keywords: ['notification sound', '提示音', '音效'],
    controlType: 'select',
    tags: ['通知'],
  },
  {
    id: 'ui-prefs.sidebarWidth',
    section: 'ui-prefs',
    key: 'sidebarWidth',
    label: '侧边栏宽度',
    description: '调整左侧边栏的宽度，范围 200-480px',
    keywords: ['sidebar', '侧边栏', '宽度', 'width'],
    controlType: 'slider',
    tags: ['布局'],
  },
  {
    id: 'ui-prefs.shortcuts',
    section: 'ui-prefs',
    key: 'shortcuts',
    label: '快捷键配置',
    description: '自定义全局快捷键绑定',
    keywords: ['shortcuts', '快捷键', 'hotkey', 'keyboard'],
    controlType: 'custom',
    tags: ['交互'],
  },
]

// ==================== 知识库设置 ====================

const KNOWLEDGE_BASE_ITEMS: SettingItemMeta[] = [
  {
    id: 'knowledge-base.embeddingProvider',
    section: 'knowledge-base',
    key: 'embeddingConfig',
    label: 'Embedding 提供者',
    description: '选择文本向量化的引擎（本地模型、Ollama、OpenAI 等）',
    keywords: ['embedding', '向量', '模型', 'provider'],
    controlType: 'select',
    tags: ['向量化'],
    requiresRestart: true,
  },
  {
    id: 'knowledge-base.chunkingMode',
    section: 'knowledge-base',
    key: 'chunkingConfig.mode',
    label: '分块模式',
    description: '选择文档切分策略（固定长度、按段落、语义分块）',
    keywords: ['chunking', '分块', '切分', 'segment'],
    controlType: 'select',
    tags: ['分块'],
    path: 'chunkingConfig.mode',
  },
  {
    id: 'knowledge-base.chunkSize',
    section: 'knowledge-base',
    key: 'chunkingConfig.chunkSize',
    label: '分块大小',
    description: '每个文本块的最大字符数',
    keywords: ['chunk size', '块大小', '分块长度'],
    controlType: 'slider',
    tags: ['分块'],
    path: 'chunkingConfig.chunkSize',
  },
  {
    id: 'knowledge-base.chunkOverlap',
    section: 'knowledge-base',
    key: 'chunkingConfig.overlap',
    label: '分块重叠',
    description: '相邻文本块之间的重叠字符数，有助于保持上下文连贯',
    keywords: ['overlap', '重叠', '分块重叠'],
    controlType: 'slider',
    tags: ['分块'],
    path: 'chunkingConfig.overlap',
  },
  {
    id: 'knowledge-base.retrievalTopK',
    section: 'knowledge-base',
    key: 'retrievalConfig.topK',
    label: '检索数量 (Top K)',
    description: '每次检索返回的最相关文本块数量',
    keywords: ['top k', '检索数量', '返回数量'],
    controlType: 'slider',
    tags: ['检索'],
    path: 'retrievalConfig.topK',
  },
  {
    id: 'knowledge-base.retrievalThreshold',
    section: 'knowledge-base',
    key: 'retrievalConfig.minScore',
    label: '最低相关度阈值',
    description: '低于此相似度分数的文本块将被过滤',
    keywords: ['threshold', '阈值', '相似度', 'score'],
    controlType: 'slider',
    tags: ['检索'],
    path: 'retrievalConfig.minScore',
  },
  {
    id: 'knowledge-base.hybridWeight',
    section: 'knowledge-base',
    key: 'retrievalConfig.hybridWeight',
    label: '混合检索权重',
    description: '向量检索与关键词检索的权重比例',
    keywords: ['hybrid', '混合', '权重', 'weight'],
    controlType: 'slider',
    tags: ['检索'],
    path: 'retrievalConfig.hybridWeight',
  },
]

// ==================== 模型参数 ====================

const MODEL_PARAMS_ITEMS: SettingItemMeta[] = [
  {
    id: 'model-params.temperature',
    section: 'model-params',
    key: 'temperature',
    label: '温度 (Temperature)',
    description: '控制生成文本的随机性，0 = 精确，2 = 创意',
    keywords: ['temperature', '温度', '随机性', '创意'],
    controlType: 'slider',
    tags: ['推理'],
  },
  {
    id: 'model-params.maxTokens',
    section: 'model-params',
    key: 'maxTokens',
    label: '最大 Tokens',
    description: 'AI 单次回复的最大 Token 数量',
    keywords: ['max tokens', '最大token', 'token限制'],
    controlType: 'slider',
    tags: ['推理'],
  },
  {
    id: 'model-params.streamEnabled',
    section: 'model-params',
    key: 'streamEnabled',
    label: '流式输出',
    description: '启用后 AI 将逐字输出回复，关闭则等待完整回复',
    keywords: ['stream', '流式', '逐字输出'],
    controlType: 'toggle',
    tags: ['推理'],
  },
  {
    id: 'model-params.activeProviderId',
    section: 'model-params',
    key: 'activeProviderId',
    label: '默认 AI 源',
    description: '选择全局默认使用的 AI 服务提供者',
    keywords: ['provider', 'AI源', '默认源'],
    controlType: 'select',
    tags: ['AI源'],
    requiresRestart: false,
  },
]

// ==================== AI 源管理 ====================

const AI_PROVIDERS_ITEMS: SettingItemMeta[] = [
  {
    id: 'ai-providers.providers',
    section: 'ai-providers',
    key: 'providers',
    label: 'AI 源列表',
    description: '管理 AI 服务提供者（API 地址、密钥、模型列表）',
    keywords: ['provider', 'AI源', 'API', 'openai', 'deepseek', 'ollama'],
    controlType: 'custom',
    tags: ['AI源'],
  },
  {
    id: 'ai-providers.connection',
    section: 'ai-providers',
    key: 'health',
    label: '连接状态',
    description: '检查各 AI 源的在线连接状态',
    keywords: ['connection', '连接', 'health', '在线'],
    controlType: 'custom',
    tags: ['AI源'],
  },
  {
    id: 'ai-providers.requestConfig',
    section: 'ai-providers',
    key: 'requestConfig',
    label: '请求配置',
    description: '设置超时时间、重试次数、API 请求频率限制、自定义 HTTP 头',
    keywords: ['request', 'timeout', '超时', '重试', 'retry', 'rate limit', '频率', '限流'],
    controlType: 'custom',
    tags: ['AI源'],
  },
]

// ==================== Agent 管理 ====================

const AGENTS_ITEMS: SettingItemMeta[] = [
  {
    id: 'agents.agents',
    section: 'agents',
    key: 'agents',
    label: 'Agent 列表',
    description: '管理 AI Agent 配置（系统提示词、工具、规划策略）',
    keywords: ['agent', '智能体', '角色'],
    controlType: 'custom',
    tags: ['Agent'],
  },
  {
    id: 'agents.modelConfig',
    section: 'agents',
    key: 'modelConfig',
    label: 'Agent 模型配置',
    description: '为 Agent 单独绑定 AI 源和模型参数，可覆盖全局配置',
    keywords: ['model config', '模型配置', '覆盖'],
    controlType: 'custom',
    tags: ['Agent', '模型'],
  },
  {
    id: 'agents.planningStrategy',
    section: 'agents',
    key: 'planningStrategy',
    label: '规划策略',
    description: '选择 Agent 的推理规划方式（ReAct、计划执行、试错）',
    keywords: ['planning', '规划', 'react', '策略'],
    controlType: 'select',
    tags: ['Agent'],
  },
  {
    id: 'agents.memoryConfig',
    section: 'agents',
    key: 'memoryConfig',
    label: '记忆配置',
    description: '设置 Agent 的对话历史保留轮数和长期记忆',
    keywords: ['memory', '记忆', '历史', '上下文'],
    controlType: 'custom',
    tags: ['Agent'],
  },
  {
    id: 'agents.termination',
    section: 'agents',
    key: 'termination',
    label: '终止条件',
    description: '设置 Agent 的最大推理步数和超时时间',
    keywords: ['termination', '终止', '步数', '超时'],
    controlType: 'custom',
    tags: ['Agent'],
  },
]

// ==================== 提示词管理 ====================

const PROMPTS_ITEMS: SettingItemMeta[] = [
  {
    id: 'prompts.prompts',
    section: 'prompts',
    key: 'prompts',
    label: '提示词库',
    description: '管理自定义提示词模板（变量、版本、A/B 测试）',
    keywords: ['prompt', '提示词', '模板', 'system prompt'],
    controlType: 'custom',
    tags: ['提示词'],
  },
  {
    id: 'prompts.chains',
    section: 'prompts',
    key: 'promptChains',
    label: '提示词链',
    description: '创建多步骤提示词执行链',
    keywords: ['chain', '链', '多步骤', 'pipeline'],
    controlType: 'custom',
    tags: ['提示词'],
  },
  {
    id: 'prompts.variables',
    section: 'prompts',
    key: 'variables',
    label: '变量系统',
    description: '在提示词中使用动态变量（日期、用户信息等）',
    keywords: ['variable', '变量', '模板变量', '动态'],
    controlType: 'custom',
    tags: ['提示词'],
  },
]

// ==================== MCP 配置 ====================

const MCP_ITEMS: SettingItemMeta[] = [
  {
    id: 'mcp.servers',
    section: 'mcp',
    key: 'mcpServers',
    label: 'MCP 服务器',
    description: '管理 Model Context Protocol 服务器配置',
    keywords: ['mcp', 'server', '服务器', 'protocol'],
    controlType: 'custom',
    tags: ['MCP'],
  },
  {
    id: 'mcp.tools',
    section: 'mcp',
    key: 'mcpTools',
    label: 'MCP 工具',
    description: '查看和管理从 MCP 服务器获取的工具',
    keywords: ['mcp tools', 'MCP工具'],
    controlType: 'custom',
    tags: ['MCP'],
  },
]

// ==================== 工具管理 ====================

const TOOLS_ITEMS: SettingItemMeta[] = [
  {
    id: 'tools.customTools',
    section: 'tools',
    key: 'customTools',
    label: '自定义工具',
    description: '创建和管理自定义工具（函数调用）',
    keywords: ['tool', '工具', 'function', '函数'],
    controlType: 'custom',
    tags: ['工具'],
  },
]

// ==================== 数据管理 ====================

const DATA_MGMT_ITEMS: SettingItemMeta[] = [
  {
    id: 'data-mgmt.backup',
    section: 'data-mgmt',
    key: 'backup',
    label: '数据备份',
    description: '创建和恢复应用数据的完整备份',
    keywords: ['backup', '备份', '恢复', 'restore'],
    controlType: 'custom',
    tags: ['数据'],
  },
  {
    id: 'data-mgmt.export',
    section: 'data-mgmt',
    key: 'export',
    label: '导出对话',
    description: '将对话记录导出为 Markdown 或 JSON 格式',
    keywords: ['export', '导出', 'markdown', 'json'],
    controlType: 'custom',
    tags: ['数据'],
  },
  {
    id: 'data-mgmt.cache',
    section: 'data-mgmt',
    key: 'cache',
    label: '缓存管理',
    description: '查看和清理应用缓存数据',
    keywords: ['cache', '缓存', '清理', 'clear'],
    controlType: 'custom',
    tags: ['数据'],
  },
  {
    id: 'data-mgmt.privacy',
    section: 'data-mgmt',
    key: 'privacy',
    label: '隐私安全',
    description: '扫描和清除敏感数据（API 密钥等）',
    keywords: ['privacy', '隐私', '安全', 'api key', '敏感'],
    controlType: 'custom',
    tags: ['数据', '安全'],
  },
  {
    id: 'data-mgmt.localStorage',
    section: 'data-mgmt',
    key: 'localStorage',
    label: '本地存储',
    description: '查看 localStorage 使用情况和存储版本信息',
    keywords: ['storage', '存储', 'localstorage'],
    controlType: 'custom',
    tags: ['数据'],
  },
]

// ==================== 工作区 ====================

const WORKSPACE_ITEMS: SettingItemMeta[] = [
  {
    id: 'workspace.name',
    section: 'workspace',
    key: 'name',
    label: '工作区名称',
    description: '工作区的显示名称',
    keywords: ['workspace name', '工作区名', '项目名'],
    controlType: 'input',
    tags: ['基本'],
  },
  {
    id: 'workspace.folderPath',
    section: 'workspace',
    key: 'folderPath',
    label: '工作区文件夹',
    description: '工作区绑定的本地文件夹路径',
    keywords: ['folder', '文件夹', '目录', '路径', 'project directory'],
    controlType: 'custom',
    tags: ['文件'],
  },
  {
    id: 'workspace.leaderAgentId',
    section: 'workspace',
    key: 'leaderAgentId',
    label: 'AI 领导 Agent',
    description: '负责协调工作区任务的 Agent',
    keywords: ['leader', '领导', '协调', 'agent', '主 agent'],
    controlType: 'select',
    tags: ['Agent'],
  },
  {
    id: 'workspace.commandPolicy',
    section: 'workspace',
    key: 'commandPolicy',
    label: '命令审批策略',
    description: '控制 AI Agent 执行 shell 命令的审批方式',
    keywords: ['command', '命令', '审批', 'shell', 'terminal', '执行'],
    controlType: 'select',
    layer: 'policy',
    showInQuickAccess: true,
    options: [
      { value: 'auto-approve-safe', label: '安全命令自动批准', desc: '安全命令自动执行，中高风险需审批' },
      { value: 'all-need-approval', label: '全部需要审批', desc: '所有命令都需要人工审批' },
      { value: 'auto-approve-all', label: '全部自动批准', desc: '所有命令自动执行（不推荐）' },
    ],
    defaultValue: 'auto-approve-safe',
    tags: ['命令'],
  },
  {
    id: 'workspace.commandExecutionEnabled',
    section: 'workspace',
    key: 'commandExecutionEnabled',
    label: '启用命令执行',
    description: '是否允许 AI Agent 在工作区中执行 shell 命令',
    keywords: ['command execution', '命令执行', 'shell', 'terminal'],
    controlType: 'toggle',
    layer: 'policy',
    showInQuickAccess: true,
    defaultValue: true,
    tags: ['命令'],
  },
  {
    id: 'workspace.postWriteLint.enabled',
    section: 'workspace',
    key: 'postWriteLint.enabled',
    path: 'postWriteLint.enabled',
    label: '写后自动检查',
    description: 'AI 写入代码后自动探测并运行 ESLint、TypeScript、Ruff、RuboCop 等检查；失败会将错误反馈给 AI 继续修复',
    keywords: ['post write lint', 'lint', 'eslint', 'typescript', 'ruff', 'rubocop', '写后检查', '自动修复', '代码检查'],
    controlType: 'toggle',
    layer: 'policy',
    showInQuickAccess: true,
    defaultValue: true,
    tags: ['代码质量', '自动化'],
  },
  {
    id: 'workspace.contextConfig.compressionEnabled',
    section: 'workspace',
    key: 'contextConfig.compressionEnabled',
    label: '上下文压缩',
    description: '启用对话上下文压缩以节省 Token 消耗',
    keywords: ['compression', '压缩', 'context', '上下文', 'token'],
    controlType: 'toggle',
    layer: 'policy',
    showInQuickAccess: true,
    defaultValue: true,
    tags: ['上下文'],
  },
  {
    id: 'workspace.contextConfig.maxTokens',
    section: 'workspace',
    key: 'contextConfig.maxTokens',
    label: '最大 Token 数',
    description: '对话上下文的最大 Token 限制',
    keywords: ['max tokens', 'token limit', 'token 上限'],
    controlType: 'slider',
    layer: 'policy',
    defaultValue: 8000,
    min: 1000,
    max: 200000,
    step: 1000,
    unit: ' tokens',
    tags: ['上下文'],
  },
  {
    id: 'workspace.contextConfig.compressionThreshold',
    section: 'workspace',
    key: 'contextConfig.compressionThreshold',
    label: '压缩阈值',
    description: '达到最大 Token 数的指定比例后触发上下文压缩',
    keywords: ['compression threshold', '压缩阈值', 'context', '百分比'],
    controlType: 'slider',
    layer: 'policy',
    defaultValue: 80,
    min: 50,
    max: 100,
    step: 5,
    unit: '%',
    tags: ['上下文'],
  },
  {
    id: 'workspace.contextConfig.keepCheckpointBeforeCompression',
    section: 'workspace',
    key: 'contextConfig.keepCheckpointBeforeCompression',
    label: '压缩前保存消息快照',
    description: '在压缩上下文前保存消息历史快照，便于在时间线中查看压缩前内容（与 Git / AI Changes 无关）',
    keywords: ['checkpoint before compression', '压缩前快照', '上下文快照', '消息历史'],
    controlType: 'toggle',
    layer: 'policy',
    defaultValue: true,
    tags: ['上下文'],
  },
]

// ==================== 汇总注册表 ====================

/** 扁平注册表（用于搜索） */
export const SETTINGS_REGISTRY: SettingItemMeta[] = [
  ...UI_PREFS_ITEMS,
  ...KNOWLEDGE_BASE_ITEMS,
  ...MODEL_PARAMS_ITEMS,
  ...AI_PROVIDERS_ITEMS,
  ...AGENTS_ITEMS,
  ...PROMPTS_ITEMS,
  ...MCP_ITEMS,
  ...TOOLS_ITEMS,
  ...WORKSPACE_ITEMS,
  ...DATA_MGMT_ITEMS,
]

// ==================== Skills ====================

const SKILLS_ITEMS: SettingItemMeta[] = []

/** 按 section 分组的注册表 */
export const GROUPED_SETTINGS_REGISTRY: GroupedSettingsRegistry = {
  'ai-providers': AI_PROVIDERS_ITEMS,
  'agents': AGENTS_ITEMS,
  'prompts': PROMPTS_ITEMS,
  'skills': SKILLS_ITEMS,
  'mcp': MCP_ITEMS,
  'tools': TOOLS_ITEMS,
  'workspace': WORKSPACE_ITEMS,
  'knowledge-base': KNOWLEDGE_BASE_ITEMS,
  'model-params': MODEL_PARAMS_ITEMS,
  'ui-prefs': UI_PREFS_ITEMS,
  'data-mgmt': DATA_MGMT_ITEMS,
}

/** 按 id 索引的注册表（O(1) 查找） */
export const SETTINGS_REGISTRY_MAP = new Map<string, SettingItemMeta>(
  SETTINGS_REGISTRY.map((item) => [item.id, item])
)

/**
 * 获取指定设置项的元数据
 */
export function getSettingMeta(id: string): SettingItemMeta | undefined {
  return SETTINGS_REGISTRY_MAP.get(id)
}

/**
 * 模糊搜索设置项
 * 匹配 label、description、keywords，返回按相关度排序的结果
 */
export function searchSettings(query: string): SettingItemMeta[] {
  if (!query.trim()) return []

  const normalizedQuery = query.toLowerCase().trim()
  const terms = normalizedQuery.split(/\s+/)

  const scored: Array<{ item: SettingItemMeta; score: number }> = []

  for (const item of SETTINGS_REGISTRY) {
    let score = 0
    const labelLower = item.label.toLowerCase()
    const descLower = item.description.toLowerCase()
    const keywordsLower = (item.keywords || []).map((k) => k.toLowerCase())
    const tagsLower = (item.tags || []).map((t) => t.toLowerCase())

    for (const term of terms) {
      // label 精确匹配权重最高
      if (labelLower.includes(term)) score += 10
      // keyword 精确匹配
      if (keywordsLower.some((k) => k.includes(term))) score += 8
      // tag 匹配
      if (tagsLower.some((t) => t.includes(term))) score += 5
      // description 匹配
      if (descLower.includes(term)) score += 3
    }

    if (score > 0) {
      scored.push({ item, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item)
}

/**
 * 获取指定 section 的所有设置项
 */
export function getSectionSettings(section: SettingsSection): SettingItemMeta[] {
  return GROUPED_SETTINGS_REGISTRY[section] || []
}

/**
 * 获取需要重启的设置项
 */
export function getRestartRequiredSettings(): SettingItemMeta[] {
  return SETTINGS_REGISTRY.filter((item) => item.requiresRestart)
}

/**
 * 获取指定 section 的快捷设置项。
 */
export function getQuickAccessSettings(section: SettingsSection): SettingItemMeta[] {
  return getSectionSettings(section).filter((item) => item.showInQuickAccess)
}
