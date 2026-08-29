---
name: obsidian-diagram-view
description: >
  Insert and manage diagrams (draw.io today; more formats planned) in
  Obsidian vault notes using the diagram-view plugin. Use when the user
  asks to embed, view, or configure a diagram in a note.
---

# Diagram View — Agent Reference

`diagram-view` is an Obsidian plugin that renders diagrams inline inside
fenced `dv` code blocks. Today that means `.drawio` files; the parser/renderer
layer is split so other formats (e.g. Visio) can be added later without
changing this syntax.

> **Obsidian-only.** The `dv` block will not render in standard Markdown
> editors or GitHub previews.

---

## Block syntax

````markdown
```dv
file=filename.drawio
```
````

Parameters are explicit `key=value` pairs, separated by `|`, in any order.
`file=` is the only required one:

````markdown
```dv
file=filename.drawio|page=<name>|page-index=<N>|height=<px>|zoom=<percent>|offset=<x>,<y>
```
````

| Key | Format | Example | Description |
|-----|--------|---------|-------------|
| `file` | `key=value` | `file=diagram.drawio` | Required. Vault-relative path or bare name. |
| `page` | `key=value` | `page=Backend` | Which page to show, by **exact name**. Default: first page. |
| `page-index` | `key=value` | `page-index=2` | Which page to show, by 1-based position. Ignored if `page=` is also set. |
| `height` | `key=value` | `height=600` | Viewer height in pixels. Default: 400. |
| `zoom` | `key=value` | `zoom=80` | Initial zoom percentage. Default: auto-fit. |
| `offset` | `key=value` | `offset=190,34` | Initial pan position in display pixels. Default: centred. |

There is no bare/positional form — every field needs its key. This is
deliberate: a page can legitimately be *named* "Page-2" or "80" (Visio's own
default page names look exactly like that), and a positional/shape-guessed
format would misfile it as a page index or a zoom level instead of a name.
`page=` is always an exact literal name match; `page-index=` is the
by-position fallback.

### Examples

Minimal — just the filename:
````markdown
```dv
file=architecture.drawio
```
````

Specific page, fixed height:
````markdown
```dv
file=architecture.drawio|page=Backend|height=500
```
````

Saved view with zoom and offset (written by the ⊙ button):
````markdown
```dv
file=architecture.drawio|page=Backend|height=500|zoom=80|offset=190,34
```
````

---

## Inserting a diagram into a note

1. Read the target note with `Read`.
2. Identify the insertion point.
3. Use `Edit` to insert the block:

```
old_string: "## Architecture\n\n"
new_string: "## Architecture\n\n```dv\nfile=architecture.drawio\n```\n\n"
```

The diagram file must already exist in the vault. If it does not exist,
tell the user to create it (in draw.io, for `.drawio` files) and place it in
the vault first.

---

## Filename resolution

- Vault-absolute paths work directly: `file=diagrams/arch.drawio`
- Bare names (`file=arch.drawio`) are resolved via Obsidian's link cache —
  they match regardless of folder.
- Use `normalizePath` conventions: forward slashes, no leading slash.

---

## Updating parameters

To change a parameter (e.g. switch to a different page or set a fixed height),
read the file, locate the `dv` block, and replace the whole parameter line —
every field is independent, so add/remove/edit keys freely:

```
old_string: "```dv\nfile=architecture.drawio\n```"
new_string: "```dv\nfile=architecture.drawio|page=Backend|height=600\n```"
```

Do **not** add a `libs=` field — the plugin manages shape libraries automatically.

---

## What the plugin handles automatically

- **Zoom / pan** — the user interacts with the viewer directly.
- **Magnifier** — a 🔍 toolbar button lets the user inspect fine detail with a
  cursor-following loupe, independent of the code block's zoom/offset params.
  Nothing an agent needs to configure.
- **Shape libraries** — if the diagram uses AWS, Azure, Cisco, or other
  extended shapes, the plugin detects this and prompts the user to download
  the required library. No agent action needed.
- **Dark mode** — automatic.
- **Multi-page tabs** — automatic when the file has multiple pages.

---

## Shape links (read / write)

Shapes in a `.drawio` diagram can carry links to vault notes or external
URLs. These are stored inside the file itself, not in the code block. The
plugin's `✎` button lets users edit links interactively — agents do not need
to manipulate the underlying XML directly.

---

## When NOT to use this skill

- If the user wants to **create or edit** the diagram content (shapes,
  connectors, text), they must use the diagram's native editor (e.g. draw.io
  desktop for `.drawio` files). This plugin is a **viewer only** — it does
  not support editing diagram content.
- If the file is not a supported diagram format (currently only `.drawio`;
  e.g. an SVG or PNG), use a standard Markdown image embed instead.
