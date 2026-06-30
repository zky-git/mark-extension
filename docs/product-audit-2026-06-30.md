# MarkBuddy 产品定位对齐审计

日期：2026-06-30

## 审计依据

本审计依据 `docs/superpowers/specs/2026-06-30-markbuddy-product-positioning-design.md`，目标方向是：

- 找回优先
- 复习辅助
- Markdown 导出保障数据自由
- 不做完整知识库或笔记软件

## 当前结论

当前实现已经从“网页收藏/划线工具”补强为“网页阅读捕获与找回工具”：

- 用户可以快速保存网页片段。
- 用户可以在侧边栏通过搜索、标签、域名分组和排序找回片段。
- 用户可以回到原网页，并在页面轻微变化时通过文本快照进行轻量自愈。
- 用户可以主动把单条高亮加入复习队列。
- 用户可以导出 Markdown，或用 JSON 完整备份/恢复扩展数据。
- 用户可以通过快捷键降低捕获和打开侧边栏的成本。

## 覆盖情况

| 产品要求 | 当前状态 | 证据 |
|----------|----------|------|
| 保存网页选中文本和来源 | 已覆盖 | `content/content.js`, `service-worker.js` |
| 再次访问网页恢复高亮 | 已覆盖 | `content/content.js`, `GET_HIGHLIGHTS_FOR_URL` |
| 页面轻微变化时避免错位高亮 | 已覆盖 | `content/text-range-healer.js`, `tests/text-range-healer.test.js` |
| 搜索标题、URL、高亮和备注 | 已覆盖 | `side-panel/panel.js` |
| 标签过滤和域名分组 | 已覆盖 | `side-panel/panel.js` |
| 跳回原网页高亮位置 | 已覆盖 | `SCROLL_TO_HIGHLIGHT` 消息流 |
| 复习必须主动选择 | 已覆盖 | `side-panel/review-tags.js`, `GET_DUE_REVIEWS` |
| Markdown 导出 | 已覆盖 | `side-panel/export-markdown.js`, `tests/export-markdown.test.js` |
| JSON 完整备份/恢复 | 已覆盖 | `side-panel/backup-data.js`, `tests/backup-data.test.js` |
| 快捷捕获入口 | 已覆盖 | `manifest.commands`, `service-worker.js`, `tests/manifest-commands.test.js` |
| 不变成完整笔记软件 | 已保持 | 没有新增编辑器、图谱、云同步、协作或项目管理能力 |

## 验证清单

已执行并通过：

- `node tests/panel-structure.test.js`
- `node tests/manifest-commands.test.js`
- `node tests/text-range-healer.test.js`
- `node tests/backup-data.test.js`
- `node tests/export-markdown.test.js`
- `node tests/review-tags.test.js`
- `node tests/service-worker-review.test.js`
- `node --check side-panel/panel.js`
- `node --check service-worker.js`
- `node --check content/content.js`
- `node --check content/text-range-healer.js`
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`

## 发布前仍需人工完成

以下不影响产品定位实现，但影响商店发布：

- 制作 Chrome Web Store 截图。
- 制作推荐图。
- 提供公开隐私政策 URL。
- 在真实 Chrome 扩展环境中做一次人工冒烟测试，包括快捷键、导出、导入和高亮恢复。

## 决策

当前代码已经满足产品定位中的核心能力。后续新增功能应继续遵守以下边界：

- 优先增强找回可靠性和阅读现场捕获效率。
- 复习保持主动选择，不默认制造学习压力。
- 导出和备份保障数据自由，不扩展成完整笔记系统。
- 不引入账号、云同步或 AI 能力，除非另起设计评审。
