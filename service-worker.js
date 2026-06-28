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

  try {
    if (info.menuItemId === 'markbuddy-save-page') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__markbuddy_savePage?.(),
      });
    }

    if (info.menuItemId === 'markbuddy-save-highlight') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__markbuddy_saveHighlight?.(),
      });
    }
  } catch (err) {
    console.error('[MarkBuddy SW] Context menu scripting failed:', err);
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
        case 'TOGGLE_SIDE_PANEL':
          const windowId = sender.tab?.windowId;
          if (!windowId) {
            sendResponse({ success: false, error: 'No window ID found' });
            break;
          }
          if (openSidePanels.has(windowId)) {
            await closeSidePanel(windowId);
            sendResponse({ success: true, state: 'closed' });
          } else {
            if (sender.tab?.id) {
              await chrome.sidePanel.open({ tabId: sender.tab.id });
              sendResponse({ success: true, state: 'opened' });
            } else {
              sendResponse({ success: false, error: 'No tab ID found' });
            }
          }
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

async function getSettings() {
  return (await getStorage('settings')) || {
    defaultColor: '#FFD700',
    presetColors: ['#FFD700', '#90EE90', '#87CEEB', '#FFB6C1', '#DDA0DD'],
  };
}

async function saveSettings(settings) {
  await setStorage('settings', settings);
  return { success: true };
}
