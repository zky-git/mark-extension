// MarkBuddy — Service Worker (Manifest V3)
// Handles: side panel opening, context menus, message routing, storage ops

if (typeof importScripts === 'function') {
  importScripts(
    'shared/github-provider.js',
    'shared/git-sync-engine.js',
    'side-panel/backup-data.js'
  );
}

// State to track open side panels per window
const openSidePanels = new Map(); // windowId -> boolean
const GIT_SYNC_CONFIG_KEY = 'gitSyncConfig';
const GIT_SYNC_STATE_KEY = 'gitSyncState';
let storageWriteQueue = Promise.resolve();

configureStorageAccess();

function configureStorageAccess() {
  try {
    const result = chrome.storage?.local?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
    if (result?.catch) {
      result.catch(err => console.warn('[MarkBuddy SW] Failed to restrict storage access:', err));
    }
  } catch (err) {
    console.warn('[MarkBuddy SW] Failed to restrict storage access:', err);
  }
}

function withStorageWriteLock(operation) {
  const run = storageWriteQueue.then(operation, operation);
  storageWriteQueue = run.catch(() => {});
  return run;
}

// Track connection from side panel to monitor open/close state
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'markbuddy-sidepanel') {
    let winId = null;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'INIT') {
        winId = msg.windowId;
        openSidePanels.set(winId, true);
      }
    });

    port.onDisconnect.addListener(() => {
      if (winId !== null) {
        openSidePanels.delete(winId);
      }
    });
  }
});

// Helper to close side panel supporting older Chrome versions
async function closeSidePanel(windowId) {
  if (chrome.sidePanel.close) {
    try {
      await chrome.sidePanel.close({ windowId });
    } catch (err) {
      console.warn('[MarkBuddy SW] Failed to close side panel via close API:', err);
    }
  } else {
    try {
      await chrome.sidePanel.setOptions({ windowId, enabled: false });
      await chrome.sidePanel.setOptions({ windowId, enabled: true, path: 'side-panel/panel.html' });
    } catch (err) {
      console.error('[MarkBuddy SW] Failed to close side panel via setOptions fallback:', err);
    }
  }
}

async function toggleSidePanelForTab(tab) {
  const windowId = tab?.windowId;
  if (!windowId) return { success: false, error: 'No window ID found' };

  if (openSidePanels.has(windowId)) {
    await closeSidePanel(windowId);
    return { success: true, state: 'closed' };
  }

  if (!tab?.id) return { success: false, error: 'No tab ID found' };
  await chrome.sidePanel.open({ tabId: tab.id });
  return { success: true, state: 'opened' };
}

async function runContentCommand(tab, func, label) {
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func,
    });
  } catch (err) {
    console.error(`[MarkBuddy SW] ${label} command failed:`, err);
  }
}

// ─── Initialization ──────────────────────────────────────────────────────────

const REVIEW_BADGE_ALARM_NAME = 'markbuddy-review-badge-refresh';
const REVIEW_BADGE_REFRESH_MINUTES = 60;
const REVIEW_BADGE_COLOR = '#ef4444';
const REVIEW_BADGE_UPDATE_MESSAGE = 'REVIEW_BADGE_UPDATED';
const DATA_CHANGED_MESSAGE = 'MARKBUDDY_DATA_CHANGED';

function canMessageContentTab(tab) {
  return Boolean(tab?.id && /^https?:\/\//.test(tab.url || ''));
}

async function initializeReviewBadgeReminder() {
  chrome.alarms.create(REVIEW_BADGE_ALARM_NAME, {
    periodInMinutes: REVIEW_BADGE_REFRESH_MINUTES,
  });
  await refreshReviewBadge();
}

async function refreshReviewBadge() {
  const settings = await getSettings();
  if (settings.reviewEnabled === false) {
    chrome.action.setBadgeText({ text: '' });
    await broadcastReviewBadgeCount(0);
    return;
  }

  const dueCount = (await getDueReviews()).length;
  chrome.action.setBadgeText({ text: dueCount > 0 ? String(dueCount) : '' });

  if (dueCount > 0) {
    chrome.action.setBadgeBackgroundColor({ color: REVIEW_BADGE_COLOR });
  }
  await broadcastReviewBadgeCount(dueCount);
}

async function broadcastReviewBadgeCount(count) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(canMessageContentTab).map(tab => new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: REVIEW_BADGE_UPDATE_MESSAGE, count },
      () => {
        // Accessing lastError clears missing-content-script errors for restricted pages.
        chrome.runtime.lastError;
        resolve();
      }
    );
  })));
}

async function broadcastDataChanged(keys) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(canMessageContentTab).map(tab => new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: DATA_CHANGED_MESSAGE, keys },
      () => {
        chrome.runtime.lastError;
        resolve();
      }
    );
  })));
}

chrome.runtime.onInstalled.addListener(async () => {
  // Open side panel on extension icon click
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Register context menus
  chrome.contextMenus.create({
    id: 'markbuddy-save-page',
    title: '🔖 收藏此网页 (MarkBuddy)',
    contexts: ['page', 'selection'],
  });

  chrome.contextMenus.create({
    id: 'markbuddy-save-highlight',
    title: '🖊️ 收藏划线 (MarkBuddy)',
    contexts: ['selection'],
  });

  await initializeReviewBadgeReminder();
});

chrome.runtime.onStartup.addListener(() => {
  initializeReviewBadgeReminder();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REVIEW_BADGE_ALARM_NAME) {
    refreshReviewBadge();
  }
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'markbuddy-save-page') {
    await runContentCommand(tab, () => window.__markbuddy_savePage?.(), 'Context menu save page');
  }

  if (info.menuItemId === 'markbuddy-save-highlight') {
    await runContentCommand(tab, () => window.__markbuddy_saveHighlight?.(), 'Context menu save highlight');
  }
});

// ─── Keyboard Commands ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-side-panel') {
    await toggleSidePanelForTab(tab);
    return;
  }

  if (command === 'save-selection-highlight') {
    await runContentCommand(tab, () => window.__markbuddy_saveHighlight?.(), 'Keyboard save highlight');
  }
});

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'SAVE_BOOKMARK':
          sendResponse(await saveBookmark(message.payload));
          break;
        case 'SAVE_HIGHLIGHT':
          sendResponse(await saveHighlight(message.payload));
          break;
        case 'DELETE_BOOKMARK':
          sendResponse(await deleteBookmark(message.payload.url));
          break;
        case 'DELETE_HIGHLIGHT':
          sendResponse(await deleteHighlight(message.payload.id));
          break;
        case 'UPDATE_HIGHLIGHT_NOTE':
          sendResponse(await updateHighlightNote(message.payload.id, message.payload.note));
          break;
        case 'UPDATE_HIGHLIGHT_RANGE':
          sendResponse(await updateHighlightRange(message.payload.id, message.payload.serializedRange));
          break;
        case 'GET_ALL_BOOKMARKS':
          sendResponse(await getAllBookmarks());
          break;
        case 'GET_HIGHLIGHTS_FOR_URL':
          sendResponse(await getHighlightsForUrl(message.payload.url));
          break;
        case 'GET_ALL_TAGS':
          sendResponse(await getAllTags());
          break;
        case 'UPDATE_BOOKMARK_TAGS':
          sendResponse(await updateBookmarkTags(message.payload.url, message.payload.tags));
          break;
        case 'DELETE_TAG':
          sendResponse(await deleteTag(message.payload.tag));
          break;
        case 'GET_SETTINGS':
          sendResponse(await getSettings());
          break;
        case 'SAVE_SETTINGS':
          sendResponse(await saveSettings(message.payload));
          break;
        case 'GET_DUE_REVIEWS':
          sendResponse(await getDueReviews());
          break;
        case 'UPDATE_REVIEW_RESULT':
          sendResponse(await updateReviewResult(message.payload.id, message.payload.quality));
          break;
        case 'UPDATE_HIGHLIGHT_REVIEW':
          sendResponse(await updateHighlightReview(message.payload.id, message.payload.enabled));
          break;
        case 'UPDATE_HIGHLIGHT_TAGS':
          sendResponse(await updateHighlightTags(message.payload.id, message.payload.tags));
          break;
        case 'GIT_SYNC_GET_CONFIG':
          sendResponse(await getGitSyncConfig());
          break;
        case 'GIT_SYNC_SAVE_CONFIG':
          sendResponse(await saveGitSyncConfig(message.payload));
          break;
        case 'GIT_SYNC_CLEAR_CONFIG':
          sendResponse(await clearGitSyncConfig());
          break;
        case 'GIT_SYNC_TEST':
          sendResponse(await testGitSyncConnection());
          break;
        case 'GIT_SYNC_PUSH':
          sendResponse(await pushGitSync(message.payload || {}));
          break;
        case 'GIT_SYNC_PULL':
          sendResponse(await pullGitSync());
          break;
        case 'GIT_SYNC_STATUS':
          sendResponse(await getGitSyncStatus());
          break;
        case 'TOGGLE_SIDE_PANEL':
          sendResponse(await toggleSidePanelForTab(sender.tab));
          break;
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (err) {
      console.error('[MarkBuddy SW] Error:', err);
      sendResponse({ error: err.message });
    }
  })();
  return true; // keep channel open for async response
});

// ─── Storage Operations ───────────────────────────────────────────────────────

async function getStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

function maskGitConfig(config = {}) {
  return {
    provider: config.provider || 'github',
    token: config.token ? '********' : '',
    hasToken: Boolean(config.token),
    owner: config.owner || '',
    repo: config.repo || '',
    branch: config.branch || 'main',
    path: config.path || 'markbuddy/data.json',
  };
}

function getGitSyncEngine() {
  if (!globalThis.MarkBuddyGitSyncEngine) {
    throw new Error('Git 同步模块未加载，请刷新扩展后重试。');
  }
  return globalThis.MarkBuddyGitSyncEngine;
}

function getBackupModule() {
  if (!globalThis.MarkBuddyBackup) {
    throw new Error('备份模块未加载，请刷新扩展后重试。');
  }
  return globalThis.MarkBuddyBackup;
}

function createGitProvider() {
  if (!globalThis.MarkBuddyGitHubProvider?.createGitHubProvider) {
    throw new Error('GitHub 同步模块未加载，请刷新扩展后重试。');
  }
  return globalThis.MarkBuddyGitHubProvider.createGitHubProvider();
}

async function getRawGitSyncConfig() {
  return (await getStorage(GIT_SYNC_CONFIG_KEY)) || {};
}

async function getRawGitSyncState() {
  return (await getStorage(GIT_SYNC_STATE_KEY)) || {};
}

async function getGitSyncConfig() {
  const config = await getRawGitSyncConfig();
  return { success: true, config: maskGitConfig(config), state: await getRawGitSyncState() };
}

async function saveGitSyncConfig(payload = {}) {
  return withStorageWriteLock(() => saveGitSyncConfigUnlocked(payload));
}

async function saveGitSyncConfigUnlocked(payload = {}) {
  const existing = await getRawGitSyncConfig();
  const nextConfig = {
    ...payload,
    token: payload.token === '********' || payload.token === '' || payload.token === undefined
      ? existing.token
      : payload.token,
  };
  const config = getGitSyncEngine().sanitizeGitConfig(nextConfig);
  await setStorage(GIT_SYNC_CONFIG_KEY, config);
  return { success: true, config: maskGitConfig(config) };
}

async function clearGitSyncConfig() {
  return withStorageWriteLock(clearGitSyncConfigUnlocked);
}

async function clearGitSyncConfigUnlocked() {
  await chrome.storage.local.remove([GIT_SYNC_CONFIG_KEY, GIT_SYNC_STATE_KEY]);
  return { success: true };
}

async function getGitSyncStatus() {
  return {
    success: true,
    config: maskGitConfig(await getRawGitSyncConfig()),
    state: await getRawGitSyncState(),
  };
}

async function testGitSyncConnection() {
  const config = await getRawGitSyncConfig();
  const provider = createGitProvider();
  const file = await provider.readFile(config);
  return { success: true, exists: file.exists, remoteSha: file.sha || null };
}

async function pushGitSync(options = {}) {
  return withStorageWriteLock(() => pushGitSyncUnlocked(options));
}

async function pushGitSyncUnlocked(options = {}) {
  const backup = getBackupModule();
  const config = await getRawGitSyncConfig();
  const state = await getRawGitSyncState();
  const storageSnapshot = await chrome.storage.local.get(backup.BACKUP_KEYS);
  const pushResult = await getGitSyncEngine().pushGitSync({
    config,
    state,
    storageSnapshot,
    backup,
    provider: createGitProvider(),
    force: Boolean(options.force),
  });

  if (pushResult.success && pushResult.state) {
    await setStorage(GIT_SYNC_STATE_KEY, pushResult.state);
  }
  return pushResult;
}

async function pullGitSync() {
  return withStorageWriteLock(pullGitSyncUnlocked);
}

async function pullGitSyncUnlocked() {
  const backup = getBackupModule();
  const pullResult = await getGitSyncEngine().pullGitSync({
    config: await getRawGitSyncConfig(),
    backup,
    provider: createGitProvider(),
  });

  if (pullResult.success) {
    await chrome.storage.local.set(pullResult.data);
    await setStorage(GIT_SYNC_STATE_KEY, pullResult.state);
    await refreshReviewBadge();
    await broadcastDataChanged(Object.keys(pullResult.data || {}));
  }
  return pullResult;
}

async function saveBookmark({ url, title, favicon, tags = [] }) {
  return withStorageWriteLock(() => saveBookmarkUnlocked({ url, title, favicon, tags }));
}

async function saveBookmarkUnlocked({ url, title, favicon, tags = [] }) {
  const bookmarks = (await getStorage('bookmarks')) || {};

  if (!bookmarks[url]) {
    bookmarks[url] = {
      url,
      title: title || url,
      favicon: favicon || '',
      savedAt: Date.now(),
      tags,
      highlightIds: [],
    };
  } else {
    // Update metadata but preserve existing highlights and tags
    bookmarks[url].title = title || bookmarks[url].title;
    bookmarks[url].favicon = favicon || bookmarks[url].favicon;
    if (tags.length > 0) bookmarks[url].tags = tags;
  }

  await setStorage('bookmarks', bookmarks);
  await syncTags(bookmarks);
  await broadcastDataChanged(['bookmarks', 'tags']);
  return { success: true, bookmark: bookmarks[url] };
}

async function saveHighlight({ url, text, color, serializedRange, pageTitle, pageFavicon }) {
  return withStorageWriteLock(() => saveHighlightUnlocked({ url, text, color, serializedRange, pageTitle, pageFavicon }));
}

async function saveHighlightUnlocked({ url, text, color, serializedRange, pageTitle, pageFavicon }) {
  const highlights = (await getStorage('highlights')) || {};
  const bookmarks = (await getStorage('bookmarks')) || {};

  const id = `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  highlights[id] = {
    id,
    url,
    text,
    color: color || '#FFD700',
    savedAt: Date.now(),
    serializedRange,
    active: true,
  };

  await setStorage('highlights', highlights);

  // Auto-bookmark the page when saving a highlight
  if (!bookmarks[url]) {
    bookmarks[url] = {
      url,
      title: pageTitle || url,
      favicon: pageFavicon || '',
      savedAt: Date.now(),
      tags: [],
      highlightIds: [id],
    };
    await setStorage('bookmarks', bookmarks);
    await syncTags(bookmarks);
  } else {
    if (!bookmarks[url].highlightIds) bookmarks[url].highlightIds = [];
    bookmarks[url].highlightIds.push(id);
    await setStorage('bookmarks', bookmarks);
  }

  await broadcastDataChanged(['bookmarks', 'highlights', 'tags']);
  return { success: true, highlight: highlights[id] };
}

async function deleteBookmark(url) {
  return withStorageWriteLock(() => deleteBookmarkUnlocked(url));
}

async function deleteBookmarkUnlocked(url) {
  const bookmarks = (await getStorage('bookmarks')) || {};
  const highlights = (await getStorage('highlights')) || {};

  if (bookmarks[url]) {
    // Also delete associated highlights
    const ids = bookmarks[url].highlightIds || [];
    ids.forEach(id => delete highlights[id]);
    await setStorage('highlights', highlights);
    delete bookmarks[url];
    await setStorage('bookmarks', bookmarks);
    await syncTags(bookmarks);
    await refreshReviewBadge();
    await broadcastDataChanged(['bookmarks', 'highlights', 'tags']);
  }

  return { success: true };
}

async function deleteHighlight(id) {
  return withStorageWriteLock(() => deleteHighlightUnlocked(id));
}

async function deleteHighlightUnlocked(id) {
  const highlights = (await getStorage('highlights')) || {};
  const bookmarks = (await getStorage('bookmarks')) || {};

  if (highlights[id]) {
    const url = highlights[id].url;
    delete highlights[id];
    await setStorage('highlights', highlights);

    // Remove from bookmark's highlightIds
    if (bookmarks[url]) {
      bookmarks[url].highlightIds = (bookmarks[url].highlightIds || []).filter(hid => hid !== id);
      await setStorage('bookmarks', bookmarks);
    }
    await refreshReviewBadge();
    await broadcastDataChanged(['bookmarks', 'highlights']);
  }

  return { success: true };
}

async function getAllBookmarks() {
  const bookmarks = (await getStorage('bookmarks')) || {};
  const highlights = (await getStorage('highlights')) || {};

  // Attach full highlight objects to each bookmark
  const result = Object.values(bookmarks).map(bm => ({
    ...bm,
    highlights: (bm.highlightIds || [])
      .map(id => highlights[id])
      .filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt),
  }));

  return result.sort((a, b) => b.savedAt - a.savedAt);
}

async function getHighlightsForUrl(url) {
  const highlights = (await getStorage('highlights')) || {};
  return Object.values(highlights)
    .filter(h => h.url === url && h.active !== false)
    .sort((a, b) => a.savedAt - b.savedAt);
}

async function getAllTags() {
  return (await getStorage('tags')) || [];
}

async function updateBookmarkTags(url, tags) {
  return withStorageWriteLock(() => updateBookmarkTagsUnlocked(url, tags));
}

async function updateBookmarkTagsUnlocked(url, tags) {
  const bookmarks = (await getStorage('bookmarks')) || {};
  if (bookmarks[url]) {
    bookmarks[url].tags = tags;
    await setStorage('bookmarks', bookmarks);
    await syncTags(bookmarks);
    await broadcastDataChanged(['bookmarks', 'tags']);
  }
  return { success: true };
}

async function deleteTag(tag) {
  return withStorageWriteLock(() => deleteTagUnlocked(tag));
}

async function deleteTagUnlocked(tag) {
  const bookmarks = (await getStorage('bookmarks')) || {};
  let modified = false;
  Object.values(bookmarks).forEach(bm => {
    if (bm.tags && bm.tags.includes(tag)) {
      bm.tags = bm.tags.filter(t => t !== tag);
      modified = true;
    }
  });
  if (modified) {
    await setStorage('bookmarks', bookmarks);
    await syncTags(bookmarks);
    await broadcastDataChanged(['bookmarks', 'tags']);
  }
  return { success: true };
}

async function syncTags(bookmarks) {
  const tagSet = new Set();
  Object.values(bookmarks).forEach(bm => (bm.tags || []).forEach(t => tagSet.add(t)));
  await setStorage('tags', Array.from(tagSet).sort());
}

async function updateHighlightNote(id, note) {
  return withStorageWriteLock(() => updateHighlightNoteUnlocked(id, note));
}

async function updateHighlightNoteUnlocked(id, note) {
  const highlights = (await getStorage('highlights')) || {};
  if (highlights[id]) {
    highlights[id].note = note;
    await setStorage('highlights', highlights);
    await broadcastDataChanged(['highlights']);
    return { success: true, highlight: highlights[id] };
  }
  return { success: false, error: 'Highlight not found' };
}

async function updateHighlightRange(id, serializedRange) {
  return withStorageWriteLock(() => updateHighlightRangeUnlocked(id, serializedRange));
}

async function updateHighlightRangeUnlocked(id, serializedRange) {
  const highlights = (await getStorage('highlights')) || {};
  if (highlights[id]) {
    highlights[id].serializedRange = serializedRange;
    highlights[id].active = true;
    await setStorage('highlights', highlights);
    await broadcastDataChanged(['highlights']);
    return { success: true, highlight: highlights[id] };
  }
  return { success: false, error: 'Highlight not found' };
}

async function getSettings() {
  return (await getStorage('settings')) || {
    defaultColor: '#FFD700',
    presetColors: ['#FFD700', '#90EE90', '#87CEEB', '#FFB6C1', '#DDA0DD'],
    themeMode: 'system',
    reviewEnabled: true,
  };
}

async function saveSettings(settings) {
  return withStorageWriteLock(() => saveSettingsUnlocked(settings));
}

async function saveSettingsUnlocked(settings) {
  await setStorage('settings', settings);
  await refreshReviewBadge();
  await broadcastDataChanged(['settings']);
  return { success: true };
}

// ─── Review (SM-2 Spaced Repetition) ─────────────────────────────────────────

const REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Standard SM-2 algorithm.
 * quality: 5 = remembered, 3 = fuzzy, 1 = forgot
 */
function computeSM2(sm2, quality) {
  let { interval, easeFactor, repetitions } = sm2;

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  } else {
    // Failed recall — reset
    repetitions = 0;
    interval = 1;
  }

  const nextReviewAt = Date.now() + interval * REVIEW_INTERVAL_MS;
  return { interval, easeFactor, repetitions, nextReviewAt };
}

function createInitialReviewState(enabled) {
  return {
    enabled,
    sm2: {
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewAt: 0,
    },
  };
}

async function getDueReviews() {
  const highlights = (await getStorage('highlights')) || {};
  const now = Date.now();

  const due = Object.values(highlights).filter(h => {
    if (h.active === false) return false;
    if (h.review?.enabled !== true) return false;
    if (!h.review.sm2) return true; // never reviewed — due immediately
    return h.review.sm2.nextReviewAt <= now;
  });

  return due.sort((a, b) => {
    const aNext = a.review?.sm2?.nextReviewAt || 0;
    const bNext = b.review?.sm2?.nextReviewAt || 0;
    return aNext - bNext;
  });
}

async function updateReviewResult(id, quality) {
  return withStorageWriteLock(() => updateReviewResultUnlocked(id, quality));
}

async function updateReviewResultUnlocked(id, quality) {
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };

  const review = highlights[id].review || createInitialReviewState(true);
  review.enabled = true;
  review.sm2 = computeSM2(review.sm2 || createInitialReviewState(true).sm2, quality);
  highlights[id].review = review;
  await setStorage('highlights', highlights);
  await refreshReviewBadge();
  await broadcastDataChanged(['highlights']);
  return { success: true, sm2: highlights[id].review.sm2 };
}

async function updateHighlightReview(id, enabled) {
  return withStorageWriteLock(() => updateHighlightReviewUnlocked(id, enabled));
}

async function updateHighlightReviewUnlocked(id, enabled) {
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };

  const current = highlights[id].review || {};
  highlights[id].review = {
    ...current,
    enabled: Boolean(enabled),
    sm2: current.sm2 || createInitialReviewState(Boolean(enabled)).sm2,
  };
  await setStorage('highlights', highlights);
  await refreshReviewBadge();
  await broadcastDataChanged(['highlights']);
  return { success: true, review: highlights[id].review };
}

async function updateHighlightTags(id, tags) {
  return withStorageWriteLock(() => updateHighlightTagsUnlocked(id, tags));
}

async function updateHighlightTagsUnlocked(id, tags) {
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };
  highlights[id].tags = tags;
  await setStorage('highlights', highlights);
  await broadcastDataChanged(['highlights']);
  return { success: true };
}

// ─── SPA Navigation Listener ──────────────────────────────────────────────────

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) {
    chrome.tabs.sendMessage(
      details.tabId,
      {
        type: 'SPA_NAVIGATION',
        url: details.url,
      },
      () => {
        // Accessing chrome.runtime.lastError clears the error state
        if (chrome.runtime.lastError) {
          // Tab is not ready or content script is not injected (e.g. chrome:// or store pages)
        }
      }
    );
  }
});
