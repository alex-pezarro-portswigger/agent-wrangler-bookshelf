import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { canonicalise, isMissing } from '../safe-file.js';
import { MAX_SHELF_LENGTH } from '../store.js';

// Caller-resolved: there is no session parameter, so an agent can only fill its own shelf.
export const shelveFileTool = {
  name: 'shelve_file',
  description:
    'Put a file on your own session\'s bookshelf, the panel of files the human sees beside your '
    + 'chat on the Agent Wrangler board. Use it for plans, specs, reports and other files the human '
    + 'should read; see the `bookshelf` skill. Shelving a file that is already there just moves it '
    + 'to the given shelf. There is no session parameter.',
  inputSchema: {
    path: z.string().min(1).describe('Absolute path (or ~/...) to an existing regular file.'),
    shelf: z.string().max(MAX_SHELF_LENGTH).optional()
      .describe('A label for the group it belongs in, e.g. "Plans", "Reports", "Scratchpad". Defaults to the parent folder\'s name.'),
  },
  async handler({ host, caller }, args = {}) {
    if (caller == null) return errorResult('This request carried no session identity, so there is no bookshelf to add to.');
    let p;
    try {
      p = await canonicalise(args.path);
      if (!(await fsp.stat(p)).isFile()) return errorResult(`Not a regular file: ${args.path}`);
    } catch (err) {
      return errorResult(isMissing(err) ? `No such file: ${args.path}` : err.message);
    }
    let entry;
    try {
      const shelf = args.shelf?.trim() || path.basename(path.dirname(p)).slice(0, MAX_SHELF_LENGTH) || 'Files';
      entry = host.stores.bookshelf.add(caller, p, shelf);
    } catch (err) {
      return errorResult(err.message);
    }
    await host.rebuild();
    const structuredContent = { path: entry.path, shelf: entry.shelf };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  },
};

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}
