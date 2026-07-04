const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('side-panel/panel.html', 'utf8');
const panelJs = fs.readFileSync('side-panel/panel.js', 'utf8');
const panelCss = fs.readFileSync('side-panel/panel.css', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
const contentJs = fs.readFileSync('content/content.js', 'utf8');
const contentCss = fs.readFileSync('content/content.css', 'utf8');

function assertContains(id) {
  assert.match(html, new RegExp(`id="${id}"`), `panel.html should contain #${id}`);
}

[
  'export-toggle-btn',
  'export-dialog',
  'export-filtered-btn',
  'export-all-btn',
  'backup-export-btn',
  'backup-import-btn',
  'backup-file-input',
  'git-sync-token-input',
  'git-sync-owner-input',
  'git-sync-repo-input',
  'git-sync-branch-input',
  'git-sync-path-input',
  'git-sync-save-btn',
  'git-sync-test-btn',
  'git-sync-push-btn',
  'git-sync-pull-btn',
  'git-sync-clear-btn',
  'git-sync-status',
  'review-start-btn',
  'review-mode',
  'review-jump-wrap',
  'review-score-btns',
  'review-enabled-checkbox',
  'settings-panel',
  'theme-mode-select',
].forEach(assertContains);

assert.match(html, /<option value="system">跟随系统<\/option>/, 'theme selector should default to a system option');
assert.match(html, /<option value="light">浅色模式<\/option>/, 'theme selector should include light mode');
assert.match(html, /<option value="dark">深色模式<\/option>/, 'theme selector should include dark mode');
assert.match(html, /Git 仓库同步/, 'settings should include a Git sync section');
assert.match(html, /Token 只保存在本机/, 'Git sync section should explain local token storage');
assert.match(html, /<details class="settings-section git-sync-section" id="git-sync-section">/, 'Git sync settings should be collapsible');
assert.match(html, /<summary class="git-sync-summary">/, 'Git sync summary should wrap the always-visible header content');
assert.match(html, /<span class="settings-label git-sync-title">Git 仓库同步<\/span>/, 'Git sync title should use the settings title styling');
assert.match(html, /<span class="git-sync-chevron" aria-hidden="true">/, 'Git sync summary should show a right-side collapse indicator');
assert.ok(
  html.indexOf('Token 只保存在本机') < html.indexOf('class="git-sync-body"'),
  'Git sync description should stay inside the summary so it remains visible when collapsed'
);
assert.ok(
  html.indexOf('id="git-sync-section"') < html.indexOf('id="backup-export-btn"'),
  'Git sync section should appear before data backup so backup stays at the bottom'
);
assert.match(html, /<script src="git-sync\.js"><\/script>/, 'panel should load Git sync UI script');
assert.match(panelJs, /window\.MarkBuddyPanel/, 'panel.js should expose a small helper API for Git sync UI');
assert.match(panelJs, /confirmAction: showCustomConfirm/, 'Git sync UI should reuse the existing custom confirmation dialog');
assert.match(panelJs, /reload: loadAll/, 'Git sync UI should be able to refresh the bookmark list after pull');
assert.match(panelCss, /\.git-sync-grid/, 'panel.css should style Git sync form fields');
assert.match(panelCss, /\.git-sync-actions/, 'panel.css should style Git sync actions');
const settingsLabelRuleMatch = panelCss.match(/\.settings-label\s*\{[^}]*\}/);
assert.ok(settingsLabelRuleMatch, 'panel.css should style settings labels');
assert.match(settingsLabelRuleMatch[0], /font-weight:\s*700/, 'settings labels should be bold');
assert.match(settingsLabelRuleMatch[0], /color:\s*var\(--text-primary\)/, 'settings labels should use black primary text');
assert.match(settingsLabelRuleMatch[0], /letter-spacing:\s*0/, 'settings labels should not use spaced-out text');
const gitSyncSummaryRuleMatch = panelCss.match(/\.git-sync-summary\s*\{[^}]*\}/);
assert.ok(gitSyncSummaryRuleMatch, 'panel.css should style the Git sync summary');
assert.match(gitSyncSummaryRuleMatch[0], /display:\s*block/, 'Git sync summary should align like other setting titles');
assert.match(gitSyncSummaryRuleMatch[0], /padding-left:\s*0/, 'Git sync summary should not get extra marker indentation');
assert.match(panelCss, /\.git-sync-summary::-webkit-details-marker\s*\{[^}]*display:\s*none/, 'Git sync summary should hide the browser default marker');
assert.match(panelCss, /\.git-sync-title-row\s*\{[^}]*justify-content:\s*space-between/, 'Git sync title row should place the triangle on the right');
assert.match(panelCss, /\.git-sync-chevron\s*\{[^}]*transition:\s*transform/, 'Git sync triangle should animate state changes');
assert.match(panelCss, /\.git-sync-section\[open\] \.git-sync-chevron\s*\{[^}]*rotate\(90deg\)/, 'Git sync triangle should rotate when expanded');
assert.match(panelCss, /\.git-sync-summary \.settings-help\s*\{[^}]*margin-top:\s*4px/, 'Git sync description should use compact title spacing');
assert.match(html, /id="review-start-btn">看看这些<\/button>/, 'review banner button should invite lightweight rediscovery');
assert.match(html, /class="review-banner-icon">🔔<\/span>/, 'review banner should use a reminder icon instead of a study icon');
assert.match(html, /id="review-banner-text">今日重温 0 条<\/span>/, 'review banner should frame due items as rediscovery');

const searchInputMatch = html.match(/<input\b(?=[^>]*\bid="search-input")[^>]*>/);
assert.ok(searchInputMatch, 'panel.html should contain #search-input input');
assert.doesNotMatch(
  searchInputMatch[0],
  /\btype="search"/,
  'search input should not use type="search" when a custom clear button is rendered'
);

const noteTextRuleMatch = panelCss.match(/\.highlight-note-text\s*\{[^}]*\}/);
assert.ok(noteTextRuleMatch, 'panel.css should style highlight notes');
assert.match(
  noteTextRuleMatch[0],
  /background:\s*var\(--bg-surface\)/,
  'highlight notes should have a subtle background to distinguish them from highlighted text'
);
assert.match(
  noteTextRuleMatch[0],
  /border:\s*1px solid var\(--border\)/,
  'highlight notes should have a light border so the background reads as a note block'
);

const highlightItemRuleMatch = panelCss.match(/\.highlight-item\s*\{[^}]*\}/);
assert.ok(highlightItemRuleMatch, 'panel.css should style highlight list items');
assert.match(
  highlightItemRuleMatch[0],
  /position:\s*relative/,
  'highlight list items should anchor the delete button independently of wrapped text'
);
assert.match(
  highlightItemRuleMatch[0],
  /padding-right:\s*36px/,
  'highlight list items should reserve right-side space for the fixed delete button'
);

const highlightDeleteRuleMatch = panelCss.match(/\.highlight-delete-btn\s*\{[^}]*\}/);
assert.ok(highlightDeleteRuleMatch, 'panel.css should style highlight delete button');
assert.match(
  highlightDeleteRuleMatch[0],
  /position:\s*absolute/,
  'highlight delete button should keep a fixed position when highlight text wraps'
);
assert.match(
  highlightDeleteRuleMatch[0],
  /top:\s*8px/,
  'highlight delete button should align to the top of each highlight item'
);
assert.match(
  highlightDeleteRuleMatch[0],
  /right:\s*8px/,
  'highlight delete button should stay pinned to the right edge of each highlight item'
);

assert.match(panelCss, /:root\[data-theme="dark"\]/, 'panel.css should allow a manual dark theme override');
assert.match(panelCss, /:root:not\(\[data-theme\]\)/, 'panel.css should only follow system dark mode when no manual theme is set');

assert.match(panelJs, /function applyThemeMode\(themeMode\)/, 'panel.js should apply the selected theme mode');
assert.match(panelJs, /document\.documentElement\.dataset\.theme = normalized/, 'panel.js should set html data-theme for manual theme modes');
assert.match(panelJs, /delete document\.documentElement\.dataset\.theme/, 'panel.js should remove html data-theme when following system');
assert.match(panelJs, /getElementById\('theme-mode-select'\)/, 'panel.js should wire the theme mode selector');
assert.match(panelJs, /settings\.themeMode = themeMode/, 'panel.js should persist theme mode in settings');
assert.match(serviceWorker, /themeMode: 'system'/, 'default settings should follow system theme');
assert.match(serviceWorker, /reviewEnabled: true/, 'default settings should enable highlight review');
assert.match(
  serviceWorker,
  /REVIEW_BADGE_UPDATED/,
  'service worker should broadcast review count updates to content scripts'
);
assert.match(
  contentJs,
  /id="markbuddy-sidebar-trigger-badge"/,
  'floating sidebar trigger should include a review count badge node'
);
assert.match(
  contentJs,
  /sendMessage\('GET_DUE_REVIEWS'/,
  'floating sidebar trigger should load the initial due review count'
);
assert.match(
  contentJs,
  /message\.type === 'REVIEW_BADGE_UPDATED'/,
  'floating sidebar trigger should react to pushed review count updates'
);
assert.match(
  contentCss,
  /#markbuddy-sidebar-trigger-badge/,
  'content CSS should style the floating sidebar review count badge'
);
assert.match(panelJs, /function showPanelNotice\(message, tone = 'danger'\)/, 'panel.js should expose a reusable panel notice for navigation failures');
assert.match(panelJs, /notice\.id = 'panel-notice'/, 'panel.js should render an in-panel notice when needed');
assert.match(panelJs, /function openBookmarkUrl\(url\)/, 'panel.js should open bookmark URLs through a failure-aware helper');
assert.match(panelJs, /无法打开网页，请检查链接是否有效。/, 'panel.js should show a clear message when a saved page cannot be opened');
assert.match(panelJs, /title\.addEventListener\('click'[\s\S]*?e\.preventDefault\(\)[\s\S]*?openBookmarkUrl\(bm\.url\)/, 'bookmark title clicks should use the failure-aware opener instead of default anchor navigation');
assert.doesNotMatch(panelJs, /if \(!due \|\| due\.length === 0\) return;/, 'review start should not fail silently when there are no due reviews');
assert.match(panelJs, /showPanelNotice\('暂无待重温内容。', 'success'\)/, 'review start should explain when there is nothing to review');
assert.match(
  panelJs,
  /reviewBtn\.textContent = inReview \? '不再提醒' : '提醒我再看'/,
  'highlight reminder buttons should describe the reminder subscription action'
);
assert.doesNotMatch(
  panelJs,
  /reviewBtn\.textContent = inReview \? '复习中'/,
  'highlight list should not label queued items as actively reviewing'
);
assert.match(
  panelJs,
  /reviewBtn\.setAttribute\('aria-label', inReview \? '不再提醒这条划线' : '提醒我再看这条划线'\)/,
  'compact highlight review buttons should keep an accessible action label'
);
const activeReviewBtnRuleMatch = panelCss.match(/\.highlight-review-btn\.active\s*\{[^}]*\}/);
assert.ok(activeReviewBtnRuleMatch, 'panel.css should style the active reminder button');
assert.match(
  activeReviewBtnRuleMatch[0],
  /#ef4444|239,\s*68,\s*68|var\(--danger\)/,
  'active reminder button should use a red danger treatment for 不再提醒'
);
assert.match(
  panelJs,
  /const inReview = h\.review\?\.enabled === true/,
  'highlight review button should read independent review state'
);
assert.match(
  panelJs,
  /sendMessage\('UPDATE_HIGHLIGHT_REVIEW', \{ id: h\.id, enabled: !inReview \}\)/,
  'highlight review button should toggle independent review state'
);
assert.match(
  html,
  /id="review-enabled-checkbox"/,
  'review settings should include an enable switch'
);
assert.match(
  html,
  /开启后可把划线加入定时提醒；关闭后列表隐藏提醒按钮/,
  'review settings should explain what the switch controls'
);
assert.match(
  html,
  /<span class="settings-row-label">[\s\S]*?唤醒收藏[\s\S]*?info-tooltip-wrap/,
  'review settings should show an info tooltip beside the label'
);
assert.match(
  html,
  /SM-2 提醒节奏/,
  'review tooltip should describe the SM-2 reminder cadence'
);
assert.match(
  html,
  /三档反馈/,
  'review tooltip should mention the three review feedback choices'
);
assert.match(
  html,
  /每次回顾用三档反馈：暂时没用、再看看、仍然有用/,
  'review tooltip should frame feedback around current usefulness instead of memory testing'
);
assert.match(
  html,
  /动态调整下一次提醒时间/,
  'review tooltip should explain that review timing adapts'
);
assert.match(
  panelJs,
  /function isReviewFeatureEnabled\(\)/,
  'panel.js should centralize whether review UI is enabled'
);
assert.match(
  panelJs,
  /function hasReviewEnabledHighlights\(\)/,
  'panel.js should detect whether any highlight is already in review'
);
assert.match(
  panelJs,
  /if \(isReviewFeatureEnabled\(\)\) \{[\s\S]*?const reviewBtn = document\.createElement\('button'\)/,
  'highlight review buttons should be hidden when the review feature is disabled'
);
assert.match(
  panelJs,
  /已有划线开启提醒，请先设为不再提醒后再关闭。/,
  'turning review off should explain why it is blocked when highlights are in review'
);
assert.match(
  panelJs,
  /expandedBookmarkUrls = new Set\(\)/,
  'panel.js should track expanded bookmark highlight lists across reloads'
);
assert.match(
  panelJs,
  /expandedBookmarkUrls\.add\(bm\.url\)/,
  'expanding a highlight list should remember the bookmark URL'
);
assert.match(
  panelJs,
  /expandedBookmarkUrls\.delete\(bm\.url\)/,
  'collapsing a highlight list should forget the bookmark URL'
);
assert.match(
  panelJs,
  /expandedBookmarkUrls\.has\(bm\.url\)/,
  'rendering a bookmark should restore its expanded highlight list state'
);
assert.doesNotMatch(
  panelJs,
  /toggleReviewTag\(h\.tags, settings\.reviewTag\)/,
  'highlight review button should not toggle review through tags'
);
assert.doesNotMatch(
  html,
  /id="review-tag-input"/,
  'settings should not expose review tag input'
);
assert.doesNotMatch(
  panelJs,
  /review-tag-input/,
  'panel.js should not wire review tag settings'
);
assert.doesNotMatch(
  panelJs,
  /settings\.reviewTag/,
  'panel.js should not depend on reviewTag'
);

assert.match(html, /id="score-forgot">暂时没用<\/button>/, 'low review feedback should use usefulness wording');
assert.match(html, /id="score-fuzzy">再看看<\/button>/, 'middle review feedback should use usefulness wording');
assert.match(html, /id="score-remembered">仍然有用 ✓<\/button>/, 'high review feedback should use usefulness wording');
assert.doesNotMatch(html, />没记住<\/button>/, 'review buttons should not frame feedback as memory failure');
assert.doesNotMatch(html, />模糊<\/button>/, 'review buttons should not frame feedback as fuzzy recall');
assert.doesNotMatch(html, />记住了 ✓<\/button>/, 'review buttons should not frame feedback as memorized recall');
assert.match(panelJs, /<span class="label">仍然有用<\/span>/, 'review summary should use usefulness wording for high feedback');
assert.match(panelJs, /<span class="label">再看看<\/span>/, 'review summary should use usefulness wording for middle feedback');
assert.match(panelJs, /<span class="label">暂时没用<\/span>/, 'review summary should use usefulness wording for low feedback');
assert.doesNotMatch(html, /复习/, 'visible side panel HTML should not use study/exam wording');
assert.doesNotMatch(panelJs, /'[^']*复习[^']*'|"[^"]*复习[^"]*"/, 'visible side panel strings should not use study/exam wording');

const scriptOrder = [
  'export-markdown.js',
  'backup-data.js',
  'panel.js',
].map(src => html.indexOf(src));

assert.deepEqual(
  scriptOrder.every(index => index >= 0),
  true,
  'all side panel scripts should be present'
);

assert.deepEqual(
  [...scriptOrder].sort((a, b) => a - b),
  scriptOrder,
  'helper scripts should load before panel.js'
);

[
  'backup-export-btn',
  'backup-import-btn',
  'backup-file-input',
  'export-toggle-btn',
  'export-filtered-btn',
  'export-all-btn',
].forEach(id => {
  assert.match(panelJs, new RegExp(`getElementById\\('${id}'\\)`), `panel.js should wire #${id}`);
});

console.log('panel structure tests passed');
