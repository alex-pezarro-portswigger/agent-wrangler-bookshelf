import fsp from 'node:fs/promises';
import { z } from 'zod';
import { normalise } from '../safe-file.js';

export const unshelveFileTool = {
  name: 'unshelve_file',
  description:
    'Take a file off your own session\'s bookshelf, e.g. one you deleted or superseded. The file '
    + 'itself is not touched. There is no session parameter.',
  inputSchema: {
    path: z.string().min(1).describe('The path you shelved (absolute or ~/...).'),
  },
  async handler({ host, caller }, args = {}) {
    if (caller == null) return errorResult('This request carried no session identity, so there is no bookshelf to remove from.');
    let p;
    try {
      p = normalise(args.path);
    } catch (err) {
      return errorResult(err.message);
    }
    // A deleted file can't be resolved, so fall back to the path as given.
    p = await fsp.realpath(p).catch(() => p);
    if (!host.stores.bookshelf.remove(caller, p)) return errorResult(`Not on your bookshelf: ${args.path}`);
    await host.rebuild();
    const structuredContent = { path: p, removed: true };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  },
};

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}
