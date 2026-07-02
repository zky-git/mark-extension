# 2026-07-01 对话总结

## 有用决策

- 对外文案从“划线复习”调整为“唤醒收藏 / 今日重温”，避免把功能表达成考试式记忆。
- 重温对象保持为单条划线摘录，不做网页级提醒队列。
- 新划线默认不加入提醒，用户必须在侧边面板手动选择“提醒我再看”。
- 是否提醒不再由普通标签判断，改为高亮对象上的 `review.enabled`。
- SM-2 状态保存到 `review.sm2`，JSON 备份应完整保留该对象。
- 旧的 `tags: ['学习']` 只作为普通标签保留，不迁移，也不再让高亮自动进入提醒队列。
- 设置页移除“复习标签”入口，保留总开关和 SM-2 提醒节奏说明。
- SM-2 的 `interval` 单位确定为天，不使用测试期的分钟级临时间隔。
- 待重温数量需要在 Chrome 扩展图标徽标和网页浮动入口徽标上同步展示。

## 已落实的实现信息

- `service-worker.js` 增加 `UPDATE_HIGHLIGHT_REVIEW`，用于切换单条高亮的提醒状态。
- `getDueReviews()` 只读取 `highlight.review.enabled` 和 `highlight.review.sm2.nextReviewAt`。
- `updateReviewResult()` 将评分结果写回 `highlight.review.sm2`。
- `service-worker.js` 使用 `chrome.alarms` 每小时刷新待重温徽标，并在提醒状态、评分、删除和设置变化后立即刷新。
- `content/content.js` 通过 `REVIEW_BADGE_UPDATED` 消息同步网页浮动入口徽标。
- 侧边栏高亮条目上的提醒按钮使用独立提醒状态，不再调用旧的复习标签辅助模块。
- `side-panel/review-tags.js` 和对应测试已不再需要。
- `tests/content-highlight-dom.test.js` 用于覆盖内容脚本高亮 DOM 行为。

## 验证记录

最近一次完整验证运行了以下命令：

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

这些测试覆盖提醒状态模型、徽标刷新、侧边栏结构、备份导出、Markdown 导出、内容脚本高亮 DOM、文本范围恢复、manifest 快捷键和打包脚本。
