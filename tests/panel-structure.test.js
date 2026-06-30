const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('side-panel/panel.html', 'utf8');
const panelJs = fs.readFileSync('side-panel/panel.js', 'utf8');

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
  'settings-panel',
].forEach(assertContains);

const scriptOrder = [
  'export-markdown.js',
  'review-tags.js',
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
