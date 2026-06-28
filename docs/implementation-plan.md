# 技术实现方案（Implementation Plan）

> 本文档描述 MarkBuddy v1.0 的完整技术架构、数据模型和各模块实现要点。

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
│   └── content.css            # 内容脚本注入样式
├── side-panel/
│   ├── panel.html             # 侧边面板结构
│   ├── panel.js               # 面板业务逻辑
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

**host_permissions：** `<all_urls>` — 内容脚本需在所有页面自动注入以恢复高亮。

---

## 数据模型

所有数据存储在 `chrome.storage.local`，共三个 key：

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
    serializedRange: {
      startXPath: string;  // 起点节点 XPath
      startOffset: number; // 起点文本偏移量
      endXPath: string;    // 终点节点 XPath
      endOffset: number;   // 终点文本偏移量
      text: string;        // 快照文本（用于失效检测）
    }
  }
}
```

### `tags`

```typescript
type Tags = string[]       // 所有已使用标签，排序后去重
```

### `settings`

```typescript
type Settings = {
  defaultColor: string;    // 默认高亮颜色
  presetColors: string[];  // 可选预设颜色列表
}
```

---

## 模块说明

### 1. Service Worker（`service-worker.js`）

**生命周期注意：** Service Worker 在无活动约 30s 后休眠，**不能用全局变量存状态**，所有状态必须持久化到 `chrome.storage`。

**职责：**
- `onInstalled`：注册右键菜单，设置 `openPanelOnActionClick`
- `contextMenus.onClicked`：通过 `scripting.executeScript` 调用内容脚本中的 `__markbuddy_savePage` / `__markbuddy_saveHighlight`
- `runtime.onMessage`：集中处理所有 CRUD 消息，统一 async/await 模式
- 存储操作：`saveBookmark`、`saveHighlight`、`deleteBookmark`、`deleteHighlight`、`getAllBookmarks`、`getHighlightsForUrl`、`updateBookmarkTags`

**消息类型（Message Types）：**

| type | 方向 | 说明 |
|------|------|------|
| `SAVE_BOOKMARK` | content/panel → SW | 保存网页收藏 |
| `SAVE_HIGHLIGHT` | content → SW | 保存划线，自动关联/创建 bookmark |
| `DELETE_BOOKMARK` | panel → SW | 删除网页及其所有划线 |
| `DELETE_HIGHLIGHT` | content/panel → SW | 删除单条划线 |
| `GET_ALL_BOOKMARKS` | panel → SW | 获取所有收藏（含划线数组） |
| `GET_HIGHLIGHTS_FOR_URL` | content → SW | 获取当前页划线（用于恢复） |
| `GET_ALL_TAGS` | panel → SW | 获取标签列表 |
| `UPDATE_BOOKMARK_TAGS` | panel → SW | 更新收藏标签 |
| `GET_SETTINGS` | content/panel → SW | 获取设置 |
| `SAVE_SETTINGS` | panel → SW | 保存设置 |

---

### 2. 内容脚本（`content/content.js`）

**注入时机：** `run_at: document_idle`（DOM 加载完成后）

**防重复注入：** 通过 `window.__markbuddy_initialized` 标志位保护。

#### 高亮位置序列化方案

采用 **XPath + 文本偏移量** 序列化 `Range`：

```
选区 Range
  ├── startContainer (Text Node) → XPath: /html/body/article/p[2]/text()[1]
  ├── startOffset: 42
  ├── endContainer (Text Node) → XPath: /html/body/article/p[2]/text()[1]
  └── endOffset: 87
```

还原时通过 `document.evaluate()` 反查节点，重建 Range 并包裹 `<mark>` 元素。

**失效处理：** 若 XPath 节点不存在（页面结构改变），跳过该条高亮，保留数据不删除。

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

---

## 关键技术决策

### 为什么用 XPath 而非 CSS Selector？

CSS Selector 无法唯一定位文本节点（同一元素可能有多个文本子节点），XPath 的 `text()[n]` 语法可精确定位第 n 个文本节点。

### 为什么内容脚本通过 `window.__markbuddy_*` 暴露函数？

Service Worker 通过 `scripting.executeScript` 调用这些函数触发右键菜单动作，这是 MV3 中从 SW 调用内容脚本逻辑的标准方式。

### 为什么不用 `activeTab` 从侧边面板操作？

`activeTab` 仅在直接用户手势（点击图标、右键菜单）时生效，**侧边面板按钮点击不属于直接手势**，因此改用 `tabs` + `host_permissions: <all_urls>` 组合。

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
| SPA 页面（history 路由跳转） | 内容脚本监听 URL 变化重新恢复高亮（v2 规划） |
| 页面结构变化导致 XPath 失效 | 跳过恢复，数据保留，不崩溃 |
| 同一文本节点多次划线（重叠） | 使用 try/catch 降级，跳过有冲突的高亮 |
| `chrome.storage.local` 接近上限 | 暂不处理（v1），后续版本添加提示 |
