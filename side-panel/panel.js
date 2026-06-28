// MarkBuddy — Side Panel Logic

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────────

  let allBookmarks = [];
  let allTags = [];
  let settings = { defaultColor: '#FFD700', presetColors: ['#FFD700', '#90EE90', '#87CEEB', '#FFB6C1', '#DDA0DD'] };
  let activeTagFilters = new Set(); // empty = show all
  let searchQuery = '';
  let pendingTagUrl = null; // which bookmark the tag modal is targeting
  let groupByDomain = true; // default: group enabled


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

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  async function loadAll() {
    const [bookmarksResp, tagsResp, settingsResp, groupResp] = await Promise.all([
      sendMessage('GET_ALL_BOOKMARKS'),
      sendMessage('GET_ALL_TAGS'),
      sendMessage('GET_SETTINGS'),
      new Promise(resolve => {
        chrome.storage.local.get('groupByDomain', (r) => resolve(r));
      }),
    ]);

    allBookmarks = bookmarksResp || [];
    allTags = tagsResp || [];
    if (settingsResp) settings = settingsResp;

    // groupByDomain defaults to true if never saved
    groupByDomain = groupResp.groupByDomain !== false;
    const checkbox = document.getElementById('group-by-domain-checkbox');
    if (checkbox) checkbox.checked = groupByDomain;

    renderTagsBar();
    renderColorGrid();
    renderList();
    updateStats();
  }


  // ─── Filtering / Searching ────────────────────────────────────────────────────

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

    return list;
  }

  // ─── Render Tags Bar ──────────────────────────────────────────────────────────

  function renderTagsBar() {
    const bar = document.getElementById('tags-bar');
    // Remove all non-"全部" chips
    bar.querySelectorAll('.tag-chip:not(#tag-all)').forEach(el => el.remove());

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
        if (confirm(`确定要彻底删除标签 "${tag}" 吗？此操作将从所有已收藏的内容中移除该标签。`)) {
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
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBookmark(bm.url, card);
    });
    header.appendChild(deleteBtn);

    card.appendChild(header);

    // ── Tags row ──
    const tagsRow = document.createElement('div');
    tagsRow.className = 'card-tags';

    (bm.tags || []).forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'card-tag';
      tagEl.textContent = tag;
      tagEl.addEventListener('click', () => {
        activeTagFilters.add(tag);
        renderTagsBar();
        renderList();
        updateStats();
      });
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
        const activeTab = tabs?.[0];
        if (!activeTab) return;
        if (activeTab.url === pageUrl) {
          // Already on this page — scroll to highlight
          chrome.tabs.sendMessage(activeTab.id, { type: 'SCROLL_TO_HIGHLIGHT', highlightId: h.id }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[MarkBuddy Panel] Could not send scroll message:', chrome.runtime.lastError.message);
            }
          });
        } else {
          chrome.tabs.update(activeTab.id, { url: pageUrl });
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
    panel.classList.toggle('hidden');
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
    renderList();
    updateStats();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.add('hidden');
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
    if (area === 'local' && (changes.bookmarks || changes.highlights || changes.tags)) {
      loadAll();
    }
  });

  // Group-by-domain switch
  document.getElementById('group-by-domain-checkbox').addEventListener('change', async (e) => {
    groupByDomain = e.target.checked;
    await new Promise(resolve => {
      chrome.storage.local.set({ groupByDomain }, resolve);
    });
    renderList();
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  loadAll();
})();
