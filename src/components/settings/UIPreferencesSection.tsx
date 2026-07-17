import { useState, useEffect, useMemo } from 'react'
import {
  Palette, Type, Code2, Layout, Keyboard, Bell, PanelLeft,
  Monitor, Globe
} from 'lucide-react'
import { languages } from '@/i18n/config'
import { useAppTranslation } from '@/i18n/hooks'
import hljs from 'highlight.js'
import { useSettingsStore, applyCSSVariables } from '../../stores/settings-store'
import type { CodeHighlightTheme, MessageAlignment } from '../../types'
import { isShortcutBindingSupported } from '../../types'
import { SettingsToggle, SettingsSlider, SettingsSelect, SettingsHeader, SettingsSectionHeader, SettingsCard } from './ui'

/** 动态加载 highlight.js 主题 CSS（与 MarkdownRenderer 保持一致） */
const HLJS_THEME_MAP: Record<CodeHighlightTheme, () => Promise<unknown>> = {
  'github-dark': () => import('highlight.js/styles/github-dark.css'),
  'github': () => import('highlight.js/styles/github.css'),
  'vs2015': () => import('highlight.js/styles/vs2015.css'),
  'atom-one-dark': () => import('highlight.js/styles/atom-one-dark.css'),
  'atom-one-light': () => import('highlight.js/styles/atom-one-light.css'),
  'monokai-sublime': () => import('highlight.js/styles/monokai-sublime.css'),
  'nord': () => import('highlight.js/styles/nord.css'),
  'tokyo-night-dark': () => import('highlight.js/styles/tokyo-night-dark.css'),
  'night-owl': () => import('highlight.js/styles/night-owl.css'),
}

const PREVIEW_CODE = `function greet(name: string) {
  // 打招呼
  const msg = \`Hello, \${name}!\`
  console.log(msg)
  return msg
}`


// ---- 常量 ----

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 24
const CODE_FONT_SIZE_MIN = 11
const CODE_FONT_SIZE_MAX = 20
const SIDEBAR_WIDTH_MIN = 200
const SIDEBAR_WIDTH_MAX = 480

// Font families (values are CSS font stacks, labels are translated dynamically)
const FONT_FAMILY_VALUES = [
  { value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", i18nKey: 'settings.fontSystemDefault' },
  { value: "'Source Han Sans SC', 'Noto Sans SC', sans-serif", i18nKey: 'settings.fontSourceHanSans' },
  { value: "'PingFang SC', 'Hiragino Sans GB', sans-serif", i18nKey: 'settings.fontPingFang' },
  { value: "'Microsoft YaHei', sans-serif", i18nKey: 'settings.fontMicrosoftYaHei' },
  { value: "Georgia, 'Times New Roman', serif", i18nKey: 'settings.fontGeorgia' },
]

const CODE_FONT_FAMILY_VALUES = [
  { value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace", i18nKey: 'settings.codeFontJetBrains' },
  { value: "'Fira Code', 'Cascadia Code', Consolas, monospace", i18nKey: 'settings.codeFontFiraCode' },
  { value: "'Cascadia Code', Consolas, monospace", i18nKey: 'settings.codeFontCascadia' },
  { value: "'Source Code Pro', Consolas, monospace", i18nKey: 'settings.codeFontSourceCodePro' },
  { value: "Consolas, 'Courier New', monospace", i18nKey: 'settings.codeFontConsolas' },
]

const CODE_HIGHLIGHT_THEMES: { label: string; value: CodeHighlightTheme }[] = [
  { label: 'GitHub Dark', value: 'github-dark' },
  { label: 'GitHub Light', value: 'github' },
  { label: 'VS 2015', value: 'vs2015' },
  { label: 'Atom One Dark', value: 'atom-one-dark' },
  { label: 'Atom One Light', value: 'atom-one-light' },
  { label: 'Monokai Sublime', value: 'monokai-sublime' },
  { label: 'Nord', value: 'nord' },
  { label: 'Tokyo Night', value: 'tokyo-night-dark' },
  { label: 'Night Owl', value: 'night-owl' },
]

// ---- 语言选择组件 ----

function LanguageSelector() {
  const { t, currentLang, changeLanguage } = useAppTranslation()
  const [isSelecting, setIsSelecting] = useState(false)

  const handleLanguageChange = async (lang: string) => {
    if (lang === currentLang) return
    setIsSelecting(true)
    await changeLanguage(lang)
    setIsSelecting(false)
  }

  const currentLabel = languages.find(l => l.code === currentLang)?.label || 'EN'

  return (
    <div className="py-3">
      <label className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2 block">
        {t('language.switchLanguage')}
      </label>
      <p className="text-xs text-muted mb-3">{t('settings.languageDescription')}</p>
      <div className="flex gap-2">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            disabled={isSelecting}
            className={`flex-1 px-3 py-2 rounded-lg text-sm text-left transition-all border ${
              currentLang === lang.code
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 shadow-sm'
                : 'border-surface-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-blue-700 text-surface-600 dark:text-surface-400'
            }`}
          >
            <div className="font-medium">{lang.label}</div>
            <div className="text-xs opacity-70">{lang.name}</div>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Globe className="w-3 h-3" />
        <span>{t('settings.currentLanguage', { language: currentLabel })}</span>
      </div>
    </div>
  )
}

// ---- 主组件 ----

export function UIPreferencesSection() {
  const settings = useSettingsStore()
  const { t } = useAppTranslation()

  // 动态加载代码高亮主题 CSS
  useEffect(() => {
    HLJS_THEME_MAP[settings.codeHighlightTheme]?.()
  }, [settings.codeHighlightTheme])

  // 用 hljs 实际高亮预览代码，主题切换后自动重新高亮
  const highlightedPreview = useMemo(() => {
    try {
      return hljs.highlight(PREVIEW_CODE, { language: 'typescript' }).value
    } catch {
      return PREVIEW_CODE
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.codeHighlightTheme])

  // 实时应用字体/字号到 CSS 变量（设置变更时立即生效）
  useEffect(() => {
    applyCSSVariables(settings)
  }, [settings.fontFamily, settings.codeFontFamily, settings.fontSize, settings.codeFontSize, settings.sidebarWidth])

  // Dynamic font families with translated labels
  const fontFamilies = useMemo(() => FONT_FAMILY_VALUES.map(f => ({ label: t(f.i18nKey), value: f.value })), [t])
  const codeFontFamilies = useMemo(() => CODE_FONT_FAMILY_VALUES.map(f => ({ label: t(f.i18nKey), value: f.value })), [t])

  // Dynamic message alignments with translated labels
  const messageAlignments = useMemo(() => [
    { label: t('settings.alignLeftRight'), value: 'left-right' as MessageAlignment, desc: t('settings.alignLeftRightDesc') },
    { label: t('settings.alignAllLeft'), value: 'all-left' as MessageAlignment, desc: t('settings.alignAllLeftDesc') },
    { label: t('settings.alignAllRight'), value: 'all-right' as MessageAlignment, desc: t('settings.alignAllRightDesc') },
    { label: t('settings.alignFullWidth'), value: 'full-width' as MessageAlignment, desc: t('settings.alignFullWidthDesc') },
  ], [t])

  // Dynamic notification sounds with translated labels
  const notificationSounds = useMemo(() => [
    { label: t('settings.soundDefault'), value: 'default' },
    { label: t('settings.soundChime'), value: 'chime' },
    { label: t('settings.soundSoft'), value: 'soft' },
    { label: t('settings.soundNone'), value: 'none' },
  ], [t])

  const toggleItems = useMemo(() => [
    {
      label: t('settings.showTokenUsage'),
      description: t('settings.showTokenUsageDesc'),
      checked: settings.showTokenUsage,
      onChange: () => settings.toggleTokenUsage()
    },
    {
      label: t('settings.showTimestamp'),
      description: t('settings.showTimestampDesc'),
      checked: settings.showTimestamp,
      onChange: () => settings.toggleTimestamp()
    },
    {
      label: t('settings.enterToSend'),
      description: t('settings.enterToSendDesc'),
      checked: settings.sendWithEnter,
      onChange: () => settings.setSendWithEnter(!settings.sendWithEnter)
    },
    {
      label: t('settings.webSearchEnabled'),
      description: t('settings.webSearchEnabledDesc'),
      checked: settings.webSearchEnabled,
      onChange: () => settings.toggleWebSearch()
    }
  ], [t, settings])

  return (
    <div className="space-y-8">
      <SettingsHeader
        icon={Palette}
        title={t('settings.uiPreferences')}
        description={t('settings.uiPreferencesDescription')}
      />

      {/* ---- 1. 字体与排版 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Type} title={t('settings.fontAndTypography')} description={t('settings.fontAndTypographyDesc')} />

        <SettingsSelect
          label={t('settings.messageFont')}
          description={t('settings.messageFontDesc')}
          value={settings.fontFamily}
          options={fontFamilies}
          onChange={(v) => settings.setFontFamily(v)}
          layout="horizontal"
          className="py-3"
        />

        <SettingsSlider
          label={t('settings.messageFontSize')}
          description={t('settings.messageFontSizeDesc')}
          value={settings.fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          unit="px"
          onChange={(v) => settings.setFontSize(v)}
          className="py-3"
        />

        <SettingsSelect
          label={t('settings.codeFont')}
          description={t('settings.codeFontDesc')}
          value={settings.codeFontFamily}
          options={codeFontFamilies}
          onChange={(v) => settings.setCodeFontFamily(v)}
          layout="horizontal"
          className="py-3"
        />

        <SettingsSlider
          label={t('settings.codeFontSize')}
          description={t('settings.codeFontSizeDesc')}
          value={settings.codeFontSize}
          min={CODE_FONT_SIZE_MIN}
          max={CODE_FONT_SIZE_MAX}
          step={1}
          unit="px"
          onChange={(v) => settings.setCodeFontSize(v)}
          className="py-3"
        />
      </SettingsCard>

      {/* ---- 2. 代码高亮主题 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Code2} title={t('settings.codeHighlight')} description={t('settings.codeHighlightSectionDesc')} />

        <SettingsSelect
          label={t('settings.codeHighlightTheme')}
          description={t('settings.codeHighlightDesc')}
          value={settings.codeHighlightTheme}
          options={CODE_HIGHLIGHT_THEMES}
          onChange={(v) => settings.setCodeHighlightTheme(v)}
          layout="horizontal"
          className="py-3"
        />

        {/* 主题预览 */}
        <div className="py-3">
          <p className="text-xs text-muted mb-2">{t('settings.preview')}：</p>
          <pre className="rounded-lg p-3 text-xs overflow-x-auto bg-surface-800 text-gray-200">
            <code
              className="hljs"
              dangerouslySetInnerHTML={{ __html: highlightedPreview }}
            />
          </pre>
        </div>
      </SettingsCard>

      {/* ---- 3. 消息布局 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Layout} title={t('settings.messageLayout')} description={t('settings.messageLayoutDesc')} />

        <div className="py-3">
          <label className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2 block">
            {t('settings.messageAlignment')}
          </label>
          <p className="text-xs text-muted mb-3">{t('settings.messageAlignmentDesc')}</p>
          <div className="grid grid-cols-2 gap-2">
            {messageAlignments.map((opt) => (
              <button
                key={opt.value}
                onClick={() => settings.setMessageAlignment(opt.value)}
                className={`px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                  settings.messageAlignment === opt.value
                    ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-300'
                    : 'border-surface-200 dark:border-surface-700 hover:border-accent-300 dark:hover:border-accent-700 text-surface-600 dark:text-surface-400'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="block text-[10px] mt-0.5 opacity-70">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <SettingsToggle
          label={t('settings.showAvatar')}
          description={t('settings.showAvatarDesc')}
          checked={settings.showAvatar}
          onChange={() => settings.toggleAvatar()}
          className="py-3"
        />
      </SettingsCard>

      {/* ---- 4. 侧边栏行为 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={PanelLeft} title={t('settings.sidebar')} description={t('settings.sidebarDesc')} />

        <SettingsSlider
          label={t('settings.sidebarWidth')}
          description={t('settings.sidebarWidthDesc')}
          value={settings.sidebarWidth}
          min={SIDEBAR_WIDTH_MIN}
          max={SIDEBAR_WIDTH_MAX}
          step={10}
          unit="px"
          onChange={(v) => settings.setSidebarWidth(v)}
          className="py-3"
        />
      </SettingsCard>

      {/* ---- 5. 通知设置 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Bell} title={t('settings.notificationSettings')} description={t('settings.notificationSettingsDesc')} />

        <SettingsToggle
          label={t('settings.systemNotification')}
          description={t('settings.systemNotificationDesc')}
          checked={settings.enableNotification}
          onChange={() => settings.setEnableNotification(!settings.enableNotification)}
          className="py-3"
        />

        <SettingsToggle
          label={t('settings.soundEnabled')}
          description={t('settings.soundEnabledDesc')}
          checked={settings.enableSound}
          onChange={() => settings.setEnableSound(!settings.enableSound)}
          className="py-3"
        />

        {settings.enableSound && (
          <SettingsSelect
            label={t('settings.soundStyle')}
            description={t('settings.soundStyleDesc')}
            value={settings.notificationSound}
            options={notificationSounds}
            onChange={(v) => settings.setNotificationSound(v)}
            layout="horizontal"
            className="py-3"
          />
        )}
      </SettingsCard>

      {/* ---- 6. 快捷键自定义 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Keyboard} title={t('settings.shortcutSettings')} description={t('settings.shortcutSettingsDesc')} />

        <ShortcutRow
          label={t('settings.shortcutNewConversation')}
          binding={settings.shortcuts.newConversation}
          onChange={(b) => settings.setShortcut('newConversation', b)}
          t={t}
        />
        <ShortcutRow
          label={t('settings.shortcutToggleSidebar')}
          binding={settings.shortcuts.toggleSidebar}
          onChange={(b) => settings.setShortcut('toggleSidebar', b)}
          t={t}
        />
        <ShortcutRow
          label={t('settings.shortcutOpenSettings')}
          binding={settings.shortcuts.openSettings}
          onChange={(b) => settings.setShortcut('openSettings', b)}
          t={t}
        />
        <ShortcutRow
          label={t('settings.shortcutFocusInput')}
          binding={settings.shortcuts.focusInput}
          onChange={(b) => settings.setShortcut('focusInput', b)}
          t={t}
        />
        <ShortcutRow
          label={t('settings.shortcutNextAgent')}
          binding={settings.shortcuts.switchNextAgent}
          onChange={(b) => settings.setShortcut('switchNextAgent', b)}
          t={t}
        />
        <ShortcutRow
          label={t('settings.shortcutPrevAgent')}
          binding={settings.shortcuts.switchPrevAgent}
          onChange={(b) => settings.setShortcut('switchPrevAgent', b)}
          t={t}
        />
      </SettingsCard>

      {/* ---- 7. 语言设置 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader
          icon={Globe}
          title={t('settings.languageSettings')}
          description={t('settings.languageSettingsDescription')}
        />
        <LanguageSelector />
      </SettingsCard>

      {/* ---- 8. 基础开关（保留原有） ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Monitor} title={t('settings.displayOptions')} description={t('settings.displayOptionsDesc')} />
        {toggleItems.map((item) => (
          <SettingsToggle key={item.label} {...item} className="py-3" />
        ))}
      </SettingsCard>

      {/* ---- 重置按钮 ---- */}
      <div className="flex justify-end">
        <button
          onClick={settings.resetPreferences}
          className="px-4 py-2 text-xs text-muted hover:text-surface-700 dark:hover:text-surface-300 border border-surface-200 dark:border-surface-700 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
        >
          {t('settings.resetToDefaults')}
        </button>
      </div>
    </div>
  )
}

// ---- 快捷键编辑行 ----

function ShortcutRow({ label, binding, onChange, t }: {
  label: string
  binding: { key: string; modifiers: string[] }
  onChange: (b: { key: string; modifiers: string[] }) => void
  t: (key: string) => string
}) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Escape 取消录制
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }

      // 忽略单独的修饰键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const modifiers: string[] = []
      if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')

      // 格式化按键名
      const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key

      onChange({ key: keyName, modifiers })
      setRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording, onChange])

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col min-w-0">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</label>
        {!isShortcutBindingSupported(binding) && (
          <span className="text-[11px] text-red-500 dark:text-red-400 mt-0.5 leading-tight">
            {t('settings.shortcutNotSupported')}
          </span>
        )}
      </div>
      <button
        onClick={() => setRecording(!recording)}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
          recording
            ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/30 text-accent-600 dark:text-accent-400 animate-pulse'
            : !isShortcutBindingSupported(binding)
              ? 'border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
              : 'border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:border-accent-300'
        }`}
      >
        {recording ? t('settings.shortcutPressKey') : formatShortcut(binding)}
      </button>
    </div>
  )
}

// ---- 工具函数 ----

function formatShortcut(binding: { key: string; modifiers: string[] }): string {
  const parts = [...binding.modifiers, binding.key]
  return parts.join(' + ')
}
