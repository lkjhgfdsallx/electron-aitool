 /**
 * Monaco Editor 本地化初始化模块
 *
 * 职责：
 * 1. 使用 Vite ?worker 语法将 Monaco 的 5 个 Web Worker 打包到本地 chunk
 * 2. 配置 self.MonacoEnvironment 指定 worker 工厂
 * 3. 调用 loader.config({ monaco }) 切换为本地 monaco 实例（脱离 CDN）
 * 4. 导出的 initMonaco() 可在应用入口早期调用，预加载 Monaco 资源
 *
 * 原理：
 * - @monaco-editor/react 通过 @monaco-editor/loader 加载 monaco-editor
 * - 默认配置从 cdn.jsdelivr.net 远程加载约 2-3MB 资源（国内网络慢/不可达）
 * - loader.config({ monaco }) 告诉 loader 使用本地 import 的 monaco 实例
 * - Vite ?worker 语法将 worker 代码构建为独立 chunk，随应用打包
 */

import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'

// Vite ?worker 语法：将各个 language worker 作为独立 chunk 打包
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// 配置 Monaco 的 Worker 环境
// 每个语言需要对应的 worker 来提供语法高亮、代码补全、验证等功能
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  },
}

// 将本地 monaco 实例注入 loader，从此不再走 CDN
loader.config({ monaco })

/**
 * 预初始化 Monaco Editor
 * 在应用入口早期调用，后台加载 Monaco 资源。
 * 不阻塞 UI 渲染：Monaco 在后台加载，React 正常 mount。
 *
 * @returns Promise，resolve 时 Monaco 已完全就绪
 */
export function initMonaco(): Promise<void> {
  return loader.init().then(() => {
    console.log('[Monaco] pre-initialized successfully (local bundle)')
  }).catch((err: unknown) => {
    console.warn('[Monaco] pre-initialization failed:', err)
  })
}