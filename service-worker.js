// MarkBuddy — Service Worker (Manifest V3)
// Handles: side panel opening, context menus, message routing, storage ops

// State to track open side panels per window
const openSidePanels = new Map(); // windowId -> boolean

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

async function saveBookmark({ url, title, favicon, tags = [] }) {
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
  return { success: true, bookmark: bookmarks[url] };
}

async function saveHighlight({ url, text, color, serializedRange, pageTitle, pageFavicon }) {
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
    await saveBookmark({
      url,
      title: pageTitle || url,
      favicon: pageFavicon || '',
      tags: [],
    });
    const freshBookmarks = (await getStorage('bookmarks')) || {};
    freshBookmarks[url].highlightIds = [id];
    await setStorage('bookmarks', freshBookmarks);
  } else {
    if (!bookmarks[url].highlightIds) bookmarks[url].highlightIds = [];
    bookmarks[url].highlightIds.push(id);
    await setStorage('bookmarks', bookmarks);
  }

  return { success: true, highlight: highlights[id] };
}

async function deleteBookmark(url) {
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
  }

  return { success: true };
}

async function deleteHighlight(id) {
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
  const bookmarks = (await getStorage('bookmarks')) || {};
  if (bookmarks[url]) {
    bookmarks[url].tags = tags;
    await setStorage('bookmarks', bookmarks);
    await syncTags(bookmarks);
  }
  return { success: true };
}

async function deleteTag(tag) {
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
  }
  return { success: true };
}

async function syncTags(bookmarks) {
  const tagSet = new Set();
  Object.values(bookmarks).forEach(bm => (bm.tags || []).forEach(t => tagSet.add(t)));
  await setStorage('tags', Array.from(tagSet).sort());
}

async function updateHighlightNote(id, note) {
  const highlights = (await getStorage('highlights')) || {};
  if (highlights[id]) {
    highlights[id].note = note;
    await setStorage('highlights', highlights);
    return { success: true, highlight: highlights[id] };
  }
  return { success: false, error: 'Highlight not found' };
}

async function updateHighlightRange(id, serializedRange) {
  const highlights = (await getStorage('highlights')) || {};
  if (highlights[id]) {
    highlights[id].serializedRange = serializedRange;
    highlights[id].active = true;
    await setStorage('highlights', highlights);
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
  await setStorage('settings', settings);
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
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };

  const review = highlights[id].review || createInitialReviewState(true);
  review.enabled = true;
  review.sm2 = computeSM2(review.sm2 || createInitialReviewState(true).sm2, quality);
  highlights[id].review = review;
  await setStorage('highlights', highlights);
  return { success: true, sm2: highlights[id].review.sm2 };
}

async function updateHighlightReview(id, enabled) {
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };

  const current = highlights[id].review || {};
  highlights[id].review = {
    ...current,
    enabled: Boolean(enabled),
    sm2: current.sm2 || createInitialReviewState(Boolean(enabled)).sm2,
  };
  await setStorage('highlights', highlights);
  return { success: true, review: highlights[id].review };
}

async function updateHighlightTags(id, tags) {
  const highlights = (await getStorage('highlights')) || {};
  if (!highlights[id]) return { success: false, error: 'Highlight not found' };
  highlights[id].tags = tags;
  await setStorage('highlights', highlights);
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
