(function () {
  'use strict';

  const fieldIds = {
    token: 'git-sync-token-input',
    owner: 'git-sync-owner-input',
    repo: 'git-sync-repo-input',
    branch: 'git-sync-branch-input',
    path: 'git-sync-path-input',
  };

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

  function setBusy(isBusy) {
    [
      'git-sync-save-btn',
      'git-sync-test-btn',
      'git-sync-push-btn',
      'git-sync-pull-btn',
      'git-sync-clear-btn',
    ].forEach(id => {
      const btn = $(id);
      if (btn) btn.disabled = isBusy;
    });
  }

  function getFormConfig() {
    return {
      provider: 'github',
      token: $(fieldIds.token)?.value || '',
      owner: $(fieldIds.owner)?.value || '',
      repo: $(fieldIds.repo)?.value || '',
      branch: $(fieldIds.branch)?.value || 'main',
      path: $(fieldIds.path)?.value || 'markbuddy/data.json',
    };
  }

  function applyConfig(config = {}) {
    if ($(fieldIds.token)) {
      $(fieldIds.token).value = config.hasToken ? '********' : '';
    }
    if ($(fieldIds.owner)) $(fieldIds.owner).value = config.owner || '';
    if ($(fieldIds.repo)) $(fieldIds.repo).value = config.repo || '';
    if ($(fieldIds.branch)) $(fieldIds.branch).value = config.branch || 'main';
    if ($(fieldIds.path)) $(fieldIds.path).value = config.path || 'markbuddy/data.json';
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
    const time = formatSyncTime(state.lastSyncAt);
    if (!time) return '';
    const direction = state.lastSyncDirection === 'pull' ? '恢复' : '上传';
    const commit = state.lastCommitSha ? `，commit ${state.lastCommitSha.slice(0, 7)}` : '';
    return `上次${direction} ${time}${commit}`;
  }

  async function send(type, payload) {
    const api = panelApi();
    if (!api.sendMessage) return null;
    return api.sendMessage(type, payload);
  }

  async function refreshStatus(message) {
    const resp = await send('GIT_SYNC_STATUS');
    if (!resp?.success) {
      setStatus(message || resp?.error || 'Git 同步状态读取失败。', 'danger');
      return;
    }
    applyConfig(resp.config);
    setStatus(message || describeState(resp.state) || 'Git 同步未配置。', message ? 'success' : 'muted');
  }

  async function saveConfig() {
    const resp = await send('GIT_SYNC_SAVE_CONFIG', getFormConfig());
    if (!resp?.success) {
      setStatus(resp?.error || '保存 Git 配置失败。', 'danger');
      return false;
    }
    applyConfig(resp.config);
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

  async function pushToGit(force = false) {
    if (!(await saveConfig())) return;
    const resp = await send('GIT_SYNC_PUSH', { force });
    if (resp?.conflict) {
      const ok = await panelApi().confirmAction?.(
        '远端同步文件已被其他设备修改。要用本机数据覆盖远端吗？',
        '同步冲突'
      );
      if (ok) {
        await pushToGit(true);
      } else {
        setStatus('已取消上传，请先从 Git 恢复或手动处理冲突。', 'danger');
      }
      return;
    }
    if (!resp?.success) {
      setStatus(resp?.error || '上传到 Git 失败。', 'danger');
      return;
    }
    setStatus(`已上传到 Git${resp.commitSha ? `，commit ${resp.commitSha.slice(0, 7)}` : ''}。`, 'success');
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

    const resp = await send('GIT_SYNC_PULL');
    if (!resp?.success) {
      setStatus(resp?.error || '从 Git 恢复失败。', 'danger');
      return;
    }
    await panelApi().reload?.();
    setStatus('已从 Git 恢复，列表已刷新。', 'success');
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

  refreshStatus();
})();
