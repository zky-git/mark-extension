const assert = require('node:assert/strict');
const fs = require('node:fs');

const contentJs = fs.readFileSync('content/content.js', 'utf8');

assert.doesNotMatch(
  contentJs,
  /marks\[0\]\.appendChild\(deleteBtn\)/,
  'delete button should not be attached to the first mark when a highlight spans multiple DOM text nodes'
);

assert.match(
  contentJs,
  /getDeleteButtonHost\(marks\)\.appendChild\(deleteBtn\)/,
  'delete button should be attached to the host mark that represents the end of the highlight'
);

assert.match(
  contentJs,
  /function getDeleteButtonHost\(marks\)\s*\{[\s\S]*return marks\[marks\.length - 1\]/,
  'delete button host should be the last mark so split highlights show the control at the selected text end'
);

assert.match(
  contentJs,
  /getDeleteButtonHost\(marks\)\.querySelector\('\.markbuddy-delete-btn'\)/,
  'delete button rebinding should look for the button on the same host mark used during creation'
);

assert.match(
  contentJs,
  /MAX_HIGHLIGHT_TEXT_LENGTH\s*=\s*800/,
  'content script should cap highlight text length to avoid accidental huge selections'
);

assert.match(
  contentJs,
  /MAX_HIGHLIGHT_TEXT_NODES\s*=\s*20/,
  'content script should cap highlighted text node count to avoid accidental cross-page selections'
);

assert.match(
  contentJs,
  /function getOversizedSelectionReason\(range,\s*serialized\)/,
  'content script should evaluate selected range quality before saving highlights'
);

assert.match(
  contentJs,
  /getTextNodesInRange\(range\)\.length/,
  'oversized selection guard should count DOM text nodes covered by the selection'
);

assert.match(
  contentJs,
  /const oversizedReason = getOversizedSelectionReason\(rangeToUse,\s*serialized\);[\s\S]*if \(oversizedReason\) \{[\s\S]*showToast\(oversizedReason\);[\s\S]*return;[\s\S]*\}[\s\S]*const highlightId/,
  'doSaveHighlight should stop before applying DOM highlights when the selected range is oversized'
);

assert.match(
  contentJs,
  /message\.type === 'MARKBUDDY_DATA_CHANGED'/,
  'content script should refresh from runtime messages when storage access is restricted to trusted contexts'
);

console.log('content highlight DOM tests passed');
