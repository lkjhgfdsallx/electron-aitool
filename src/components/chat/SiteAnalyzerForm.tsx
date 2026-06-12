import { useState } from 'react'
import { Globe, LogIn, Settings2, Play, ChevronDown, ChevronUp, Shield, Loader2 } from 'lucide-react'

export interface SiteAnalyzerFormData {
  targetUrl: string
  loginType: 'manual' | 'password' | 'cookie'
  username: string
  password: string
  cookie: string
  token: string
  maxDepth: number
  maxPages: number
  crawlDelay: number
  urlIncludePatterns: string
  urlExcludePatterns: string
  proxyServer: string
  userAgent: string
  simulateHuman: boolean
}

interface SiteAnalyzerFormProps {
  onSubmit: (data: SiteAnalyzerFormData) => void
  disabled?: boolean
}

const DEFAULT_VALUES: SiteAnalyzerFormData = {
  targetUrl: '',
  loginType: 'manual',
  username: '',
  password: '',
  cookie: '',
  token: '',
  maxDepth: 3,
  maxPages: 100,
  crawlDelay: 1000,
  urlIncludePatterns: '',
  urlExcludePatterns: '',
  proxyServer: '',
  userAgent: '',
  simulateHuman: false
}

export function SiteAnalyzerForm({ onSubmit, disabled = false }: SiteAnalyzerFormProps) {
  const [form, setForm] = useState<SiteAnalyzerFormData>(DEFAULT_VALUES)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateField = <K extends keyof SiteAnalyzerFormData>(key: K, value: SiteAnalyzerFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 清除该字段的错误
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!form.targetUrl.trim()) {
      newErrors.targetUrl = '请输入目标网址'
    } else {
      try {
        new URL(form.targetUrl)
      } catch {
        newErrors.targetUrl = '请输入有效的URL（如 https://example.com）'
      }
    }

    if (form.loginType === 'password') {
      if (!form.username.trim()) newErrors.username = '请输入用户名'
      if (!form.password.trim()) newErrors.password = '请输入密码'
    }

    if (form.loginType === 'cookie') {
      if (!form.cookie.trim() && !form.token.trim()) {
        newErrors.cookie = '请输入Cookie或Token（至少一项）'
      }
    }

    if (form.maxDepth < 1 || form.maxDepth > 10) {
      newErrors.maxDepth = '爬取深度范围：1-10'
    }

    if (form.maxPages < 1 || form.maxPages > 10000) {
      newErrors.maxPages = '页面数量范围：1-10000'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(form)
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* 标题栏 */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
        <div className="flex items-center gap-2 text-white">
          <Globe size={20} />
          <h3 className="text-lg font-semibold">网站功能分析</h3>
        </div>
        <p className="text-blue-100 text-sm mt-1">
          配置分析参数，AI 将自动爬取并分析目标网站的功能模块和 API 接口
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* ========== 基本配置 ========== */}
        <section>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            <Globe size={16} className="text-blue-500" />
            基本配置
          </h4>

          {/* 目标网址 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              目标网址 <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={form.targetUrl}
              onChange={(e) => updateField('targetUrl', e.target.value)}
              placeholder="https://example.com"
              disabled={disabled}
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.targetUrl
                  ? 'border-red-300 dark:border-red-600 focus:ring-red-200'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-blue-200'
              } bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-blue-400 dark:focus:border-blue-500 transition-colors`}
            />
            {errors.targetUrl && (
              <p className="mt-1 text-xs text-red-500">{errors.targetUrl}</p>
            )}
          </div>
        </section>

        {/* ========== 登录配置 ========== */}
        <section>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            <LogIn size={16} className="text-green-500" />
            登录方式
          </h4>

          {/* 登录类型选择 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {([
              { value: 'manual', label: '手动登录', desc: '打开浏览器后自己登录' },
              { value: 'password', label: '账号密码', desc: '自动填写账号密码' },
              { value: 'cookie', label: 'Cookie/Token', desc: '导入已有登录态' }
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateField('loginType', opt.value)}
                disabled={disabled}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  form.loginType === opt.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {opt.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>

          {/* 登录凭证输入 */}
          {form.loginType === 'password' && (
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mb-2">
                <Shield size={14} />
                <span>凭证仅用于本次分析，不会被存储</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    用户名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => updateField('username', e.target.value)}
                    placeholder="请输入用户名"
                    disabled={disabled}
                    className={`w-full px-3 py-2 text-sm rounded-lg border ${
                      errors.username ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200`}
                  />
                  {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    密码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder="请输入密码"
                    disabled={disabled}
                    className={`w-full px-3 py-2 text-sm rounded-lg border ${
                      errors.password ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200`}
                  />
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                </div>
              </div>
            </div>
          )}

          {form.loginType === 'cookie' && (
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mb-2">
                <Shield size={14} />
                <span>凭证仅用于本次分析，不会被存储</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Cookie 字符串
                </label>
                <textarea
                  value={form.cookie}
                  onChange={(e) => updateField('cookie', e.target.value)}
                  placeholder="sessionid=abc123; token=xyz789; ..."
                  rows={2}
                  disabled={disabled}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${
                    errors.cookie ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none`}
                />
                {errors.cookie && <p className="mt-1 text-xs text-red-500">{errors.cookie}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Bearer Token（可选，与Cookie二选一）
                </label>
                <input
                  type="text"
                  value={form.token}
                  onChange={(e) => updateField('token', e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
          )}

          {form.loginType === 'manual' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 浏览器打开后，请在弹出的窗口中手动完成登录。登录完成后，分析器将自动继续爬取。
              </p>
            </div>
          )}
        </section>

        {/* ========== 分析范围 ========== */}
        <section>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            <Settings2 size={16} className="text-purple-500" />
            分析范围
          </h4>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                爬取深度
              </label>
              <input
                type="number"
                value={form.maxDepth}
                onChange={(e) => updateField('maxDepth', parseInt(e.target.value) || 1)}
                min={1}
                max={10}
                disabled={disabled}
                className={`w-full px-3 py-2 text-sm rounded-lg border ${
                  errors.maxDepth ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200`}
              />
              {errors.maxDepth && <p className="mt-1 text-xs text-red-500">{errors.maxDepth}</p>}
              <p className="mt-1 text-xs text-gray-400">首页=0，建议 2-4</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                最大页面数
              </label>
              <input
                type="number"
                value={form.maxPages}
                onChange={(e) => updateField('maxPages', parseInt(e.target.value) || 1)}
                min={1}
                max={10000}
                disabled={disabled}
                className={`w-full px-3 py-2 text-sm rounded-lg border ${
                  errors.maxPages ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200`}
              />
              {errors.maxPages && <p className="mt-1 text-xs text-red-500">{errors.maxPages}</p>}
              <p className="mt-1 text-xs text-gray-400">建议 50-200</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                爬取间隔 (ms)
              </label>
              <input
                type="number"
                value={form.crawlDelay}
                onChange={(e) => updateField('crawlDelay', parseInt(e.target.value) || 500)}
                min={500}
                max={30000}
                step={500}
                disabled={disabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-400">越小越快，但对服务器压力越大</p>
            </div>
          </div>
        </section>

        {/* ========== 高级配置（可折叠） ========== */}
        <section>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            高级配置（可选）
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              {/* URL 过滤 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    URL包含规则（正则）
                  </label>
                  <input
                    type="text"
                    value={form.urlIncludePatterns}
                    onChange={(e) => updateField('urlIncludePatterns', e.target.value)}
                    placeholder="/api/.*  （每行一个）"
                    disabled={disabled}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    URL排除规则（正则）
                  </label>
                  <input
                    type="text"
                    value={form.urlExcludePatterns}
                    onChange={(e) => updateField('urlExcludePatterns', e.target.value)}
                    placeholder=".*\\.pdf$  （每行一个）"
                    disabled={disabled}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              {/* 代理和UA */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    代理服务器
                  </label>
                  <input
                    type="text"
                    value={form.proxyServer}
                    onChange={(e) => updateField('proxyServer', e.target.value)}
                    placeholder="http://proxy:8080"
                    disabled={disabled}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    自定义 User-Agent
                  </label>
                  <input
                    type="text"
                    value={form.userAgent}
                    onChange={(e) => updateField('userAgent', e.target.value)}
                    placeholder="留空使用默认值"
                    disabled={disabled}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              {/* 模拟人类行为 */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.simulateHuman}
                    onChange={(e) => updateField('simulateHuman', e.target.checked)}
                    disabled={disabled}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">模拟人类行为</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">启用随机滚动、鼠标移动等，降低被反爬虫检测的风险</div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 提交按钮 */}
      <div className="px-6 pb-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !form.targetUrl.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {disabled ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Play size={18} />
              开始分析
            </>
          )}
        </button>
      </div>
    </div>
  )
}
