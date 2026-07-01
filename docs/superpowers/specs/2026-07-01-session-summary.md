# 2026-07-01 对话总结

## 有用决策

- 复习对象保持为单条划线摘录，不做网页级复习队列。
- 新划线默认不加入复习，用户必须在侧边面板手动加入。
- 是否复习不再由普通标签判断，改为高亮对象上的 `review.enabled`。
- SM-2 状态保存到 `review.sm2`，JSON 备份应完整保留该对象。
- 旧的 `tags: ['学习']` 只作为普通标签保留，不迁移，也不再让高亮自动进入复习队列。
- 设置页移除“复习标签”入口，保留总开关和 SM-2 策略说明。
- SM-2 的 `interval` 单位确定为天，不使用测试期的分钟级临时间隔。

## 已落实的实现信息

- `service-worker.js` 增加 `UPDATE_HIGHLIGHT_REVIEW`，用于切换单条高亮的复习状态。
- `getDueReviews()` 只读取 `highlight.review.enabled` 和 `highlight.review.sm2.nextReviewAt`。
- `updateReviewResult()` 将评分结果写回 `highlight.review.sm2`。
- 侧边栏高亮条目上的复习按钮使用独立复习状态，不再调用旧的复习标签辅助模块。
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

这些测试覆盖复习状态模型、侧边栏结构、备份导出、Markdown 导出、内容脚本高亮 DOM、文本范围恢复、manifest 快捷键和打包脚本。
