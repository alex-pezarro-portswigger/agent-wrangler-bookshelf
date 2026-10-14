import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bookshelfHandlers, OPENED_SHELF } from './handlers.js';
import { commandFor } from './os-open.js';
import { BookshelfStore } from './store.js';

function setup() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-handlers-')));
  const runs = [];
  const handlers = Object.fromEntries(bookshelfHandlers((cmd) => runs.push(cmd), (p) => runs.push(['chooser', p])).map((h) => [h.type, h.handler]));
  const host = {
    stores: { bookshelf: new BookshelfStore(path.join(dir, 'bookshelf.json')) },
    rebuilds: 0,
    broadcasts: [],
    async rebuild() { this.rebuilds++; },
    broadcast(obj) { this.broadcasts.push(obj); },
  };
  const send = (type, msg) => handlers[`bookshelf-${type}`]({ type: `bookshelf-${type}`, sessionId: 'CARD1', ...msg }, host);
  const file = (name, body = '# hi') => {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    return p;
  };
  return { dir, host, runs, send, file };
}

test('read replies by broadcast with the file and the request id', async () => {
  const { host, send, file } = setup();
  const p = file('plan.md');
  host.stores.bookshelf.add('CARD1', p, 'Plans');
  await send('read', { path: p, requestId: 'r1' });
  assert.deepEqual(host.broadcasts, [{ event: 'file', requestId: 'r1', sessionId: 'CARD1', path: p, size: 4, kind: 'markdown', text: '# hi' }]);
});

test('read replies missing for a shelved file that has been deleted', async () => {
  const { host, send, file } = setup();
  const p = file('plan.md');
  host.stores.bookshelf.add('CARD1', p, 'Plans');
  fs.rmSync(p);
  await send('read', { path: p, requestId: 'r1' });
  assert.equal(host.broadcasts[0].kind, 'missing');
});

test('read/reveal/open/unshelve refuse any path not on that session\'s shelf', async () => {
  const { dir, host, runs, send, file } = setup();
  const shelved = file('docs/plan.md');
  const other = file('secret.txt', 'secret');
  host.stores.bookshelf.add('CARD1', shelved, 'Plans');
  host.stores.bookshelf.add('CARD2', other, 'Theirs');
  const bad = [
    other,
    path.join(dir, 'docs/../secret.txt'),
    `${shelved}/../../secret.txt`,
    '~/secret.txt',
    'docs/plan.md',
    `${shelved}\0`,
    42,
    undefined,
  ];
  for (const type of ['read', 'reveal', 'open', 'unshelve']) {
    for (const p of bad) {
      await assert.rejects(send(type, { path: p, requestId: 'r' }), undefined, `${type} ${String(p)}`);
      await assert.rejects(send(type, { path: p, chooser: true }), undefined, `${type} chooser ${String(p)}`);
    }
    await assert.rejects(send(type, { path: shelved, sessionId: 'NOSUCH', chooser: true }), /not on this session/);
  }
  assert.deepEqual(host.broadcasts, []);
  assert.deepEqual(runs, []);
  assert.equal(host.stores.bookshelf.list('CARD1').length, 1);
});

test('reveal and open refuse a shelved file swapped for a symlink', async () => {
  const { host, runs, send, file } = setup();
  const p = file('plan.md');
  const secret = file('secret.md', 'secret');
  host.stores.bookshelf.add('CARD1', p, 'Plans');
  fs.rmSync(p);
  fs.symlinkSync(secret, p);
  await assert.rejects(send('reveal', { path: p }), /changed/);
  await assert.rejects(send('open', { path: p }), /changed/);
  await assert.rejects(send('open', { path: p, chooser: true }), /changed/);
  await send('read', { path: p, requestId: 'r' });
  assert.equal(host.broadcasts[0].kind, 'error');
  assert.deepEqual(runs, []);
});

test('reveal, open and open with run the platform command or chooser without a shell', async () => {
  const { host, runs, send, file } = setup();
  const p = file('plan.md');
  host.stores.bookshelf.add('CARD1', p, 'Plans');
  await send('reveal', { path: p });
  await send('open', { path: p });
  await send('open', { path: p, chooser: true });
  assert.deepEqual(runs, [commandFor('reveal', p), commandFor('open', p), ['chooser', p]]);
});

test('unshelve removes and rebuilds', async () => {
  const { host, send, file } = setup();
  const p = file('plan.md');
  host.stores.bookshelf.add('CARD1', p, 'Plans');
  await send('unshelve', { path: p });
  assert.deepEqual(host.stores.bookshelf.list('CARD1'), []);
  assert.equal(host.rebuilds, 1);
});

test('open-link canonicalises, shelves under Opened and replies as read', async () => {
  const { dir, host, send, file } = setup();
  const p = file('docs/notes.md');
  fs.symlinkSync(path.join(dir, 'docs'), path.join(dir, 'alias'));
  await send('open-link', { path: path.join(dir, 'alias/../alias/notes.md'), requestId: 'r1' });
  assert.deepEqual(host.stores.bookshelf.list('CARD1').map((e) => [e.path, e.shelf]), [[p, OPENED_SHELF]]);
  assert.equal(host.rebuilds, 1);
  assert.deepEqual(host.broadcasts, [{ event: 'file', requestId: 'r1', sessionId: 'CARD1', path: p, size: 4, kind: 'markdown', text: '# hi' }]);
});

test('open-link leaves an already-shelved file on its shelf', async () => {
  const { host, send, file } = setup();
  const p = file('plan.md');
  host.stores.bookshelf.add('CARD1', p, 'Plans');
  await send('open-link', { path: p, requestId: 'r1' });
  assert.equal(host.stores.bookshelf.list('CARD1')[0].shelf, 'Plans');
  assert.equal(host.rebuilds, 0);
  assert.equal(host.broadcasts[0].kind, 'markdown');
});

test('open-link replies missing for a file that does not exist, shelving nothing', async () => {
  const { dir, host, send } = setup();
  await send('open-link', { path: path.join(dir, 'gone.md'), requestId: 'r1' });
  assert.deepEqual(host.broadcasts, [{ event: 'file', requestId: 'r1', sessionId: 'CARD1', path: path.join(dir, 'gone.md'), kind: 'missing', message: 'This file does not exist.' }]);
  assert.deepEqual(host.stores.bookshelf.snapshot(), {});
});

test('open-link only accepts existing markdown regular files', async () => {
  const { dir, host, send, file } = setup();
  const secret = file('secret.txt', 'secret');
  const image = file('shots/ui.png', Buffer.from([1, 2, 3]));
  fs.symlinkSync(secret, path.join(dir, 'looks-like.md'));
  fs.mkdirSync(path.join(dir, 'folder.md'));
  for (const p of [secret, image, path.join(dir, 'looks-like.md'), path.join(dir, 'folder.md'), 'rel.md', `${dir}/a\0.md`, null]) {
    await assert.rejects(send('open-link', { path: p, requestId: 'r' }), undefined, String(p));
  }
  await assert.rejects(send('open-link', { path: file('ok.md'), sessionId: undefined }), /session/);
  assert.deepEqual(host.stores.bookshelf.snapshot(), {});
  assert.deepEqual(host.broadcasts, []);
});

test('asset serves an image beside a shelved markdown file', async () => {
  const { host, send, file } = setup();
  const md = file('report.md');
  file('shot.png', Buffer.from([1, 2, 3]));
  host.stores.bookshelf.add('CARD1', md, 'Reports');
  await send('asset', { path: md, ref: 'shot.png', requestId: 'r1' });
  assert.deepEqual(host.broadcasts, [{
    event: 'file', requestId: 'r1', sessionId: 'CARD1', path: md, ref: 'shot.png',
    size: 3, kind: 'image', mime: 'image/png', base64: 'AQID',
  }]);
});

test('asset refuses a reference out of the folder, and when the document is not shelved', async () => {
  const { dir, host, send, file } = setup();
  const md = file('docs/report.md');
  file('secret.png', Buffer.from([9]));
  host.stores.bookshelf.add('CARD1', md, 'Reports');
  await send('asset', { path: md, ref: '../secret.png', requestId: 'r1' });
  assert.equal(host.broadcasts[0].kind, 'error');
  assert.match(host.broadcasts[0].message, /outside/i);
  await assert.rejects(send('asset', { path: path.join(dir, 'unshelved.md'), ref: 'shot.png' }), /not on this session/);
});
