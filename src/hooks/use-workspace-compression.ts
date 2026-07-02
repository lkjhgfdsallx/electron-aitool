/**
 * 工作区上下文压缩辅助 Hook
 *
 * 当对话上下文超过阈值需要压缩时，自动：
 * 1. 将完整消息历史保存到存档点
 * 2. 创建 pre-compression 类型存档点
 * 3. 返回压缩标记数据，供 CompressionIndicator 渲染
 *
 * 用法：在 use-chat.ts 的压缩流程中调用 prepareCompression()
 */

import { useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { workspaceVCSService } from '../services/workspace-vcs-service'
import type { Message } from '../types/message'

/** 压缩标记数据，存入消息的 metadata 中 */
export interface CompressionMarkerData {
  /** 关联的存档点 ID */
  checkpointId: string
  /** 压缩时间 */
  compressedAt: number
  /** 被压缩的消息数量 */
  compressedMessageCount: number
  /** 压缩前的 Token 数（估算） */
  tokensBefore?: number
  /** 压缩后的 Token 数（估算） */
  tokensAfter?: number
}

/**
 * 工作区上下文压缩 Hook
 */
export function useWorkspaceCompression() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  /**
   * 准备压缩：保存消息历史 + 创建存档点
   *
   * @param messages 压缩前的完整消息列表
   * @param conversationId 当前对话 ID
   * @param tokensBefore 压缩前 Token 估算
   * @returns 压缩标记数据，失败返回 null
   */
  const prepareCompression = useCallback(async (
    messages: Message[],
    conversationId: string,
    tokensBefore?: number,
    /** 触发压缩的消息 ID */
    messageId?: string,
  ): Promise<CompressionMarkerData | null> => {
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!workspace) return null

    try {
      // 1. 创建 pre-compression 存档点（关联触发消息）
      const checkpointResult = await workspaceVCSService.createCheckpoint({
        folderPath: workspace.folderPath,
        description: `上下文压缩前存档（${messages.length} 条消息）`,
        type: 'pre-compression',
        workspaceId: workspace.id,
        conversationId,
        messageId,
      })

      if (!checkpointResult.success || !checkpointResult.checkpointId) {
        console.warn('[use-workspace-compression] 创建压缩存档点失败:', checkpointResult.error)
        return null
      }

      // 2. 保存完整消息历史到存档点
      const saveResult = await workspaceVCSService.saveMessagesForCompression(
        workspace.folderPath,
        checkpointResult.checkpointId,
        messages,
      )

      if (!saveResult.success) {
        console.warn('[use-workspace-compression] 保存消息历史失败:', saveResult.error)
        // 不阻止压缩，存档点已创建
      }

      // 3. 返回压缩标记数据（含 Token 消耗信息）
      return {
        checkpointId: checkpointResult.checkpointId,
        compressedAt: Date.now(),
        compressedMessageCount: messages.length,
        tokensBefore,
        tokensAfter: undefined, // 压缩后的 Token 数由调用方在压缩完成后回填
      }
    } catch (err) {
      console.error('[use-workspace-compression] 准备压缩失败:', err)
      return null
    }
  }, [workspaces, activeWorkspaceId])

  /**
   * 检查当前是否在工作区模式下
   */
  const isWorkspaceActive = activeWorkspaceId !== null && workspaces.some((w) => w.id === activeWorkspaceId)

  /**
   * 获取当前工作区的上下文配置
   */
  const getContextConfig = useCallback(() => {
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    return workspace?.contextConfig ?? null
  }, [workspaces, activeWorkspaceId])

  return {
    prepareCompression,
    isWorkspaceActive,
    getContextConfig,
  }
}
