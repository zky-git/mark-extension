# 知识资产型 UI 实现计划

> **For agentic workers:** If available, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 将 MarkBuddy 侧边栏从“功能陈列型高亮工具”调整为“知识资产型摘录库”，建立 `摘录库 / 今日重温 / 数据资产` 三个清晰工作区，并优化摘录卡片、重温页、导出和同步入口。

**设计依据:** `docs/superpowers/specs/2026-07-10-knowledge-asset-ui-design.md`

**架构:** 保持现有 Chrome MV3、本地存储、复习状态、Git 同步和备份数据模型不变。主要改动集中在 `side-panel` UI 层：`panel.html` 提供工作区结构，`panel.js` 管理工作区切换和渲染状态，`panel.css` 调整信息层级，`git-sync.js` 和 `export-markdown.js` 复用现有能力并补齐数据资产入口。

**技术栈:** Chrome Extension Manifest V3、原生 JavaScript、原生 CSS、Node.js 断言测试。

---

### 任务 1：建立三工作区信息架构

**文件:**
- 修改: `side-panel/panel.html`
- 修改: `side-panel/panel.css`
- 修改: `side-panel/panel.js`
- 修改: `tests/panel-structure.test.js`

- [ ] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加结构断言：

```js
assert.match(html, /id="workspace-tabs"/, 'panel should expose workspace tabs');
assert.match(html, /data-workspace="library"/, 'panel should include library workspace tab');
assert.match(html, /data-workspace="review"/, 'panel should include review workspace tab');
assert.match(html, /data-workspace="data"/, 'panel should include data asset workspace tab');
assert.match(html, /id="library-workspace"/, 'panel should include library workspace');
assert.match(html, /id="data-workspace"/, 'panel should include data asset workspace');
assert.match(panelJs, /setActiveWorkspace/, 'panel.js should manage active workspace switching');
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
```

预期：失败，因为当前没有工作区标签和 `setActiveWorkspace`。

- [ ] **步骤 3：实现工作区结构**

在 header 下方新增顶部紧凑分段入口：

```txt
摘录库 | 今日重温 | 数据资产
```

将现有搜索、标签、统计和收藏列表包进 `library-workspace`。新增 `data-workspace` 空容器，先隐藏。今日重温保留现有 overlay/page 结构，但工作区入口可以在有待重温时切换到重温模式。

在 `panel.js` 中新增：

```js
let activeWorkspace = 'library';

function setActiveWorkspace(workspace) {
  activeWorkspace = workspace;
  // update tab selected state and workspace visibility
}
```

确保默认进入 `library`，设置页打开时仍覆盖主工作区，返回时恢复之前的工作区。

- [ ] **步骤 4：补充样式**

在 `panel.css` 中新增工作区 tabs、active 状态、隐藏状态和窄宽度适配。顶部入口应占用较小高度，不影响侧边栏首屏可见摘录数量。

- [ ] **步骤 5：验证**

运行：

```bash
node tests/panel-structure.test.js
```

预期：通过。

### 任务 2：重构摘录库卡片层级与文案

**文件:**
- 修改: `side-panel/panel.js`
- 修改: `side-panel/panel.css`
- 修改: `tests/panel-structure.test.js`

- [ ] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.match(panelJs, /knowledge-card/, 'bookmark items should render as knowledge cards');
assert.match(panelJs, /highlight-preview/, 'highlight text should be rendered as excerpt preview');
assert.match(panelJs, /稍后重温/, 'review action should use knowledge asset wording');
assert.match(panelJs, /已加入重温/, 'active review state should use knowledge asset wording');
assert.match(panelJs, /今天该看/, 'due review state should use knowledge asset wording');
assert.doesNotMatch(panelJs, /条想法 \\/ 划线/, 'old idea/highlight wording should not be the primary card label');
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
```

预期：失败，因为当前卡片仍使用旧类名和旧文案。

- [ ] **步骤 3：实现卡片结构**

在收藏渲染函数中将卡片主结构调整为：

```txt
标题
来源 · 保存时间 · 标签
摘录预览列表
备注预览
操作区
```

实现规则：

- 标题和摘录预览为主视觉。
- 域名、保存时间、标签、数量统计降级为 metadata。
- 每个网页默认展示最多 3 条摘录，超过时显示“还有 N 条摘录”。
- 空状态文案改为“还没有摘录 / 保存为你的第一条知识片段”。
- 搜索 placeholder 改为“搜索标题、来源、摘录或备注...”。
- 统计文案改为“N 个来源 · N 条摘录”。

- [ ] **步骤 4：实现重温状态文案**

在单条摘录操作区中根据状态显示：

```txt
未启用 review.enabled：稍后重温
已启用但未到期：已加入重温
已启用且到期：今天该看
```

取消重温入口放入二级操作或保留在已加入状态按钮点击后的确认流程，避免默认展示红色取消按钮。

- [ ] **步骤 5：补充样式**

新增 `.knowledge-card`、`.knowledge-card-meta`、`.highlight-preview`、`.knowledge-actions` 等样式。卡片半径和阴影保持克制，摘录文本可读性优先。

- [ ] **步骤 6：验证**

运行：

```bash
node tests/panel-structure.test.js
node tests/service-worker-review.test.js
```

预期：全部通过，复习状态逻辑不变。

### 任务 3：优化今日重温专注页

**文件:**
- 修改: `side-panel/panel.html`
- 修改: `side-panel/panel.js`
- 修改: `side-panel/review.css`
- 修改: `tests/panel-structure.test.js`
- 修改: `tests/service-worker-review.test.js`

- [ ] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.match(html, /id="review-source"/, 'review view should expose source context');
assert.match(html, /id="review-saved-at"/, 'review view should expose saved-at context');
assert.match(html, /不重要了/, 'review low-score button should use value wording');
assert.match(html, /再提醒我/, 'review medium-score button should use reminder wording');
assert.doesNotMatch(html, /暂时没用/, 'old low-score wording should be replaced');
assert.doesNotMatch(html, /再看看/, 'old medium-score wording should be replaced');
```

在 `tests/service-worker-review.test.js` 确认低评分不会关闭 `review.enabled`：

```js
await context.updateReviewResult('reviewEnabled', 1);
assert.equal(storageData.highlights.reviewEnabled.review.enabled, true);
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
node tests/service-worker-review.test.js
```

预期：结构测试失败。服务端测试如果当前已经保持 enabled，则保持通过；否则先记录行为差异。

- [ ] **步骤 3：调整重温 HTML 和文案**

将重温页结构调整为：

```txt
今日重温  1 / N  退出
来源
保存于
摘录卡片 + 我的笔记
跳转原文
不重要了 / 再提醒我 / 仍然有用
```

按钮文案映射：

- `不重要了` 仍发送低评分。
- `再提醒我` 仍发送中间评分。
- `仍然有用` 仍发送高评分。

不要在低评分时自动关闭 `review.enabled`。

- [ ] **步骤 4：调整重温样式**

减少页面中段空白，让来源、保存时间、摘录卡片和跳转原文形成紧凑上下文。底部三按钮保持固定且不遮挡内容。

- [ ] **步骤 5：验证**

运行：

```bash
node tests/panel-structure.test.js
node tests/service-worker-review.test.js
```

预期：全部通过。

### 任务 4：建设数据资产工作区

**文件:**
- 修改: `side-panel/panel.html`
- 修改: `side-panel/panel.css`
- 修改: `side-panel/panel.js`
- 修改: `side-panel/git-sync.js`
- 修改: `tests/panel-structure.test.js`
- 修改: `tests/git-sync-service-worker.test.js`

- [ ] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.match(html, /数据资产/, 'data asset workspace should be visible in markup');
assert.match(html, /id="markdown-export-section"/, 'data workspace should include markdown export section');
assert.match(html, /id="git-sync-asset-section"/, 'data workspace should include git sync asset section');
assert.match(html, /id="backup-asset-section"/, 'data workspace should include backup section');
assert.match(html, /id="copy-markdown-btn"/, 'data workspace should support copying markdown');
assert.match(html, /同步到仓库/, 'git push wording should be user-facing');
assert.match(html, /从仓库恢复数据/, 'git pull wording should be user-facing');
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
```

预期：失败，因为数据资产工作区尚未实现。

- [ ] **步骤 3：迁移导出和备份入口**

将 Markdown 导出入口从单一 header 图标扩展到数据资产工作区：

```txt
Markdown 导出
- 导出当前结果
- 导出全部摘录
- 复制 Markdown
```

将 JSON 备份入口从设置页迁移或镜像到数据资产工作区：

```txt
完整备份
- 导出完整备份
- 导入完整备份
```

设置页可以保留高级偏好，但不应是备份和同步的唯一入口。

- [ ] **步骤 4：重组 Git 同步状态展示**

在数据资产工作区添加 Git 同步状态卡：

```txt
已连接 owner/repo
上次同步时间
Commit
同步到仓库
从仓库恢复数据
同步设置
```

未配置时展示引导卡：

```txt
把摘录同步到你自己的 GitHub 仓库
保留版本历史，不经过 MarkBuddy 服务器。
开始配置
```

`同步设置` 可以打开现有设置页中的 Git 配置 details，或在数据资产工作区展开同一组表单。第一版优先复用现有 `git-sync.js` 表单逻辑。

- [ ] **步骤 5：验证**

运行：

```bash
node tests/panel-structure.test.js
node tests/git-sync-service-worker.test.js
node tests/github-provider.test.js
node tests/git-sync-engine.test.js
```

预期：全部通过。

### 任务 5：优化 Markdown 输出并支持复制

**文件:**
- 修改: `side-panel/export-markdown.js`
- 修改: `side-panel/panel.js`
- 修改: `tests/export-markdown.test.js`
- 修改: `tests/panel-structure.test.js`

- [ ] **步骤 1：写失败测试**

在 `tests/export-markdown.test.js` 增加断言：

```js
assert.match(markdown, /^## Python3 字典 \\| 菜鸟教程/m);
assert.match(markdown, /- Source: https:\\/\\//);
assert.match(markdown, /- Saved: 2026-07-07/);
assert.match(markdown, /- Tags: #python/);
assert.match(markdown, /^> 删除字典元素/m);
assert.match(markdown, /笔记：/);
assert.doesNotMatch(markdown, /1\\. Highlight/);
assert.doesNotMatch(markdown, /^Highlights$/m);
```

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.match(panelJs, /copyMarkdown/, 'panel should expose copy markdown action');
assert.match(panelJs, /navigator\.clipboard\.writeText/, 'copy markdown should use clipboard API');
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/export-markdown.test.js
node tests/panel-structure.test.js
```

预期：失败，因为当前 Markdown 仍是旧结构，且没有复制入口。

- [ ] **步骤 3：调整 Markdown 生成格式**

将导出格式调整为：

```markdown
## 页面标题

- Source: URL
- Saved: 日期
- Tags: #tag

> 摘录文本

笔记：
备注内容
```

规则：

- 多条摘录按页面聚合。
- 没有标签时省略 `Tags` 行。
- 没有备注时省略 `笔记：`。
- 单条摘录不再默认输出 `1. Highlight`。

- [ ] **步骤 4：实现复制 Markdown**

在 `panel.js` 中新增 `copyMarkdown(scope)`，复用导出模块生成当前结果或全部摘录的 Markdown 字符串，然后调用：

```js
await navigator.clipboard.writeText(markdown);
```

成功提示“Markdown 已复制”，失败提示“复制失败，请改用下载”。

- [ ] **步骤 5：验证**

运行：

```bash
node tests/export-markdown.test.js
node tests/panel-structure.test.js
```

预期：全部通过。

### 任务 6：设置页减负与回归验证

**文件:**
- 修改: `side-panel/panel.html`
- 修改: `side-panel/panel.css`
- 修改: `side-panel/panel.js`
- 修改: `tests/panel-structure.test.js`

- [ ] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.match(html, /主题显示/, 'settings should keep theme preference');
assert.match(html, /默认高亮颜色/, 'settings should keep highlight color preference');
assert.match(html, /按域名分组/, 'settings should keep domain grouping preference');
assert.match(html, /唤醒收藏/, 'settings should keep review preference');
assert.doesNotMatch(html, /<label class="settings-label">数据备份<\\/label>/, 'backup should no longer be settings-only primary section');
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
```

预期：如果备份仍主要在设置页，测试失败。

- [ ] **步骤 3：调整设置页**

设置页保留偏好配置：

- 默认高亮颜色
- 自定义颜色
- 主题显示
- 按域名分组
- 唤醒收藏
- 同步高级配置入口

备份和同步的主入口在数据资产工作区。设置页可以保留“同步设置”细节，但文案应表达这是高级配置。

- [ ] **步骤 4：完整验证**

运行：

```bash
node tests/service-worker-review.test.js
node tests/git-sync-service-worker.test.js
node tests/github-provider.test.js
node tests/git-sync-engine.test.js
node tests/panel-structure.test.js
node tests/backup-data.test.js
node tests/export-markdown.test.js
node tests/content-highlight-dom.test.js
node tests/text-range-healer.test.js
node tests/manifest-commands.test.js
node tests/package-script.test.js
```

预期：全部通过。

- [ ] **步骤 5：检查 diff**

运行：

```bash
git diff --check
git diff --stat
```

预期：没有空白错误，改动范围集中在 `side-panel` UI、Markdown 导出测试和相关结构测试。

- [ ] **步骤 6：提交**

提交信息：

```txt
feat: reshape side panel as knowledge asset library
```
