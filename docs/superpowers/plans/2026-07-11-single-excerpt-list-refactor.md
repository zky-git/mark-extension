# Single Excerpt List Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated excerpt preview and collapse layers so each saved page renders one always-visible excerpt list.

**Architecture:** `buildBookmarkCard()` will render only the existing detailed highlight items. The preview builder and expansion session state will be removed. CSS will make `.highlights-list` visible by default and flatten its visual treatment without changing highlight business actions.

**Tech Stack:** Chrome MV3 side panel, vanilla JavaScript, CSS, Node.js assertion tests.

## Global Constraints

- Preserve bookmark, highlight, note, review, export and sync data models.
- Do not add dependencies.
- Each excerpt and its note must be rendered once per page card.
- Do not retain an expand, collapse or preview interaction.

---

### Task 1: Lock the single-list contract with tests

**Files:**
- Modify: `tests/panel-structure.test.js`

**Interfaces:**
- Consumes: the current source strings loaded as `panelJs` and `panelCss`.
- Produces: structural guardrails for the one-list UI.

- [ ] **Step 1: Write the failing test**

Add assertions before `console.log`:

```js
assert.doesNotMatch(panelJs, /highlight-preview-list/, 'cards should not render a duplicate excerpt preview list');
assert.doesNotMatch(panelJs, /card-expand-btn/, 'cards should not render an expand control');
assert.doesNotMatch(panelJs, /expandedBookmarkUrls/, 'cards should not keep expansion state');
assert.match(panelJs, /hlList\.className = 'highlights-list'/, 'cards should keep one detailed excerpt list');
assert.doesNotMatch(panelCss, /\.highlights-list\.open/, 'excerpt lists should not depend on an open state');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/panel-structure.test.js`

Expected: failure because preview, expansion controls and state are still present.

- [ ] **Step 3: Commit test-only change**

```bash
git add tests/panel-structure.test.js
git commit -m "test: define single excerpt list structure"
```

### Task 2: Render one permanent excerpt list

**Files:**
- Modify: `side-panel/panel.js`
- Modify: `side-panel/panel.css`
- Modify: `tests/panel-structure.test.js`

**Interfaces:**
- Consumes: `buildHighlightItem(highlight, pageUrl)` to preserve existing item actions.
- Produces: `buildBookmarkCard(bookmark)` with one `.highlights-list` containing all `buildHighlightItem` results.

- [ ] **Step 1: Remove preview and expansion state from JavaScript**

Delete the `expandedBookmarkUrls` declaration. In `buildBookmarkCard`, delete the `highlight-preview-list` creation block, `card-expand-btn`, its click listener, search auto-expansion, and restored expansion handling. Build the detailed list directly:

```js
const hlList = document.createElement('div');
hlList.className = 'highlights-list';
highlights.forEach(highlight => {
  hlList.appendChild(buildHighlightItem(highlight, bm.url));
});
if (highlights.length > 0) card.appendChild(hlList);
```

Keep the existing export button in a compact `.card-footer` only.

- [ ] **Step 2: Flatten card CSS**

Delete `.highlight-preview-*`, `.card-expand-btn`, `.expand-arrow`, `.expanded` and `.highlights-list.open` rules. Replace the base list rule with:

```css
.highlights-list {
  border-top: 1px solid var(--border);
}

.highlight-wrapper {
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
}
```

Keep the last wrapper border removal rule and existing note/action styles.

- [ ] **Step 3: Run focused tests to verify green**

Run:

```bash
node tests/panel-structure.test.js
node tests/service-worker-review.test.js
```

Expected: both commands print their passed messages.

- [ ] **Step 4: Commit implementation**

```bash
git add side-panel/panel.js side-panel/panel.css tests/panel-structure.test.js
git commit -m "refactor: render one excerpt list per page"
```

### Task 3: Full regression and review

**Files:**
- Verify: `side-panel/panel.js`
- Verify: `side-panel/panel.css`
- Verify: `tests/*.test.js`

**Interfaces:**
- Consumes: the complete extension test suite.
- Produces: verified single-list behavior with no data-model regressions.

- [ ] **Step 1: Run all Node tests**

```bash
for test in tests/service-worker-review.test.js tests/git-sync-service-worker.test.js tests/github-provider.test.js tests/git-sync-engine.test.js tests/panel-structure.test.js tests/backup-data.test.js tests/export-markdown.test.js tests/content-highlight-dom.test.js tests/text-range-healer.test.js tests/manifest-commands.test.js tests/package-script.test.js; do node "$test" || exit 1; done
```

Expected: every test prints a passed message and exits with status 0.

- [ ] **Step 2: Check the final diff**

```bash
git diff --check
git diff --stat HEAD~1
```

Expected: no whitespace errors; changes limited to the side-panel presentation and structure test.
