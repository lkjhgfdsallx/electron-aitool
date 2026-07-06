/**
 * Agent Engine - 驱动 Agent 运行的核心引擎
 *
 * 实现 ReAct（思考-行动-观察）循环模式：
 * 1. 组装 Prompt（系统提示词 + 工具描述 + 记忆 + 用户消息）
 * 2. 调用 LLM API，获取模型输出
 * 3. 解析输出：最终回复 or 工具调用（支持原生 function calling 和文本格式）
 * 4. 如果是工具调用 → 执行工具 → 将结果反馈给模型
 * 5. 重复 2~4，直到达到终止条件
 */

import type {
  AgentProfile,
  AgentStep,
  AgentRunContext,
  ResolvedAIConfig,
  Message,
  Tool,
  ToolExecuteResult,
  AutoApprovalConfig,
  PlanningStrategy,
  MemoryConfig,
  TerminationConfig,
  AgentModelConfig,
  ContextPolicy,
  ApprovalPolicy,
} from '../types'
import { aiService } from './ai-service'
import { toolService } from './tool-service'
import { memoryService } from './memory-service'
import { knowledgeBaseService } from './knowledge-base-service'
import { WORKSPACE_TOOLS } from './built-in-tools'
import { WORKSPACE_LEADER_AGENT_ID } from '../constants/default-agents'
import { useSkillStore } from '../stores/skill-store'
import { toolExecutorRegistry, agentEventBus } from './agent'
import type { AgentSessionContext, ToolExecutorSessionBundle } from './agent'
import { contextManager } from './agent/context-manager'
import type { CompressibleMessage } from './agent/context-manager'
import {
  createWorkflowRuntimeState,
  filterToolsByState,
  getStatePromptSection,
  advanceState,
} from './agent/workflow-engine'
import type { WorkflowRuntimeState } from '../types'
import type { TransitionContext } from './agent/workflow-engine'

/** Agent 引擎回调 */
export interface AgentEngineCallbacks {
  /** 每一步执行时回调（用于实时展示） */
  onStep: (step: AgentStep) => void
  /** 最终回复内容流式输出 */
  onToken: (token: string) => void
  /** 推理内容流式输出 */
  onReasoningToken: (token: string) => void
  /** 运行状态变化 */
  onStatusChange: (status: AgentRunContext['status']) => void
  /** 错误 */
  onError: (error: string) => void
  /** 完成 */
  onDone: (finalContent: string) => void
  /** 需要用户输入时回调（返回用户选择的值，单选为字符串，多选为字符串数组） */
  onHumanInput?: (step: AgentStep) => Promise<string | string[]>
  /** 网站分析报告生成完成时回调（传递自包含的 HTML 报告） */
  onReportReady?: (reportHtml: string) => void
  /** 网站分析实时进度回调 */
  onSiteAnalyzerProgress?: (progress: { taskId: string; type: string; message: string; pagesCrawled?: number; totalPages?: number; apisFound?: number; pagesAnalyzed?: number; currentUrl?: string; error?: string }) => void
}

/**
 * 继续生成时的恢复选项（resume 模式）。
 * 传入给 runAgent，使其跳过用户消息追加、从已有步骤重建历史。
 */
export interface ResumeOptions {
  /** 标记为恢复模式 */
  resume: true
  /** 已有的 AgentStep 列表（从消息的 agentSteps 字段恢复） */
  existingSteps?: AgentStep[]
}

/** 子任务结构化结果（Boomerang 模式回流，参考 ROO CODE new_task 结果） */
export interface SubTaskResult {
  /** 子 Agent ID */
  agentId: string
  /** 子 Agent 名称 */
  agentName: string
  /** 任务描述 */
  task: string
  /** 最终文本输出 */
  content: string
  /** 执行状态 */
  status: 'success' | 'error' | 'partial'
  /** 完成原因 */
  finishReason?: string
  /** 执行步骤数 */
  stepCount: number
  /** 错误信息（status='error' 时） */
  error?: string
  /** 子 Agent 声称创建/修改的关键产物路径（可选） */
  artifacts?: string[]
  /** 时间戳 */
  timestamp: number
}

/** 子 Agent 活动事件 */
export interface SubAgentActivityEvent {
  /** 子 Agent ID */
  agentId: string
  /** 子 Agent 名称 */
  agentName: string
  /** 子 Agent 头像 */
  agentAvatar?: string
  /** 事件类型 */
  type: 'step' | 'status_change' | 'error' | 'done'
  /** Agent 步骤（type='step' 时） */
  step?: AgentStep
  /** 状态变更（type='status_change' 时） */
  status?: string
  /** 错误信息（type='error' 时） */
  error?: string
  /** 结构化结果（type='done' 时，Boomerang 回流） */
  result?: SubTaskResult
}

/**
 * 创建 Agent 的输入参数（workspace_create_agent 工具 → WorkspaceContext.createAgent）
 *
 * 包含 Phase 4 增强字段，全部可选（向后兼容）。
 * 底层 createWorkspaceAgent 接受 AgentProfileCreateInput，已支持所有字段。
 */
export interface CreateAgentInput {
  name: string
  description: string
  systemPrompt: string
  avatar?: string
  enabledToolIds?: string[]
  // ---- Phase 4 增强字段 ----
  /** 规划策略（默认 'react'） */
  planningStrategy?: PlanningStrategy
  /** 记忆配置 */
  memoryConfig?: MemoryConfig
  /** 终止条件 */
  termination?: TerminationConfig
  /** 模型配置（覆盖全局） */
  modelConfig?: AgentModelConfig
  /** 绑定的知识库集合 ID 列表 */
  knowledgeBaseIds?: string[]
  /** 上下文管理策略 */
  contextPolicy?: ContextPolicy
  /** 工具审批策略 */
  approvalPolicy?: ApprovalPolicy
  /** 并行度上限 */
  maxParallelSubtasks?: number
}

/** 工作区上下文（在 Agent 运行时注入） */
export interface WorkspaceContext {
  /** 工作区根目录的绝对路径 */
  folderPath: string
  /** 工作区 ID */
  workspaceId: string
  /** 团队 Agent 列表（仅包含 ID、名称、描述、工具能力等摘要信息） */
  teamAgents: Array<{ id: string; name: string; description: string; avatar: string; enabledToolIds?: string[] }>
  /** 由上层注入的子任务分派函数（调用后会真正运行目标 Agent 并返回其最终输出） */
  dispatchSubTask?: (agentId: string, taskDescription: string, contextSummary?: string) => Promise<string>
  /** Phase 3: 并行子任务分派函数（一次分派多个子任务，并行执行，结果按入参顺序返回） */
  dispatchTasks?: (tasks: Array<{ agentId: string; task: string; context?: string; dependsOnIndexes?: number[] }>) => Promise<string[]>
  /** 由上层注入的创建 Agent 函数（创建新 Agent 并加入工作区团队，返回 Agent ID） */
  createAgent?: (input: CreateAgentInput) => Promise<string>
  /** 子 Agent 活动回调（将子 Agent 的执行步骤实时上报给 UI） */
  onSubAgentActivity?: (event: SubAgentActivityEvent) => void

  // ---- 自动审批（阶段 1 新增，参考 ROO CODE Auto-Approve） ----

  /** 工作区的自动审批配置矩阵（来自 workspace.autoApproval） */
  autoApproval?: AutoApprovalConfig
  /** 文件操作审批回调（当自动审批未通过时，由上层弹出审批弹窗） */
  onFileActionApproval?: (request: FileActionApprovalRequest) => Promise<FileActionApprovalResult>
}

/** 文件操作审批请求（发送给 UI 层） */
export interface FileActionApprovalRequest {
  /** 请求 ID */
  id: string
  /** 操作类型 */
  actionType: 'write-file' | 'read-file' | 'list-files'
  /** 工具显示名称 */
  toolName: string
  /** 目标文件路径（相对于工作区根目录） */
  filePath: string
  /** 写入内容预览（仅 write-file 时提供，截断到前 500 字符） */
  contentPreview?: string
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high'
  /** 发起请求的 Agent ID */
  agentId?: string
  /** 发起请求的 Agent 名称 */
  agentName?: string
  /** 请求时间 */
  timestamp: number
}

/** 文件操作审批结果 */
export type FileActionApprovalResult =
  | 'approved-once'   // 仅此一次批准
  | 'approved-always' // 永远允许（更新 autoApproval 配置）
  | 'denied'          // 拒绝

/** Agent 内部消息格式（支持工具调用） */
interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** 原生工具调用列表（assistant 消息） */
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  /** 工具结果关联的调用 ID（tool 消息） */
  toolCallId?: string
  /** 工具名称（tool 消息） */
  toolName?: string
}

/**
 * 构建 Agent 的系统提示词（含工具描述和记忆）
 */
function buildAgentSystemPrompt(
  agent: AgentProfile,
  tools: Tool[],
  memoryContext: string,
  workspaceContext?: WorkspaceContext,
  /** Phase 4: 工作流当前状态的提示词片段（可选） */
  extraPromptSection?: string,
): string {
  let prompt = agent.systemPrompt

  // 判断是否为 Leader Agent（纯指挥者模式）：通过标签判断，不再依赖固定 ID
  const isLeader = agent.tags?.includes('leader') ?? false

  // 注入工作区上下文（文件夹路径 + 团队成员信息 + 工作流程指引）
  if (workspaceContext) {
    prompt += `\n\n## 工作区信息\n`
    prompt += `- 工作区根目录：\`${workspaceContext.folderPath}\`\n`
    prompt += `- 工作区 ID：\`${workspaceContext.workspaceId}\`\n`

    if (workspaceContext.teamAgents.length > 0) {
      prompt += `\n### 团队成员\n你有以下团队成员可以分派任务：\n`
      for (const agent of workspaceContext.teamAgents) {
        prompt += `\n- **${agent.name}**（ID: \`${agent.id}\`）${agent.avatar}：${agent.description}\n`
      }
      prompt += `\n使用 \`workspace_dispatch_task\` 工具将子任务分派给团队成员。分派时请提供详细的任务描述和足够的上下文信息。\n`
    }
    if (workspaceContext.createAgent) {
      prompt += `\n如果现有团队成员无法胜任某项任务，你可以使用 \`workspace_create_agent\` 工具创建新的工作区专属 Agent（仅存储在当前工作区，不会污染全局 Agent 列表），然后通过 \`workspace_dispatch_task\` 将任务分派给它。\n`
    }

    if (isLeader) {
      // Leader Agent 的指挥者规则（强化指挥者身份）
      prompt += `\n### 🔴 指挥者准则\n`
      prompt += `0. **获取到用户指令后，不要立即工作，先查看自己的手下，看看有没有可以安排任务的。** \n`
      prompt += `1. **你绝不亲自编写代码、创建文件或执行命令。** 所有实际工作必须通过 \`workspace_dispatch_task\` 分派给团队成员完成。\n`
      prompt += `2. **绝对禁止在回复中输出代码块（\`\`\`）。** 你的回复只包含分析、计划、说明和指挥指令。\n`
      prompt += `3. **绝对禁止使用 \`workspace_write_file\`、\`workspace_read_file\`、\`workspace_execute_command\` 等执行工具。** 这些工具只留给被分派任务的 Agent 使用。\n`
      prompt += `4. 需要了解文件内容或目录结构时，使用 \`workspace_list_files\` 浏览，或派一个 Agent 去读取并汇报。\n`
      prompt += `5. 收到执行结果后，检查质量，不达标的重新分派并补充更详细的指导。\n`
      prompt += `\n违反以上准则会导致任务失败。你的价值在于优秀的规划和协调能力，而非直接动手。\n`

      // 检测团队中是否有需求分析类 Agent，强制执行"先分析后开发"工作流
      const hasRequirementAnalyst = workspaceContext.teamAgents.some((a) => {
        const name = a.name.toLowerCase()
        const desc = a.description.toLowerCase()
        return name.includes('需求') || name.includes('requirement') || name.includes('analyst')
            || desc.includes('需求分析') || desc.includes('需求规格') || desc.includes('requirement')
      })
      if (hasRequirementAnalyst) {
        prompt += `\n### 🔵 强制工作流程：先分析后开发\n`
        prompt += `团队中存在**需求分析 Agent**，你必须严格遵守以下工作流程：\n\n`
        prompt += `**第一步：需求分析（必须首先执行）**\n`
        prompt += `- 将用户的原始需求完整、准确地分派给需求分析 Agent\n`
        prompt += `- 在任务描述中明确告知"请对以下需求进行详细分析，输出结构化的需求规格文档"\n`
        prompt += `- **等待需求分析 Agent 返回完整的需求规格文档后，才能进入下一步**\n\n`
        prompt += `**第二步：审查需求**\n`
        prompt += `- 审阅需求分析 Agent 输出的需求规格文档\n`
        prompt += `- 确认需求是否完整、清晰、无歧义\n`
        prompt += `- 如有遗漏或不清楚的地方，重新分派给需求分析 Agent 补充\n\n`
        prompt += `**第三步：分派开发任务**\n`
        prompt += `- 将经过审查的需求规格文档作为上下文，分派给开发类 Agent\n`
        prompt += `- 在任务描述中附上完整的需求规格，确保开发 Agent 有充分的信息\n`
        prompt += `- 为每个功能点分派独立的子任务\n\n`
        prompt += `**⚠️ 绝对禁止：跳过需求分析直接分派开发任务。违反此流程会导致开发结果不符合用户预期。**\n`
      }
    } else {
      // 子 Agent 的工具使用强制规则（对实际执行工作的 Agent 适用）
      prompt += `\n### ⚠️ 工具使用强制规则\n`
      prompt += `1. **绝对禁止**在你的回复中输出代码块（\`\`\`）。你的回复只包含分析、计划和说明文字。\n`
      prompt += `2. **必须使用** \`workspace_write_file\` 工具来创建或修改文件。代码只能通过此工具写入工作区文件系统。\n`
      prompt += `3. **必须使用** \`workspace_read_file\` 来读取现有文件内容，不要凭记忆猜测。\n`
      prompt += `4. **必须使用** \`workspace_list_files\` 来了解项目结构，不要假设目录结构。\n`
      prompt += `5. **必须使用** \`workspace_execute_command\` 来运行构建、测试等命令。\n`
      prompt += `\n违反以上规则会导致任务失败。用户期望在工作区文件系统中看到实际的代码文件，而不是对话中的 Markdown 文本。\n`
    }
  }

  // 添加工具描述
  if (tools.length > 0) {
    prompt += '\n\n## 可用工具\n你可以使用以下工具来完成任务：\n'
    for (const tool of tools) {
      prompt += `\n### ${tool.name}\n描述：${tool.description}\n参数：${JSON.stringify(tool.parameters, null, 2)}\n`
    }
    prompt += `\n要调用工具，请使用提供的 function calling 功能。\n`
    if (isLeader) {
      // Leader 的指挥者工具使用规则
      prompt += `\n### 重要：指挥者工具使用规则\n`
      prompt += `- 你只使用指挥类工具（\`workspace_dispatch_task\`、\`workspace_create_agent\`）和侦察类工具（\`workspace_list_files\`、搜索、记忆）。\n`
      prompt += `- **绝不使用**执行类工具（\`workspace_write_file\`、\`workspace_read_file\`、\`workspace_execute_command\`）。\n`
      prompt += `- 收到分派结果后，检查质量。不达标的重新分派并补充更详细的指导。\n`
      prompt += `- 所有子任务都完成后，向用户总结执行结果。\n`
    } else {
      // 子 Agent 的通用工具使用规则
      prompt += `\n### 重要：工具使用规则\n`
      prompt += `- 当任务涉及计算、数学推导、数据分析、或需要精确结果时，你必须调用相关工具来完成，不要尝试自行计算或推导。\n`
      prompt += `- 工具提供的结果是精确的，你的推理和最终回答应基于工具返回的结果。\n`
      prompt += `- 你可以且应该连续调用多个工具来完成复杂任务，不要在第一步之后就停止。\n`
      prompt += `- 每次收到工具执行结果后，分析结果并判断任务是否完成。\n`
      prompt += `- 如果任务尚未完成，请继续调用下一个需要的工具。\n`
      prompt += `- 只有当你确信任务的所有步骤都已完成时，才给出最终回答。\n`
      prompt += `- 不要把中间结果当作最终回答，中间结果应作为继续执行的依据。\n`
    }
  }

  // 添加可用 Skills 信息（按 Agent 绑定的 enabledSkillIds 过滤）
  if (agent.enabledSkillIds && agent.enabledSkillIds.length > 0) {
    const allSkills = useSkillStore.getState().getAllEnabledSkills()
    const boundSkills = allSkills.filter((s) => agent.enabledSkillIds!.includes(s.dirPath))
    if (boundSkills.length > 0) {
      prompt += `\n\n## 可用专业技能（Skills）\n`
      prompt += `你有以下专业技能可供使用，这些技能为你提供了特定领域的专家知识：\n`
      for (const skill of boundSkills) {
        prompt += `\n- **${skill.name}**：${skill.description}\n`
      }
      prompt += `\n### 如何使用 Skills\n`
      prompt += `- 使用 \`list_skills\` 工具查看所有可用技能的详细列表\n`
      prompt += `- 使用 \`use_skill\` 工具加载特定技能的完整内容。加载后，技能的知识将注入到你的上下文中，指导你按照专家方式完成任务\n`
      prompt += `- 当用户的请求涉及某个技能的领域时，你应该主动加载该技能以获取专业指导\n`
    }
  }

  // 添加记忆上下文
  if (memoryContext) {
    prompt += `\n\n${memoryContext}\n`
  }

  // 添加规划策略提示
  if (isLeader) {
    // 检测团队中是否有需求分析类 Agent（用于指挥策略）
    const hasAnalystInTeam = workspaceContext?.teamAgents.some((a) => {
      const name = a.name.toLowerCase()
      const desc = a.description.toLowerCase()
      return name.includes('需求') || name.includes('requirement') || name.includes('analyst')
          || desc.includes('需求分析') || desc.includes('需求规格') || desc.includes('requirement')
    })

    // Leader 专用的指挥策略（覆盖 agent.planningStrategy）
    prompt += '\n\n## 指挥策略\n请按以下方式工作：\n'
    prompt += '1. **侦察**：使用 \`workspace_list_files\` 了解工作区结构，分析用户需求\n'
    prompt += '2. **规划**：将大任务拆解为多个可独立执行的子任务\n'
    if (hasAnalystInTeam) {
      prompt += '3. **需求分析（必须首先执行）**：将用户原始需求分派给团队中的需求分析 Agent，等待其输出结构化需求规格文档\n'
      prompt += '4. **审查需求**：审阅需求规格文档，确认完整、清晰、无歧义，如有遗漏则要求补充\n'
      prompt += '5. **组建团队**：检查现有团队成员能力，必要时使用 \`workspace_create_agent\` 创建新 Agent\n'
      prompt += '6. **分派开发任务**：将需求规格文档作为上下文分派给开发类 Agent，每个功能点独立分派\n'
      prompt += '7. **监控与整合**：收到结果后检查质量，不达标的重新分派；全部完成后向用户总结\n'
    } else {
      prompt += '3. **组建团队**：检查现有团队成员能力，必要时使用 \`workspace_create_agent\` 创建新 Agent\n'
      prompt += '4. **分派任务**：使用 \`workspace_dispatch_task\` 将子任务分派给对应 Agent\n'
      prompt += '5. **监控与整合**：收到结果后检查质量，不达标的重新分派；全部完成后向用户总结\n'
    }
    prompt += '在整个过程中，你绝不亲自编写代码或执行技术操作。\n'
  } else {
    switch (agent.planningStrategy) {
      case 'react':
        prompt += '\n\n## 执行策略（ReAct）\n请按照"思考-行动-观察"的模式逐步解决问题：\n'
        prompt += '1. **思考**：分析当前情况，决定下一步行动\n'
        prompt += '2. **行动**：调用合适的工具执行操作\n'
        prompt += '3. **观察**：分析工具返回的结果\n'
        prompt += '4. **循环**：如果任务未完成，回到步骤1继续\n'
        prompt += '只有当所有必要步骤都执行完毕后，才给出最终回答。\n'
        break
      case 'plan-and-execute':
        prompt += '\n\n## 执行策略（Plan-and-Execute）\n请严格按以下方式工作：\n'
        prompt += '1. **规划阶段**：首先调用 `create_plan` 工具，将任务拆解为结构化子任务列表（含依赖关系）\n'
        prompt += '2. **等待确认**：计划创建后状态为 draft（草稿），此时**停止调用其他工具**，等待用户在 Todo 面板确认计划\n'
        prompt += '3. **执行阶段**：用户确认后，使用 `update_task` 将任务标记为 in_progress 再开始执行，完成后标记 completed\n'
        prompt += '4. **并行派发**：对于无依赖的子任务，使用 `workspace_dispatch_parallel` 工具并行分派给团队成员\n'
        prompt += '5. **根据结果调整**：根据每步执行结果调整后续计划，可用 `get_plan` 查看当前进度\n'
        prompt += '6. **最终回答**：所有子任务完成后才给出最终回答\n'
        prompt += '\n⚠️ 重要：创建计划后必须等待用户确认，不要在 draft 状态直接执行任务。\n'
        break
      case 'trial-and-error':
        prompt += '\n\n## 执行策略（Trial-and-Error）\n请大胆尝试：\n'
        prompt += '1. 尝试使用工具解决问题\n'
        prompt += '2. 如果某条路径行不通，分析错误原因\n'
        prompt += '3. 回退并尝试其他方法\n'
        prompt += '4. 持续尝试直到任务完成\n'
        break
    }
  }

  // Phase 4: 拼接 promptSections（复用 Prompt 系统的段落）
  if (agent.promptSections && agent.promptSections.length > 0) {
    const sectionsText = renderPromptSections(agent.promptSections)
    if (sectionsText) {
      prompt += `\n\n## 结构化提示词段落\n${sectionsText}`
    }
  }

  // Phase 4: 注入当前工作流状态的提示词片段（由调用方通过 extraPromptSection 传入）
  if (extraPromptSection) {
    prompt += `\n\n## 当前阶段指引\n${extraPromptSection}`
  }

  return prompt
}

/**
 * Phase 4: 将 PromptSection[] 渲染为文本（复用 Prompt 系统段落格式）
 *
 * 按 order 排序，仅渲染 enabled 的段落，每段以标题分组。
 */
function renderPromptSections(sections: AgentProfile['promptSections']): string {
  if (!sections) return ''
  const enabled = sections.filter((s) => s.enabled).sort((a, b) => a.order - b.order)
  if (enabled.length === 0) return ''
  return enabled.map((s) => {
    const title = s.title || s.type
    return `### ${title}\n${s.content}`
  }).join('\n\n')
}

/**
 * 过滤出 Agent 启用的工具
 *
 * 统一过滤逻辑：enabledToolIds 控制 + 工作区工具注入。
 */
function resolveAgentTools(
  agent: AgentProfile,
  allTools: Tool[],
  workspaceContext?: WorkspaceContext,
): Tool[] {
  let agentTools = allTools.filter(
    (t) => agent.enabledToolIds.includes(t.id) && t.enabled
  )
  if (workspaceContext) {
    const isLeaderAgent = agent.tags?.includes('leader') ?? false
    if (isLeaderAgent) {
      const leaderAllowedToolIds = [
        'workspace:list_files',
        'workspace:dispatch_task',
        'workspace:create_agent'
      ]
      const leaderTools = WORKSPACE_TOOLS.filter(
        (wt) => leaderAllowedToolIds.includes(wt.id) && !agentTools.some((at) => at.id === wt.id)
      )
      agentTools = [...agentTools, ...leaderTools]
    } else {
      const workspaceToolsToAdd = WORKSPACE_TOOLS.filter(
        (wt) => !agentTools.some((at) => at.id === wt.id)
      )
      agentTools = [...agentTools, ...workspaceToolsToAdd]
    }
  }
  return agentTools
}

/**
 * 从 PlannerToolExecutor 的 session context 中读取当前 plan 状态（增强2）
 *
 * 用于工作流状态机的 plan_status 转移条件。
 * 如果没有活跃计划，返回 null。
 */
function getPlanStatusFromBundle(
  bundle: ToolExecutorSessionBundle,
): string | null {
  const resolved = bundle.resolve('create_plan')
    ?? bundle.resolve('update_task')
    ?? bundle.resolve('get_plan')
  if (!resolved) return null
  const ctx = resolved.sessionCtx as Record<string, unknown>
  const plan = ctx?.currentPlan as { status?: string } | null | undefined
  return plan?.status ?? null
}

/**
 * 执行上下文压缩（异步，需要 LLM 调用）
 *
 * 超阈值时按 contextPolicy 压缩历史消息，原地修改 messages 数组。
 */
async function executeContextCompression(
  agent: AgentProfile,
  messages: AgentMessage[],
  resolvedConfig: ResolvedAIConfig,
  signal: AbortSignal,
  runId: string,
): Promise<void> {
  if (!contextManager.needsCompression(messages as CompressibleMessage[], agent.contextPolicy)) {
    return
  }
  try {
    const compressionResult = await contextManager.compress(
      messages as CompressibleMessage[],
      agent.contextPolicy,
      agent.name,
      resolvedConfig,
      signal,
      runId,
      agent.id,
    )
    if (compressionResult.compressed) {
      messages.length = 0
      for (const m of compressionResult.messages) {
        messages.push(m as AgentMessage)
      }
    }
  } catch (e) {
    console.warn('[AgentEngine] 上下文压缩失败:', e)
  }
}

/**
 * 推进工作流状态（增强2：补充 planStatus）
 *
 * 返回更新后的 workflowRuntime（可能未变化）。
 */
function advanceWorkflowState(
  agent: AgentProfile,
  workflowRuntime: WorkflowRuntimeState | null,
  lastToolName: string | undefined,
  fullContent: string,
  bundle: ToolExecutorSessionBundle,
): WorkflowRuntimeState | null {
  if (!workflowRuntime || !agent.workflow) return workflowRuntime

  const planStatus = getPlanStatusFromBundle(bundle)
  const ctx: TransitionContext = {
    toolCalled: lastToolName,
    toolSuccess: undefined,
    assistantContent: fullContent || undefined,
    planStatus,
  }
  const advanced = advanceState(agent.workflow, workflowRuntime, ctx)
  return advanced.transitioned ? advanced.runtime : workflowRuntime
}

/**
 * 从 LLM 输出中解析工具调用（文本格式兼容）
 */
function parseToolCalls(content: string): Array<{ name: string; arguments: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = []

  // 匹配 ```tool_call\n{...}\n``` 格式
  const toolCallRegex = /```tool_call\s*\n([\s\S]*?)\n```/g
  let match
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed.name) {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments || {}
        })
      }
    } catch {
      // 解析失败，跳过
    }
  }

  // 也匹配 JSON 格式的工具调用（兼容性）
  if (toolCalls.length === 0) {
    const jsonRegex = /\{[\s]*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]*\})\s*\}/g
    while ((match = jsonRegex.exec(content)) !== null) {
      try {
        toolCalls.push({
          name: match[1],
          arguments: JSON.parse(match[2])
        })
      } catch {
        // ignore
      }
    }
  }

  return toolCalls
}

/**
 * 将 Agent 内部消息转换为 Message 格式（供 aiService.streamChat 使用）
 */
function toMessages(agentMessages: AgentMessage[]): Message[] {
  return agentMessages.map((m, idx) => {
    const msg: Message = {
      id: `agent-msg-${idx}`,
      conversationId: 'agent-internal',
      role: m.role,
      content: m.content,
      timestamp: Date.now()
    }
    // 携带原生工具调用信息
    if (m.toolCalls && m.toolCalls.length > 0) {
      msg.toolCalls = m.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: 'completed' as const
      }))
    }
    // 携带工具结果信息
    if (m.toolCallId) {
      msg.toolCallId = m.toolCallId
      msg.toolName = m.toolName
    }
    return msg
  })
}

/**
 * Agent 主循环体
 *
 * 包含完整的 ReAct 循环：LLM 调用 → 工具执行 → checkpoint 保存 → 工作流推进。
 * 所有提前退出路径（中止、错误、最终回复）均在此函数内完成回调。
 * 循环正常结束（达到步数上限）时也在此函数内完成回调。
 *
 * @param ctx 循环上下文
 * @param loopLimit 循环上限（Infinity 表示无限制）
 * @param tcIdPrefix 文本工具调用的 ID 前缀（'text-tc-' 或 'resume-text-tc-'）
 */
async function agentLoopBody(
  ctx: {
    agent: AgentProfile
    messages: AgentMessage[]
    agentSessionCtx: AgentSessionContext
    sessionBundle: ToolExecutorSessionBundle
    contextString: string
    resolvedConfig: ResolvedAIConfig
    signal: AbortSignal
    callbacks: AgentEngineCallbacks
    workspaceContext?: WorkspaceContext
    runId: string
    /** P1-2 修复：从 checkpoint 恢复的工作流运行时状态 */
    initialWorkflowRuntime?: WorkflowRuntimeState | null
  },
  loopLimit: number,
  tcIdPrefix: string,
): Promise<void> {
  const {
    agent, messages, agentSessionCtx, sessionBundle,
    contextString, resolvedConfig, signal, callbacks,
    workspaceContext, runId, initialWorkflowRuntime,
  } = ctx
  const steps = agentSessionCtx.steps
  const agentTools = agentSessionCtx.agentTools

  // Phase 4: 工作流状态机运行时（优先从 checkpoint 恢复，否则创建新的）
  let workflowRuntime: WorkflowRuntimeState | null = null
  if (initialWorkflowRuntime) {
    // 从 checkpoint 恢复工作流状态
    workflowRuntime = initialWorkflowRuntime
  } else if (agent.workflow && agent.workflow.initial && agent.workflow.states[agent.workflow.initial]) {
    workflowRuntime = createWorkflowRuntimeState(agent.workflow)
  }

  // 构建系统提示词基础（每轮会根据工作流状态重新拼接，故用 let）
  let systemPrompt = buildAgentSystemPrompt(agent, agentTools, contextString, workspaceContext)

  // Agent 循环
  for (let i = 0; i < loopLimit; i++) {
    // 如果不是第一步，添加延迟避免 API 请求过快（Too many requests）
    if (i > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1500)
        if (signal.aborted) { clearTimeout(timer); reject(new Error('aborted')); return }
        const onAbort = () => { clearTimeout(timer); reject(new Error('aborted')) }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }

    // 检查中止信号
    if (signal.aborted) {
      const stopStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: '用户手动停止',
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(stopStep)
      callbacks.onStep(stopStep)
      callbacks.onStatusChange('stopped')
      callbacks.onDone('')
      return
    }

    // ========== Phase 4: 工作流状态机 + 上下文压缩（每轮开始时应用，使用共享函数） ==========
    // 1) 工作流：按当前状态过滤工具
    const effectiveTools: Tool[] =
      workflowRuntime && agent.workflow
        ? filterToolsByState(agent.workflow, workflowRuntime, agentTools)
        : agentTools

    // 2) 工作流：注入当前状态的 prompt 片段并重建系统提示词
    if (workflowRuntime && agent.workflow) {
      const section = getStatePromptSection(agent.workflow, workflowRuntime)
      systemPrompt = buildAgentSystemPrompt(
        agent,
        effectiveTools,
        contextString,
        workspaceContext,
        section || undefined,
      )
    }

    // 3) 上下文压缩：超出阈值时按 contextPolicy 压缩历史消息（使用共享函数）
    await executeContextCompression(agent, messages, resolvedConfig, signal, runId)

    // 准备工具定义
    const toolDefs = toolService.toToolDefinitions(effectiveTools)

    // 调用 LLM
    let fullContent = ''
    let reasoningContent = ''
    let nativeToolCalls: Array<{ id: string; name: string; arguments: string }> = []
    let streamFinishReason: string | undefined

    try {
      await aiService.streamChat(
        toMessages(messages),
        {
          ...resolvedConfig,
          // 覆盖 Agent 特定配置
          model: agent.modelConfig.modelId || agent.modelConfig.model || resolvedConfig.model,
          temperature: agent.modelConfig.temperature ?? resolvedConfig.temperature,
          maxTokens: agent.modelConfig.maxTokens || resolvedConfig.maxTokens
        },
        systemPrompt,
        toolDefs,
        signal,
        {
          onToken: (token) => {
            fullContent += token
            // 实时转发 token 到 UI，实现流式输出
            callbacks.onToken(token)
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            // 实时转发推理 token 到 UI
            callbacks.onReasoningToken(token)
          },
          onToolCalls: (toolCalls) => {
            // 捕获原生 function calling 返回的工具调用
            nativeToolCalls = toolCalls
          },
          onDone: (finishReason) => {
            streamFinishReason = finishReason
          },
          onError: (error) => {
            throw new Error(error)
          }
        }
      )
    } catch (error) {
      if (signal.aborted) {
        callbacks.onStatusChange('stopped')
        callbacks.onDone('')
        return
      }
      const errorMsg = error instanceof Error ? error.message : '未知错误'

      // 如果是请求频率限制错误，等待后重试
      if (errorMsg.toLowerCase().includes('too many requests') || errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        const retryStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'thinking',
          content: `遇到请求频率限制，等待 5 秒后重试...`,
          stepIndex: agentSessionCtx.stepCounter.value++,
          timestamp: Date.now()
        }
        steps.push(retryStep)
        callbacks.onStep(retryStep)

        await new Promise((resolve) => setTimeout(resolve, 5000))
        // 重试当前轮次（不增加 i）
        i--
        continue
      }

      const errorStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: errorMsg,
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(errorStep)
      callbacks.onStep(errorStep)
      callbacks.onStatusChange('error')
      callbacks.onError(errorMsg)
      return
    }

    // 如果有推理内容，添加思考步骤
    if (reasoningContent) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: reasoningContent,
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // 如果模型返回了文本内容但同时有原生工具调用，将文本作为思考步骤
    if (fullContent && nativeToolCalls.length > 0) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: fullContent,
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // ========== 优先处理原生 function calling ==========
    if (nativeToolCalls.length > 0) {
      // 添加 assistant 消息（含工具调用）
      messages.push({
        role: 'assistant',
        content: fullContent || '',
        toolCalls: nativeToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments
        }))
      })

      // 逐个执行工具调用
      for (const tc of nativeToolCalls) {
        // 记录行动步骤
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.arguments)
        } catch {
          // 空参数
        }

        const actionStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'action',
          content: `调用工具：${tc.name}(${JSON.stringify(args)})`,
          toolCall: { name: tc.name, arguments: args },
          stepIndex: agentSessionCtx.stepCounter.value++,
          timestamp: Date.now()
        }
        steps.push(actionStep)
        callbacks.onStep(actionStep)

        // 执行工具（Phase 1：通过 registry 分发，取代 if-else 链）
        const resolved = sessionBundle.resolve(tc.name)
        let result: ToolExecuteResult
        if (resolved) {
          result = await resolved.executor.execute(tc.name, args, resolved.sessionCtx, agentSessionCtx)
        } else {
          result = { success: false, data: '', error: `未找到工具 "${tc.name}" 的执行器` }
        }

        // 记录观察步骤
        const observationContent = result.success
          ? result.data
          : `错误: ${result.error ?? '执行失败'}`

        const obsStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'observation',
          content: observationContent,
          toolResult: {
            success: result.success,
            data: result.data,
            error: result.error
          },
          stepIndex: agentSessionCtx.stepCounter.value++,
          timestamp: Date.now()
        }
        steps.push(obsStep)
        callbacks.onStep(obsStep)

        // 将工具结果追加到消息列表（使用 tool 角色）
        messages.push({
          role: 'tool',
          content: observationContent,
          toolCallId: tc.id,
          toolName: tc.name
        })
      }

      // Phase 4: 工作流状态推进（使用共享函数，增强2：补充 planStatus）
      if (workflowRuntime && agent.workflow) {
        const lastTool = nativeToolCalls[nativeToolCalls.length - 1]
        workflowRuntime = advanceWorkflowState(agent, workflowRuntime, lastTool?.name, fullContent, sessionBundle)
      }

      // 继续循环，让模型根据工具结果继续推理
      continue
    }

    // ========== 回退到文本格式工具调用解析 ==========
    const toolCalls = parseToolCalls(fullContent)

    if (toolCalls.length === 0) {
      // 没有工具调用 → 这是最终回复
      // 如果 fullContent 为空但有推理内容，使用推理内容作为最终回答
      let finalText = fullContent || reasoningContent || ''

      const finalStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'final_answer',
        content: finalText,
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(finalStep)
      callbacks.onStep(finalStep)
      // 注意：token 已在 LLM 调用过程中实时转发，此处无需再次调用 callbacks.onToken
      // 如果流被中止，报告为 'stopped' 以便 finishReason 设为 'abort'
      if (streamFinishReason === 'abort') {
        callbacks.onStatusChange('stopped')
      } else {
        callbacks.onStatusChange('completed')
      }
      // 注意：中断提示统一由 use-chat.ts 的 onDone 回调根据 finishReason 追加，
      // agent-engine 不在此处追加提示，以保持单一职责和文本一致性。
      callbacks.onDone(finalText)
      return
    }

    // 有文本格式工具调用 → 执行工具
    // 提取思考部分（工具调用之前的内容）
    const thinkingContent = fullContent.split('```tool_call')[0].trim()
    if (thinkingContent && !reasoningContent) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: thinkingContent,
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // 执行每个工具调用
    for (const tc of toolCalls) {
      // 记录行动步骤
      const actionStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'action',
        content: `调用工具：${tc.name}(${JSON.stringify(tc.arguments)})`,
        toolCall: { name: tc.name, arguments: tc.arguments },
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(actionStep)
      callbacks.onStep(actionStep)

      // 执行工具（Phase 1：通过 registry 分发，取代 if-else 链）
      const resolved = sessionBundle.resolve(tc.name)
      let result: ToolExecuteResult
      if (resolved) {
        result = await resolved.executor.execute(tc.name, tc.arguments, resolved.sessionCtx, agentSessionCtx)
      } else {
        result = { success: false, data: '', error: `未找到工具 "${tc.name}" 的执行器` }
      }

      // 记录观察步骤
      const observationContent = result.success
        ? result.data
        : `错误: ${result.error ?? '执行失败'}`

      const obsStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'observation',
        content: observationContent,
        toolResult: {
          success: result.success,
          data: result.data,
          error: result.error
        },
        stepIndex: agentSessionCtx.stepCounter.value++,
        timestamp: Date.now()
      }
      steps.push(obsStep)
      callbacks.onStep(obsStep)

      // 将工具结果追加到消息列表（使用 tool 角色，与原生 function calling 保持一致）
      const tcId = `${tcIdPrefix}${agentSessionCtx.stepCounter.value}`
      messages.push(
        {
          role: 'assistant',
          content: fullContent,
          toolCalls: [{ id: tcId, name: tc.name, arguments: JSON.stringify(tc.arguments) }]
        },
        {
          role: 'tool',
          content: observationContent,
          toolCallId: tcId,
          toolName: tc.name
        }
      )
    }

    // Phase 4: 工作流状态推进（使用共享函数，增强2：补充 planStatus）
    if (workflowRuntime && agent.workflow && toolCalls.length > 0) {
      const lastTool = toolCalls[toolCalls.length - 1]
      workflowRuntime = advanceWorkflowState(agent, workflowRuntime, lastTool?.name, fullContent, sessionBundle)
    }

    // 检查是否达到目标（如果启用了自动停止）
    if (agent.termination.autoStopOnGoal) {
      // 在下一轮 LLM 调用时，模型会判断是否完成
    }
  }

  // 达到最大步数（仅在有步数限制时触发）
  if (agent.termination.maxSteps > 0) {
    const maxStep: AgentStep = {
      id: crypto.randomUUID(),
      type: 'error',
      content: `已达到最大推理步数（${agent.termination.maxSteps}步）`,
      stepIndex: agentSessionCtx.stepCounter.value++,
      timestamp: Date.now()
    }
    steps.push(maxStep)
    callbacks.onStep(maxStep)
  }

  // 尝试生成最终回复
  const lastContent = steps
    .filter((s) => s.type === 'final_answer')
    .pop()?.content ?? ''

  callbacks.onStatusChange('completed')
  callbacks.onDone(lastContent || (agent.termination.maxSteps > 0 ? 'Agent 已达到最大步数限制，未能完成任务。' : 'Agent 执行结束。'))
}

/**
 * Agent Engine 主运行函数
 *
 * 支持两种工具调用方式：
 * 1. OpenAI 原生 function calling（通过 API 的 tool_calls 字段）
 * 2. 文本格式工具调用（通过 ```tool_call 代码块）
 */
export async function runAgent(
  agent: AgentProfile,
  userMessage: string,
  conversationHistory: Message[],
  allTools: Tool[],
  resolvedConfig: ResolvedAIConfig,
  signal: AbortSignal,
  callbacks: AgentEngineCallbacks,
  workspaceContext?: WorkspaceContext,
  conversationId?: string,
  resumeOptions?: ResumeOptions
): Promise<void> {
  const runId = crypto.randomUUID()
  callbacks.onStatusChange('running')

  // Phase 2: 启动 EventBus 运行
  agentEventBus.startRun(runId, agent.id)

  const startTime = Date.now()
  let stepIndex = 0
  // stepCounter 桥接对象：让 AgentSessionContext.stepCounter 与引擎 stepIndex 保持同步
  // Phase 2 清理时将移除 stepIndex，统一使用 stepCounter
  const stepCounter: { value: number } = {
    get value() { return stepIndex },
    set value(v: number) { stepIndex = v },
  }

  // 过滤出 Agent 启用的工具（统一使用 resolveAgentTools，P2 修复）
  const agentTools = resolveAgentTools(agent, allTools, workspaceContext)

  // 获取记忆上下文
  let memoryContext = ''
  if (agent.memoryConfig.longTermEnabled) {
    memoryContext = memoryService.formatMemoriesAsContext(agent.id)
  }

  // RAG: 检索知识库上下文（优先使用 Agent 绑定的知识库集合）
  let knowledgeContext = ''
  try {
    const collectionIds = agent.knowledgeBaseIds && agent.knowledgeBaseIds.length > 0
      ? agent.knowledgeBaseIds
      : undefined
    knowledgeContext = await knowledgeBaseService.searchAndFormatContext(
      userMessage, undefined, undefined, collectionIds
    )
  } catch {
    // 知识库检索失败不影响正常流程
  }

  // 合并记忆和知识库上下文
  const combinedContext = memoryContext + knowledgeContext

  // 构建对话历史（限制轮数）
  const maxHistory = agent.memoryConfig.historyTurns * 2 // 每轮 = user + assistant
  const recentHistory = conversationHistory.slice(-maxHistory)

  // 构建初始消息列表
  const messages: AgentMessage[] = []

  if (resumeOptions?.resume) {
    // resume 模式：从对话历史重建，跳过最后一条未完成的 assistant 消息
    // 排除最后一条 assistant 消息（它就是要继续的那条）
    const historyForResume = recentHistory.filter((msg, idx) => {
      // 跳过最后一条 assistant 消息（未完成的）
      if (idx === recentHistory.length - 1 && msg.role === 'assistant') {
        return false
      }
      return true
    })
    for (const msg of historyForResume) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        if (msg.role === 'assistant' && msg.agentSteps && msg.agentSteps.length > 0) {
          const finalStep = msg.agentSteps.find((s) => s.type === 'final_answer')
          if (finalStep) {
            messages.push({ role: 'assistant', content: finalStep.content })
            continue
          }
        }
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: msg.content,
            toolCalls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments
            }))
          })
          continue
        }
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
      }
      if (msg.role === 'tool' && msg.toolCallId) {
        messages.push({
          role: 'tool',
          content: msg.content,
          toolCallId: msg.toolCallId,
          toolName: msg.toolName
        })
      }
    }
    // resume 模式：从 existingSteps 重建已有的工具调用和结果到 messages 中
    // 这样 LLM 能看到已有的上下文，避免重复执行相同的工具调用
    if (resumeOptions?.existingSteps && resumeOptions.existingSteps.length > 0) {
      const existingSteps = resumeOptions.existingSteps
      for (let i = 0; i < existingSteps.length; i++) {
        const step = existingSteps[i]
        if (step.type === 'thinking' && step.content) {
          // thinking 步骤作为 assistant 消息
          messages.push({ role: 'assistant', content: step.content })
        } else if (step.type === 'action' && step.toolCall) {
          // action 步骤作为带 tool_calls 的 assistant 消息
          messages.push({
            role: 'assistant',
            content: step.content || '',
            toolCalls: [{
              id: step.id,
              name: step.toolCall.name,
              arguments: JSON.stringify(step.toolCall.arguments)
            }]
          })
        } else if (step.type === 'observation' && step.toolResult) {
          // observation 步骤作为 tool 结果消息
          messages.push({
            role: 'tool',
            content: step.toolResult.data || step.toolResult.error || '',
            toolCallId: step.id,
            toolName: existingSteps[i - 1]?.toolCall?.name || 'unknown'
          })
        } else if (step.type === 'human_input') {
          // human_input 步骤：问题作为 assistant 消息，用户回复作为 user 消息
          if (step.humanChoice) {
            messages.push({ role: 'assistant', content: step.humanChoice.question })
          }
          if (step.humanResponse) {
            const responseText = Array.isArray(step.humanResponse)
              ? step.humanResponse.join(', ')
              : step.humanResponse
            messages.push({ role: 'user', content: responseText })
          }
        }
        // final_answer 和 error 步骤不需要重建（final_answer 已在历史消息中处理）
      }
    }
    // resume 模式不追加 user 消息，直接从上次中断处继续
  } else {
    // 正常模式：添加历史消息
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Agent 步骤的最终回答作为 assistant 消息
        if (msg.role === 'assistant' && msg.agentSteps && msg.agentSteps.length > 0) {
          const finalStep = msg.agentSteps.find((s) => s.type === 'final_answer')
          if (finalStep) {
            messages.push({ role: 'assistant', content: finalStep.content })
            continue
          }
        }
        // 如果 assistant 消息有原生工具调用，也携带过去
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: msg.content,
            toolCalls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments
            }))
          })
          continue
        }
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
      }
      // 工具结果消息
      if (msg.role === 'tool' && msg.toolCallId) {
        messages.push({
          role: 'tool',
          content: msg.content,
          toolCallId: msg.toolCallId,
          toolName: msg.toolName
        })
      }
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: userMessage })
  }

  // resume 模式从已有步骤恢复，正常模式从空数组开始
  const steps: AgentStep[] = resumeOptions?.resume
    ? (resumeOptions.existingSteps ? [...resumeOptions.existingSteps] : [])
    : []

  // 创建 Agent 会话上下文和工具执行器 session bundle（Phase 1 新增）
  const agentSessionCtx: AgentSessionContext = {
    agentId: agent.id,
    agentName: agent.name,
    runId,
    conversationId: conversationId ?? '',
    agentTools,
    resolvedConfig,
    signal,
    workspace: workspaceContext,
    callbacks,
    stepCounter,
    steps,
    artifacts: [],
  }
  const sessionBundle = toolExecutorRegistry.createSessionBundle(agentSessionCtx)

  // Phase 4: 在外部创建工作流运行时状态，以便 agentLoopBody 可以访问
  let workflowRuntime: WorkflowRuntimeState | null = null
  if (agent.workflow && agent.workflow.initial && agent.workflow.states[agent.workflow.initial]) {
    workflowRuntime = createWorkflowRuntimeState(agent.workflow)
  }

  // Agent 循环（maxSteps 为 0 表示无限制）— 委托给共享 agentLoopBody
  try {
    const loopLimit = agent.termination.maxSteps === 0 ? Infinity : agent.termination.maxSteps
    await agentLoopBody(
      {
        agent, messages, agentSessionCtx, sessionBundle,
        contextString: combinedContext,
        resolvedConfig, signal, callbacks,
        workspaceContext, runId,
        initialWorkflowRuntime: workflowRuntime,  // P1-2: 传入初始工作流状态
      },
      loopLimit,
      'text-tc-',
    )
  } catch (error) {
    if (signal.aborted) {
      callbacks.onStatusChange('stopped')
      callbacks.onDone('')
      return
    }
    throw error
  } finally {
    sessionBundle.destroyAll()
  }
}

/**
 * 创建默认的 Agent 运行上下文
 */
export function createDefaultRunContext(agentId: string): AgentRunContext {
  return {
    agentId,
    status: 'idle',
    steps: [],
    currentStep: 0
  }
}

/**
 * 为 Agent 配置添加 remember 和 recall 内置工具
 */
export function getAgentBuiltinTools(): Array<{ id: string; name: string; description: string; parameters: Record<string, unknown> }> {
  return [
    {
      id: 'agent-builtin:remember',
      name: 'remember',
      description: '记住一条关键事实，用于长期记忆。在对话中发现重要信息时调用。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '记忆的键名，如"用户姓名"' },
          value: { type: 'string', description: '记忆的值，如"张三"' }
        },
        required: ['key', 'value']
      }
    },
    {
      id: 'agent-builtin:recall',
      name: 'recall',
      description: '回忆之前记住的关键事实。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '要回忆的键名' }
        },
        required: ['key']
      }
    }
  ]
}
