const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('side-panel/panel.html', 'utf8');
const panelJs = fs.readFileSync('side-panel/panel.js', 'utf8');
const panelCss = fs.readFileSync('side-panel/panel.css', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');

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
assert.match(html, /id="review-start-btn">开始复习<\/button>/, 'review banner button should clearly say 开始复习');

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
assert.match(panelJs, /function showPanelNotice\(message, tone = 'danger'\)/, 'panel.js should expose a reusable panel notice for navigation failures');
assert.match(panelJs, /notice\.id = 'panel-notice'/, 'panel.js should render an in-panel notice when needed');
assert.match(panelJs, /function openBookmarkUrl\(url\)/, 'panel.js should open bookmark URLs through a failure-aware helper');
assert.match(panelJs, /无法打开网页，请检查链接是否有效。/, 'panel.js should show a clear message when a saved page cannot be opened');
assert.match(panelJs, /title\.addEventListener\('click'[\s\S]*?e\.preventDefault\(\)[\s\S]*?openBookmarkUrl\(bm\.url\)/, 'bookmark title clicks should use the failure-aware opener instead of default anchor navigation');
assert.doesNotMatch(panelJs, /if \(!due \|\| due\.length === 0\) return;/, 'review start should not fail silently when there are no due reviews');
assert.match(panelJs, /showPanelNotice\('暂无待复习内容。', 'success'\)/, 'review start should explain when there is nothing to review');
assert.match(
  panelJs,
  /reviewBtn\.textContent = inReview \? '移出复习' : '加入复习'/,
  'inactive highlight review buttons should clearly say 加入复习'
);
assert.doesNotMatch(
  panelJs,
  /reviewBtn\.textContent = inReview \? '复习中'/,
  'highlight list should not label queued items as actively reviewing'
);
assert.match(
  panelJs,
  /reviewBtn\.setAttribute\('aria-label', inReview \? '移出复习队列' : '加入复习队列'\)/,
  'compact highlight review buttons should keep an accessible action label'
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
  /开启后可将划线加入间隔复习；关闭后列表隐藏复习按钮/,
  'review settings should explain what the switch controls'
);
assert.match(
  html,
  /<span class="settings-row-label">[\s\S]*?划线复习[\s\S]*?info-tooltip-wrap/,
  'review settings should show an info tooltip beside the label'
);
assert.match(
  html,
  /SM-2 复习策略/,
  'review tooltip should describe the SM-2 strategy'
);
assert.match(
  html,
  /三档反馈/,
  'review tooltip should mention the three review feedback choices'
);
assert.match(
  html,
  /动态调整下一次复习时间/,
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
  /已有划线处于复习中，请先移出复习队列后再关闭。/,
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
