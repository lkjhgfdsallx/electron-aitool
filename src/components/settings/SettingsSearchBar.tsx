// ==================== 设置搜索栏 ====================
// 在 SettingsPage 顶部提供全局搜索，支持模糊匹配、键盘导航、高亮定位

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, ArrowRight, RotateCcw, AlertCircle } from 'lucide-react'
import { searchSettings, getSettingMeta } from '../../constants/settings-registry'
import type { SettingItemMeta } from '../../types/settings-meta'
import type { SettingsSection } from './SettingsNavRail'
import { SETTINGS_SECTIONS } from './SettingsNavRail'
import { useAppTranslation } from '@/i18n/hooks'

interface SettingsSearchBarProps {
  /** 当搜索结果被点击时的回调：切换到对应 section */
  onNavigate: (section: SettingsSection, settingId: string) => void
}

// section key → 颜色映射
const SECTION_COLOR_MAP: Record<string, string> = Object.fromEntries(
  SETTINGS_SECTIONS.map((s) => [s.key, s.color])
)

export function SettingsSearchBar({ onNavigate }: SettingsSearchBarProps) {
  const { t } = useAppTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SettingItemMeta[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 搜索逻辑
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([])
      setIsOpen(false)
      return
    }
    const matched = searchSettings(query)
    setResults(matched)
    setIsOpen(matched.length > 0)
    setActiveIndex(-1)
  }, [query])

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ctrl+F 聚焦搜索框
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // 仅在设置页面内拦截
        const settingsPage = document.querySelector('[data-settings-page]')
        if (settingsPage) {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((prev) => Math.max(prev - 1, -1))
          break
        case 'Enter':
          e.preventDefault()
          if (activeIndex >= 0 && activeIndex < results.length) {
            handleSelect(results[activeIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setQuery('')
          inputRef.current?.blur()
          break
      }
    },
    [isOpen, results, activeIndex]
  )

  // 选择搜索结果
  const handleSelect = useCallback(
    (item: SettingItemMeta) => {
      setIsOpen(false)
      setQuery('')
      onNavigate(item.section, item.id)

      // 滚动到目标设置项并高亮
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.querySelector(`[data-setting-id="${item.id}"]`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('setting-highlight')
            setTimeout(() => el.classList.remove('setting-highlight'), 2000)
          }
        }, 100) // 等待 section 切换渲染完成
      })
    },
    [onNavigate]
  )

  // 清除搜索
  const handleClear = useCallback(() => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }, [])

  return (
    <div ref={containerRef} className="relative">
      {/* 搜索输入框 */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder={t('settings.searchSettings')}
          aria-label={t('settings.searchSettings')}
          className="w-full pl-9 pr-8 py-2.5 text-sm bg-surface-100 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/60 rounded-xl text-surface-700 dark:text-surface-300 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
        />
        {query && (
          <button
            onClick={handleClear}
            aria-label={t('common.clear')}
            title={t('common.clear')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 搜索结果下拉面板 */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700/60 rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto"
        >
          {/* 结果计数 */}
          <div className="px-3 py-2 text-xs text-muted border-b border-surface-100 dark:border-surface-700/40 bg-surface-50 dark:bg-surface-800/80">
            {t('settings.searchResultCount', { count: results.length })}
          </div>

          {/* 结果列表 */}
          {results.map((item, index) => {
            const section = SETTINGS_SECTIONS.find((candidate) => candidate.key === item.section)
            const sectionLabel = section ? t(section.labelKey) : item.section
            const sectionColor = SECTION_COLOR_MAP[item.section] || 'text-surface-500'
            const isActive = index === activeIndex

            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`
                  w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors
                  ${isActive
                    ? 'bg-accent-50 dark:bg-accent-900/20'
                    : 'hover:bg-surface-50 dark:hover:bg-surface-700/30'
                  }
                `}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-surface-700 dark:text-surface-300 truncate">
                      {item.label}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md bg-surface-100 dark:bg-surface-700/60 ${sectionColor} flex-shrink-0`}>
                      {sectionLabel}
                    </span>
                    {item.requiresRestart && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center gap-0.5 flex-shrink-0">
                        <RotateCcw size={9} /> {t('settings.restartRequired')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5 line-clamp-1">
                    {item.description}
                  </p>
                </div>
                <ArrowRight
                  size={14}
                  className={`mt-1 flex-shrink-0 transition-colors ${
                    isActive ? 'text-accent-500' : 'text-surface-300 dark:text-surface-600'
                  }`}
                />
              </button>
            )
          })}

          {/* 快捷键提示 */}
          <div className="px-3 py-2 text-[10px] text-muted border-t border-surface-100 dark:border-surface-700/40 bg-surface-50 dark:bg-surface-800/80 flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded text-[10px]">↑↓</kbd> {t('common.navigate')}</span>
            <span><kbd className="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded text-[10px]">Enter</kbd> {t('common.select')}</span>
            <span><kbd className="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded text-[10px]">Esc</kbd> {t('common.close')}</span>
          </div>
        </div>
      )}

      {/* 无结果提示 */}
      {isOpen && query.trim().length > 0 && results.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700/60 rounded-xl shadow-lg p-4 text-center">
          <AlertCircle size={20} className="mx-auto text-surface-400 mb-2" />
          <p className="text-sm text-muted">{t('settings.noMatchingSettings')}</p>
          <p className="text-xs text-surface-400 mt-1">{t('settings.tryOtherKeywords')}</p>
        </div>
      )}
    </div>
  )
}
