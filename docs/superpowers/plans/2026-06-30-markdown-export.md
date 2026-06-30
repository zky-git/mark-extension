# Markdown 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MarkBuddy 增加 Markdown 导出能力，让用户可以导出全部、当前筛选结果或单个网页的高亮内容，避免数据困在浏览器扩展中。

**Architecture:** 新增一个独立的 Markdown 格式化模块，既能在浏览器侧边栏中通过 `window.MarkBuddyExport` 使用，也能在 Node 测试中通过 `module.exports` 验证。侧边栏只负责选择导出范围、调用格式化器并触发本地 `.md` 下载，不引入后端、账号、同步或笔记编辑器能力。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript、Side Panel DOM、Node.js `assert` 测试。

---

## 文件结构

- Create: `side-panel/export-markdown.js`
  - 负责 Markdown 文本生成、文件名生成、日期格式化、Markdown 可读性处理。
- Create: `tests/export-markdown.test.js`
  - 用 Node.js 测试导出内容、空数据、缺失字段和文件名。
- Modify: `side-panel/panel.html`
  - 加载导出模块，添加导出按钮和导出对话框。
- Modify: `side-panel/panel.js`
  - 增加导出范围选择、单页导出入口、Blob 下载、空结果提示。
- Modify: `side-panel/panel.css`
  - 为导出按钮、对话框和卡片导出按钮增加样式。
- Modify: `docs/tasks.md`
  - 把“Markdown 导出”记录为产品定位后的 P1 数据流转能力。

## 当前产品审查结论

- 找回主路径已有实现：高亮保存、页面恢复、侧边栏搜索、标签过滤、按域名分组、点击跳回页面。
- 复习辅助已有实现：复习标签、到期横幅、SM-2 评分、复习模式。
- 审查时发现复习准入存在入口缺口：后台只认高亮级 `tags`，但侧边栏缺少给单条高亮加入复习标签的直接入口。
- 数据自由缺口明显：当前没有 Markdown 导出入口，也没有可测试的导出格式化逻辑。
- 因此首批完善应先实现 Markdown 导出，而不是扩大为完整笔记系统、云同步或复杂导入导出。
- 同批补上轻量高亮级复习按钮，让“复习辅助”从后台能力变成可操作功能。

### Task 1: Markdown Formatter

**Files:**
- Create: `tests/export-markdown.test.js`
- Create: `side-panel/export-markdown.js`

- [x] **Step 1: Write the failing test**

Create `tests/export-markdown.test.js` with tests for:

```js
const assert = require('node:assert/strict');
const {
  formatBookmarksAsMarkdown,
  buildExportFilename,
} = require('../side-panel/export-markdown.js');

const bookmarks = [
  {
    title: 'React 性能笔记',
    url: 'https://example.com/react',
    savedAt: Date.UTC(2026, 5, 30),
    tags: ['技术', 'React'],
    highlights: [
      {
        text: 'memo 只解决重复渲染的一部分问题。',
        note: '适合作为性能章节引用。',
        savedAt: Date.UTC(2026, 5, 30),
      },
    ],
  },
];

const markdown = formatBookmarksAsMarkdown(bookmarks, {
  title: 'MarkBuddy Export',
  exportedAt: Date.UTC(2026, 5, 30),
});

assert.match(markdown, /^# MarkBuddy Export/);
assert.match(markdown, /Exported: 2026-06-30/);
assert.match(markdown, /## example\.com/);
assert.match(markdown, /### React 性能笔记/);
assert.match(markdown, /- URL: https:\/\/example\.com\/react/);
assert.match(markdown, /- Tags: 技术, React/);
assert.match(markdown, /> memo 只解决重复渲染的一部分问题。/);
assert.match(markdown, /Note: 适合作为性能章节引用。/);
assert.match(markdown, /Source: https:\/\/example\.com\/react/);

assert.equal(
  formatBookmarksAsMarkdown([], { exportedAt: Date.UTC(2026, 5, 30) }),
  ''
);

assert.equal(
  buildExportFilename('MarkBuddy Export', Date.UTC(2026, 5, 30)),
  'markbuddy-export-2026-06-30.md'
);

console.log('export-markdown tests passed');
```

- [x] **Step 2: Run test to verify it fails**

Run: `node tests/export-markdown.test.js`

Expected: FAIL with `Cannot find module '../side-panel/export-markdown.js'`.

- [x] **Step 3: Write minimal implementation**

Create `side-panel/export-markdown.js` with:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyExport = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toISOString().slice(0, 10);
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown-source';
    }
  }

  function sanitizeFilenamePart(value) {
    return String(value || 'markbuddy-export')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'markbuddy-export';
  }

  function quoteMarkdown(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => `> ${line}`)
      .join('\n');
  }

  function formatBookmarksAsMarkdown(bookmarks, options = {}) {
    const list = Array.isArray(bookmarks) ? bookmarks.filter(Boolean) : [];
    if (list.length === 0) return '';

    const title = options.title || 'MarkBuddy Export';
    const exportedAt = formatDate(options.exportedAt || Date.now());
    const lines = [`# ${title}`, '', `Exported: ${exportedAt}`, ''];
    const groups = new Map();

    list.forEach(bookmark => {
      const domain = getDomain(bookmark.url);
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(bookmark);
    });

    groups.forEach((items, domain) => {
      lines.push(`## ${domain}`, '');
      items.forEach(bookmark => {
        lines.push(`### ${bookmark.title || bookmark.url || 'Untitled Page'}`, '');
        if (bookmark.url) lines.push(`- URL: ${bookmark.url}`);
        if (bookmark.savedAt) lines.push(`- Saved: ${formatDate(bookmark.savedAt)}`);
        if (bookmark.tags && bookmark.tags.length) lines.push(`- Tags: ${bookmark.tags.join(', ')}`);
        lines.push('', '#### Highlights', '');

        const highlights = Array.isArray(bookmark.highlights) ? bookmark.highlights : [];
        if (highlights.length === 0) {
          lines.push('_No highlights saved for this page._', '');
        } else {
          highlights.forEach((highlight, index) => {
            lines.push(`##### ${index + 1}. Highlight`, '');
            lines.push(quoteMarkdown(highlight.text || ''));
            lines.push('');
            if (highlight.note) {
              lines.push(`Note: ${highlight.note}`, '');
            }
            if (bookmark.url) lines.push(`Source: ${bookmark.url}`, '');
          });
        }
      });
    });

    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }

  function buildExportFilename(label, exportedAt = Date.now()) {
    return `${sanitizeFilenamePart(label)}-${formatDate(exportedAt)}.md`;
  }

  return {
    formatBookmarksAsMarkdown,
    buildExportFilename,
  };
});
```

- [x] **Step 4: Run test to verify it passes**

Run: `node tests/export-markdown.test.js`

Expected: PASS with `export-markdown tests passed`.

### Task 2: Side Panel Export UI

**Files:**
- Modify: `side-panel/panel.html`
- Modify: `side-panel/panel.js`
- Modify: `side-panel/panel.css`

- [x] **Step 1: Add module and export dialog markup**

In `side-panel/panel.html`, add an export icon button to `.header-actions`, add an `export-dialog`, and load `export-markdown.js` before `panel.js`.

- [x] **Step 2: Add export behavior**

In `side-panel/panel.js`, add:

- `getCurrentExportScopeBookmarks()`
- `downloadMarkdown(markdown, filename)`
- `exportBookmarks(scope, bookmark)`
- export dialog listeners
- per-card export button in `buildBookmarkCard`

- [x] **Step 3: Add CSS**

In `side-panel/panel.css`, add styling for export dialog, scope buttons, status text, and footer export button.

- [x] **Step 4: Run browser-independent tests**

Run: `node tests/export-markdown.test.js`

Expected: PASS with `export-markdown tests passed`.

### Task 3: Product Docs Update

**Files:**
- Modify: `docs/tasks.md`
- Modify: `docs/implementation-plan.md`

- [x] **Step 1: Record the new capability**

Update docs in Chinese to reflect:

- Markdown export is a product positioning requirement.
- It supports all data, filtered results, and single-page export.
- It is separate from JSON backup/import.

- [x] **Step 2: Verify no placeholder markers**

Run a placeholder-marker scan across the plan and updated docs.

Expected: no matches for newly added content.

### Task 4: Final Verification

**Files:**
- Inspect: `manifest.json`
- Inspect: `side-panel/panel.html`
- Inspect: `side-panel/panel.js`

- [x] **Step 1: Verify tests**

Run: `node tests/export-markdown.test.js`

Expected: PASS with `export-markdown tests passed`.

- [x] **Step 2: Verify no unnecessary permissions**

Run: `rg -n "\"downloads\"|host_permissions|<all_urls>" manifest.json side-panel`

Expected: no new `downloads` permission; `<all_urls>` only remains in `content_scripts.matches` if present.

- [x] **Step 3: Inspect git diff**

Run: `git diff -- side-panel/export-markdown.js tests/export-markdown.test.js side-panel/panel.html side-panel/panel.js side-panel/panel.css docs/tasks.md docs/implementation-plan.md`

Expected: changes are scoped to Markdown export and docs.
