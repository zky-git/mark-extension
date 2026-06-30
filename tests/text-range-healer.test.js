const assert = require('node:assert/strict');
const {
  normalizeSearchText,
  findRecoveredOffsets,
} = require('../content/text-range-healer.js');

assert.equal(normalizeSearchText('  MarkBuddy\n\t高亮  '), 'MarkBuddy 高亮');

const shifted = findRecoveredOffsets(
  '前缀文本：MarkBuddy 可以找回原文位置，并继续高亮。',
  {
    text: 'MarkBuddy 可以找回原文位置',
    startOffset: 0,
    endOffset: 18,
  }
);

assert.deepEqual(shifted, {
  startOffset: 5,
  endOffset: 23,
  confidence: 1,
});

const nearExpected = findRecoveredOffsets(
  '第一段 MarkBuddy 可以找回原文位置。第二段 MarkBuddy 可以找回原文位置。',
  {
    text: 'MarkBuddy 可以找回原文位置',
    startOffset: 22,
    endOffset: 40,
  }
);

assert.deepEqual(nearExpected, {
  startOffset: 27,
  endOffset: 45,
  confidence: 1,
});

assert.equal(
  findRecoveredOffsets('完全不相关的文本', { text: 'MarkBuddy 可以找回原文位置', startOffset: 0, endOffset: 18 }),
  null
);

console.log('text-range-healer tests passed');
