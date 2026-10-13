import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandFor } from './os-open.js';

const p = '/home/me/docs/plan.md';

test('macOS uses open -R to reveal and open [-a app] to open', () => {
  assert.deepEqual(commandFor('reveal', p, undefined, 'darwin'), ['open', ['-R', p]]);
  assert.deepEqual(commandFor('open', p, undefined, 'darwin'), ['open', [p]]);
  assert.deepEqual(commandFor('open', p, 'Visual Studio Code', 'darwin'), ['open', ['-a', 'Visual Studio Code', p]]);
});

test('Windows uses explorer, or the app itself', () => {
  assert.deepEqual(commandFor('reveal', 'C:\\d\\plan.md', undefined, 'win32'), ['explorer', ['/select,C:\\d\\plan.md']]);
  assert.deepEqual(commandFor('open', 'C:\\d\\plan.md', undefined, 'win32'), ['explorer.exe', ['C:\\d\\plan.md']]);
  assert.deepEqual(commandFor('open', 'C:\\d\\plan.md', 'C:\\code.exe', 'win32'), ['C:\\code.exe', ['C:\\d\\plan.md']]);
});

test('Linux uses xdg-open on the folder to reveal, and on the file or the app to open', () => {
  assert.deepEqual(commandFor('reveal', p, undefined, 'linux'), ['xdg-open', ['/home/me/docs']]);
  assert.deepEqual(commandFor('open', p, undefined, 'linux'), ['xdg-open', [p]]);
  assert.deepEqual(commandFor('open', p, '/usr/bin/code', 'linux'), ['/usr/bin/code', [p]]);
});
