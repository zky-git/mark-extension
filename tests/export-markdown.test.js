const assert = require('node:assert/strict');
const {
  formatBookmarksAsMarkdown,
  buildExportFilename,
} = require('../side-panel/export-markdown.js');

const bookmarks = [
  {
    title: 'Python3 字典 | 菜鸟教程',
    url: 'https://www.runoob.com/python3/python3-dictionary.html',
    savedAt: Date.UTC(2026, 6, 7),
    tags: ['python', '基础语法'],
    highlights: [
      {
        text: '删除字典元素',
        note: '列表删除单个元素可用 del。',
      },
    ],
  },
];

const markdown = formatBookmarksAsMarkdown(bookmarks, {
  title: 'MarkBuddy Export',
  exportedAt: Date.UTC(2026, 6, 7),
});

assert.match(markdown, /^## Python3 字典 \| 菜鸟教程/m);
assert.match(markdown, /- Source: https:\/\//);
assert.match(markdown, /- Saved: 2026-07-07/);
assert.match(markdown, /- Tags: #python #基础语法/);
assert.match(markdown, /^> 删除字典元素/m);
assert.match(markdown, /笔记：/);
assert.doesNotMatch(markdown, /1\. Highlight/);
assert.doesNotMatch(markdown, /^Highlights$/m);

assert.equal(
  formatBookmarksAsMarkdown([], { exportedAt: Date.UTC(2026, 6, 7) }),
  ''
);

assert.equal(
  buildExportFilename('MarkBuddy Export', Date.UTC(2026, 6, 7)),
  'markbuddy-export-2026-07-07.md'
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
], { exportedAt: Date.UTC(2026, 6, 7) });

assert.match(fallbackMarkdown, /^## not a url/m);
assert.match(fallbackMarkdown, /> 第一行\n> 第二行/);
assert.doesNotMatch(fallbackMarkdown, /- Tags:/);
assert.doesNotMatch(fallbackMarkdown, /笔记：/);

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
], { exportedAt: Date.UTC(2026, 6, 7) });

assert.match(structureSafeMarkdown, /^## \\# 标题 下一行/m);
assert.match(structureSafeMarkdown, /- Tags: #tag #换行 标签/);
assert.match(structureSafeMarkdown, /笔记：\n\n> 第一条\n> - 不应变成导出文档的列表/);

console.log('export-markdown tests passed');
