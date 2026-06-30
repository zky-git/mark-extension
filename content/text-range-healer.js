(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyTextRangeHealer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function normalizeSearchText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function buildNormalizedIndex(rawText) {
    const raw = String(rawText || '');
    let normalized = '';
    const map = [];
    let inWhitespace = false;

    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      if (/\s/.test(char)) {
        if (!inWhitespace && normalized.length > 0) {
          normalized += ' ';
          map.push(i);
          inWhitespace = true;
        }
      } else {
        normalized += char;
        map.push(i);
        inWhitespace = false;
      }
    }

    if (normalized.endsWith(' ')) {
      normalized = normalized.slice(0, -1);
      map.pop();
    }

    return { normalized, map };
  }

  function findRecoveredOffsets(containerText, serialized) {
    const needle = normalizeSearchText(serialized?.text);
    if (!needle) return null;

    const { normalized, map } = buildNormalizedIndex(containerText);
    const matches = [];
    let searchFrom = 0;

    while (searchFrom <= normalized.length) {
      const index = normalized.indexOf(needle, searchFrom);
      if (index === -1) break;
      const startOffset = map[index];
      const endMapIndex = index + needle.length - 1;
      const endOffset = (map[endMapIndex] ?? startOffset) + 1;
      matches.push({ startOffset, endOffset, confidence: 1 });
      searchFrom = index + Math.max(needle.length, 1);
    }

    if (matches.length === 0) return null;
    const expected = typeof serialized.startOffset === 'number' ? serialized.startOffset : 0;
    matches.sort((a, b) => Math.abs(a.startOffset - expected) - Math.abs(b.startOffset - expected));
    return matches[0];
  }

  return {
    normalizeSearchText,
    findRecoveredOffsets,
  };
});
