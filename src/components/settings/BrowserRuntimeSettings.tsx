import { useEffect, useState } from 'react'
import { CheckCircle2, Chrome, FolderOpen, Loader2, Trash2, XCircle } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { SettingsSectionHeader } from './ui'

type Validation = {
  valid: boolean
  browserName?: string
  version?: string
  error?: string
}

/** 网页分析使用的本机 Chromium 浏览器设置。 */
export function BrowserRuntimeSettings() {
  const browserExecutablePath = useSettingsStore((state) => state.browserExecutablePath)
  const setBrowserExecutablePath = useSettingsStore((state) => state.setBrowserExecutablePath)
  const [validation, setValidation] = useState<Validation | null>(null)
  const [checking, setChecking] = useState(false)

  const validatePath = async (executablePath: string) => {
    if (!executablePath) {
      setValidation(null)
      return
    }
    setChecking(true)
    try {
      setValidation(await window.electronAPI.browserConfig.validateExecutable(executablePath))
    } catch {
      setValidation({ valid: false, error: '无法校验浏览器路径，请重启应用后重试' })
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void validatePath(browserExecutablePath)
  }, [browserExecutablePath])

  const handleSelect = async () => {
    setChecking(true)
    try {
      const result = await window.electronAPI.browserConfig.selectExecutable()
      if (!result.canceled && result.executablePath && result.validation?.valid) {
        setBrowserExecutablePath(result.executablePath)
        setValidation(result.validation)
      } else if (!result.canceled && result.validation) {
        setValidation(result.validation)
      }
    } catch {
      setValidation({ valid: false, error: '无法打开浏览器文件选择器' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="space-y-3">
      <SettingsSectionHeader title="网页分析浏览器" />
      <div className="rounded-xl border border-surface-200/80 bg-white p-4 dark:border-surface-700/60 dark:bg-surface-800/60">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400">
            <Chrome size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-surface-800 dark:text-surface-200">Chrome / Edge 浏览器</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              网页分析会启动独立的专用浏览器窗口，不读取或修改日常浏览器的登录状态。首次在该窗口完成登录后，登录状态会保存在网页分析专用 Profile 中，供后续分析复用。
              支持 Google Chrome、Microsoft Edge 和其他 Chromium 浏览器。
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void handleSelect()}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
            选择浏览器
          </button>
          {browserExecutablePath && (
            <button
              type="button"
              onClick={() => setBrowserExecutablePath('')}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-100 hover:text-red-500 dark:border-surface-600 dark:hover:bg-surface-700"
            >
              <Trash2 size={14} />
              清除
            </button>
          )}
        </div>

        {browserExecutablePath ? (
          <div className="mt-3 rounded-lg bg-surface-50 px-3 py-2 dark:bg-surface-900/50">
            <p className="break-all font-mono text-[11px] text-surface-600 dark:text-surface-300">{browserExecutablePath}</p>
            {checking ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Loader2 size={12} className="animate-spin" />正在校验浏览器…</p>
            ) : validation?.valid ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} />已验证：{validation.browserName}</p>
            ) : validation ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-red-500"><XCircle size={13} />{validation.error}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">尚未配置。使用网页分析前请先选择本机 Chrome 或 Edge。</p>
        )}
      </div>
    </section>
  )
}
