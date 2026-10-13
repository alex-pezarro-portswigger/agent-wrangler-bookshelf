// Browser half: header chip, the bookshelf panel docked over the session pane,
// file preview, context menu and chat-link capture. State lives at module level
// because the chip host is rebuilt on every panel render.
import { buildTree } from './tree.js';

const EXT_ID = 'bookshelf';
const CHAT_LINK = '#chat-stream [data-md-path], .bks-preview [data-md-path]';

const SVG = (inner) => `<svg class="bks-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
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

// ---- server traffic ----

function send(type, path, extra = {}) {
  api.send({ type, sessionId, path, ...extra });
}

function request(type, path, onReply) {
  const requestId = `bks-${Date.now()}-${++seq}`;
  requests.set(requestId, onReply);
  send(type, path, { requestId });
  return requestId;
}

function onMessage(msg) {
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
  head.append(el('span', 'diff-title bks-title', 'Bookshelf'), iconButton('swap', 'Switch side', switchSide), iconButton('close', 'Close bookshelf', () => setOpen(false)));
  els.list = el('div', 'bks-list');
  els.empty = el('p', 'bks-empty', 'Nothing on the shelf yet.');
  shelf.append(head, els.list, els.empty);

  const preview = el('section', 'bks-preview');
  preview.setAttribute('aria-label', 'File preview');
  const phead = el('header', 'diff-head bks-head');
  els.pTitle = el('span', 'diff-title bks-title');
  phead.append(els.pTitle,
    iconButton('more', 'File actions', (e) => selected && openMenu(e.currentTarget, selected)),
    iconButton('close', 'Close preview', closePreview));
  els.pBody = el('div', 'bks-preview-body');
  preview.append(phead, els.pBody);

  root.append(preview, shelf);
}

function place() {
  const sidebar = document.getElementById('sidebar');
  if (!root || !sidebar) return;
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
  const sig = JSON.stringify([sessionId, entries, selected, [...collapsed], [...missing]]);
  if (!force && sig === renderedSig) return;
  renderedSig = sig;
  const scroll = els.list.scrollTop;
  const groups = buildTree(entries);
  if (reveal) {
    const owner = entries.find((e) => e.path === reveal);
    if (owner) collapsed.delete(owner.shelf || 'Shelf');
  }
  els.list.replaceChildren(...groups.map(shelfEl));
  els.empty.hidden = entries.length > 0;
  els.list.scrollTop = scroll;
  const row = reveal && els.list.querySelector('.bks-file.selected');
  if (row) { row.scrollIntoView({ block: 'nearest' }); reveal = null; }
}

function shelfEl(group) {
  const shut = collapsed.has(group.shelf);
  const wrap = el('div', `bks-group${shut ? ' collapsed' : ''}`);
  const head = el('button', 'bks-group-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(!shut));
  head.innerHTML = ICONS.chevron;
  head.append(el('span', 'bks-group-name', group.shelf), el('span', 'bks-count', String(group.count)));
  head.addEventListener('click', () => toggleShelf(group.shelf));
  const body = el('div', 'bks-nodes');
  body.hidden = shut;
  body.append(...group.children.map((n) => nodeEl(n, 0)));
  wrap.append(head, body);
  return wrap;
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
  row.classList.toggle('selected', node.path === selected);
  row.classList.toggle('missing', missing.has(node.path));
  row.tabIndex = 0;
  row.title = node.path;
  row.style.paddingLeft = indent;
  row.innerHTML = isImage(node.path) ? ICONS.image : isText(node.path) ? ICONS.text : ICONS.file;
  row.append(el('span', 'bks-name', node.name), iconButton('more', 'File actions', (e) => openMenu(e.currentTarget, node.path), 'bks-row-btn'));
  row.addEventListener('click', () => selectFile(node.path));
  row.addEventListener('keydown', (e) => {
    if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectFile(node.path); }
  });
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, node.path); });
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

function showPreview(type, path) {
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
  });
  previewId = id;
}

function selectFile(path) {
  selected = path;
  showPreview('bookshelf-read', path);
  renderTree();
}

function closePreview() {
  selected = null;
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
    const row = el('div', 'bks-actions');
    for (const [label, fn] of [['Open', () => send('bookshelf-open', path)], ['Show in folder', () => send('bookshelf-reveal', path)]]) {
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

function download(path) {
  request('bookshelf-read', path, (reply) => {
    const blob = toBlob(reply);
    if (!blob) { selectFile(path); return; }
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = basename(path);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function remove(path) {
  send('bookshelf-unshelve', path);
  entries = entries.filter((e) => e.path !== path);
  if (selected === path) closePreview();
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

function openMenu(anchor, path) {
  closeMenus();
  const menu = menuEl([
    { label: 'Download', icon: 'download', run: () => download(path) },
    { label: 'Show in folder', icon: 'reveal', run: () => send('bookshelf-reveal', path) },
    { label: 'Open', icon: 'open', run: () => send('bookshelf-open', path) },
    ...(platform === 'darwin' || platform === 'win32' ? [{ label: 'Open with…', icon: 'openWith', run: () => send('bookshelf-open', path, { chooser: true }) }] : []),
    null,
    { label: 'Remove from bookshelf', icon: 'trash', danger: true, run: () => remove(path) },
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

function start() {
  if (root) return;
  side = api.storage.get('side') === 'left' ? 'left' : 'right';
  try { collapsed = new Set(JSON.parse(api.storage.get('collapsed') || '[]')); } catch { collapsed = new Set(); }
  build();
  place();
  for (const [type, fn] of LISTENERS) document.addEventListener(type, fn, true);
  headObserver = new MutationObserver(() => { if (!stillEnabled()) stop(); });
  headObserver.observe(document.head, { childList: true });
}

function stop() {
  for (const [type, fn] of LISTENERS) document.removeEventListener(type, fn, true);
  headObserver?.disconnect();
  headObserver = null;
  closeMenus();
  setBlob(null);
  root?.remove();
  root = null;
  els = {};
  open = false;
  selected = previewId = reveal = null;
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
    btn.setAttribute('aria-pressed', String(open));
    btn.classList.toggle('showing', open);
    btn.querySelector('.bks-chip-count').textContent = String(entries.length);
  }
}

function sync(session, graph) {
  const sid = session?.sessionId || null;
  if (sid !== sessionId) {
    sessionId = sid;
    if (root) closePreview();
  }
  entries = Array.isArray(graph?.bookshelf?.[sid]) ? graph.bookshelf[sid] : [];
  platform = graph?.bookshelfPlatform;
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
        btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
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
    if (api.selectedSessionId()) api.requestPanelRender();
  },
};
