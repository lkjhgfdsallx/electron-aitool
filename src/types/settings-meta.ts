// ==================== 设置项元数据类型 ====================

import type { SettingsSection } from '../components/settings/SettingsNavRail'

/**
 * 单个设置项的元数据描述
 * 用于搜索索引、自动生成 UI 提示、以及未来设置项管理
 */
export interface SettingItemMeta {
  /** 唯一标识，格式: section.key，如 "ui-prefs.theme" */
  id: string
  /** 所属设置板块 */
  section: SettingsSection
  /** 设置项的 key（对应 store 中的字段名或嵌套路径） */
  key: string
  /** 显示名称 */
  label: string
  /** 描述文字 */
  description: string
  /** 搜索关键词（同义词、英文别名等） */
  keywords?: string[]
  /** 修改后是否需要重启应用 */
  requiresRestart?: boolean
  /** 修改后是否需要重新加载页面 */
  requiresReload?: boolean
  /** 设置项类型（影响 UI 渲染方式） */
  controlType: 'toggle' | 'slider' | 'select' | 'input' | 'color' | 'custom'
  /** 标签/分类，用于搜索结果分组 */
  tags?: string[]
  /** 嵌套路径标识，如 "retrievalConfig.hybridWeight" 用于标识 store 中的深层字段 */
  path?: string
}

/**
 * 设置项注册表（扁平数组，供搜索消费）
 */
export type SettingsRegistry = SettingItemMeta[]

/**
 * 按 section 分组的设置项注册表
 */
export type GroupedSettingsRegistry = Record<SettingsSection, SettingItemMeta[]>
