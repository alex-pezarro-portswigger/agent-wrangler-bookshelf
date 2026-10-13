import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandFor, openWith } from './os-open.js';

const p = '/home/me/docs/plan.md';

test('macOS uses open -R to reveal and open to open', () => {
  assert.deepEqual(commandFor('reveal', p, 'darwin'), ['open', ['-R', p]]);
  assert.deepEqual(commandFor('open', p, 'darwin'), ['open', [p]]);
});

test('Windows uses explorer', () => {
  assert.deepEqual(commandFor('reveal', 'C:\\d\\plan.md', 'win32'), ['explorer', ['/select,C:\\d\\plan.md']]);
  assert.deepEqual(commandFor('open', 'C:\\d\\plan.md', 'win32'), ['explorer.exe', ['C:\\d\\plan.md']]);
});

test('Linux uses xdg-open on the folder to reveal, and on the file to open', () => {
  assert.deepEqual(commandFor('reveal', p, 'linux'), ['xdg-open', ['/home/me/docs']]);
  assert.deepEqual(commandFor('open', p, 'linux'), ['xdg-open', [p]]);
});

function stubs(reply) {
  const calls = { exec: [], run: [] };
  return {
    calls,
    exec: (cmd, args, cb) => { calls.exec.push([cmd, args]); cb(...reply); },
    run: (cmd) => calls.run.push(cmd),
  };
}

test('macOS open with asks osascript for an app, passing the name as an argument, then opens with it', () => {
  const s = stubs([null, '/Applications/Code.app/\n']);
  openWith('/d/"x" & y.md', { platform: 'darwin', ...s });
  const [cmd, args] = s.calls.exec[0];
  assert.equal(cmd, 'osascript');
  assert.deepEqual(args.slice(-2), ['--', '"x" & y.md']);
  assert.ok(args.slice(0, -2).every((a) => !a.includes('x.md') && !a.includes('& y')));
  assert.deepEqual(s.calls.run, [['open', ['-a', '/Applications/Code.app/', '/d/"x" & y.md']]]);
});

test('macOS open with does nothing when the chooser is cancelled', () => {
  const s = stubs([new Error('Command failed: osascript\nexecution error: User canceled. (-128)'), '']);
  openWith(p, { platform: 'darwin', ...s });
  assert.deepEqual(s.calls.run, []);
});

test('Windows open with shows the Open with dialog; Linux is unsupported', () => {
  const s = stubs([]);
  openWith('C:\\d\\plan.md', { platform: 'win32', ...s });
  assert.deepEqual(s.calls.run, [['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', 'C:\\d\\plan.md']]]);
  assert.deepEqual(s.calls.exec, []);
  assert.throws(() => openWith(p, { platform: 'linux', ...s }), /not supported/);
});
