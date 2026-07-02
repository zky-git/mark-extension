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
  const eventListeners = {
    onInstalled: null,
    onStartup: null,
    onAlarm: null,
  };
  const createdAlarms = [];
  const badgeUpdates = [];
  const tabMessages = [];
  return {
    _eventListeners: eventListeners,
    _createdAlarms: createdAlarms,
    _badgeUpdates: badgeUpdates,
    runtime: {
      onConnect: noopEvent,
      onMessage: noopEvent,
      onInstalled: {
        addListener(listener) {
          eventListeners.onInstalled = listener;
        },
      },
      onStartup: {
        addListener(listener) {
          eventListeners.onStartup = listener;
        },
      },
      lastError: null,
    },
    alarms: {
      onAlarm: {
        addListener(listener) {
          eventListeners.onAlarm = listener;
        },
      },
      create(name, options) {
        createdAlarms.push({ name, options });
      },
    },
    action: {
      setBadgeText(update) {
        badgeUpdates.push({ method: 'setBadgeText', update });
      },
      setBadgeBackgroundColor(update) {
        badgeUpdates.push({ method: 'setBadgeBackgroundColor', update });
      },
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
      async query() {
        return [
          { id: 101, url: 'https://example.com/page' },
          { id: 102, url: 'chrome://extensions' },
          { id: 103, url: 'https://runoob.com/page' },
        ];
      },
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });
        if (callback) callback();
      },
    },
    _tabMessages: tabMessages,
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

  await context.initializeReviewBadgeReminder();
  assert.equal(context.chrome._createdAlarms.at(-1).name, 'markbuddy-review-badge-refresh');
  assert.equal(context.chrome._createdAlarms.at(-1).options.periodInMinutes, 60);
  assert.equal(context.chrome._badgeUpdates.at(-2).method, 'setBadgeText');
  assert.equal(context.chrome._badgeUpdates.at(-2).update.text, '1');
  assert.equal(context.chrome._badgeUpdates.at(-1).method, 'setBadgeBackgroundColor');
  assert.equal(context.chrome._badgeUpdates.at(-1).update.color, '#ef4444');
  const initialBroadcasts = context.chrome._tabMessages.slice(-2);
  assert.equal(initialBroadcasts.length, 2, 'review count should be broadcast to regular content tabs');
  assert.equal(initialBroadcasts[0].tabId, 101);
  assert.equal(initialBroadcasts[0].message.type, 'REVIEW_BADGE_UPDATED');
  assert.equal(initialBroadcasts[0].message.count, 1);
  assert.equal(initialBroadcasts[1].tabId, 103);
  assert.equal(initialBroadcasts[1].message.type, 'REVIEW_BADGE_UPDATED');
  assert.equal(initialBroadcasts[1].message.count, 1);

  await context.chrome._eventListeners.onAlarm({ name: 'markbuddy-review-badge-refresh' });
  assert.equal(context.chrome._badgeUpdates.at(-2).update.text, '1');

  await context.updateHighlightReview('legacyTagOnly', true);
  assert.equal(storageData.highlights.legacyTagOnly.review.enabled, true);
  assert.equal(storageData.highlights.legacyTagOnly.tags.includes('学习'), true);
  assert.equal(context.chrome._badgeUpdates.at(-2).update.text, '2');
  assert.equal(context.chrome._tabMessages.at(-1).message.count, 2);

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
  assert.equal(context.chrome._badgeUpdates.at(-2).update.text, '1');

  console.log('service-worker review tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
