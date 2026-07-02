# 划线独立复习状态实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 将复习功能从“高亮标签驱动”改为“划线独立复习状态驱动”，并保持手动加入复习。

**架构:** 后台 `service-worker.js` 负责复习队列查询、复习开关和 SM-2 状态更新；侧边栏 `panel.js` 只读取 `highlight.review.enabled` 渲染复习按钮。设置页移除“复习标签”，普通标签和网页收藏逻辑不参与复习判断。

**技术栈:** Chrome Extension Manifest V3、原生 JavaScript、Chrome storage、本地 Node.js 断言测试。

---

### 任务 1：后台复习数据模型

**文件:**
- 修改: `service-worker.js`
- 修改: `tests/service-worker-review.test.js`

- [x] **步骤 1：写失败测试**

将 `tests/service-worker-review.test.js` 的测试数据改为同时包含旧标签、启用复习、未到期、禁用复习和 inactive 数据。断言：

```js
const due = await context.getDueReviews();
assert.deepEqual(Array.from(due, item => item.id), ['reviewEnabled']);

await context.updateHighlightReview('legacyTagOnly', true);
assert.equal(storageData.highlights.legacyTagOnly.review.enabled, true);
assert.equal(storageData.highlights.legacyTagOnly.tags.includes('学习'), true);

await context.updateReviewResult('legacyTagOnly', 5);
assert.equal(storageData.highlights.legacyTagOnly.review.sm2.repetitions, 1);

await context.updateHighlightReview('legacyTagOnly', false);
assert.equal(storageData.highlights.legacyTagOnly.review.enabled, false);
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/service-worker-review.test.js
```

预期：失败，原因是旧 `tags: ['学习']` 仍会被 `getDueReviews()` 识别，且 `updateHighlightReview` 不存在。

- [x] **步骤 3：实现后台逻辑**

在 `service-worker.js` 中：

```js
case 'UPDATE_HIGHLIGHT_REVIEW':
  sendResponse(await updateHighlightReview(message.payload.id, message.payload.enabled));
  break;
```

新增：

```js
function createInitialReviewState(enabled) {
  return {
    enabled,
    sm2: {
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewAt: 0,
    },
  };
}

async function updateHighlightReview(id, enabled) {
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };

  const current = highlights[id].review || {};
  highlights[id].review = {
    ...current,
    enabled: Boolean(enabled),
    sm2: current.sm2 || createInitialReviewState(Boolean(enabled)).sm2,
  };
  await setStorage('highlights', highlights);
  return { success: true, review: highlights[id].review };
}
```

修改 `getDueReviews()` 只判断 `h.review?.enabled === true` 和 `h.review?.sm2`。修改 `updateReviewResult()` 写入 `highlights[id].review.sm2`。

- [x] **步骤 4：运行测试确认通过**

运行：

```bash
node tests/service-worker-review.test.js
```

预期：通过。

### 任务 2：侧边栏复习按钮改用独立状态

**文件:**
- 修改: `side-panel/panel.js`
- 修改: `tests/panel-structure.test.js`

- [x] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.match(panelJs, /const inReview = h\.review\?\.enabled === true/, 'highlight review button should read independent review state');
assert.match(panelJs, /sendMessage\('UPDATE_HIGHLIGHT_REVIEW', \{ id: h\.id, enabled: !inReview \}\)/, 'highlight review button should toggle independent review state');
assert.doesNotMatch(panelJs, /toggleReviewTag\(h\.tags, settings\.reviewTag\)/, 'highlight review button should not toggle review through tags');
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
```

预期：失败，原因是当前按钮仍使用 `review-tags.js` 和 `UPDATE_HIGHLIGHT_TAGS`。

- [x] **步骤 3：实现侧边栏按钮**

在 `buildHighlightItem()` 中将复习按钮逻辑改为：

```js
const inReview = h.review?.enabled === true;
const reviewBtn = document.createElement('button');
reviewBtn.className = 'highlight-review-btn' + (inReview ? ' active' : '');
reviewBtn.title = inReview ? '移出复习队列' : '加入复习队列';
reviewBtn.setAttribute('aria-label', inReview ? '移出复习队列' : '加入复习队列');
reviewBtn.textContent = inReview ? '复习中' : '+';
reviewBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  await sendMessage('UPDATE_HIGHLIGHT_REVIEW', { id: h.id, enabled: !inReview });
  await loadAll();
});
```

- [x] **步骤 4：运行测试确认通过**

运行：

```bash
node tests/panel-structure.test.js
```

预期：通过。

### 任务 3：移除复习标签设置入口

**文件:**
- 修改: `side-panel/panel.html`
- 修改: `side-panel/panel.js`
- 修改: `tests/panel-structure.test.js`

- [x] **步骤 1：写失败测试**

在 `tests/panel-structure.test.js` 增加断言：

```js
assert.doesNotMatch(html, /id="review-tag-input"/, 'settings should not expose review tag input');
assert.doesNotMatch(panelJs, /review-tag-input/, 'panel.js should not wire review tag settings');
assert.doesNotMatch(panelJs, /settings\.reviewTag/, 'panel.js should not depend on reviewTag');
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
node tests/panel-structure.test.js
```

预期：失败，因为设置页仍有复习标签输入框，`panel.js` 仍会保存 `settings.reviewTag`。

- [x] **步骤 3：实现设置页清理**

从 `side-panel/panel.html` 删除复习标签输入块。保留一段静态说明即可：

```html
<div class="settings-section settings-row">
  <div class="settings-row-info">
    <span class="settings-row-label">划线复习</span>
    <span class="settings-row-desc">在划线条目上手动点击 +，将重要摘录加入复习队列</span>
  </div>
</div>
```

从 `side-panel/panel.js` 删除读取、恢复和保存 `review-tag-input` / `settings.reviewTag` 的代码。

- [x] **步骤 4：运行测试确认通过**

运行：

```bash
node tests/panel-structure.test.js
```

预期：通过。

### 任务 4：备份测试更新复习字段

**文件:**
- 修改: `tests/backup-data.test.js`

- [x] **步骤 1：写失败测试**

将备份测试中的高亮从旧 `sm2` 改为：

```js
review: {
  enabled: true,
  sm2: { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewAt: exportedAt },
}
```

断言改为：

```js
assert.equal(payload.data.highlights.h1.review.sm2.repetitions, 1);
```

- [x] **步骤 2：运行测试确认通过**

运行：

```bash
node tests/backup-data.test.js
```

预期：通过，因为备份按完整对象保存，不需要实现改动。

### 任务 5：清理旧复习标签辅助依赖

**文件:**
- 修改: `side-panel/panel.html`
- 删除或保留评估: `side-panel/review-tags.js`
- 修改或删除评估: `tests/review-tags.test.js`
- 修改: `tests/panel-structure.test.js`

- [x] **步骤 1：确认引用**

运行：

```bash
rg -n "review-tags|MarkBuddyReviewTags|getReviewTagHelper|reviewTag" .
```

预期：实现改完后不应再有运行时代码依赖 `review-tags.js`。

- [x] **步骤 2：清理脚本加载和测试**

如果没有引用，从 `side-panel/panel.html` 删除：

```html
<script src="review-tags.js"></script>
```

并删除 `side-panel/review-tags.js` 与 `tests/review-tags.test.js`。如果删除文件风险过大，则保留文件但确保不再加载、不再测试。

- [x] **步骤 3：运行结构测试**

运行：

```bash
node tests/panel-structure.test.js
```

预期：通过，且不再要求 `review-tags.js` 出现在脚本顺序中。

### 任务 6：最终验证

**文件:**
- 修改: `README.md` 或 `CHROMEWEBSTORE.md` 仅在现有文案仍错误时调整。

- [x] **步骤 1：运行相关测试**

运行：

```bash
node tests/service-worker-review.test.js
node tests/panel-structure.test.js
node tests/backup-data.test.js
node tests/export-markdown.test.js
node tests/content-highlight-dom.test.js
```

预期：全部通过。

- [x] **步骤 2：检查复习标签残留**

运行：

```bash
rg -n "复习标签|reviewTag|getReviewTagHelper|UPDATE_HIGHLIGHT_TAGS|h\\.sm2|\\.sm2" service-worker.js side-panel tests README.md CHROMEWEBSTORE.md
```

预期：不应存在仍用于复习逻辑的 `reviewTag`、`getReviewTagHelper`、`h.sm2`。`UPDATE_HIGHLIGHT_TAGS` 只允许作为普通标签接口存在。

- [x] **步骤 3：检查工作区差异**

运行：

```bash
git diff --stat
```

预期：差异集中在复习模型、侧边栏 UI、测试和必要文案。

### 任务 7：提醒化文案与徽标同步

**文件:**
- 修改: `manifest.json`
- 修改: `service-worker.js`
- 修改: `content/content.js`
- 修改: `content/content.css`
- 修改: `side-panel/panel.html`
- 修改: `side-panel/panel.js`
- 修改: `side-panel/panel.css`
- 修改: `tests/manifest-commands.test.js`
- 修改: `tests/panel-structure.test.js`
- 修改: `tests/service-worker-review.test.js`
- 修改: `README.md`
- 修改: `CHROMEWEBSTORE.md`

- [x] **步骤 1：调整用户可见文案**

将侧边栏里的“复习”表达改成“唤醒收藏 / 今日重温 / 提醒我再看 / 不再提醒”，并把三档反馈调整为“暂时没用 / 再看看 / 仍然有用”。

- [x] **步骤 2：增加待重温徽标**

后台新增定时刷新逻辑，使用 `chrome.alarms` 每小时刷新 Chrome 扩展图标徽标，并通过 `REVIEW_BADGE_UPDATED` 向内容脚本同步网页浮动入口徽标。

- [x] **步骤 3：补齐测试和文档**

测试覆盖 `alarms` 权限、后台徽标刷新、内容脚本徽标节点和可见文案；文档同步描述“唤醒收藏”、待重温徽标和新增权限用途。
