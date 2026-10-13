import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandHome } from './safe-file.js';

export const MAX_ENTRIES = 200;
export const MAX_SHELF_LENGTH = 60;

export function defaultFile() {
  const dataDir = process.env.AW_DATA_DIR ? expandHome(process.env.AW_DATA_DIR) : path.join(os.homedir(), '.agent-wrangler');
  return path.join(dataDir, 'bookshelf.json');
}

// Per-session shelves keyed on the card id. Mutators are synchronous so the agent (MCP) and the
// human (control WS) can't interleave a read and its write. Paths are stored canonical; callers
// canonicalise before adding.
//
// On disk: { "<cardId>": [{ path, shelf, addedAt }] }
export class BookshelfStore {
  constructor(file = defaultFile()) {
    this.file = file;
    this.entries = new Map();
    this._load();
  }

  _load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return;
    }
    if (!raw.trim()) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      fs.renameSync(this.file, `${this.file}.corrupt`);
      console.error(`[bookshelf] ${this.file} is corrupt (${err.message}); moved it to ${this.file}.corrupt and starting empty.`);
      return;
    }
    for (const [sid, list] of Object.entries(data || {})) {
      if (!Array.isArray(list)) continue;
      this.entries.set(sid, list
        .filter((e) => typeof e?.path === 'string' && typeof e?.shelf === 'string')
        .map((e) => ({ path: e.path, shelf: e.shelf, addedAt: e.addedAt ?? null })));
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries), null, 2));
    fs.renameSync(tmp, this.file);
  }

  snapshot() {
    return Object.fromEntries([...this.entries].map(([sid, list]) => [sid, this.list(sid)]));
  }

  list(sessionId) {
    return (this.entries.get(sessionId) || []).map((e) => ({ ...e }));
  }

  has(sessionId, p) {
    return Boolean(this.entries.get(sessionId)?.some((e) => e.path === p));
  }

  // Re-shelving a path moves it to the new shelf but keeps its addedAt and position.
  add(sessionId, p, shelf, addedAt = Date.now()) {
    if (!sessionId) throw new Error('A session is required.');
    const label = String(shelf ?? '').trim();
    if (!label) throw new Error('The shelf label cannot be empty.');
    if (label.length > MAX_SHELF_LENGTH) throw new Error(`The shelf label is too long (max ${MAX_SHELF_LENGTH} characters).`);
    const list = this.entries.get(sessionId) || [];
    const existing = list.find((e) => e.path === p);
    if (existing) {
      existing.shelf = label;
    } else {
      if (list.length >= MAX_ENTRIES) {
        throw new Error(`This session's bookshelf is full (max ${MAX_ENTRIES} files); unshelve some first.`);
      }
      list.push({ path: p, shelf: label, addedAt });
      this.entries.set(sessionId, list);
    }
    this._save();
    return { ...(existing || list.at(-1)) };
  }

  remove(sessionId, p) {
    const list = this.entries.get(sessionId);
    const i = list ? list.findIndex((e) => e.path === p) : -1;
    if (i < 0) return false;
    list.splice(i, 1);
    if (!list.length) this.entries.delete(sessionId);
    this._save();
    return true;
  }

  forget(sessionId) {
    if (this.entries.delete(sessionId)) this._save();
  }
}
