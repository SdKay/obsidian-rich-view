<div align="center">

<p>
  <b>🔍 Zoom &nbsp;·&nbsp; 🖱️ Pan &nbsp;·&nbsp; 📄 Multi-page &nbsp;·&nbsp; 🎞️ Slides &nbsp;·&nbsp; 🗂️ Open in a tab &nbsp;·&nbsp; 🔗 Shape links &nbsp;·&nbsp; 🔎 Magnifier &nbsp;·&nbsp; ⤢ Fullscreen &nbsp;·&nbsp; 📦 Third-party libs &nbsp;·&nbsp; 🖍️ Search highlight &nbsp;·&nbsp; 🌙 Dark mode</b>
</p>

<p>
  <a href="https://github.com/SdKay/obsidian-rich-view/releases/latest">
    <img src="https://img.shields.io/github/v/release/SdKay/obsidian-rich-view?style=flat-square&color=7c3aed" alt="Latest release" />
  </a>
  <a href="https://github.com/SdKay/obsidian-rich-view/releases">
    <img src="https://img.shields.io/github/downloads/SdKay/obsidian-rich-view/total?style=flat-square&color=brightgreen" alt="Total downloads" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/SdKay/obsidian-rich-view?style=flat-square" alt="License" />
  </a>
  <a href="https://obsidian.md/plugins?id=rich-view">
    <img src="https://img.shields.io/badge/Obsidian-Community_Plugin-7c3aed?style=flat-square&logo=obsidian&logoColor=white" alt="Obsidian community plugin" />
  </a>
</p>

<p>
  <a href="#features">Features</a> ·
  <a href="#demo">Demo</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#open-a-file-in-its-own-tab">Tabs</a> ·
  <a href="#search-with-rich-search">Search</a> ·
  <a href="#shape-libraries">Shape Libraries</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#installation">Install</a> ·
  <a href="README_CN.md">中文</a>
</p>

<p>
  <img src="wechat.jpg" alt="WeChat public account" width="120" />
  <br/><sub>Follow on WeChat for more Obsidian plugins &amp; tools</sub>
</p>

<table>
  <thead>
    <tr><th colspan="3">Other plugins I build</th></tr>
    <tr><th>Plugin</th><th>Description</th><th>Install page</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="https://github.com/SdKay/obsidian-rich-table"><b>Rich Table</b></a></td>
      <td>Spreadsheet-like tables in notes, plus an Excel viewer; searchable from Rich Search</td>
      <td><a href="obsidian://show-plugin?id=rich-table">Open in Obsidian</a></td>
    </tr>
    <tr>
      <td><a href="https://github.com/SdKay/obsidian-rich-search"><b>Rich Search</b></a></td>
      <td>
        <b>Search:</b> scope, regex, whole word, history<br/>
        <b>Across files:</b> finds text inside draw.io, Visio and PowerPoint files and marks the match when you open it
      </td>
      <td><a href="obsidian://show-plugin?id=rich-search">Open in Obsidian</a></td>
    </tr>
  </tbody>
</table>

</div>

Show draw.io, Visio and PowerPoint files right inside your notes. Zoom, pan, flip through pages, follow shape links. Word, CAD and more are on the list.

---

## Features

- **Embed in a note** with a `rich-view` code block. Insert an empty one and click **Import file**.
- **draw.io, Visio, PowerPoint**: `.drawio`, `.vsdx`, `.pptx`.
- **Zoom, pan, magnifier.** Slides show one at a time and always fit.
- **Page tabs** for diagram pages and slides.
- **Open in a tab**: click the file in the explorer, no code block needed.
- **Searchable** from Rich Search. Click a result and it jumps to the page or slide and marks the match.
- **Shape links** on draw.io shapes.
- **Pin the view** (page, zoom, position) into the code block.
- **Third-party shape libraries** (AWS, Azure, GCP, Cisco...), downloaded on demand.
- **Fullscreen**, resizable height, **dark mode**, works on mobile.

---

## Demo

<!-- To add a demo: save the GIF under the name shown in each comment below, in docs/, then delete the "coming soon" line and the comment markers around the image line. -->

### Embed a file in a note

Insert an empty `rich-view` block, click **Import file**, pick a file. Done.

> 🎬 *Demo GIF coming soon*
<!-- ![Embed a file demo](docs/demo-01-embed.gif) -->

### Zoom, pan and pin

Scroll to zoom, drag to pan, magnifier for small print. Pin to save the view.

> 🎬 *Demo GIF coming soon*
<!-- ![Zoom, pan and pin demo](docs/demo-02-zoom-pin.gif) -->

### Slides and pages

Slides and diagram pages switch with tabs.

> 🎬 *Demo GIF coming soon*
<!-- ![Slides and pages demo](docs/demo-03-pages.gif) -->

### Open in a tab

Click a file in the explorer. It opens full size.

> 🎬 *Demo GIF coming soon*
<!-- ![File tab demo](docs/demo-04-tab.gif) -->

### Search inside diagrams and slides

Search a word in Rich Search, click a result. The file opens at the right page, zooms in, and the match is marked.

> 🎬 *Demo GIF coming soon*
<!-- ![Search demo](docs/demo-05-search.gif) -->

### Shape links and libraries

Hover a shape, click ✎ to add a link. Missing shape libraries download in one click.

> 🎬 *Demo GIF coming soon*
<!-- ![Shape links and libraries demo](docs/demo-06-links-libraries.gif) -->

---

## Usage

Put the file anywhere in the vault and embed it with a `rich-view` block. Easiest: insert an **empty** block and click **Import file**.

Or write it yourself:

````markdown
```rich-view
file=my-diagram.drawio
```
````

Everything else is `key=value`, separated by `|`, in any order:

````markdown
```rich-view
file=my-diagram.drawio|page=my_page|height=600|zoom=80|offset=190,34
```
````

| Key | Example | What it does |
|-----|---------|--------------|
| `file` | `file=my-diagram.drawio` | Required. Vault path or bare name. |
| `page` | `page=my_page` | Page by exact name (diagrams). Default: first page. |
| `page-index` | `page-index=2` | Page or slide by position, from 1. Ignored if `page=` is set. |
| `height` | `height=600` | Height in px. Default: 400. |
| `zoom` | `zoom=80` | Starting zoom in %. Default: auto-fit. |
| `offset` | `offset=190,34` | Starting pan position (diagrams). Default: centred. |

---

## Open a file in its own tab

Click a `.drawio`, `.vsdx` or `.pptx` in the file explorer. It opens in a normal tab with the same zoom, pan and pages as the embedded viewer.

Don't want it? Turn a format off under **Settings → Rich View → File tabs**, e.g. if another plugin should open `.drawio`. Reload the plugin to apply.

---

## Search with Rich Search

With [Rich Search](https://github.com/SdKay/obsidian-rich-search) installed, text inside your files is searchable like your notes:

| Format | What's searched | A result opens at |
|---|---|---|
| draw.io | Every shape's label, all pages | The page, shape marked |
| Visio | Every shape's text, all pages | The page, shape marked |
| PowerPoint | Every text box and table cell | The slide, keyword marked |

- While the search panel is open, every match in the open file is marked. The one you clicked is brighter, with an outline. The colour is the one you set in Rich Search.
- If the diagram is too small to read, it zooms in until the text is about as big as your note text.
- PowerPoint marks the keyword itself when it can measure the text, otherwise the whole text box. draw.io and Visio mark the whole shape.
- No Rich Search? Files open as usual, just without marks.

---

## Shape Libraries

If a diagram uses extra libraries (AWS, Azure, GCP, Cisco, IBM...), a banner shows up the first time you open it. Click **Download**: the libraries come from draw.io's official repo and are kept locally for next time.

**Settings → Rich View → Shape libraries** lets you:
- Browse and download libraries by category
- **Auto-detect from vault**: find every library your diagrams need
- Set a **custom folder** for your own shapes

---

## Controls

Under every viewer: page tabs on the left, the zoom level, then icon buttons on the right.

| Icon (hover for the tooltip) | What it does |
|--------|--------|
| 🔍 **Magnifier** | Toggle the magnifier (diagrams) |
| **Auto-fit to viewer** | Fit the whole page to the viewer |
| 📌 **Pin current view** | Save page, zoom and position into the code block |
| 📂 **Switch to another file** | Point this code block at another file |
| ↗ **Open in external editor** | Open in the system default app |
| ⤢ **Fullscreen** | Fill the screen (Esc to exit) |
| **Drag the bottom edge** | Resize the height |

| Gesture | Diagrams | Slides |
|---------|----------|--------|
| **Scroll wheel** | Zoom (or Ctrl+scroll, see Settings) | Scroll |
| **Ctrl + scroll** | Zoom | Zoom |
| **Drag** | Pan | Scroll bars when zoomed in |
| **Two-finger pinch** | Zoom (touch) | — |
| **Double-click** | Back to the starting view | — |

**Tip:** get the view you want and click the pin icon. The code block updates, and the note opens on that view every time. After pinning, double-click goes back to the pinned view; click **Auto-fit to viewer** to start fresh, then pin again.

### Slides

One slide at a time, with numbered tabs. The slide always fits, so shrink the height and it refits. Ctrl+scroll to zoom in, scroll bars to move around. No animations or transitions.

### Shape links

Hover a draw.io shape and click **✎** to link it to a note or a URL. Click the shape to follow the link (which click depends on **Click behavior**).

### Magnifier

Click 🔍 for a loupe that follows the cursor. **+ / -** resize it, the wheel still zooms. **Esc** or click elsewhere to exit.

---

## Dark mode

Follows Obsidian's theme. Nothing to set up.

---

## Settings

| Setting | What it does |
|---------|-------------|
| **Zoom modifier key** | Zoom with plain scroll or Ctrl+scroll. |
| **Click behavior** | Plain click or Ctrl+click follows a shape link. |
| **File tabs** | Per format: open files in a Rich View tab. Reload the plugin to apply. |
| **Custom library folder** | A vault folder for your own shapes. |
| **Shape libraries** | Download official libraries, or auto-detect from the vault. |

---

## Installation

**Community plugins (recommended):** Settings → Community plugins → Browse → search **Rich View** → Install → Enable.

**Manual:** download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/SdKay/obsidian-rich-view/releases/latest) into `<vault>/.obsidian/plugins/rich-view/`.

Needs Obsidian 1.8.7 or newer.

---

## Known limitations

- Some shapes from draw.io's table and extended sets don't render perfectly.
- Visio: arrowheads are all one generic triangle; fill and line patterns are approximated; elliptical arcs draw as straight lines; shape hyperlinks aren't read; a text box with no outline isn't drawn (so it isn't searchable). No legacy `.vsd`.
- Visio fonts are used only if installed on your computer; otherwise the system font is used.
- PowerPoint: no animations or transitions; SmartArt, charts and embedded fonts are best-effort; no legacy `.ppt`.
- `![[file.drawio]]` embeds don't work. Use the code block.
- In Live Preview, leaving the code block editor can cause a small scroll jump.

---

## Development

```bash
npm install
npm run dev     # watch
npm test        # unit tests
npm run lint
npm run build   # type-check + production bundle
```

Read [CLAUDE.md](CLAUDE.md) first: architecture, how tests are written, how to release.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SdKay/obsidian-rich-view&type=Date)](https://star-history.com/#SdKay/obsidian-rich-view&Date)

---

## License

[MIT](LICENSE) © 2026 [sdking.xing](https://github.com/SdKay)

---

## Support the Project

Rich View is free and open source. If it saves you time, a donation helps keep it going.

### 💳 PayPal
[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-003087?style=flat-square&logo=paypal&logoColor=white)](https://paypal.me/ssdking)

### 🧧 WeChat Pay / Alipay

| WeChat Pay | Alipay |
|:---:|:---:|
| <img src="docs/wechat-donate.jpg" width="120" alt="WeChat Pay donation QR code" /> | <img src="alipay.jpg" width="120" alt="Alipay donation QR code" /> |

Thanks! 🙏

---

## Feedback

Bugs and ideas: [GitHub Issues](https://github.com/SdKay/obsidian-rich-view/issues)
