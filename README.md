# MarkBuddy 项目文档

> 一个 Chrome 浏览器扩展，支持网页收藏、文字划线高亮、自动恢复高亮，以及通过侧边面板管理所有收藏内容。

## 文档索引

| 文档 | 说明 |
|------|------|
| [设计决策记录](./docs/design-decisions.md) | 需求访谈结论、核心设计选择及其原因 |
| [技术实现方案](./docs/implementation-plan.md) | 架构设计、数据模型、模块说明 |
| [开发日志](./docs/changelog.md) | 各版本功能迭代与变更记录 |
| [开发任务清单](./docs/tasks.md) | 分阶段构建任务与完成情况 |
| [对抗性审计报告](./docs/adversarial-audit.md) | 安全与健壮性检查报告 |

## 快速开始

### 本地安装插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目根目录
4. 点击浏览器工具栏的 MarkBuddy 图标，即可打开侧边面板

### 项目结构

```
mark-extension/
├── manifest.json              # 扩展配置（Manifest V3）
├── service-worker.js          # 后台服务：菜单注册、数据存储
├── content/
│   ├── content.js             # 内容脚本：划线、浮动工具栏、高亮恢复
│   └── content.css            # 内容脚本样式
├── side-panel/
│   ├── panel.html             # 侧边面板 HTML
│   ├── panel.js               # 面板逻辑：列表渲染、搜索、过滤
│   └── panel.css              # 面板样式（深/浅色自适应）
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── docs/                      # 项目文档
    ├── design-decisions.md
    ├── implementation-plan.md
    ├── changelog.md
    ├── tasks.md
    └── adversarial-audit.md   # 对抗性审查审计报告
```
