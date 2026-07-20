import type { ToolExecuteResult } from '../../../types'
import { useSkillStore } from '../../../stores/skill-store'
import { findAccessibleSkillByName, getAccessibleSkills } from '../../skill-access-policy'
import type { AgentSessionContext, ToolExecutor, ToolSessionContext } from '../tool-executor'

/**
 * Skills 专用执行器。
 *
 * 访问规则：
 * - 只要 Skill 已启用，list_skills / use_skill 即可使用
 * - 不再依赖 Agent 绑定或工作区归属
 * - 工具本身是否可用由 Agent.enabledToolIds 控制
 */
export class SkillToolExecutor implements ToolExecutor {
  readonly toolNames = ['list_skills', 'use_skill']

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    _sessionCtx: ToolSessionContext,
    _agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    try {
      await useSkillStore.getState().ensureSkillsLoaded()
      const skills = useSkillStore.getState().skills

      if (toolName === 'list_skills') {
        const allowedSkills = getAccessibleSkills(skills)
        return {
          success: true,
          data: JSON.stringify({
            skills_count: allowedSkills.length,
            skills: allowedSkills.map((skill) => ({
              name: skill.name,
              description: skill.description,
              location: skill.location,
            })),
          }),
        }
      }

      const skillName = String(args.skill_name ?? '')
      if (!skillName) {
        return { success: false, data: '', error: 'use_skill 需要 skill_name 参数' }
      }

      const lookup = findAccessibleSkillByName(skills, skillName)
      if (lookup.status === 'not_found') {
        return {
          success: false,
          data: '',
          error: '请求的技能不存在或已被禁用',
        }
      }
      if (lookup.status === 'ambiguous') {
        return {
          success: false,
          data: '',
          error: `存在多个同名技能 "${skillName}"，已拒绝加载以避免使用错误内容`,
        }
      }

      const skill = lookup.skill
      return {
        success: true,
        data: JSON.stringify({
          name: skill.name,
          description: skill.description,
          content: skill.content,
          resource_files: skill.resourceFiles,
        }),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载技能失败'
      return { success: false, data: '', error: message }
    }
  }
}
