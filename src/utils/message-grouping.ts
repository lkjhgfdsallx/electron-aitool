/**
 * 消息渲染分组逻辑
 *
 * 统一 ChatWindow 与 WorkspaceChatPanel 中的 groupMessages / RenderGroup 实现。
 */
import type { Message } from '../types/message'

/** 消息渲染组：单条消息或多条合并的 assistant 组 */
export type RenderGroup =
  | { type: 'single'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

/**
 * 将消息列表分组：
 * - user / system / Agent 模式的 assistant → 独立渲染
 * - 普通模式下连续的 assistant + tool 消息 → 合并为一组
 *
 * @param messages 已通过 getVisibleMessages 处理分支后的可见消息列表
 */
export function groupMessages(messages: Message[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  let pendingGroup: Message[] = []

  // 按 timestamp 排序，确保消息按时间顺序渲染
  // 这修复了 Bug 1：在快速消息流或 Agent 完成后用户立即发消息时，
  // 消息可能按添加顺序到达但 timestamp 不一致，导致排版错乱
  const sortedMessages = [...messages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

  const flushGroup = () => {
    if (pendingGroup.length === 0) return
    if (pendingGroup.length === 1) {
      groups.push({ type: 'single', message: pendingGroup[0] })
    } else {
      groups.push({ type: 'assistant-group', messages: [...pendingGroup] })
    }
    pendingGroup = []
  }

  for (const msg of sortedMessages) {
    if (msg.role === 'user' || msg.role === 'system') {
      flushGroup()
      groups.push({ type: 'single', message: msg })
    } else if (msg.role === 'tool') {
      // 工具结果消息归入当前组
      pendingGroup.push(msg)
    } else if (msg.role === 'assistant') {
      // Agent 模式消息（有 agentSteps）独立渲染
      if (msg.agentSteps && msg.agentSteps.length > 0) {
        flushGroup()
        groups.push({ type: 'single', message: msg })
      } else {
        pendingGroup.push(msg)
      }
    }
  }
  flushGroup()
  return groups
}
