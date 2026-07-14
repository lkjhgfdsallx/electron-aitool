/**
 * @deprecated 终端日志已合并到 conversation-store。
 *
 * 此文件仅保留兼容导出，旧调用方会代理到 useConversationStore。
 */

import { useConversationStore, EMPTY_TERMINAL_LOGS } from './conversation-store'
import type { TerminalLog } from '../types'

export type { TerminalLog }
export { EMPTY_TERMINAL_LOGS }
export const useWorkspaceMessageStore = useConversationStore
