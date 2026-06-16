/**
 * 报告生成服务（v2 - 前端开发者视角）
 * 以页面为核心，展示UI组件树和接口映射
 * 生成自包含的交互式HTML报告
 */

import type {
  SiteAnalyzerResult,
  FunctionModule,
  ApiInterface,
  CapturedRequest,
  PageAnalysis,
  UIComponent,
  SharedComponent,
  SharedApi,
  UIComponentType,
  SitePage,
  PageStructure,
  TableStructure,
  FormStructure,
  SidebarMenuItem
} from './types'

/** UI组件类型对应的图标和中文名 */
const COMPONENT_META: Record<string, { icon: string; label: string }> = {
  table: { icon: '📊', label: '表格' },
  form: { icon: '📝', label: '表单' },
  input: { icon: '✏️', label: '输入框' },
  select: { icon: '📋', label: '下拉选择' },
  datepicker: { icon: '📅', label: '日期选择' },
  modal: { icon: '💬', label: '弹窗' },
  drawer: { icon: '📂', label: '抽屉' },
  tabs: { icon: '📑', label: '标签页' },
  tree: { icon: '🌳', label: '树形' },
  upload: { icon: '📤', label: '上传' },
  chart: { icon: '📈', label: '图表' },
  menu: { icon: '🧭', label: '菜单' },
  breadcrumb: { icon: '🔗', label: '面包屑' },
  pagination: { icon: '📄', label: '分页' },
  search: { icon: '🔍', label: '搜索' },
  button: { icon: '🔘', label: '按钮' },
  card: { icon: '🃏', label: '卡片' },
  list: { icon: '📃', label: '列表' },
  dropdown: { icon: '⬇️', label: '下拉菜单' },
  steps: { icon: '🚶', label: '步骤条' },
  transfer: { icon: '↔️', label: '穿梭框' },
  editor: { icon: '🖊️', label: '编辑器' },
  switch: { icon: '🔀', label: '开关' },
  radio: { icon: '⭕', label: '单选' }, 
  checkbox: { icon: '☑️', label: '多选' },
  tag: { icon: '🏷️', label: '标签' },
  tooltip: { icon: '💡', label: '提示' },
  popover: { icon: '🗯️', label: '气泡卡片' },
  other: { icon: '📦', label: '其他' }
}

export class ReportGenerator {
  /**
   * 生成HTML报告
   */
  generateReport(result: SiteAnalyzerResult): string {
    const pageAnalyses = result.pageAnalyses || []
    const sharedComponents = result.sharedComponents || []
    const sharedApis = result.sharedApis || []
    const modules = result.modules
    const apis = result.apis
    const requests = result.requests
    const pages = result.pages

    const duration = result.endTime
      ? Math.round((result.endTime - result.startTime) / 1000)
      : 0

    // 统计总组件数
    const totalComponents = pageAnalyses.reduce((sum, pa) => {
      const countComponents = (comps: UIComponent[]): number =>
        comps.reduce((s, c) => s + 1 + (c.children ? countComponents(c.children) : 0), 0)
      return sum + countComponents(pa.components)
    }, 0)

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>前端分析报告 - ${this.escapeHtml(result.targetUrl)}</title>
<style>
${this.getStyles()}
</style>
</head>
<body>
<div id="app">
  <header class="header">
    <div class="header-content">
      <h1>🔍 网站前端分析报告</h1>
      <div class="header-meta">
        <span class="badge">🎯 ${this.escapeHtml(result.targetUrl)}</span>
        <span class="badge">📄 ${pageAnalyses.length} 页面</span>
        <span class="badge">🧩 ${totalComponents} 组件</span>
        <span class="badge">🔗 ${sharedComponents.length} 公共组件</span>
        <span class="badge">🔌 ${sharedApis.length} 公用接口</span>
        <span class="badge">⏱️ ${duration}秒</span>
        <span class="badge">${new Date(result.startTime).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  </header>

  <nav class="tabs">
    <button class="tab active" onclick="switchTab('pages')">📄 页面分析</button>
    <button class="tab" onclick="switchTab('shared-components')">🧩 公共组件</button>
    <button class="tab" onclick="switchTab('shared-apis')">🔌 公用接口</button>
    <button class="tab" onclick="switchTab('modules')">📋 功能模块</button>
    <button class="tab" onclick="switchTab('overview')">📊 总览</button>
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="搜索..." oninput="filterContent()">
    </div>
    <div class="export-btns">
      <button onclick="exportJSON()">导出JSON</button>
      <button onclick="exportMarkdown()">导出Markdown</button>
    </div>
  </nav>

  <main class="main">
    <!-- 页面分析（主视图） -->
    <section id="tab-pages" class="tab-content active">
      <h2>📄 页面分析 (${pageAnalyses.length})</h2>
      <div class="page-filters">
        <select id="pageTypeFilter" onchange="filterPages()">
          <option value="">全部类型</option>
          ${this.getPageTypeOptions(pageAnalyses)}
        </select>
      </div>
      <div class="page-analysis-list">
        ${pageAnalyses.map((pa, i) => this.renderPageAnalysis(pa, i, apis, pages)).join('\n')}
      </div>
    </section>

    <!-- 公共组件 -->
    <section id="tab-shared-components" class="tab-content">
      <h2>🧩 公共组件 (${sharedComponents.length})</h2>
      <p class="section-desc">以下组件在多个页面中被共同使用，建议封装为全局公共组件</p>
      <div class="shared-list">
        ${sharedComponents.map((sc, i) => this.renderSharedComponent(sc, i)).join('\n')}
      </div>
    </section>

    <!-- 公用接口 -->
    <section id="tab-shared-apis" class="tab-content">
      <h2>🔌 公用接口 (${sharedApis.length})</h2>
      <p class="section-desc">以下API接口被多个页面共同调用，建议统一封装为公共服务</p>
      <div class="shared-list">
        ${sharedApis.map((sa, i) => this.renderSharedApi(sa, i, apis)).join('\n')}
      </div>
    </section>

    <!-- 功能模块（保留向后兼容） -->
    <section id="tab-modules" class="tab-content">
      <h2>📋 功能模块 (${modules.length})</h2>
      <div class="module-grid">
        ${modules.map((m, i) => this.renderModule(m, i, apis)).join('\n')}
      </div>
    </section>

    <!-- 总览 -->
    <section id="tab-overview" class="tab-content">
      <h2>📊 总览</h2>
      ${this.renderOverview(result, pageAnalyses, sharedComponents, sharedApis)}
    </section>
  </main>

  <!-- 详情弹窗 -->
  <div id="modal" class="modal" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div id="modal-body"></div>
    </div>
  </div>

  <!-- 截图放大弹窗 -->
  <div id="screenshotModal" class="screenshot-modal" onclick="closeScreenshotModal()">
    <img id="screenshotModalImg" src="" alt="截图预览" />
  </div>
</div>

<script>
${this.getScripts(result, pageAnalyses, sharedComponents, sharedApis)}
</script>
</body>
</html>`
  }

  // ==================== 页面分析渲染 ====================

  /**
   * 渲染页面截图区域
   */
  private renderPageScreenshot(screenshot: string, title: string): string {
    return `
      <div class="page-screenshot-section">
        <h4>📸 页面截图</h4>
        <div class="screenshot-container">
          <img class="screenshot-thumb" src="data:image/png;base64,${screenshot}" alt="${this.escapeHtml(title)}" onclick="openScreenshotModal(this)" />
          <div class="screenshot-hint">点击放大</div>
        </div>
      </div>`
  }

  /**
   * 渲染侧边栏导航上下文
   */
  private renderSidebarContext(sidebar: NonNullable<PageStructure['sidebar']>): string {
    const renderMenuItems = (items: SidebarMenuItem[], level = 0): string => {
      return items.map(item => {
        const indent = level * 16
        const activeClass = item.isActive ? 'sidebar-active' : ''
        const prefix = level > 0 ? '<span class="sidebar-arrow">└</span>' : ''
        const childrenHtml = item.children ? renderMenuItems(item.children, level + 1) : ''
        return `<div class="sidebar-menu-item ${activeClass}" style="padding-left: ${indent + 8}px">
          ${prefix}<span class="sidebar-icon">${item.isActive ? '📌' : '📄'}</span>
          <span class="sidebar-text">${this.escapeHtml(item.text)}</span>
          ${item.isActive ? '<span class="sidebar-badge">当前</span>' : ''}
        </div>${childrenHtml}`
      }).join('')
    }

    return `
      <div class="sidebar-context-section">
        <h4>🧭 导航上下文</h4>
        ${sidebar.activeItem ? `<div class="sidebar-active-info">当前页面：<strong>${this.escapeHtml(sidebar.activeItem)}</strong></div>` : ''}
        <div class="sidebar-menu-tree">
          ${renderMenuItems(sidebar.items)}
        </div>
      </div>`
  }

  /**
   * 渲染表格结构详情
   */
  private renderTableStructures(tables: TableStructure[]): string {
    if (tables.length === 0) return ''

    return `
      <div class="structure-section">
        <h4>📊 数据表格详情 (${tables.length})</h4>
        ${tables.map((t, i) => `
        <div class="structure-card">
          <div class="structure-card-header">
            <span class="structure-badge table-badge">表格 ${i + 1}</span>
            ${t.title ? `<span class="structure-title">${this.escapeHtml(t.title)}</span>` : ''}
          </div>
          <table class="detail-table">
            <tbody>
              <tr><td class="detail-label">列定义</td><td class="detail-value"><div class="column-tags">${t.columns.map(c => `<span class="column-tag">${this.escapeHtml(c)}</span>`).join('')}</div></td></tr>
              <tr><td class="detail-label">数据行数</td><td class="detail-value"><span class="num-badge">${t.rowCount}</span></td></tr>
              ${t.hasCheckbox ? '<tr><td class="detail-label">行选择</td><td class="detail-value"><span class="feature-tag yes">☑️ 支持多选（checkbox）</span></td></tr>' : ''}
              ${t.hasIndex ? '<tr><td class="detail-label">序号列</td><td class="detail-value"><span class="feature-tag yes">✅ 自带序号</span></td></tr>' : ''}
              ${t.hasAction ? `<tr><td class="detail-label">操作列</td><td class="detail-value"><div class="action-buttons">${t.actionButtons.map(b => `<span class="action-btn-tag">${this.escapeHtml(b)}</span>`).join('')}</div></td></tr>` : ''}
              ${t.headerButtons.length > 0 ? `<tr><td class="detail-label">表头按钮</td><td class="detail-value"><div class="action-buttons">${t.headerButtons.map(b => `<span class="header-btn-tag">${this.escapeHtml(b)}</span>`).join('')}</div></td></tr>` : ''}
              ${t.hasPagination ? '<tr><td class="detail-label">分页</td><td class="detail-value"><span class="feature-tag yes">📄 支持分页</span></td></tr>' : ''}
            </tbody>
          </table>
        </div>`).join('')}
      </div>`
  }

  /**
   * 渲染表单结构详情
   */
  private renderFormStructures(forms: FormStructure[]): string {
    if (forms.length === 0) return ''

    return `
      <div class="structure-section">
        <h4>📝 表单详情 (${forms.length})</h4>
        ${forms.map((f, i) => `
        <div class="structure-card">
          <div class="structure-card-header">
            <span class="structure-badge form-badge">表单 ${i + 1}</span>
            ${f.title ? `<span class="structure-title">${this.escapeHtml(f.title)}</span>` : ''}
          </div>
          <table class="detail-table fields-table">
            <thead>
              <tr><th>字段名</th><th>类型</th><th>必填</th><th>占位提示</th><th>选项</th></tr>
            </thead>
            <tbody>
              ${f.fields.map(field => `<tr>
                <td><strong>${this.escapeHtml(field.label)}</strong></td>
                <td><span class="field-type-badge">${this.escapeHtml(field.type)}</span></td>
                <td>${field.required ? '<span class="required-yes">✅ 必填</span>' : '<span class="required-no">选填</span>'}</td>
                <td>${field.placeholder ? `<span class="placeholder-text">${this.escapeHtml(field.placeholder)}</span>` : '-'}</td>
                <td>${field.options && field.options.length > 0 ? `<div class="option-tags">${field.options.slice(0, 8).map(o => `<span class="option-tag">${this.escapeHtml(o)}</span>`).join('')}${field.options.length > 8 ? `<span class="option-more">+${field.options.length - 8}</span>` : ''}</div>` : '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          ${f.buttons.length > 0 ? `<div class="form-buttons-row"><strong>操作按钮：</strong>${f.buttons.map(b => `<span class="form-btn-tag">${this.escapeHtml(b)}</span>`).join('')}</div>` : ''}
        </div>`).join('')}
      </div>`
  }

  /**
   * 渲染统计卡片
   */
  private renderStatCards(statCards: Array<{ label: string; value: string }>): string {
    if (statCards.length === 0) return ''

    return `
      <div class="stat-cards-section">
        <h4>📈 统计概览</h4>
        <div class="stat-cards-grid">
          ${statCards.map(sc => `
          <div class="stat-card-item">
            <div class="stat-card-value">${this.escapeHtml(sc.value)}</div>
            <div class="stat-card-label">${this.escapeHtml(sc.label)}</div>
          </div>`).join('')}
        </div>
      </div>`
  }

  /**
   * 渲染页面头部信息
   */
  private renderPageHeader(pageHeader: NonNullable<PageStructure['pageHeader']>): string {
    const parts: string[] = []
    if (pageHeader.breadcrumbs.length > 0) {
      parts.push(`<div class="breadcrumb-path">${pageHeader.breadcrumbs.map(b => `<span class="breadcrumb-item">${this.escapeHtml(b)}</span>`).join('<span class="breadcrumb-sep">›</span>')}</div>`)
    }
    if (pageHeader.headerActions.length > 0) {
      parts.push(`<div class="header-actions"><strong>页面操作：</strong>${pageHeader.headerActions.map(a => `<span class="header-action-tag">${this.escapeHtml(a)}</span>`).join('')}</div>`)
    }
    if (parts.length === 0) return ''
    return `
      <div class="page-header-section">
        <h4>📍 页面位置</h4>
        ${parts.join('')}
      </div>`
  }

  /**
   * 渲染交互探索结果
   */
  private renderInteractionResults(results: NonNullable<import('./types').SitePage['interactionResults']>): string {
    if (results.length === 0) return ''

    return `
      <div class="interaction-section">
        <h4>🔍 交互探索结果 (${results.length})</h4>
        <div class="interaction-list">
          ${results.map((r, i) => `
          <div class="interaction-item">
            <div class="interaction-header">
              <span class="interaction-index">#${i + 1}</span>
              <span class="interaction-action">${this.escapeHtml(r.action)}</span>
              <span class="interaction-element">${this.escapeHtml(r.element)}</span>
            </div>
            <div class="interaction-result">${this.escapeHtml(r.result)}</div>
            ${r.contentSummary ? `<div class="interaction-summary">📋 ${this.escapeHtml(r.contentSummary)}</div>` : ''}
            ${r.screenshot ? `<div class="interaction-screenshot"><img src="data:image/png;base64,${r.screenshot}" alt="交互截图" onclick="openScreenshotModal(this)" /><div class="screenshot-hint">点击放大</div></div>` : ''}
          </div>`).join('')}
        </div>
      </div>`
  }

  /**
   * 渲染单个页面分析卡片（增强版 - 包含截图/侧边栏/表格/表单/交互详情）
   */
  private renderPageAnalysis(pa: PageAnalysis, index: number, apis: ApiInterface[], pages: SitePage[]): string {
    const pageTypeIcons: Record<string, string> = {
      '列表页': '📋', '详情页': '📄', '表单页': '📝', '仪表盘': '📊',
      '登录页': '🔐', '设置页': '⚙️', '注册页': '👤', '混合页': '🔀', '其他': '📦'
    }
    const typeIcon = pageTypeIcons[pa.pageType] || '📦'

    // 查找对应的 SitePage 以获取 pageStructure 和 interactionResults
    const page = pages.find(p => p.url === pa.url)
    const ps = page?.pageStructure
    const interactionResults = page?.interactionResults

    // 构建搜索索引（包含侧边栏、表格列名等以支持搜索）
    const searchParts = [pa.title, pa.url, pa.uiDescription, pa.pageType]
    if (ps?.sidebar?.activeItem) searchParts.push(ps.sidebar.activeItem)
    if (ps?.tables) ps.tables.forEach(t => searchParts.push(t.columns.join(' ')))
    if (ps?.pageHeader?.breadcrumbs) searchParts.push(ps.pageHeader.breadcrumbs.join(' '))

    return `
    <div class="page-card" data-page-type="${this.escapeHtml(pa.pageType)}" data-search="${this.escapeHtml(searchParts.join(' '))}">
      <div class="page-card-header">
        <div class="page-card-title">
          <span class="page-type-badge">${typeIcon} ${this.escapeHtml(pa.pageType)}</span>
          <h3>${this.escapeHtml(pa.title)}</h3>
          ${ps?.sidebar?.activeItem && ps.sidebar.activeItem !== pa.title ? `<span class="sidebar-name-hint">🧭 ${this.escapeHtml(ps.sidebar.activeItem)}</span>` : ''}
        </div>
        <span class="page-url">${this.truncateUrl(pa.url)}</span>
      </div>

      <div class="page-card-desc">
        <div class="desc-row"><strong>UI描述：</strong>${this.escapeHtml(pa.uiDescription)}</div>
        <div class="desc-row"><strong>布局：</strong>${this.escapeHtml(pa.layoutSummary)}</div>
      </div>

      ${page?.screenshot ? this.renderPageScreenshot(page.screenshot, pa.title) : ''}
      ${ps?.pageHeader ? this.renderPageHeader(ps.pageHeader) : ''}
      ${ps?.sidebar ? this.renderSidebarContext(ps.sidebar) : ''}
      ${ps?.statCards && ps.statCards.length > 0 ? this.renderStatCards(ps.statCards) : ''}
      ${ps?.tables && ps.tables.length > 0 ? this.renderTableStructures(ps.tables) : ''}
      ${ps?.forms && ps.forms.length > 0 ? this.renderFormStructures(ps.forms) : ''}
      ${ps?.allButtons && ps.allButtons.length > 0 ? `
      <div class="all-buttons-section">
        <h4>🔘 页面按钮 (${ps.allButtons.length})</h4>
        <div class="all-buttons-list">${ps.allButtons.map(b => `<span class="page-btn-tag">${this.escapeHtml(b)}</span>`).join('')}</div>
      </div>` : ''}

      <div class="page-card-components">
        <h4>📦 组件列表 (${this.countComponents(pa.components)})</h4>
        <div class="component-tree">
          ${pa.components.map(c => this.renderComponent(c, 0)).join('\n')}
        </div>
      </div>

      ${pa.exclusiveApis.length > 0 ? `
      <div class="page-card-apis">
        <h4>🔌 独占API (${pa.exclusiveApis.length})</h4>
        <div class="api-tags">
          ${pa.exclusiveApis.map(apiUrl => {
            const api = apis.find(a => a.url === apiUrl || apiUrl.includes(a.url))
            const method = api?.method || this.extractMethod(apiUrl)
            const methodClass = method.toLowerCase()
            return `<span class="api-tag ${methodClass}" onclick="showApiDetail('${this.escapeHtml(apiUrl)}')"><span class="method-mini ${methodClass}">${method}</span> ${this.truncateUrl(apiUrl, 50)}</span>`
          }).join('')}
        </div>
      </div>` : ''}

      ${pa.sharedComponentRefs.length > 0 ? `
      <div class="page-card-refs">
        <span class="ref-label">🧩 公共组件：</span>
        ${pa.sharedComponentRefs.map(name => `<span class="ref-tag">${this.escapeHtml(name)}</span>`).join('')}
      </div>` : ''}

      ${pa.sharedApiRefs.length > 0 ? `
      <div class="page-card-refs">
        <span class="ref-label">🔌 公用接口：</span>
        ${pa.sharedApiRefs.map(url => `<span class="ref-tag api">${this.truncateUrl(url, 40)}</span>`).join('')}
      </div>` : ''}

      ${interactionResults && interactionResults.length > 0 ? this.renderInteractionResults(interactionResults) : ''}
    </div>`
  }

  /**
   * 渲染单个UI组件（递归）
   */
  private renderComponent(comp: UIComponent, depth: number): string {
    const meta = COMPONENT_META[comp.type] || COMPONENT_META.other
    const indent = depth * 20
    const hasChildren = comp.children && comp.children.length > 0

    let actionsHtml = ''
    if (comp.actions && comp.actions.length > 0) {
      actionsHtml = `<div class="comp-actions">
        ${comp.actions.map(a => {
          const actionIcon = a.type === 'modal' ? '💬' : a.type === 'drawer' ? '📂' : a.type === 'navigate' ? '🔗' : a.type === 'download' ? '⬇️' : '⚡'
          return `<span class="action-tag" title="${this.escapeHtml(a.description)}">${actionIcon} ${this.escapeHtml(a.name)}${a.targetApi ? ` → <code>${this.escapeHtml(a.targetApi)}</code>` : ''}${a.targetComponent ? ` → ${this.escapeHtml(a.targetComponent)}` : ''}</span>`
        }).join('')}
      </div>`
    }

    let propsHtml = ''
    if (comp.props && comp.props.length > 0) {
      propsHtml = `<div class="comp-props">
        ${comp.props.map(p => `<span class="prop-tag" title="${this.escapeHtml(p.description)}"><code>${this.escapeHtml(p.name)}</code>: ${this.escapeHtml(p.type)}</span>`).join('')}
      </div>`
    }

    let apiHtml = ''
    if (comp.apiUrls && comp.apiUrls.length > 0) {
      apiHtml = `<div class="comp-apis">
        ${comp.apiUrls.map(url => {
          const method = this.extractMethod(url)
          const methodClass = method.toLowerCase()
          return `<span class="method-mini ${methodClass}">${method}</span> <code class="api-url">${this.truncateUrl(url, 50)}</code>`
        }).join(' &nbsp;')}
      </div>`
    }

    return `
    <div class="comp-item" style="margin-left: ${indent}px" data-search="${this.escapeHtml(comp.name)} ${this.escapeHtml(comp.description)} ${comp.type}">
      <div class="comp-header">
        <span class="comp-icon">${meta.icon}</span>
        <span class="comp-type-badge">${meta.label}</span>
        <span class="comp-name">${this.escapeHtml(comp.name)}</span>
        <span class="comp-desc">${this.escapeHtml(comp.description)}</span>
      </div>
      ${propsHtml}
      ${actionsHtml}
      ${apiHtml}
      ${hasChildren ? comp.children!.map(c => this.renderComponent(c, depth + 1)).join('\n') : ''}
    </div>`
  }

  // ==================== 公共组件渲染 ====================

  private renderSharedComponent(sc: SharedComponent, index: number): string {
    const meta = COMPONENT_META[sc.type] || COMPONENT_META.other

    return `
    <div class="shared-card" data-search="${this.escapeHtml(sc.name)} ${this.escapeHtml(sc.description)} ${sc.type}">
      <div class="shared-card-header">
        <span class="comp-icon">${meta.icon}</span>
        <span class="comp-type-badge">${meta.label}</span>
        <h3>${this.escapeHtml(sc.name)}</h3>
        <span class="usage-count">使用页面: ${sc.pages.length}个</span>
      </div>
      <p class="shared-desc">${this.escapeHtml(sc.description)}</p>
      ${sc.commonProps && sc.commonProps.length > 0 ? `
      <div class="shared-props">
        <strong>通用属性：</strong>
        ${sc.commonProps.map(p => `<span class="prop-tag"><code>${this.escapeHtml(p.name)}</code>: ${this.escapeHtml(p.type)}</span>`).join('')}
      </div>` : ''}
      ${sc.apiUrls.length > 0 ? `
      <div class="shared-apis">
        <strong>关联API：</strong>
        ${sc.apiUrls.map(url => `<code class="api-url">${this.truncateUrl(url, 50)}</code>`).join(' &nbsp;')}
      </div>` : ''}
      <div class="shared-pages">
        <strong>使用页面：</strong>
        ${sc.pages.map(url => `<span class="page-ref">${this.truncateUrl(url, 50)}</span>`).join('')}
      </div>
    </div>`
  }

  // ==================== 公用接口渲染 ====================

  private renderSharedApi(sa: SharedApi, index: number, apis: ApiInterface[]): string {
    const methodClass = sa.method.toLowerCase()
    // 尝试从apis中获取更详细的信息
    const detailedApi = apis.find(a => a.url === sa.url)

    return `
    <div class="shared-card api-card" data-method="${sa.method}" data-search="${this.escapeHtml(sa.url)} ${this.escapeHtml(sa.description)} ${sa.method}">
      <div class="shared-card-header">
        <span class="method-badge ${methodClass}">${sa.method}</span>
        <h3>${this.escapeHtml(sa.url)}</h3>
        <span class="usage-count">调用页面: ${sa.pages.length}个</span>
      </div>
      <p class="shared-desc">${this.escapeHtml(sa.description)}</p>
      ${(sa.params && sa.params.length > 0) || (detailedApi?.params && detailedApi.params.length > 0) ? `
      <div class="shared-params">
        <strong>参数：</strong>
        <table class="params-table">
          <thead><tr><th>名称</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
          <tbody>
            ${(sa.params || detailedApi?.params || []).map(p => `<tr>
              <td><code>${this.escapeHtml(p.name)}</code></td>
              <td>${this.escapeHtml(p.type)}</td>
              <td>${p.required ? '✅' : '❌'}</td>
              <td>${this.escapeHtml(p.description || '-')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
      ${sa.returnValue || detailedApi?.returnValue ? `
      <div class="shared-return">
        <strong>返回值：</strong><code>${this.escapeHtml(sa.returnValue || detailedApi?.returnValue || '')}</code>
      </div>` : ''}
      ${sa.exampleBody || detailedApi?.exampleBody ? `
      <div class="shared-example">
        <strong>示例请求体：</strong><pre>${this.escapeHtml(sa.exampleBody || detailedApi?.exampleBody || '')}</pre>
      </div>` : ''}
      ${sa.exampleResponse || detailedApi?.exampleResponse ? `
      <div class="shared-example">
        <strong>示例响应：</strong><pre>${this.escapeHtml((sa.exampleResponse || detailedApi?.exampleResponse || '').substring(0, 500))}</pre>
      </div>` : ''}
      <div class="shared-pages">
        <strong>调用页面：</strong>
        ${sa.pages.map(url => `<span class="page-ref">${this.truncateUrl(url, 50)}</span>`).join('')}
      </div>
    </div>`
  }

  // ==================== 功能模块渲染（保留向后兼容）====================

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

  // ==================== 总览渲染 ====================

  private renderOverview(
    result: SiteAnalyzerResult,
    pageAnalyses: PageAnalysis[],
    sharedComponents: SharedComponent[],
    sharedApis: SharedApi[]
  ): string {
    // 页面类型统计
    const pageTypeCounts = new Map<string, number>()
    for (const pa of pageAnalyses) {
      pageTypeCounts.set(pa.pageType, (pageTypeCounts.get(pa.pageType) || 0) + 1)
    }

    // 组件类型统计
    const componentTypeCounts = new Map<string, number>()
    const countCompTypes = (comps: UIComponent[]) => {
      for (const c of comps) {
        componentTypeCounts.set(c.type, (componentTypeCounts.get(c.type) || 0) + 1)
        if (c.children) countCompTypes(c.children)
      }
    }
    for (const pa of pageAnalyses) countCompTypes(pa.components)

    // 排序
    const sortedPageTypes = Array.from(pageTypeCounts.entries()).sort((a, b) => b[1] - a[1])
    const sortedCompTypes = Array.from(componentTypeCounts.entries()).sort((a, b) => b[1] - a[1])

    return `
    <div class="overview-grid">
      <div class="overview-card">
        <h3>📄 页面概览</h3>
        <div class="overview-stats">
          <div class="stat-item"><span class="stat-num">${pageAnalyses.length}</span><span class="stat-label">总页面数</span></div>
          ${sortedPageTypes.map(([type, count]) => `<div class="stat-item"><span class="stat-num">${count}</span><span class="stat-label">${type}</span></div>`).join('')}
        </div>
      </div>

      <div class="overview-card">
        <h3>🧩 组件概览</h3>
        <div class="overview-stats">
          <div class="stat-item"><span class="stat-num">${sortedCompTypes.reduce((s, [, c]) => s + c, 0)}</span><span class="stat-label">总组件数</span></div>
          ${sortedCompTypes.slice(0, 8).map(([type, count]) => {
            const meta = COMPONENT_META[type] || COMPONENT_META.other
            return `<div class="stat-item"><span class="stat-num">${count}</span><span class="stat-label">${meta.icon} ${meta.label}</span></div>`
          }).join('')}
        </div>
      </div>

      <div class="overview-card">
        <h3>🔗 公共资源</h3>
        <div class="overview-stats">
          <div class="stat-item"><span class="stat-num">${sharedComponents.length}</span><span class="stat-label">公共组件</span></div>
          <div class="stat-item"><span class="stat-num">${sharedApis.length}</span><span class="stat-label">公用接口</span></div>
        </div>
        ${sharedComponents.length > 0 ? `
        <div class="overview-detail">
          <strong>公共组件：</strong>
          ${sharedComponents.map(sc => {
            const meta = COMPONENT_META[sc.type] || COMPONENT_META.other
            return `<span class="overview-tag">${meta.icon} ${this.escapeHtml(sc.name)} (${sc.pages.length}页)</span>`
          }).join('')}
        </div>` : ''}
        ${sharedApis.length > 0 ? `
        <div class="overview-detail">
          <strong>公用接口：</strong>
          ${sharedApis.map(sa => `<span class="overview-tag api"><span class="method-mini ${sa.method.toLowerCase()}">${sa.method}</span> ${this.truncateUrl(sa.url, 30)} (${sa.pages.length}页)</span>`).join('')}
        </div>` : ''}
      </div>

      <div class="overview-card full-width">
        <h3>📋 页面-组件-接口映射表</h3>
        <table class="mapping-table">
          <thead>
            <tr><th>页面</th><th>类型</th><th>组件数</th><th>独占API</th><th>公共组件</th><th>公用接口</th></tr>
          </thead>
          <tbody>
            ${pageAnalyses.map(pa => `<tr>
              <td><strong>${this.escapeHtml(pa.title)}</strong><br><small class="page-url">${this.truncateUrl(pa.url, 40)}</small></td>
              <td><span class="page-type-badge">${this.escapeHtml(pa.pageType)}</span></td>
              <td>${this.countComponents(pa.components)}</td>
              <td>${pa.exclusiveApis.length}</td>
              <td>${pa.sharedComponentRefs.length > 0 ? pa.sharedComponentRefs.map(n => `<span class="ref-tag small">${this.escapeHtml(n)}</span>`).join('') : '-'}</td>
              <td>${pa.sharedApiRefs.length > 0 ? pa.sharedApiRefs.map(u => `<span class="ref-tag small api">${this.truncateUrl(u, 25)}</span>`).join('') : '-'}</td>
            </tr>`).join('\n')}
          </tbody>
        </table>
      </div>
    </div>`
  }

  // ==================== 辅助方法 ====================

  private countComponents(components: UIComponent[]): number {
    return components.reduce((sum, c) => sum + 1 + (c.children ? this.countComponents(c.children) : 0), 0)
  }

  private getPageTypeOptions(pageAnalyses: PageAnalysis[]): string {
    const types = new Set(pageAnalyses.map(pa => pa.pageType))
    return Array.from(types).map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('')
  }

  private extractMethod(apiUrl: string): string {
    const parts = apiUrl.split(' ')
    if (parts.length > 1 && /^(GET|POST|PUT|DELETE|PATCH)$/i.test(parts[0])) {
      return parts[0].toUpperCase()
    }
    return 'GET'
  }

  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      '认证': '🔐', '搜索': '🔍', '数据展示': '📊', '表单': '📝',
      '导航': '🧭', '用户': '👤', '设置': '⚙️', '文件': '📁',
      '支付': '💳', '消息': '💬', '评论': '💭', '分享': '🔗'
    }
    for (const [key, icon] of Object.entries(icons)) {
      if (category.includes(key)) return icon
    }
    return '📦'
  }

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

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;')
  }

  // ==================== CSS样式 ====================

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
  --cyan: #06b6d4;
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
.main { padding: 24px 32px; max-width: 1600px; margin: 0 auto; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.tab-content h2 { margin-bottom: 20px; font-size: 20px; }
.section-desc { color: var(--text-secondary); margin-bottom: 20px; font-size: 14px; }

/* 页面分析卡片 */
.page-filters { margin-bottom: 16px; display: flex; gap: 8px; }
.page-filters select { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: var(--radius); font-size: 13px; }
.page-analysis-list { display: flex; flex-direction: column; gap: 20px; }
.page-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; transition: all 0.2s; }
.page-card:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.page-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.page-card-title { display: flex; align-items: center; gap: 12px; flex: 1; }
.page-card-title h3 { font-size: 18px; }
.page-type-badge { background: var(--accent); color: white; padding: 3px 12px; border-radius: 12px; font-size: 12px; white-space: nowrap; }
.page-url { color: var(--text-secondary); font-family: monospace; font-size: 12px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-card-desc { margin-bottom: 16px; padding: 12px 16px; background: rgba(59,130,246,0.05); border-radius: var(--radius); border-left: 3px solid var(--accent); }
.desc-row { font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; }
.desc-row strong { color: var(--text); }
.page-card-components { margin-bottom: 16px; }
.page-card-components h4 { font-size: 15px; margin-bottom: 12px; color: var(--text); }
.component-tree { display: flex; flex-direction: column; gap: 4px; }
.comp-item { padding: 8px 12px; background: var(--bg); border-radius: var(--radius); border: 1px solid transparent; transition: all 0.15s; }
.comp-item:hover { border-color: var(--border); background: var(--bg-hover); }
.comp-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.comp-icon { font-size: 16px; }
.comp-type-badge { background: rgba(168,85,247,0.15); color: var(--purple); padding: 1px 8px; border-radius: 8px; font-size: 11px; font-weight: 500; }
.comp-name { font-weight: 600; font-size: 14px; }
.comp-desc { color: var(--text-secondary); font-size: 13px; }
.comp-props { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
.prop-tag { background: rgba(6,182,212,0.1); color: var(--cyan); padding: 1px 8px; border-radius: 6px; font-size: 11px; }
.prop-tag code { background: none; padding: 0; font-size: 11px; color: var(--cyan); }
.comp-actions { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
.action-tag { background: rgba(34,197,94,0.1); color: var(--green); padding: 1px 8px; border-radius: 6px; font-size: 11px; }
.action-tag code { background: rgba(59,130,246,0.2); color: var(--accent); padding: 0 4px; border-radius: 3px; font-size: 10px; }
.comp-apis { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.comp-apis .api-url { background: var(--bg-card); padding: 1px 6px; border-radius: 3px; font-size: 11px; color: var(--text-secondary); }
.method-mini { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
.method-mini.get { background: rgba(34,197,94,0.2); color: var(--green); }
.method-mini.post { background: rgba(59,130,246,0.2); color: var(--accent); }
.method-mini.put { background: rgba(234,179,8,0.2); color: var(--yellow); }
.method-mini.delete { background: rgba(239,68,68,0.2); color: var(--red); }
.page-card-apis { margin-bottom: 12px; }
.page-card-apis h4 { font-size: 14px; margin-bottom: 8px; }
.api-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.api-tag { background: var(--bg); padding: 4px 10px; border-radius: var(--radius); font-size: 12px; font-family: monospace; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
.api-tag:hover { background: var(--accent); color: white; }
.page-card-refs { margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ref-label { color: var(--text-secondary); font-size: 13px; }
.ref-tag { background: rgba(168,85,247,0.15); color: var(--purple); padding: 2px 10px; border-radius: 10px; font-size: 12px; }
.ref-tag.api { background: rgba(59,130,246,0.15); color: var(--accent); }
.ref-tag.small { padding: 1px 6px; font-size: 11px; }

/* 公共组件/公用接口卡片 */
.shared-list { display: flex; flex-direction: column; gap: 16px; }
.shared-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; transition: all 0.2s; }
.shared-card:hover { border-color: var(--accent); }
.shared-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.shared-card-header h3 { font-size: 16px; flex: 1; }
.usage-count { background: rgba(34,197,94,0.15); color: var(--green); padding: 2px 10px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
.shared-desc { color: var(--text-secondary); font-size: 14px; margin-bottom: 12px; }
.shared-props, .shared-apis, .shared-params, .shared-return, .shared-example, .shared-pages { margin-top: 8px; font-size: 13px; }
.shared-props strong, .shared-apis strong, .shared-params strong, .shared-return strong, .shared-example strong, .shared-pages strong { color: var(--text-secondary); margin-right: 8px; }
.shared-pages { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.page-ref { background: var(--bg); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; color: var(--text-secondary); }
.params-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
.params-table th { text-align: left; padding: 6px 12px; background: var(--bg); color: var(--text-secondary); font-weight: 500; }
.params-table td { padding: 6px 12px; border-top: 1px solid var(--border); }
.params-table code { background: var(--bg); padding: 1px 6px; border-radius: 3px; font-size: 12px; }
.shared-example pre { background: var(--bg); padding: 12px; border-radius: var(--radius); overflow-x: auto; font-size: 12px; margin-top: 6px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }

/* 功能模块卡片（保留） */
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
.method-badge { padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; min-width: 60px; text-align: center; }
.method-badge.get { background: rgba(34,197,94,0.2); color: var(--green); }
.method-badge.post { background: rgba(59,130,246,0.2); color: var(--accent); }
.method-badge.put { background: rgba(234,179,8,0.2); color: var(--yellow); }
.method-badge.delete { background: rgba(239,68,68,0.2); color: var(--red); }

/* 总览 */
.overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px; }
.overview-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.overview-card.full-width { grid-column: 1 / -1; }
.overview-card h3 { font-size: 16px; margin-bottom: 12px; }
.overview-stats { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-num { font-size: 24px; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 12px; color: var(--text-secondary); }
.overview-detail { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; }
.overview-detail strong { color: var(--text-secondary); margin-right: 4px; }
.overview-tag { background: var(--bg); padding: 3px 10px; border-radius: 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
.mapping-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mapping-table th { text-align: left; padding: 10px 12px; background: var(--bg); color: var(--text-secondary); font-weight: 500; }
.mapping-table td { padding: 10px 12px; border-top: 1px solid var(--border); vertical-align: top; }
.mapping-table .page-url { font-size: 11px; }

/* 弹窗 */
.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 100; justify-content: center; align-items: center; }
.modal.active { display: flex; }
.modal-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto; position: relative; }
.modal-close { position: absolute; top: 12px; right: 16px; background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer; }
.modal-content h3 { margin-bottom: 16px; }
.modal-content pre { background: var(--bg); padding: 12px; border-radius: var(--radius); overflow-x: auto; font-size: 13px; margin: 8px 0; white-space: pre-wrap; word-break: break-all; }
.modal-content .label { color: var(--text-secondary); font-size: 13px; margin-top: 12px; margin-bottom: 4px; }

/* 截图弹窗 */
.screenshot-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 200; justify-content: center; align-items: center; cursor: zoom-out; }
.screenshot-modal.active { display: flex; }
.screenshot-modal img { max-width: 95%; max-height: 95%; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }

/* 截图区域 */
.page-screenshot-section { margin-bottom: 16px; }
.page-screenshot-section h4 { font-size: 15px; margin-bottom: 8px; color: var(--text); }
.screenshot-container { position: relative; display: inline-block; cursor: zoom-in; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); }
.screenshot-thumb { max-width: 100%; max-height: 300px; display: block; object-fit: contain; background: var(--bg); }
.screenshot-hint { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px; pointer-events: none; }

/* 侧边栏导航上下文 */
.sidebar-context-section { margin-bottom: 16px; padding: 12px 16px; background: rgba(168,85,247,0.05); border-radius: var(--radius); border-left: 3px solid var(--purple); }
.sidebar-context-section h4 { font-size: 15px; margin-bottom: 8px; color: var(--text); }
.sidebar-active-info { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.sidebar-active-info strong { color: var(--purple); }
.sidebar-menu-tree { font-size: 13px; }
.sidebar-menu-item { padding: 3px 8px; border-radius: 4px; display: flex; align-items: center; gap: 4px; color: var(--text-secondary); }
.sidebar-menu-item.sidebar-active { background: rgba(168,85,247,0.15); color: var(--purple); font-weight: 600; }
.sidebar-icon { font-size: 12px; }
.sidebar-text { flex: 1; }
.sidebar-badge { background: var(--purple); color: white; font-size: 10px; padding: 1px 6px; border-radius: 8px; }
.sidebar-arrow { color: var(--text-secondary); font-size: 12px; margin-right: 2px; opacity: 0.5; }
.sidebar-name-hint { background: rgba(168,85,247,0.12); color: var(--purple); padding: 2px 10px; border-radius: 10px; font-size: 12px; white-space: nowrap; }

/* 页面头部信息 */
.page-header-section { margin-bottom: 16px; }
.page-header-section h4 { font-size: 15px; margin-bottom: 8px; color: var(--text); }
.breadcrumb-path { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.breadcrumb-item { background: var(--bg); padding: 2px 8px; border-radius: 4px; font-size: 12px; color: var(--text-secondary); }
.breadcrumb-sep { color: var(--text-secondary); font-size: 12px; opacity: 0.5; }
.header-actions { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.header-actions strong { margin-right: 4px; }
.header-action-tag { background: rgba(59,130,246,0.1); color: var(--accent); padding: 2px 8px; border-radius: 6px; font-size: 12px; margin-right: 4px; }

/* 结构化区域（表格/表单详情） */
.structure-section { margin-bottom: 16px; }
.structure-section h4 { font-size: 15px; margin-bottom: 12px; color: var(--text); }
.structure-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
.structure-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.structure-badge { padding: 2px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; }
.table-badge { background: rgba(59,130,246,0.15); color: var(--accent); }
.form-badge { background: rgba(234,179,8,0.15); color: var(--yellow); }
.structure-title { font-weight: 600; font-size: 14px; }
.detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.detail-table th { text-align: left; padding: 6px 12px; background: rgba(255,255,255,0.03); color: var(--text-secondary); font-weight: 500; border-bottom: 1px solid var(--border); }
.detail-table td { padding: 6px 12px; border-top: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
.detail-label { color: var(--text-secondary); white-space: nowrap; width: 90px; }
.detail-value { color: var(--text); }
.column-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.column-tag { background: rgba(59,130,246,0.1); color: var(--accent); padding: 1px 8px; border-radius: 4px; font-size: 12px; }
.num-badge { background: rgba(34,197,94,0.15); color: var(--green); padding: 1px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.feature-tag { font-size: 12px; }
.feature-tag.yes { color: var(--green); }
.action-buttons, .form-buttons-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.action-btn-tag { background: rgba(239,68,68,0.1); color: var(--red); padding: 1px 8px; border-radius: 4px; font-size: 12px; }
.header-btn-tag { background: rgba(34,197,94,0.1); color: var(--green); padding: 1px 8px; border-radius: 4px; font-size: 12px; }
.form-btn-tag { background: rgba(59,130,246,0.1); color: var(--accent); padding: 1px 8px; border-radius: 4px; font-size: 12px; }
.form-buttons-row { margin-top: 10px; font-size: 13px; }
.form-buttons-row strong { color: var(--text-secondary); margin-right: 4px; }
.fields-table td, .fields-table th { font-size: 12px; padding: 5px 8px; }
.field-type-badge { background: rgba(6,182,212,0.1); color: var(--cyan); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
.required-yes { color: var(--green); font-size: 12px; }
.required-no { color: var(--text-secondary); font-size: 12px; }
.placeholder-text { color: var(--text-secondary); font-size: 12px; font-style: italic; }
.option-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.option-tag { background: var(--bg-card); color: var(--text-secondary); padding: 1px 6px; border-radius: 3px; font-size: 11px; }
.option-more { color: var(--text-secondary); font-size: 11px; opacity: 0.6; }

/* 统计卡片 */
.stat-cards-section { margin-bottom: 16px; }
.stat-cards-section h4 { font-size: 15px; margin-bottom: 12px; color: var(--text); }
.stat-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.stat-card-item { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; text-align: center; transition: all 0.2s; }
.stat-card-item:hover { border-color: var(--accent); transform: translateY(-1px); }
.stat-card-value { font-size: 20px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.stat-card-label { font-size: 12px; color: var(--text-secondary); }

/* 页面所有按钮 */
.all-buttons-section { margin-bottom: 16px; }
.all-buttons-section h4 { font-size: 15px; margin-bottom: 8px; color: var(--text); }
.all-buttons-list { display: flex; flex-wrap: wrap; gap: 4px; }
.page-btn-tag { background: var(--bg); border: 1px solid var(--border); color: var(--text-secondary); padding: 2px 10px; border-radius: 6px; font-size: 12px; }

/* 交互探索结果 */
.interaction-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.interaction-section h4 { font-size: 15px; margin-bottom: 12px; color: var(--text); }
.interaction-list { display: flex; flex-direction: column; gap: 10px; }
.interaction-item { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
.interaction-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.interaction-index { background: rgba(59,130,246,0.15); color: var(--accent); padding: 1px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.interaction-action { background: rgba(34,197,94,0.1); color: var(--green); padding: 1px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; }
.interaction-element { color: var(--text-secondary); font-size: 12px; }
.interaction-result { font-size: 13px; color: var(--text); margin-bottom: 6px; }
.interaction-summary { font-size: 12px; color: var(--cyan); background: rgba(6,182,212,0.05); padding: 4px 8px; border-radius: 4px; margin-bottom: 6px; }
.interaction-screenshot { position: relative; display: inline-block; cursor: zoom-in; margin-top: 4px; }
.interaction-screenshot img { max-width: 100%; max-height: 200px; border-radius: var(--radius); border: 1px solid var(--border); display: block; }
`
  }

  // ==================== JavaScript ====================

  private getScripts(
    result: SiteAnalyzerResult,
    pageAnalyses: PageAnalysis[],
    sharedComponents: SharedComponent[],
    sharedApis: SharedApi[]
  ): string {
    return `
const reportData = ${JSON.stringify({
  pageAnalyses: pageAnalyses.map(pa => ({
    url: pa.url,
    title: pa.title,
    pageType: pa.pageType,
    uiDescription: pa.uiDescription,
    layoutSummary: pa.layoutSummary,
    components: pa.components,
    exclusiveApis: pa.exclusiveApis,
    sharedComponentRefs: pa.sharedComponentRefs,
    sharedApiRefs: pa.sharedApiRefs
  })),
  sharedComponents: sharedComponents,
  sharedApis: sharedApis,
  modules: result.modules,
  apis: result.apis,
  pages: result.pages.map(p => ({
    url: p.url, title: p.title, pageType: p.pageType, depth: p.depth,
    pageStructure: p.pageStructure,
    interactionResults: p.interactionResults?.map(r => ({ action: r.action, element: r.element, result: r.result, contentSummary: r.contentSummary }))
  })),
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

function filterPages() {
  const pageType = document.getElementById('pageTypeFilter').value;
  document.querySelectorAll('.page-card').forEach(card => {
    if (!pageType || card.dataset.pageType === pageType) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function showApiDetail(url) {
  const api = reportData.apis.find(a => a.url === url || url.includes(a.url));
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

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal')) {
    document.getElementById('modal').classList.remove('active');
  }
}

function openScreenshotModal(img) {
  const modal = document.getElementById('screenshotModal');
  const modalImg = document.getElementById('screenshotModalImg');
  modalImg.src = img.src;
  modal.classList.add('active');
}

function closeScreenshotModal() {
  document.getElementById('screenshotModal').classList.remove('active');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeScreenshotModal();
  }
});

function exportJSON() {
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-analysis-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

function exportMarkdown() {
  let md = '# 网站前端分析报告\\n\\n';
  md += '- 目标: ${result.targetUrl}\\n';
  md += '- 页面数: ${pageAnalyses.length}\\n';
  md += '- 公共组件: ${sharedComponents.length}\\n';
  md += '- 公用接口: ${sharedApis.length}\\n\\n';

  md += '## 页面分析\\n\\n';
  reportData.pageAnalyses.forEach(pa => {
    md += '### ' + pa.title + '\\n';
    md += '- 类型: ' + pa.pageType + '\\n';
    md += '- UI描述: ' + pa.uiDescription + '\\n';
    md += '- 布局: ' + pa.layoutSummary + '\\n';
    md += '- URL: ' + pa.url + '\\n\\n';
    md += '**组件列表:**\\n\\n';
    const renderComp = (comp, indent) => {
      md += indent + '- **' + comp.name + '** [' + comp.type + '] ' + comp.description + '\\n';
      if (comp.props && comp.props.length > 0) {
        md += indent + '  - 属性: ' + comp.props.map(p => p.name + '(' + p.type + ')').join(', ') + '\\n';
      }
      if (comp.actions && comp.actions.length > 0) {
        md += indent + '  - 操作: ' + comp.actions.map(a => a.name + ' → ' + (a.targetApi || a.targetComponent || '')).join(', ') + '\\n';
      }
      if (comp.apiUrls && comp.apiUrls.length > 0) {
        md += indent + '  - API: ' + comp.apiUrls.join(', ') + '\\n';
      }
      if (comp.children) comp.children.forEach(c => renderComp(c, indent + '  '));
    };
    pa.components.forEach(c => renderComp(c, ''));
    if (pa.exclusiveApis.length > 0) md += '\\n**独占API:** ' + pa.exclusiveApis.join(', ') + '\\n';
    md += '\\n---\\n\\n';
  });

  if (reportData.sharedComponents.length > 0) {
    md += '## 公共组件\\n\\n';
    reportData.sharedComponents.forEach(sc => {
      md += '### ' + sc.name + ' [' + sc.type + ']\\n';
      md += sc.description + '\\n';
      md += '使用页面: ' + sc.pages.join(', ') + '\\n\\n';
    });
  }

  if (reportData.sharedApis.length > 0) {
    md += '## 公用接口\\n\\n';
    reportData.sharedApis.forEach(sa => {
      md += '### ' + sa.method + ' ' + sa.url + '\\n';
      md += sa.description + '\\n';
      md += '调用页面: ' + sa.pages.join(', ') + '\\n\\n';
    });
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-analysis-' + new Date().toISOString().slice(0, 10) + '.md';
  a.click();
}
`
  }
}
