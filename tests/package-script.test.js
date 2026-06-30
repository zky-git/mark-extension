const assert = require('node:assert/strict');
const fs = require('node:fs');

const script = fs.readFileSync('package-extension.sh', 'utf8');

[
  '"tests/*"',
  '"agent.md"',
  '"docs/superpowers/*"',
].forEach(pattern => {
  assert.match(script, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `package script should exclude ${pattern}`);
});

console.log('package script tests passed');
