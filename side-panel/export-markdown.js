(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyExport = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toISOString().slice(0, 10);
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown-source';
    }
  }

  function sanitizeFilenamePart(value) {
    return String(value || 'markbuddy-export')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'markbuddy-export';
  }

  function quoteMarkdown(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => `> ${line}`)
      .join('\n');
  }

  function inlineText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function headingText(value, fallback) {
    const text = inlineText(value || fallback);
    return text.replace(/^([#>-])/, '\\$1');
  }

  function formatTags(tags) {
    return (Array.isArray(tags) ? tags : [])
      .map(inlineText)
      .filter(Boolean)
      .join(', ');
  }

  function pushNote(lines, note) {
    const text = String(note || '').trim();
    if (!text) return;
    if (text.includes('\n') || text.includes('\r')) {
      lines.push('Note:', '', quoteMarkdown(text), '');
    } else {
      lines.push(`Note: ${inlineText(text)}`, '');
    }
  }

  function formatBookmarksAsMarkdown(bookmarks, options = {}) {
    const list = Array.isArray(bookmarks) ? bookmarks.filter(Boolean) : [];
    if (list.length === 0) return '';

    const title = headingText(options.title, 'MarkBuddy Export');
    const exportedAt = formatDate(options.exportedAt || Date.now());
    const lines = [`# ${title}`, '', `Exported: ${exportedAt}`, ''];
    const groups = new Map();

    list.forEach(bookmark => {
      const domain = getDomain(bookmark.url);
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(bookmark);
    });

    groups.forEach((items, domain) => {
      lines.push(`## ${domain}`, '');
      items.forEach(bookmark => {
        lines.push(`### ${headingText(bookmark.title || bookmark.url, 'Untitled Page')}`, '');
        if (bookmark.url) lines.push(`- URL: ${bookmark.url}`);
        if (bookmark.savedAt) lines.push(`- Saved: ${formatDate(bookmark.savedAt)}`);
        const tags = formatTags(bookmark.tags);
        if (tags) lines.push(`- Tags: ${tags}`);
        lines.push('', '#### Highlights', '');

        const highlights = Array.isArray(bookmark.highlights) ? bookmark.highlights : [];
        if (highlights.length === 0) {
          lines.push('_No highlights saved for this page._', '');
        } else {
          highlights.forEach((highlight, index) => {
            lines.push(`##### ${index + 1}. Highlight`, '');
            lines.push(quoteMarkdown(highlight.text || ''));
            lines.push('');
            pushNote(lines, highlight.note);
            if (bookmark.url) lines.push(`Source: ${bookmark.url}`, '');
          });
        }
      });
    });

    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }

  function buildExportFilename(label, exportedAt = Date.now()) {
    return `${sanitizeFilenamePart(label)}-${formatDate(exportedAt)}.md`;
  }

  return {
    formatBookmarksAsMarkdown,
    buildExportFilename,
  };
});
