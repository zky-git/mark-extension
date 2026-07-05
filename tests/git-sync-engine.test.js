const assert = require('node:assert/strict');
const backup = require('../side-panel/backup-data.js');
const {
  GIT_SYNC_CONFIG_KEY,
  GIT_SYNC_STATE_KEY,
  createSyncPayload,
  pullGitSync,
  pushGitSync,
  sanitizeGitConfig,
  validateGitConfig,
} = require('../shared/git-sync-engine.js');

const exportedAt = Date.UTC(2026, 6, 4);
const storageSnapshot = {
  bookmarks: { 'https://example.com': { url: 'https://example.com', savedAt: exportedAt } },
  highlights: { h1: { id: 'h1', url: 'https://example.com', text: '同步内容', savedAt: exportedAt } },
  tags: ['sync'],
  settings: { themeMode: 'dark' },
  groupByDomain: false,
  sortBy: 'updated-desc',
  [GIT_SYNC_CONFIG_KEY]: { token: 'secret' },
  [GIT_SYNC_STATE_KEY]: { lastRemoteSha: 'old' },
};

(async () => {
  assert.equal(GIT_SYNC_CONFIG_KEY, 'gitSyncConfig');
  assert.equal(GIT_SYNC_STATE_KEY, 'gitSyncState');

  const config = sanitizeGitConfig({
    token: '  secret  ',
    owner: ' zky ',
    repo: ' markbuddy-data ',
    branch: '',
    path: '',
  });
  assert.deepEqual(config, {
    provider: 'github',
    token: 'secret',
    owner: 'zky',
    repo: 'markbuddy-data',
    branch: 'main',
    path: 'markbuddy/data.json',
  });
  assert.deepEqual(validateGitConfig(config), config);

  const payload = createSyncPayload(storageSnapshot, { backup, exportedAt });
  assert.deepEqual(Object.keys(payload.data), backup.BACKUP_KEYS);
  assert.equal(payload.data.gitSyncConfig, undefined);
  assert.equal(payload.data.gitSyncState, undefined);
  assert.deepEqual(payload.sync, { schemaVersion: 1, source: 'git-sync' });

  const writes = [];
  const createProvider = {
    async readFile() {
      return { exists: false, sha: null, content: '' };
    },
    async writeFile(configArg, write) {
      writes.push({ configArg, write });
      return { sha: 'remote-sha-1', commitSha: 'commit-sha-1' };
    },
  };
  const pushCreate = await pushGitSync({
    config,
    state: {},
    storageSnapshot,
    backup,
    provider: createProvider,
    now: exportedAt,
  });
  assert.equal(pushCreate.success, true);
  assert.equal(pushCreate.state.lastRemoteSha, 'remote-sha-1');
  assert.equal(pushCreate.state.lastCommitSha, 'commit-sha-1');
  assert.equal(pushCreate.state.lastSyncDirection, 'push');
  assert.equal(writes[0].write.sha, undefined);
  assert.match(writes[0].write.message, /chore\(markbuddy\): sync/);

  const updateProvider = {
    async readFile() {
      return { exists: true, sha: 'remote-sha-1', content: '{}' };
    },
    async writeFile(configArg, write) {
      assert.equal(write.sha, 'remote-sha-1');
      return { sha: 'remote-sha-2', commitSha: 'commit-sha-2' };
    },
  };
  const pushUpdate = await pushGitSync({
    config,
    state: { lastRemoteSha: 'remote-sha-1' },
    storageSnapshot,
    backup,
    provider: updateProvider,
    now: exportedAt,
  });
  assert.equal(pushUpdate.state.lastRemoteSha, 'remote-sha-2');

  const sameRemotePayload = backup.createBackupPayload(storageSnapshot, {
    exportedAt: exportedAt - 1000,
    sync: { schemaVersion: 1, source: 'git-sync' },
  });
  const pushNoChange = await pushGitSync({
    config,
    state: { lastRemoteSha: 'remote-sha-1', lastCommitSha: 'commit-sha-1' },
    storageSnapshot,
    backup,
    provider: {
      async readFile() {
        return { exists: true, sha: 'remote-sha-1', content: JSON.stringify(sameRemotePayload) };
      },
      async writeFile() {
        throw new Error('should not write when sync payload data has not changed');
      },
    },
    now: exportedAt,
  });
  assert.equal(pushNoChange.success, true);
  assert.equal(pushNoChange.noChange, true);
  assert.equal(pushNoChange.commitSha, null);
  assert.equal(pushNoChange.state.lastRemoteSha, 'remote-sha-1');
  assert.equal(pushNoChange.state.lastCommitSha, 'commit-sha-1');

  const pushNoChangeWithNewRemoteSha = await pushGitSync({
    config,
    state: { lastRemoteSha: 'stale-remote-sha', lastCommitSha: 'commit-sha-1' },
    storageSnapshot,
    backup,
    provider: {
      async readFile() {
        return { exists: true, sha: 'remote-sha-same-content', content: JSON.stringify(sameRemotePayload) };
      },
      async writeFile() {
        throw new Error('should not write or conflict when the meaningful sync payload is unchanged');
      },
    },
    now: exportedAt,
  });
  assert.equal(pushNoChangeWithNewRemoteSha.success, true);
  assert.equal(pushNoChangeWithNewRemoteSha.noChange, true);
  assert.equal(pushNoChangeWithNewRemoteSha.conflict, undefined);
  assert.equal(pushNoChangeWithNewRemoteSha.state.lastRemoteSha, 'remote-sha-same-content');
  assert.equal(pushNoChangeWithNewRemoteSha.state.lastCommitSha, 'commit-sha-1');

  const conflict = await pushGitSync({
    config,
    state: { lastRemoteSha: 'remote-sha-1' },
    storageSnapshot,
    backup,
    provider: {
      async readFile() {
        return { exists: true, sha: 'remote-sha-new', content: '{}' };
      },
      async writeFile() {
        throw new Error('should not write during conflict');
      },
    },
    now: exportedAt,
  });
  assert.equal(conflict.success, false);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.remoteSha, 'remote-sha-new');

  const forcePush = await pushGitSync({
    config,
    state: { lastRemoteSha: 'remote-sha-1' },
    storageSnapshot,
    backup,
    provider: {
      async readFile() {
        return { exists: true, sha: 'remote-sha-new', content: '{}' };
      },
      async writeFile(configArg, write) {
        assert.equal(write.sha, 'remote-sha-new');
        return { sha: 'remote-sha-force', commitSha: 'commit-sha-force' };
      },
    },
    force: true,
    now: exportedAt,
  });
  assert.equal(forcePush.state.lastRemoteSha, 'remote-sha-force');

  const remotePayload = backup.createBackupPayload(storageSnapshot, {
    exportedAt,
    sync: { schemaVersion: 1, source: 'git-sync' },
  });
  const pull = await pullGitSync({
    config,
    backup,
    provider: {
      async readFile() {
        return { exists: true, sha: 'remote-sha-pull', content: JSON.stringify(remotePayload) };
      },
    },
    now: exportedAt,
  });
  assert.equal(pull.success, true);
  assert.deepEqual(pull.data, remotePayload.data);
  assert.equal(pull.state.lastRemoteSha, 'remote-sha-pull');
  assert.equal(pull.state.lastSyncDirection, 'pull');
  assert.equal(pull.state.lastSyncAt, exportedAt);

  console.log('git-sync-engine tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
