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

const fallbackMarkdown = formatBookmarksAsMarkdown([
  {
    url: 'not a url',
    highlights: [
      {
        text: '第一行\n第二行',
      },
    ],
  },
], { exportedAt: Date.UTC(2026, 5, 30) });

assert.match(fallbackMarkdown, /## unknown-source/);
assert.match(fallbackMarkdown, /### not a url/);
assert.match(fallbackMarkdown, /> 第一行\n> 第二行/);
assert.doesNotMatch(fallbackMarkdown, /- Tags:/);
assert.doesNotMatch(fallbackMarkdown, /Note:/);

const structureSafeMarkdown = formatBookmarksAsMarkdown([
  {
    title: '# 标题\n下一行',
    url: 'https://example.com/markdown',
    tags: ['#tag', '换行\n标签'],
    highlights: [
      {
        text: '引用内容',
        note: '第一条\n- 不应变成导出文档的列表',
      },
    ],
  },
], { exportedAt: Date.UTC(2026, 5, 30) });

assert.match(structureSafeMarkdown, /### \\# 标题 下一行/);
assert.match(structureSafeMarkdown, /- Tags: #tag, 换行 标签/);
assert.match(structureSafeMarkdown, /Note:\n\n> 第一条\n> - 不应变成导出文档的列表/);

console.log('export-markdown tests passed');
