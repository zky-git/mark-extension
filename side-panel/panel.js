// MarkBuddy — Side Panel Logic

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────────

  let allBookmarks = [];
  let allTags = [];
  let settings = { defaultColor: '#FFD700', presetColors: ['#FFD700', '#90EE90', '#87CEEB', '#FFB6C1', '#DDA0DD'], themeMode: 'system', reviewEnabled: true };
  let activeTagFilters = new Set(); // empty = show all
  let searchQuery = '';
  let pendingTagUrl = null; // which bookmark the tag modal is targeting
  let groupByDomain = true; // default: group enabled
  let sortBy = 'time-desc'; // default: newest first
  let panelNoticeTimer = null;
  let expandedBookmarkUrls = new Set();

  // Review state
  let reviewQueue = [];       // Due highlights for today
  let reviewIndex = 0;        // Current card index
  let reviewSession = { remembered: 0, fuzzy: 0, forgot: 0 }; // Session stats


  // ─── SW Connection to Track Open State ────────────────────────────────────────

  try {
    chrome.windows.getCurrent().then((currentWindow) => {
      const port = chrome.runtime.connect({ name: 'markbuddy-sidepanel' });
      port.postMessage({ type: 'INIT', windowId: currentWindow.id });
    });
  } catch (err) {
    console.warn('[MarkBuddy Panel] Port connection failed:', err);
  }

  // ─── Messaging ────────────────────────────────────────────────────────────────

  function sendMessage(type, payload = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[MarkBuddy Panel]', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(resp);
        }
      });
    });
  }

  function applyThemeMode(themeMode) {
    const normalized = ['light', 'dark'].includes(themeMode) ? themeMode : 'system';
    if (normalized === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = normalized;
    }
  }

  function isReviewFeatureEnabled() {
    return settings.reviewEnabled !== false;
  }

  function hasReviewEnabledHighlights() {
    return allBookmarks.some(bm => (bm.highlights || []).some(h => h.review?.enabled === true));
  }

  function showPanelNotice(message, tone = 'danger') {
    const list = document.getElementById('bookmark-list');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsBody = settingsPanel?.querySelector('.settings-body');
    const target = settingsPanel && !settingsPanel.classList.contains('hidden') && settingsBody
      ? settingsBody
      : list;
    if (!target) return;

    let notice = document.getElementById('panel-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'panel-notice';
      notice.className = 'panel-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
    }
    target.prepend(notice);

    notice.textContent = message;
    notice.dataset.tone = tone;
    notice.classList.remove('hidden');

    clearTimeout(panelNoticeTimer);
    panelNoticeTimer = setTimeout(() => {
      notice.classList.add('hidden');
    }, 3200);
  }

  async function openBookmarkUrl(url) {
    try {
      new URL(url);
    } catch {
      showPanelNotice('无法打开网页，请检查链接是否有效。');
      return false;
    }

    try {
      await chrome.tabs.create({ url });
      return true;
    } catch (err) {
      console.warn('[MarkBuddy Panel] Failed to open bookmark URL:', err);
      showPanelNotice('无法打开网页，请检查链接是否有效。');
      return false;
    }
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  async function loadAll() {
    const [bookmarksResp, tagsResp, settingsResp, groupResp, sortResp] = await Promise.all([
      sendMessage('GET_ALL_BOOKMARKS'),
      sendMessage('GET_ALL_TAGS'),
      sendMessage('GET_SETTINGS'),
      chrome.storage.local.get('groupByDomain').catch(() => ({})),
      chrome.storage.local.get('sortBy').catch(() => ({})),
    ]).catch(err => {
      console.error('[MarkBuddy Panel] Failed to load data:', err);
      return [[], [], null, {}, {}];
    });

    allBookmarks = bookmarksResp || [];
    allTags = tagsResp || [];
    if (settingsResp) {
      settings = {
        ...settings,
        ...settingsResp,
        reviewEnabled: settingsResp.reviewEnabled !== false,
      };
    }
    applyThemeMode(settings.themeMode);
    const themeSelect = document.getElementById('theme-mode-select');
    if (themeSelect) themeSelect.value = ['light', 'dark'].includes(settings.themeMode) ? settings.themeMode : 'system';
    const reviewEnabledCheckbox = document.getElementById('review-enabled-checkbox');
    if (reviewEnabledCheckbox) reviewEnabledCheckbox.checked = isReviewFeatureEnabled();

    // groupByDomain defaults to true if never saved
    groupByDomain = !groupResp || groupResp.groupByDomain !== false;
    const checkbox = document.getElementById('group-by-domain-checkbox');
    if (checkbox) checkbox.checked = groupByDomain;

    // sortBy defaults to 'time-desc' if never saved
    sortBy = (sortResp && sortResp.sortBy) || 'time-desc';
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = sortBy;

    renderTagsBar();
    renderColorGrid();
    renderList();
    updateStats();

    // Refresh review banner count
    updateReviewBanner();
  }


  // ─── Filtering / Searching ────────────────────────────────────────────────────

  function getFilteredBookmarksForTags() {
    let list = allBookmarks;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(bm => {
        const inTitle = bm.title?.toLowerCase().includes(q);
        const inUrl = bm.url?.toLowerCase().includes(q);
        const inHighlights = (bm.highlights || []).some(h => {
          const inText = h.text?.toLowerCase().includes(q);
          const inNote = h.note?.toLowerCase().includes(q);
          return inText || inNote;
        });
        return inTitle || inUrl || inHighlights;
      });
    }

    return list;
  }

  function getDynamicTags() {
    const list = getFilteredBookmarksForTags();
    const counts = {};
    list.forEach(bm => {
      (bm.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    // Sort by count descending, then alphabetically
    return Object.keys(counts).sort((a, b) => {
      if (counts[b] !== counts[a]) {
        return counts[b] - counts[a];
      }
      return a.localeCompare(b);
    });
  }

  function getFilteredBookmarks() {
    let list = allBookmarks;

    // Tag filter
    if (activeTagFilters.size > 0) {
      list = list.filter(bm =>
        (bm.tags || []).some(tag => activeTagFilters.has(tag))
      );
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(bm => {
        const inTitle = bm.title?.toLowerCase().includes(q);
        const inUrl = bm.url?.toLowerCase().includes(q);
        const inHighlights = (bm.highlights || []).some(h => {
          const inText = h.text?.toLowerCase().includes(q);
          const inNote = h.note?.toLowerCase().includes(q);
          return inText || inNote;
        });
        return inTitle || inUrl || inHighlights;
      });
    }

    // Sorting
    list = [...list]; // create shallow copy to avoid mutating cache
    list.sort((a, b) => {
      if (sortBy === 'time-asc') {
        return (a.savedAt || 0) - (b.savedAt || 0);
      }
      if (sortBy === 'modified-desc') {
        const aMod = a.highlights && a.highlights.length > 0 ? Math.max(a.savedAt || 0, a.highlights[0].savedAt || 0) : (a.savedAt || 0);
        const bMod = b.highlights && b.highlights.length > 0 ? Math.max(b.savedAt || 0, b.highlights[0].savedAt || 0) : (b.savedAt || 0);
        return bMod - aMod;
      }
      if (sortBy === 'domain-asc' || sortBy === 'domain-desc') {
        let domainA = a.url || '';
        let domainB = b.url || '';
        try { domainA = new URL(a.url).hostname.toLowerCase(); } catch {}
        try { domainB = new URL(b.url).hostname.toLowerCase(); } catch {}
        const cmp = domainA.localeCompare(domainB);
        return sortBy === 'domain-asc' ? cmp : -cmp;
      }
      // default: time-desc
      return (b.savedAt || 0) - (a.savedAt || 0);
    });

    return list;
  }

  // ─── Render Tags Bar ──────────────────────────────────────────────────────────

  function renderTagsBar() {
    const bar = document.getElementById('tags-bar');
    // Remove all non-"全部" chips
    bar.querySelectorAll('.tag-chip:not(#tag-all)').forEach(el => el.remove());

    // Dynamically calculate tags based on list items
    allTags = getDynamicTags();

    // Clean up active filters that no longer exist
    const tagSet = new Set(allTags);
    activeTagFilters.forEach(tag => {
      if (!tagSet.has(tag)) {
        activeTagFilters.delete(tag);
      }
    });

    allTags.forEach(tag => {
      const chip = document.createElement('div');
      chip.className = 'tag-chip' + (activeTagFilters.has(tag) ? ' active' : '');
      chip.dataset.tag = tag;

      const text = document.createElement('span');
      text.className = 'tag-chip-text';
      text.textContent = tag;
      chip.appendChild(text);

      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'tag-chip-delete';
      deleteBtn.textContent = '×';
      deleteBtn.title = '删除标签';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent toggling the filter
        if (await showCustomConfirm(`确定要彻底删除标签 "${tag}" 吗？此操作将从所有已收藏的内容中移除该标签。`, '确认删除标签')) {
          await sendMessage('DELETE_TAG', { tag });
          if (activeTagFilters.has(tag)) {
            activeTagFilters.delete(tag);
          }
          await loadAll();
        }
      });
      chip.appendChild(deleteBtn);

      chip.addEventListener('click', () => toggleTagFilter(tag, chip));
      bar.appendChild(chip);
    });

    // Sync "全部" state
    const allBtn = document.getElementById('tag-all');
    allBtn.classList.toggle('active', activeTagFilters.size === 0);
  }

  function toggleTagFilter(tag, chip) {
    if (activeTagFilters.has(tag)) {
      activeTagFilters.delete(tag);
      chip.classList.remove('active');
    } else {
      activeTagFilters.add(tag);
      chip.classList.add('active');
    }
    const allBtn = document.getElementById('tag-all');
    allBtn.classList.toggle('active', activeTagFilters.size === 0);
    renderList();
    updateStats();
  }

  // ─── Render Settings Color Grid ───────────────────────────────────────────────

  function renderColorGrid() {
    const grid = document.getElementById('color-grid');
    grid.innerHTML = '';
    (settings.presetColors || []).forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch-panel' + (color === settings.defaultColor ? ' selected' : '');
      swatch.style.backgroundColor = color;
      swatch.title = color;
      swatch.dataset.color = color;
      swatch.addEventListener('click', () => selectDefaultColor(color));
      grid.appendChild(swatch);
    });
  }

  async function selectDefaultColor(color) {
    settings.defaultColor = color;
    await sendMessage('SAVE_SETTINGS', settings);
    renderColorGrid();
  }

  // ─── Render Bookmark List ─────────────────────────────────────────────────────

  function renderList() {
    const list = document.getElementById('bookmark-list');
    const emptyState = document.getElementById('empty-state');
    const noResultsState = document.getElementById('no-results-state');

    // Clear existing cards and groups
    list.querySelectorAll('.bookmark-card, .domain-group').forEach(el => el.remove());

    const filtered = getFilteredBookmarks();

    // Empty states
    emptyState.classList.toggle('hidden', allBookmarks.length > 0 || searchQuery !== '' || activeTagFilters.size > 0);
    noResultsState.classList.toggle('hidden', !(filtered.length === 0 && (searchQuery !== '' || activeTagFilters.size > 0)));

    if (groupByDomain && filtered.length > 0) {
      renderGroupedList(list, filtered);
    } else {
      filtered.forEach(bm => {
        const card = buildBookmarkCard(bm);
        list.appendChild(card);
      });
    }
  }

  function renderGroupedList(list, bookmarks) {
    // Group bookmarks by domain
    const groups = new Map();
    bookmarks.forEach(bm => {
      let domain = bm.url;
      try { domain = new URL(bm.url).hostname; } catch {}
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(bm);
    });

    groups.forEach((bms, domain) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'domain-group';

      // Header
      const header = document.createElement('div');
      header.className = 'domain-group-header open'; // default expanded

      // Favicon from first bookmark
      const firstBm = bms[0];
      if (firstBm.favicon) {
        const img = document.createElement('img');
        img.className = 'domain-group-favicon';
        img.src = firstBm.favicon;
        img.alt = '';
        img.addEventListener('error', () => {
          img.replaceWith(buildDomainFaviconFallback(domain));
        });
        header.appendChild(img);
      } else {
        header.appendChild(buildDomainFaviconFallback(domain));
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'domain-group-name';
      nameEl.textContent = domain;
      header.appendChild(nameEl);

      const countEl = document.createElement('span');
      countEl.className = 'domain-group-count';
      countEl.textContent = bms.length;
      header.appendChild(countEl);

      const arrowEl = document.createElement('span');
      arrowEl.className = 'domain-group-arrow';
      arrowEl.textContent = '▶';
      header.appendChild(arrowEl);

      // Items container
      const itemsEl = document.createElement('div');
      itemsEl.className = 'domain-group-items open';

      bms.forEach(bm => {
        const card = buildBookmarkCard(bm);
        itemsEl.appendChild(card);
      });

      // Toggle collapse
      header.addEventListener('click', () => {
        const isOpen = header.classList.toggle('open');
        itemsEl.classList.toggle('open', isOpen);
      });

      groupEl.appendChild(header);
      groupEl.appendChild(itemsEl);
      list.appendChild(groupEl);
    });
  }

  function buildDomainFaviconFallback(domain) {
    const div = document.createElement('div');
    div.className = 'domain-group-favicon-fallback';
    div.textContent = domain ? domain[0].toUpperCase() : '?';
    return div;
  }



  function updateStats() {
    const filtered = getFilteredBookmarks();
    const statsText = document.getElementById('stats-text');
    const statsBar = document.getElementById('stats-bar');
    const total = allBookmarks.length;
    const shown = filtered.length;
    const hlCount = filtered.reduce((acc, bm) => acc + (bm.highlights?.length || 0), 0);

    if (total === 0) {
      statsText.textContent = '';
      statsBar.classList.add('hidden');
    } else {
      statsBar.classList.remove('hidden');
      if (shown === total) {
        statsText.textContent = `${total} 个网页 · ${hlCount} 条划线`;
      } else {
        statsText.textContent = `显示 ${shown} / ${total} 个网页`;
      }
    }
  }

  // ─── Markdown Export ─────────────────────────────────────────────────────────

  function getExportFormatter() {
    return window.MarkBuddyExport || null;
  }

  function getBackupHelper() {
    return window.MarkBuddyBackup || null;
  }

  function getCurrentExportScopeBookmarks() {
    return getFilteredBookmarks();
  }

  function getExportTitle(scope, bookmarks) {
    if (scope === 'single') {
      const bm = bookmarks[0];
      return bm?.title || bm?.url || 'MarkBuddy Export';
    }
    if (scope === 'filtered') return 'MarkBuddy Filtered Export';
    return 'MarkBuddy Export';
  }

  function downloadTextFile(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setExportStatus(message, tone = 'muted') {
    const status = document.getElementById('export-status');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  async function exportBookmarks(scope, bookmark = null) {
    const formatter = getExportFormatter();
    if (!formatter) {
      setExportStatus('导出模块未加载，请刷新侧边栏后重试。', 'danger');
      return;
    }

    const bookmarks = bookmark ? [bookmark] : (scope === 'filtered' ? getCurrentExportScopeBookmarks() : allBookmarks);
    if (!bookmarks.length) {
      setExportStatus('当前没有可导出的收藏。', 'danger');
      return;
    }

    const exportedAt = Date.now();
    const title = getExportTitle(bookmark ? 'single' : scope, bookmarks);
    const markdown = formatter.formatBookmarksAsMarkdown(bookmarks, { title, exportedAt });
    if (!markdown) {
      setExportStatus('当前没有可导出的内容。', 'danger');
      return;
    }

    const filename = formatter.buildExportFilename(title, exportedAt);
    downloadTextFile(markdown, filename, 'text/markdown;charset=utf-8');
    setExportStatus(`已准备下载：${filename}`, 'success');
  }

  function setBackupStatus(message, tone = 'muted') {
    const status = document.getElementById('backup-status');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  async function exportJsonBackup() {
    const backup = getBackupHelper();
    if (!backup) {
      setBackupStatus('备份模块未加载，请刷新侧边栏后重试。', 'danger');
      return;
    }

    const exportedAt = Date.now();
    const snapshot = await chrome.storage.local.get(backup.BACKUP_KEYS);
    const payload = backup.createBackupPayload(snapshot, { exportedAt });
    const filename = backup.buildBackupFilename(exportedAt);
    downloadTextFile(`${JSON.stringify(payload, null, 2)}\n`, filename, 'application/json;charset=utf-8');
    setBackupStatus(`已准备下载：${filename}`, 'success');
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result || '')));
      reader.addEventListener('error', () => reject(reader.error || new Error('读取文件失败。')));
      reader.readAsText(file);
    });
  }

  async function importJsonBackup(file) {
    const backup = getBackupHelper();
    if (!backup) {
      setBackupStatus('备份模块未加载，请刷新侧边栏后重试。', 'danger');
      return;
    }

    try {
      const text = await readFileAsText(file);
      const payload = backup.parseBackupPayload(text);
      const count = Object.keys(payload.data.bookmarks || {}).length;
      const ok = await showCustomConfirm(
        `导入将覆盖当前 MarkBuddy 本地数据，并恢复 ${count} 个网页收藏。继续吗？`,
        '确认导入备份'
      );
      if (!ok) {
        setBackupStatus('已取消导入。');
        return;
      }

      await chrome.storage.local.set(payload.data);
      setBackupStatus('备份已导入，列表已刷新。', 'success');
      await loadAll();
    } catch (err) {
      setBackupStatus(err.message || '导入失败，请检查备份文件。', 'danger');
    }
  }

  function refreshExportDialogText() {
    const filtered = getCurrentExportScopeBookmarks();
    const filteredHighlights = filtered.reduce((acc, bm) => acc + (bm.highlights?.length || 0), 0);
    const allHighlights = allBookmarks.reduce((acc, bm) => acc + (bm.highlights?.length || 0), 0);
    const filteredDesc = document.getElementById('export-filtered-desc');
    const allDesc = document.getElementById('export-all-desc');
    if (filteredDesc) filteredDesc.textContent = `导出 ${filtered.length} 个网页、${filteredHighlights} 条划线`;
    if (allDesc) allDesc.textContent = `导出 ${allBookmarks.length} 个网页、${allHighlights} 条划线`;
  }

  // ─── Build Bookmark Card ──────────────────────────────────────────────────────

  function buildBookmarkCard(bm) {
    const card = document.createElement('div');
    card.className = 'bookmark-card';
    card.dataset.url = bm.url;

    // ── Header row ──
    const header = document.createElement('div');
    header.className = 'card-header';

    // Favicon
    const faviconEl = buildFavicon(bm);
    header.appendChild(faviconEl);

    // Info
    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('a');
    title.className = 'card-title';
    title.textContent = bm.title || bm.url;
    title.href = bm.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.title = bm.title || bm.url;
    if (searchQuery) {
      title.innerHTML = highlightMatch(bm.title || bm.url, searchQuery);
    }
    title.addEventListener('click', (e) => {
      e.preventDefault();
      openBookmarkUrl(bm.url);
    });
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'card-url';
    try {
      urlSpan.textContent = new URL(bm.url).hostname;
    } catch {
      urlSpan.textContent = bm.url;
    }
    meta.appendChild(urlSpan);

    const dot = document.createElement('span');
    dot.className = 'card-dot';
    dot.textContent = '·';
    meta.appendChild(dot);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'card-date';
    dateSpan.textContent = formatDate(bm.savedAt);
    meta.appendChild(dateSpan);

    info.appendChild(meta);
    header.appendChild(info);

    // Delete action on header
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-action-btn danger';
    deleteBtn.title = '删除收藏';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await showCustomConfirm('确定要删除此收藏吗？此网页下的所有高亮划线也将一同被删除。', '确认删除收藏')) {
        deleteBookmark(bm.url, card);
      }
    });
    header.appendChild(deleteBtn);

    card.appendChild(header);

    // ── Tags row ──
    const tagsRow = document.createElement('div');
    tagsRow.className = 'card-tags';

    (bm.tags || []).forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'card-tag';
      
      const tagText = document.createElement('span');
      tagText.className = 'card-tag-name';
      tagText.textContent = tag;
      tagText.addEventListener('click', (e) => {
        e.stopPropagation();
        activeTagFilters.add(tag);
        renderTagsBar();
        renderList();
        updateStats();
      });
      tagEl.appendChild(tagText);

      const tagDeleteBtn = document.createElement('span');
      tagDeleteBtn.className = 'card-tag-delete';
      tagDeleteBtn.textContent = '×';
      tagDeleteBtn.title = '从该网页移除此标签';
      tagDeleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updatedTags = (bm.tags || []).filter(t => t !== tag);
        await sendMessage('UPDATE_BOOKMARK_TAGS', { url: bm.url, tags: updatedTags });
        await loadAll();
      });
      tagEl.appendChild(tagDeleteBtn);

      tagsRow.appendChild(tagEl);
    });

    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'card-tag-add';
    addTagBtn.textContent = '+ 标签';
    addTagBtn.addEventListener('click', () => openTagModal(bm));
    tagsRow.appendChild(addTagBtn);

    card.appendChild(tagsRow);

    // ── Highlights section ──
    const highlights = bm.highlights || [];

    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'card-expand-btn';
    expandBtn.innerHTML = `✏️ ${highlights.length} 条划线 <span class="expand-arrow">▼</span>`;
    if (highlights.length === 0) {
      expandBtn.style.color = 'var(--text-muted)';
      expandBtn.style.cursor = 'default';
    }

    footer.appendChild(expandBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'card-action-btn card-export-btn';
    exportBtn.title = '导出该网页为 Markdown';
    exportBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;
    exportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await exportBookmarks('single', bm);
    });
    footer.appendChild(exportBtn);

    card.appendChild(footer);

    // Highlights list (collapsible)
    const hlList = document.createElement('div');
    hlList.className = 'highlights-list';

    if (highlights.length > 0) {
      highlights.forEach(h => {
        const item = buildHighlightItem(h, bm.url);
        hlList.appendChild(item);
      });

      expandBtn.addEventListener('click', () => {
        const isOpen = hlList.classList.toggle('open');
        expandBtn.classList.toggle('expanded', isOpen);
        if (isOpen) {
          expandedBookmarkUrls.add(bm.url);
        } else {
          expandedBookmarkUrls.delete(bm.url);
        }
      });

      // Auto-expand if search matches a highlight or its note
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hasMatch = highlights.some(h => 
          h.text?.toLowerCase().includes(q) || h.note?.toLowerCase().includes(q)
        );
        if (hasMatch) {
          hlList.classList.add('open');
          expandBtn.classList.add('expanded');
        }
      }

      if (expandedBookmarkUrls.has(bm.url)) {
        hlList.classList.add('open');
        expandBtn.classList.add('expanded');
      }
    }

    card.appendChild(hlList);
    return card;
  }

  function buildFavicon(bm) {
    if (bm.favicon) {
      const img = document.createElement('img');
      img.className = 'card-favicon';
      img.src = bm.favicon;
      img.alt = '';
      img.addEventListener('error', () => {
        img.replaceWith(buildFaviconFallback(bm));
      });
      return img;
    }
    return buildFaviconFallback(bm);
  }

  function buildFaviconFallback(bm) {
    const div = document.createElement('div');
    div.className = 'card-favicon-fallback';
    try {
      div.textContent = new URL(bm.url).hostname[0].toUpperCase();
    } catch {
      div.textContent = '?';
    }
    return div;
  }

  function buildHighlightItem(h, pageUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'highlight-wrapper';
    wrapper.dataset.id = h.id;

    // ── The clickable highlight text item ──
    const item = document.createElement('div');
    item.className = 'highlight-item';
    item.title = '点击跳转到对应页面';

    const dot = document.createElement('div');
    dot.className = 'highlight-color-dot';
    dot.style.backgroundColor = h.color || '#FFD700';
    item.appendChild(dot);

    const text = document.createElement('div');
    text.className = 'highlight-text';
    if (searchQuery) {
      text.innerHTML = highlightMatch(h.text || '', searchQuery);
    } else {
      text.textContent = h.text || '';
    }
    item.appendChild(text);

    if (isReviewFeatureEnabled()) {
      const inReview = h.review?.enabled === true;
      const reviewBtn = document.createElement('button');
      reviewBtn.className = 'highlight-review-btn' + (inReview ? ' active' : '');
      reviewBtn.title = inReview ? '移出复习队列' : '加入复习队列';
      reviewBtn.setAttribute('aria-label', inReview ? '移出复习队列' : '加入复习队列');
      reviewBtn.textContent = inReview ? '移出复习' : '加入复习';
      reviewBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await sendMessage('UPDATE_HIGHLIGHT_REVIEW', { id: h.id, enabled: !inReview });
        await loadAll();
      });
      item.appendChild(reviewBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'highlight-delete-btn';
    deleteBtn.title = '删除划线';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendMessage('DELETE_HIGHLIGHT', { id: h.id });
      await loadAll();
    });
    item.appendChild(deleteBtn);

    // Click to navigate to the page
    item.addEventListener('click', (e) => {
      if (e.target === deleteBtn) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.warn('[MarkBuddy Panel] Could not query active tab:', chrome.runtime.lastError.message);
          showPanelNotice('无法打开网页，请检查链接是否有效。');
          return;
        }
        const activeTab = tabs?.[0];
        if (!activeTab) {
          showPanelNotice('无法打开网页，请检查链接是否有效。');
          return;
        }
        if (activeTab.url === pageUrl) {
          // Already on this page — scroll to highlight
          chrome.tabs.sendMessage(activeTab.id, { type: 'SCROLL_TO_HIGHLIGHT', highlightId: h.id }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[MarkBuddy Panel] Could not send scroll message:', chrome.runtime.lastError.message);
            }
          });
        } else {
          chrome.tabs.update(activeTab.id, { url: pageUrl }, () => {
            if (chrome.runtime.lastError) {
              console.warn('[MarkBuddy Panel] Could not navigate active tab:', chrome.runtime.lastError.message);
              openBookmarkUrl(pageUrl);
            }
          });
        }
      });
    });

    wrapper.appendChild(item);

    // ── The note/annotation container ──
    const noteContainer = document.createElement('div');
    noteContainer.className = 'highlight-note-container';

    function renderNoteView() {
      noteContainer.innerHTML = '';
      if (h.note) {
        const noteTextDiv = document.createElement('div');
        noteTextDiv.className = 'highlight-note-text';
        
        const noteIcon = document.createElement('span');
        noteIcon.className = 'highlight-note-icon';
        noteIcon.textContent = '📝 ';
        noteTextDiv.appendChild(noteIcon);

        const contentSpan = document.createElement('span');
        contentSpan.className = 'highlight-note-content';
        if (searchQuery) {
          contentSpan.innerHTML = highlightMatch(h.note, searchQuery);
        } else {
          contentSpan.textContent = h.note;
        }
        noteTextDiv.appendChild(contentSpan);

        const editBtn = document.createElement('button');
        editBtn.className = 'highlight-note-edit-btn';
        editBtn.textContent = '编辑';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renderNoteEdit();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'highlight-note-delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          h.note = '';
          await sendMessage('UPDATE_HIGHLIGHT_NOTE', { id: h.id, note: '' });
          await loadAll();
        });

        const noteBtns = document.createElement('div');
        noteBtns.className = 'highlight-note-btn-row';
        noteBtns.appendChild(editBtn);
        noteBtns.appendChild(deleteBtn);

        noteContainer.appendChild(noteTextDiv);
        noteContainer.appendChild(noteBtns);
      } else {
        const addBtn = document.createElement('button');
        addBtn.className = 'highlight-note-add-btn';
        addBtn.textContent = '+ 添加批注';
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renderNoteEdit();
        });
        noteContainer.appendChild(addBtn);
      }
    }

    function renderNoteEdit() {
      noteContainer.innerHTML = '';
      
      const textarea = document.createElement('textarea');
      textarea.className = 'highlight-note-textarea';
      textarea.placeholder = '添加对本条划线的批注...';
      textarea.value = h.note || '';

      const actions = document.createElement('div');
      actions.className = 'highlight-note-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'highlight-note-btn cancel';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderNoteView();
      });

      const saveBtn = document.createElement('button');
      saveBtn.className = 'highlight-note-btn save';
      saveBtn.textContent = '保存';
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newNote = textarea.value.trim();
        h.note = newNote; // Optimistic update
        await sendMessage('UPDATE_HIGHLIGHT_NOTE', { id: h.id, note: newNote });
        await loadAll();
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      
      noteContainer.appendChild(textarea);
      noteContainer.appendChild(actions);

      // Focus textarea
      setTimeout(() => textarea.focus(), 50);
    }

    renderNoteView();
    wrapper.appendChild(noteContainer);

    return wrapper;
  }

  // ─── Delete Bookmark ──────────────────────────────────────────────────────────

  async function deleteBookmark(url, cardEl) {
    // Animate out before removing
    cardEl.classList.add('removing');
    await new Promise(r => setTimeout(r, 220));
    await sendMessage('DELETE_BOOKMARK', { url });
    await loadAll();
  }

  function showCustomConfirm(message, title = '确认操作') {
    return new Promise((resolve) => {
      const dialog = document.getElementById('custom-confirm-dialog');
      const titleEl = document.getElementById('confirm-title');
      const msgEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');

      if (titleEl) titleEl.textContent = title;
      msgEl.textContent = message;
      
      const handleOk = () => {
        cleanup();
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('cancel', handleCancel);
        dialog.close();
      };

      okBtn.addEventListener('click', handleOk);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('cancel', handleCancel);

      dialog.showModal();
    });
  }

  // ─── Tag Modal ────────────────────────────────────────────────────────────────

  function openTagModal(bm) {
    pendingTagUrl = bm.url;
    const dialog = document.getElementById('tag-dialog');
    const input = document.getElementById('tag-input');
    const existingList = document.getElementById('existing-tags-list');

    input.value = '';
    existingList.innerHTML = '';

    // Show existing tags as options
    allTags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'modal-tag-option' + ((bm.tags || []).includes(tag) ? ' selected' : '');
      btn.textContent = tag;
      btn.dataset.tag = tag;
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
      existingList.appendChild(btn);
    });

    dialog.showModal();
    input.focus();
  }

  async function confirmTagModal() {
    if (!pendingTagUrl) return;
    const input = document.getElementById('tag-input');
    const existingList = document.getElementById('existing-tags-list');

    const newTag = input.value.trim();
    const selectedExisting = Array.from(
      existingList.querySelectorAll('.modal-tag-option.selected')
    ).map(btn => btn.dataset.tag);

    const tags = [...new Set([...selectedExisting, ...(newTag ? [newTag] : [])])];

    await sendMessage('UPDATE_BOOKMARK_TAGS', { url: pendingTagUrl, tags });
    closeTagModal();
    await loadAll();
  }

  function closeTagModal() {
    document.getElementById('tag-dialog').close();
    pendingTagUrl = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function formatDate(ts) {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 30) return `${days} 天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
  }

  function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text || '');
    const escaped = escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(
      new RegExp(escapedQuery, 'gi'),
      match => `<mark class="search-match">${match}</mark>`
    );
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────────

  // Settings toggle
  document.getElementById('settings-toggle-btn').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    panel.classList.remove('hidden');
  });

  // Settings back button
  document.getElementById('settings-back-btn').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    panel.classList.add('hidden');
  });

  // Markdown export
  document.getElementById('export-toggle-btn').addEventListener('click', () => {
    refreshExportDialogText();
    setExportStatus('');
    document.getElementById('export-dialog').showModal();
  });

  document.getElementById('export-close-btn').addEventListener('click', () => {
    document.getElementById('export-dialog').close();
  });

  document.getElementById('export-dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('export-dialog').close();
    }
  });

  document.getElementById('export-filtered-btn').addEventListener('click', () => {
    exportBookmarks('filtered');
  });

  document.getElementById('export-all-btn').addEventListener('click', () => {
    exportBookmarks('all');
  });

  // JSON backup / restore
  document.getElementById('backup-export-btn').addEventListener('click', exportJsonBackup);

  document.getElementById('backup-import-btn').addEventListener('click', () => {
    const input = document.getElementById('backup-file-input');
    input.value = '';
    input.click();
  });

  document.getElementById('backup-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importJsonBackup(file);
  });

  // Add custom color
  document.getElementById('add-color-btn').addEventListener('click', async () => {
    const color = document.getElementById('custom-color-input').value;
    if (!settings.presetColors.includes(color)) {
      settings.presetColors.push(color);
      settings.defaultColor = color;
      await sendMessage('SAVE_SETTINGS', settings);
      renderColorGrid();
    }
  });

  // Search
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !searchQuery);
    renderTagsBar();
    renderList();
    updateStats();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.add('hidden');
    renderTagsBar();
    renderList();
    updateStats();
  });

  // Tag "全部" button
  document.getElementById('tag-all').addEventListener('click', () => {
    activeTagFilters.clear();
    renderTagsBar();
    renderList();
    updateStats();
  });

  // Tag modal — native dialog
  document.getElementById('modal-confirm').addEventListener('click', confirmTagModal);
  document.getElementById('modal-cancel').addEventListener('click', closeTagModal);
  document.getElementById('modal-close').addEventListener('click', closeTagModal);
  // Native <dialog> closes on Escape automatically; also handle backdrop click
  document.getElementById('tag-dialog').addEventListener('click', (e) => {
    // Click on backdrop (dialog itself, not its contents)
    if (e.target === e.currentTarget) closeTagModal();
  });
  document.getElementById('tag-dialog').addEventListener('cancel', () => {
    pendingTagUrl = null; // reset when closed via Escape key
  });
  document.getElementById('tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmTagModal();
    // Escape is handled natively by <dialog>
  });

  // Listen for storage changes (e.g. highlight added from content script)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.bookmarks || changes.highlights || changes.tags || changes.settings)) {
      loadAll();
    }
  });

  // Group-by-domain switch
  document.getElementById('group-by-domain-checkbox').addEventListener('change', async (e) => {
    groupByDomain = e.target.checked;
    await chrome.storage.local.set({ groupByDomain }).catch(() => {});
    renderList();
  });

  const themeModeSelect = document.getElementById('theme-mode-select');
  if (themeModeSelect) {
    themeModeSelect.addEventListener('change', async (e) => {
      const themeMode = e.target.value;
      settings.themeMode = themeMode;
      applyThemeMode(themeMode);
      await sendMessage('SAVE_SETTINGS', settings);
    });
  }

  const reviewEnabledCheckbox = document.getElementById('review-enabled-checkbox');
  if (reviewEnabledCheckbox) {
    reviewEnabledCheckbox.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      if (!enabled && hasReviewEnabledHighlights()) {
        e.target.checked = true;
        settings.reviewEnabled = true;
        showPanelNotice('已有划线处于复习中，请先移出复习队列后再关闭。');
        return;
      }

      settings.reviewEnabled = enabled;
      await sendMessage('SAVE_SETTINGS', settings);
      renderList();
      updateReviewBanner();
    });
  }

  // Sort selection dropdown change listener
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', async (e) => {
      sortBy = e.target.value;
      await chrome.storage.local.set({ sortBy }).catch(() => {});
      renderList();
    });
  }

  // ─── Review Banner ────────────────────────────────────────────────────────────

  async function updateReviewBanner() {
    const banner = document.getElementById('review-banner');
    const bannerText = document.getElementById('review-banner-text');
    if (!banner) return;
    if (!isReviewFeatureEnabled()) {
      banner.classList.add('hidden');
      return;
    }
    const due = await sendMessage('GET_DUE_REVIEWS');
    if (due && due.length > 0) {
      bannerText.textContent = `今日待复习 ${due.length} 条`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // ─── Review Mode ──────────────────────────────────────────────────────────────

  function showMainView() {
    document.getElementById('review-mode').classList.add('hidden');
  }

  async function startReviewMode() {
    if (!isReviewFeatureEnabled()) {
      showPanelNotice('划线复习已关闭。', 'success');
      return;
    }
    const due = await sendMessage('GET_DUE_REVIEWS');
    if (!due) {
      showPanelNotice('无法开始复习，请稍后重试。');
      return;
    }
    if (due.length === 0) {
      showPanelNotice('暂无待复习内容。', 'success');
      updateReviewBanner();
      return;
    }

    reviewQueue = due;
    reviewIndex = 0;
    reviewSession = { remembered: 0, fuzzy: 0, forgot: 0 };

    document.getElementById('review-summary').classList.add('hidden');
    document.getElementById('review-card-area').style.display = '';
    document.getElementById('review-jump-wrap').style.display = '';
    document.getElementById('review-score-btns').style.display = '';
    document.getElementById('review-mode').classList.remove('hidden');

    renderReviewCard();
  }

  function renderReviewCard() {
    const total = reviewQueue.length;
    const current = reviewQueue[reviewIndex];

    // Progress
    const pct = total > 0 ? (reviewIndex / total) * 100 : 0;
    document.getElementById('review-progress-fill').style.width = `${pct}%`;
    document.getElementById('review-counter').textContent = `${reviewIndex + 1} / ${total} 条待复习`;

    // Card content
    document.getElementById('review-card-text').textContent = current.text || '';

    // Source domain
    let domain = current.url || '';
    try { domain = new URL(current.url).hostname; } catch {}
    document.getElementById('review-card-source').textContent = domain;

    // Note handling
    const noteEl = document.getElementById('review-card-note');
    const revealBtn = document.getElementById('review-reveal-note-btn');
    if (current.note && current.note.trim()) {
      noteEl.textContent = current.note;
      noteEl.classList.add('hidden');
      revealBtn.classList.remove('hidden');
    } else {
      noteEl.classList.add('hidden');
      revealBtn.classList.add('hidden');
    }

    // Store current highlight url for jump button
    document.getElementById('review-jump-btn').dataset.url = current.url || '';
    document.getElementById('review-jump-btn').dataset.highlightId = current.id || '';
  }

  async function submitReview(quality) {
    const current = reviewQueue[reviewIndex];
    await sendMessage('UPDATE_REVIEW_RESULT', { id: current.id, quality });

    if (quality === 5) reviewSession.remembered++;
    else if (quality === 3) reviewSession.fuzzy++;
    else reviewSession.forgot++;

    reviewIndex++;

    if (reviewIndex >= reviewQueue.length) {
      showReviewSummary();
    } else {
      renderReviewCard();
    }
  }

  function showReviewSummary() {
    const total = reviewQueue.length;
    const { remembered, fuzzy, forgot } = reviewSession;
    const memRate = total > 0 ? Math.round((remembered / total) * 100) : 0;

    // Progress bar to 100%
    document.getElementById('review-progress-fill').style.width = '100%';

    // Hide card, show summary
    document.getElementById('review-card-area').style.display = 'none';
    document.getElementById('review-jump-wrap').style.display = 'none';
    document.getElementById('review-score-btns').style.display = 'none';

    const statsEl = document.getElementById('review-summary-stats');
    statsEl.innerHTML = [
      `<div class="review-summary-row"><span class="label">完成</span><span class="value">${total} 条</span></div>`,
      `<div class="review-summary-row"><span class="label">记住了</span><span class="value good">${remembered} 条（${memRate}%）</span></div>`,
      `<div class="review-summary-row"><span class="label">模糊</span><span class="value warn">${fuzzy} 条</span></div>`,
      `<div class="review-summary-row"><span class="label">没记住</span><span class="value bad">${forgot} 条</span></div>`,
    ].join('');

    document.getElementById('review-summary').classList.remove('hidden');
    document.getElementById('review-counter').textContent = '复习完成 🎉';
  }

  // ─── Review Event Listeners ───────────────────────────────────────────────────

  document.getElementById('review-start-btn').addEventListener('click', startReviewMode);

  document.getElementById('review-exit-btn').addEventListener('click', () => {
    showMainView();
    updateReviewBanner();
  });

  document.getElementById('review-summary-close-btn').addEventListener('click', () => {
    showMainView();
    updateReviewBanner();
  });

  document.getElementById('score-remembered').addEventListener('click', () => submitReview(5));
  document.getElementById('score-fuzzy').addEventListener('click', () => submitReview(3));
  document.getElementById('score-forgot').addEventListener('click', () => submitReview(1));

  document.getElementById('review-reveal-note-btn').addEventListener('click', () => {
    document.getElementById('review-card-note').classList.remove('hidden');
    document.getElementById('review-reveal-note-btn').classList.add('hidden');
  });

  document.getElementById('review-jump-btn').addEventListener('click', async () => {
    const btn = document.getElementById('review-jump-btn');
    const url = btn.dataset.url;
    const highlightId = btn.dataset.highlightId;
    if (!url) return;
    try {
      // Open in new tab and scroll to highlight
      const [tab] = await chrome.tabs.query({ url: url + '*', currentWindow: true }).catch(() => []);
      if (tab) {
        await chrome.tabs.update(tab.id, { active: true });
        if (highlightId) {
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO_HIGHLIGHT', highlightId }, () => {
              if (chrome.runtime.lastError) {}
            });
          }, 300);
        }
      } else {
        await openBookmarkUrl(url);
      }
    } catch (err) {
      console.warn('[MarkBuddy Panel] Review jump failed:', err);
      showPanelNotice('无法打开网页，请检查链接是否有效。');
    }
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  loadAll();
})();
