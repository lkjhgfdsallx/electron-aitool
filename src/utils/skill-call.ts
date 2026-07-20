export interface SkillCallDetails {
  skillName: string
  description?: string
}

/** 判断工具调用是否为加载 Skill 的专属调用。 */
export function isUseSkillCall(name?: string): boolean {
  return name === 'use_skill'
}

/**
 * 从 use_skill 的原始参数与结果中提取用于对话展示的内容。
 * 参数和结果可能来自原生工具调用或 Agent 执行步骤，因此允许字符串和对象两种输入。
 */
export function parseSkillCallDetails(
  rawArguments: string | Record<string, unknown> | undefined,
  rawResult?: string
): SkillCallDetails {
  const argumentsValue = parseUnknownJson(rawArguments)
  const resultValue = parseUnknownJson(rawResult)

  const skillName = readString(resultValue, 'name')
    || readString(argumentsValue, 'skill_name')
    || 'unknown'

  return {
    skillName,
    description: readString(resultValue, 'description')
  }
}

/** 将原始 Skill 调用参数格式化为稳定、易读的文本。 */
export function formatSkillArguments(rawArguments: string | Record<string, unknown> | undefined): string {
  if (typeof rawArguments === 'string') {
    const parsed = parseUnknownJson(rawArguments)
    return parsed ? JSON.stringify(parsed, null, 2) : rawArguments
  }

  return JSON.stringify(rawArguments ?? {}, null, 2)
}

function parseUnknownJson(value: string | Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === 'object') return value

  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function readString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value?.[key]
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined
}
