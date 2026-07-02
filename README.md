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

## 唤醒收藏模型

唤醒收藏以单条划线为对象。新划线默认不进入提醒队列，用户需要在侧边面板中手动把重要摘录设为“提醒我再看”。提醒状态保存到高亮对象的 `review.enabled`，SM-2 排期状态保存到 `review.sm2`，不再通过普通标签判断是否需要重温。

SM-2 的 `interval` 按天计算：首次确认“仍然有用”后约 1 天再提醒，第二次约 6 天，后续按 ease factor 扩展。到期数量会同步显示在 Chrome 扩展图标徽标和网页浮动入口徽标上；后台使用 `chrome.alarms` 每小时刷新一次，并在开启/关闭提醒、删除划线、提交回顾反馈或修改设置后立即刷新。

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
│   ├── export-markdown.js     # Markdown 导出
│   └── backup-data.js         # JSON 备份/恢复
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
