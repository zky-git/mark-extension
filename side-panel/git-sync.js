(function () {
  'use strict';

  const fieldIds = {
    token: 'git-sync-token-input',
    owner: 'git-sync-owner-input',
    repo: 'git-sync-repo-input',
    branch: 'git-sync-branch-input',
    path: 'git-sync-path-input',
  };
  const fixedSyncPath = 'markbuddy/data.json';
  let quickSyncResetTimer = null;
  let currentConfig = {};

  function $(id) {
    return document.getElementById(id);
  }

  function panelApi() {
    return window.MarkBuddyPanel || {};
  }

  function setStatus(message, tone = 'muted') {
    const status = $('git-sync-status');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  function setQuickSyncState(state) {
    const quickBtn = $('git-sync-quick-btn');
    if (!quickBtn) return;
    if (quickSyncResetTimer) {
      clearTimeout(quickSyncResetTimer);
      quickSyncResetTimer = null;
    }
    quickBtn.dataset.syncState = state;
    quickBtn.classList.toggle('syncing', state === 'syncing');
    if (state === 'success' || state === 'error') {
      quickSyncResetTimer = setTimeout(() => {
        if (quickBtn.dataset.syncState === state) {
          quickBtn.dataset.syncState = 'idle';
          quickBtn.classList.remove('syncing');
        }
      }, 1600);
    }
  }

  function setBusy(isBusy) {
    [
      'git-sync-quick-btn',
      'git-sync-save-btn',
      'git-sync-test-btn',
      'git-sync-push-btn',
      'git-sync-pull-btn',
      'git-sync-clear-btn',
      'git-sync-asset-push-btn',
      'git-sync-asset-pull-btn',
    ].forEach(id => {
      const btn = $(id);
      if (btn) btn.disabled = isBusy;
    });
  }

  function isGitSyncConfigUsable(config = {}) {
    return Boolean(config.hasToken && config.owner && config.repo && config.branch && config.path);
  }

  function toggleQuickSync(config = {}) {
    const quickBtn = $('git-sync-quick-btn');
    if (!quickBtn) return;
    quickBtn.classList.toggle('hidden', !isGitSyncConfigUsable(config));
    if (!isGitSyncConfigUsable(config)) setQuickSyncState('idle');
  }

  function getFormConfig() {
    return {
      provider: 'github',
      token: $(fieldIds.token)?.value || '',
      owner: $(fieldIds.owner)?.value || '',
      repo: $(fieldIds.repo)?.value || '',
      branch: $(fieldIds.branch)?.value || 'main',
      path: fixedSyncPath,
    };
  }

  function applyConfig(config = {}) {
    if ($(fieldIds.token)) {
      $(fieldIds.token).value = config.hasToken ? '********' : '';
    }
    if ($(fieldIds.owner)) $(fieldIds.owner).value = config.owner || '';
    if ($(fieldIds.repo)) $(fieldIds.repo).value = config.repo || '';
    if ($(fieldIds.branch)) $(fieldIds.branch).value = config.branch || 'main';
    if ($(fieldIds.path)) $(fieldIds.path).value = fixedSyncPath;
  }

  function formatSyncTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return '';
    }
  }

  function describeState(state = {}) {
    if (!state.lastSyncAt || !state.lastCommitSha) return '';
    const time = formatSyncTime(state.lastSyncAt);
    if (!time) return '';
    return `最近同步时间 ${time}，Commit为 ${state.lastCommitSha.slice(0, 7)}`;
  }

  function updateLastSuccessMeta(state = {}) {
    const meta = $('git-sync-last-success');
    if (!meta) return;
    const text = describeState(state);
    meta.textContent = text;
    meta.classList.toggle('hidden', !text);
  }

  function updateAssetSummary(config = currentConfig, state = {}) {
    const summary = $('git-sync-asset-summary');
    if (!summary) return;
    if (!isGitSyncConfigUsable(config)) {
      summary.textContent = '把摘录同步到你自己的 GitHub 仓库，保留版本历史。';
      return;
    }
    const repo = `${config.owner}/${config.repo}`;
    const stateText = describeState(state);
    summary.textContent = stateText ? `已连接 ${repo}；${stateText}` : `已连接 ${repo}`;
  }

  async function send(type, payload) {
    const api = panelApi();
    if (!api.sendMessage) return null;
    return api.sendMessage(type, payload);
  }

  async function refreshStatus(message) {
    const resp = await send('GIT_SYNC_STATUS');
    if (!resp?.success) {
      toggleQuickSync({});
      setStatus(message || resp?.error || 'Git 同步状态读取失败。', 'danger');
      return;
    }
    applyConfig(resp.config);
    currentConfig = resp.config || {};
    toggleQuickSync(resp.config);
    updateLastSuccessMeta(resp.state);
    updateAssetSummary(resp.config, resp.state);
    setStatus(message || describeState(resp.state) || 'Git 同步未配置。', message ? 'success' : 'muted');
  }

  async function saveConfig() {
    const resp = await send('GIT_SYNC_SAVE_CONFIG', getFormConfig());
    if (!resp?.success) {
      setStatus(resp?.error || '保存 Git 配置失败。', 'danger');
      return false;
    }
    applyConfig(resp.config);
    currentConfig = resp.config || {};
    toggleQuickSync(resp.config);
    updateAssetSummary(resp.config);
    setStatus('Git 同步配置已保存。', 'success');
    return true;
  }

  async function testConnection() {
    if (!(await saveConfig())) return;
    const resp = await send('GIT_SYNC_TEST');
    if (!resp?.success) {
      setStatus(resp?.error || 'GitHub 连接测试失败。', 'danger');
      return;
    }
    setStatus(resp.exists ? '连接成功，已找到远端同步文件。' : '连接成功，远端同步文件尚未创建。', 'success');
  }

  async function pushStoredConfigToGit(force = false) {
    const resp = await send('GIT_SYNC_PUSH', { force });
    if (resp?.conflict) {
      const ok = await panelApi().confirmAction?.(
        '远端同步文件已被其他设备修改。要用本机数据覆盖远端吗？',
        '同步冲突'
      );
      if (ok) {
        return pushStoredConfigToGit(true);
      } else {
        setStatus('已取消上传，请先从 Git 恢复或手动处理冲突。', 'danger');
        setQuickSyncState('error');
      }
      return null;
    }
    if (!resp?.success) {
      setStatus(resp?.error || '上传到 Git 失败。', 'danger');
      setQuickSyncState('error');
      return null;
    }
    if (resp.noChange) {
      updateLastSuccessMeta(resp.state);
      setStatus(resp.merged ? '已合并远端数据，无需创建新提交。' : '本地数据未变化，无需创建新提交。', 'success');
      setQuickSyncState('success');
      return resp;
    }
    updateLastSuccessMeta(resp.state);
    updateAssetSummary(undefined, resp.state);
    setStatus(`${resp.merged ? '已合并并同步到 Git' : '已上传到 Git'}${resp.commitSha ? `，commit ${resp.commitSha.slice(0, 7)}` : ''}。`, 'success');
    setQuickSyncState('success');
    return resp;
  }

  async function pushToGit(force = false) {
    if (!(await saveConfig())) return;
    setQuickSyncState('syncing');
    await pushStoredConfigToGit(force);
  }

  async function quickSyncToGit(force = false) {
    const status = await send('GIT_SYNC_STATUS');
    if (!status?.success || !isGitSyncConfigUsable(status.config)) {
      toggleQuickSync({});
      setQuickSyncState('error');
      panelApi().notice?.('Git 同步配置不可用，请先在设置里保存并测试连接。');
      return;
    }
    toggleQuickSync(status.config);
    setQuickSyncState('syncing');
    const resp = await pushStoredConfigToGit(force);
    if (resp?.noChange) {
      panelApi().notice?.(resp.merged ? '已合并远端数据，无需提交。' : '本地数据未变化，无需同步。', 'success');
    } else if (resp?.success) {
      panelApi().notice?.(`${resp.merged ? '已合并并同步到 Git' : '已同步到 Git'}${resp.commitSha ? `，commit ${resp.commitSha.slice(0, 7)}` : ''}。`, 'success');
    } else {
      panelApi().notice?.('同步到 Git 失败，请打开设置查看详情。');
    }
  }

  async function pullFromGit() {
    if (!(await saveConfig())) return;
    const ok = await panelApi().confirmAction?.(
      '从 Git 恢复会覆盖当前本机 MarkBuddy 数据，但不会覆盖 Git 同步配置。继续吗？',
      '确认从 Git 恢复'
    );
    if (!ok) {
      setStatus('已取消从 Git 恢复。');
      return;
    }

    setQuickSyncState('syncing');
    const resp = await send('GIT_SYNC_PULL');
    if (!resp?.success) {
      setStatus(resp?.error || '从 Git 恢复失败。', 'danger');
      setQuickSyncState('error');
      return;
    }
    await panelApi().reload?.();
    updateLastSuccessMeta(resp.state);
    updateAssetSummary(undefined, resp.state);
    setStatus('已从 Git 恢复，列表已刷新。', 'success');
    setQuickSyncState('success');
  }

  async function clearConfig() {
    const ok = await panelApi().confirmAction?.('确定清除本机 Git 同步配置和同步状态吗？', '清除 Git 配置');
    if (!ok) return;
    const resp = await send('GIT_SYNC_CLEAR_CONFIG');
    if (!resp?.success) {
      setStatus(resp?.error || '清除 Git 配置失败。', 'danger');
      return;
    }
    applyConfig({});
    currentConfig = {};
    toggleQuickSync({});
    updateLastSuccessMeta({});
    updateAssetSummary({});
    setStatus('Git 同步配置已清除。', 'success');
  }

  function bind(id, handler) {
    const node = $(id);
    if (!node) return;
    node.addEventListener('click', async () => {
      setBusy(true);
      try {
        await handler();
      } catch (err) {
        setStatus(err.message || 'Git 同步操作失败。', 'danger');
        if (id === 'git-sync-quick-btn' || id === 'git-sync-push-btn' || id === 'git-sync-pull-btn') {
          setQuickSyncState('error');
        }
      } finally {
        setBusy(false);
      }
    });
  }

  bind('git-sync-save-btn', saveConfig);
  bind('git-sync-test-btn', testConnection);
  bind('git-sync-push-btn', () => pushToGit(false));
  bind('git-sync-pull-btn', pullFromGit);
  bind('git-sync-clear-btn', clearConfig);
  bind('git-sync-quick-btn', () => quickSyncToGit(false));
  bind('git-sync-asset-push-btn', () => pushToGit(false));
  bind('git-sync-asset-pull-btn', pullFromGit);

  $('git-sync-settings-btn')?.addEventListener('click', () => {
    $('settings-panel')?.classList.remove('hidden');
    $('git-sync-section').open = true;
  });

  refreshStatus();
})();
