import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  normalise, canonicalise, readShelved, checkShelvedFile, classify, MAX_READ_BYTES, MAX_TEXT_BYTES,
} from './safe-file.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-safe-')));

test('normalise refuses non-strings, empty, NUL, relative and ~user paths', () => {
  for (const bad of [undefined, null, 42, {}, ['/a'], '', 'a/b.md', './a.md', '../a.md', '~root/a.md', '/a\0.md']) {
    assert.throws(() => normalise(bad), undefined, JSON.stringify(bad));
  }
});

test('normalise expands ~ and resolves ..', () => {
  assert.equal(normalise('~'), os.homedir());
  assert.equal(normalise('~/notes/a.md'), path.join(os.homedir(), 'notes/a.md'));
  assert.equal(normalise('/a/b/../../etc/x.md'), '/etc/x.md');
});

test('canonicalise resolves symlinks and .. to the real path', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'real'));
  fs.writeFileSync(path.join(d, 'real/a.md'), '# a');
  fs.symlinkSync(path.join(d, 'real'), path.join(d, 'link'));
  assert.equal(await canonicalise(path.join(d, 'link/../link/a.md')), path.join(d, 'real/a.md'));
  await assert.rejects(canonicalise(path.join(d, 'nope.md')), { code: 'ENOENT' });
});

test('readShelved reads each kind', async () => {
  const d = tmp();
  const write = (name, body) => { fs.writeFileSync(path.join(d, name), body); return path.join(d, name); };
  assert.deepEqual(await readShelved(write('a.md', '# hi')), { size: 4, kind: 'markdown', text: '# hi' });
  assert.deepEqual(await readShelved(write('a.txt', 'plain')), { size: 5, kind: 'text', text: 'plain' });
  const png = await readShelved(write('a.png', Buffer.from([1, 2, 3])));
  assert.deepEqual(png, { size: 3, kind: 'image', mime: 'image/png', base64: 'AQID' });
  const bin = await readShelved(write('a.bin', Buffer.from([0, 1, 2])));
  assert.equal(bin.kind, 'other');
  assert.equal(bin.mime, 'application/octet-stream');
});

test('classify: text needs valid UTF-8, no NUL and at most 1 MB', () => {
  assert.equal(classify('/a.txt', Buffer.from([0xff, 0xfe])).kind, 'other');
  assert.equal(classify('/a.txt', Buffer.from('a\0b')).kind, 'other');
  assert.equal(classify('/a.txt', Buffer.alloc(MAX_TEXT_BYTES + 1, 'a')).kind, 'other');
  assert.equal(classify('/a.log', Buffer.alloc(MAX_TEXT_BYTES, 'a')).kind, 'text');
  assert.equal(classify('/A.MARKDOWN', Buffer.from('x')).kind, 'markdown');
  assert.equal(classify('/a.svg', Buffer.from('<svg/>')).mime, 'image/svg+xml');
});

test('readShelved: missing file is missing, over-size is too-large', async () => {
  const d = tmp();
  assert.equal((await readShelved(path.join(d, 'gone.md'))).kind, 'missing');
  const big = path.join(d, 'big.bin');
  fs.writeFileSync(big, '');
  fs.truncateSync(big, MAX_READ_BYTES + 1);
  const out = await readShelved(big);
  assert.equal(out.kind, 'too-large');
  assert.equal(out.size, MAX_READ_BYTES + 1);
  assert.equal(out.base64, undefined);
});

test('readShelved refuses a directory and a FIFO without hanging', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'dir.md'));
  assert.equal((await readShelved(path.join(d, 'dir.md'))).kind, 'error');
  execFileSync('mkfifo', [path.join(d, 'pipe.md')]);
  assert.equal((await readShelved(path.join(d, 'pipe.md'))).kind, 'error');
  await assert.rejects(checkShelvedFile(path.join(d, 'pipe.md')), /regular file/);
});

test('a file swapped for a symlink after shelving is refused', async () => {
  const d = tmp();
  const shelved = path.join(d, 'plan.md');
  fs.writeFileSync(shelved, '# plan');
  fs.writeFileSync(path.join(d, 'secret.md'), 'secret');
  fs.rmSync(shelved);
  fs.symlinkSync(path.join(d, 'secret.md'), shelved);
  const out = await readShelved(shelved);
  assert.equal(out.kind, 'error');
  assert.equal(out.text, undefined);
  await assert.rejects(checkShelvedFile(shelved), /changed/);
});

test('a parent directory swapped for a symlink after shelving is refused', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'docs'));
  fs.mkdirSync(path.join(d, 'elsewhere'));
  const shelved = path.join(d, 'docs/plan.md');
  fs.writeFileSync(shelved, '# plan');
  fs.writeFileSync(path.join(d, 'elsewhere/plan.md'), 'secret');
  fs.renameSync(path.join(d, 'docs'), path.join(d, 'docs-old'));
  fs.symlinkSync(path.join(d, 'elsewhere'), path.join(d, 'docs'));
  const out = await readShelved(shelved);
  assert.equal(out.kind, 'error');
  assert.match(out.message, /changed/);
  await assert.rejects(checkShelvedFile(shelved), /changed/);
});
