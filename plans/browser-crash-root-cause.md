# 浏览器自动崩溃根因分析

## 现象
网站分析进行到一半，Chromium 浏览器**自己崩溃/消失**（用户没有手动关闭），导致后续全部 404。

## 当前启动配置

```typescript
// browser-manager.ts:148-152
const launchOptions = {
  headless: false,
  channel: 'chromium',
  args: ['--disable-blink-features=AutomationControlled']
}
```

**问题：启动参数极其简陋**，只有一个反自动化检测参数，没有任何稳定性相关的参数。

---

## 可能的崩溃原因（按可能性排序）

### 🔴 原因1：内存耗尽（OOM）—— 最可能

**证据链**：
1. 每个页面爬取时都会调用 [`takeScreenshot()`](electron/main/site-analyzer/browser-manager.ts:304)，生成 base64 JPEG
2. 每个页面存储完整 [`html`](electron/main/site-analyzer/crawler.ts:428)（`page.content()`，SPA 页面可达数 MB）
3. [`explorePageInteractions()`](electron/main/site-analyzer/crawler.ts:535) 中点击 Tab/折叠面板/下拉菜单/操作按钮，**每个交互都截图**（第625行）
4. 所有数据存在内存中的 `this.pages` 数组，不释放

**内存估算**（假设爬10个页面）：
| 数据项 | 单页大小 | 10页总量 |
|--------|---------|---------|
| HTML 内容 | 0.5-3 MB | 5-30 MB |
| 页面截图 JPEG base64 | 100-300 KB | 1-3 MB |
| 交互截图（每页约3-5个交互） | 5×200 KB = 1 MB | 10 MB |
| Chromium 进程本身 | - | 200-500 MB |
| **总计** | | **220-540 MB** |

Chromium 浏览器进程在内存压力下会**自行崩溃**（特别是渲染进程 OOM crash）。

### 🔴 原因2：Chromium 渲染进程崩溃

**可能触发场景**：
- 目标网站有**复杂的 JavaScript**（如大型 SPA 框架）
- 页面交互探索中**点击了触发大量 DOM 操作的按钮**
- 页面有**内存泄漏**的 JavaScript 代码
- `exploreActionButtons()` 点击了触发页面导航/刷新的按钮，导致渲染进程状态混乱

渲染进程崩溃时，Chromium 主进程可能也会退出。

### 🟡 原因3：GPU 进程崩溃

当前启动参数**没有 `--disable-gpu`**。在某些系统上：
- GPU 驱动不兼容会导致 Chromium 崩溃
- 截图操作涉及 GPU 渲染合成
- Electron 和 Chromium 共享 GPU 资源可能冲突

### 🟡 原因4：页面交互探索触发危险操作

[`exploreActionButtons()`](electron/main/site-analyzer/crawler.ts:753) 会点击页面上的各种按钮：

```typescript
// 第758-803行：收集所有可能的操作按钮
const candidates = await page.evaluate(() => {
  // 包括 <button>, [role="button"], .btn, [class*="btn"] 等
  // 过滤掉导航类和同意类按钮
  // 但可能漏掉：删除按钮、提交按钮、退出登录按钮等
})
```

可能点击了：
- **退出登录**按钮 → session 丢失 → 后续 404（不是浏览器崩溃，但表现类似）
- **删除/提交**等危险操作按钮
- 触发**文件下载**的按钮（可能导致弹窗/新窗口）
- 触发**页面重定向到外部站点**的按钮

### 🟢 原因5：反爬虫/反自动化检测

目标网站检测到自动化行为后：
- 发送大量请求导致浏览器资源耗尽
- 触发 JavaScript 陷阱（无限循环、大量弹窗）
- 通过 WebRTC/WebGL 指纹检测后采取措施

### 🟢 原因6：`channel: 'chromium'` 使用系统 Chromium

`channel: 'chromium'` 使用系统安装的 Chromium，而不是 Playwright 自带的浏览器。系统 Chromium：
- 版本可能过旧，有已知崩溃 bug
- 可能被其他程序修改/损坏
- 可能与 Playwright 版本不兼容

---

## 根因修复方案

### 方案A：增强浏览器启动稳定性（防止崩溃）

修改 [`browser-manager.ts` 的 `launch()` 方法](electron/main/site-analyzer/browser-manager.ts:144)：

```typescript
const launchOptions = {
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    // 防止 GPU 崩溃
    '--disable-gpu',
    '--disable-software-rasterizer',
    // 防止内存相关崩溃
    '--disable-dev-shm-usage',
    '--no-sandbox',
    // 限制渲染进程内存
    '--js-flags=--max-old-space-size=512',
    // 禁用可能导致崩溃的功能
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    // 禁用崩溃报告弹窗
    '--disable-crash-reporter',
  ]
}
```

**关键改动**：
1. 移除 `channel: 'chromium'`，使用 Playwright 自带的浏览器（版本兼容性更好）
2. 添加 `--disable-gpu` 防止 GPU 崩溃
3. 添加 `--disable-dev-shm-usage` + `--no-sandbox` 防止共享内存问题
4. 添加 `--js-flags=--max-old-space-size=512` 限制渲染进程内存

### 方案B：减少内存消耗（防止 OOM）

1. **不在内存中存储完整 HTML**：爬取时只存储 HTML 的摘要/精简版，而不是完整内容
2. **限制交互探索截图数量**：每个页面最多保存 2 张交互截图
3. **及时释放不需要的数据**：爬取完成后清空截图等大对象

### 方案C：页面交互探索安全改进

1. **限制可点击的按钮类型**：排除包含 "delete"、"remove"、"logout"、"exit"、"submit"、"download" 等关键词的按钮
2. **点击前检查按钮的 `href` 和 `onclick`**：如果会导致导航离开当前页面，则跳过
3. **限制每个页面的交互探索时间**：设置总超时（如 30 秒）

### 方案D：添加崩溃检测和日志

在 `browser.on('disconnected')` 中记录崩溃原因：
```typescript
this.browser.on('disconnected', () => {
  console.warn('[BrowserManager] 浏览器连接断开!')
  // 检测是否是崩溃（而非正常关闭）
  if (this._isAlive) {
    console.error('[BrowserManager] 浏览器异常崩溃！可能原因: 内存耗尽/渲染进程崩溃/GPU崩溃')
  }
  this._isAlive = false
})
```

---

## 推荐优先级

| 优先级 | 方案 | 原因 |
|--------|------|------|
| P0 | 方案A：增强启动参数 | 成本最低，效果最直接，防止大多数崩溃 |
| P0 | 方案D：崩溃检测日志 | 帮助确认真正原因，为后续优化提供数据 |
| P1 | 方案C：交互探索安全改进 | 防止点击危险按钮导致的崩溃/登出 |
| P2 | 方案B：减少内存消耗 | 长期优化，防止大规模爬取时 OOM |
