(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./github-provider.js')
    );
  } else {
    root.MarkBuddyGitSyncEngine = factory(root.MarkBuddyGitHubProvider);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (githubProvider) {
  const GIT_SYNC_CONFIG_KEY = 'gitSyncConfig';
  const GIT_SYNC_STATE_KEY = 'gitSyncState';
  const SYNC_META = { schemaVersion: 1, source: 'git-sync' };

  function cloneValue(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeGitConfig(config = {}) {
    if (!githubProvider?.normalizeGitHubConfig) {
      throw new Error('GitHub 同步模块未加载。');
    }
    return githubProvider.normalizeGitHubConfig(config);
  }

  function validateGitConfig(config = {}) {
    if (!githubProvider?.validateGitHubConfig) {
      throw new Error('GitHub 同步模块未加载。');
    }
    return githubProvider.validateGitHubConfig(config);
  }

  function createSyncPayload(storageSnapshot, options = {}) {
    if (!options.backup?.createBackupPayload) {
      throw new Error('备份模块未加载。');
    }
    return options.backup.createBackupPayload(storageSnapshot, {
      exportedAt: options.exportedAt || options.now,
      sync: SYNC_META,
    });
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function buildSyncMessage(payload) {
    const bookmarkCount = Object.keys(payload.data?.bookmarks || {}).length;
    const highlightCount = Object.keys(payload.data?.highlights || {}).length;
    return `chore(markbuddy): sync ${bookmarkCount} bookmarks and ${highlightCount} highlights`;
  }

  function createStateUpdate(direction, remoteSha, commitSha, now) {
    return {
      lastRemoteSha: remoteSha || null,
      lastCommitSha: commitSha || null,
      lastSyncAt: now || Date.now(),
      lastSyncDirection: direction,
    };
  }

  function stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function getComparablePayload(payload = {}) {
    return {
      app: payload.app,
      version: payload.version,
      sync: payload.sync || null,
      data: payload.data || {},
    };
  }

  function hasSameSyncContent(remoteContent, nextPayload, backup) {
    if (!remoteContent || !backup?.parseBackupPayload) return false;
    try {
      const remotePayload = backup.parseBackupPayload(remoteContent);
      return stableStringify(getComparablePayload(remotePayload)) === stableStringify(getComparablePayload(nextPayload));
    } catch {
      return false;
    }
  }

  function getItemTimestamp(item) {
    if (!item || typeof item !== 'object') return 0;
    return Number(item.updatedAt || item.savedAt || 0) || 0;
  }

  function getTombstoneTimestamp(tombstone) {
    if (typeof tombstone === 'number') return tombstone;
    if (!tombstone || typeof tombstone !== 'object') return 0;
    return Number(tombstone.deletedAt || 0) || 0;
  }

  function normalizeTombstones(data = {}) {
    const deletedItems = isPlainObject(data.deletedItems) ? data.deletedItems : {};
    return {
      bookmarks: isPlainObject(deletedItems.bookmarks) ? deletedItems.bookmarks : {},
      highlights: isPlainObject(deletedItems.highlights) ? deletedItems.highlights : {},
    };
  }

  function createTombstone(id, existing) {
    if (isPlainObject(existing)) return cloneValue({ id, ...existing });
    return { id, deletedAt: getTombstoneTimestamp(existing) };
  }

  function chooseLatestItem(localItem, remoteItem) {
    if (!localItem) return cloneValue(remoteItem);
    if (!remoteItem) return cloneValue(localItem);
    return getItemTimestamp(remoteItem) > getItemTimestamp(localItem)
      ? cloneValue(remoteItem)
      : cloneValue(localItem);
  }

  function mergeItemMap(localItems = {}, remoteItems = {}, localTombstones = {}, remoteTombstones = {}) {
    const items = {};
    const tombstones = {};
    const ids = new Set([
      ...Object.keys(localItems || {}),
      ...Object.keys(remoteItems || {}),
      ...Object.keys(localTombstones || {}),
      ...Object.keys(remoteTombstones || {}),
    ]);

    ids.forEach(id => {
      const item = chooseLatestItem(localItems[id], remoteItems[id]);
      const itemTime = getItemTimestamp(item);
      const localDeletedAt = getTombstoneTimestamp(localTombstones[id]);
      const remoteDeletedAt = getTombstoneTimestamp(remoteTombstones[id]);
      const deletedAt = Math.max(localDeletedAt, remoteDeletedAt);

      if (deletedAt && deletedAt >= itemTime) {
        tombstones[id] = createTombstone(id, remoteDeletedAt >= localDeletedAt ? remoteTombstones[id] : localTombstones[id]);
        tombstones[id].deletedAt = deletedAt;
      } else if (item) {
        items[id] = item;
      }
    });

    return { items, tombstones };
  }

  function mergeTags(localTags = [], remoteTags = []) {
    return Array.from(new Set([
      ...(Array.isArray(localTags) ? localTags : []),
      ...(Array.isArray(remoteTags) ? remoteTags : []),
    ])).sort();
  }

  function mergeSyncData(localData = {}, remoteData = {}) {
    const localTombstones = normalizeTombstones(localData);
    const remoteTombstones = normalizeTombstones(remoteData);
    const bookmarks = mergeItemMap(
      localData.bookmarks || {},
      remoteData.bookmarks || {},
      localTombstones.bookmarks,
      remoteTombstones.bookmarks
    );
    const highlights = mergeItemMap(
      localData.highlights || {},
      remoteData.highlights || {},
      localTombstones.highlights,
      remoteTombstones.highlights
    );

    return {
      bookmarks: bookmarks.items,
      highlights: highlights.items,
      tags: mergeTags(localData.tags, remoteData.tags),
      settings: cloneValue(localData.settings || {}),
      groupByDomain: typeof localData.groupByDomain === 'boolean' ? localData.groupByDomain : true,
      sortBy: typeof localData.sortBy === 'string' ? localData.sortBy : 'time-desc',
      deletedItems: {
        bookmarks: bookmarks.tombstones,
        highlights: highlights.tombstones,
      },
    };
  }

  function createPayloadFromData(data, options = {}) {
    return createSyncPayload(data, options);
  }

  async function pushGitSync(options = {}) {
    const config = validateGitConfig(options.config);
    const state = options.state || {};
    const provider = options.provider;
    if (!provider?.readFile || !provider?.writeFile) {
      throw new Error('GitHub provider 未加载。');
    }

    const remote = await provider.readFile(config);
    const localPayload = createSyncPayload(options.storageSnapshot, {
      backup: options.backup,
      exportedAt: options.now,
    });
    let payload = localPayload;
    let merged = false;

    if (remote.exists && options.force !== true) {
      let remotePayload;
      try {
        remotePayload = options.backup.parseBackupPayload(remote.content);
      } catch (err) {
        return {
          success: false,
          error: err.message || '远端同步文件格式无效。',
          remoteSha: remote.sha,
        };
      }
      const mergedData = mergeSyncData(localPayload.data, remotePayload.data);
      payload = createPayloadFromData(mergedData, {
        backup: options.backup,
        exportedAt: options.now,
      });
      merged = stableStringify(mergedData) !== stableStringify(localPayload.data);
    }

    const hasSameContent = remote.exists && hasSameSyncContent(remote.content, payload, options.backup);
    if (hasSameContent) {
      return {
        success: true,
        noChange: true,
        merged,
        payload,
        data: cloneValue(payload.data),
        state: createStateUpdate('push', remote.sha, state.lastCommitSha, options.now),
        commitSha: null,
        remoteSha: remote.sha,
      };
    }

    const writeResult = await provider.writeFile(config, {
      content: `${JSON.stringify(payload, null, 2)}\n`,
      message: buildSyncMessage(payload),
      sha: remote.exists ? remote.sha : undefined,
    });

    return {
      success: true,
      merged,
      payload,
      data: cloneValue(payload.data),
      state: createStateUpdate('push', writeResult.sha, writeResult.commitSha, options.now),
      commitSha: writeResult.commitSha,
      remoteSha: writeResult.sha,
    };
  }

  async function pullGitSync(options = {}) {
    const config = validateGitConfig(options.config);
    const provider = options.provider;
    if (!provider?.readFile) {
      throw new Error('GitHub provider 未加载。');
    }
    if (!options.backup?.parseBackupPayload) {
      throw new Error('备份模块未加载。');
    }

    const remote = await provider.readFile(config);
    if (!remote.exists) {
      return {
        success: false,
        error: '远端同步文件不存在，请先上传本机数据。',
      };
    }

    const payload = options.backup.parseBackupPayload(remote.content);
    return {
      success: true,
      payload,
      data: cloneValue(payload.data),
      state: createStateUpdate('pull', remote.sha, null, options.now),
      remoteSha: remote.sha,
    };
  }

  return {
    GIT_SYNC_CONFIG_KEY,
    GIT_SYNC_STATE_KEY,
    SYNC_META,
    createSyncPayload,
    mergeSyncData,
    pullGitSync,
    pushGitSync,
    sanitizeGitConfig,
    validateGitConfig,
  };
});
