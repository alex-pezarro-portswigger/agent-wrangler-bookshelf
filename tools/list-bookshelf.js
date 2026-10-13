// Caller-resolved: an agent sees its own task's shelves and nothing beyond them.
export const listBookshelfTool = {
  name: 'list_bookshelf',
  description:
    'List the files on the bookshelves of every session in your task, your own included: plans, '
    + 'specs and reports your sibling sessions put in front of the human. Read them with your usual '
    + 'file tools. There is no task or session parameter.',
  inputSchema: {},
  async handler({ host, caller }) {
    if (caller == null) return errorResult('This request carried no session identity, so there is no bookshelf to list.');
    const me = host.sessions.get(caller);
    const shared = !host.settings.get('privateShelves');
    const peers = shared && me?.taskId ? host.sessions.forTask(me.taskId) : [];
    const ids = [caller, ...peers.map((s) => s.sessionId).filter((id) => id !== caller)];
    const sessions = ids
      .map((id) => {
        const s = id === caller ? me : peers.find((p) => p.sessionId === id);
        const files = host.stores.bookshelf.list(id).map(({ path, shelf }) => ({ path, shelf }));
        return { sessionId: id, name: s?.name || s?.lastLabel || s?.intent || id, you: id === caller, files };
      })
      .filter((s) => s.you || s.files.length);
    const structuredContent = { taskId: me?.taskId ?? null, shared, sessions };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  },
};

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}
