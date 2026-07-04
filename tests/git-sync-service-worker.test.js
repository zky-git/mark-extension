const assert = require('node:assert/strict');
const fs = require('node:fs');

const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
const backupModule = fs.readFileSync('side-panel/backup-data.js', 'utf8');

[
  'shared/github-provider.js',
  'shared/git-sync-engine.js',
  'side-panel/backup-data.js',
].forEach(script => {
  assert.match(serviceWorker, new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `service worker should import ${script}`);
});

[
  'GIT_SYNC_GET_CONFIG',
  'GIT_SYNC_SAVE_CONFIG',
  'GIT_SYNC_CLEAR_CONFIG',
  'GIT_SYNC_TEST',
  'GIT_SYNC_PUSH',
  'GIT_SYNC_PULL',
  'GIT_SYNC_STATUS',
].forEach(type => {
  assert.match(serviceWorker, new RegExp(`case '${type}'`), `service worker should handle ${type}`);
});

assert.match(serviceWorker, /const GIT_SYNC_CONFIG_KEY = 'gitSyncConfig'/, 'service worker should use a dedicated git config storage key');
assert.match(serviceWorker, /const GIT_SYNC_STATE_KEY = 'gitSyncState'/, 'service worker should use a dedicated git state storage key');
assert.match(serviceWorker, /function maskGitConfig/, 'service worker should mask token before returning config to the UI');
assert.match(serviceWorker, /function createGitProvider/, 'service worker should create a provider for sync operations');
assert.match(serviceWorker, /chrome\.storage\.local\.set\(pullResult\.data\)/, 'pull should restore only business data');
assert.match(serviceWorker, /getGitSyncEngine\(\)\.pushGitSync/, 'push should use the shared sync engine');
assert.match(serviceWorker, /getGitSyncEngine\(\)\.pullGitSync/, 'pull should use the shared sync engine');
assert.doesNotMatch(backupModule, /gitSyncConfig|gitSyncState/, 'backup keys should not include git sync config or state');

console.log('git-sync service worker tests passed');
