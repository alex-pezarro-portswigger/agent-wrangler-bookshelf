// Pure tree building for the bookshelf panel: entries -> shelves -> nested folders.

const segments = (p) => String(p).split(/[\\/]+/).filter(Boolean);

function commonDir(dirs) {
  let common = dirs[0];
  for (const d of dirs.slice(1)) {
    let i = 0;
    while (i < common.length && i < d.length && common[i] === d[i]) i++;
    common = common.slice(0, i);
  }
  return common;
}

const byName = (a, b) => a.name.localeCompare(b.name);

function sortNodes(nodes) {
  const dirs = nodes.filter((n) => n.type === 'dir').sort(byName);
  const files = nodes.filter((n) => n.type === 'file').sort(byName);
  for (const d of dirs) d.children = sortNodes(d.children);
  return [...dirs, ...files];
}

function compact(node) {
  if (node.type !== 'dir') return node;
  node.children = node.children.map(compact);
  while (node.children.length === 1 && node.children[0].type === 'dir') {
    const only = node.children[0];
    node.name = `${node.name}/${only.name}`;
    node.children = only.children;
  }
  return node;
}

function nest(entries) {
  const split = entries.map((e) => ({ entry: e, segs: segments(e.path) }));
  const base = commonDir(split.map((s) => s.segs.slice(0, -1))).length;
  const root = { children: [] };
  for (const { entry, segs } of split) {
    let dir = root;
    for (const name of segs.slice(base, -1)) {
      let next = dir.children.find((n) => n.type === 'dir' && n.name === name);
      if (!next) dir.children.push(next = { type: 'dir', name, children: [] });
      dir = next;
    }
    dir.children.push({ type: 'file', name: segs[segs.length - 1] || entry.path, path: entry.path, entry });
  }
  return sortNodes(root.children.map(compact));
}

// [{ path, shelf, addedAt }] -> [{ shelf, count, children }], shelves ordered by
// their first addedAt; folders relative to each shelf's common ancestor directory.
export function buildTree(entries = []) {
  const shelves = new Map();
  for (const e of entries) {
    if (!e || typeof e.path !== 'string') continue;
    const name = e.shelf || 'Shelf';
    if (!shelves.has(name)) shelves.set(name, []);
    shelves.get(name).push(e);
  }
  const first = (list) => Math.min(...list.map((e) => Number(e.addedAt) || 0));
  return [...shelves]
    .sort((a, b) => first(a[1]) - first(b[1]))
    .map(([shelf, list]) => ({ shelf, count: list.length, children: nest(list) }));
}
