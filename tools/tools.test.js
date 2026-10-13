import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shelveFileTool } from './shelve-file.js';
import { unshelveFileTool } from './unshelve-file.js';
import { BookshelfStore, MAX_ENTRIES } from '../store.js';

function setup() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-tools-')));
  const host = {
    stores: { bookshelf: new BookshelfStore(path.join(dir, 'bookshelf.json')) },
    rebuilds: 0,
    async rebuild() { this.rebuilds++; },
  };
  const file = (name) => {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
    return p;
  };
  return { dir, host, file };
}

const call = (tool, host, args, caller = 'CARD1') => tool.handler({ host, caller }, args);

test('neither tool takes a session parameter', () => {
  for (const tool of [shelveFileTool, unshelveFileTool]) {
    for (const key of Object.keys(tool.inputSchema)) assert.ok(!/session|card/i.test(key), `${tool.name}.${key}`);
  }
});

test('shelve_file shelves the canonical path on the caller\'s own shelf, defaulting to the parent folder', async () => {
  const { dir, host, file } = setup();
  const p = file('plans/v1.md');
  fs.symlinkSync(path.join(dir, 'plans'), path.join(dir, 'alias'));
  const out = await call(shelveFileTool, host, { path: path.join(dir, 'alias/./v1.md'), session: 'CARD2' });
  assert.deepEqual(out.structuredContent, { path: p, shelf: 'plans' });
  assert.deepEqual(host.stores.bookshelf.list('CARD1').map((e) => [e.path, e.shelf]), [[p, 'plans']]);
  assert.deepEqual(host.stores.bookshelf.list('CARD2'), []);
  assert.equal(host.rebuilds, 1);
  assert.equal((await call(shelveFileTool, host, { path: p, shelf: '  Plans ' })).structuredContent.shelf, 'Plans');
});

test('shelve_file refuses missing, relative, non-regular and identity-less input', async () => {
  const { dir, host } = setup();
  fs.mkdirSync(path.join(dir, 'folder'));
  for (const args of [{ path: path.join(dir, 'gone.md') }, { path: 'rel.md' }, { path: path.join(dir, 'folder') }, { path: `${dir}/a\0` }, {}]) {
    const out = await call(shelveFileTool, host, args);
    assert.equal(out.isError, true, JSON.stringify(args));
  }
  assert.equal((await call(shelveFileTool, host, { path: dir }, null)).isError, true);
  assert.deepEqual(host.stores.bookshelf.snapshot(), {});
  assert.equal(host.rebuilds, 0);
});

test('shelve_file surfaces the store cap as a tool error', async () => {
  const { host, file } = setup();
  for (let i = 0; i < MAX_ENTRIES; i++) host.stores.bookshelf.add('CARD1', `/f${i}`, 'S');
  const out = await call(shelveFileTool, host, { path: file('a.md') });
  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /full/);
});

test('unshelve_file removes by canonical path, and by the given path once the file is gone', async () => {
  const { dir, host, file } = setup();
  const a = file('docs/a.md');
  const b = file('docs/b.md');
  fs.symlinkSync(path.join(dir, 'docs'), path.join(dir, 'alias'));
  await call(shelveFileTool, host, { path: a });
  await call(shelveFileTool, host, { path: b });
  assert.equal((await call(unshelveFileTool, host, { path: path.join(dir, 'alias/a.md') })).structuredContent.removed, true);
  fs.rmSync(b);
  assert.equal((await call(unshelveFileTool, host, { path: b })).structuredContent.removed, true);
  assert.deepEqual(host.stores.bookshelf.snapshot(), {});
  assert.equal((await call(unshelveFileTool, host, { path: a })).isError, true);
  assert.equal((await call(unshelveFileTool, host, { path: 'rel.md' })).isError, true);
  assert.equal((await call(unshelveFileTool, host, { path: a }, null)).isError, true);
});
