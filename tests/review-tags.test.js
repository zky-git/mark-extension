const assert = require('node:assert/strict');
const {
  normalizeReviewTag,
  toggleReviewTag,
  hasReviewTag,
} = require('../side-panel/review-tags.js');

assert.equal(normalizeReviewTag(' 学习 '), '学习');
assert.equal(normalizeReviewTag(''), '学习');

assert.deepEqual(toggleReviewTag(['技术'], '学习'), ['技术', '学习']);
assert.deepEqual(toggleReviewTag(['技术', '学习'], '学习'), ['技术']);
assert.deepEqual(toggleReviewTag(['学习', '学习'], '学习'), []);

assert.equal(hasReviewTag(['技术', '学习'], '学习'), true);
assert.equal(hasReviewTag(['技术'], '学习'), false);

console.log('review-tags tests passed');
