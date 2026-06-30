const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storageData = {
  settings: { reviewTag: '学习' },
  highlights: {
    legacyActiveMissing: {
      id: 'legacyActiveMissing',
      url: 'https://example.com/legacy',
      text: '旧数据没有 active 字段，但仍应视为有效。',
      tags: ['学习'],
      savedAt: Date.UTC(2026, 5, 30),
    },
    explicitlyInactive: {
      id: 'explicitlyInactive',
      url: 'https://example.com/inactive',
      text: '明确失效的数据不应进入复习。',
      active: false,
      tags: ['学习'],
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
  assert.deepEqual(Array.from(due, item => item.id), ['legacyActiveMissing']);
  console.log('service-worker review tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
