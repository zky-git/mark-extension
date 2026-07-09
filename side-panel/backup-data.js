(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyBackup = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const BACKUP_KEYS = ['bookmarks', 'highlights', 'tags', 'settings', 'groupByDomain', 'sortBy', 'deletedItems'];
  const DEFAULT_DATA = {
    bookmarks: {},
    highlights: {},
    tags: [],
    settings: {},
    groupByDomain: true,
    sortBy: 'time-desc',
    deletedItems: { bookmarks: {}, highlights: {} },
  };

  function formatDate(value) {
    return new Date(value || Date.now()).toISOString().slice(0, 10);
  }

  function cloneValue(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeDeletedItems(value) {
    const deletedItems = isPlainObject(value) ? value : {};
    return {
      bookmarks: cloneValue(isPlainObject(deletedItems.bookmarks) ? deletedItems.bookmarks : {}),
      highlights: cloneValue(isPlainObject(deletedItems.highlights) ? deletedItems.highlights : {}),
    };
  }

  function createBackupPayload(storageSnapshot, options = {}) {
    const data = {};
    BACKUP_KEYS.forEach(key => {
      const value = storageSnapshot ? storageSnapshot[key] : undefined;
      data[key] = key === 'deletedItems'
        ? normalizeDeletedItems(value)
        : cloneValue(value === undefined ? DEFAULT_DATA[key] : value);
    });

    const payload = {
      app: 'MarkBuddy',
      version: 1,
      exportedAt: new Date(options.exportedAt || Date.now()).toISOString(),
      data,
    };

    if (isPlainObject(options.sync)) {
      payload.sync = cloneValue(options.sync);
    }

    return payload;
  }

  function parseBackupPayload(text) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('不是有效的 JSON 文件。');
    }

    if (!payload || payload.app !== 'MarkBuddy' || payload.version !== 1 || !isPlainObject(payload.data)) {
      throw new Error('不是 MarkBuddy 备份文件。');
    }

    const { data } = payload;
    if (data.bookmarks !== undefined && !isPlainObject(data.bookmarks)) {
      throw new Error('bookmarks 格式无效。');
    }
    if (data.highlights !== undefined && !isPlainObject(data.highlights)) {
      throw new Error('highlights 格式无效。');
    }
    if (data.tags !== undefined && !Array.isArray(data.tags)) {
      throw new Error('tags 格式无效。');
    }
    if (data.settings !== undefined && !isPlainObject(data.settings)) {
      throw new Error('settings 格式无效。');
    }
    if (data.groupByDomain !== undefined && typeof data.groupByDomain !== 'boolean') {
      throw new Error('groupByDomain 格式无效。');
    }
    if (data.sortBy !== undefined && typeof data.sortBy !== 'string') {
      throw new Error('sortBy 格式无效。');
    }
    if (data.deletedItems !== undefined && !isPlainObject(data.deletedItems)) {
      throw new Error('deletedItems 格式无效。');
    }
    if (data.deletedItems?.bookmarks !== undefined && !isPlainObject(data.deletedItems.bookmarks)) {
      throw new Error('deletedItems 格式无效。');
    }
    if (data.deletedItems?.highlights !== undefined && !isPlainObject(data.deletedItems.highlights)) {
      throw new Error('deletedItems 格式无效。');
    }

    const cleanData = {};
    BACKUP_KEYS.forEach(key => {
      cleanData[key] = key === 'deletedItems'
        ? normalizeDeletedItems(data[key])
        : cloneValue(data[key] === undefined ? DEFAULT_DATA[key] : data[key]);
    });

    const parsed = {
      app: payload.app,
      version: payload.version,
      exportedAt: payload.exportedAt,
      data: cleanData,
    };

    if (isPlainObject(payload.sync)) {
      parsed.sync = cloneValue(payload.sync);
    }

    return parsed;
  }

  function buildBackupFilename(exportedAt = Date.now()) {
    return `markbuddy-backup-${formatDate(exportedAt)}.json`;
  }

  return {
    BACKUP_KEYS,
    createBackupPayload,
    parseBackupPayload,
    buildBackupFilename,
  };
});
