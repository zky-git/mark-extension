// MarkBuddy — Content Script
// Handles: floating toolbar, saving highlights, restoring highlights on load

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__markbuddy_initialized) return;
  window.__markbuddy_initialized = true;

  // ─── State ───────────────────────────────────────────────────────────────────

  let currentSelection = null;
  let currentRange = null;
  let toolbar = null;
  let settings = { defaultColor: '#FFD700', presetColors: ['#FFD700', '#90EE90', '#87CEEB', '#FFB6C1', '#DDA0DD'] };
  let selectedColor = null; // null = use default
  let pageHighlights = []; // Local store of highlights on the current page
  let activePopover = null; // Store reference to open popover
  let activePopoverMark = null; // Mark element associated with open popover

  // ─── Messaging ────────────────────────────────────────────────────────────────

  function handleContextInvalidated() {
    try {
      const trigger = document.getElementById('markbuddy-sidebar-trigger');
      if (trigger) trigger.remove();
      const toolbar = document.getElementById('markbuddy-toolbar');
      if (toolbar) toolbar.remove();
      const tooltip = document.getElementById('markbuddy-tooltip');
      if (tooltip) tooltip.remove();
      const popover = document.getElementById('markbuddy-note-popover');
      if (popover) popover.remove();
      const toast = document.getElementById('markbuddy-toast');
      if (toast) toast.remove();
    } catch (e) {
      // ignore
    }
  }

  function sendMessage(type, payload) {
    return new Promise((resolve) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          handleContextInvalidated();
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage({ type, payload }, (resp) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message;
            console.warn('[MarkBuddy]', msg);
            if (msg && msg.includes('context invalidated')) {
              handleContextInvalidated();
            }
            resolve(null);
          } else {
            resolve(resp);
          }
        });
      } catch (err) {
        console.warn('[MarkBuddy] Extension context invalidated:', err);
        handleContextInvalidated();
        resolve(null);
      }
    });
  }

  // ─── XPath Serialization ──────────────────────────────────────────────────────

  function getClosestStableAncestor(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && (el.classList.contains('markbuddy-highlight') || el.closest('.markbuddy-highlight'))) {
      el = el.parentElement;
    }
    return el || document.body;
  }

  function getXPathForElement(el) {
    if (!el || el === document.body) return '/html/body';
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement?.children || []).filter(c => c.tagName === current.tagName);
      const idx = siblings.length > 1 ? siblings.indexOf(current) + 1 : null;
      parts.unshift(idx ? `${tag}[${idx}]` : tag);
      current = current.parentElement;
    }
    return '/html/body/' + parts.join('/');
  }

  function isDeleteBtnNode(node) {
    return node.parentElement?.classList?.contains('markbuddy-delete-btn') || 
           node.parentElement?.closest('.markbuddy-delete-btn');
  }

  function getTextOffset(ancestor, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (isDeleteBtnNode(node)) continue;
      if (node === targetNode) {
        offset += targetOffset;
        return offset;
      }
      offset += node.textContent.length;
    }
    return offset;
  }

  function getNodeAtTextOffset(ancestor, targetOffset) {
    let currentOffset = 0;
    const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, null);
    let lastTextNode = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (isDeleteBtnNode(node)) continue;
      const len = node.textContent.length;
      if (currentOffset + len >= targetOffset) {
        return { node, offset: targetOffset - currentOffset };
      }
      currentOffset += len;
      lastTextNode = node;
    }
    if (lastTextNode) {
      return { node: lastTextNode, offset: lastTextNode.textContent.length };
    }
    return null;
  }

  function getAncestorText(ancestor) {
    let text = '';
    const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (isDeleteBtnNode(node)) continue;
      text += node.textContent;
    }
    return text;
  }

  function getRangeText(range) {
    return range ? range.toString().replace(/\s+/g, ' ').trim() : '';
  }

  function buildRangeFromOffsets(ancestor, startOffset, endOffset) {
    const start = getNodeAtTextOffset(ancestor, startOffset);
    const end = getNodeAtTextOffset(ancestor, endOffset);
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  function serializeRange(range) {
    try {
      const ancestor = getClosestStableAncestor(range.startContainer);
      const parentXPath = getXPathForElement(ancestor);
      const startOffset = getTextOffset(ancestor, range.startContainer, range.startOffset);
      const endOffset = getTextOffset(ancestor, range.endContainer, range.endOffset);
      return {
        parentXPath,
        startOffset,
        endOffset,
        text: range.toString(),
      };
    } catch (e) {
      return null;
    }
  }

  function deserializeRange(serialized) {
    try {
      const ancestor = resolveXPath(serialized.parentXPath || serialized.startXPath);
      if (!ancestor) return null;

      // Backward compatibility fallback for old text()[N] XPaths
      if (serialized.startXPath && serialized.startXPath.includes('/text()')) {
        const startNode = resolveXPath(serialized.startXPath);
        const endNode = resolveXPath(serialized.endXPath);
        if (!startNode || !endNode) return null;
        const range = document.createRange();
        range.setStart(startNode, serialized.startOffset);
        range.setEnd(endNode, serialized.endOffset);
        return range;
      }

      const start = getNodeAtTextOffset(ancestor, serialized.startOffset);
      const end = getNodeAtTextOffset(ancestor, serialized.endOffset);
      if (!start || !end) return null;

      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range;
    } catch (e) {
      return null;
    }
  }

  function recoverSerializedRange(serialized) {
    const healer = window.MarkBuddyTextRangeHealer;
    if (!healer || !serialized?.parentXPath || !serialized?.text) return null;

    const ancestor = resolveXPath(serialized.parentXPath);
    if (!ancestor) return null;

    const recovered = healer.findRecoveredOffsets(getAncestorText(ancestor), serialized);
    if (!recovered) return null;

    const range = buildRangeFromOffsets(ancestor, recovered.startOffset, recovered.endOffset);
    if (!range || range.collapsed) return null;

    return {
      range,
      serializedRange: {
        ...serialized,
        startOffset: recovered.startOffset,
        endOffset: recovered.endOffset,
      },
    };
  }

  function resolveRestorableRange(serialized) {
    const range = deserializeRange(serialized);
    const expected = window.MarkBuddyTextRangeHealer?.normalizeSearchText(serialized?.text);
    if (range && !range.collapsed) {
      const actual = getRangeText(range);
      if (!expected || actual === expected) {
        return { range, healed: false, serializedRange: serialized };
      }
    }

    const recovered = recoverSerializedRange(serialized);
    if (recovered) return { ...recovered, healed: true };
    return null;
  }

  function resolveXPath(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  }

  // ─── Highlight DOM ────────────────────────────────────────────────────────────

  /**
   * Get all text nodes covered by a Range, with start/end offsets.
   */
  function getTextNodesInRange(range) {
    const results = [];
    const start = range.startContainer;
    const end = range.endContainer;

    // Simple case: both boundary points are in the same text node
    if (start === end && start.nodeType === Node.TEXT_NODE) {
      results.push({ node: start, start: range.startOffset, end: range.endOffset });
      return results;
    }

    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      null
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);

      // Skip nodes entirely before the range start
      if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) continue;
      // Stop when we pass the range end
      if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0) break;

      const s = (node === start) ? range.startOffset : 0;
      const e2 = (node === end) ? range.endOffset : node.textContent.length;
      if (s < e2) results.push({ node, start: s, end: e2 });
    }

    return results;
  }

  /**
   * Apply highlight by splitting text nodes and wrapping with <mark>.
   * Returns array of created mark elements (one per text node).
   */
  function applyHighlight(range, color, highlightId, hasNote) {
    if (!range || range.collapsed) return [];

    try {
      const textNodes = getTextNodesInRange(range);
      if (textNodes.length === 0) return [];

      const marks = [];

      textNodes.forEach(({ node, start, end }) => {
        // Trim the text node to only the selected portion
        let target = node;
        if (end < node.textContent.length) node.splitText(end);
        if (start > 0) target = node.splitText(start);

        const mark = document.createElement('mark');
        mark.className = 'markbuddy-highlight';
        if (hasNote) {
          mark.classList.add('markbuddy-highlight-has-note');
        }
        mark.dataset.id = highlightId;
        mark.style.cssText = `background-color: ${color} !important; padding: 1px 0; border-radius: 2px;`;

        target.parentNode.insertBefore(mark, target);
        mark.appendChild(target);
        marks.push(mark);

        setupHighlightListeners(mark);
      });

      // Add a single delete button to the first mark
      if (marks.length > 0) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'markbuddy-delete-btn';
        deleteBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: block; pointer-events: none;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
        deleteBtn.title = '删除划线';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeHighlight(highlightId, marks);
        });
        marks[0].appendChild(deleteBtn);
      }

      return marks;
    } catch (e) {
      console.warn('[MarkBuddy] Failed to apply highlight:', e);
      return [];
    }
  }

  async function removeHighlight(id, markEls) {
    const els = Array.isArray(markEls) ? markEls : [markEls];
    const parentsToNormalize = new Set();
    els.forEach(markEl => {
      if (!markEl || !markEl.parentNode) return;
      const parent = markEl.parentNode;
      parentsToNormalize.add(parent);
      while (markEl.firstChild) {
        if (markEl.firstChild.classList?.contains('markbuddy-delete-btn')) {
          markEl.removeChild(markEl.firstChild);
        } else {
          parent.insertBefore(markEl.firstChild, markEl);
        }
      }
      parent.removeChild(markEl);
    });
    parentsToNormalize.forEach(parent => parent.normalize());
    if (activePopoverMark && activePopoverMark.dataset.id === id) {
      hideNotePopover();
    }
    hideHoverTooltip();
    pageHighlights = pageHighlights.filter(h => h.id !== id);
    await sendMessage('DELETE_HIGHLIGHT', { id });
    showToast('🗑️ 划线已删除');
  }

  function clearDOMHighlights() {
    const marks = document.querySelectorAll('.markbuddy-highlight');
    const parentsToNormalize = new Set();
    marks.forEach(markEl => {
      if (!markEl || !markEl.parentNode) return;
      const parent = markEl.parentNode;
      parentsToNormalize.add(parent);
      while (markEl.firstChild) {
        if (markEl.firstChild.classList?.contains('markbuddy-delete-btn')) {
          markEl.removeChild(markEl.firstChild);
        } else {
          parent.insertBefore(markEl.firstChild, markEl);
        }
      }
      parent.removeChild(markEl);
    });
    parentsToNormalize.forEach(parent => {
      try {
        parent.normalize();
      } catch (e) {
        // ignore normalization errors
      }
    });
    pageHighlights = [];
    hideNotePopover();
    hideHoverTooltip();
  }

  // ─── Annotation Popover & Tooltip Helpers ────────────────────────────────────

  let tooltipEl = null;

  function setupHighlightListeners(mark) {
    mark.addEventListener('mouseenter', (e) => {
      showHoverTooltip(e, mark);
    });
    mark.addEventListener('mouseleave', () => {
      hideHoverTooltip();
    });
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      hideToolbar();
      showNotePopover(mark);
    });
  }

  function showHoverTooltip(e, markEl) {
    if (activePopoverMark && activePopoverMark.dataset.id === markEl.dataset.id) return;

    const id = markEl.dataset.id;
    const highlight = pageHighlights.find(h => h.id === id);
    if (!highlight || !highlight.note) return;

    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'markbuddy-tooltip';
      document.body.appendChild(tooltipEl);
    }

    tooltipEl.textContent = highlight.note;
    tooltipEl.classList.add('visible');

    positionTooltip(markEl);
  }

  function positionTooltip(markEl) {
    if (!tooltipEl) return;
    const rect = markEl.getBoundingClientRect();
    const top = rect.top - 8 + window.scrollY;
    const left = rect.left + rect.width / 2 + window.scrollX;

    tooltipEl.style.position = 'absolute';
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
  }

  function hideHoverTooltip() {
    if (tooltipEl) {
      tooltipEl.classList.remove('visible');
    }
  }

  function showNotePopover(markEl) {
    hideHoverTooltip();
    hideNotePopover();

    const id = markEl.dataset.id;
    const highlight = pageHighlights.find(h => h.id === id);
    if (!highlight) return;

    activePopoverMark = markEl;

    const popover = document.createElement('div');
    popover.id = 'markbuddy-note-popover';

    const header = document.createElement('div');
    header.className = 'markbuddy-popover-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'markbuddy-popover-title';
    titleSpan.textContent = '\u270f\ufe0f \u7f16\u8f91\u6279\u6ce8';

    const headerRight = document.createElement('div');
    headerRight.className = 'markbuddy-popover-header-right';

    // Trash icon delete button — only shown when note already exists
    const deleteNoteBtn = document.createElement('button');
    deleteNoteBtn.className = 'markbuddy-popover-del-icon';
    deleteNoteBtn.title = '\u5220\u9664\u6279\u6ce8';
    deleteNoteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    deleteNoteBtn.style.display = highlight.note ? '' : 'none';


    headerRight.appendChild(deleteNoteBtn);
    header.appendChild(titleSpan);
    header.appendChild(headerRight);

    const textarea = document.createElement('textarea');
    textarea.className = 'markbuddy-popover-textarea';
    textarea.placeholder = '\u8f93\u5165\u6279\u6ce8\u5185\u5bb9...';
    textarea.value = highlight.note || '';

    const footer = document.createElement('div');
    footer.className = 'markbuddy-popover-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'markbuddy-popover-btn sec';
    cancelBtn.textContent = '\u53d6\u6d88';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'markbuddy-popover-btn pri';
    saveBtn.textContent = '\u4fdd\u5b58';

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    popover.appendChild(header);
    popover.appendChild(textarea);
    popover.appendChild(footer);

    // Compute and apply position before appending to body to prevent rendering jump
    const rect = markEl.getBoundingClientRect();
    const POPOVER_W = 280;
    const MARGIN = 10;
    let left = rect.left + rect.width / 2 + window.scrollX - POPOVER_W / 2;
    let top = rect.bottom + MARGIN + window.scrollY;
    const maxLeft = window.innerWidth + window.scrollX - POPOVER_W - MARGIN;
    left = Math.max(MARGIN + window.scrollX, Math.min(left, maxLeft));

    popover.style.position = 'absolute';
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    document.body.appendChild(popover);
    activePopover = popover;

    cancelBtn.addEventListener('click', hideNotePopover);
    saveBtn.addEventListener('click', () => saveNote(id, textarea.value));
    deleteNoteBtn.addEventListener('click', () => saveNote(id, ''));

    setTimeout(() => textarea.focus(), 50);
  }

  function positionPopover(markEl) {
    if (!activePopover) return;
    const rect = markEl.getBoundingClientRect();
    const POPOVER_W = 280;
    const MARGIN = 10;

    let left = rect.left + rect.width / 2 + window.scrollX - POPOVER_W / 2;
    let top = rect.bottom + MARGIN + window.scrollY;

    const maxLeft = window.innerWidth + window.scrollX - POPOVER_W - MARGIN;
    left = Math.max(MARGIN + window.scrollX, Math.min(left, maxLeft));

    activePopover.style.position = 'absolute';
    activePopover.style.top = `${top}px`;
    activePopover.style.left = `${left}px`;
  }

  async function saveNote(id, noteText) {
    const trimmed = noteText.trim();
    const highlight = pageHighlights.find(h => h.id === id);
    if (highlight) {
      highlight.note = trimmed;
    }

    const result = await sendMessage('UPDATE_HIGHLIGHT_NOTE', { id, note: trimmed });
    if (result?.success) {
      showToast(trimmed ? '📝 批注已保存！' : '🗑️ 批注已清除');
      updateHighlightDOMNotes();
    } else {
      showToast('⚠️ 保存失败，请重试');
    }

    hideNotePopover();
  }

  function hideNotePopover() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
    activePopoverMark = null;
  }

  function updateHighlightDOMNotes() {
    const marks = document.querySelectorAll('.markbuddy-highlight');
    marks.forEach(mark => {
      const id = mark.dataset.id;
      const highlight = pageHighlights.find(h => h.id === id);
      if (highlight && highlight.note) {
        mark.classList.add('markbuddy-highlight-has-note');
      } else {
        mark.classList.remove('markbuddy-highlight-has-note');
      }
    });
  }

  // ─── Restore Highlights on Page Load ─────────────────────────────────────────

  async function restoreHighlights() {
    const highlights = await sendMessage('GET_HIGHLIGHTS_FOR_URL', { url: window.location.href });
    pageHighlights = highlights || [];
    if (!highlights || !highlights.length) return;

    const BATCH = 10;
    for (let i = 0; i < highlights.length; i += BATCH) {
      await new Promise(r => requestAnimationFrame(() => {
        highlights.slice(i, i + BATCH).forEach(h => {
          if (document.querySelector(`.markbuddy-highlight[data-id="${h.id}"]`)) return;
          try {
            const resolved = resolveRestorableRange(h.serializedRange);
            if (resolved?.range && !resolved.range.collapsed) {
              const marks = applyHighlight(resolved.range, h.color, h.id, !!h.note);
              // Re-attach delete listener with the real id
              if (marks.length > 0) {
                if (resolved.healed) {
                  h.serializedRange = resolved.serializedRange;
                  sendMessage('UPDATE_HIGHLIGHT_RANGE', { id: h.id, serializedRange: resolved.serializedRange });
                }
                const btn = marks[0].querySelector('.markbuddy-delete-btn');
                if (btn) {
                  btn.replaceWith(btn.cloneNode(true));
                  const newBtn = marks[0].querySelector('.markbuddy-delete-btn');
                  newBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeHighlight(h.id, marks);
                  });
                }
              }
            }
          } catch (e) {
            console.warn('[MarkBuddy] Could not restore highlight:', h.id, e);
          }
        });
        r();
      }));
      if (globalThis.scheduler?.yield) await scheduler.yield();
    }
  }

  // ─── Floating Toolbar ─────────────────────────────────────────────────────────

  function createToolbar() {
    if (toolbar) toolbar.remove();

    toolbar = document.createElement('div');
    toolbar.id = 'markbuddy-toolbar';

    // Bookmark page button
    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'markbuddy-toolbar-btn';
    bookmarkBtn.innerHTML = '🔖 收藏页面';
    bookmarkBtn.addEventListener('click', () => {
      hideToolbar();
      window.__markbuddy_savePage();
    });

    const divider = document.createElement('div');
    divider.className = 'markbuddy-divider';

    // Highlight button
    const highlightBtn = document.createElement('button');
    highlightBtn.className = 'markbuddy-toolbar-btn';
    highlightBtn.innerHTML = '🖊️ 高亮划线';
    highlightBtn.addEventListener('click', () => {
      const color = selectedColor || settings.defaultColor;
      doSaveHighlight(color);
      hideToolbar();
    });

    const divider2 = document.createElement('div');
    divider2.className = 'markbuddy-divider';

    // Color swatches
    const swatchContainer = document.createElement('div');
    swatchContainer.className = 'markbuddy-color-swatches';

    settings.presetColors.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'markbuddy-swatch';
      if (color === (selectedColor || settings.defaultColor)) swatch.classList.add('active');
      swatch.style.backgroundColor = color;
      swatch.title = color;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColor = color;
        swatchContainer.querySelectorAll('.markbuddy-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      });
      swatchContainer.appendChild(swatch);
    });

    toolbar.appendChild(bookmarkBtn);
    toolbar.appendChild(divider);
    toolbar.appendChild(highlightBtn);
    toolbar.appendChild(divider2);
    toolbar.appendChild(swatchContainer);

    document.body.appendChild(toolbar);
    return toolbar;
  }

  function positionToolbar(viewportRect) {
    if (!toolbar) return;
    const TOOLBAR_H = 46;
    const MARGIN = 10;

    // Viewport-relative coordinate math for position: fixed
    let top = viewportRect.top - TOOLBAR_H - MARGIN;
    let left = viewportRect.left + viewportRect.width / 2;

    // Flip below selection if not enough room above
    if (top < MARGIN) {
      top = viewportRect.bottom + MARGIN;
    }

    // Clamp horizontally within viewport
    const toolbarWidth = 260;
    const maxLeft = window.innerWidth - toolbarWidth / 2 - MARGIN;
    left = Math.max(toolbarWidth / 2 + MARGIN, Math.min(left, maxLeft));

    toolbar.style.position = 'fixed';
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
    toolbar.style.transform = 'translateX(-50%)';
  }

  function showToolbar(selection) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect(); // viewport-relative
    if (!rect.width && !rect.height) return;

    currentRange = range.cloneRange();
    createToolbar();
    // Pass viewport-relative rect directly — positionToolbar adds scroll offset
    positionToolbar(rect);
  }

  function hideToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  // ─── Save Actions ─────────────────────────────────────────────────────────────

  window.__markbuddy_savePage = async function () {
    const result = await sendMessage('SAVE_BOOKMARK', {
      url: window.location.href,
      title: document.title,
      favicon: getFavicon(),
      tags: [],
    });

    if (result?.success) {
      showToast('🔖 网页已收藏！');
    } else {
      showToast('⚠️ 收藏失败，请重试');
    }
  };

  window.__markbuddy_saveHighlight = async function () {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      showToast('⚠️ 请先选中文字');
      return;
    }
    const color = selectedColor || settings.defaultColor;
    doSaveHighlight(color);
  };

  async function doSaveHighlight(color) {
    const rangeSource = currentRange || window.getSelection()?.getRangeAt(0);
    if (!rangeSource) return;

    // Clone before DOM mutation
    const rangeToUse = rangeSource.cloneRange();
    const serialized = serializeRange(rangeToUse);
    if (!serialized || !serialized.text.trim()) {
      showToast('⚠️ 无法识别选中文字，请重试');
      return;
    }

    // Apply highlight visually (must clone again since serialize may move iterators)
    const highlightId = `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rangeForDom = rangeSource.cloneRange();
    const marks = applyHighlight(rangeForDom, color, highlightId, false);

    window.getSelection()?.removeAllRanges();
    currentRange = null;

    // Save to storage
    const result = await sendMessage('SAVE_HIGHLIGHT', {
      url: window.location.href,
      text: serialized.text,
      color,
      serializedRange: serialized,
      pageTitle: document.title,
      pageFavicon: getFavicon(),
    });

    if (result?.success) {
      const realId = result.highlight?.id;
      if (realId) {
        pageHighlights.push(result.highlight);
      }
      if (realId && marks.length > 0) {
        marks.forEach(m => { m.dataset.id = realId; });
        // Re-attach delete button with real id
        const btn = marks[0].querySelector('.markbuddy-delete-btn');
        if (btn) {
          btn.replaceWith(btn.cloneNode(true));
          const newBtn = marks[0].querySelector('.markbuddy-delete-btn');
          newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeHighlight(realId, marks);
          });
        }
      }
      showToast('✨ 划线已保存！');
    } else {
      showToast('⚠️ 保存失败，请重试');
    }
  }

  function getFavicon() {
    const link = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel="shortcut icon"]');
    if (link?.href) return link.href;
    return `${window.location.origin}/favicon.ico`;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────

  let toastTimeout = null;

  function showToast(message) {
    let toast = document.getElementById('markbuddy-toast');
    if (toast) toast.remove();

    toast = document.createElement('div');
    toast.id = 'markbuddy-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  // ─── Selection Listener ───────────────────────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    // Don't show toolbar or hide popover if clicked inside toolbar or popover itself
    if (e.target.closest('#markbuddy-toolbar') || e.target.closest('#markbuddy-note-popover')) return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
        showToolbar(selection);
      } else {
        if (!e.target.closest('.markbuddy-highlight')) {
          hideNotePopover();
        }
        if (!e.target.closest('#markbuddy-toolbar')) {
          hideToolbar();
          currentRange = null;
        }
      }
    }, 10);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideToolbar();
      currentRange = null;
      hideNotePopover();
    }
  });

  document.addEventListener('scroll', () => {
    if (toolbar && currentRange) {
      positionToolbar(currentRange.getBoundingClientRect());
    }
    if (activePopover && activePopoverMark) {
      positionPopover(activePopoverMark);
    }
    hideHoverTooltip();
  }, { capture: true, passive: true });

  // ─── Message and Storage Listeners ──────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCROLL_TO_HIGHLIGHT') {
      const mark = document.querySelector(`.markbuddy-highlight[data-id="${message.highlightId}"]`);
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalBg = mark.style.backgroundColor;
        mark.style.backgroundColor = '#ff4757';
        setTimeout(() => {
          mark.style.backgroundColor = originalBg;
        }, 1000);
      }
      sendResponse({ success: true });
    } else if (message.type === 'SPA_NAVIGATION') {
      clearDOMHighlights();
      restoreHighlights();
      setTimeout(restoreHighlights, 300);
      setTimeout(restoreHighlights, 800);
      setTimeout(restoreHighlights, 1500);
      sendResponse({ success: true });
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local') {
      if (changes.settings) {
        settings = changes.settings.newValue || settings;
        selectedColor = settings.defaultColor;
        if (toolbar) {
          createToolbar();
        }
      }
      if (changes.highlights) {
        const url = window.location.href;
        const highlights = await sendMessage('GET_HIGHLIGHTS_FOR_URL', { url });
        pageHighlights = highlights || [];
        updateHighlightDOMNotes();
      }
    }
  });

  // ─── Floating Sidebar Trigger ───────────────────────────────────────────────

  function makeElementDraggable(el) {
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;
    let isDragging = false;
    const dragThreshold = 5; // pixels

    el.addEventListener('mousedown', onMouseDown);

    function onMouseDown(e) {
      if (e.button !== 0) return; // Left click only

      startX = e.clientX;
      startY = e.clientY;

      const rect = el.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      isDragging = false;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      e.preventDefault(); // Prevent text selection
    }

    function onMouseMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!isDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
        isDragging = true;
        el.classList.add('markbuddy-dragging');
      }

      if (isDragging) {
        let newLeft = initialX + dx;
        let newTop = initialY + dy;

        // Clamp inside window client boundaries (excluding scrollbar)
        const rect = el.getBoundingClientRect();
        const clientWidth = document.documentElement.clientWidth;
        const clientHeight = document.documentElement.clientHeight;
        const maxLeft = clientWidth - rect.width;
        const maxTop = clientHeight - rect.height;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    }

    function onMouseUp(e) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (isDragging) {
        // Convert viewport-relative left/top to right/bottom based on client dimensions
        const rect = el.getBoundingClientRect();
        const clientWidth = document.documentElement.clientWidth;
        const clientHeight = document.documentElement.clientHeight;
        const rightVal = clientWidth - rect.right;
        const bottomVal = clientHeight - rect.bottom;

        // Apply new positioning styles while transitions are still disabled (.markbuddy-dragging is still active)
        el.style.right = `${rightVal}px`;
        el.style.bottom = `${bottomVal}px`;
        el.style.left = 'auto';
        el.style.top = 'auto';

        // Force browser layout reflow before restoring transitions
        el.offsetHeight;

        el.classList.remove('markbuddy-dragging');
        el.dataset.justDragged = 'true';
        setTimeout(() => {
          delete el.dataset.justDragged;
        }, 50);
      }
    }
  }

  function createSidebarTrigger() {
    if (document.getElementById('markbuddy-sidebar-trigger')) return;

    const trigger = document.createElement('div');
    trigger.id = 'markbuddy-sidebar-trigger';
    trigger.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; pointer-events: none;">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      <div id="markbuddy-sidebar-trigger-tooltip">打开/关闭 MarkBuddy 面板</div>
    `;
    trigger.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (trigger.dataset.justDragged === 'true') return;
      await sendMessage('TOGGLE_SIDE_PANEL', {});
    });

    document.body.appendChild(trigger);
    makeElementDraggable(trigger);

    // Keep trigger within viewport bounds during window resizing or side panel shrinking
    window.addEventListener('resize', () => {
      const rect = trigger.getBoundingClientRect();
      const clientWidth = document.documentElement.clientWidth;
      const clientHeight = document.documentElement.clientHeight;
      const maxRight = clientWidth - rect.width;
      const maxBottom = clientHeight - rect.height;

      let currentRight = parseFloat(trigger.style.right);
      let currentBottom = parseFloat(trigger.style.bottom);

      if (isNaN(currentRight)) currentRight = 24; // fallback to CSS default
      if (isNaN(currentBottom)) currentBottom = 96;

      if (currentRight > maxRight) trigger.style.right = `${maxRight}px`;
      if (currentRight < 0) trigger.style.right = '0px';
      if (currentBottom > maxBottom) trigger.style.bottom = `${maxBottom}px`;
      if (currentBottom < 0) trigger.style.bottom = '0px';
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    const result = await sendMessage('GET_SETTINGS', {});
    if (result) settings = result;
    selectedColor = settings.defaultColor;
    await restoreHighlights();
    createSidebarTrigger();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
