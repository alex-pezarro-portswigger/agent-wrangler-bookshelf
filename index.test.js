import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import manifest, { dir } from './index.js';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

test('manifest and package.json agree on id and capabilities', () => {
  assert.equal(manifest.id, pkg.wranglerExtension.id);
  assert.deepEqual(manifest.requires, pkg.wranglerExtension.requires);
  assert.equal(manifest.dir, dir);
});

test('handlers cover the contract and the skill ships', () => {
  assert.deepEqual(manifest.handlers.map((h) => h.type).sort(), [
    'bookshelf-open', 'bookshelf-open-link', 'bookshelf-read', 'bookshelf-reveal', 'bookshelf-unshelve',
  ]);
  assert.deepEqual(manifest.tools.map((t) => t.name), ['shelve_file', 'unshelve_file', 'list_bookshelf']);
  for (const name of manifest.skills) assert.ok(fs.existsSync(`${dir}/skills/${name}/SKILL.md`));
});

test('onPurge forgets the session\'s shelf', () => {
  const forgotten = [];
  manifest.session.onPurge({ sessionId: 'CARD1', host: { stores: { bookshelf: { forget: (id) => forgotten.push(id) } } } });
  assert.deepEqual(forgotten, ['CARD1']);
});
