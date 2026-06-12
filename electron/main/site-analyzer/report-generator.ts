/**
 * 报告生成服务
 * 生成自包含的交互式HTML报告
 */

import type {
  SiteAnalyzerResult,
  FunctionModule,
  ApiInterface,
  CapturedRequest
} from './types'

export class ReportGenerator {
  /**
   * 生成HTML报告
   */
  generateReport(result: SiteAnalyzerResult): string {
    const modules = result.modules
    const apis = result.apis
    const requests = result.requests
    const pages = result.pages

    const duration = result.endTime
      ? Math.round((result.endTime - result.startTime) / 1000)
      : 0

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>网站分析报告 - ${this.escapeHtml(result.targetUrl)}</title>
<style>
${this.getStyles()}
</style>
</head>
<body>
<div id="app">
  <header class="header">
    <div class="header-content">
      <h1>🔍 网站功能分析报告</h1>
      <div class="header-meta">
        <span class="badge">目标: ${this.escapeHtml(result.targetUrl)}</span>
        <span class="badge">页面: ${pages.length}</span>
        <span class="badge">API: ${apis.length}</span>
        <span class="badge">模块: ${modules.length}</span>
        <span class="badge">耗时: ${duration}秒</span>
        <span class="badge">${new Date(result.startTime).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  </header>

  <nav class="tabs">
    <button class="tab active" onclick="switchTab('modules')">📋 功能模块</button>
    <button class="tab" onclick="switchTab('apis')">🔌 API接口</button>
    <button class="tab" onclick="switchTab('pages')">📄 页面列表</button>
    <button class="tab" onclick="switchTab('requests')">🌐 网络请求</button>
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="搜索..." oninput="filterContent()">
    </div>
    <div class="export-btns">
      <button onclick="exportJSON()">导出JSON</button>
      <button onclick="exportMarkdown()">导出Markdown</button>
    </div>
  </nav>

  <main class="main">
    <!-- 功能模块 -->
    <section id="tab-modules" class="tab-content active">
      <h2>功能模块 (${modules.length})</h2>
      <div class="module-grid">
        ${modules.map((m, i) => this.renderModule(m, i, apis)).join('\n')}
      </div>
    </section>

    <!-- API接口 -->
    <section id="tab-apis" class="tab-content">
      <h2>API接口 (${apis.length})</h2>
      <div class="api-filters">
        <select id="methodFilter" onchange="filterAPIs()">
          <option value="">全部方法</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      <div class="api-list">
        ${apis.map((a, i) => this.renderApi(a, i)).join('\n')}
      </div>
    </section>

    <!-- 页面列表 -->
    <section id="tab-pages" class="tab-content">
      <h2>爬取页面 (${pages.length})</h2>
      <div class="page-list">
        ${pages.map((p, i) => this.renderPage(p, i)).join('\n')}
      </div>
    </section>

    <!-- 网络请求 -->
    <section id="tab-requests" class="tab-content">
      <h2>网络请求 (${requests.length})</h2>
      <div class="request-list">
        ${requests.filter(r => r.isApiRequest).slice(0, 200).map((r, i) => this.renderRequest(r, i)).join('\n')}
      </div>
    </section>
  </main>

  <!-- 详情弹窗 -->
  <div id="modal" class="modal" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div id="modal-body"></div>
    </div>
  </div>
</div>

<script>
${this.getScripts(result)}
</script>
</body>
</html>`
  }

  /**
   * 渲染功能模块卡片
   */
  private renderModule(mod: FunctionModule, index: number, apis: ApiInterface[]): string {
    const relatedApis = apis.filter((a) => mod.interfaces.includes(a.url))
    const categoryIcon = this.getCategoryIcon(mod.category || '')

    return `
    <div class="module-card" data-search="${this.escapeHtml(mod.name)} ${this.escapeHtml(mod.description)} ${this.escapeHtml(mod.category || '')}">
      <div class="module-header">
        <span class="module-icon">${categoryIcon}</span>
        <h3>${this.escapeHtml(mod.name)}</h3>
        ${mod.confidence ? `<span class="confidence">置信度: ${Math.round(mod.confidence * 100)}%</span>` : ''}
      </div>
      <p class="module-desc">${this.escapeHtml(mod.description)}</p>
      <div class="module-meta">
        <span>📄 页面: ${mod.pages.length}</span>
        <span>🔌 API: ${relatedApis.length}</span>
        ${mod.category ? `<span class="category-tag">${this.escapeHtml(mod.category)}</span>` : ''}
      </div>
      ${relatedApis.length > 0 ? `
      <div class="module-apis">
        <strong>关联API:</strong>
        ${relatedApis.slice(0, 5).map((a) => `<code class="api-link" onclick="showApiDetail('${this.escapeHtml(a.url)}')">${a.method} ${this.truncateUrl(a.url)}</code>`).join('')}
        ${relatedApis.length > 5 ? `<span class="more">+${relatedApis.length - 5} 更多</span>` : ''}
      </div>` : ''}
    </div>`
  }

  /**
   * 渲染API接口卡片
   */
  private renderApi(api: ApiInterface, index: number): string {
    const methodClass = api.method.toLowerCase()
    return `
    <div class="api-card" data-method="${api.method}" data-search="${this.escapeHtml(api.url)} ${this.escapeHtml(api.description)} ${api.method}">
      <div class="api-header">
        <span class="method-badge ${methodClass}">${api.method}</span>
        <span class="api-url" title="${this.escapeHtml(api.url)}">${this.truncateUrl(api.url)}</span>
        ${api.frequency ? `<span class="freq">调用${api.frequency}次</span>` : ''}
      </div>
      <p class="api-desc">${this.escapeHtml(api.description)}</p>
      ${api.params && api.params.length > 0 ? `
      <div class="api-params">
        <strong>参数:</strong>
        <table class="params-table">
          <thead><tr><th>名称</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
          <tbody>
            ${api.params.map((p) => `<tr>
              <td><code>${this.escapeHtml(p.name)}</code></td>
              <td>${this.escapeHtml(p.type)}</td>
              <td>${p.required ? '✅' : '❌'}</td>
              <td>${this.escapeHtml(p.description || '-')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
      <button class="detail-btn" onclick='showApiDetailFull(${JSON.stringify(api).replace(/'/g, "'")})'>查看详情</button>
    </div>`
  }

  /**
   * 渲染页面列表项
   */
  private renderPage(page: { url: string; title?: string; pageType?: string; depth: number }, index: number): string {
    return `
    <div class="page-item" data-search="${this.escapeHtml(page.url)} ${this.escapeHtml(page.title || '')}">
      <span class="page-type">${page.pageType || '其他'}</span>
      <span class="page-title">${this.escapeHtml(page.title || page.url)}</span>
      <span class="page-url">${this.truncateUrl(page.url)}</span>
      <span class="page-depth">深度: ${page.depth}</span>
    </div>`
  }

  /**
   * 渲染网络请求项
   */
  private renderRequest(req: CapturedRequest, index: number): string {
    const methodClass = req.method.toLowerCase()
    return `
    <div class="request-item" data-method="${req.method}" data-search="${this.escapeHtml(req.url)} ${req.method}">
      <span class="method-badge ${methodClass}">${req.method}</span>
      <span class="status-badge status-${Math.floor(req.statusCode / 100)}xx">${req.statusCode}</span>
      <span class="request-url">${this.truncateUrl(req.url)}</span>
      ${req.duration ? `<span class="request-duration">${req.duration}ms</span>` : ''}
      <button class="detail-btn small" onclick='showRequestDetail(${JSON.stringify({
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body?.substring(0, 500),
        statusCode: req.statusCode,
        response: req.response?.substring(0, 1000)
      }).replace(/'/g, "'")})'>详情</button>
    </div>`
  }

  /**
   * 获取分类图标
   */
  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      '认证': '🔐',
      '搜索': '🔍',
      '数据展示': '📊',
      '表单': '📝',
      '导航': '🧭',
      '用户': '👤',
      '设置': '⚙️',
      '文件': '📁',
      '支付': '💳',
      '消息': '💬',
      '评论': '💭',
      '分享': '🔗'
    }
    for (const [key, icon] of Object.entries(icons)) {
      if (category.includes(key)) return icon
    }
    return '📦'
  }

  /**
   * 截断URL显示
   */
  private truncateUrl(url: string, maxLen = 60): string {
    if (url.length <= maxLen) return this.escapeHtml(url)
    try {
      const u = new URL(url)
      const path = u.pathname + u.search
      if (path.length > maxLen - 20) {
        return this.escapeHtml(u.origin + path.substring(0, maxLen - 20) + '...')
      }
      return this.escapeHtml(url)
    } catch {
      return this.escapeHtml(url.substring(0, maxLen) + '...')
    }
  }

  /**
   * HTML转义
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;')
  }

  /**
   * 获取CSS样式
   */
  private getStyles(): string {
    return `
:root {
  --bg: #0f172a;
  --bg-card: #1e293b;
  --bg-hover: #334155;
  --text: #e2e8f0;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --green: #22c55e;
  --yellow: #eab308;
  --red: #ef4444;
  --orange: #f97316;
  --purple: #a855f7;
  --border: #334155;
  --radius: 8px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.header { background: linear-gradient(135deg, #1e3a5f, #2d1b69); padding: 24px 32px; border-bottom: 1px solid var(--border); }
.header-content h1 { font-size: 24px; margin-bottom: 12px; }
.header-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 20px; font-size: 13px; }
.tabs { display: flex; align-items: center; gap: 4px; padding: 12px 32px; background: var(--bg-card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.tab { padding: 8px 16px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; border-radius: var(--radius); font-size: 14px; transition: all 0.2s; }
.tab:hover { background: var(--bg-hover); color: var(--text); }
.tab.active { background: var(--accent); color: white; }
.search-box { margin-left: auto; }
.search-box input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: var(--radius); width: 200px; font-size: 13px; }
.export-btns { display: flex; gap: 4px; margin-left: 8px; }
.export-btns button { padding: 6px 12px; border: 1px solid var(--border); background: var(--bg); color: var(--text-secondary); border-radius: var(--radius); cursor: pointer; font-size: 12px; transition: all 0.2s; }
.export-btns button:hover { background: var(--accent); color: white; border-color: var(--accent); }
.main { padding: 24px 32px; max-width: 1400px; margin: 0 auto; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.tab-content h2 { margin-bottom: 20px; font-size: 20px; }
.module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
.module-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; transition: all 0.2s; }
.module-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.module-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.module-header h3 { font-size: 16px; flex: 1; }
.module-icon { font-size: 20px; }
.confidence { font-size: 12px; color: var(--green); background: rgba(34,197,94,0.1); padding: 2px 8px; border-radius: 12px; }
.module-desc { color: var(--text-secondary); font-size: 14px; margin-bottom: 12px; }
.module-meta { display: flex; gap: 12px; font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.category-tag { background: var(--purple); color: white; padding: 1px 8px; border-radius: 10px; font-size: 11px; }
.module-apis { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 13px; }
.module-apis strong { color: var(--text-secondary); display: block; margin-bottom: 6px; }
.api-link { background: var(--bg); padding: 2px 8px; border-radius: 4px; margin: 2px 4px 2px 0; display: inline-block; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.api-link:hover { background: var(--accent); color: white; }
.more { color: var(--text-secondary); font-size: 12px; }
.api-list { display: flex; flex-direction: column; gap: 12px; }
.api-filters { margin-bottom: 16px; display: flex; gap: 8px; }
.api-filters select { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: var(--radius); font-size: 13px; }
.api-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; transition: all 0.2s; }
.api-card:hover { border-color: var(--accent); }
.api-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.method-badge { padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; min-width: 60px; text-align: center; }
.method-badge.get { background: rgba(34,197,94,0.2); color: var(--green); }
.method-badge.post { background: rgba(59,130,246,0.2); color: var(--accent); }
.method-badge.put { background: rgba(234,179,8,0.2); color: var(--yellow); }
.method-badge.delete { background: rgba(239,68,68,0.2); color: var(--red); }
.method-badge.ws { background: rgba(168,85,247,0.2); color: var(--purple); }
.api-url { font-family: 'Courier New', monospace; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.freq { font-size: 12px; color: var(--text-secondary); background: var(--bg); padding: 2px 8px; border-radius: 10px; }
.api-desc { color: var(--text-secondary); font-size: 14px; margin-bottom: 8px; }
.api-params { margin-top: 8px; }
.api-params strong { font-size: 13px; color: var(--text-secondary); }
.params-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
.params-table th { text-align: left; padding: 6px 12px; background: var(--bg); color: var(--text-secondary); font-weight: 500; }
.params-table td { padding: 6px 12px; border-top: 1px solid var(--border); }
.params-table code { background: var(--bg); padding: 1px 6px; border-radius: 3px; font-size: 12px; }
.detail-btn { margin-top: 12px; padding: 6px 16px; background: var(--bg); border: 1px solid var(--border); color: var(--text-secondary); border-radius: var(--radius); cursor: pointer; font-size: 13px; transition: all 0.2s; }
.detail-btn:hover { background: var(--accent); color: white; border-color: var(--accent); }
.detail-btn.small { padding: 4px 10px; font-size: 12px; margin-top: 0; }
.page-list { display: flex; flex-direction: column; gap: 8px; }
.page-item { display: flex; align-items: center; gap: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; font-size: 13px; }
.page-type { background: var(--accent); color: white; padding: 2px 10px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
.page-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-url { color: var(--text-secondary); font-family: monospace; font-size: 12px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-depth { color: var(--text-secondary); font-size: 12px; white-space: nowrap; }
.request-list { display: flex; flex-direction: column; gap: 6px; }
.request-item { display: flex; align-items: center; gap: 10px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; font-size: 13px; }
.status-badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; min-width: 40px; text-align: center; }
.status-2xx { background: rgba(34,197,94,0.2); color: var(--green); }
.status-3xx { background: rgba(234,179,8,0.2); color: var(--yellow); }
.status-4xx { background: rgba(249,115,22,0.2); color: var(--orange); }
.status-5xx { background: rgba(239,68,68,0.2); color: var(--red); }
.request-url { flex: 1; font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.request-duration { color: var(--text-secondary); font-size: 12px; white-space: nowrap; }
.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 100; justify-content: center; align-items: center; }
.modal.active { display: flex; }
.modal-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto; position: relative; }
.modal-close { position: absolute; top: 12px; right: 16px; background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer; }
.modal-content h3 { margin-bottom: 16px; }
.modal-content pre { background: var(--bg); padding: 12px; border-radius: var(--radius); overflow-x: auto; font-size: 13px; margin: 8px 0; white-space: pre-wrap; word-break: break-all; }
.modal-content .label { color: var(--text-secondary); font-size: 13px; margin-top: 12px; margin-bottom: 4px; }
`
  }

  /**
   * 获取JavaScript
   */
  private getScripts(result: SiteAnalyzerResult): string {
    return `
const reportData = ${JSON.stringify({
  modules: result.modules,
  apis: result.apis,
  pages: result.pages.map(p => ({ url: p.url, title: p.title, pageType: p.pageType, depth: p.depth })),
  requests: result.requests.filter(r => r.isApiRequest).map(r => ({
    url: r.url, method: r.method, statusCode: r.statusCode, duration: r.duration,
    headers: r.headers, body: r.body?.substring(0, 500), response: r.response?.substring(0, 1000)
  }))
}, null, 0)};

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('searchInput').value = '';
  filterContent();
}

function filterContent() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  document.querySelectorAll('[data-search]').forEach(el => {
    const text = el.getAttribute('data-search').toLowerCase();
    el.style.display = (!query || text.includes(query)) ? '' : 'none';
  });
}

function filterAPIs() {
  const method = document.getElementById('methodFilter').value;
  document.querySelectorAll('.api-card').forEach(card => {
    if (!method || card.dataset.method === method) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function showApiDetail(url) {
  const api = reportData.apis.find(a => a.url === url);
  if (api) showApiDetailFull(api);
}

function showApiDetailFull(api) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  body.innerHTML = '<h3>' + api.method + ' ' + api.url + '</h3>' +
    '<p class="label">描述</p><p>' + (api.description || '-') + '</p>' +
    (api.params && api.params.length > 0 ?
      '<p class="label">参数</p><pre>' + JSON.stringify(api.params, null, 2) + '</pre>' : '') +
    (api.returnValue ? '<p class="label">返回值</p><pre>' + api.returnValue + '</pre>' : '') +
    (api.exampleBody ? '<p class="label">示例请求体</p><pre>' + api.exampleBody + '</pre>' : '') +
    (api.exampleResponse ? '<p class="label">示例响应</p><pre>' + api.exampleResponse + '</pre>' : '');
  modal.classList.add('active');
}

function showRequestDetail(req) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  body.innerHTML = '<h3>' + req.method + ' ' + req.url + '</h3>' +
    '<p class="label">状态码: ' + req.statusCode + '</p>' +
    (req.headers ? '<p class="label">请求头</p><pre>' + JSON.stringify(req.headers, null, 2) + '</pre>' : '') +
    (req.body ? '<p class="label">请求体</p><pre>' + req.body + '</pre>' : '') +
    (req.response ? '<p class="label">响应</p><pre>' + req.response + '</pre>' : '');
  modal.classList.add('active');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal')) {
    document.getElementById('modal').classList.remove('active');
  }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function exportJSON() {
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-analysis-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

function exportMarkdown() {
  let md = '# 网站功能分析报告\\n\\n';
  md += '- 目标: ${result.targetUrl}\\n';
  md += '- 页面数: ${result.pages.length}\\n';
  md += '- API数: ${result.apis.length}\\n';
  md += '- 模块数: ${result.modules.length}\\n\\n';
  md += '## 功能模块\\n\\n';
  reportData.modules.forEach(m => {
    md += '### ' + m.name + '\\n' + m.description + '\\n\\n';
    if (m.category) md += '类别: ' + m.category + '\\n';
    md += '页面: ' + m.pages.length + ', API: ' + m.interfaces.length + '\\n\\n';
  });
  md += '## API接口\\n\\n';
  reportData.apis.forEach(a => {
    md += '### ' + a.method + ' ' + a.url + '\\n' + a.description + '\\n\\n';
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-analysis-' + new Date().toISOString().slice(0, 10) + '.md';
  a.click();
}
`
  }
}
