# Bookshelf

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that gives each session a
**bookshelf**: a slim panel beside the chat listing the files the agent has put in front of you
(plans, specs, reports, scratch notes), grouped into shelves, with an in-place preview.

- Agents shelve files with the `shelve_file` and `unshelve_file` tools, guided by the `bookshelf` skill.
- A book chip in the session header shows the count and opens the panel.
- Clicking a markdown file link in the chat opens it on the bookshelf (under **Opened**) instead of
  the core preview.
- A task's ⋯ menu has **Open bookshelf**: every session's shelves in that task, one group per
  session, over the board. Opening one of its sessions moves the panel beside that chat; the
  **Session | Task** switch in its header flips between the session's own shelves and the task's.
- Agents can list their task's shelves with `list_bookshelf`, so one session can pick up a plan or
  spec another wrote. Turn on **Keep shelves private from other agents** to limit each to its own.
- Right-click a file to download it, show it in your file manager, open it, open it with an app you
  pick from the system's own chooser (macOS and Windows), or remove it from the shelf.

Every session launch, fork and resume carries a one-line nudge pointing the agent at the skill, so
Claude and Codex shelve plans (including ones written inside the repository), specs and the markdown
they write for you without being asked.

## Plans

By default an agent writes its plan to a file, shelves it and gives only a short summary in chat.
Two settings (Settings → Extensions → Bookshelf) change that:

- **Show plans in chat**: also write the plan out in chat.
- **Open plans automatically**: open the bookshelf on a plan as soon as it is shelved, if you are
  viewing that session.

Claude's own plan mode still shows its plan when asking you to approve it.

## What it looks like

Look for the book chip with a count in the session header, next to the checklist chip. Clicking it
slides the bookshelf in beside the chat; selecting a file slides its preview out of the bookshelf.
The ⇆ button moves it to the other side.

![The bookshelf open beside the chat in the dark theme, showing a Plans and a Scratchpad shelf with a plan previewed](docs/images/bookshelf-dark.png)

Right-click a file (or use its ⋯) for its actions:

![The bookshelf in the light theme with a file's context menu open: Download, Show in folder, Open, Open with…, Remove from bookshelf](docs/images/bookshelf-light-menu.png)

Shelves are stored in `<AW_DATA_DIR>/bookshelf.json` (default `~/.agent-wrangler`). Archiving a
session keeps its shelf; purging it removes it.

## Install

In the wrangler's Extensions tab, install from this repository's git URL. It asks for
`board:rebuild`, `board:broadcast` and `sessions:read` (to find a session's task for
`list_bookshelf`).

## Security

Every file operation goes through `safe-file.js`. Paths are canonicalised (`~`, `..` and symlinks
resolved); the browser can only read, reveal or open a file already on that session's shelf, and can
add only existing markdown files from chat links. A shelved path is re-resolved at every use, so a
file or folder swapped for a symlink after shelving is refused, and a read checks the open descriptor
is the same regular file. Reads are capped at 5 MB. OS commands run without a shell, and **Open
with** only shows the system's app chooser; the file name reaches it as an argument, never as script.

## Develop

```
npm install
npm test
```

To try it on a dev wrangler, copy this directory to `<AW_DATA_DIR>/extensions/bookshelf` and start
the wrangler.

## Licence

Apache-2.0, see `LICENSE`.
