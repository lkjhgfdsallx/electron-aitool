/**
 * 模型列表拉取服务
 * 从 AI Provider 的 /v1/models 接口获取可用模型列表
 */

import type { AIModel } from '../types'

interface OpenAIModelObject {
  id: string
  object: string
  created?: number
  owned_by?: string
}

interface OpenAIModelsResponse {
  object: string
  data: OpenAIModelObject[]
}

/**
 * 从指定的 AI Provider 拉取模型列表
 * 兼容 OpenAI /v1/models 格式（OpenAI、DeepSeek、Ollama 等均兼容）
 */
export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<AIModel[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  // apiKey 可能为空（如 Ollama 本地服务）
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`拉取模型列表失败 (${response.status}): ${errorText}`)
  }

  const data: OpenAIModelsResponse = await response.json()

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('模型列表响应格式异常：缺少 data 字段')
  }

  return data.data.map((m) => ({
    id: m.id,
    name: m.id,
    ownedBy: m.owned_by
  })).sort((a, b) => a.id.localeCompare(b.id))
}
