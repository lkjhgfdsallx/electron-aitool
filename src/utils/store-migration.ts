// ==================== Store 迁移工具函数 ====================
// 为 Zustand persist store 提供统一的版本迁移基础设施

/**
 * 安全地合并默认值，确保新增字段不会丢失
 * 递归深度为 1 层：顶层字段用默认值填充，嵌套对象做浅合并
 */
export function mergeDefaults<T extends Record<string, unknown>>(
  persisted: Partial<T>,
  defaults: T
): T {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    if (key in persisted) {
      const defaultVal = defaults[key]
      const persistedVal = persisted[key]
      // 如果两者都是普通对象（非数组），做浅合并
      if (
        defaultVal &&
        persistedVal &&
        typeof defaultVal === 'object' &&
        !Array.isArray(defaultVal) &&
        typeof persistedVal === 'object' &&
        !Array.isArray(persistedVal)
      ) {
        ;(result as Record<string, unknown>)[key as string] = {
          ...(defaultVal as Record<string, unknown>),
          ...(persistedVal as Record<string, unknown>),
        }
      } else {
        ;(result as Record<string, unknown>)[key as string] = persistedVal
      }
    }
  }
  return result
}

/**
 * 版本迁移链：按版本号升序执行所有迁移函数
 *
 * @param state 当前持久化状态
 * @param fromVersion 持久化数据的版本号
 * @param migrations 迁移函数映射，key 为目标版本号
 * @returns 迁移后的状态
 *
 * @example
 * ```ts
 * migrate(state, 0, {
 *   1: (s) => ({ ...s, newField: 'default' }),
 *   2: (s) => ({ ...s, renamedField: s.oldField }),
 * })
 * ```
 */
export function runMigrations<T>(
  state: T,
  fromVersion: number,
  migrations: Record<number, (state: T) => T>
): T {
  let result = state
  const versions = Object.keys(migrations).map(Number).sort((a, b) => a - b)
  for (const targetVersion of versions) {
    if (fromVersion < targetVersion) {
      result = migrations[targetVersion](result)
    }
  }
  return result
}

/**
 * 确保数组字段存在且为数组类型
 * 用于迁移旧数据中可能缺失的数组字段
 */
export function ensureArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback
}

/**
 * 确保对象字段存在
 * 用于迁移旧数据中可能缺失的对象字段
 */
export function ensureObject<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T
): T {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...fallback, ...(value as T) }
    : { ...fallback }
}

/**
 * 存储版本号常量
 * 每次数据结构变更时递增对应 store 的版本号
 */
export const STORE_VERSIONS = {
  /** settings-store (ui-preferences) */
  SETTINGS: 3, // v3: 新增 browserExecutablePath
  /** global-config-store (global-config) */
  GLOBAL_CONFIG: 1,
  /** ai-provider-store (ai-providers) */
  AI_PROVIDERS: 1,
  /** agent-store (agents) - v5: 任务拆解执行师补齐 create_plan 规划工具 */
  AGENTS: 5,
  /** conversation-store (conversations) - 已有 v2 迁移 */
  CONVERSATIONS: 2,
  /** custom-tool-store (custom-tools) */
  CUSTOM_TOOLS: 1,
  /** tool-stats-store (tool-stats) */
  TOOL_STATS: 1,
  /** workspace-store (workspaces) - v4: 新增默认开启的 postWriteLint（写后自动检查） */
  WORKSPACE: 4,
  /** skill-store (skills) */
  SKILLS: 1,
} as const
