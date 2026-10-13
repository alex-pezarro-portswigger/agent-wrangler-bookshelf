import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isUtf8 } from 'node:buffer';

// Every file the bookshelf touches goes through this module (see the spec's "Security").

export const MAX_READ_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;

const MARKDOWN = new Set(['.md', '.markdown']);
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const MISSING = new Set(['ENOENT', 'ENOTDIR']);
const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;

export const isMarkdown = (p) => MARKDOWN.has(path.extname(p).toLowerCase());
export const isMissing = (err) => MISSING.has(err?.code);

export function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Lexical only: validates, expands `~` and resolves `..`. Does not touch the disk.
export function normalise(input) {
  if (typeof input !== 'string' || !input) throw new Error('A file path is required.');
  if (input.includes('\0')) throw new Error('A file path cannot contain NUL bytes.');
  const expanded = expandHome(input);
  if (!path.isAbsolute(expanded)) throw new Error(`The path must be absolute: ${input}`);
  return path.resolve(expanded);
}

export async function canonicalise(input) {
  return fsp.realpath(normalise(input));
}

// A stored path must still resolve to itself, so a symlink swapped in for the file or any parent
// since it was shelved is refused. Given the open descriptor's stat, it must also be that same file.
async function recheck(p, opened) {
  const changed = () => new Error('This file has changed since it was shelved (its path now resolves elsewhere).');
  if (await fsp.realpath(p) !== p) throw changed();
  if (!opened) return;
  const now = await fsp.stat(p);
  if (now.ino !== opened.ino || now.dev !== opened.dev) throw changed();
}

// For acting on a shelved path without reading it (reveal, open). Throws on any problem.
export async function checkShelvedFile(p) {
  await recheck(p);
  if (!(await fsp.stat(p)).isFile()) throw new Error('Not a regular file.');
}

export function classify(p, buf) {
  const ext = path.extname(p).toLowerCase();
  if (MARKDOWN.has(ext)) return { kind: 'markdown', text: buf.toString('utf8') };
  if (IMAGE_MIME[ext]) return { kind: 'image', mime: IMAGE_MIME[ext], base64: buf.toString('base64') };
  if (buf.length <= MAX_TEXT_BYTES && !buf.includes(0) && isUtf8(buf)) return { kind: 'text', text: buf.toString('utf8') };
  return { kind: 'other', mime: 'application/octet-stream', base64: buf.toString('base64') };
}

const tooLarge = (size) => ({ kind: 'too-large', size, message: `This file is over ${MAX_READ_BYTES / 1024 / 1024} MB, so it is not previewed.` });

// Never throws: file problems come back as a `missing`/`too-large`/`error` kind.
export async function readShelved(p) {
  let fh;
  try {
    fh = await fsp.open(p, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    const st = await fh.stat();
    if (!st.isFile()) return { kind: 'error', message: 'Not a regular file.' };
    await recheck(p, st);
    if (st.size > MAX_READ_BYTES) return tooLarge(st.size);
    const buf = Buffer.alloc(st.size);
    let n = 0;
    while (n < buf.length) {
      const { bytesRead } = await fh.read(buf, n, buf.length - n, null);
      if (!bytesRead) break;
      n += bytesRead;
    }
    return { size: n, ...classify(p, buf.subarray(0, n)) };
  } catch (err) {
    if (isMissing(err)) return { kind: 'missing', message: 'This file no longer exists.' };
    if (err.code === 'ELOOP') return { kind: 'error', message: 'This file has been replaced by a symlink since it was shelved.' };
    return { kind: 'error', message: err.message };
  } finally {
    await fh?.close();
  }
}
