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

  async function pushGitSync(options = {}) {
    const config = validateGitConfig(options.config);
    const state = options.state || {};
    const provider = options.provider;
    if (!provider?.readFile || !provider?.writeFile) {
      throw new Error('GitHub provider 未加载。');
    }

    const remote = await provider.readFile(config);
    if (
      remote.exists &&
      state.lastRemoteSha &&
      remote.sha !== state.lastRemoteSha &&
      options.force !== true
    ) {
      return {
        success: false,
        conflict: true,
        error: '远端数据已变化，请选择覆盖方向。',
        remoteSha: remote.sha,
      };
    }

    const payload = createSyncPayload(options.storageSnapshot, {
      backup: options.backup,
      exportedAt: options.now,
    });
    if (remote.exists && hasSameSyncContent(remote.content, payload, options.backup)) {
      return {
        success: true,
        noChange: true,
        payload,
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
      payload,
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
    pullGitSync,
    pushGitSync,
    sanitizeGitConfig,
    validateGitConfig,
  };
});
