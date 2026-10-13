# Bookshelf v1: implementation plan

Spec: `docs/specs/2026-10-13-bookshelf-design.md`. Two halves built in parallel against the contract
below; nothing else is shared between them.

## Contract

**Graph** (manifest `graph` contribution): `graph.bookshelf = { [cardId]: [{ path, shelf, addedAt }] }`
in stored (insertion) order. `path` is canonical.

**Browser → server** (`api.send`; every frame carries `sessionId` = card id and `path`):

| type | extra fields | effect |
| --- | --- | --- |
| `bookshelf-read` | `requestId` | reply (below); path must be on the shelf |
| `bookshelf-open-link` | `requestId` | canonicalise; existing `.md`/`.markdown` regular file only; shelve under `Opened` if absent (rebuild); reply as read |
| `bookshelf-reveal` | | show in file manager |
| `bookshelf-open` | `app?` | open with default app, or `app` (must exactly match a configured app) |
| `bookshelf-unshelve` | | remove; rebuild |

**Server → browser** (`host.broadcast`, arrives at `onMessage` as `{ type: 'ext:bookshelf', ... }`):

```
{ event: 'file', requestId, sessionId, path /* canonical */, kind, size?, text?, base64?, mime?, message? }
kind: 'markdown' | 'text'        -> text
      'image' | 'other'          -> base64 + mime
      'missing' | 'too-large' | 'error' -> message
```

Read/open-link never throw for file problems: they reply with `missing`/`too-large`/`error` so the
preview never hangs. Refusals (path not on shelf, bad input) throw, so core shows a toast.

**Setting**: `openWithApps` (type `list`, label "Open with apps", help: app names on macOS e.g.
`Visual Studio Code`, or executable paths on Linux/Windows). Client reads via `api.settings()`.

**Kinds**: markdown = `.md`/`.markdown`; image = png/jpg/jpeg/gif/webp/svg (mime from extension);
text = ≤ 1 MB, valid UTF-8, no NUL; other = everything else ≤ 5 MB; > 5 MB = too-large.

## Server half (files: package.json, package-lock.json, index.js, safe-file.js, store.js, tools/, handlers.js, os-open.js, skills/, tests, README.md, LICENSE, .gitignore)

1. `package.json`: `type: module`, `private`, `wranglerExtension` {id `bookshelf`, label `Bookshelf`,
   description, author `James Kinley`, requires `['board:rebuild','board:broadcast']`}, dependency
   `zod` (same major as core / jobs), `scripts.test: node --test`. `npm install` to make the lockfile.
2. `safe-file.js`: `canonicalise(input)`, `recheck(storedPath)`, `readBounded(path)`, `classify`.
   Per spec "Security".
3. `store.js`: `BookshelfStore` per spec; file path injectable for tests.
4. `tools/shelve-file.js`, `tools/unshelve-file.js`: caller-resolved, zod schemas, `isError` results.
5. `handlers.js`: the five handlers per contract; `os-open.js` builds `[cmd, args]` per platform and
   spawns detached with `execFile` (injectable spawner for tests).
6. `index.js`: manifest per spec (exports `dir`), `session.onPurge` forgets the shelf, settings def,
   `client: 'public/client.js'`, `styles: 'public/bookshelf.css'`, `skills: ['bookshelf']`.
7. `skills/bookshelf/SKILL.md` (the short rule set) and `skills/bookshelf/WRANGLER.md` (one or two sentences injected into every agent prompt telling it to shelve plans and human-facing markdown with `shelve_file`, see the skill). Follow the core checklist skill format.
8. Tests for every module (`node --test`), including the security cases.

## Client half (files: public/client.js, public/tree.js, public/bookshelf.css, public/tree.test.js)

1. `public/tree.js`: pure `buildTree(entries)` → shelves (ordered by first `addedAt`) → nested
   folders relative to each shelf's common ancestor, single-child folder chains compacted. Tested.
2. `public/client.js`: `panel.metaChip` chip + session tracking; panel DOM in `#sidebar` with the
   positioning rules in the spec; tree with collapsible shelves; preview slide-out; context menu
   (Download, Show in folder, Open, Open with ▸, Remove from bookshelf); chat-click capture; disable
   detection that removes the DOM and listeners. All text via `textContent`; markdown via
   `api.ui.markdownPreview` into an element carrying core's `file-body` class.
3. `public/bookshelf.css`: core tokens only; slide transitions; minimal and quiet.

## Integration

Run tests, run in an isolated dev instance (`run-dev` skill), then install to
`~/.agent-wrangler/extensions/bookshelf/` and restart the board.
