import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BookshelfStore, MAX_ENTRIES, MAX_SHELF_LENGTH, defaultFile } from './store.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-store-')), 'bookshelf.json');

test('add appends per card id; re-shelving moves shelf but keeps addedAt and position', () => {
  const store = new BookshelfStore(tmpFile());
  store.add('CARD1', '/a.md', 'Plans', 1);
  store.add('CARD1', '/b.md', 'Plans', 2);
  assert.deepEqual(store.add('CARD1', '/a.md', ' Specs ', 3), { path: '/a.md', shelf: 'Specs', addedAt: 1 });
  assert.deepEqual(store.list('CARD1'), [
    { path: '/a.md', shelf: 'Specs', addedAt: 1 },
    { path: '/b.md', shelf: 'Plans', addedAt: 2 },
  ]);
  assert.deepEqual(store.list('CARD2'), []);
  assert.equal(store.has('CARD1', '/a.md'), true);
  assert.equal(store.has('CARD2', '/a.md'), false);
});

test('add validates the session and shelf label', () => {
  const store = new BookshelfStore(tmpFile());
  assert.throws(() => store.add('', '/a.md', 'x'), /session/);
  assert.throws(() => store.add('CARD1', '/a.md', '  '), /empty/);
  assert.throws(() => store.add('CARD1', '/a.md', 'x'.repeat(MAX_SHELF_LENGTH + 1)), /too long/);
  assert.deepEqual(store.snapshot(), {});
});

test('add caps entries per session, but re-shelving at the cap still works', () => {
  const store = new BookshelfStore(tmpFile());
  for (let i = 0; i < MAX_ENTRIES; i++) store.add('CARD1', `/f${i}.md`, 'S');
  assert.throws(() => store.add('CARD1', '/one-more.md', 'S'), /full/);
  assert.equal(store.add('CARD1', '/f0.md', 'T').shelf, 'T');
  assert.equal(store.list('CARD1').length, MAX_ENTRIES);
});

test('remove and forget keep the map sparse', () => {
  const file = tmpFile();
  const store = new BookshelfStore(file);
  store.add('CARD1', '/a.md', 'S');
  store.add('CARD2', '/b.md', 'S');
  assert.equal(store.remove('CARD1', '/nope.md'), false);
  assert.equal(store.remove('CARD1', '/a.md'), true);
  store.forget('CARD2');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
});

test('persists across instances; snapshot and list are copies', () => {
  const file = tmpFile();
  new BookshelfStore(file).add('CARD1', '/a.md', 'Plans', 5);
  const store = new BookshelfStore(file);
  assert.deepEqual(store.snapshot(), { CARD1: [{ path: '/a.md', shelf: 'Plans', addedAt: 5 }] });
  store.snapshot().CARD1[0].shelf = 'tampered';
  store.list('CARD1').push({});
  assert.deepEqual(store.list('CARD1'), [{ path: '/a.md', shelf: 'Plans', addedAt: 5 }]);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('a corrupt file is moved aside and the store starts empty', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{not json');
  const store = new BookshelfStore(file);
  assert.deepEqual(store.snapshot(), {});
  assert.equal(fs.readFileSync(`${file}.corrupt`, 'utf8'), '{not json');
});

test('the default file is <AW_DATA_DIR>/bookshelf.json, tilde-expanded', () => {
  const before = process.env.AW_DATA_DIR;
  try {
    process.env.AW_DATA_DIR = '~/some-aw-dir';
    assert.equal(defaultFile(), path.join(os.homedir(), 'some-aw-dir', 'bookshelf.json'));
    delete process.env.AW_DATA_DIR;
    assert.equal(defaultFile(), path.join(os.homedir(), '.agent-wrangler', 'bookshelf.json'));
  } finally {
    if (before === undefined) delete process.env.AW_DATA_DIR;
    else process.env.AW_DATA_DIR = before;
  }
});
