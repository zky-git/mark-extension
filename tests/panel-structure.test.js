const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('side-panel/panel.html', 'utf8');
const panelJs = fs.readFileSync('side-panel/panel.js', 'utf8');
const gitSyncJs = fs.readFileSync('side-panel/git-sync.js', 'utf8');
const panelCss = fs.readFileSync('side-panel/panel.css', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
const contentJs = fs.readFileSync('content/content.js', 'utf8');
const contentCss = fs.readFileSync('content/content.css', 'utf8');

function assertContains(id) {
  assert.match(html, new RegExp(`id="${id}"`), `panel.html should contain #${id}`);
}

[
  'git-sync-quick-btn',
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
  'git-sync-last-success',
  'git-sync-status',
  'review-start-btn',
  'review-mode',
  'review-jump-wrap',
  'review-score-btns',
  'review-enabled-checkbox',
  'panel-notice-host',
  'settings-panel',
  'theme-mode-select',
].forEach(assertContains);

assert.ok(
  html.indexOf('id="panel-notice-host"') > html.indexOf('<header class="header">') &&
    html.indexOf('id="panel-notice-host"') < html.indexOf('id="settings-panel"'),
  'global notices should render in a dedicated top host below the header'
);
assert.match(html, /class="icon-btn git-sync-quick-btn hidden"[\s\S]*?id="git-sync-quick-btn"/, 'quick Git sync button should be hidden until config is usable');
assert.match(html, /id="git-sync-quick-btn"[\s\S]*?data-tooltip="同步数据到 Git 仓库"/, 'quick Git sync button should explain its action');
assert.match(html, /class="git-sync-cloud"/, 'quick Git sync icon should use a cloud symbol to imply network sync');
assert.match(html, /class="git-sync-transfer"/, 'quick Git sync icon should use a lighter upload/download transfer symbol');
assert.match(html, /class="git-sync-state git-sync-state-success"/, 'quick Git sync button should include a success check state');
assert.match(html, /class="git-sync-state git-sync-state-error"/, 'quick Git sync button should include an error state');
assert.match(html, /id="export-toggle-btn"[\s\S]*?data-tooltip="导出收藏为 Markdown"/, 'export button should explain its action');
assert.match(html, /id="settings-toggle-btn"[\s\S]*?data-tooltip="打开设置"/, 'settings button should explain its action');
['git-sync-quick-btn', 'export-toggle-btn', 'settings-toggle-btn'].forEach(id => {
  const buttonMatch = html.match(new RegExp(`<button\\b(?=[^>]*\\bid="${id}")[^>]*>`));
  assert.ok(buttonMatch, `panel.html should contain #${id} button`);
  assert.doesNotMatch(buttonMatch[0], /\btitle=/, `#${id} should not use native title when custom tooltip is present`);
});
assert.match(panelCss, /\.icon-btn\[data-tooltip\]::after/, 'icon buttons should render custom tooltip text');
assert.match(panelCss, /\.icon-btn\[data-tooltip\]:hover::after/, 'icon button tooltips should appear on hover');
assert.match(panelCss, /\.icon-btn\[data-tooltip\]:focus-visible::after/, 'icon button tooltips should appear on keyboard focus');
assert.match(html, /placeholder="搜索标题、来源、摘录或备注\.\.\."/u, 'search should explicitly include excerpts and notes as searchable first-class targets');
assert.match(gitSyncJs, /function isGitSyncConfigUsable\(config = \{\}\)/, 'Git sync UI should centralize config usability checks');
assert.match(gitSyncJs, /function updateLastSuccessMeta\(state = \{\}\)/, 'Git sync UI should update the last successful sync summary separately from operation status');
assert.match(gitSyncJs, /state\.lastSyncAt[\s\S]*state\.lastCommitSha/, 'Git sync summary should require both a successful sync time and commit sha');
assert.match(gitSyncJs, /Commit为 \$\{state\.lastCommitSha\.slice\(0, 7\)\}/, 'Git sync summary should label the commit as Commit');
assert.match(gitSyncJs, /toggleQuickSync\(resp\.config\)/, 'Git sync UI should refresh the header sync button from stored status');
assert.match(gitSyncJs, /bind\('git-sync-quick-btn', \(\) => quickSyncToGit\(false\)\)/, 'quick Git sync button should trigger the fast sync action');
assert.match(gitSyncJs, /resp\.noChange/, 'quick Git sync should handle no-change sync results');
assert.match(gitSyncJs, /本地数据未变化，无需同步。/, 'quick Git sync should explain when no commit is needed');
assert.match(gitSyncJs, /已合并并同步到 Git/, 'quick Git sync should show a panel notice after a successful merged sync');
assert.match(gitSyncJs, /function setQuickSyncState\(state\)/, 'Git sync UI should centralize quick sync visual state');
assert.match(gitSyncJs, /setQuickSyncState\('syncing'\)/, 'quick Git sync should show a syncing state during network I/O');
assert.match(gitSyncJs, /setQuickSyncState\('success'\)/, 'quick Git sync should show a success state after successful network I/O');
assert.match(gitSyncJs, /setQuickSyncState\('error'\)/, 'quick Git sync should show an error state after failed network I/O');
assert.match(panelCss, /\.git-sync-quick-btn\.syncing/, 'panel.css should style the quick Git sync busy state');
assert.match(panelCss, /\.git-sync-quick-btn\[data-sync-state="success"\]/, 'panel.css should style quick Git sync success state');
assert.match(panelCss, /\.git-sync-quick-btn\[data-sync-state="error"\]/, 'panel.css should style quick Git sync error state');
assert.match(panelCss, /\.git-sync-transfer/, 'panel.css should animate only the transfer arrows instead of treating the icon like refresh');
const quickSyncButtonRuleMatch = panelCss.match(/\.git-sync-quick-btn\s*\{[^}]*\}/);
assert.ok(quickSyncButtonRuleMatch, 'panel.css should style the quick Git sync button');
assert.doesNotMatch(quickSyncButtonRuleMatch[0], /color:\s*var\(--accent\)/, 'quick Git sync should not default to accent color');

assert.match(html, /<option value="system">跟随系统<\/option>/, 'theme selector should default to a system option');
assert.match(html, /<option value="light">浅色模式<\/option>/, 'theme selector should include light mode');
assert.match(html, /<option value="dark">深色模式<\/option>/, 'theme selector should include dark mode');
assert.match(html, /Git 仓库同步/, 'settings should include a Git sync section');
assert.match(html, /Token 只保存在本机/, 'Git sync section should explain local token storage');
assert.match(html, /<details class="settings-section git-sync-section" id="git-sync-section">/, 'Git sync settings should be collapsible');
assert.match(html, /<summary class="git-sync-summary">/, 'Git sync summary should wrap the always-visible header content');
assert.match(html, /<span class="settings-label git-sync-title">Git 仓库同步<\/span>/, 'Git sync title should use the settings title styling');
assert.match(html, /<span class="git-sync-last-success hidden" id="git-sync-last-success" aria-live="polite"><\/span>/, 'Git sync summary should reserve a hidden slot for the last successful sync');
assert.match(html, /<span class="git-sync-chevron" aria-hidden="true">/, 'Git sync summary should show a right-side collapse indicator');
const gitSyncLastSuccessRuleMatch = panelCss.match(/\.git-sync-last-success\s*\{[^}]*\}/);
assert.ok(gitSyncLastSuccessRuleMatch, 'panel.css should style the last successful Git sync text');
assert.match(gitSyncLastSuccessRuleMatch[0], /color:\s*var\(--success\)/, 'last successful Git sync text should use the success green');
assert.match(html, /<span class="git-sync-token-label">[\s\S]*?Token[\s\S]*?git-sync-token-tip/, 'Token field should include a help tip');
assert.match(html, /Settings > Developer settings > Personal access tokens > Fine-grained tokens/, 'Token tip should explain where to create a fine-grained token');
assert.match(html, /Contents: Read and write/, 'Token tip should mention the required Contents permission');
const gitPathInputMatch = html.match(/<input\b(?=[^>]*\bid="git-sync-path-input")[^>]*>/);
assert.ok(gitPathInputMatch, 'panel.html should contain the Git sync path input');
assert.match(gitPathInputMatch[0], /\breadonly\b/, 'Git sync path should be read-only');
assert.match(gitPathInputMatch[0], /\baria-readonly="true"/, 'Git sync path should expose read-only state to assistive tech');
assert.match(gitSyncJs, /const fixedSyncPath = 'markbuddy\/data\.json'/, 'Git sync UI should use a fixed sync path');
assert.match(gitSyncJs, /path: fixedSyncPath/, 'Git sync config should send the fixed sync path');
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
assert.match(panelCss, /\.git-sync-token-tip/, 'panel.css should style the Token help tip');
assert.match(panelCss, /\.git-sync-field input\[readonly\]\s*\{[^}]*background:\s*var\(--bg-surface\)/, 'read-only Git sync fields should look disabled');
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

const exportDialogRuleMatch = panelCss.match(/\.export-dialog\s*\{[^}]*\}/);
assert.ok(exportDialogRuleMatch, 'panel.css should style the Markdown export dialog');
assert.match(
  exportDialogRuleMatch[0],
  /border:\s*none/,
  'export dialog should avoid the default native dialog border'
);
assert.match(
  exportDialogRuleMatch[0],
  /margin:\s*auto/,
  'export dialog should be centered in the side panel viewport'
);
assert.match(
  exportDialogRuleMatch[0],
  /overflow:\s*hidden/,
  'export dialog should clip header and body backgrounds to its rounded corners'
);

const exportHeaderRuleMatch = panelCss.match(/\.export-dialog \.modal-header\s*\{[^}]*\}/);
assert.ok(exportHeaderRuleMatch, 'panel.css should give the export dialog a dedicated header style');
assert.match(
  exportHeaderRuleMatch[0],
  /padding:\s*14px 16px 12px/,
  'export dialog header should have polished spacing'
);
assert.match(
  exportHeaderRuleMatch[0],
  /border-bottom:\s*1px solid var\(--border\)/,
  'export dialog header should be visually separated from export actions'
);

const exportScopeRuleMatch = panelCss.match(/\.export-scope-btn\s*\{[^}]*\}/);
assert.ok(exportScopeRuleMatch, 'panel.css should style export scope buttons');
assert.match(
  exportScopeRuleMatch[0],
  /display:\s*grid/,
  'export scope buttons should use a stable action-row layout'
);
assert.match(
  exportScopeRuleMatch[0],
  /padding:\s*13px 42px 13px 14px/,
  'export scope buttons should reserve room for the action arrow'
);
assert.match(
  exportScopeRuleMatch[0],
  /position:\s*relative/,
  'export scope buttons should anchor their action arrow'
);
assert.match(
  panelCss,
  /\.export-scope-btn::after\s*\{[^}]*content:\s*'›'/,
  'export scope buttons should show a compact action arrow'
);
assert.match(
  panelCss,
  /\.export-scope-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
  'export scope buttons should have a clear keyboard focus state'
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
assert.match(
  noteTextRuleMatch[0],
  /max-width:\s*100%/,
  'highlight notes should stay within the side panel width'
);
assert.match(
  noteTextRuleMatch[0],
  /font-size:\s*12px/,
  'highlight notes should be visually stronger than excerpt text'
);
assert.match(
  noteTextRuleMatch[0],
  /color:\s*var\(--text-primary\)/,
  'highlight notes should use primary text color so user thinking reads first'
);

const noteContentRuleMatch = panelCss.match(/\.highlight-note-content\s*\{[^}]*\}/);
assert.ok(noteContentRuleMatch, 'panel.css should style highlight note content');
assert.match(
  noteContentRuleMatch[0],
  /min-width:\s*0/,
  'highlight note content should be allowed to shrink inside the note flex row'
);
assert.match(
  noteContentRuleMatch[0],
  /overflow-wrap:\s*anywhere/,
  'long highlight notes should wrap instead of forcing horizontal overflow'
);
assert.match(
  panelJs,
  /highlight-note-copy-btn/,
  'highlight annotations should include a copy action beside edit and delete'
);
assert.match(
  panelJs,
  /navigator\.clipboard\.writeText\(h\.note\)/,
  'highlight annotation copy action should write the annotation text to the clipboard'
);
assert.match(
  fs.readFileSync('manifest.json', 'utf8'),
  /"clipboardWrite"/,
  'extension should request clipboardWrite for annotation copy'
);
assert.match(
  panelJs,
  /showCustomConfirm\('确定要删除这条批注吗？'/,
  'deleting a highlight annotation should ask for confirmation first'
);
assert.match(
  panelJs,
  /showPanelNotice\('批注已删除。', 'success'\)/,
  'deleting a highlight annotation should show a success message'
);

const highlightsListOpenRuleMatch = panelCss.match(/\.highlights-list\.open\s*\{[^}]*\}/);
assert.ok(highlightsListOpenRuleMatch, 'panel.css should style expanded highlight lists');
assert.doesNotMatch(
  highlightsListOpenRuleMatch[0],
  /max-height:\s*600px/,
  'expanded highlight lists should not clip long annotations at 600px'
);
assert.match(
  highlightsListOpenRuleMatch[0],
  /max-height:\s*9999px/,
  'expanded highlight lists should leave enough height for long annotations'
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

assert.match(
  panelJs,
  /查看 \$\{highlights\.length\} 条摘录/,
  'expanded bookmark control should frame entries as knowledge excerpts'
);

const knowledgeCardTitleRuleMatch = panelCss.match(/\.knowledge-card \.card-title\s*\{[^}]*\}/);
assert.ok(knowledgeCardTitleRuleMatch, 'panel.css should prioritize knowledge card titles');
assert.match(
  knowledgeCardTitleRuleMatch[0],
  /color:\s*var\(--text-primary\)/,
  'knowledge card titles should be visually primary'
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
assert.match(panelJs, /getElementById\('panel-notice-host'\)/, 'panel notices should use the dedicated top host outside settings');
const showPanelNoticeMatch = panelJs.match(/function showPanelNotice\(message, tone = 'danger'\) \{[\s\S]*?\n  \}/);
assert.ok(showPanelNoticeMatch, 'panel.js should define showPanelNotice');
assert.doesNotMatch(showPanelNoticeMatch[0], /bookmark-list/, 'panel notices should not be inserted into the bookmark list');
assert.doesNotMatch(showPanelNoticeMatch[0], /settings-body/, 'panel notices should not be inserted into settings content flow');
assert.match(panelCss, /\.panel-notice-host:empty\s*\{[^}]*display:\s*none/, 'empty notice host should not reserve space');
const panelNoticeHostRuleMatch = panelCss.match(/\.panel-notice-host\s*\{[^}]*\}/);
assert.ok(panelNoticeHostRuleMatch, 'panel.css should style the notice host');
assert.match(
  panelNoticeHostRuleMatch[0],
  /position:\s*fixed/,
  'panel notices should be detached from document flow'
);
assert.match(
  panelNoticeHostRuleMatch[0],
  /z-index:\s*120/,
  'panel notices should float above panel content and dialogs'
);
assert.match(panelJs, /function openBookmarkUrl\(url\)/, 'panel.js should open bookmark URLs through a failure-aware helper');
assert.match(panelJs, /无法打开网页，请检查链接是否有效。/, 'panel.js should show a clear message when a saved page cannot be opened');
assert.match(panelJs, /title\.addEventListener\('click'[\s\S]*?e\.preventDefault\(\)[\s\S]*?openBookmarkUrl\(bm\.url\)/, 'bookmark title clicks should use the failure-aware opener instead of default anchor navigation');
assert.doesNotMatch(panelJs, /if \(!due \|\| due\.length === 0\) return;/, 'review start should not fail silently when there are no due reviews');
assert.match(panelJs, /showPanelNotice\('暂无待重温内容。', 'success'\)/, 'review start should explain when there is nothing to review');
assert.match(
  panelJs,
  /reviewBtn\.textContent = reviewDue \? '今天该看' : \(inReview \? '已加入重温' : '稍后重温'\)/,
  'highlight reminder buttons should describe the knowledge rediscovery state'
);
assert.doesNotMatch(
  panelJs,
  /reviewBtn\.textContent = inReview \? '复习中'/,
  'highlight list should not label queued items as actively reviewing'
);
assert.match(
  panelJs,
  /reviewBtn\.setAttribute\('aria-label', inReview \? '管理这条摘录的重温提醒' : '将这条摘录加入重温'\)/,
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
  /每次重温用三档反馈：不重要了、再提醒我、仍然有用/,
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

assert.match(html, /id="review-source"/, 'review view should expose source context');
assert.match(html, /id="review-saved-at"/, 'review view should expose saved-at context');
assert.match(html, /id="score-forgot">不重要了<\/button>/, 'low review feedback should use value wording');
assert.match(html, /id="score-fuzzy">再提醒我<\/button>/, 'middle review feedback should use reminder wording');
assert.match(html, /id="score-remembered">仍然有用 ✓<\/button>/, 'high review feedback should use usefulness wording');
assert.doesNotMatch(html, /暂时没用/, 'old low-score wording should be replaced');
assert.doesNotMatch(html, /再看看/, 'old medium-score wording should be replaced');
assert.doesNotMatch(html, />没记住<\/button>/, 'review buttons should not frame feedback as memory failure');
assert.doesNotMatch(html, />模糊<\/button>/, 'review buttons should not frame feedback as fuzzy recall');
assert.doesNotMatch(html, />记住了 ✓<\/button>/, 'review buttons should not frame feedback as memorized recall');
assert.match(panelJs, /<span class="label">仍然有用<\/span>/, 'review summary should use usefulness wording for high feedback');
assert.match(panelJs, /<span class="label">再提醒我<\/span>/, 'review summary should use reminder wording for middle feedback');
assert.match(panelJs, /<span class="label">不重要了<\/span>/, 'review summary should use value wording for low feedback');
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

assert.match(html, /id="workspace-tabs"/, 'panel should expose workspace tabs');
assert.match(html, /data-workspace="library"/, 'panel should include library workspace tab');
assert.match(html, /data-workspace="review"/, 'panel should include review workspace tab');
assert.match(html, /data-workspace="data"/, 'panel should include data asset workspace tab');
assert.match(html, /id="library-workspace"/, 'panel should include library workspace');
assert.match(html, /id="data-workspace"/, 'panel should include data asset workspace');
assert.match(panelJs, /setActiveWorkspace/, 'panel.js should manage active workspace switching');
assert.match(panelJs, /knowledge-card/, 'bookmark items should render as knowledge cards');
assert.match(panelJs, /highlight-preview/, 'highlight text should be rendered as excerpt preview');
assert.match(panelJs, /稍后重温/, 'review action should use knowledge asset wording');
assert.match(panelJs, /已加入重温/, 'active review state should use knowledge asset wording');
assert.match(panelJs, /今天该看/, 'due review state should use knowledge asset wording');
assert.doesNotMatch(panelJs, new RegExp('条想法 / 划线'), 'old idea/highlight wording should not be the primary card label');
assert.match(html, /数据资产/, 'data asset workspace should be visible in markup');
assert.match(html, /id="markdown-export-section"/, 'data workspace should include markdown export section');
assert.match(html, /id="git-sync-asset-section"/, 'data workspace should include git sync asset section');
assert.match(html, /id="backup-asset-section"/, 'data workspace should include backup section');
assert.match(html, /id="copy-markdown-btn"/, 'data workspace should support copying markdown');
assert.match(html, /同步到仓库/, 'git push wording should be user-facing');
assert.match(html, /从仓库恢复数据/, 'git pull wording should be user-facing');
assert.match(panelJs, /copyMarkdown/, 'panel should expose copy markdown action');
assert.match(panelJs, /navigator\.clipboard\.writeText/, 'copy markdown should use clipboard API');
assert.match(html, /主题显示/, 'settings should keep theme preference');
assert.match(html, /默认高亮颜色/, 'settings should keep highlight color preference');
assert.match(html, /按域名分组/, 'settings should keep domain grouping preference');
assert.match(html, /唤醒收藏/, 'settings should keep review preference');
assert.doesNotMatch(html, /<label class="settings-label">数据备份<\/label>/, 'backup should no longer be settings-only primary section');
assert.match(html, /id="preview-mode-notice"/, 'static previews should disclose their demo data');
assert.match(html, /预览数据/, 'static preview notice should be user-facing');
assert.match(panelJs, /function isExtensionRuntimeAvailable\(\)/, 'panel should detect whether Chrome extension APIs are available');
assert.match(panelJs, /function loadPreviewData\(\)/, 'panel should render demo data outside the extension runtime');
assert.match(panelJs, /if \(!isExtensionRuntimeAvailable\(\)\)/, 'panel should avoid extension API calls in static preview mode');
assert.match(panelCss, /\.sort-select\s*\{[^}]*appearance:\s*none/, 'sort control should use a custom compact appearance');
assert.match(panelCss, /\.empty-state\s*\{[^}]*border:\s*1px solid var\(--border\)/, 'empty state should read as a focused first-action panel');

console.log('panel structure tests passed');
