(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyReviewTags = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function normalizeReviewTag(value) {
    const tag = String(value || '').trim();
    return tag || '学习';
  }

  function uniqueTags(tags) {
    return [...new Set((Array.isArray(tags) ? tags : []).map(tag => String(tag).trim()).filter(Boolean))];
  }

  function hasReviewTag(tags, reviewTag) {
    return uniqueTags(tags).includes(normalizeReviewTag(reviewTag));
  }

  function toggleReviewTag(tags, reviewTag) {
    const normalized = normalizeReviewTag(reviewTag);
    const current = uniqueTags(tags);
    if (current.includes(normalized)) {
      return current.filter(tag => tag !== normalized);
    }
    return [...current, normalized];
  }

  return {
    normalizeReviewTag,
    toggleReviewTag,
    hasReviewTag,
  };
});
