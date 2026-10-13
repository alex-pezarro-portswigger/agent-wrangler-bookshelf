---
name: bookshelf
description: Use when you write a plan, spec, design doc, report or other file the human should read — how to put it on this session's bookshelf (the panel of files beside your chat on the Agent Wrangler board) with shelve_file, and when to take it off with unshelve_file.
---

# Bookshelf

Your session has a bookshelf on the Agent Wrangler board: a panel beside the chat listing the
files you have put in front of the human, grouped into labelled shelves, with a preview. Two tools
write it, both acting only on your own session:

- `shelve_file({ path, shelf?, plan? })` — `path` is absolute (or `~/...`) and must be an existing
  file. `shelf` defaults to the parent folder's name. Shelving a file again just moves it to `shelf`.
  Pass `plan: true` for a plan you are presenting to the human.
- `unshelve_file({ path })`

`list_bookshelf()` lists the shelves of every session in your task, your own included. Check it
for plans and specs a sibling session wrote before you plan the same work again.

## Shelve

- Plans, specs and design docs, wherever you write them, including inside the repository (for
  example `docs/plans/`, `docs/superpowers/specs/`).
- Any markdown you create outside the main repository: scratchpad notes, reports, summaries.
- Outputs the human asked for or should review: generated reports, exported data, screenshots.

## Plans

When you have a plan for the human, write it to a markdown file and shelve it with `plan: true`
(shelf `Plans`) before you reply. Follow any instruction in the tool's result about how to present
it in chat.

## Don't shelve

- Ordinary repository changes (source, tests, config).
- Throwaway debugging output.

## Shelf labels

Use a short label that says what the group is: `Plans`, `Specs`, `Reports`, `Scratchpad`.

## Keep it current

Unshelve a file when you delete it or replace it with a newer one.
