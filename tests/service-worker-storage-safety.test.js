const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const storageData = {
  gitSyncConfig: { token: 'secret', owner: 'zky', repo: 'markbuddy-data', branch: 'main', path: 'markbuddy/data.json' },
  gitSyncState: { lastRemoteSha: 'old-remote' },
  bookmarks: {
    'https://remote.example': {
      url: 'https://remote.example',
      title: 'Remote',
      savedAt: Date.UTC(2026, 6, 1),
      highlightIds: [],
    },
  },
  highlights: {},
  tags: [],
  settings: { reviewEnabled: true },
  groupByDomain: true,
  sortBy: 'time-desc',
  deletedItems: { bookmarks: {}, highlights: {} },
};

const pullGate = createDeferred();
const accessLevelCalls = [];

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function createChromeMock() {
  const noopEvent = { addListener() {} };
  return {
    runtime: {
      onConnect: noopEvent,
      onMessage: noopEvent,
      onInstalled: noopEvent,
      onStartup: noopEvent,
      lastError: null,
    },
    alarms: { onAlarm: noopEvent, create() {} },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    sidePanel: { close: async () => {}, setOptions: async () => {}, setPanelBehavior: async () => {}, open: async () => {} },
    contextMenus: { onClicked: noopEvent, create() {} },
    scripting: { executeScript: async () => {} },
    commands: { onCommand: noopEvent },
    storage: {
      local: {
        async get(key) {
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map(item => [item, clone(storageData[item])]));
          }
          return { [key]: clone(storageData[key]) };
        },
        async set(update) {
          Object.assign(storageData, clone(update));
        },
        async remove(keys) {
          keys.forEach(key => delete storageData[key]);
        },
        setAccessLevel(options) {
          accessLevelCalls.push(options);
        },
      },
    },
    webNavigation: { onHistoryStateUpdated: noopEvent },
    tabs: { async query() { return []; }, sendMessage() {} },
  };
}

const remoteData = {
  bookmarks: {
    'https://remote.example': {
      url: 'https://remote.example',
      title: 'Remote restored',
      savedAt: Date.UTC(2026, 6, 2),
      highlightIds: [],
    },
  },
  highlights: {},
  tags: [],
  settings: { reviewEnabled: true },
  groupByDomain: false,
  sortBy: 'updated-desc',
  deletedItems: { bookmarks: {}, highlights: {} },
};

const context = {
  chrome: createChromeMock(),
  console,
  Date,
  Math,
  URL,
  setTimeout,
  clearTimeout,
  MarkBuddyBackup: {
    BACKUP_KEYS: ['bookmarks', 'highlights', 'tags', 'settings', 'groupByDomain', 'sortBy', 'deletedItems'],
  },
  MarkBuddyGitHubProvider: {
    createGitHubProvider() {
      return {};
    },
  },
  MarkBuddyGitSyncEngine: {
    async pullGitSync() {
      await pullGate.promise;
      return {
        success: true,
        data: clone(remoteData),
        state: { lastRemoteSha: 'remote-after-pull', lastSyncAt: Date.UTC(2026, 6, 3), lastSyncDirection: 'pull' },
      };
    },
  },
};

const source = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'service-worker.js' });

(async () => {
  assert.equal(accessLevelCalls.at(-1)?.accessLevel, 'TRUSTED_CONTEXTS');

  const pull = context.pullGitSync();
  const save = context.saveHighlight({
    url: 'https://local.example',
    text: 'Saved while pull is in flight',
    color: '#FFD700',
    serializedRange: { start: 1, end: 2 },
    pageTitle: 'Local',
    pageFavicon: '',
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(Object.keys(storageData.highlights).length, 0, 'local writes should wait while pull is in flight');

  pullGate.resolve();
  await Promise.all([pull, save]);

  const savedHighlight = Object.values(storageData.highlights).find(item => item.text === 'Saved while pull is in flight');
  assert.ok(savedHighlight, 'queued local save should be applied after pull restores remote data');
  assert.deepEqual(storageData.bookmarks['https://local.example'].highlightIds, [savedHighlight.id]);
  assert.equal(storageData.gitSyncState.lastRemoteSha, 'remote-after-pull');

  await context.deleteHighlight(savedHighlight.id);
  assert.equal(storageData.highlights[savedHighlight.id], undefined);
  assert.equal(storageData.bookmarks['https://local.example'].highlightIds.includes(savedHighlight.id), false);
  assert.equal(typeof storageData.deletedItems.highlights[savedHighlight.id].deletedAt, 'number');

  const bookmarkWithHighlight = await context.saveHighlight({
    url: 'https://delete-bookmark.example',
    text: 'Deleted with bookmark',
    color: '#FFD700',
    serializedRange: { start: 3, end: 4 },
    pageTitle: 'Delete bookmark',
    pageFavicon: '',
  });
  await context.deleteBookmark('https://delete-bookmark.example');
  assert.equal(storageData.bookmarks['https://delete-bookmark.example'], undefined);
  assert.equal(storageData.highlights[bookmarkWithHighlight.highlight.id], undefined);
  assert.equal(typeof storageData.deletedItems.bookmarks['https://delete-bookmark.example'].deletedAt, 'number');
  assert.equal(typeof storageData.deletedItems.highlights[bookmarkWithHighlight.highlight.id].deletedAt, 'number');

  console.log('service-worker storage safety tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
