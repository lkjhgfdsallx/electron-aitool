import type { Skill } from '../types'

/**
 * Skills 访问策略。
 *
 * 简化模型：
 * - 只要 Skill 处于启用状态即可被 list_skills / use_skill 使用
 * - 不再要求 Agent 单独绑定 Skill，也不再按工作区过滤
 * - 是否真正可调用取决于 Agent 是否启用了 list_skills / use_skill 工具
 */
export function isSkillAccessible(skill: Skill): boolean {
  return skill.enabled
}

/**
 * 返回当前可发现与可加载的 Skills。
 */
export function getAccessibleSkills(skills: readonly Skill[]): Skill[] {
  return skills.filter((skill) => isSkillAccessible(skill))
}

export type SkillLookupResult =
  | { status: 'found'; skill: Skill }
  | { status: 'not_found' }
  | { status: 'ambiguous' }

/**
 * 在可访问 Skills 中按名称定位；同名条目必须显式拒绝，避免意外加载错误内容。
 */
export function findAccessibleSkillByName(
  skills: readonly Skill[],
  name: string,
): SkillLookupResult {
  const matches = getAccessibleSkills(skills).filter((skill) => skill.name === name)
  if (matches.length === 0) return { status: 'not_found' }
  if (matches.length > 1) return { status: 'ambiguous' }
  return { status: 'found', skill: matches[0] }
}
