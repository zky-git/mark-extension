const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storageData = {
  settings: {},
  highlights: {
    legacyTagOnly: {
      id: 'legacyTagOnly',
      url: 'https://example.com/legacy',
      text: '旧复习标签不应再进入复习。',
      tags: ['学习'],
      savedAt: Date.UTC(2026, 5, 30),
    },
    reviewEnabled: {
      id: 'reviewEnabled',
      url: 'https://example.com/enabled',
      text: '独立复习状态开启后应进入复习。',
      active: true,
      review: { enabled: true },
      savedAt: Date.UTC(2026, 5, 30),
    },
    reviewDisabled: {
      id: 'reviewDisabled',
      url: 'https://example.com/disabled',
      text: '独立复习状态关闭后不应进入复习。',
      active: true,
      review: { enabled: false },
      savedAt: Date.UTC(2026, 5, 30),
    },
    reviewNotDue: {
      id: 'reviewNotDue',
      url: 'https://example.com/not-due',
      text: '未到期的数据不应进入复习。',
      active: true,
      review: {
        enabled: true,
        sm2: { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewAt: Date.now() + 24 * 60 * 60 * 1000 },
      },
      savedAt: Date.UTC(2026, 5, 30),
    },
    explicitlyInactive: {
      id: 'explicitlyInactive',
      url: 'https://example.com/inactive',
      text: '明确失效的数据不应进入复习。',
      active: false,
      review: { enabled: true },
      savedAt: Date.UTC(2026, 5, 30),
    },
  },
};

function createChromeMock() {
  const noopEvent = { addListener() {} };
  return {
    runtime: {
      onConnect: noopEvent,
      onMessage: noopEvent,
      onInstalled: noopEvent,
      lastError: null,
    },
    sidePanel: {
      close: async () => {},
      setOptions: async () => {},
      setPanelBehavior: async () => {},
      open: async () => {},
    },
    contextMenus: {
      onClicked: noopEvent,
      create() {},
    },
    scripting: {
      executeScript: async () => {},
    },
    commands: {
      onCommand: noopEvent,
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: storageData[key] };
        },
        async set(update) {
          Object.assign(storageData, update);
        },
      },
    },
    webNavigation: {
      onHistoryStateUpdated: noopEvent,
    },
    tabs: {
      sendMessage() {},
    },
  };
}

const context = {
  chrome: createChromeMock(),
  console,
  Date,
  Math,
  URL,
  setTimeout,
  clearTimeout,
};

const source = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'service-worker.js' });

(async () => {
  const due = await context.getDueReviews();
  assert.deepEqual(Array.from(due, item => item.id), ['reviewEnabled']);

  await context.updateHighlightReview('legacyTagOnly', true);
  assert.equal(storageData.highlights.legacyTagOnly.review.enabled, true);
  assert.equal(storageData.highlights.legacyTagOnly.tags.includes('学习'), true);

  const beforeReview = Date.now();
  await context.updateReviewResult('legacyTagOnly', 5);
  const afterReview = Date.now();
  assert.equal(storageData.highlights.legacyTagOnly.review.sm2.repetitions, 1);
  assert.ok(
    storageData.highlights.legacyTagOnly.review.sm2.nextReviewAt >= beforeReview + 24 * 60 * 60 * 1000,
    'first remembered review should be scheduled at least 1 day later'
  );
  assert.ok(
    storageData.highlights.legacyTagOnly.review.sm2.nextReviewAt <= afterReview + 24 * 60 * 60 * 1000,
    'first remembered review should be scheduled about 1 day later'
  );

  await context.updateHighlightReview('legacyTagOnly', false);
  assert.equal(storageData.highlights.legacyTagOnly.review.enabled, false);

  console.log('service-worker review tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
