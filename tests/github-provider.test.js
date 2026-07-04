const assert = require('node:assert/strict');
const {
  createGitHubProvider,
  mapGitHubError,
  normalizeGitHubConfig,
  redactSecret,
} = require('../shared/github-provider.js');

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

(async () => {
  const config = normalizeGitHubConfig({
    token: '  ghp_secret  ',
    owner: ' zky ',
    repo: ' markbuddy-data ',
    branch: ' main ',
    path: ' /markbuddy/data.json ',
  });

  assert.deepEqual(config, {
    provider: 'github',
    token: 'ghp_secret',
    owner: 'zky',
    repo: 'markbuddy-data',
    branch: 'main',
    path: 'markbuddy/data.json',
  });

  assert.deepEqual(
    normalizeGitHubConfig({
      token: 'ghp_secret',
      owner: '',
      repo: 'https://github.com/zky-git/markbuddy',
      branch: 'main',
    }),
    {
      provider: 'github',
      token: 'ghp_secret',
      owner: 'zky-git',
      repo: 'markbuddy',
      branch: 'main',
      path: 'markbuddy/data.json',
    }
  );

  assert.deepEqual(
    normalizeGitHubConfig({
      token: 'ghp_secret',
      owner: '',
      repo: 'zky-git/markbuddy',
      branch: 'main',
    }),
    {
      provider: 'github',
      token: 'ghp_secret',
      owner: 'zky-git',
      repo: 'markbuddy',
      branch: 'main',
      path: 'markbuddy/data.json',
    }
  );

  assert.equal(redactSecret('Token ghp_secret failed', 'ghp_secret'), 'Token [redacted] failed');
  assert.equal(mapGitHubError(401), 'GitHub Token 无效或已过期。');
  assert.equal(mapGitHubError(403), 'GitHub Token 权限不足，请确认已授予目标仓库 Contents 读写权限。');
  assert.equal(mapGitHubError(404), '未找到 GitHub 仓库、分支或同步文件。');
  assert.equal(mapGitHubError(409), '远端文件已变化，请先处理同步冲突。');

  const calls = [];
  const provider = createGitHubProvider({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === 'PUT') {
        return createJsonResponse(200, {
          content: { sha: 'remote-sha-2', path: 'markbuddy/data.json' },
          commit: { sha: 'commit-sha-2' },
        });
      }
      return createJsonResponse(200, {
        sha: 'remote-sha-1',
        content: Buffer.from('{"app":"MarkBuddy"}', 'utf8').toString('base64'),
        path: 'markbuddy/data.json',
      });
    },
  });

  const file = await provider.readFile(config);
  assert.equal(calls[0].url, 'https://api.github.com/repos/zky/markbuddy-data/contents/markbuddy%2Fdata.json?ref=main');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ghp_secret');
  assert.equal(file.sha, 'remote-sha-1');
  assert.equal(file.content, '{"app":"MarkBuddy"}');

  const writeResult = await provider.writeFile(config, {
    content: '{"app":"MarkBuddy"}',
    message: 'chore(markbuddy): sync data',
    sha: 'remote-sha-1',
  });
  assert.equal(calls[1].url, 'https://api.github.com/repos/zky/markbuddy-data/contents/markbuddy%2Fdata.json');
  assert.equal(calls[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    message: 'chore(markbuddy): sync data',
    content: Buffer.from('{"app":"MarkBuddy"}', 'utf8').toString('base64'),
    branch: 'main',
    sha: 'remote-sha-1',
  });
  assert.equal(writeResult.sha, 'remote-sha-2');
  assert.equal(writeResult.commitSha, 'commit-sha-2');

  const missingProvider = createGitHubProvider({
    fetchImpl: async () => createJsonResponse(404, { message: 'Not Found' }),
  });
  const missing = await missingProvider.readFile(config);
  assert.equal(missing.exists, false);

  console.log('github-provider tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
