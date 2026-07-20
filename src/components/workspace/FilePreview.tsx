/**
 * 工作区文件编辑器：基于 Monaco 提供文本文件预览、编辑和保存能力。
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import type * as MonacoEditor from 'monaco-editor'
import { X, FileText, Copy, Check, AlertTriangle, Save, Loader2 } from 'lucide-react'
import { workspaceFsService } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'
import { useSettingsStore } from '../../stores/settings-store'

export interface FilePreviewHandle {
  save: () => Promise<boolean>
  discardChanges: () => void
}

interface FilePreviewProps {
  filePath: string
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
}

export const FilePreview = forwardRef<FilePreviewHandle, FilePreviewProps>(function FilePreview(
  { filePath, onClose, onDirtyChange },
  ref
) {
  const { t } = useAppTranslation()
  const theme = useSettingsStore((s) => s.theme)
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fileName = filePath.split(/[/\\]/).pop() || filePath
  const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : ''
  const language = workspaceFsService.getLanguage(ext)
  const isText = workspaceFsService.isTextFile(ext)
  const isDirty = isText && !truncated && content !== savedContent
  const editorLanguage = language === 'text' ? 'plaintext' : language

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSaveError(null)
    setContent('')
    setSavedContent('')
    setTruncated(false)
    setTotalSize(0)

    if (!isText) {
      setLoading(false)
      setError(t('workspace.unsupportedTextPreview'))
      return
    }

    workspaceFsService.readFile(filePath)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.content !== undefined) {
          setContent(result.content)
          setSavedContent(result.content)
          setTruncated(result.truncated || false)
          setTotalSize(result.totalSize || 0)
        } else {
          setError(result.error || t('workspace.readFileFailed'))
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [filePath, isText, t])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => () => {
    onDirtyChange?.(false)
  }, [onDirtyChange])

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!isDirty || saving) return !isDirty
    setSaving(true)
    setSaveError(null)
    try {
      await workspaceFsService.writeFile(filePath, content)
      setSavedContent(content)
      setTotalSize(new Blob([content]).size)
      setSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 1800)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setSaving(false)
    }
  }, [content, filePath, isDirty, saving])

  useImperativeHandle(ref, () => ({
    save: handleSave,
    discardChanges: () => {
      setContent(savedContent)
      setSaveError(null)
    },
  }), [handleSave, savedContent])

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(content) } catch { return }
  }

  const handleEditorMount = useCallback((editor: MonacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editor.addAction({
      id: 'workspace-save-file',
      label: '保存文件',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: async () => { await handleSave() },
    })
  }, [handleSave])

  const editorOptions = useMemo<MonacoEditor.editor.IStandaloneEditorConstructionOptions>(() => ({
    minimap: { enabled: false },
    fontSize: 13,
    lineHeight: 21,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    readOnly: truncated,
    renderWhitespace: 'selection',
  }), [truncated])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900">
      <div className="flex items-center gap-2 h-10 px-3 border-b border-surface-200 dark:border-surface-700/60 flex-shrink-0 min-w-0">
        <FileText size={15} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate flex-shrink-0 max-w-[30%]" title={fileName}>{fileName}</span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate min-w-0" title={filePath}>{filePath}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{totalSize > 0 ? workspaceFsService.formatSize(totalSize) : ''}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase flex-shrink-0">{language}</span>
        {isDirty && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex-shrink-0">● 未保存</span>}
        {truncated && <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0"><AlertTriangle size={11} />{t('workspace.truncated')}</span>}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {saved && <span role="status" className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400"><Check size={12} />已保存</span>}
          <button onClick={handleCopy} className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title={t('workspace.copyContent')} aria-label={t('workspace.copyContent')}><Copy size={14} /></button>
          <button onClick={handleSave} disabled={!isDirty || saving} className="p-1.5 rounded text-gray-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-900/20 dark:hover:text-teal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="保存 (Ctrl+S)" aria-label="保存文件">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title={t('workspace.closePreview')} aria-label={t('workspace.closePreview')}><X size={14} /></button>
        </div>
      </div>

      {saveError && <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50"><span className="truncate">保存失败：{saveError}</span><button onClick={handleSave} className="font-medium underline flex-shrink-0">重试</button></div>}

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400"><Loader2 size={16} className="animate-spin mr-2" />{t('common.loading')}</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4"><AlertTriangle size={24} className="text-amber-400 mb-2" /><p className="text-xs text-gray-500 dark:text-gray-400">{error}</p><p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{fileName}</p></div>
        ) : (
          <Editor
            key={filePath}
            path={filePath}
            language={editorLanguage}
            value={content}
            onChange={(value) => setContent(value ?? '')}
            onMount={handleEditorMount}
            theme={monacoTheme}
            options={editorOptions}
            loading={<div className="flex items-center justify-center h-full text-xs text-gray-400">编辑器加载中…</div>}
          />
        )}
      </div>
    </div>
  )
})
