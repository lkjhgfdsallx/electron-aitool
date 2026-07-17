import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import i18n from '@/i18n/config'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 可选的 fallback UI */
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * 错误边界组件
 *
 * 捕获子组件树中的渲染错误，防止整个应用白屏。
 * 显示友好的错误提示和"重新加载"按钮。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              {i18n.t('nav.renderError')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {this.state.error?.message || i18n.t('common.unknownError')}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-medium shadow-sm hover:shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {i18n.t('common.retry')}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl border border-surface-300 dark:border-surface-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
              >
                {i18n.t('common.reloadApp')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
