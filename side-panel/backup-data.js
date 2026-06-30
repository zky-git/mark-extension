(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyBackup = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const BACKUP_KEYS = ['bookmarks', 'highlights', 'tags', 'settings', 'groupByDomain', 'sortBy'];
  const DEFAULT_DATA = {
    bookmarks: {},
    highlights: {},
    tags: [],
    settings: {},
    groupByDomain: true,
    sortBy: 'time-desc',
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

  function createBackupPayload(storageSnapshot, options = {}) {
    const data = {};
    BACKUP_KEYS.forEach(key => {
      const value = storageSnapshot ? storageSnapshot[key] : undefined;
      data[key] = cloneValue(value === undefined ? DEFAULT_DATA[key] : value);
    });

    return {
      app: 'MarkBuddy',
      version: 1,
      exportedAt: new Date(options.exportedAt || Date.now()).toISOString(),
      data,
    };
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

    const cleanData = {};
    BACKUP_KEYS.forEach(key => {
      cleanData[key] = cloneValue(data[key] === undefined ? DEFAULT_DATA[key] : data[key]);
    });

    return {
      app: payload.app,
      version: payload.version,
      exportedAt: payload.exportedAt,
      data: cleanData,
    };
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
