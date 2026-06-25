/**
 * 模型列表拉取服务
 * 从 AI Provider 的 /v1/models 接口获取可用模型列表
 * 支持连接健康检查、自定义请求头、超时和重试
 */

import type { AIModel, ConnectionHealth, ProviderRequestConfig } from '../types'

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
  signal?: AbortSignal,
  requestConfig?: ProviderRequestConfig
): Promise<AIModel[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  // apiKey 可能为空（如 Ollama 本地服务）
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // 合并自定义 headers
  if (requestConfig?.customHeaders) {
    Object.assign(headers, requestConfig.customHeaders)
  }

  // 构建 fetch options
  const fetchOptions: RequestInit = {
    method: 'GET',
    headers,
    signal
  }

  // 超时处理
  const timeout = requestConfig?.timeout || 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // 如果有外部 signal，合并
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal })

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
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 测试 Provider 连接并返回健康状态
 * 通过尝试拉取模型列表来判断连接是否正常
 */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  requestConfig?: ProviderRequestConfig
): Promise<ConnectionHealth> {
  const startTime = Date.now()

  try {
    await fetchModels(baseUrl, apiKey, undefined, requestConfig)

    return {
      status: 'online',
      lastConnectedAt: Date.now(),
      lastCheckedAt: Date.now(),
      latencyMs: Date.now() - startTime,
      lastError: undefined
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    const isTimeout = error instanceof DOMException && error.name === 'AbortError'

    return {
      status: isTimeout ? 'offline' : 'error',
      lastCheckedAt: Date.now(),
      latencyMs: Date.now() - startTime,
      lastError: isTimeout ? '连接超时' : errorMessage
    }
  }
}

/**
 * 带重试的模型拉取
 */
export async function fetchModelsWithRetry(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
  requestConfig?: ProviderRequestConfig
): Promise<AIModel[]> {
  const maxRetries = requestConfig?.maxRetries || 0
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchModels(baseUrl, apiKey, signal, requestConfig)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries) {
        // 指数退避等待
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }
  }

  throw lastError || new Error('拉取模型列表失败')
}
