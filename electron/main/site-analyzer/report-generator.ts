/**
 * 报告生成服务（v3 - 侧边栏导航 + 组件下钻）
 * 左侧固定侧边栏展示页面→组件树形结构
 * 右侧内容区展示详情，支持三级下钻
 * API区分触发时机：自动加载 / 操作触发 / 级联触发
 */

import type {
  SiteAnalyzerResult,
  ApiInterface,
  PageAnalysis,
  UIComponent,
  SharedComponent,
  SharedApi
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
  radio: { icon: '🔴', label: '单选' },
  checkbox: { icon: '☑️', label: '多选' },
  tag: { icon: '🏷️', label: '标签' },
  tooltip: { icon: '💡', label: '提示' },
  popover: { icon: '🗯️', label: '气泡卡片' },
  other: { icon: '📦', label: '其他' }
}

/** API触发时机标签 */
const TRIGGER_META: Record<string, { icon: string; label: string; color: string }> = {
  auto_load: { icon: '🚀', label: '自动加载', color: '#22c55e' },
  action_trigger: { icon: '🖱️', label: '操作触发', color: '#3b82f6' },
  cascade: { icon: '🔄', label: '级联触发', color: '#f97316' }
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

    const duration = result.endTime
      ? Math.round((result.endTime - result.startTime) / 1000)
      : 0

    // 统计总组件数
    const totalComponents = pageAnalyses.reduce((sum, pa) => {
      const countComponents = (comps: UIComponent[]): number =>
        comps.reduce((s, c) => s + 1 + (c.children ? countComponents(c.children) : 0), 0)
      return sum + countComponents(pa.components)
    }, 0)

    // 生成页面的显示名称（处理同名页面）
    const pageDisplayNames = this.generatePageDisplayNames(pageAnalyses)

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
  <!-- 顶部导航栏 -->
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
      </div>
    </div>
    <div class="header-actions">
      <input type="text" id="globalSearch" placeholder="🔍 搜索组件、接口、字段..." oninput="onGlobalSearch(this.value)">
      <button onclick="exportJSON()" class="btn-export">导出JSON</button>
      <button onclick="exportMarkdown()" class="btn-export">导出Markdown</button>
    </div>
  </header>

  <div class="layout">
    <!-- 左侧边栏 -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-item overview-item active" data-view="overview" onclick="navigateTo('overview')">
          <span class="sidebar-icon">📊</span> 总览
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title" onclick="toggleSection(this)">
          <span class="arrow">▶</span> 📄 页面分析 <span class="count">${pageAnalyses.length}</span>
        </div>
        <div class="sidebar-children collapsed">
          ${pageAnalyses.map((pa, i) => this.renderSidebarPage(pa, i, pageDisplayNames[i])).join('\n')}
        </div>
      </div>

      ${sharedComponents.length > 0 ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title" onclick="toggleSection(this)">
          <span class="arrow">▶</span> 🧩 公共组件 <span class="count">${sharedComponents.length}</span>
        </div>
        <div class="sidebar-children collapsed">
          ${sharedComponents.map((sc, i) => {
            const meta = COMPONENT_META[sc.type] || COMPONENT_META.other
            return `<div class="sidebar-item comp-item" data-view="shared-comp-${i}" onclick="navigateTo('shared-comp-${i}')">
              <span class="sidebar-icon">${meta.icon}</span> ${this.escapeHtml(sc.name)}
            </div>`
          }).join('\n')}
        </div>
      </div>` : ''}

      ${sharedApis.length > 0 ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title" onclick="toggleSection(this)">
          <span class="arrow">▶</span> 🔌 公用接口 <span class="count">${sharedApis.length}</span>
        </div>
        <div class="sidebar-children collapsed">
          ${sharedApis.map((sa, i) => {
            const methodClass = sa.method.toLowerCase()
            return `<div class="sidebar-item api-item" data-view="shared-api-${i}" onclick="navigateTo('shared-api-${i}')">
              <span class="method-tag ${methodClass}">${sa.method}</span> ${this.truncateUrl(sa.url, 30)}
            </div>`
          }).join('\n')}
        </div>
      </div>` : ''}
    </aside>

    <!-- 右侧内容区 -->
    <main class="content" id="content">
      <!-- 总览（默认显示） -->
      <section id="view-overview" class="view active">
        ${this.renderOverview(result, pageAnalyses, sharedComponents, sharedApis, totalComponents)}
      </section>

      <!-- 页面详情 -->
      ${pageAnalyses.map((pa, i) => `
      <section id="view-page-${i}" class="view">
        ${this.renderPageDetail(pa, i, pageDisplayNames[i], apis)}
      </section>`).join('\n')}

      <!-- 公共组件详情 -->
      ${sharedComponents.map((sc, i) => `
      <section id="view-shared-comp-${i}" class="view">
        ${this.renderSharedComponentDetail(sc, i)}
      </section>`).join('\n')}

      <!-- 公用接口详情 -->
      ${sharedApis.map((sa, i) => `
      <section id="view-shared-api-${i}" class="view">
        ${this.renderSharedApiDetail(sa, i, apis)}
      </section>`).join('\n')}
    </main>
  </div>

  <!-- API详情弹窗 -->
  <div id="modal" class="modal" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div id="modal-body"></div>
    </div>
  </div>
</div>

<script>
${this.getScripts(result, pageAnalyses, sharedComponents, sharedApis, apis)}
</script>
</body>
</html>`
  }

  // ==================== 侧边栏渲染 ====================

  /**
   * 渲染侧边栏中的页面项及其子组件
   */
  private renderSidebarPage(pa: PageAnalysis, index: number, displayName: string): string {
    const pageTypeIcons: Record<string, string> = {
      '列表页': '📋', '详情页': '📄', '表单页': '📝', '仪表盘': '📊',
      '登录页': '🔐', '设置页': '⚙️', '注册页': '👤', '混合页': '🔀', '其他': '📦'
    }
    const typeIcon = pageTypeIcons[pa.pageType] || '📦'

    // 收集所有组件（递归）
    const collectComponents = (comps: UIComponent[], prefix: string): string[] => {
      const items: string[] = []
      comps.forEach((c, ci) => {
        const meta = COMPONENT_META[c.type] || COMPONENT_META.other
        const compId = `${prefix}-${ci}`
        items.push(`<div class="sidebar-item comp-item" data-view="page-${index}-comp-${compId}" data-comp-name="${this.escapeHtml(c.name)}" onclick="navigateTo('page-${index}', '${compId}')">
          <span class="sidebar-icon">${meta.icon}</span> ${this.escapeHtml(c.name)}
        </div>`)
        if (c.children && c.children.length > 0) {
          items.push(...collectComponents(c.children, compId))
        }
      })
      return items
    }

    const compItems = collectComponents(pa.components, 'c')

    return `
    <div class="sidebar-page-group">
      <div class="sidebar-item page-item" data-view="page-${index}" onclick="navigateTo('page-${index}')">
        <span class="sidebar-icon">${typeIcon}</span>
        <span class="page-name">${this.escapeHtml(displayName)}</span>
        <span class="page-type-mini">${this.escapeHtml(pa.pageType)}</span>
      </div>
      ${compItems.length > 0 ? `
      <div class="sidebar-comp-list">
        ${compItems.join('\n')}
      </div>` : ''}
    </div>`
  }

  // ==================== 页面详情渲染 ====================

  /**
   * 渲染页面详情（右侧内容区）
   */
  private renderPageDetail(pa: PageAnalysis, index: number, displayName: string, apis: ApiInterface[]): string {
    const pageTypeIcons: Record<string, string> = {
      '列表页': '📋', '详情页': '📄', '表单页': '📝', '仪表盘': '📊',
      '登录页': '🔐', '设置页': '⚙️', '注册页': '👤', '混合页': '🔀', '其他': '📦'
    }
    const typeIcon = pageTypeIcons[pa.pageType] || '📦'

    // 分离自动加载和操作触发的API
    const autoLoadApis: string[] = []
    const actionApis: string[] = []

    const classifyApi = (apiUrl: string) => {
      // 从组件的 triggerTiming 判断
      let timing = ''
      const findTiming = (comps: UIComponent[]) => {
        for (const c of comps) {
          if (c.apiUrls.includes(apiUrl) && c.triggerTiming) {
            timing = c.triggerTiming
            return
          }
          if (c.children) findTiming(c.children)
        }
      }
      findTiming(pa.components)

      // 从 actions 中的 targetApi 判断
      const isActionTrigger = pa.components.some(c => {
        const checkActions = (comp: UIComponent): boolean => {
          if (comp.actions?.some(a => a.targetApi && apiUrl.includes(a.targetApi.split(' ').pop() || ''))) return true
          if (comp.buttons?.some(b => b.action?.targetApi && apiUrl.includes(b.action.targetApi.split(' ').pop() || ''))) return true
          if (comp.children) return comp.children.some(checkActions)
          return false
        }
        return checkActions(c)
      })

      if (timing === 'action_trigger' || isActionTrigger) {
        actionApis.push(apiUrl)
      } else {
        autoLoadApis.push(apiUrl)
      }
    }

    pa.exclusiveApis.forEach(classifyApi)
    // 也收集组件上的API
    const allComponentApis = new Set<string>()
    const collectApis = (comps: UIComponent[]) => {
      comps.forEach(c => {
        c.apiUrls.forEach(u => allComponentApis.add(u))
        if (c.children) collectApis(c.children)
      })
    }
    collectApis(pa.components)
    allComponentApis.forEach(u => {
      if (!pa.exclusiveApis.includes(u)) classifyApi(u)
    })

    return `
    <div class="page-detail">
      <div class="page-detail-header">
        <div class="page-title-row">
          <span class="page-type-badge">${typeIcon} ${this.escapeHtml(pa.pageType)}</span>
          <h2>${this.escapeHtml(displayName)}</h2>
        </div>
        <div class="page-url">${this.escapeHtml(pa.url)}</div>
        <div class="page-desc-grid">
          <div class="desc-card">
            <div class="desc-label">UI描述</div>
            <div class="desc-value">${this.escapeHtml(pa.uiDescription)}</div>
          </div>
          <div class="desc-card">
            <div class="desc-label">布局概述</div>
            <div class="desc-value">${this.escapeHtml(pa.layoutSummary)}</div>
          </div>
        </div>
      </div>

      ${autoLoadApis.length > 0 || actionApis.length > 0 ? `
      <div class="api-summary-section">
        <h3>🔌 接口调用概览</h3>
        <div class="api-summary-grid">
          ${autoLoadApis.length > 0 ? `
          <div class="api-summary-group">
            <div class="api-summary-title"><span class="trigger-badge auto_load">🚀 自动加载</span> 页面/组件加载时自动调用</div>
            <div class="api-summary-list">
              ${autoLoadApis.map(u => {
                const method = this.extractMethod(u)
                const methodClass = method.toLowerCase()
                const url = u.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '')
                return `<div class="api-summary-item" onclick="showApiDetail('${this.escapeHtml(url)}')">
                  <span class="method-tag ${methodClass}">${method}</span>
                  <code>${this.truncateUrl(url, 60)}</code>
                </div>`
              }).join('')}
            </div>
          </div>` : ''}

          ${actionApis.length > 0 ? `
          <div class="api-summary-group">
            <div class="api-summary-title"><span class="trigger-badge action_trigger">🖱️ 操作触发</span> 用户操作后调用</div>
            <div class="api-summary-list">
              ${actionApis.map(u => {
                const method = this.extractMethod(u)
                const methodClass = method.toLowerCase()
                const url = u.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '')
                return `<div class="api-summary-item" onclick="showApiDetail('${this.escapeHtml(url)}')">
                  <span class="method-tag ${methodClass}">${method}</span>
                  <code>${this.truncateUrl(url, 60)}</code>
                </div>`
              }).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>` : ''}

      <div class="components-section">
        <h3>🧩 组件列表 (${this.countComponents(pa.components)})</h3>
        <div class="components-list">
          ${pa.components.map((c, ci) => this.renderComponentDetail(c, 0, `page-${index}-c-${ci}`)).join('\n')}
        </div>
      </div>

      ${pa.sharedComponentRefs.length > 0 || pa.sharedApiRefs.length > 0 ? `
      <div class="refs-section">
        ${pa.sharedComponentRefs.length > 0 ? `
        <div class="refs-group">
          <span class="refs-label">🧩 引用的公共组件：</span>
          ${pa.sharedComponentRefs.map(name => `<span class="ref-tag">${this.escapeHtml(name)}</span>`).join('')}
        </div>` : ''}
        ${pa.sharedApiRefs.length > 0 ? `
        <div class="refs-group">
          <span class="refs-label">🔌 引用的公用接口：</span>
          ${pa.sharedApiRefs.map(url => `<span class="ref-tag api">${this.truncateUrl(url, 40)}</span>`).join('')}
        </div>` : ''}
      </div>` : ''}
    </div>`
  }

  // ==================== 组件详情渲染 ====================

  /**
   * 渲染单个组件的详细信息（递归）
   */
  private renderComponentDetail(comp: UIComponent, depth: number, compId: string): string {
    const meta = COMPONENT_META[comp.type] || COMPONENT_META.other
    const indent = depth * 16
    const hasChildren = comp.children && comp.children.length > 0
    const hasColumns = comp.columns && comp.columns.length > 0
    const hasProps = comp.props && comp.props.length > 0
    const hasActions = comp.actions && comp.actions.length > 0
    const hasButtons = comp.buttons && comp.buttons.length > 0

    // 构建组件特性标签
    const featureTags: string[] = []
    if (comp.type === 'table') {
      if (comp.hasIndex) featureTags.push('<span class="feature-tag">✅ 有序号列</span>')
      else featureTags.push('<span class="feature-tag dim">❌ 无序号列</span>')
      if (comp.hasSelection) featureTags.push('<span class="feature-tag">✅ 可多选</span>')
      if (comp.hasPagination) featureTags.push('<span class="feature-tag">✅ 有分页</span>')
    }

    // 构建列定义表格
    let columnsHtml = ''
    if (hasColumns) {
      columnsHtml = `
      <div class="detail-block">
        <div class="detail-block-title">📋 列定义</div>
        <table class="detail-table">
          <thead><tr>
            <th>列标题</th><th>字段名</th><th>数据类型</th>
            ${comp.columns!.some(c => c.width) ? '<th>宽度</th>' : ''}
            <th>可排序</th><th>可筛选</th>
            ${comp.columns!.some(c => c.render) ? '<th>渲染方式</th>' : ''}
          </tr></thead>
          <tbody>
            ${comp.columns!.map(col => `<tr>
              <td><strong>${this.escapeHtml(col.title)}</strong></td>
              <td><code>${this.escapeHtml(col.dataIndex)}</code></td>
              <td>${this.escapeHtml(col.dataType || '-')}</td>
              ${comp.columns!.some(c => c.width) ? `<td>${this.escapeHtml(col.width || '-')}</td>` : ''}
              <td>${col.sortable ? '✅' : '❌'}</td>
              <td>${col.filterable ? '✅' : '❌'}</td>
              ${comp.columns!.some(c => c.render) ? `<td>${this.escapeHtml(col.render || '-')}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    }

    // 构建表单字段表格
    let propsHtml = ''
    if (hasProps) {
      propsHtml = `
      <div class="detail-block">
        <div class="detail-block-title">📝 字段/属性</div>
        <table class="detail-table">
          <thead><tr>
            <th>名称</th><th>类型</th><th>描述</th><th>必填</th>
            ${comp.props!.some(p => p.placeholder) ? '<th>占位符</th>' : ''}
            ${comp.props!.some(p => p.options) ? '<th>选项</th>' : ''}
            ${comp.props!.some(p => p.validation) ? '<th>校验规则</th>' : ''}
          </tr></thead>
          <tbody>
            ${comp.props!.map(p => `<tr>
              <td><code>${this.escapeHtml(p.name)}</code></td>
              <td><span class="type-tag">${this.escapeHtml(p.type)}</span></td>
              <td>${this.escapeHtml(p.description)}</td>
              <td>${p.required ? '✅' : '❌'}</td>
              ${comp.props!.some(pp => pp.placeholder) ? `<td>${this.escapeHtml(p.placeholder || '-')}</td>` : ''}
              ${comp.props!.some(pp => pp.options) ? `<td>${p.options ? p.options.map(o => `<span class="option-tag">${this.escapeHtml(o)}</span>`).join(' ') : '-'}</td>` : ''}
              ${comp.props!.some(pp => pp.validation) ? `<td>${this.escapeHtml(p.validation || '-')}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    }

    // 构建操作按钮列表
    let buttonsHtml = ''
    if (hasButtons) {
      buttonsHtml = `
      <div class="detail-block">
        <div class="detail-block-title">🔘 操作按钮</div>
        <div class="buttons-list">
          ${comp.buttons!.map(b => {
            const btnClass = b.type === 'primary' ? 'btn-primary' : b.type === 'danger' ? 'btn-danger' : b.type === 'link' ? 'btn-link' : 'btn-default'
            const actionInfo = b.action ? ` → <span class="action-info">${this.escapeHtml(b.action.type)}${b.action.targetApi ? `: <code>${this.escapeHtml(b.action.targetApi)}</code>` : ''}${b.action.targetComponent ? ` → ${this.escapeHtml(b.action.targetComponent)}` : ''}</span>` : ''
            return `<span class="button-item ${btnClass}">${this.escapeHtml(b.name)}${actionInfo}</span>`
          }).join('')}
        </div>
      </div>`
    }

    // 构建操作列表（actions）
    let actionsHtml = ''
    if (hasActions) {
      actionsHtml = `
      <div class="detail-block">
        <div class="detail-block-title">⚡ 交互操作</div>
        <div class="actions-list">
          ${comp.actions!.map(a => {
            const actionIcon = a.type === 'modal' ? '💬' : a.type === 'drawer' ? '📂' : a.type === 'navigate' ? '🔗' : a.type === 'download' ? '⬇️' : '⚡'
            return `<div class="action-item">
              <span class="action-icon">${actionIcon}</span>
              <strong>${this.escapeHtml(a.name)}</strong>
              <span class="action-type">[${this.escapeHtml(a.type)}]</span>
              <span class="action-desc">${this.escapeHtml(a.description)}</span>
              ${a.targetApi ? `<span class="action-target">→ <code>${this.escapeHtml(a.targetApi)}</code></span>` : ''}
              ${a.targetComponent ? `<span class="action-target">→ ${this.escapeHtml(a.targetComponent)}</span>` : ''}
            </div>`
          }).join('')}
        </div>
      </div>`
    }

    // 构建关联API列表
    let apiHtml = ''
    if (comp.apiUrls && comp.apiUrls.length > 0) {
      apiHtml = `
      <div class="detail-block">
        <div class="detail-block-title">🔌 关联接口</div>
        <div class="comp-api-list">
          ${comp.apiUrls.map(url => {
            const method = this.extractMethod(url)
            const methodClass = method.toLowerCase()
            const cleanUrl = url.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '')
            const triggerTag = comp.triggerTiming ? `<span class="trigger-badge ${comp.triggerTiming}">${TRIGGER_META[comp.triggerTiming]?.icon || ''} ${TRIGGER_META[comp.triggerTiming]?.label || ''}</span>` : ''
            return `<div class="comp-api-item" onclick="showApiDetail('${this.escapeHtml(cleanUrl)}')">
              <span class="method-tag ${methodClass}">${method}</span>
              <code>${this.truncateUrl(cleanUrl, 60)}</code>
              ${triggerTag}
            </div>`
          }).join('')}
        </div>
      </div>`
    }

    return `
    <div class="comp-detail" style="margin-left: ${indent}px" id="${compId}" data-search="${this.escapeHtml(comp.name)} ${this.escapeHtml(comp.description)} ${comp.type}">
      <div class="comp-detail-header">
        <span class="comp-icon">${meta.icon}</span>
        <span class="comp-type-badge">${meta.label}</span>
        <h4 class="comp-title">${this.escapeHtml(comp.name)}</h4>
        <span class="comp-desc">${this.escapeHtml(comp.description)}</span>
        ${featureTags.length > 0 ? `<div class="feature-tags">${featureTags.join('')}</div>` : ''}
      </div>
      ${columnsHtml}
      ${propsHtml}
      ${buttonsHtml}
      ${actionsHtml}
      ${apiHtml}
      ${hasChildren ? `
      <div class="comp-children">
        <div class="children-title">📦 子组件</div>
        ${comp.children!.map((c, ci) => this.renderComponentDetail(c, depth + 1, `${compId}-${ci}`)).join('\n')}
      </div>` : ''}
    </div>`
  }

  // ==================== 公共组件详情 ====================

  private renderSharedComponentDetail(sc: SharedComponent, index: number): string {
    const meta = COMPONENT_META[sc.type] || COMPONENT_META.other

    return `
    <div class="shared-detail">
      <div class="shared-detail-header">
        <span class="comp-icon">${meta.icon}</span>
        <span class="comp-type-badge">${meta.label}</span>
        <h2>${this.escapeHtml(sc.name)}</h2>
        <span class="usage-count">使用页面: ${sc.pages.length}个</span>
      </div>
      <p class="shared-desc">${this.escapeHtml(sc.description)}</p>

      ${sc.commonProps && sc.commonProps.length > 0 ? `
      <div class="detail-block">
        <div class="detail-block-title">📝 通用属性</div>
        <table class="detail-table">
          <thead><tr><th>名称</th><th>类型</th><th>描述</th></tr></thead>
          <tbody>
            ${sc.commonProps.map(p => `<tr>
              <td><code>${this.escapeHtml(p.name)}</code></td>
              <td><span class="type-tag">${this.escapeHtml(p.type)}</span></td>
              <td>${this.escapeHtml(p.description)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${sc.apiUrls.length > 0 ? `
      <div class="detail-block">
        <div class="detail-block-title">🔌 关联接口</div>
        <div class="comp-api-list">
          ${sc.apiUrls.map(url => {
            const method = this.extractMethod(url)
            const methodClass = method.toLowerCase()
            return `<div class="comp-api-item" onclick="showApiDetail('${this.escapeHtml(url)}')">
              <span class="method-tag ${methodClass}">${method}</span>
              <code>${this.truncateUrl(url, 60)}</code>
            </div>`
          }).join('')}
        </div>
      </div>` : ''}

      <div class="detail-block">
        <div class="detail-block-title">📄 使用页面</div>
        <div class="page-refs-list">
          ${sc.pages.map(url => `<span class="page-ref">${this.truncateUrl(url, 60)}</span>`).join('')}
        </div>
      </div>
    </div>`
  }

  // ==================== 公用接口详情 ====================

  private renderSharedApiDetail(sa: SharedApi, index: number, apis: ApiInterface[]): string {
    const methodClass = sa.method.toLowerCase()
    const detailedApi = apis.find(a => a.url === sa.url)

    return `
    <div class="shared-detail">
      <div class="shared-detail-header">
        <span class="method-badge ${methodClass}">${sa.method}</span>
        <h2>${this.escapeHtml(sa.url)}</h2>
        <span class="usage-count">调用页面: ${sa.pages.length}个</span>
      </div>
      <p class="shared-desc">${this.escapeHtml(sa.description)}</p>

      ${(sa.params && sa.params.length > 0) || (detailedApi?.params && detailedApi.params.length > 0) ? `
      <div class="detail-block">
        <div class="detail-block-title">📋 参数</div>
        <table class="detail-table">
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
      <div class="detail-block">
        <div class="detail-block-title">📤 返回值</div>
        <pre class="code-block">${this.escapeHtml(sa.returnValue || detailedApi?.returnValue || '')}</pre>
      </div>` : ''}

      ${sa.exampleBody || detailedApi?.exampleBody ? `
      <div class="detail-block">
        <div class="detail-block-title">📥 示例请求体</div>
        <pre class="code-block">${this.escapeHtml(sa.exampleBody || detailedApi?.exampleBody || '')}</pre>
      </div>` : ''}

      ${sa.exampleResponse || detailedApi?.exampleResponse ? `
      <div class="detail-block">
        <div class="detail-block-title">📤 示例响应</div>
        <pre class="code-block">${this.escapeHtml((sa.exampleResponse || detailedApi?.exampleResponse || '').substring(0, 1000))}</pre>
      </div>` : ''}

      <div class="detail-block">
        <div class="detail-block-title">📄 调用页面</div>
        <div class="page-refs-list">
          ${sa.pages.map(url => `<span class="page-ref">${this.truncateUrl(url, 60)}</span>`).join('')}
        </div>
      </div>
    </div>`
  }

  // ==================== 总览渲染 ====================

  private renderOverview(
    result: SiteAnalyzerResult,
    pageAnalyses: PageAnalysis[],
    sharedComponents: SharedComponent[],
    sharedApis: SharedApi[],
    totalComponents: number
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

    const sortedPageTypes = Array.from(pageTypeCounts.entries()).sort((a, b) => b[1] - a[1])
    const sortedCompTypes = Array.from(componentTypeCounts.entries()).sort((a, b) => b[1] - a[1])

    return `
    <div class="overview">
      <h2>📊 分析总览</h2>
      <div class="overview-stats-grid">
        <div class="stat-card">
          <div class="stat-number">${pageAnalyses.length}</div>
          <div class="stat-label">页面</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${totalComponents}</div>
          <div class="stat-label">组件</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${sharedComponents.length}</div>
          <div class="stat-label">公共组件</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${sharedApis.length}</div>
          <div class="stat-label">公用接口</div>
        </div>
      </div>

      <div class="overview-row">
        <div class="overview-card">
          <h3>📄 页面类型分布</h3>
          <div class="type-bars">
            ${sortedPageTypes.map(([type, count]) => {
              const pct = Math.round(count / pageAnalyses.length * 100)
              return `<div class="type-bar-row">
                <span class="type-bar-label">${this.escapeHtml(type)}</span>
                <div class="type-bar-track"><div class="type-bar-fill" style="width:${pct}%"></div></div>
                <span class="type-bar-count">${count}</span>
              </div>`
            }).join('')}
          </div>
        </div>

        <div class="overview-card">
          <h3>🧩 组件类型分布</h3>
          <div class="type-bars">
            ${sortedCompTypes.slice(0, 10).map(([type, count]) => {
              const meta = COMPONENT_META[type] || COMPONENT_META.other
              const pct = Math.round(count / totalComponents * 100)
              return `<div class="type-bar-row">
                <span class="type-bar-label">${meta.icon} ${meta.label}</span>
                <div class="type-bar-track"><div class="type-bar-fill comp" style="width:${pct}%"></div></div>
                <span class="type-bar-count">${count}</span>
              </div>`
            }).join('')}
          </div>
        </div>
      </div>

      <div class="overview-card full-width">
        <h3>📋 页面-组件-接口映射表</h3>
        <div class="table-wrapper">
          <table class="mapping-table">
            <thead>
              <tr><th>页面</th><th>类型</th><th>组件数</th><th>独占API</th><th>公共组件</th><th>公用接口</th></tr>
            </thead>
            <tbody>
              ${pageAnalyses.map((pa, i) => `<tr class="clickable-row" onclick="navigateTo('page-${i}')">
                <td><strong>${this.escapeHtml(pa.title)}</strong><br><small class="page-url">${this.truncateUrl(pa.url, 40)}</small></td>
                <td><span class="page-type-badge-sm">${this.escapeHtml(pa.pageType)}</span></td>
                <td>${this.countComponents(pa.components)}</td>
                <td>${pa.exclusiveApis.length}</td>
                <td>${pa.sharedComponentRefs.length > 0 ? pa.sharedComponentRefs.map(n => `<span class="ref-tag-sm">${this.escapeHtml(n)}</span>`).join('') : '-'}</td>
                <td>${pa.sharedApiRefs.length > 0 ? pa.sharedApiRefs.map(u => `<span class="ref-tag-sm api">${this.truncateUrl(u, 25)}</span>`).join('') : '-'}</td>
              </tr>`).join('\n')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`
  }

  // ==================== 辅助方法 ====================

  /**
   * 生成页面显示名称（处理同名页面）
   */
  private generatePageDisplayNames(pageAnalyses: PageAnalysis[]): string[] {
    const titleCounts = new Map<string, number[]>()
    pageAnalyses.forEach((pa, i) => {
      const title = pa.title || pa.url
      if (!titleCounts.has(title)) titleCounts.set(title, [])
      titleCounts.get(title)!.push(i)
    })

    return pageAnalyses.map((pa, i) => {
      const title = pa.title || pa.url
      const indices = titleCounts.get(title) || []
      if (indices.length <= 1) return title
      // 同名页面，附加URL路径
      try {
        const u = new URL(pa.url)
        return `${title} - ${u.pathname}`
      } catch {
        return `${title} - ${pa.url}`
      }
    })
  }

  private countComponents(components: UIComponent[]): number {
    return components.reduce((sum, c) => sum + 1 + (c.children ? this.countComponents(c.children) : 0), 0)
  }

  private extractMethod(apiUrl: string): string {
    const parts = apiUrl.split(' ')
    if (parts.length > 1 && /^(GET|POST|PUT|DELETE|PATCH)$/i.test(parts[0])) {
      return parts[0].toUpperCase()
    }
    return 'GET'
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
  --bg-sidebar: #162032;
  --text: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
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
  --sidebar-width: 280px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }

/* 顶部导航 */
.header { background: linear-gradient(135deg, #1e3a5f, #2d1b69); padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 20; }
.header-content h1 { font-size: 20px; margin-bottom: 6px; }
.header-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.badge { background: rgba(255,255,255,0.1); padding: 2px 10px; border-radius: 16px; font-size: 12px; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.header-actions input { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 14px; border-radius: var(--radius); width: 260px; font-size: 13px; outline: none; }
.header-actions input:focus { border-color: var(--accent); background: rgba(255,255,255,0.15); }
.header-actions input::placeholder { color: rgba(255,255,255,0.5); }
.btn-export { padding: 6px 14px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.8); border-radius: var(--radius); cursor: pointer; font-size: 12px; transition: all 0.2s; }
.btn-export:hover { background: var(--accent); color: white; border-color: var(--accent); }

/* 布局 */
.layout { display: flex; height: calc(100vh - 80px); }

/* 侧边栏 */
.sidebar { width: var(--sidebar-width); min-width: var(--sidebar-width); background: var(--bg-sidebar); border-right: 1px solid var(--border); overflow-y: auto; padding: 12px 0; }
.sidebar-section { margin-bottom: 4px; }
.sidebar-section-title { padding: 8px 16px; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; transition: color 0.2s; }
.sidebar-section-title:hover { color: var(--text); }
.sidebar-section-title .arrow { font-size: 10px; transition: transform 0.2s; display: inline-block; width: 14px; }
.sidebar-section-title .arrow.open { transform: rotate(90deg); }
.sidebar-section-title .count { background: rgba(59,130,246,0.2); color: var(--accent); padding: 1px 6px; border-radius: 8px; font-size: 11px; margin-left: auto; }
.sidebar-children { overflow: hidden; }
.sidebar-children.collapsed { display: none; }
.sidebar-item { padding: 6px 16px 6px 24px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: var(--text-secondary); transition: all 0.15s; border-left: 3px solid transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sidebar-item:hover { background: var(--bg-hover); color: var(--text); }
.sidebar-item.active { background: rgba(59,130,246,0.1); color: var(--accent); border-left-color: var(--accent); }
.sidebar-icon { font-size: 14px; flex-shrink: 0; }
.page-item { padding-left: 16px; }
.page-item .page-name { font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; }
.page-type-mini { font-size: 10px; color: var(--text-muted); background: var(--bg); padding: 1px 6px; border-radius: 6px; flex-shrink: 0; }
.comp-item { padding-left: 36px; font-size: 12px; }
.sidebar-comp-list { }
.sidebar-page-group { margin-bottom: 2px; }
.method-tag { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; flex-shrink: 0; }
.method-tag.get { background: rgba(34,197,94,0.2); color: var(--green); }
.method-tag.post { background: rgba(59,130,246,0.2); color: var(--accent); }
.method-tag.put { background: rgba(234,179,8,0.2); color: var(--yellow); }
.method-tag.delete { background: rgba(239,68,68,0.2); color: var(--red); }
.method-tag.patch { background: rgba(168,85,247,0.2); color: var(--purple); }

/* 内容区 */
.content { flex: 1; overflow-y: auto; padding: 24px 32px; }
.view { display: none; }
.view.active { display: block; }

/* 总览 */
.overview h2 { margin-bottom: 20px; }
.overview-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center; }
.stat-number { font-size: 32px; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.overview-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.overview-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.overview-card.full-width { grid-column: 1 / -1; }
.overview-card h3 { font-size: 15px; margin-bottom: 12px; }
.type-bars { display: flex; flex-direction: column; gap: 8px; }
.type-bar-row { display: flex; align-items: center; gap: 10px; }
.type-bar-label { width: 100px; font-size: 12px; color: var(--text-secondary); text-align: right; flex-shrink: 0; }
.type-bar-track { flex: 1; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.type-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; }
.type-bar-fill.comp { background: var(--purple); }
.type-bar-count { width: 30px; font-size: 12px; color: var(--text-secondary); text-align: right; }
.table-wrapper { overflow-x: auto; }
.mapping-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mapping-table th { text-align: left; padding: 10px 12px; background: var(--bg); color: var(--text-secondary); font-weight: 500; }
.mapping-table td { padding: 10px 12px; border-top: 1px solid var(--border); }
.mapping-table .page-url { font-size: 11px; color: var(--text-muted); }
.clickable-row { cursor: pointer; transition: background 0.15s; }
.clickable-row:hover { background: var(--bg-hover); }
.page-type-badge-sm { background: rgba(59,130,246,0.15); color: var(--accent); padding: 2px 8px; border-radius: 8px; font-size: 11px; }
.ref-tag-sm { background: rgba(168,85,247,0.12); color: var(--purple); padding: 1px 6px; border-radius: 6px; font-size: 11px; margin-right: 2px; }
.ref-tag-sm.api { background: rgba(59,130,246,0.12); color: var(--accent); }

/* 页面详情 */
.page-detail-header { margin-bottom: 24px; }
.page-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.page-type-badge { background: var(--accent); color: white; padding: 3px 14px; border-radius: 12px; font-size: 12px; white-space: nowrap; }
.page-detail-header h2 { font-size: 22px; }
.page-url { color: var(--text-muted); font-family: monospace; font-size: 13px; margin-bottom: 16px; }
.page-desc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.desc-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; border-left: 3px solid var(--accent); }
.desc-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.desc-value { font-size: 14px; color: var(--text); }

/* API概览 */
.api-summary-section { margin-bottom: 24px; }
.api-summary-section h3 { font-size: 16px; margin-bottom: 12px; }
.api-summary-grid { display: flex; flex-direction: column; gap: 12px; }
.api-summary-group { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.api-summary-title { font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.trigger-badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 500; }
.trigger-badge.auto_load { background: rgba(34,197,94,0.15); color: var(--green); }
.trigger-badge.action_trigger { background: rgba(59,130,246,0.15); color: var(--accent); }
.trigger-badge.cascade { background: rgba(249,115,22,0.15); color: var(--orange); }
.api-summary-list { display: flex; flex-direction: column; gap: 6px; }
.api-summary-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg); border-radius: 6px; cursor: pointer; transition: background 0.15s; font-size: 13px; }
.api-summary-item:hover { background: var(--bg-hover); }
.api-summary-item code { color: var(--text-secondary); font-size: 12px; }

/* 组件列表 */
.components-section { margin-bottom: 24px; }
.components-section h3 { font-size: 16px; margin-bottom: 16px; }
.components-list { display: flex; flex-direction: column; gap: 12px; }

/* 组件详情卡片 */
.comp-detail { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; transition: border-color 0.2s; }
.comp-detail:hover { border-color: rgba(59,130,246,0.3); }
.comp-detail-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.comp-icon { font-size: 16px; }
.comp-type-badge { background: rgba(168,85,247,0.15); color: var(--purple); padding: 2px 10px; border-radius: 8px; font-size: 11px; font-weight: 500; }
.comp-title { font-size: 15px; font-weight: 600; }
.comp-desc { color: var(--text-secondary); font-size: 13px; }
.feature-tags { display: flex; gap: 6px; margin-left: auto; }
.feature-tag { background: rgba(34,197,94,0.1); color: var(--green); padding: 2px 8px; border-radius: 6px; font-size: 11px; }
.feature-tag.dim { background: rgba(100,116,139,0.1); color: var(--text-muted); }

/* 详情块 */
.detail-block { margin-top: 12px; }
.detail-block-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
.detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.detail-table th { text-align: left; padding: 6px 10px; background: var(--bg); color: var(--text-muted); font-weight: 500; font-size: 11px; }
.detail-table td { padding: 6px 10px; border-top: 1px solid rgba(51,65,85,0.5); }
.detail-table code { background: var(--bg); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
.type-tag { background: rgba(6,182,212,0.1); color: var(--cyan); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
.option-tag { background: var(--bg); color: var(--text-secondary); padding: 1px 5px; border-radius: 3px; font-size: 10px; margin-right: 2px; }

/* 按钮列表 */
.buttons-list { display: flex; flex-wrap: wrap; gap: 8px; }
.button-item { padding: 4px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.button-item.btn-primary { background: rgba(59,130,246,0.15); color: var(--accent); }
.button-item.btn-danger { background: rgba(239,68,68,0.15); color: var(--red); }
.button-item.btn-default { background: var(--bg); color: var(--text-secondary); }
.button-item.btn-link { background: transparent; color: var(--accent); text-decoration: underline; }
.action-info { color: var(--text-muted); font-size: 11px; }
.action-info code { background: rgba(59,130,246,0.15); color: var(--accent); padding: 0 4px; border-radius: 3px; font-size: 10px; }

/* 操作列表 */
.actions-list { display: flex; flex-direction: column; gap: 6px; }
.action-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg); border-radius: 6px; font-size: 12px; flex-wrap: wrap; }
.action-icon { font-size: 14px; }
.action-type { color: var(--text-muted); font-size: 11px; }
.action-desc { color: var(--text-secondary); font-size: 12px; }
.action-target { color: var(--cyan); font-size: 11px; }
.action-target code { background: rgba(6,182,212,0.1); color: var(--cyan); padding: 0 4px; border-radius: 3px; font-size: 10px; }

/* 关联接口 */
.comp-api-list { display: flex; flex-direction: column; gap: 4px; }
.comp-api-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg); border-radius: 6px; cursor: pointer; transition: background 0.15s; font-size: 12px; }
.comp-api-item:hover { background: var(--bg-hover); }
.comp-api-item code { color: var(--text-secondary); font-size: 12px; }

/* 子组件 */
.comp-children { margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--border); }
.children-title { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }

/* 公共组件/接口详情 */
.shared-detail-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.shared-detail-header h2 { font-size: 20px; }
.usage-count { background: rgba(34,197,94,0.15); color: var(--green); padding: 3px 12px; border-radius: 12px; font-size: 12px; white-space: nowrap; }
.shared-desc { color: var(--text-secondary); font-size: 14px; margin-bottom: 16px; }
.code-block { background: var(--bg); padding: 14px; border-radius: var(--radius); overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }
.page-refs-list { display: flex; flex-wrap: wrap; gap: 6px; }
.page-ref { background: var(--bg); padding: 3px 10px; border-radius: 6px; font-size: 12px; font-family: monospace; color: var(--text-secondary); }

/* 引用区域 */
.refs-section { margin-top: 20px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
.refs-group { margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.refs-label { color: var(--text-secondary); font-size: 13px; }
.ref-tag { background: rgba(168,85,247,0.12); color: var(--purple); padding: 3px 10px; border-radius: 10px; font-size: 12px; }
.ref-tag.api { background: rgba(59,130,246,0.12); color: var(--accent); }

/* 方法标签 */
.method-badge { padding: 3px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; min-width: 60px; text-align: center; }
.method-badge.get { background: rgba(34,197,94,0.2); color: var(--green); }
.method-badge.post { background: rgba(59,130,246,0.2); color: var(--accent); }
.method-badge.put { background: rgba(234,179,8,0.2); color: var(--yellow); }
.method-badge.delete { background: rgba(239,68,68,0.2); color: var(--red); }

/* 弹窗 */
.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 100; justify-content: center; align-items: center; }
.modal.active { display: flex; }
.modal-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto; position: relative; }
.modal-close { position: absolute; top: 12px; right: 16px; background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer; }
.modal-content h3 { margin-bottom: 16px; font-size: 16px; }
.modal-content pre { background: var(--bg); padding: 12px; border-radius: var(--radius); overflow-x: auto; font-size: 12px; margin: 8px 0; white-space: pre-wrap; word-break: break-all; }
.modal-content .label { color: var(--text-secondary); font-size: 12px; margin-top: 12px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

/* 搜索高亮 */
.search-highlight { background: rgba(234,179,8,0.3); border-radius: 2px; }

/* 滚动条 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
`
  }

  // ==================== JavaScript ====================

  private getScripts(
    result: SiteAnalyzerResult,
    pageAnalyses: PageAnalysis[],
    sharedComponents: SharedComponent[],
    sharedApis: SharedApi[],
    apis: ApiInterface[]
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
  pages: result.pages.map(p => ({ url: p.url, title: p.title, pageType: p.pageType, depth: p.depth })),
  requests: result.requests.filter(r => r.isApiRequest).map(r => ({
    url: r.url, method: r.method, statusCode: r.statusCode, duration: r.duration,
    headers: r.headers, body: r.body?.substring(0, 500), response: r.response?.substring(0, 1000)
  }))
}, null, 0)};

// 导航到指定视图
function navigateTo(viewId, compId) {
  // 隐藏所有视图
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  // 移除所有侧边栏激活状态
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

  // 显示目标视图
  var targetView = document.getElementById('view-' + viewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // 激活侧边栏项
  var sidebarItem = document.querySelector('.sidebar-item[data-view="' + viewId + '"]');
  if (sidebarItem) {
    sidebarItem.classList.add('active');
    // 展开父级
    var parent = sidebarItem.closest('.sidebar-children');
    if (parent && parent.classList.contains('collapsed')) {
      parent.classList.remove('collapsed');
      var arrow = parent.previousElementSibling?.querySelector('.arrow');
      if (arrow) arrow.classList.add('open');
    }
  }

  // 如果指定了组件ID，滚动到该组件
  if (compId) {
    setTimeout(function() {
      var compEl = document.getElementById(compId);
      if (compEl) {
        compEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        compEl.style.boxShadow = '0 0 0 2px var(--accent)';
        setTimeout(function() { compEl.style.boxShadow = ''; }, 2000);
      }
    }, 100);
  }
}

// 切换侧边栏分组展开/折叠
function toggleSection(titleEl) {
  var children = titleEl.nextElementSibling;
  var arrow = titleEl.querySelector('.arrow');
  if (children) {
    children.classList.toggle('collapsed');
    if (arrow) arrow.classList.toggle('open');
  }
}

// 全局搜索
function onGlobalSearch(query) {
  query = query.toLowerCase().trim();
  // 搜索侧边栏
  document.querySelectorAll('.sidebar-item[data-comp-name]').forEach(function(item) {
    var name = (item.getAttribute('data-comp-name') || '').toLowerCase();
    item.style.display = (!query || name.includes(query)) ? '' : 'none';
  });
  // 搜索内容区组件
  document.querySelectorAll('[data-search]').forEach(function(el) {
    var text = (el.getAttribute('data-search') || '').toLowerCase();
    if (query) {
      el.style.display = text.includes(query) ? '' : 'none';
    } else {
      el.style.display = '';
    }
  });
}

// 显示API详情弹窗
function showApiDetail(url) {
  var api = reportData.apis.find(function(a) { return a.url === url || url.includes(a.url); });
  if (api) {
    showApiDetailFull(api);
    return;
  }
  // 在共享API中查找
  var sa = reportData.sharedApis.find(function(a) { return a.url === url || url.includes(a.url); });
  if (sa) {
    showApiDetailFull({ url: sa.url, method: sa.method, description: sa.description, params: sa.params, returnValue: sa.returnValue, exampleBody: sa.exampleBody, exampleResponse: sa.exampleResponse });
  }
}

function showApiDetailFull(api) {
  var modal = document.getElementById('modal');
  var body = document.getElementById('modal-body');
  var methodClass = (api.method || 'GET').toLowerCase();
  body.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
    '<span class="method-badge ' + methodClass + '">' + (api.method || 'GET') + '</span>' +
    '<h3 style="margin:0;font-size:16px;">' + (api.url || '') + '</h3></div>' +
    '<p class="label">描述</p><p>' + (api.description || '-') + '</p>' +
    (api.params && api.params.length > 0 ?
      '<p class="label">参数</p><table class="detail-table" style="margin-top:4px;"><thead><tr><th>名称</th><th>类型</th><th>必填</th><th>说明</th></tr></thead><tbody>' +
      api.params.map(function(p) {
        return '<tr><td><code>' + (p.name||'') + '</code></td><td>' + (p.type||'') + '</td><td>' + (p.required?'✅':'❌') + '</td><td>' + (p.description||'-') + '</td></tr>';
      }).join('') + '</tbody></table>' : '') +
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

document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

// 默认展开页面分析分组
(function() {
  var firstSection = document.querySelector('.sidebar-section-title');
  if (firstSection) {
    toggleSection(firstSection);
  }
})();

function exportJSON() {
  var blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-analysis-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

function exportMarkdown() {
  var md = '# 网站前端分析报告\\n\\n';
  md += '- 目标: ${result.targetUrl}\\n';
  md += '- 页面数: ${pageAnalyses.length}\\n';
  md += '- 公共组件: ${sharedComponents.length}\\n';
  md += '- 公用接口: ${sharedApis.length}\\n\\n';

  md += '## 页面分析\\n\\n';
  reportData.pageAnalyses.forEach(function(pa) {
    md += '### ' + pa.title + '\\n';
    md += '- 类型: ' + pa.pageType + '\\n';
    md += '- UI描述: ' + pa.uiDescription + '\\n';
    md += '- 布局: ' + pa.layoutSummary + '\\n';
    md += '- URL: ' + pa.url + '\\n\\n';
    md += '**组件列表:**\\n\\n';
    var renderComp = function(comp, indent) {
      md += indent + '- **' + comp.name + '** [' + comp.type + '] ' + comp.description + '\\n';
      if (comp.columns && comp.columns.length > 0) {
        md += indent + '  - 列定义: ' + comp.columns.map(function(c) { return c.title + '(' + c.dataIndex + ')'; }).join(', ') + '\\n';
      }
      if (comp.hasIndex) md += indent + '  - ✅ 有序号列\\n';
      if (comp.hasSelection) md += indent + '  - ✅ 可多选\\n';
      if (comp.hasPagination) md += indent + '  - ✅ 有分页\\n';
      if (comp.props && comp.props.length > 0) {
        md += indent + '  - 字段: ' + comp.props.map(function(p) { return p.name + '(' + p.type + ')' + (p.required ? ' 必填' : ''); }).join(', ') + '\\n';
      }
      if (comp.buttons && comp.buttons.length > 0) {
        md += indent + '  - 按钮: ' + comp.buttons.map(function(b) { return b.name; }).join(', ') + '\\n';
      }
      if (comp.actions && comp.actions.length > 0) {
        md += indent + '  - 操作: ' + comp.actions.map(function(a) { return a.name + ' → ' + (a.targetApi || a.targetComponent || ''); }).join(', ') + '\\n';
      }
      if (comp.apiUrls && comp.apiUrls.length > 0) {
        md += indent + '  - API: ' + comp.apiUrls.join(', ') + '\\n';
      }
      if (comp.children) comp.children.forEach(function(c) { renderComp(c, indent + '  '); });
    };
    pa.components.forEach(function(c) { renderComp(c, ''); });
    if (pa.exclusiveApis.length > 0) md += '\\n**独占API:** ' + pa.exclusiveApis.join(', ') + '\\n';
    md += '\\n---\\n\\n';
  });

  if (reportData.sharedComponents.length > 0) {
    md += '## 公共组件\\n\\n';
    reportData.sharedComponents.forEach(function(sc) {
      md += '### ' + sc.name + ' [' + sc.type + ']\\n';
      md += sc.description + '\\n';
      md += '使用页面: ' + sc.pages.join(', ') + '\\n\\n';
    });
  }

  if (reportData.sharedApis.length > 0) {
    md += '## 公用接口\\n\\n';
    reportData.sharedApis.forEach(function(sa) {
      md += '### ' + sa.method + ' ' + sa.url + '\\n';
      md += sa.description + '\\n';
      md += '调用页面: ' + sa.pages.join(', ') + '\\n\\n';
    });
  }

  var blob = new Blob([md], { type: 'text/markdown' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-analysis-' + new Date().toISOString().slice(0, 10) + '.md';
  a.click();
}
`
  }
}
