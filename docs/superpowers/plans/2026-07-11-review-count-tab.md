# 待重温数量并入 Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除独立待重温横幅，并在“今日重温”tab 中显示当前待重温数量。

**Architecture:** HTML 为重温 tab 提供数量节点。`panel.js` 使用既有待重温查询更新该节点，并在重温状态变化时重新同步。结构测试覆盖标记、横幅移除和同步逻辑。

**Tech Stack:** 原生 HTML、JavaScript、Node.js `assert`。

## Global Constraints

- 数量格式固定为 `今日重温（N）`，包括 `N = 0`。
- 不改变队列、排期、扩展徽标或进入重温的交互。
- `GET_DUE_REVIEWS` 是数量的唯一数据来源。

---

### Task 1: 将待重温数量迁移到工作区标签

**Files:**

- Modify: `tests/panel-structure.test.js:142-145,543-549`
- Modify: `side-panel/panel.html:58-62,202-208`
- Modify: `side-panel/panel.js:1448-1600`

**Interfaces:**

- Consumes: `sendMessage('GET_DUE_REVIEWS')`，返回待重温条目数组或空值。
- Produces: `updateReviewTabCount()`，将 `#review-workspace-tab-count` 更新为 `（N）`。

- [ ] **Step 1: 写入失败的结构测试**

在 `tests/panel-structure.test.js` 工作区标签断言后加入：

```js
assert.match(html, /id="review-workspace-tab-count">（0）<\\/span>/, 'review tab should reserve a zero-count label');
assert.doesNotMatch(html, /id="review-banner"/, 'review count should not render in a separate banner');
assert.match(panelJs, /async function updateReviewTabCount\(\)/, 'panel should refresh the review tab count');
assert.match(panelJs, /reviewTabCount\.textContent = `（\$\{due\.length\}）`/, 'review tab should show the due count in parentheses');
```

- [ ] **Step 2: 运行测试，确认它因缺少新结构而失败**

Run: `node tests/panel-structure.test.js`

Expected: FAIL，提示 `review tab should reserve a zero-count label`。

- [ ] **Step 3: 实现最小界面与同步逻辑**

在 `side-panel/panel.html` 将重温 tab 改为：

```html
<button class="workspace-tab" type="button" data-workspace="review" aria-selected="false">今日重温<span id="review-workspace-tab-count">（0）</span></button>
```

删除整个 `#review-banner` 块。将 `updateReviewBanner()` 替换为：

```js
async function updateReviewTabCount() {
  const reviewTabCount = document.getElementById('review-workspace-tab-count');
  if (!reviewTabCount) return;
  if (!isReviewFeatureEnabled()) {
    reviewTabCount.textContent = '（0）';
    return;
  }
  const due = await sendMessage('GET_DUE_REVIEWS');
  reviewTabCount.textContent = `（${due?.length || 0}）`;
}
```

将原有所有 `updateReviewBanner()` 调用改为 `updateReviewTabCount()`，并删除 `review-start-btn` 监听器。

- [ ] **Step 4: 运行结构测试，确认通过**

Run: `node tests/panel-structure.test.js`

Expected: PASS，输出 `panel structure tests passed`。

- [ ] **Step 5: 运行完整测试集并提交**

Run: `npm test`

Expected: PASS。

```bash
git add side-panel/panel.html side-panel/panel.js tests/panel-structure.test.js
git commit -m "feat: show review count in workspace tab"
```
