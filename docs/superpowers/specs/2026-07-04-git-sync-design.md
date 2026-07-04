# Git 仓库同步设计

## 背景

MarkBuddy 当前是纯前端 Chrome Manifest V3 扩展，没有自有服务端。收藏、划线、标签和设置都保存在 `chrome.storage.local`。设置页已经提供 JSON 备份和恢复能力，备份模块会把核心存储 key 打包成 MarkBuddy 数据文件。

用户希望在没有服务端的前提下获得跨设备同步、版本管理和可回滚备份。最务实的方案不是在浏览器扩展里执行本机 `git commit` 或实现完整 Git 协议，而是通过 Git 平台 API 把 MarkBuddy 数据写入用户自己的仓库文件。每次写入由平台生成一次 commit，从用户角度看就是 Git 仓库同步。

第一版功能命名为“Git 仓库同步”。MVP 先支持 GitHub Contents API，后续保留 Gitee、GitLab 或真正 Git 协议的扩展空间。

## 目标

- 不引入 MarkBuddy 自有服务端。
- 允许用户把 MarkBuddy 数据同步到自己的 Git 仓库。
- 同步收藏网页、划线、高亮备注、标签、普通设置和侧边栏偏好。
- 不同步 Git token、仓库地址、分支、文件路径、同步状态等本机敏感配置。
- 复用现有 JSON 备份格式作为远端数据文件基础。
- 第一版提供手动“上传到 Git”“从 Git 恢复”“测试连接”。
- 远端数据变化时能检测冲突，并让用户明确选择覆盖方向。
- Token 只保存在本机，并引导用户使用专用私有仓库和最小权限 token。

## 非目标

- 第一版不实现自动双向合并。
- 第一版不实现定时自动同步。
- 第一版不接入 OAuth 登录。
- 第一版不支持浏览器内完整 Git 协议、packfile、工作区或分支合并。
- 第一版不支持 Gitee/GitLab 的具体 API 实现，但代码结构不应把 GitHub 细节散落到 UI 中。
- 不把 Git 同步配置写进 MarkBuddy 备份文件或远端数据文件。

## 当前项目依据

当前可直接复用的基础：

- `side-panel/backup-data.js` 定义 `BACKUP_KEYS = ['bookmarks', 'highlights', 'tags', 'settings', 'groupByDomain', 'sortBy']`，已经覆盖需要同步的业务数据和普通配置。
- `createBackupPayload()` 已经生成 `{ app, version, exportedAt, data }` 格式。
- `parseBackupPayload()` 已经校验 MarkBuddy 备份文件和各字段类型。
- `side-panel/panel.html` 已有“数据备份”设置区，Git 仓库同步适合放在该区域下方。
- `service-worker.js` 已有集中式 `chrome.runtime.onMessage` 路由，适合新增 Git 同步相关消息。

当前需要补足的限制：

- `manifest.json` 目前没有 GitHub API 的 `host_permissions`。
- 数据对象大多只有 `savedAt`，没有统一的 `updatedAt`。
- 删除收藏和划线时直接删除对象，没有 tombstone，因此第一版不适合做自动对象级合并。
- `backup-data.js` 当前位于 `side-panel/`，如果 service worker 也要复用备份逻辑，需要采用可在后台脚本使用的加载方式，或在实现时抽到共享位置。

## 同步内容

Git 仓库中的数据文件包含以下业务数据：

```js
{
  bookmarks,
  highlights,
  tags,
  settings,
  groupByDomain,
  sortBy
}
```

这些字段与当前 JSON 备份保持一致。普通设置可以同步，例如默认高亮颜色、主题模式、唤醒收藏开关和侧边栏展示偏好。

以下内容只保存在本机，不写入远端数据文件：

```js
{
  gitSyncConfig: {
    provider,
    token,
    owner,
    repo,
    branch,
    path
  },
  gitSyncState: {
    lastRemoteSha,
    lastCommitSha,
    lastSyncAt,
    lastSyncDirection
  }
}
```

`token` 是敏感信息，不能进入 JSON 备份、Markdown 导出、Git commit 内容或错误日志。仓库地址和同步状态虽然不一定敏感，但它们属于本机连接配置；换设备后用户应重新配置连接，再从仓库恢复业务数据。

## 远端数据格式

远端文件默认路径为：

```txt
markbuddy/data.json
```

远端 JSON 使用现有备份格式，并增加同步元信息：

```json
{
  "app": "MarkBuddy",
  "version": 1,
  "exportedAt": "2026-07-04T00:00:00.000Z",
  "sync": {
    "schemaVersion": 1,
    "source": "git-sync"
  },
  "data": {
    "bookmarks": {},
    "highlights": {},
    "tags": [],
    "settings": {},
    "groupByDomain": true,
    "sortBy": "time-desc"
  }
}
```

`parseBackupPayload()` 应继续接受没有 `sync` 字段的旧备份。`createBackupPayload()` 可以通过选项附加 `sync` 字段，保持 JSON 备份和 Git 同步共用同一套数据模型。

## 用户配置

设置页新增“Git 仓库同步”区域，位于“数据备份”下方。

用户可配置：

```txt
平台：GitHub
Token：用户个人访问令牌
仓库：owner/repo
分支：main
文件路径：markbuddy/data.json
```

第一版只显示 GitHub 平台，但内部配置仍保存 `provider: 'github'`，为后续扩展保留接口。

界面需要明确提示：

- 数据会上传到用户自己的仓库。
- 建议使用私有仓库。
- 建议创建 fine-grained token。
- Token 只保存在本机。
- Token 不会写入同步文件。
- 推荐 token 只授予目标仓库 Contents read/write 权限。

## 用户操作

第一版提供四个主要动作：

```txt
保存配置
测试连接
上传到 Git
从 Git 恢复
```

可选展示状态：

```txt
上次同步时间
上次同步方向
上次 commit
当前远端文件 sha
```

上传成功后的 commit message 格式：

```txt
chore(markbuddy): sync data
```

如果实现时能低成本统计数量，可以使用更具体的 message：

```txt
chore(markbuddy): sync 38 bookmarks and 124 highlights
```

## 架构

新增逻辑分为三层：

```txt
UI 层：side-panel/git-sync.js
同步编排层：shared/git/sync-engine.js 或 side-panel/git-sync-engine.js
平台 API 层：shared/git/github-provider.js 或 side-panel/github-provider.js
```

如果项目暂时保持无构建流程，可以先放在 `side-panel/` 下并通过普通 `<script>` 加载。只要后台脚本需要执行网络请求，平台 API 层就应能被 service worker 使用；实现阶段可以选择将共享模块抽到 `shared/`，并调整加载方式。

推荐职责：

- `git-sync.js`：读取表单、显示状态、发送 runtime message。
- `sync-engine.js`：读取本地业务数据、生成 payload、解析远端 payload、处理冲突状态。
- `github-provider.js`：封装 GitHub Contents API 的 read/write/test 操作，不接触 DOM。
- `service-worker.js`：接收 Git 同步消息，调用同步编排层，统一进行网络请求和本地存储写入。

## 后台消息

新增 message 类型：

```js
GIT_SYNC_GET_CONFIG
GIT_SYNC_SAVE_CONFIG
GIT_SYNC_CLEAR_CONFIG
GIT_SYNC_TEST
GIT_SYNC_PUSH
GIT_SYNC_PULL
GIT_SYNC_STATUS
```

返回结果统一使用：

```js
{
  success: true,
  data: {}
}
```

失败时返回：

```js
{
  success: false,
  error: "可展示给用户的错误信息"
}
```

错误信息不得包含 token。网络层应把 GitHub 的 401、403、404、409 等状态转换成用户能理解的中文提示。

## GitHub API 行为

第一版使用 GitHub Contents API：

- 读取文件：`GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`
- 创建或更新文件：`PUT /repos/{owner}/{repo}/contents/{path}`

更新已有文件时必须传当前文件 `sha`。远端不存在时创建文件。远端存在但 `sha` 与本地 `lastRemoteSha` 不一致时，视为远端已被其他设备修改。

`manifest.json` 需要新增：

```json
{
  "host_permissions": [
    "https://api.github.com/*"
  ]
}
```

如果后续支持 Gitee/GitLab，再追加对应 host 权限。

## 上传流程

上传到 Git：

```txt
1. 校验 Git 配置完整。
2. 读取远端 data.json。
3. 读取本地 BACKUP_KEYS。
4. 使用 createBackupPayload() 生成同步 payload。
5. 如果远端不存在，创建文件。
6. 如果远端存在且 sha 等于 lastRemoteSha，更新文件。
7. 如果远端存在且 sha 不等于 lastRemoteSha，提示冲突，不自动覆盖。
8. 成功后保存 lastRemoteSha、lastCommitSha、lastSyncAt、lastSyncDirection。
9. UI 显示成功状态。
```

如果用户选择“用本机覆盖远端”，上传时允许使用最新远端 `sha` 强制更新文件，并在结果中标记这是一次覆盖操作。

## 恢复流程

从 Git 恢复：

```txt
1. 校验 Git 配置完整。
2. 读取远端 data.json。
3. Base64 解码文件内容。
4. 使用 parseBackupPayload() 校验 JSON。
5. 显示确认文案：导入将覆盖当前本机 MarkBuddy 数据。
6. 用户确认后，把 payload.data 写入 chrome.storage.local。
7. 保存 lastRemoteSha、lastSyncAt、lastSyncDirection。
8. 刷新侧边栏列表和状态。
```

恢复操作会覆盖本地业务数据，但不会覆盖本机 Git 同步配置。

## 冲突策略

第一版采用简单冲突策略，不自动合并。

冲突判定：

```txt
远端文件存在，并且 remoteSha !== gitSyncState.lastRemoteSha
```

用户可选择：

```txt
用本机覆盖远端
用远端覆盖本机
取消，稍后手动处理
```

不做对象级合并的原因：

- 当前对象缺少统一 `updatedAt`。
- 删除操作没有 tombstone。
- 自动合并可能导致删除内容复活或备注被旧值覆盖。

后续若要做自动合并，需要先完成数据模型增强：

```txt
bookmark.updatedAt
highlight.updatedAt
deletedAt 或 tombstone
```

## 安全设计

Token 存储：

- 使用 `chrome.storage.local` 保存。
- UI 默认隐藏 token。
- 提供清除配置能力。
- 导出 JSON 备份时不得包含 token。
- Git 同步 payload 不得包含 token。

权限建议：

- 文案引导用户创建专用 fine-grained token。
- token 只授予目标私有仓库 Contents read/write 权限。
- 不建议使用拥有全账号或全 repo 权限的 token。

日志要求：

- 控制台和 UI 错误不得打印 Authorization header。
- GitHub 错误响应中如包含请求上下文，实现时需要过滤敏感字段后再显示。

## UI 细节

设置区域示意：

```txt
Git 仓库同步

[ ] 启用 Git 仓库同步

平台        GitHub
Token       ********
仓库        owner/repo
分支        main
文件路径    markbuddy/data.json

[保存配置] [测试连接]
[上传到 Git] [从 Git 恢复]

状态：上次上传 2026-07-04 10:21，commit abc123
```

按钮行为：

- 未保存配置时，测试/上传/恢复按钮禁用或显示明确错误。
- 上传和恢复进行中时，按钮进入 loading 状态，避免重复提交。
- 恢复前必须二次确认，因为会覆盖本地业务数据。
- 冲突时使用现有确认弹窗风格，要求用户选择覆盖方向或取消。

## 测试

需要覆盖以下重点：

- `createBackupPayload()` 能附加 `sync` 元信息，但旧调用保持兼容。
- `parseBackupPayload()` 接受带 `sync` 字段的同步文件。
- Git 同步配置不会进入 `BACKUP_KEYS`。
- 保存 Git 配置时 token 存在本机配置中，但不会进入业务 payload。
- 上传新文件时调用 provider create/update，并保存远端 sha。
- 上传已有文件时传入当前 remote sha。
- 远端 sha 与 `lastRemoteSha` 不一致时返回冲突，而不是静默覆盖。
- 从 Git 恢复时只写入业务数据，不覆盖 Git 同步配置。
- GitHub 401/403/404/409 错误会转换成安全的中文错误。
- `manifest.json` 包含 GitHub API host permission。
- 设置页包含 Git 同步区域和必要按钮。

## 分阶段实施

P0：数据格式和 provider 测试

- 扩展备份 payload 支持同步元信息。
- 新增 GitHub provider 的纯函数或 mockable API 封装。
- 新增配置过滤，确保 token 不进入备份。

P1：手动 GitHub 同步 MVP

- 新增 manifest host permission。
- 新增 Git 同步设置 UI。
- 新增保存配置、测试连接、上传到 Git、从 Git 恢复。
- 实现简单冲突检测。

P2：同步体验完善

- 展示上次同步时间、方向和 commit。
- 优化错误提示。
- 增加清除配置入口。

P3：数据模型增强

- 为 bookmark/highlight 的修改操作统一维护 `updatedAt`。
- 设计删除 tombstone。

P4：对象级合并和自动同步

- 基于 `updatedAt` 和 tombstone 做安全合并。
- 支持定时或变更后 debounce 自动同步。

P5：更多平台

- 引入 provider 抽象实现 Gitee/GitLab。
- 根据平台追加 host permissions 和错误映射。

## 未决事项

无。第一版明确采用 GitHub Contents API 手动同步，业务数据和普通配置同步到仓库，本机 Git token 与仓库连接配置不参与同步。
