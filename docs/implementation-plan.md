# 技术实现方案（Implementation Plan）

> 本文档描述 MarkBuddy v1.1 的完整技术架构、数据模型和各模块实现要点。

---

## 概述

MarkBuddy 是一个基于 **Chrome Manifest V3** 的浏览器扩展，由三个独立执行上下文组成：

```
┌──────────────────────────────────────────┐
│              Chrome 浏览器               │
│                                          │
│  ┌────────────┐    ┌───────────────────┐ │
│  │ 内容脚本   │◄──►│  Service Worker   │ │
│  │ content.js │    │ service-worker.js │ │
│  └────────────┘    └────────┬──────────┘ │
│                             │ messages   │
│                    ┌────────▼──────────┐ │
│                    │   Side Panel      │ │
│                    │   panel.js        │ │
│                    └───────────────────┘ │
└──────────────────────────────────────────┘
```

---

## 文件结构

```
mark-extension/
├── manifest.json              # 扩展配置（Manifest V3）
├── service-worker.js          # 后台服务：菜单注册、数据读写
├── content/
│   ├── content.js             # 内容脚本：划线、工具栏、高亮恢复
│   ├── text-range-healer.js   # 文本快照匹配自愈算法（浏览器/Node 双环境）
│   └── content.css            # 内容脚本注入样式
├── side-panel/
│   ├── panel.html             # 侧边面板结构
│   ├── panel.js               # 面板业务逻辑
│   ├── export-markdown.js     # Markdown 导出格式化器（浏览器/Node 双环境）
│   ├── review-tags.js         # 复习标签切换辅助函数（浏览器/Node 双环境）
│   ├── backup-data.js         # JSON 备份/恢复格式化与校验（浏览器/Node 双环境）
│   └── panel.css              # 面板样式（CSS 变量 + 深/浅色）
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── docs/                      # 项目文档（本目录）
```

---

## Manifest V3 配置

### 权限清单

| 权限 | 用途 |
|------|------|
| `sidePanel` | 注册并打开侧边面板 |
| `storage` | 读写 `chrome.storage.local` |
| `tabs` | 读取 `tab.url` / `tab.title`（需声明否则静默返回 undefined） |
| `contextMenus` | 注册右键菜单项 |
| `scripting` | 向页面注入执行脚本（右键菜单触发时） |
| `activeTab` | 响应图标点击等直接用户手势 |
| `webNavigation` | 监听 SPA 无刷新路由变化并通知内容脚本恢复高亮 |

**当前 manifest 事实：** 没有单独声明 `host_permissions` 字段；内容脚本通过 `content_scripts.matches: ["<all_urls>"]` 自动注入，以便在用户再次访问任意网页时恢复高亮。

### 快捷命令

| command | 默认快捷键 | 说明 |
|---------|------------|------|
| `toggle-side-panel` | `Alt+Shift+M` | 打开或关闭 MarkBuddy 侧边栏 |
| `save-selection-highlight` | `Alt+Shift+H` | 将当前网页选中文本保存为默认颜色高亮 |

Chrome 的 `commands` 不需要加入 `permissions`；用户也可以在 `chrome://extensions/shortcuts` 中自行改键。

---

## 数据模型

所有数据存储在 `chrome.storage.local`，主要包含以下 key：

### `bookmarks`

```typescript
type Bookmarks = {
  [url: string]: {
    url: string;
    title: string;
    favicon: string;       // 页面 favicon URL 或空字符串
    savedAt: number;       // Unix 时间戳（ms）
    tags: string[];        // 用户标签列表
    highlightIds: string[]; // 关联划线 ID 列表
  }
}
```

### `highlights`

```typescript
type Highlights = {
  [id: string]: {
    id: string;            // 格式：hl_{timestamp}_{random5}
    url: string;           // 所属页面 URL
    text: string;          // 划线原文
    color: string;         // 背景高亮颜色（hex）
    savedAt: number;
    active: boolean;       // false = 页面结构变化后失效
    note?: string;         // 用户批注
    tags?: string[];       // 用于复习队列等高亮级标签
    serializedRange: {
      parentXPath: string; // 稳定祖先元素 XPath
      startOffset: number; // 相对祖先元素的起点文本偏移量
      endOffset: number;   // 相对祖先元素的终点文本偏移量
      text: string;        // 快照文本（用于失效检测）
    };
    sm2?: {
      interval: number;     // 当前复习间隔（天）
      easeFactor: number;   // SM-2 难度系数
      repetitions: number;  // 连续记住次数
      nextReviewAt: number; // 下次复习时间戳（ms）
    }
  }
}
```

历史数据可能仍包含 `startXPath` / `endXPath` / `text()[N]` 形式的旧版 range，`content/content.js` 在反序列化时保留兼容分支。

### `tags`

```typescript
type Tags = string[]       // 所有已使用标签，排序后去重
```

### `settings`

```typescript
type Settings = {
  defaultColor: string;    // 默认高亮颜色
  presetColors: string[];  // 可选预设颜色列表
  reviewTag?: string;      // 进入复习队列的标签，默认“学习”
}
```

### `groupByDomain` / `sortBy`

侧边栏还会直接读写两个 UI 偏好：

```typescript
type GroupByDomain = boolean   // 默认 true
type SortBy = 'time-desc' | 'time-asc' | 'modified-desc' | 'domain-asc' | 'domain-desc'
```

---

## 模块说明

### 1. Service Worker（`service-worker.js`）

**生命周期注意：** Service Worker 在无活动约 30s 后休眠，**不能用全局变量存状态**，所有状态必须持久化到 `chrome.storage`。

**职责：**
- `onInstalled`：注册右键菜单，设置 `openPanelOnActionClick`
- `contextMenus.onClicked`：通过 `scripting.executeScript` 调用内容脚本中的 `__markbuddy_savePage` / `__markbuddy_saveHighlight`
- `commands.onCommand`：处理全局快捷键，支持打开侧边栏和保存当前选区高亮
- `runtime.onMessage`：集中处理所有 CRUD 消息，统一 async/await 模式
- 存储操作：`saveBookmark`、`saveHighlight`、`deleteBookmark`、`deleteHighlight`、`getAllBookmarks`、`getHighlightsForUrl`、`updateBookmarkTags`
- 复习调度：`getDueReviews`、`updateReviewResult`、`computeSM2`
- SPA 支持：监听 `webNavigation.onHistoryStateUpdated` 并发送 `SPA_NAVIGATION`

**消息类型（Message Types）：**

| type | 方向 | 说明 |
|------|------|------|
| `SAVE_BOOKMARK` | content/panel → SW | 保存网页收藏 |
| `SAVE_HIGHLIGHT` | content → SW | 保存划线，自动关联/创建 bookmark |
| `DELETE_BOOKMARK` | panel → SW | 删除网页及其所有划线 |
| `DELETE_HIGHLIGHT` | content/panel → SW | 删除单条划线 |
| `UPDATE_HIGHLIGHT_NOTE` | content/panel → SW | 更新划线批注 |
| `UPDATE_HIGHLIGHT_RANGE` | content → SW | 高亮位置自愈后回写新的 range 偏移 |
| `GET_ALL_BOOKMARKS` | panel → SW | 获取所有收藏（含划线数组） |
| `GET_HIGHLIGHTS_FOR_URL` | content → SW | 获取当前页划线（用于恢复） |
| `GET_ALL_TAGS` | panel → SW | 获取标签列表 |
| `UPDATE_BOOKMARK_TAGS` | panel → SW | 更新收藏标签 |
| `DELETE_TAG` | panel → SW | 从所有收藏中删除指定标签 |
| `GET_SETTINGS` | content/panel → SW | 获取设置 |
| `SAVE_SETTINGS` | panel → SW | 保存设置 |
| `GET_DUE_REVIEWS` | panel → SW | 获取今日到期的复习划线 |
| `UPDATE_REVIEW_RESULT` | panel → SW | 写入复习评分并更新 SM-2 状态 |
| `UPDATE_HIGHLIGHT_TAGS` | panel → SW | 更新高亮级标签 |
| `TOGGLE_SIDE_PANEL` | content → SW | 打开或关闭侧边面板 |

---

### 2. 内容脚本（`content/content.js`）

**注入时机：** `run_at: document_idle`（DOM 加载完成后）

**防重复注入：** 通过 `window.__markbuddy_initialized` 标志位保护。

#### 高亮位置序列化方案

采用 **稳定祖先 XPath + 文本偏移量** 序列化 `Range`：

```
选区 Range
  ├── stable ancestor → parentXPath: /html/body/article/p[2]
  ├── startOffset: 42
  ├── endOffset: 87
  └── text: "selected text snapshot"
```

还原时通过 `document.evaluate()` 反查稳定祖先元素，再按文本偏移量重建 Range 并包裹 `<mark>` 元素。

**失效处理：** 若 XPath 节点不存在（页面结构改变），跳过该条高亮，保留数据不删除。

**轻量自愈：**
- 如果旧偏移能生成 Range，但 Range 文本与保存的 `serializedRange.text` 不一致，内容脚本不会盲目高亮错位置。
- 内容脚本会在同一稳定祖先元素的纯文本中查找保存的原文快照。
- 如果找到匹配文本，则用新的 `startOffset` / `endOffset` 重建 Range，并通过 `UPDATE_HIGHLIGHT_RANGE` 回写 storage。
- 如果找不到匹配文本，则跳过该条高亮，保留数据，避免错误高亮误导用户。

#### 浮动工具栏

- 监听 `mouseup` 事件，检测到非空选区后 10ms 延迟渲染工具栏
- 工具栏位置：选区矩形上方居中，越界时自动翻转到下方
- 包含：「🔖 收藏页面」「🖊️ 高亮划线」 + 颜色选择小圆点
- `Escape` 键 / 点击工具栏外部 → 隐藏

---

### 3. 侧边面板（`side-panel/panel.js`）

**数据流：**
```
panel 启动 → GET_ALL_BOOKMARKS → 渲染列表
用户搜索/过滤 → 客户端过滤（不重复请求 SW）
用户操作 → 发送消息到 SW → SW 响应后重新拉取列表
```

**搜索逻辑（客户端）：**
- 关键词同时匹配：`bookmark.title`、`bookmark.url`、`highlight.text`
- 匹配结果中高亮关键词（`<mark class="search-match">`）

**标签过滤：**
- 支持多标签同时选中（OR 逻辑：收藏含任一所选标签则显示）
- 「全部」按钮清除所有选中

**复习队列准入：**
- 每条高亮旁边提供“+ 复习 / 复习中”按钮。
- 点击按钮会根据当前设置中的 `reviewTag` 更新该高亮的 `tags`。
- `GET_DUE_REVIEWS` 只返回包含当前复习标签的高亮，确保复习是主动选择而不是默认强加。
- 兼容旧数据：只有 `active === false` 的高亮会被排除；缺失 `active` 字段的历史高亮仍视为有效。

**Markdown 导出：**
- 顶部导出按钮打开导出对话框。
- 支持导出全部收藏、当前搜索/标签过滤结果，以及单个网页。
- 导出内容包含页面标题、URL、收藏时间、标签、高亮原文、备注和来源链接。
- 使用 Blob + 临时 `<a download>` 触发本地 `.md` 文件下载，不新增 `downloads` 权限。

**JSON 备份/恢复：**
- 设置面板提供“导出 JSON 备份”和“导入 JSON 备份”。
- 备份覆盖 `bookmarks`、`highlights`、`tags`、`settings`、`groupByDomain`、`sortBy`。
- 导入前会校验 MarkBuddy 备份文件格式，并二次确认覆盖当前本地数据。
- 导入时会为缺失 key 补齐安全默认值，避免旧本地数据和备份数据混合。
- JSON 备份用于完整恢复扩展状态，Markdown 导出用于阅读内容流转，两者用途不同。

---

### 4. Markdown 导出格式化器（`side-panel/export-markdown.js`）

**职责：**
- `formatBookmarksAsMarkdown(bookmarks, options)`：将 bookmark/highlight 数据转换为可读 Markdown。
- `buildExportFilename(label, exportedAt)`：根据导出标题和日期生成稳定文件名。

**设计边界：**
- 该模块只处理数据格式化，不读取 Chrome API，不操作 DOM。
- 通过 UMD 风格暴露接口：浏览器中挂载到 `window.MarkBuddyExport`，Node 测试中通过 `module.exports` 使用。
- 标题、标签和备注会做结构安全处理，避免用户内容中的换行或 Markdown 结构符破坏导出文档层级。
- Markdown 导出是数据流转出口，不等同于 JSON 备份/恢复；后者仍属于未来的数据迁移与灾备能力。

---

### 5. 复习标签辅助函数（`side-panel/review-tags.js`）

**职责：**
- `normalizeReviewTag(value)`：清洗复习标签，空值回退为“学习”。
- `hasReviewTag(tags, reviewTag)`：判断高亮是否已进入当前复习队列。
- `toggleReviewTag(tags, reviewTag)`：为高亮加入或移除当前复习标签，并去重。

**设计边界：**
- 该模块只处理标签数组，不访问 Chrome API，不操作 DOM。
- 侧边栏负责调用 `UPDATE_HIGHLIGHT_TAGS` 将结果写回存储。

---

### 6. JSON 备份辅助函数（`side-panel/backup-data.js`）

**职责：**
- `createBackupPayload(storageSnapshot, options)`：从允许的本地存储 key 生成备份载荷。
- `parseBackupPayload(text)`：解析并校验用户选择的备份文件。
- `buildBackupFilename(exportedAt)`：生成 `markbuddy-backup-YYYY-MM-DD.json` 文件名。

**设计边界：**
- 该模块只处理备份格式和校验，不直接访问 Chrome API，不操作 DOM。
- 导入只接受 `app: "MarkBuddy"` 且 `version: 1` 的备份文件。
- 未知字段不会写回本地存储，避免外部 JSON 污染扩展状态。
- 缺失字段会补齐为默认空数据或默认偏好，保证恢复语义稳定。

---

## 关键技术决策

### 为什么用稳定祖先 XPath 而非 CSS Selector？

CSS Selector 无法直接定位文本节点，也无法稳定表达“某个元素内的第几个字符偏移”。当前实现用 XPath 定位相对稳定的祖先元素，再用文本偏移量重建 Range；旧版 `text()[n]` XPath 数据仍保留兼容恢复分支。

### 为什么内容脚本通过 `window.__markbuddy_*` 暴露函数？

Service Worker 通过 `scripting.executeScript` 调用这些函数触发右键菜单动作，这是 MV3 中从 SW 调用内容脚本逻辑的标准方式。

### 为什么不用 `activeTab` 从侧边面板操作？

`activeTab` 仅在直接用户手势（点击图标、右键菜单）时生效，**侧边面板按钮点击不属于直接手势**。当前实现中，面板依赖 `tabs` 权限读取/更新当前 tab，内容脚本则通过 `content_scripts.matches: ["<all_urls>"]` 自动注入网页；manifest 没有单独声明 `host_permissions` 字段。

---

## 验证计划

### 核心功能测试

| 场景 | 预期结果 |
|------|----------|
| 选中文字 → 点击「高亮划线」 | 文字出现黄色背景高亮，Toast 提示成功 |
| 刷新页面 | 高亮自动恢复到相同位置 |
| 悬停高亮 → 点击删除 | 高亮消失，Toast 提示删除 |
| 侧边面板搜索关键词 | 实时过滤，关键词高亮显示 |
| 切换系统深/浅色 | 面板主题自动跟随 |
| 右键菜单「收藏此网页」 | 面板列表中出现该页，Toast 确认 |

### 边界场景

| 场景 | 处理方式 |
|------|----------|
| SPA 页面（history 路由跳转） | Service Worker 监听 `webNavigation.onHistoryStateUpdated` 并通知内容脚本分阶段重新恢复高亮 |
| 页面结构变化导致 XPath 失效 | 跳过恢复，数据保留，不崩溃 |
| 同一文本节点多次划线（重叠） | 使用 try/catch 降级，跳过有冲突的高亮 |
| `chrome.storage.local` 接近上限 | 暂不处理（v1），后续版本添加提示 |
