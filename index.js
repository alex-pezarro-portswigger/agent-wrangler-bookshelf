import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BookshelfStore } from './store.js';
import { shelveFileTool } from './tools/shelve-file.js';
import { unshelveFileTool } from './tools/unshelve-file.js';
import { bookshelfHandlers } from './handlers.js';

export const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  id: 'bookshelf',
  label: 'Bookshelf',
  help: 'A panel beside each session\'s chat listing the files the agent has put in front of you, with a preview. Turning it off removes the panel, the shelve_file and unshelve_file tools and the bookshelf skill; shelves are kept.',
  description: 'A per-session panel of the plans, specs and reports an agent wants you to see, with an in-place preview and open, reveal and download actions.',
  author: 'James Kinley',
  defaultEnabled: true,
  engines: { wranglerApi: '^1.26.0' },
  dir,
  requires: ['board:rebuild', 'board:broadcast'],
  stores: { bookshelf: () => new BookshelfStore() },
  tools: [shelveFileTool, unshelveFileTool],
  handlers: bookshelfHandlers(),
  graph: ({ host }) => ({ bookshelf: host.stores.bookshelf.snapshot(), bookshelfPlatform: process.platform }),
  // Archive keeps the shelf so a resume restores it; only the purge drops it.
  session: {
    onPurge: ({ sessionId, host }) => { host.stores.bookshelf.forget(sessionId); },
  },
  settings: [
    {
      key: 'plansInChat',
      type: 'toggle',
      label: 'Show plans in chat',
      help: 'Off: an agent puts its plan on the bookshelf and gives only a short summary in chat. On: it also writes the plan out in chat.',
    },
    {
      key: 'autoOpenPlans',
      type: 'toggle',
      label: 'Open plans automatically',
      help: 'Open the bookshelf on a plan as soon as the agent shelves it, if you are viewing that session.',
    },
  ],
  skills: ['bookshelf'],
  client: 'public/client.js',
  styles: 'public/bookshelf.css',
};
