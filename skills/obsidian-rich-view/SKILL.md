---
name: obsidian-rich-view
description: >
  Create, read and modify `rich-view` fenced code blocks in Obsidian vault notes,
  which embed a draw.io (.drawio), Visio (.vsdx) or PowerPoint (.pptx) file as an
  interactive viewer. Use this skill whenever the user asks to embed, show, preview
  or insert a diagram, Visio drawing or slide deck in a note, to change which page,
  zoom, position or height an embedded file opens at, to point a block at another
  file, or to read or analyse existing rich-view blocks in vault files.
---

# Rich View — Agent Reference

`rich-view` is an Obsidian plugin that shows a `.drawio`, `.vsdx` or `.pptx` file inside a note. The block does not
contain the diagram: it names a file in the vault and says how to open it. This skill covers writing and editing
those blocks.

> **Obsidian-only.** The block does not render in other Markdown editors or on GitHub.

---

## Block structure

````markdown
```rich-view
file=architecture/system.drawio|page=Overview|height=600|zoom=80|offset=190,34
```
````

The block body is **one line** of `key=value` pairs separated by `|`, in any order. Only `file` is required.

````markdown
```rich-view
file=system.drawio
```
````

An **empty** block is valid too: the plugin shows an *Import file* button and writes `file=` for the user. Prefer
writing `file=` yourself when the user names the file.

## Keys

| Key | Example | Meaning |
|-----|---------|---------|
| `file` | `file=a/b.drawio` | Required. Vault path, or a bare file name. The extension picks the viewer: `.pptx` slides, `.vsdx` Visio, otherwise draw.io. |
| `page` | `page=Overview` | Page by **exact** name. draw.io and Visio only. |
| `page-index` | `page-index=2` | Page or slide by position, **counting from 1**. The only page key a `.pptx` understands. |
| `height` | `height=600` | Viewer height in px. Default 400. |
| `zoom` | `zoom=80` | Starting zoom in percent. Left out: the page is fitted to the viewer. |
| `offset` | `offset=190,34` | Starting pan position `x,y`. draw.io and Visio. Left out: centred. |

Rules the parser follows (so you can predict what a block does):

- **`page` wins over `page-index`** when both are present. A page can be *named* `Page-2` or `80` (Visio's default
  names), so `page=` is always an exact name and never read as a number.
- **Unknown keys are ignored**, not errors. A misspelt key silently does nothing, so check spelling.
- A segment without `=`, or with an empty value, is skipped.
- Keys are case-insensitive; values are kept as written.
- Whitespace around keys and values is trimmed.

## Choosing the `file=` value

- Use the **vault-relative path** with forward slashes (`1-areas/net/arch.drawio`), no leading slash.
- A **bare name** (`arch.drawio`) also works: the plugin falls back to Obsidian's link lookup relative to the note.
  It stops working if two files share the name or the file is renamed; a full path is safer when the user asked for a
  specific file.
- Check the file exists in the vault before writing the block. A missing file shows a "File not found" card with a
  *Choose another file* button, not the diagram.

## Writing a block

1. Read the note and find where the block goes.
2. Confirm the target file exists and note its extension.
3. For a multi-page file, ask which page if the user did not say. Do not guess a page name: take it from the file or
   from an existing block, and prefer `page-index` when the name is unknown.
4. Insert the fenced block with `Edit`. A fence of three backticks is normal; use four or more only if the body would
   contain backticks (a file name with a backtick).

## Modifying an existing block

Change only the keys the user asked for and keep the rest on the line as they were.

- **Another file:** replace `file=`. Drop `page`, `page-index`, `zoom` and `offset`: they describe the old file's
  content and are meaningless for a different one. Keep `height`. (This is what the plugin's own *Switch file* does.)
- **Another page:** replace `page=` or `page-index=`. If the page changes, `zoom` and `offset` usually no longer fit
  either: drop them unless the user wants to keep them.
- **Fit to the viewer:** remove `zoom` and `offset`.
- **Taller or shorter:** set `height`.

Do not try to compute `zoom` or `offset` for a view the user describes ("show the top-left corner"): they depend on the
viewer's size on screen. Offer to have the user position the view and press the toolbar's *Pin current view* button, or
*Copy as code block*, which write the exact values.

## What the plugin does for itself

Nothing here needs an agent:

- **Shape libraries** (draw.io): the plugin detects extra libraries (AWS, Azure, Cisco...) and offers the download.
  Do **not** invent a `libs=` key.
- **Shape links** live inside the `.drawio` file, not in the block. Users edit them with the plugin's own *Edit link*
  button; do not edit the diagram XML to change them.
- Dark mode, page tabs for multi-page files, zoom and pan are automatic.

## What this skill is not for

The plugin is a **viewer**. It cannot create or edit what a diagram or slide contains. For that the user needs draw.io,
Visio or PowerPoint. Do not edit the files to change a diagram unless the user explicitly asks for that. For a file
type the plugin does not open (an image, a Word document), use a normal Markdown embed instead.

## What the plugin keeps in sync for you

You usually do not need to fix references after moving files:

- **Rename or move a `.drawio` / `.vsdx` / `.pptx` in Obsidian** and the plugin rewrites `file=` in every block that
  named it. It does not do this for files moved outside Obsidian, or from the shell.
- If you rename or move such a file yourself with a shell command, update the blocks that name it.

## Reading blocks

To find which notes embed a file or which files a note shows, search for the fence:

```bash
grep -rn --include='*.md' -A1 '```rich-view' <vault>
```

The `file=` value may be a full path or a bare name; compare by the file's base name too. A block inside a callout or
list is indented or prefixed with `> `.

## Further reading

| Topic | Reference |
|-------|-----------|
| Differences between draw.io, Visio and PowerPoint, and what each cannot show | [references/formats.md](references/formats.md) |
| Complete example blocks | [references/examples.md](references/examples.md) |
