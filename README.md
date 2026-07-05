# MarkBuddy

> 一个 Chrome 浏览器扩展，支持网页收藏、文字划线高亮、自动恢复高亮，以及通过侧边面板管理所有收藏内容。

## 功能

- 保存网页和选中文本高亮
- 再次访问网页时自动恢复高亮
- 在侧边面板中搜索标题、URL、高亮内容和备注
- 使用标签、域名分组和排序管理收藏
- 将重要高亮加入“唤醒收藏”，按 SM-2 节奏定时重温
- 在扩展图标和网页浮动入口查看待重温数量徽标
- 导出 Markdown，或用 JSON 备份/恢复本地数据
- 可选 GitHub 仓库同步，用用户自己的仓库保存 JSON 数据文件并获得版本历史

## 唤醒收藏模型

唤醒收藏以单条划线为对象。新划线默认不进入提醒队列，用户需要在侧边面板中手动把重要摘录设为“提醒我再看”。提醒状态保存到高亮对象的 `review.enabled`，SM-2 排期状态保存到 `review.sm2`，不再通过普通标签判断是否需要重温。

SM-2 的 `interval` 按天计算：首次确认“仍然有用”后约 1 天再提醒，第二次约 6 天，后续按 ease factor 扩展。到期数量会同步显示在 Chrome 扩展图标徽标和网页浮动入口徽标上；后台使用 `chrome.alarms` 每小时刷新一次，并在开启/关闭提醒、删除划线、提交回顾反馈或修改设置后立即刷新。

## GitHub 仓库同步

GitHub 同步是可选功能。默认情况下 MarkBuddy 仍只把数据保存在本机；只有用户在设置页填写 GitHub Token、Owner、Repo 和分支后，点击“上传到 Git”“从 Git 恢复”或顶部快捷同步按钮才会访问 GitHub API。

保存可用配置后，侧边面板顶部会显示一个同步图标，方便从收藏列表快速上传当前数据。同步结果会显示在顶部独立提示区；如果本地业务数据没有变化，MarkBuddy 会跳过 GitHub 写入并提示“本地数据未变化，无需同步”，不会因为同步文件里的导出时间变化而创建空提交。

同步文件固定写入用户仓库中的：

```txt
markbuddy/data.json
```

同步内容包括：

- 网页收藏 `bookmarks`
- 划线、高亮备注和唤醒收藏状态 `highlights`
- 标签 `tags`
- 普通设置 `settings`
- 侧边栏展示偏好 `groupByDomain` / `sortBy`

不会同步以下本机连接配置：

- GitHub Token
- GitHub owner/repo/branch 配置
- 上次同步 sha、commit、时间等同步状态

### 使用前准备

1. 在 GitHub 上手动创建一个仓库，建议使用私有仓库。
2. 创建 fine-grained personal access token。
3. Token 只选择目标仓库，并授予 `Contents: Read and write` 权限。
4. 在 MarkBuddy 设置页填写 Token、Owner、Repo 和分支。

Repo 字段可以填写仓库名、`owner/repo`，也可以填写完整 GitHub URL，例如：

```txt
markbuddy-data
zky-git/markbuddy-data
https://github.com/zky-git/markbuddy-data
```

当前版本不会仅凭 Token 自动创建仓库。GitHub API 支持通过更高权限 token 创建仓库，但这需要 `Administration: write` 或 classic `repo` 权限；MarkBuddy 目前坚持最小权限原则，只要求用户手动创建仓库并提供 Contents 读写权限。

### 同步行为细节

- “上传到 Git”和顶部快捷同步共用同一套上传逻辑。
- 上传前会读取远端 `markbuddy/data.json`，并与本地将要生成的业务数据比较。
- 比较时只看 `app`、`version`、`sync` 和 `data`，忽略 `exportedAt` 这类导出时间元数据。
- 只有业务数据变化时才写入 GitHub 并创建 commit。
- 远端文件被其他设备修改时会提示冲突，用户可以选择覆盖或取消。
- 从 Git 恢复会覆盖本地业务数据，但不会覆盖本机 Git 同步配置。

## 快速开始

### 本地安装插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目根目录
4. 点击浏览器工具栏的 MarkBuddy 图标，即可打开侧边面板

### 打包

```bash
./package-extension.sh
```

脚本会读取 `manifest.json` 中的版本号，生成 `markbuddy-v<version>.zip`。

### 测试

项目使用 Node.js 内置断言脚本做轻量验证：

```bash
node tests/service-worker-review.test.js
node tests/git-sync-service-worker.test.js
node tests/github-provider.test.js
node tests/git-sync-engine.test.js
node tests/panel-structure.test.js
node tests/backup-data.test.js
node tests/export-markdown.test.js
node tests/content-highlight-dom.test.js
node tests/text-range-healer.test.js
node tests/manifest-commands.test.js
node tests/package-script.test.js
```

### 项目结构

```
mark-extension/
├── manifest.json              # 扩展配置（Manifest V3）
├── service-worker.js          # 后台服务：菜单注册、数据存储、提醒徽标刷新
├── content/
│   ├── content.js             # 内容脚本：划线、浮动工具栏、高亮恢复
│   └── content.css            # 内容脚本样式
├── side-panel/
│   ├── panel.html             # 侧边面板 HTML
│   ├── panel.js               # 面板逻辑：列表渲染、搜索、过滤、唤醒收藏
│   ├── panel.css              # 面板样式（深/浅色自适应）
│   ├── git-sync.js            # GitHub 同步设置 UI
│   ├── export-markdown.js     # Markdown 导出
│   └── backup-data.js         # JSON 备份/恢复
├── shared/
│   ├── github-provider.js      # GitHub Contents API 封装
│   └── git-sync-engine.js      # Git 同步 payload、push/pull 和冲突检测
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── tests/                      # Node.js 断言测试
├── docs/
│   └── superpowers/            # 设计说明和实施计划
├── CHROMEWEBSTORE.md          # Chrome Web Store 上架材料草稿
└── package-extension.sh       # 生成商店提交 zip
```
