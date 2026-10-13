# Bookshelf: design

An Agent Wrangler extension that gives each session a **bookshelf**: a slim, collapsible panel of
files the agent has chosen to put in front of the human (plans, specs, reports, scratch notes), with
an in-place preview and per-file actions.

Built purely on the existing extension API (host API 1.26). No core changes.

## Goals

- Agents (Claude and Codex alike) put the files a human should see on the shelf, guided by a short,
  simple rule set.
- The human sees them grouped and hierarchical beside the chat, previews them without leaving the
  session, and can download, reveal or open them with another app.
- Clicking a markdown file link in the chat opens the bookshelf with that file focused, instead of
  the core preview modal.
- Minimal UI that uses the board's theme tokens only.

## Non-goals

- Listing every file an agent touches, or scanning scratchpad directories.
- Terminal file links (they call the core preview directly; intercepting them is too hacky).
- Making non-`.md` paths clickable in chat (core only linkifies `.md`).
- Core slots or routes. If the DOM-coupled parts prove fragile, a `file.open` slot, a dock slot and
  extension GET routes are the follow-up.

## Acceptance criteria

- **GIVEN** an agent has written a plan outside the repository **WHEN** it follows the bookshelf
  guide **THEN** the plan appears on that session's bookshelf.
- **GIVEN** a session has files on its bookshelf **WHEN** the human looks at the session **THEN** a
  bookshelf chip in the session header shows how many files there are.
- **GIVEN** the bookshelf is closed **WHEN** the human clicks the chip **THEN** the bookshelf slides
  open beside the chat.
- **GIVEN** files are on several shelves **WHEN** the bookshelf is open **THEN** each shelf is a
  labelled, collapsible group with its files nested by folder.
- **GIVEN** the bookshelf is open **WHEN** the human selects a file **THEN** a preview slides out
  from the bookshelf showing its contents.
- **GIVEN** the agent mentions a markdown file in the chat **WHEN** the human clicks it **THEN** the
  bookshelf slides open with that file focused and its preview showing, and the old preview window
  does not appear.
- **GIVEN** the human clicks a markdown file in the chat that is not on the bookshelf **WHEN** the
  bookshelf opens **THEN** the file has been added to an "Opened" shelf and is focused.
- **GIVEN** a file on the bookshelf **WHEN** the human right-clicks it **THEN** they can download
  it, show it in their file manager, open it with their default app or a configured app, or remove
  it from the shelf.
- **GIVEN** the human prefers the bookshelf on the other side **WHEN** they switch sides **THEN** it
  stays on that side for future sessions.
- **GIVEN** the board's theme changes **WHEN** the bookshelf is showing **THEN** it follows the new
  theme.
- **GIVEN** a shelved file has since been deleted **WHEN** the bookshelf is open **THEN** it is shown
  as missing rather than failing.

## Architecture

```
agent ──MCP──▶ shelve_file / unshelve_file ──▶ BookshelfStore (per-session, JSON on disk)
                                                     │
                                         graph: { bookshelf: snapshot }
                                                     ▼
browser: panel.metaChip (count chip + session tracking) ──▶ bookshelf panel (own DOM, over session pane)
         capture-phase click on #chat-stream [data-md-path] ──┘        │
                                                                      │ api.send(bookshelf-*)
                                                                      ▼
                       handlers: read (bytes via host.broadcast), reveal, open, shelve, unshelve
```

### Repository layout

Mirrors `agent-wrangler-mermaid` and the core checklist extension:

```
package.json            wranglerExtension block, "type": "module", no runtime deps
index.js                manifest
store.js                BookshelfStore
tools/                  shelve-file.js, unshelve-file.js, list-bookshelf.js
handlers.js             bookshelf-read / -reveal / -open / -shelve / -unshelve
os-open.js              per-platform reveal/open commands
skills/bookshelf/SKILL.md
public/client.js        chip, panel, tree, preview, context menu, chat-click capture
public/bookshelf.css
*.test.js               node --test beside the code
README.md, LICENSE
```

### Manifest

- `id: 'bookshelf'`, `defaultEnabled: true`, `engines.wranglerApi: '^1.26.0'`.
- `requires: ['board:rebuild', 'board:broadcast']`.
- `stores: { bookshelf }`, `graph: ({host}) => ({ bookshelf: host.stores.bookshelf.snapshot() })`.
- `tools`, `handlers`, `skills: ['bookshelf']`, `client`, `styles`.
- `session.onPurge` forgets the session's shelf (archive keeps it, as checklist does).
- `settings`: one `list` setting, **Open with apps** (app names/paths offered under *Open with…*).

### Store

`BookshelfStore`, the checklist store's shape: in-memory map, synchronous mutators, atomic JSON
persistence to `<AW_DATA_DIR or ~/.agent-wrangler>/bookshelf.json`, keyed on card id.

Entry: `{ path, shelf, addedAt }`. `path` is absolute and realpath-resolved; re-shelving the same
path updates its shelf rather than duplicating. Cap of 200 entries per session (throws with a clear
message).

### Agent tools (caller-resolved, no session parameter)

- `shelve_file({ path, shelf? })`: path must be absolute (or `~`), exist and be a regular file.
  `shelf` defaults to the parent directory's name. Rebuilds the board.
- `unshelve_file({ path })`.
- `list_bookshelf()`: the caller's entries.

### Skill (`bookshelf`)

Deliberately short. Shelve:

- plans, specs and design docs;
- any markdown you create outside the main repository (scratchpad notes, reports, summaries);
- outputs the human asked for or should review (generated reports, exported data, screenshots).

Don't shelve files that are ordinary repo changes, or throwaway debugging output. Use a shelf label
that says what the group is (`Plans`, `Scratchpad`, `Reports`). Unshelve files you delete or
supersede.

### Browser side

**Session tracking and chip.** A `panel.metaChip` contribution renders a small book icon with the
file count (hidden when zero) in the session header. Its `update(el, session, graph)` is also how the
client learns the selected session and its shelf, so the open panel re-renders from `graph.bookshelf`.

**Panel.** Own DOM appended to `#sidebar`, absolutely positioned over the terminal/chat area on the
chosen edge (default right), ~260px wide, sliding in with a CSS transform. Header: "Bookshelf",
a side toggle (⇆) and close. Side is stored in `api.storage`. Closed by default; opened by the chip
or a chat file click. Removed entirely when the extension's `<link data-ext="bookshelf">` disappears
(mermaid's disable detection).

**Tree.** One group per shelf, in first-added order; group header is the shelf label with a chevron
and count, collapsible (collapse state in `api.storage`). Within a group, files nest under folders
relative to the group's common ancestor directory; single-child folder chains are compacted
(`a/b/c`). Rows show a small type glyph and name; hover shows the full path. Missing files are shown
dimmed with a "missing" hint.

**Preview.** Selecting a file slides a preview panel out from the bookshelf's inner edge over the
chat (~50% of the pane). The client sends `bookshelf-read`; the handler replies by broadcast with
`{ requestId, path, kind, text | base64, mime }`, the client matching its own `requestId`.

| Kind | Rule | Rendered as |
| --- | --- | --- |
| markdown | `.md`, `.markdown` | `api.ui.markdownPreview` |
| image | png, jpg, gif, webp, svg | `<img>` from a `blob:` URL |
| text | other files ≤ 1 MB that decode as UTF-8 with no NUL bytes | monospace `<pre>` |
| other | anything else | "No preview" plus the actions |

Files over 5 MB are not read; the preview says so and offers the actions.

**Chat-click capture.** A capture-phase `click`/`keydown` (Enter/Space) listener on `document`
matching `#chat-stream [data-md-path]` calls `preventDefault` + `stopPropagation`, resolves the path
(the link's `data-md-path` is already absolute, or cwd-joined by core), shelves it under "Opened" if
it isn't already (`bookshelf-shelve`), then opens the panel focused on it with its preview.

**Context menu** (right-click or a row's ⋯): Download, Show in folder, Open, Open with ▸ (configured
apps), Remove from bookshelf. Download reads the bytes as above and saves via an `<a download>` on a
blob.

**Theming.** CSS uses only core tokens (`--surface`, `--surface-2`, `--border-muted`, `--fg`,
`--fg-muted`, `--fg-subtle`, `--accent`, `--shadow`, `--font`); the markdown preview reuses core's
rendered-markdown rules by carrying the same class as `.file-body`. Light/dark follows automatically.

### Handlers

All take `{ sessionId, path }` and **refuse any path not on that session's shelf**, so the browser
cannot use them to read, reveal or open arbitrary files.

- `bookshelf-read { requestId }` → broadcast as above.
- `bookshelf-reveal` → macOS `open -R <p>`; Windows `explorer /select,<p>`; Linux `xdg-open <dir>`.
- `bookshelf-open { app? }` → macOS `open [-a app] <p>`; Windows `start "" <p>` or `<app> <p>`;
  Linux `xdg-open <p>` or `<app> <p>`. `app` must be one of the configured apps.
- `bookshelf-shelve` (chat click, shelf fixed to "Opened") and `bookshelf-unshelve`.

Commands run with `execFile`/`spawn` and argument arrays (no shell), detached.

### Errors

- Tool validation failures return `isError` with a plain message.
- Handler failures throw, which core shows as a toast.
- A read of a missing file replies `{ kind: 'missing' }`; the row is dimmed.

## Testing

- `node --test`: store (add/dedupe/cap/remove/forget/persist), tools (caller resolution, validation,
  default shelf), handlers (refuse unshelved paths, per-platform command construction with a stubbed
  spawner, read kinds and size limits), tree building (grouping, nesting, compaction).
- Manual, in an isolated dev instance (`run-dev`): chip, open/close, side switch, collapse, preview of
  each kind, chat click redirect, context menu actions, light and dark themes, disable/enable.

## Known couplings (accepted)

- `#sidebar` and `#chat-stream [data-md-path]` markup in core.
- Bytes travel by broadcast to every open board. Harmless for a single local user; capped at 5 MB.
