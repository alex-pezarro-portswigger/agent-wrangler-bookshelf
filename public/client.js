// Browser half: header chip, the bookshelf panel docked over the session pane
// (or over the board for a task), file preview, context menu and chat-link capture. State lives at module level
// because the chip host is rebuilt on every panel render.
import { buildTree } from './tree.js';

const EXT_ID = 'bookshelf';
const CHAT_LINK = '#chat-stream [data-md-path], .bks-preview [data-md-path]';

const SVG = (inner) => `<svg class="bks-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const BOOK_PATH = '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>';
const MENU_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BOOK_PATH}</svg>`;
const ICONS = {
  book: SVG('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>'),
  close: SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  swap: SVG('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
  chevron: SVG('<path d="m9 18 6-6-6-6"/>'),
  more: SVG('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  folder: SVG('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  text: SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  image: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>'),
  file: SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>'),
  download: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  reveal: SVG('<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>'),
  open: SVG('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  openWith: SVG('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>'),
  trash: SVG('<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
};

let api = null;
let root = null;
let els = {};
let menus = [];
let headObserver = null;
const chips = new Set();
const requests = new Map();
const missing = new Set();
let seq = 0;

let open = false;
let side = 'right';
let collapsed = new Set();
let sessionId = null;
let entries = [];
let platform = null;
let selected = null;
let selectedOwner = null;
let scope = 'session';
let taskId = null;
let onBoard = false;
let boardOpenedWith = null;
let graph = null;
let previewId = null;
let reveal = null;
let blobUrl = null;
let renderedSig = '';

const stillEnabled = () => Boolean(document.querySelector(`link[data-ext="${EXT_ID}"]`));
const basename = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || String(p);
const isImage = (p) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p);
const isText = (p) => /\.(md|markdown|txt|log|json|ya?ml|csv)$/i.test(p);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconButton(icon, title, onClick, className = 'icon-ghost') {
  const b = el('button', className);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = ICONS[icon];
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}

// ---- scope: one session's shelves, or every session's in its task ----

const taskOf = (sid) => (sid && graph?.tasks?.assignments?.[sid]) || null;
const inTask = () => scope === 'task' && Boolean(taskId);
const taskName = (id) => graph?.tasks?.tasks?.find((t) => t.id === id)?.name || 'Task';

function sessionName(sid) {
  const s = graph?.sessions?.find((x) => x.sessionId === sid);
  return s?.label || s?.intent || 'Session';
}

// Every entry carries its owning session: the server checks a path against that session's shelf.
function shown() {
  if (!inTask()) return entries.map((e) => ({ ...e, owner: sessionId }));
  const order = graph?.tasks?.sessionOrder?.[taskId] || [];
  const rank = (sid) => { const i = order.indexOf(sid); return i < 0 ? order.length : i; };
  return Object.keys(graph?.bookshelf || {})
    .filter((sid) => taskOf(sid) === taskId)
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((sid) => graph.bookshelf[sid].map((e) => ({ ...e, owner: sid })));
}

function setScope(value) {
  scope = value;
  api.storage.set('scope', scope);
  if (scope === 'task') taskId = taskOf(sessionId);
  closePreview();
  renderHead();
  renderTree(true);
}

function openOnBoard(id) {
  taskId = id;
  scope = 'task';
  onBoard = true;
  boardOpenedWith = api.selectedSessionId();
  if (open) closePreview();
  renderHead();
  setOpen(true);
}

function openInSession() {
  onBoard = false;
  scope = api.storage.get('scope') === 'task' ? 'task' : 'session';
  taskId = taskOf(sessionId);
  renderHead();
  setOpen(true);
}

// ---- server traffic ----

function send(type, path, extra = {}, owner = sessionId) {
  api.send({ type, sessionId: owner, path, ...extra });
}

function request(type, path, onReply, owner = sessionId) {
  const requestId = `bks-${Date.now()}-${++seq}`;
  requests.set(requestId, onReply);
  send(type, path, { requestId }, owner);
  return requestId;
}

function onMessage(msg) {
  if (msg?.event === 'open') {
    if (!root) return;
    const viewing = onBoard ? inTask() && taskOf(msg.sessionId) === taskId : msg.sessionId === sessionId;
    if (!viewing) return;
    if (!open) setOpen(true);
    selectFile(msg.path, msg.sessionId);
    return;
  }
  if (msg?.event !== 'file') return;
  const handle = requests.get(msg.requestId);
  if (!handle) return;
  requests.delete(msg.requestId);
  handle(msg);
}

function toBlob(reply) {
  if (typeof reply.text === 'string') return new Blob([reply.text], { type: reply.mime || 'text/plain;charset=utf-8' });
  if (typeof reply.base64 !== 'string') return null;
  const bin = atob(reply.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: reply.mime || 'application/octet-stream' });
}

// ---- panel ----

function build() {
  root = el('div', 'bks');
  root.dataset.side = side;

  const shelf = el('section', 'bks-shelf');
  shelf.setAttribute('aria-label', 'Bookshelf');
  const head = el('header', 'diff-head bks-head');
  els.title = el('span', 'diff-title bks-title', 'Bookshelf');
  els.scope = el('div', 'bks-scope');
  els.scope.setAttribute('role', 'group');
  els.scope.setAttribute('aria-label', 'Show');
  for (const [value, label] of [['session', 'Session'], ['task', 'Task']]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.dataset.scope = value;
    b.addEventListener('click', () => { if (scope !== value) setScope(value); });
    els.scope.append(b);
  }
  head.append(els.title, els.scope, iconButton('swap', 'Switch side', switchSide), iconButton('close', 'Close bookshelf', () => setOpen(false)));
  els.list = el('div', 'bks-list');
  els.empty = el('p', 'bks-empty', 'Nothing on the shelf yet.');
  shelf.append(head, els.list, els.empty);

  const preview = el('section', 'bks-preview');
  preview.setAttribute('aria-label', 'File preview');
  const phead = el('header', 'diff-head bks-head');
  els.pTitle = el('span', 'diff-title bks-title');
  phead.append(els.pTitle,
    iconButton('more', 'File actions', (e) => selected && openMenu(e.currentTarget, selected, selectedOwner)),
    iconButton('close', 'Close preview', closePreview));
  els.pBody = el('div', 'bks-preview-body');
  preview.append(phead, els.pBody);

  root.append(preview, shelf);
}

function renderHead() {
  if (!root) return;
  els.title.textContent = inTask() ? taskName(taskId) : 'Bookshelf';
  els.scope.hidden = onBoard || !taskOf(sessionId);
  for (const b of els.scope.children) b.setAttribute('aria-pressed', String(b.dataset.scope === (inTask() ? 'task' : 'session')));
}

function place() {
  if (!root) return;
  const grid = document.getElementById('grid');
  root.classList.toggle('on-board', onBoard);
  if (onBoard && grid) {
    if (root.parentNode !== grid.parentNode) grid.parentNode.appendChild(root);
    root.style.top = '0px';
    root.style.left = `${grid.offsetLeft}px`;
    root.style.width = `${grid.offsetWidth}px`;
    return;
  }
  root.style.left = root.style.width = '';
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (root.parentNode !== sidebar) sidebar.appendChild(root);
  const pane = ['chat-wrap', 'term-wrap'].map((id) => document.getElementById(id)).find((p) => p && !p.hidden && p.offsetParent);
  root.style.top = `${pane ? pane.offsetTop : 0}px`;
}

function setOpen(value) {
  open = value;
  if (!root) return;
  if (open) {
    place();
    renderTree(true);
  } else {
    closeMenus();
    closePreview();
  }
  root.classList.toggle('open', open);
  renderChips();
}

function switchSide() {
  side = side === 'right' ? 'left' : 'right';
  api.storage.set('side', side);
  root.dataset.side = side;
}

function toggleShelf(name) {
  if (collapsed.has(name)) collapsed.delete(name); else collapsed.add(name);
  api.storage.set('collapsed', JSON.stringify([...collapsed]));
  renderTree(true);
}

// ---- tree ----

function renderTree(force = false) {
  if (!root || !open) return;
  const list = shown();
  const task = inTask();
  const sig = JSON.stringify([onBoard, task, taskId, sessionId, list, selected, selectedOwner, [...collapsed], [...missing]]);
  if (!force && sig === renderedSig) return;
  renderedSig = sig;
  renderHead();
  const scroll = els.list.scrollTop;
  if (reveal) {
    const hit = list.find((e) => e.path === reveal && e.owner === selectedOwner);
    if (hit) {
      collapsed.delete(task ? `${hit.owner}:${hit.shelf || 'Shelf'}` : hit.shelf || 'Shelf');
      collapsed.delete(`session:${hit.owner}`);
    }
  }
  els.list.replaceChildren(...(task ? sessionGroups(list) : buildTree(list).map((g) => shelfEl(g, g.shelf))));
  els.empty.textContent = task ? 'Nothing on this task\'s shelves yet.' : 'Nothing on the shelf yet.';
  els.empty.hidden = list.length > 0;
  els.list.scrollTop = scroll;
  const row = reveal && els.list.querySelector('.bks-file.selected');
  if (row) { row.scrollIntoView({ block: 'nearest' }); reveal = null; }
}

function groupEl(key, name, count, children, className = '') {
  const shut = collapsed.has(key);
  const wrap = el('div', `bks-group${className}${shut ? ' collapsed' : ''}`);
  const head = el('button', 'bks-group-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(!shut));
  head.innerHTML = ICONS.chevron;
  head.append(el('span', 'bks-group-name', name), el('span', 'bks-count', String(count)));
  head.addEventListener('click', () => toggleShelf(key));
  const body = el('div', 'bks-nodes');
  body.hidden = shut;
  body.append(...children);
  wrap.append(head, body);
  return wrap;
}

function shelfEl(group, key, className) {
  return groupEl(key, group.shelf, group.count, group.children.map((n) => nodeEl(n, 0)), className);
}

function sessionGroups(list) {
  const bySession = new Map();
  for (const e of list) {
    if (!bySession.has(e.owner)) bySession.set(e.owner, []);
    bySession.get(e.owner).push(e);
  }
  return [...bySession].map(([sid, own]) => groupEl(`session:${sid}`, sessionName(sid), own.length,
    buildTree(own).map((g) => shelfEl(g, `${sid}:${g.shelf}`, ' bks-sub')), ' bks-session'));
}

function nodeEl(node, depth) {
  const indent = `${10 + depth * 14}px`;
  if (node.type === 'dir') {
    const wrap = el('div', 'bks-dir');
    const label = el('div', 'bks-row bks-dir-name');
    label.style.paddingLeft = indent;
    label.innerHTML = ICONS.folder;
    label.append(el('span', 'bks-name', node.name));
    wrap.append(label, ...node.children.map((n) => nodeEl(n, depth + 1)));
    return wrap;
  }
  const row = el('div', 'bks-row bks-file');
  const owner = node.entry.owner;
  row.classList.toggle('selected', node.path === selected && owner === selectedOwner);
  row.classList.toggle('missing', missing.has(node.path));
  row.tabIndex = 0;
  row.title = node.path;
  row.style.paddingLeft = indent;
  row.innerHTML = isImage(node.path) ? ICONS.image : isText(node.path) ? ICONS.text : ICONS.file;
  row.append(el('span', 'bks-name', node.name), iconButton('more', 'File actions', (e) => openMenu(e.currentTarget, node.path, owner), 'bks-row-btn'));
  row.addEventListener('click', () => selectFile(node.path, owner));
  row.addEventListener('keydown', (e) => {
    if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectFile(node.path, owner); }
  });
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, node.path, owner); });
  return row;
}

// ---- preview ----

function setBlob(blob) {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = blob ? URL.createObjectURL(blob) : null;
  return blobUrl;
}

function setTitle(path) {
  els.pTitle.textContent = basename(path);
  els.pTitle.title = path;
}

function showPreview(type, path, owner = sessionId) {
  selectedOwner = owner;
  setTitle(path);
  status('Loading…');
  root.classList.add('previewing');
  const id = request(type, path, (reply) => {
    if (id !== previewId) return;
    selected = reply.path;
    reveal = reply.path;
    setTitle(reply.path);
    renderPreview(reply);
    renderTree();
  }, owner);
  previewId = id;
}

function selectFile(path, owner = sessionId) {
  selected = path;
  showPreview('bookshelf-read', path, owner);
  renderTree();
}

function closePreview() {
  selected = null;
  selectedOwner = null;
  previewId = null;
  setBlob(null);
  root?.classList.remove('previewing');
  renderTree();
}

function status(text, actions = false) {
  setBlob(null);
  const box = el('div', 'bks-status');
  box.append(el('p', null, text));
  if (actions && selected) {
    const path = selected;
    const owner = selectedOwner;
    const row = el('div', 'bks-actions');
    for (const [label, fn] of [['Open', () => send('bookshelf-open', path, {}, owner)], ['Show in folder', () => send('bookshelf-reveal', path, {}, owner)]]) {
      const b = el('button', null, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      row.append(b);
    }
    box.append(row);
  }
  els.pBody.replaceChildren(box);
}

function renderPreview(reply) {
  if (reply.kind === 'missing') missing.add(reply.path); else missing.delete(reply.path);
  switch (reply.kind) {
    case 'markdown': {
      setBlob(null);
      const md = el('div', 'file-body bks-md');
      md.innerHTML = api.ui.markdownPreview(reply.text || '');
      els.pBody.replaceChildren(md);
      break;
    }
    case 'text':
      setBlob(null);
      els.pBody.replaceChildren(el('pre', 'bks-pre', reply.text || ''));
      break;
    case 'image': {
      const img = el('img', 'bks-img');
      img.alt = basename(reply.path);
      img.src = setBlob(toBlob(reply));
      els.pBody.replaceChildren(img);
      break;
    }
    case 'missing':
      status(reply.message || 'This file no longer exists.');
      break;
    case 'too-large':
      status(reply.message || 'This file is too large to preview.', true);
      break;
    case 'error':
      status(reply.message || 'This file could not be read.', true);
      break;
    default:
      status('No preview for this kind of file.', true);
  }
}

// ---- context menu ----

function download(path, owner) {
  request('bookshelf-read', path, (reply) => {
    const blob = toBlob(reply);
    if (!blob) { selectFile(path, owner); return; }
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = basename(path);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, owner);
}

function remove(path, owner) {
  send('bookshelf-unshelve', path, {}, owner);
  if (owner === sessionId) entries = entries.filter((e) => e.path !== path);
  if (graph?.bookshelf?.[owner]) graph = { ...graph, bookshelf: { ...graph.bookshelf, [owner]: graph.bookshelf[owner].filter((e) => e.path !== path) } };
  if (selected === path && selectedOwner === owner) closePreview();
  renderTree();
  renderChips();
}

function menuEl(items) {
  const menu = el('div', 'context-menu bks-menu');
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    if (!it) { menu.append(el('div', 'context-menu-sep')); continue; }
    const b = el('button', `context-menu-item${it.danger ? ' danger' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.innerHTML = ICONS[it.icon];
    b.append(el('span', null, it.label));
    b.addEventListener('click', () => { closeMenus(); it.run(); });
    menu.append(b);
  }
  document.body.append(menu);
  menus.push(menu);
  return menu;
}

function position(menu, x, y) {
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - height - 4))}px`;
}

function openMenu(anchor, path, owner) {
  closeMenus();
  const menu = menuEl([
    { label: 'Download', icon: 'download', run: () => download(path, owner) },
    { label: 'Show in folder', icon: 'reveal', run: () => send('bookshelf-reveal', path, {}, owner) },
    { label: 'Open', icon: 'open', run: () => send('bookshelf-open', path, {}, owner) },
    ...(platform === 'darwin' || platform === 'win32' ? [{ label: 'Open with…', icon: 'openWith', run: () => send('bookshelf-open', path, { chooser: true }, owner) }] : []),
    null,
    { label: 'Remove from bookshelf', icon: 'trash', danger: true, run: () => remove(path, owner) },
  ]);
  const at = anchor instanceof Element ? anchor.getBoundingClientRect() : null;
  position(menu, at ? at.left : anchor.x, at ? at.bottom + 2 : anchor.y);
  menu.querySelector('.context-menu-item')?.focus();
}

function closeMenus() {
  menus.forEach((m) => m.remove());
  menus = [];
}

// ---- document listeners ----

function onChatLink(e) {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  const hit = e.target?.closest?.(CHAT_LINK);
  if (!hit || !sessionId) return;
  if (!stillEnabled()) { stop(); return; }
  e.preventDefault();
  e.stopPropagation();
  if (onBoard) { onBoard = false; taskId = taskOf(sessionId); }
  setOpen(true);
  showPreview('bookshelf-open-link', hit.dataset.mdPath);
}

function onPointerDown(e) {
  if (menus.length && !menus.some((m) => m.contains(e.target))) closeMenus();
}

function onKeyDown(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || !open) return;
  const inside = e.target === document.body || root.contains(e.target) || menus.some((m) => m.contains(e.target));
  if (!inside) return;
  if (menus.length) closeMenus();
  else if (selected) closePreview();
  else setOpen(false);
  e.preventDefault();
}

const LISTENERS = [['click', onChatLink], ['keydown', onChatLink], ['pointerdown', onPointerDown], ['keydown', onKeyDown]];

const onResize = () => { if (open && onBoard) place(); };

function start() {
  if (root) return;
  side = api.storage.get('side') === 'left' ? 'left' : 'right';
  scope = api.storage.get('scope') === 'task' ? 'task' : 'session';
  try { collapsed = new Set(JSON.parse(api.storage.get('collapsed') || '[]')); } catch { collapsed = new Set(); }
  build();
  place();
  for (const [type, fn] of LISTENERS) document.addEventListener(type, fn, true);
  window.addEventListener('resize', onResize);
  headObserver = new MutationObserver(() => { if (!stillEnabled()) stop(); });
  headObserver.observe(document.head, { childList: true });
}

function stop() {
  for (const [type, fn] of LISTENERS) document.removeEventListener(type, fn, true);
  window.removeEventListener('resize', onResize);
  headObserver?.disconnect();
  headObserver = null;
  closeMenus();
  setBlob(null);
  root?.remove();
  root = null;
  els = {};
  open = false;
  onBoard = false;
  selected = selectedOwner = previewId = reveal = null;
  renderedSig = '';
  requests.clear();
  chips.clear();
}

// ---- chip + session tracking ----

function renderChips() {
  for (const host of chips) {
    const btn = host.querySelector('.bks-chip');
    if (!btn) continue;
    btn.hidden = !entries.length;
    btn.setAttribute('aria-pressed', String(open && !onBoard));
    btn.classList.toggle('showing', open && !onBoard);
    btn.querySelector('.bks-chip-count').textContent = String(entries.length);
  }
}

// Opening another session while a task's shelves are over the board moves them beside its chat.
function sync(session, g) {
  graph = g;
  const sid = session?.sessionId || null;
  const moved = sid !== sessionId;
  if (moved) {
    sessionId = sid;
    if (root && !onBoard) closePreview();
  }
  if (onBoard && sid && sid !== boardOpenedWith) {
    onBoard = false;
    if (root) closePreview();
  }
  if (!onBoard && (moved || !taskId)) taskId = taskOf(sid);
  entries = Array.isArray(g?.bookshelf?.[sid]) ? g.bookshelf[sid] : [];
  platform = g?.bookshelfPlatform;
  if (open) place();
  renderTree();
}

export default {
  register(reg) {
    api = reg.api;
    start();
    api.onMessage(onMessage);
    reg.register('panel.metaChip', {
      id: 'bookshelf-chip',
      mount(host) {
        const btn = el('button', 'card-tag bks-chip');
        btn.type = 'button';
        btn.title = 'Bookshelf';
        btn.innerHTML = ICONS.book;
        btn.append(el('span', 'bks-chip-count'));
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (open && !onBoard) setOpen(false); else openInSession();
        });
        host.append(btn);
        chips.add(host);
      },
      update(host, session, graph) {
        if (!stillEnabled()) { stop(); return; }
        sync(session, graph);
        renderChips();
      },
      unmount(host) { chips.delete(host); },
    });
    reg.register('task.action', {
      id: 'bookshelf-task',
      items(task, g) {
        if (task.adhoc) return [];
        return [{ label: 'Open bookshelf', icon: MENU_ICON, run: () => { graph = g; platform = g?.bookshelfPlatform; openOnBoard(task.id); } }];
      },
    });
    // Draws nothing: it is how the task shelves over the board hear about graph changes.
    reg.register('task.body', {
      id: 'bookshelf-graph',
      mount() {},
      update(host, ctx, g) {
        graph = g;
        if (open && onBoard) renderTree();
      },
    });
    if (api.selectedSessionId()) api.requestPanelRender();
  },
};
