import { useState, useEffect, useMemo } from 'react'
import {
  Palette, Type, Code2, Layout, Keyboard, Bell, PanelLeft,
  Monitor
} from 'lucide-react'
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

const FONT_FAMILIES = [
  { label: '系统默认', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: '思源黑体', value: "'Source Han Sans SC', 'Noto Sans SC', sans-serif" },
  { label: '苹方', value: "'PingFang SC', 'Hiragino Sans GB', sans-serif" },
  { label: '微软雅黑', value: "'Microsoft YaHei', sans-serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
]

const CODE_FONT_FAMILIES = [
  { label: 'JetBrains Mono', value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace" },
  { label: 'Fira Code', value: "'Fira Code', 'Cascadia Code', Consolas, monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code', Consolas, monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', Consolas, monospace" },
  { label: 'Consolas', value: "Consolas, 'Courier New', monospace" },
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

const MESSAGE_ALIGNMENTS: { label: string; value: MessageAlignment; desc: string }[] = [
  { label: '左右对齐', value: 'left-right', desc: '用户消息靠右，AI 消息靠左' },
  { label: '全部靠左', value: 'all-left', desc: '所有消息都靠左对齐' },
  { label: '全部靠右', value: 'all-right', desc: '所有消息都靠右对齐' },
  { label: '全宽', value: 'full-width', desc: '消息占满整行宽度' },
]

const NOTIFICATION_SOUNDS = [
  { label: '默认提示音', value: 'default' },
  { label: '清脆', value: 'chime' },
  { label: '柔和', value: 'soft' },
  { label: '无', value: 'none' },
]

// ---- 主组件 ----

export function UIPreferencesSection() {
  const settings = useSettingsStore()

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

  const toggleItems: { label: string; desc: string; checked: boolean; onChange: () => void }[] = [
    {
      label: '显示 Token 用量',
      desc: '在消息气泡下方显示 Token 消耗信息',
      checked: settings.showTokenUsage,
      onChange: () => settings.toggleTokenUsage()
    },
    {
      label: '显示时间戳',
      desc: '在消息气泡下方显示发送时间',
      checked: settings.showTimestamp,
      onChange: () => settings.toggleTimestamp()
    },
    {
      label: 'Enter 发送消息',
      desc: '按 Enter 键直接发送，Shift+Enter 换行',
      checked: settings.sendWithEnter,
      onChange: () => settings.setSendWithEnter(!settings.sendWithEnter)
    },
    {
      label: '联网搜索',
      desc: '允许 AI 在回答时搜索互联网获取最新信息',
      checked: settings.webSearchEnabled,
      onChange: () => settings.toggleWebSearch()
    }
  ]

  return (
    <div className="space-y-8">
      <SettingsHeader icon={Palette} title="界面偏好" description="自定义界面显示方式、交互行为和快捷键" />

      {/* ---- 1. 字体与排版 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Type} title="字体与排版" description="调节消息和代码的字体、字号" />

        <SettingsSelect
          label="消息字体"
          description="对话内容的字体族"
          value={settings.fontFamily}
          options={FONT_FAMILIES}
          onChange={(v) => settings.setFontFamily(v)}
          layout="horizontal"
          className="py-3"
        />

        <SettingsSlider
          label="消息字号"
          description="正文字体大小"
          value={settings.fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          unit="px"
          onChange={(v) => settings.setFontSize(v)}
          className="py-3"
        />

        <SettingsSelect
          label="代码字体"
          description="代码块的等宽字体"
          value={settings.codeFontFamily}
          options={CODE_FONT_FAMILIES}
          onChange={(v) => settings.setCodeFontFamily(v)}
          layout="horizontal"
          className="py-3"
        />

        <SettingsSlider
          label="代码字号"
          description="代码块字体大小"
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
        <SettingsSectionHeader icon={Code2} title="代码高亮" description="选择代码块的语法高亮风格" />

        <SettingsSelect
          label="高亮主题"
          description="代码块的 syntax highlight 风格"
          value={settings.codeHighlightTheme}
          options={CODE_HIGHLIGHT_THEMES}
          onChange={(v) => settings.setCodeHighlightTheme(v)}
          layout="horizontal"
          className="py-3"
        />

        {/* 主题预览 */}
        <div className="py-3">
          <p className="text-xs text-muted mb-2">预览：</p>
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
        <SettingsSectionHeader icon={Layout} title="消息布局" description="控制消息对齐方式和头像显示" />

        <div className="py-3">
          <label className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2 block">
            消息对齐方式
          </label>
          <p className="text-xs text-muted mb-3">选择用户和 AI 消息的排列方式</p>
          <div className="grid grid-cols-2 gap-2">
            {MESSAGE_ALIGNMENTS.map((opt) => (
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
          label="显示头像"
          description="在消息旁显示用户/AI 头像图标"
          checked={settings.showAvatar}
          onChange={() => settings.toggleAvatar()}
          className="py-3"
        />
      </SettingsCard>

      {/* ---- 4. 侧边栏行为 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={PanelLeft} title="侧边栏" description="调整侧边栏宽度和行为" />

        <SettingsSlider
          label="侧边栏宽度"
          description="拖拽调节或在此精确设置"
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
        <SettingsSectionHeader icon={Bell} title="通知设置" description="后台对话完成时的通知行为" />

        <SettingsToggle
          label="系统通知"
          description="后台对话完成时弹出系统通知"
          checked={settings.enableNotification}
          onChange={() => settings.setEnableNotification(!settings.enableNotification)}
          className="py-3"
        />

        <SettingsToggle
          label="声音提示"
          description="通知时播放提示音"
          checked={settings.enableSound}
          onChange={() => settings.setEnableSound(!settings.enableSound)}
          className="py-3"
        />

        {settings.enableSound && (
          <SettingsSelect
            label="提示音风格"
            description="选择提示音效"
            value={settings.notificationSound}
            options={NOTIFICATION_SOUNDS}
            onChange={(v) => settings.setNotificationSound(v)}
            layout="horizontal"
            className="py-3"
          />
        )}
      </SettingsCard>

      {/* ---- 6. 快捷键自定义 ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Keyboard} title="快捷键" description="自定义键盘快捷键绑定" />

        <ShortcutRow
          label="新建对话"
          binding={settings.shortcuts.newConversation}
          onChange={(b) => settings.setShortcut('newConversation', b)}
        />
        <ShortcutRow
          label="切换侧边栏"
          binding={settings.shortcuts.toggleSidebar}
          onChange={(b) => settings.setShortcut('toggleSidebar', b)}
        />
        <ShortcutRow
          label="打开设置"
          binding={settings.shortcuts.openSettings}
          onChange={(b) => settings.setShortcut('openSettings', b)}
        />
        <ShortcutRow
          label="聚焦输入框"
          binding={settings.shortcuts.focusInput}
          onChange={(b) => settings.setShortcut('focusInput', b)}
        />
        <ShortcutRow
          label="下一个 Agent"
          binding={settings.shortcuts.switchNextAgent}
          onChange={(b) => settings.setShortcut('switchNextAgent', b)}
        />
        <ShortcutRow
          label="上一个 Agent"
          binding={settings.shortcuts.switchPrevAgent}
          onChange={(b) => settings.setShortcut('switchPrevAgent', b)}
        />
      </SettingsCard>

      {/* ---- 7. 基础开关（保留原有） ---- */}
      <SettingsCard className="divide-y divide-surface-200/80 dark:divide-surface-700/60">
        <SettingsSectionHeader icon={Monitor} title="显示选项" description="基础显示和交互开关" />
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
          恢复默认设置
        </button>
      </div>
    </div>
  )
}

// ---- 快捷键编辑行 ----

function ShortcutRow({ label, binding, onChange }: {
  label: string
  binding: { key: string; modifiers: string[] }
  onChange: (b: { key: string; modifiers: string[] }) => void
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
            此键名不支持全局快捷键注册，快捷键将无法生效
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
        {recording ? '按下快捷键...' : formatShortcut(binding)}
      </button>
    </div>
  )
}

// ---- 工具函数 ----

function formatShortcut(binding: { key: string; modifiers: string[] }): string {
  const parts = [...binding.modifiers, binding.key]
  return parts.join(' + ')
}
