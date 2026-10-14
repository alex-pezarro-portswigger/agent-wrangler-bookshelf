import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  normalise, canonicalise, readShelved, readShelvedImage, checkShelvedFile, classify,
  isImage, MAX_READ_BYTES, MAX_TEXT_BYTES,
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

test('isImage matches image extensions case-insensitively', () => {
  for (const p of ['/a.png', '/a.JPG', '/a.jpeg', '/a.gif', '/a.webp', '/a.SVG']) assert.ok(isImage(p), p);
  for (const p of ['/a.md', '/a.txt', '/a.pdf', '/a']) assert.equal(isImage(p), false, p);
});

test('readShelvedImage serves an image beside or under the document', async () => {
  const d = tmp();
  const md = path.join(d, 'report.md');
  fs.writeFileSync(md, '# r');
  fs.writeFileSync(path.join(d, 'shot.png'), Buffer.from([1, 2, 3]));
  fs.mkdirSync(path.join(d, 'images'));
  fs.writeFileSync(path.join(d, 'images/deep.png'), Buffer.from([4, 5]));
  // relative beside, relative under, and an absolute path inside the folder all resolve.
  assert.deepEqual(await readShelvedImage(md, 'shot.png'), { size: 3, kind: 'image', mime: 'image/png', base64: 'AQID' });
  assert.equal((await readShelvedImage(md, 'images/deep.png')).kind, 'image');
  assert.equal((await readShelvedImage(md, './shot.png')).kind, 'image');
  assert.equal((await readShelvedImage(md, path.join(d, 'shot.png'))).kind, 'image');
  assert.equal((await readShelvedImage(md, `file://${path.join(d, 'shot.png')}`)).kind, 'image');
});

test('readShelvedImage refuses escapes, non-images and bad refs', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'docs'));
  const md = path.join(d, 'docs/report.md');
  fs.writeFileSync(md, '# r');
  fs.writeFileSync(path.join(d, 'secret.png'), Buffer.from([9]));
  fs.writeFileSync(path.join(d, 'docs/note.txt'), 'x');
  fs.writeFileSync(path.join(d, 'docs/plan.md'), '# p');
  // climbing out of the document folder, even to an image, is refused.
  assert.match((await readShelvedImage(md, '../secret.png')).message, /outside/i);
  assert.match((await readShelvedImage(md, path.join(d, 'secret.png'))).message, /outside/i);
  assert.match((await readShelvedImage(md, '~/secret.png')).message, /outside|no longer/i);
  // a file in the folder that is not an image is refused before it is read.
  assert.match((await readShelvedImage(md, 'note.txt')).message, /image/i);
  assert.match((await readShelvedImage(md, 'plan.md')).message, /image/i);
  // bad refs.
  for (const bad of ['', '  ', undefined, 42, 'a\0b.png']) {
    assert.equal((await readShelvedImage(md, bad)).kind, 'error', JSON.stringify(bad));
  }
  assert.equal((await readShelvedImage(md, 'gone.png')).kind, 'missing');
});

test('readShelvedImage refuses a symlink that points out of the document folder', async () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'docs'));
  const md = path.join(d, 'docs/report.md');
  fs.writeFileSync(md, '# r');
  fs.writeFileSync(path.join(d, 'outside.png'), Buffer.from([7]));
  fs.symlinkSync(path.join(d, 'outside.png'), path.join(d, 'docs/link.png'));
  assert.match((await readShelvedImage(md, 'link.png')).message, /outside/i);
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
