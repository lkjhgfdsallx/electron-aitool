/**
 * 网络请求捕获服务
 * 在浏览器自动化过程中捕获所有 XHR/Fetch/WebSocket 请求
 */

import type { Page } from 'playwright'
import type { CapturedRequest } from './types'

export class RequestCapture {
  private capturedRequests: CapturedRequest[] = []
  private isCapturing = false

  /**
   * 在页面上开始捕获网络请求
   */
  startCapture(page: Page): void {
    if (this.isCapturing) return
    this.isCapturing = true

    // 捕获请求和响应
    page.on('request', (request) => {
      const resourceType = request.resourceType()
      const isApi = ['xhr', 'fetch'].includes(resourceType)

      // 只记录 XHR/Fetch 请求和文档请求
      if (!isApi && resourceType !== 'document') return

      const entry: CapturedRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
        resourceType,
        isApiRequest: isApi,
        statusCode: 0,
        response: ''
      }

      // 解析查询参数
      try {
        const url = new URL(request.url())
        const params: Record<string, string> = {}
        url.searchParams.forEach((value, key) => {
          params[key] = value
        })
        if (Object.keys(params).length > 0) {
          entry.params = params
        }
      } catch {
        // 无效URL
      }

      // 获取请求体
      try {
        const postData = request.postData()
        if (postData) {
          entry.body = postData
        }
      } catch {
        // 忽略
      }

      // 临时存储，等待响应
      const requestId = `${request.method()}_${request.url()}_${entry.timestamp}`
      ;(entry as unknown as Record<string, unknown>)['_requestId'] = requestId
      this.capturedRequests.push(entry)
    })

    page.on('response', (response) => {
      const request = response.request()
      const resourceType = request.resourceType()
      const isApi = ['xhr', 'fetch'].includes(resourceType)

      if (!isApi && resourceType !== 'document') return

      // 查找对应的请求记录
      const entry = this.capturedRequests
        .reverse()
        .find(
          (r) =>
            r.url === request.url() &&
            r.method === request.method() &&
            r.statusCode === 0
        )

      if (!entry) return

      entry.statusCode = response.status()

      // 获取响应头
      try {
        entry.responseHeaders = response.headers()
      } catch {
        // 忽略
      }

      // 获取响应体（限制大小，避免内存问题）
      response
        .text()
        .then((text) => {
          if (text.length > 1024 * 100) {
            // 超过100KB的响应截断
            entry.response = text.substring(0, 1024 * 100) + '\n... [truncated]'
          } else {
            entry.response = text
          }
          entry.responseSize = text.length
          entry.duration = Date.now() - entry.timestamp
        })
        .catch(() => {
          // 某些响应无法读取body
          entry.response = '[无法读取响应体]'
          entry.duration = Date.now() - entry.timestamp
        })
    })

    // 捕获 WebSocket
    page.on('websocket', (ws) => {
      const wsEntry: CapturedRequest = {
        url: ws.url(),
        method: 'WS',
        headers: {},
        timestamp: Date.now(),
        resourceType: 'websocket',
        isApiRequest: true,
        statusCode: 101,
        response: ''
      }

      const messages: string[] = []

      ws.on('framereceived', (frame) => {
        if (typeof frame.payload === 'string') {
          messages.push(`[RECV] ${frame.payload.substring(0, 2000)}`)
        }
      })

      ws.on('framesent', (frame) => {
        if (typeof frame.payload === 'string') {
          messages.push(`[SEND] ${frame.payload.substring(0, 2000)}`)
        }
      })

      ws.on('close', () => {
        wsEntry.response = messages.join('\n')
        wsEntry.duration = Date.now() - wsEntry.timestamp
        this.capturedRequests.push(wsEntry)
      })
    })
  }

  /**
   * 获取所有捕获的请求
   */
  getRequests(): CapturedRequest[] {
    return [...this.capturedRequests]
  }

  /**
   * 只获取API请求（XHR/Fetch）
   */
  getApiRequests(): CapturedRequest[] {
    return this.capturedRequests.filter((r) => r.isApiRequest)
  }

  /**
   * 去重并合并相似请求
   */
  getDeduplicatedRequests(): CapturedRequest[] {
    const seen = new Map<string, CapturedRequest>()

    for (const req of this.capturedRequests) {
      // 用 method + URL路径（不含查询参数）作为去重key
      let pathname = req.url
      try {
        const url = new URL(req.url)
        pathname = `${url.origin}${url.pathname}`
      } catch {
        // 无效URL
      }
      const key = `${req.method}_${pathname}`

      if (!seen.has(key)) {
        seen.set(key, req)
      } else {
        // 增加频率计数
        const existing = seen.get(key)!
        existing.frequency = (existing.frequency || 1) + 1
      }
    }

    return Array.from(seen.values())
  }

  /**
   * 脱敏敏感信息
   */
  sanitizeRequests(requests: CapturedRequest[]): CapturedRequest[] {
    return requests.map((req) => {
      const sanitized = { ...req }

      // 脱敏请求头中的敏感信息
      if (sanitized.headers) {
        const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-token']
        const sanitizedHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(sanitized.headers)) {
          if (sensitiveKeys.includes(key.toLowerCase())) {
            sanitizedHeaders[key] = '***REDACTED***'
          } else {
            sanitizedHeaders[key] = value
          }
        }
        sanitized.headers = sanitizedHeaders
      }

      // 脱敏响应头
      if (sanitized.responseHeaders) {
        const sanitizedRespHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(sanitized.responseHeaders)) {
          if (key.toLowerCase() === 'set-cookie') {
            sanitizedRespHeaders[key] = '***REDACTED***'
          } else {
            sanitizedRespHeaders[key] = value
          }
        }
        sanitized.responseHeaders = sanitizedRespHeaders
      }

      return sanitized
    })
  }

  /**
   * 停止捕获
   */
  stopCapture(): void {
    this.isCapturing = false
  }

  /**
   * 清空捕获的请求
   */
  clear(): void {
    this.capturedRequests = []
    this.isCapturing = false
  }
}
