/**
 * 备份选项表单组件
 *
 * 提供模块选择和敏感数据剥离选项，供本地备份和 WebDAV 上传共用。
 */

import { useState, useMemo } from 'react'
import { useAppTranslation } from '@/i18n/hooks'
import type { BackupDataModule, SensitiveStripOptions } from '../../types/webdav'
import { DEFAULT_BACKUP_MODULES } from '../../types/webdav'

interface BackupOptionsFormProps {
  /** 默认选中的模块 */
  defaultModules?: BackupDataModule[]
  /** 默认敏感剥离选项 */
  defaultSensitive?: SensitiveStripOptions
  /** 表单提交回调 */
  onSubmit: (modules: BackupDataModule[], sensitive: SensitiveStripOptions) => void
  /** 是否禁用 */
  disabled?: boolean
}

/** 模块标签映射 */
const MODULE_LABELS: Record<BackupDataModule, string> = {
  localStorage: '设置与配置',
  conversations: '对话消息',
  knowledgeBase: '知识库',
  reports: '分析报告',
  skills: 'Skills'
}

/** 模块图标映射 */
const MODULE_ICONS: Record<BackupDataModule, string> = {
  localStorage: '⚙️',
  conversations: '💬',
  knowledgeBase: '📚',
  reports: '📊',
  skills: '🧩'
}

export function BackupOptionsForm({
  defaultModules = DEFAULT_BACKUP_MODULES,
  defaultSensitive = {},
  onSubmit,
  disabled = false
}: BackupOptionsFormProps) {
  const { t } = useAppTranslation()
  const [selectedModules, setSelectedModules] = useState<BackupDataModule[]>([...defaultModules])
  const [sensitive, setSensitive] = useState<SensitiveStripOptions>({ ...defaultSensitive })
  const [expanded, setExpanded] = useState(false)

  const moduleLabels = useMemo<Record<BackupDataModule, string>>(() => ({
    localStorage: t('settings.settingsAndConfig'),
    conversations: t('settings.conversationMessages'),
    knowledgeBase: t('settings.knowledgeBase'),
    reports: t('settings.analysisReports'),
    skills: 'Skills'
  }), [t])

  /** 切换模块选择 */
  const toggleModule = (moduleId: BackupDataModule) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    )
  }

  /** 全选所有模块 */
  const selectAll = () => {
    setSelectedModules([...DEFAULT_BACKUP_MODULES])
  }

  /** 清空选择 */
  const clearAll = () => {
    setSelectedModules([])
  }

  /** 切换敏感剥离选项 */
  const toggleSensitive = (key: keyof SensitiveStripOptions) => {
    setSensitive((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  /** 提交表单 */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedModules.length === 0) {
      alert(t('settings.pleaseSelectAtLeastOneModule'))
      return
    }
    onSubmit(selectedModules, sensitive)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 模块选择 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">{t('settings.backupModules')}</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={disabled}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {t('settings.selectAllModules')}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs text-muted hover:underline disabled:opacity-50"
            >
              {t('settings.clearSelection')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {DEFAULT_BACKUP_MODULES.map((moduleId) => (
            <label
              key={moduleId}
              className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${
                selectedModules.includes(moduleId)
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-muted-foreground'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedModules.includes(moduleId)}
                onChange={() => toggleModule(moduleId)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="text-sm">{MODULE_ICONS[moduleId]}</span>
              <span className="text-sm">{moduleLabels[moduleId]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 敏感数据剥离选项（可折叠） */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {t('settings.sensitiveDataStripping')}
        </button>

        {expanded && (
          <div className="mt-2 space-y-2 p-3 bg-muted/30 rounded border border-dashed">
            <p className="text-xs text-muted-foreground">
              {t('settings.sensitiveDataStrippingHint')}
            </p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!sensitive.stripApiKeys}
                onChange={() => toggleSensitive('stripApiKeys')}
                disabled={disabled}
                className="rounded border-border"
              />
              <span className="text-sm">
                {t('settings.removeApiKeys')}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!sensitive.stripMcpCredentials}
                onChange={() => toggleSensitive('stripMcpCredentials')}
                disabled={disabled}
                className="rounded border-border"
              />
              <span className="text-sm">
                {t('settings.removeMcpCredentials')}
              </span>
            </label>
          </div>
        )}
      </div>

      {/* 提交按钮 */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled || selectedModules.length === 0}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('settings.confirmSelection')}
        </button>
      </div>
    </form>
  )
}
