import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../stores/settings-store'
import { useConversationStore } from '../stores/conversation-store'
import { useAgentStore } from '../stores/agent-store'
import type { ShortcutBinding, ShortcutConfig } from '../types'

/**
 * 将 ShortcutBinding 转换为 Electron accelerator 字符串
 * 例如 { key: 'n', modifiers: ['Ctrl'] } → 'CommandOrControl+N'
 */
function toAccelerator(binding: ShortcutBinding): string {
  const parts: string[] = []

  // Electron 使用 CommandOrControl 做跨平台修饰键
  for (const mod of binding.modifiers) {
    switch (mod) {
      case 'Ctrl':
        parts.push('CommandOrControl')
        break
      case 'Shift':
        parts.push('Shift')
        break
      case 'Alt':
        parts.push('Alt')
        break
      case 'Meta':
        parts.push('CommandOrControl')
        break
      default:
        parts.push(mod)
    }
  }

  // 特殊键名映射，普通字母/数字直接大写
  const SPECIAL_KEYS: Record<string, string> = {
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
    ';': 'Semicolon',
    "'": 'Quote',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    '\\': 'Backslash',
    '-': 'Minus',
    '=': 'Equal',
    ' ': 'Space',
  }

  const key = binding.key
  const mapped = SPECIAL_KEYS[key] ?? key.toUpperCase()
  parts.push(mapped)

  return parts.join('+')
}

/** 快捷键动作回调（需要 App 级别状态的操作） */
export interface ShortcutActions {
  openSettings: () => void
}

/**
 * 快捷键桥接 Hook
 * - 应用启动时将 store 中的快捷键配置注册到 Electron globalShortcut
 * - 监听 shortcuts:triggered 事件，分发对应动作
 * - 快捷键配置变更时自动重新注册
 */
export function useShortcuts(actions: ShortcutActions): void {
  const shortcuts = useSettingsStore((s) => s.shortcuts)
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  // 注册所有快捷键 + 监听触发事件
  useEffect(() => {
    const api = window.electronAPI?.shortcuts
    if (!api) return // 非 Electron 环境跳过

    // 注册所有快捷键
    const config = shortcuts
    for (const [actionId, binding] of Object.entries(config) as [keyof ShortcutConfig, ShortcutBinding][]) {
      if (!binding.key) continue
      const accelerator = toAccelerator(binding)
      api.register(actionId, accelerator).then((result: { success: boolean; error?: string }) => {
        if (!result.success) {
          console.warn(`[shortcuts] 注册失败: ${actionId} (${accelerator})`, result.error)
        }
      })
    }

    // 监听快捷键触发事件
    const unsubscribe = api.onTriggered((actionId: string) => {
      handleShortcutAction(actionId as keyof ShortcutConfig, actionsRef.current)
    })

    // 清理：注销所有快捷键
    return () => {
      unsubscribe()
      for (const actionId of Object.keys(config)) {
        api.unregister(actionId)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts])
}

/** 分发快捷键动作 */
function handleShortcutAction(actionId: keyof ShortcutConfig, actions: ShortcutActions): void {
  switch (actionId) {
    case 'newConversation': {
      const store = useConversationStore.getState()
      store.createConversation()
      break
    }
    case 'toggleSidebar': {
      const store = useSettingsStore.getState()
      store.toggleSidebar()
      break
    }
    case 'openSettings': {
      actions.openSettings()
      break
    }
    case 'switchNextAgent': {
      cycleAgent(1)
      break
    }
    case 'switchPrevAgent': {
      cycleAgent(-1)
      break
    }
    case 'focusInput': {
      // 聚焦聊天输入框
      const textarea = document.querySelector<HTMLTextAreaElement>('[data-chat-input]')
      if (textarea) {
        textarea.focus()
      }
      break
    }
    default:
      console.warn(`[shortcuts] 未知动作: ${actionId}`)
  }
}

/** 循环切换 Agent */
function cycleAgent(direction: 1 | -1): void {
  const { agents, selectedAgentId, selectAgent } = useAgentStore.getState()
  const enabledAgents = agents.filter((a) => a.enabled)
  if (enabledAgents.length === 0) return

  const currentIndex = enabledAgents.findIndex((a) => a.id === selectedAgentId)
  let nextIndex: number
  if (currentIndex === -1) {
    nextIndex = direction === 1 ? 0 : enabledAgents.length - 1
  } else {
    nextIndex = (currentIndex + direction + enabledAgents.length) % enabledAgents.length
  }
  selectAgent(enabledAgents[nextIndex].id)
}
