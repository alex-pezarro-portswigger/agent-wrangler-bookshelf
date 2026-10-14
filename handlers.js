import fsp from 'node:fs/promises';
import { normalise, isMarkdown, isMissing, readShelved, readShelvedImage, checkShelvedFile } from './safe-file.js';
import { commandFor, runDetached, openWith } from './os-open.js';

export const OPENED_SHELF = 'Opened';

// Shelf membership is the allowlist: the browser can only act on paths already on that session's shelf.
function shelvedPath(msg, host) {
  const p = normalise(msg.path);
  if (!host.stores.bookshelf.has(msg.sessionId, p)) throw new Error('That file is not on this session\'s bookshelf.');
  return p;
}

async function replyFile(msg, host, p, file) {
  host.broadcast({ event: 'file', requestId: msg.requestId, sessionId: msg.sessionId, path: p, ...(file || await readShelved(p)) });
}

export function bookshelfHandlers(run = runDetached, choose = openWith) {
  return [
    {
      type: 'bookshelf-read',
      async handler(msg, host) {
        await replyFile(msg, host, shelvedPath(msg, host));
      },
    },
    {
      // An image referenced inside a shelved markdown file, resolved and served for its preview.
      // `msg.path` is the shelved document; safe-file keeps the read to images in its own folder.
      type: 'bookshelf-asset',
      async handler(msg, host) {
        const md = shelvedPath(msg, host);
        const reply = await readShelvedImage(md, msg.ref);
        host.broadcast({ event: 'file', requestId: msg.requestId, sessionId: msg.sessionId, path: md, ref: msg.ref, ...reply });
      },
    },
    {
      // The only browser-side way onto the shelf, limited to what core links in chat: markdown.
      type: 'bookshelf-open-link',
      async handler(msg, host) {
        if (typeof msg.sessionId !== 'string' || !msg.sessionId) throw new Error('A session is required.');
        const requested = normalise(msg.path);
        let p;
        try {
          p = await fsp.realpath(requested);
        } catch (err) {
          if (!isMissing(err)) throw err;
          return replyFile(msg, host, requested, { kind: 'missing', message: 'This file does not exist.' });
        }
        if (!isMarkdown(p)) throw new Error('Only markdown files can be opened on the bookshelf from a link.');
        if (!(await fsp.stat(p)).isFile()) throw new Error('Not a regular file.');
        if (!host.stores.bookshelf.has(msg.sessionId, p)) {
          host.stores.bookshelf.add(msg.sessionId, p, OPENED_SHELF);
          await host.rebuild();
        }
        await replyFile(msg, host, p);
      },
    },
    {
      type: 'bookshelf-reveal',
      async handler(msg, host) {
        const p = shelvedPath(msg, host);
        await checkShelvedFile(p);
        run(commandFor('reveal', p));
      },
    },
    {
      type: 'bookshelf-open',
      async handler(msg, host) {
        const p = shelvedPath(msg, host);
        await checkShelvedFile(p);
        if (msg.chooser) choose(p); else run(commandFor('open', p));
      },
    },
    {
      type: 'bookshelf-unshelve',
      async handler(msg, host) {
        host.stores.bookshelf.remove(msg.sessionId, shelvedPath(msg, host));
        await host.rebuild();
      },
    },
  ];
}
