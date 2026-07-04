(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkBuddyGitHubProvider = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const GITHUB_API_BASE = 'https://api.github.com';

  function trimString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizePath(path) {
    return trimString(path).replace(/^\/+/, '') || 'markbuddy/data.json';
  }

  function normalizeGitHubConfig(config = {}) {
    return {
      provider: 'github',
      token: trimString(config.token),
      owner: trimString(config.owner),
      repo: trimString(config.repo),
      branch: trimString(config.branch) || 'main',
      path: normalizePath(config.path),
    };
  }

  function validateGitHubConfig(config = {}) {
    const normalized = normalizeGitHubConfig(config);
    if (!normalized.token) throw new Error('请填写 GitHub Token。');
    if (!normalized.owner) throw new Error('请填写 GitHub 仓库 owner。');
    if (!normalized.repo) throw new Error('请填写 GitHub 仓库名称。');
    if (!normalized.branch) throw new Error('请填写 Git 分支。');
    if (!normalized.path) throw new Error('请填写同步文件路径。');
    return normalized;
  }

  function redactSecret(message, secret) {
    const text = String(message || '');
    if (!secret) return text;
    return text.split(secret).join('[redacted]');
  }

  function mapGitHubError(status) {
    if (status === 401) return 'GitHub Token 无效或已过期。';
    if (status === 403) return 'GitHub Token 权限不足，请确认已授予目标仓库 Contents 读写权限。';
    if (status === 404) return '未找到 GitHub 仓库、分支或同步文件。';
    if (status === 409) return '远端文件已变化，请先处理同步冲突。';
    return `GitHub 请求失败（${status}）。`;
  }

  function encodeBase64(text) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(text, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(text)));
  }

  function decodeBase64(text) {
    const clean = String(text || '').replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(clean, 'base64').toString('utf8');
    }
    return decodeURIComponent(escape(atob(clean)));
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function createHeaders(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  function createGitHubProvider(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('当前环境不支持网络请求。');

    async function request(config, path, options = {}) {
      const normalized = validateGitHubConfig(config);
      const response = await fetchImpl(`${GITHUB_API_BASE}${path}`, {
        ...options,
        headers: {
          ...createHeaders(normalized.token),
          ...(options.headers || {}),
        },
      });
      return { response, normalized };
    }

    async function readFile(config) {
      const normalized = validateGitHubConfig(config);
      const path = `/repos/${encodeURIComponent(normalized.owner)}/${encodeURIComponent(normalized.repo)}/contents/${encodeURIComponent(normalized.path)}?ref=${encodeURIComponent(normalized.branch)}`;
      const { response } = await request(normalized, path);
      const data = await readJson(response);

      if (response.status === 404) {
        return { exists: false, sha: null, content: '', path: normalized.path };
      }
      if (!response.ok) {
        throw new Error(redactSecret(mapGitHubError(response.status), normalized.token));
      }

      return {
        exists: true,
        sha: data.sha,
        content: decodeBase64(data.content || ''),
        path: data.path || normalized.path,
      };
    }

    async function writeFile(config, { content, message, sha }) {
      const normalized = validateGitHubConfig(config);
      const path = `/repos/${encodeURIComponent(normalized.owner)}/${encodeURIComponent(normalized.repo)}/contents/${encodeURIComponent(normalized.path)}`;
      const body = {
        message,
        content: encodeBase64(content),
        branch: normalized.branch,
      };
      if (sha) body.sha = sha;

      const { response } = await request(normalized, path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(redactSecret(mapGitHubError(response.status), normalized.token));
      }

      return {
        sha: data.content?.sha || null,
        commitSha: data.commit?.sha || null,
        path: data.content?.path || normalized.path,
      };
    }

    async function testConnection(config) {
      const file = await readFile(config);
      return { success: true, file };
    }

    return {
      readFile,
      testConnection,
      writeFile,
    };
  }

  return {
    createGitHubProvider,
    mapGitHubError,
    normalizeGitHubConfig,
    redactSecret,
    validateGitHubConfig,
  };
});
