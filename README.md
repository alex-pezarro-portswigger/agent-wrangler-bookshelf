# Bookshelf

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that gives each session a
**bookshelf**: a slim panel beside the chat listing the files the agent has put in front of you
(plans, specs, reports, scratch notes), grouped into shelves, with an in-place preview.

- Agents shelve files with the `shelve_file` and `unshelve_file` tools, guided by the `bookshelf` skill.
- A book chip in the session header shows the count and opens the panel.
- Clicking a markdown file link in the chat opens it on the bookshelf (under **Opened**) instead of
  the core preview.
- Right-click a file to download it, show it in your file manager, open it, open it with one of the
  apps in the **Open with apps** setting, or remove it from the shelf.

Shelves are stored in `<AW_DATA_DIR>/bookshelf.json` (default `~/.agent-wrangler`). Archiving a
session keeps its shelf; purging it removes it.

## Install

In the wrangler's Extensions tab, install from this repository's git URL. It asks for
`board:rebuild` and `board:broadcast`.

## Security

Every file operation goes through `safe-file.js`. Paths are canonicalised (`~`, `..` and symlinks
resolved); the browser can only read, reveal or open a file already on that session's shelf, and can
add only existing markdown files from chat links. A shelved path is re-resolved at every use, so a
file or folder swapped for a symlink after shelving is refused, and a read checks the open descriptor
is the same regular file. Reads are capped at 5 MB. OS commands run without a shell, and **Open
with** only accepts an app from the setting.

## Develop

```
npm install
npm test
```

To try it on a dev wrangler, copy this directory to `<AW_DATA_DIR>/extensions/bookshelf` and start
the wrangler.

## Licence

Apache-2.0, see `LICENSE`.
