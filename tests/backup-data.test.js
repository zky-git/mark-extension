const assert = require('node:assert/strict');
const {
  BACKUP_KEYS,
  createBackupPayload,
  parseBackupPayload,
  buildBackupFilename,
} = require('../side-panel/backup-data.js');

const exportedAt = Date.UTC(2026, 5, 30);
const storageSnapshot = {
  bookmarks: {
    'https://example.com': {
      url: 'https://example.com',
      title: 'Example',
      savedAt: exportedAt,
      tags: ['技术'],
      highlightIds: ['h1'],
    },
  },
  highlights: {
    h1: {
      id: 'h1',
      url: 'https://example.com',
      text: '完整备份应保留 range 和复习状态。',
      active: true,
      tags: ['学习'],
      serializedRange: { parentXPath: '/html/body/p', startOffset: 0, endOffset: 6, text: '完整备份' },
      sm2: { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewAt: exportedAt },
    },
  },
  tags: ['技术'],
  settings: { defaultColor: '#FFD700', presetColors: ['#FFD700'], reviewTag: '学习' },
  groupByDomain: true,
  sortBy: 'time-desc',
  unrelatedCache: { ignored: true },
};

assert.deepEqual(BACKUP_KEYS, ['bookmarks', 'highlights', 'tags', 'settings', 'groupByDomain', 'sortBy']);

const payload = createBackupPayload(storageSnapshot, { exportedAt });
assert.equal(payload.app, 'MarkBuddy');
assert.equal(payload.version, 1);
assert.equal(payload.exportedAt, '2026-06-30T00:00:00.000Z');
assert.deepEqual(Object.keys(payload.data), BACKUP_KEYS);
assert.equal(payload.data.highlights.h1.sm2.repetitions, 1);
assert.equal(payload.data.unrelatedCache, undefined);

const parsed = parseBackupPayload(JSON.stringify(payload));
assert.deepEqual(parsed.data, payload.data);

const sparseParsed = parseBackupPayload(JSON.stringify({
  app: 'MarkBuddy',
  version: 1,
  data: {
    bookmarks: {},
  },
}));
assert.deepEqual(sparseParsed.data, {
  bookmarks: {},
  highlights: {},
  tags: [],
  settings: {},
  groupByDomain: true,
  sortBy: 'time-desc',
});

assert.throws(
  () => parseBackupPayload('{bad json'),
  /不是有效的 JSON/
);

assert.throws(
  () => parseBackupPayload(JSON.stringify({ app: 'Other', version: 1, data: {} })),
  /不是 MarkBuddy 备份文件/
);

assert.throws(
  () => parseBackupPayload(JSON.stringify({ app: 'MarkBuddy', version: 1, data: { bookmarks: [] } })),
  /bookmarks 格式无效/
);

assert.equal(
  buildBackupFilename(exportedAt),
  'markbuddy-backup-2026-06-30.json'
);

console.log('backup-data tests passed');
