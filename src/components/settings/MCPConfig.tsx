import { useState } from 'react'
import { X, Plus, Trash2, Save, Server, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { mcpService } from '../../services/mcp-service'
import type { MCPServerConfig } from '../../types'

interface MCPConfigProps {
  onClose: () => void
}

export function MCPConfig({ onClose }: MCPConfigProps) {
  const { mcpServers, updateConfig } = useGlobalConfigStore()

  const [servers, setServers] = useState<MCPServerConfig[]>(mcpServers)
  const [isAdding, setIsAdding] = useState(false)
  const [newServer, setNewServer] = useState({
    name: '',
    command: 'npx',
    args: '',
    env: '',
    alwaysAllow: '',
    description: ''
  })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)

  const parseArgs = (argsStr: string): string[] => {
    return argsStr
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const parseEnv = (envStr: string): Record<string, string> | undefined => {
    const lines = envStr
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) return undefined
    const env: Record<string, string> = {}
    for (const line of lines) {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim()
      }
    }
    return Object.keys(env).length > 0 ? env : undefined
  }

  const parseAlwaysAllow = (str: string): string[] | undefined => {
    const items = str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return items.length > 0 ? items : undefined
  }

  const handleAdd = () => {
    if (!newServer.name.trim() || !newServer.command.trim()) return

    const server: MCPServerConfig = {
      id: `mcp:${Date.now()}`,
      name: newServer.name,
      command: newServer.command,
      args: parseArgs(newServer.args),
      env: parseEnv(newServer.env),
      alwaysAllow: parseAlwaysAllow(newServer.alwaysAllow),
      enabled: true,
      description: newServer.description
    }

    setServers([...servers, server])
    setNewServer({ name: '', command: 'npx', args: '', env: '', alwaysAllow: '', description: '' })
    setIsAdding(false)
  }

  const handleDelete = (id: string) => {
    setServers(servers.filter((s) => s.id !== id))
  }

  const handleToggle = (id: string) => {
    setServers(
      servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    )
  }

  const handleSave = () => {
    updateConfig({ mcpServers: servers })
  }

  const handleTest = async (server: MCPServerConfig) => {
    setTesting(server.id)
    setTestResult(null)

    try {
      const tools = await mcpService.fetchTools(server)
      setTestResult({
        id: server.id,
        success: true,
        message: `成功！发现 ${tools.length} 个工具`
      })
    } catch (error) {
      setTestResult({
        id: server.id,
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      })
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">MCP 配置</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 mb-2">
          配置 MCP（Model Context Protocol）服务器，通过子进程 stdio 通信。
          <br />
          例如：<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">npx -y @upstash/context7-mcp</code>
        </p>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus size={14} /> 添加服务器
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {/* 添加表单 */}
        {isAdding && (
          <div className="p-3 border border-primary-200 dark:border-primary-800 rounded-lg bg-primary-50 dark:bg-primary-950/20 space-y-2">
            <input
              type="text"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              placeholder="服务器名称（如 context7）"
              className="w-full px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <input
              type="text"
              value={newServer.command}
              onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
              placeholder="命令（如 npx、node、python）"
              className="w-full px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <textarea
              value={newServer.args}
              onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
              placeholder={"参数（每行一个）\n例如：\n-y\n@upstash/context7-mcp"}
              rows={3}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y font-mono"
            />
            <textarea
              value={newServer.env}
              onChange={(e) => setNewServer({ ...newServer, env: e.target.value })}
              placeholder={"环境变量（KEY=VALUE 每行一个，可选）\n例如：\nDEFAULT_MINIMUM_TOKENS=10000"}
              rows={2}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y font-mono"
            />
            <input
              type="text"
              value={newServer.alwaysAllow}
              onChange={(e) => setNewServer({ ...newServer, alwaysAllow: e.target.value })}
              placeholder="自动允许的工具（逗号分隔，可选，如 query-docs, resolve-library-id）"
              className="w-full px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <input
              type="text"
              value={newServer.description}
              onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
              placeholder="描述（可选）"
              className="w-full px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!newServer.name.trim() || !newServer.command.trim()}
                className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50"
              >
                添加
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 服务器列表 */}
        {servers.length === 0 && !isAdding ? (
          <div className="text-center text-gray-400 py-8">
            <Server size={36} className="mx-auto mb-3" />
            <p>暂无 MCP 服务器</p>
            <p className="text-sm mt-1">点击"添加服务器"开始配置</p>
          </div>
        ) : (
          servers.map((server) => (
            <div
              key={server.id}
              className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Server size={14} className="text-gray-400" />
                    <span className="text-sm font-medium">{server.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
                    {server.command} {server.args.join(' ')}
                  </p>
                  {server.env && Object.keys(server.env).length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      环境变量: {Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join(', ')}
                    </p>
                  )}
                  {server.alwaysAllow && server.alwaysAllow.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      自动允许: {server.alwaysAllow.join(', ')}
                    </p>
                  )}
                  {server.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{server.description}</p>
                  )}
                  {/* 测试结果 */}
                  {testResult?.id === server.id && (
                    <p
                      className={`text-xs mt-1 ${
                        testResult.success ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {testResult.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleTest(server)}
                    disabled={testing === server.id}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                    title="测试连接"
                  >
                    <RefreshCw
                      size={14}
                      className={testing === server.id ? 'animate-spin' : ''}
                    />
                  </button>
                  <button
                    onClick={() => handleToggle(server.id)}
                    className="text-gray-500"
                  >
                    {server.enabled ? (
                      <ToggleRight size={18} className="text-primary-500" />
                    ) : (
                      <ToggleLeft size={18} />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部保存按钮 */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
        >
          <Save size={14} /> 保存配置
        </button>
      </div>
    </div>
  )
}
