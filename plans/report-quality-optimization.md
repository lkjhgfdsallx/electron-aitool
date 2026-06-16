# HTML 报告质量全面优化方案

## 问题诊断

通过分析完整数据管道（爬取 → AI分析 → 报告生成），发现以下核心问题：

### 问题1: 组件只有名字没有具体细节
- **根因**: 爬虫只收集原始HTML，不提取结构化DOM信息（表格列头、表单字段标签等）
- AI提示词中HTML被截断到8000字符，丢失大量结构信息
- 本地分析回退产生泛化名称（如"数据表格"而非"订单列表表格-订单号/客户/金额/状态/操作"）

### 问题2: 同标题页面无法区分
- **根因**: 爬虫不提取侧边栏导航菜单结构
- 页面title相同（如都叫"管理后台"），但侧边栏选中项不同（"用户管理" vs "订单管理"）

### 问题3: 数据表格缺少关键信息
- 表格有哪些列？是否有行选择框（checkbox）？是否有操作列？是否有序号列？
- 分页组件是否配套？是否有批量操作按钮？

### 问题4: 表单缺少字段详情
- 表单有哪些字段？每个字段的类型（输入框/下拉/日期/上传）？是否必填？placeholder是什么？

### 问题5: 交互探索结果过于简略
- 点击Tab后只记录"Tab已展开"，不记录Tab下实际展示了什么内容
- 打开弹窗后只记录"出现了弹窗"，不记录弹窗里有什么表单/按钮

### 问题6: 报告缺少页面截图展示
- 截图数据已收集但报告中未展示
- 交互探索的截图也未在报告中展示

---

## 优化方案（按影响优先级排序）

### P0: 增强DOM结构提取（crawler.ts）

新增 `extractPageStructure(page)` 方法，在爬取时提取页面的结构化信息：

```typescript
interface PageStructure {
  // 侧边栏/导航菜单
  sidebar?: {
    items: Array<{ text: string; isActive: boolean; level: number }>
    activeItem?: string  // 当前选中的菜单项文本，用于页面命名
  }
  // 表格详情
  tables: Array<{
    columns: string[]           // 列头文本
    rowCount: number            // 数据行数
    hasCheckbox: boolean        // 是否有行选择框
    hasIndex: boolean           // 是否有序号列
    hasAction: boolean          // 是否有操作列
    actionButtons: string[]     // 操作列中的按钮文本
    headerButtons: string[]     // 表格上方的操作按钮（新增、导出等）
  }>
  // 表单详情
  forms: Array<{
    fields: Array<{
      label: string             // 字段标签
      type: string              // 字段类型（input/select/datepicker/switch等）
      placeholder?: string      // 占位文本
      required: boolean         // 是否必填
      options?: string[]        // 下拉选项（如果是select）
    }>
    submitButtons: string[]     // 提交按钮文本
  }>
  // 页面头部
  pageHeader?: {
    title: string               // 页面标题文本
    breadcrumbs: string[]       // 面包屑
    headerActions: string[]     // 头部操作按钮
  }
  // 统计卡片（仪表盘常见）
  statCards: Array<{
    label: string
    value: string
  }>
  // 按钮列表（页面上所有可见按钮及其位置）
  allButtons: string[]
}
```

**提取逻辑**：
1. **侧边栏**: 检测 `.ant-menu`, `.el-menu`, `nav`, `[role="navigation"]`, `.sidebar`, `.side-menu` 等选择器，提取菜单项文本和active状态
2. **表格**: 检测 `table`, `.ant-table`, `.el-table` 等，提取 `<th>` 列头、checkbox列、序号列、操作列按钮
3. **表单**: 检测 `form`, `.ant-form`, `.el-form` 等，提取 label 文本、input type、placeholder、required 标记、select 的 options
4. **页面头部**: 检测面包屑、页面标题区域
5. **统计卡片**: 检测 `.stat-card`, `.ant-statistic` 等

### P1: 增强交互探索结果（crawler.ts）

改进 `exploreTabs()`, `exploreActionButtons()` 等方法，在交互后提取更多内容信息：

- **Tab探索**: 点击Tab后，提取Tab面板中的内容摘要（有哪些表格/表单/按钮）
- **按钮探索**: 点击按钮后，如果是弹窗/抽屉，提取其中的表单字段列表
- **折叠面板**: 展开后，提取面板内的组件摘要

### P2: 增强AI分析提示词（ai-analyzer.ts）

1. 将提取的 `PageStructure` 结构化数据加入AI提示词（比原始HTML更有价值）
2. 侧边栏 activeItem 作为页面标题的补充命名
3. 提供更详细的输出格式示例，特别是表格列和表单字段

### P3: 增强报告渲染（report-generator.ts）

1. **页面截图展示**: 在页面卡片顶部展示截图（缩小版，可点击放大）
2. **表格详情展示**: 以结构化表格形式展示列定义、操作按钮、行选择等
3. **表单详情展示**: 以结构化表格形式展示字段列表（标签/类型/必填/占位符）
4. **侧边栏上下文**: 显示页面在导航中的位置
5. **交互探索结果展示**: 展示交互探索的详细结果和截图
6. **页面命名优化**: 当title相同时，使用侧边栏activeItem + hash路由作为区分

---

## 数据流变化

```
当前:
  爬虫: URL + title + rawHTML + links + forms + interactionResults
  AI:   rawHTML截断(8000字) + requests + interactionResults → PageAnalysis
  报告: PageAnalysis → HTML

优化后:
  爬虫: URL + title + rawHTML + links + forms + interactionResults + pageStructure(新增)
  AI:   pageStructure(结构化) + rawHTML截断 + requests + interactionResults → PageAnalysis
  报告: PageAnalysis + pageStructure + screenshots → 增强HTML
```

---

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `crawler.ts` | 新增 `extractPageStructure()` 方法，在 `crawlPage()` 中调用 |
| `crawler.ts` | 改进 `exploreTabs()` 等交互方法，提取交互后内容摘要 |
| `types.ts` | 新增 `PageStructure` 接口，`SitePage` 增加 `pageStructure` 字段 |
| `ai-analyzer.ts` | `buildPageAnalysisPrompt()` 中加入 pageStructure 结构化数据 |
| `ai-analyzer.ts` | 改进AI提示词，要求更详细的组件描述 |
| `report-generator.ts` | 增加截图展示、表格/表单详情展示、侧边栏上下文、交互结果展示 |

---

## 实施顺序

1. **types.ts**: 新增 `PageStructure` 接口定义
2. **crawler.ts**: 实现 `extractPageStructure()` + 改进交互探索
3. **ai-analyzer.ts**: 增强提示词 + 使用 pageStructure
4. **report-generator.ts**: 全面优化报告渲染
