# 开发任务清单（Tasks）

> 按阶段跟踪构建进度。状态：`[x]` 已完成 · `[/]` 进行中 · `[ ]` 待完成

---

## Phase 1 — 基础架构

- [x] `manifest.json` — Manifest V3 配置，声明权限、入口、内容脚本
- [x] 图标资源生成 — `icons/icon-16.png`, `icon-48.png`, `icon-128.png`
- [x] `service-worker.js` — 后台框架，注册右键菜单，设置侧边面板行为
- [x] `content/content.css` — 高亮样式、浮动工具栏样式、Toast 样式

## Phase 2 — 核心功能

- [x] `content/content.js` — 浮动工具栏渲染与定位
- [x] XPath 选区序列化 / 反序列化
- [x] 页面加载时批量恢复高亮（`requestAnimationFrame` 分批处理）
- [x] 收藏网页（`__markbuddy_savePage`）
- [x] 保存划线（`__markbuddy_saveHighlight`，自动关联 bookmark）
- [x] 删除高亮（悬停按钮 + DOM 恢复）
- [x] Toast 通知（操作结果反馈）

## Phase 3 — 侧边面板

- [x] `side-panel/panel.html` — 结构：Header / 设置面板 / 搜索 / 标签栏 / 列表 / 弹窗
- [x] `side-panel/panel.css` — CSS 变量主题系统，`prefers-color-scheme` 深/浅色适配
- [x] `side-panel/panel.js` — 数据加载与列表渲染
- [x] 收藏卡片：favicon + 标题 + 网址 + 时间 + 标签 + 操作按钮
- [x] 划线列表：二级展开/折叠，色点 + 原文展示
- [x] 实时搜索（关键词高亮）
- [x] 标签过滤（多选 OR 逻辑）
- [x] 设置面板：预设颜色选择 + 自定义颜色输入

## Phase 4 — 完善与边界处理

- [x] 删除网页收藏（级联删除关联划线）
- [x] 删除单条划线（面板内操作）
- [x] 标签管理（添加标签 Modal，支持选择已有标签）
- [x] 颜色设置持久化（`chrome.storage.local` → settings key）
- [x] 所有 async 操作添加 try/catch 错误处理
- [x] XPath 失效时降级跳过，不崩溃

---

## 待规划（v2+）

- [ ] SPA 页面路由变化时重新触发高亮恢复
- [ ] 划线附加备注/笔记功能
- [ ] 数据导出（JSON 格式备份）
- [ ] 键盘快捷键支持
- [ ] `chrome.storage` 使用量展示与清理
- [ ] 收藏列表排序（按时间 / 按域名 / 按标签）
