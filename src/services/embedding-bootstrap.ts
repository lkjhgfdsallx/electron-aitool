/**
 * Embedding 引擎启动预热
 *
 * 在 settings-store rehydrate 完成后，若配置为非 tfidf，
 * 自动从 IndexedDB 缓存装入本地模型 Worker（或初始化 Ollama/API 引擎）。
 * 避免刷新/重启后必须进入设置页并手动点「加载模型」。
 */

import { useSettingsStore } from '../stores/settings-store'
import type { EmbeddingProviderConfig, LocalModelProviderConfig } from '../types/knowledge-base'
import { embeddingService } from './embedding-service'

let bootstrapStarted = false

function shouldAllowNetworkOnBootstrap(config: EmbeddingProviderConfig): boolean {
  if (config.type === 'local-model') {
    return (config as LocalModelProviderConfig).autoDownload === true
  }
  // ollama / openai-api：无大文件下载，允许探测服务
  return true
}

async function warmUpFromConfig(config: EmbeddingProviderConfig): Promise<void> {
  if (config.type === 'tfidf') return

  const status = embeddingService.getStatus()
  if (status.modelReady || status.modelLoading) return

  try {
    await embeddingService.init(config, {
      // 启动预热：local-model 默认仅走缓存；autoDownload=true 时允许下载
      allowNetworkDownload: shouldAllowNetworkOnBootstrap(config)
    })
  } catch (err) {
    console.warn('[embedding-bootstrap] 启动预热失败（不影响 UI）:', err)
  }
}

/**
 * 在应用启动时调用一次：等待 settings persist 水合后预热 embedding 引擎。
 * 幂等；可与 Skills 预热等并列。
 */
export function bootstrapEmbeddingEngine(): () => void {
  if (bootstrapStarted) {
    return () => {}
  }
  bootstrapStarted = true

  const run = () => {
    const config = useSettingsStore.getState().embeddingConfig
    void warmUpFromConfig(config)
  }

  const persistApi = useSettingsStore.persist
  if (persistApi.hasHydrated()) {
    run()
    return () => {}
  }

  const unsub = persistApi.onFinishHydration(() => {
    run()
  })
  return () => {
    unsub()
  }
}
