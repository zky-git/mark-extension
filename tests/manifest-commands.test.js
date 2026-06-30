const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

assert.ok(manifest.commands, 'manifest should define keyboard commands');

assert.deepEqual(
  Object.keys(manifest.commands).sort(),
  ['save-selection-highlight', 'toggle-side-panel']
);

assert.equal(
  manifest.commands['toggle-side-panel'].suggested_key.default,
  'Alt+Shift+M'
);

assert.equal(
  manifest.commands['save-selection-highlight'].suggested_key.default,
  'Alt+Shift+H'
);

assert.equal(
  manifest.permissions.includes('commands'),
  false,
  'commands does not require a permissions entry'
);

console.log('manifest commands tests passed');
