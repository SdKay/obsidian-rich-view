<div align="center">

<img src="./diagram-view-demo.gif" alt="Diagram View demo" width="720" />

<p>
  <b>🔍 Zoom &nbsp;·&nbsp; 🖱️ Pan &nbsp;·&nbsp; 📄 Multi-page &nbsp;·&nbsp; 🔗 Shape links &nbsp;·&nbsp; 🔎 Magnifier &nbsp;·&nbsp; 📦 Third-party libs &nbsp;·&nbsp; 🌙 Dark mode</b>
</p>

<p>
  <a href="https://github.com/SdKay/obsidian-diagram-view/releases/latest">
    <img src="https://img.shields.io/github/v/release/SdKay/obsidian-diagram-view?style=flat-square&color=7c3aed" alt="Latest release" />
  </a>
  <a href="https://github.com/SdKay/obsidian-diagram-view/releases">
    <img src="https://img.shields.io/github/downloads/SdKay/obsidian-diagram-view/total?style=flat-square&color=brightgreen" alt="Total downloads" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/SdKay/obsidian-diagram-view?style=flat-square" alt="License" />
  </a>
  <a href="https://obsidian.md/plugins?id=diagram-view">
    <img src="https://img.shields.io/badge/Obsidian-Community_Plugin-7c3aed?style=flat-square&logo=obsidian&logoColor=white" alt="Obsidian community plugin" />
  </a>
</p>

<p>
  <a href="README_CN.md">中文文档</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#shape-libraries">Shape Libraries</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#installation">Installation</a>
</p>

<p>
  <img src="wechat.jpg" alt="WeChat public account" width="120" />
  <br/><sub>Follow on WeChat for more Obsidian plugins &amp; tools</sub>
</p>

<p>
  🧩 Also check out <b>Rich Table</b> — interactive tables with merges, typed columns, styles, and wikilinks:
  <a href="https://github.com/SdKay/obsidian-rich-table">GitHub</a> ·
  <a href="obsidian://show-plugin?id=rich-table">Install from Store</a>
</p>

</div>

Render diagrams inline inside your Obsidian notes — with smooth zoom, pan, multi-page tabs, shape links, and full support for third-party shape libraries. Today that means [draw.io](https://www.drawio.com/) `.drawio` files; more diagram formats are planned.

---

## Usage

Place your diagram file anywhere in the vault, then embed it with a fenced `dv` code block:

````markdown
```dv
file=my-diagram.drawio
```
````

Every other field is an explicit `key=value` pair, separated by `|`, in any order:

````markdown
```dv
file=my-diagram.drawio|page=my_page|height=600|zoom=80|offset=190,34
```
````

| Key | Format | Example | Description |
|-----|--------|---------|-------------|
| `file` | `key=value` | `file=my-diagram.drawio` | Required. Vault-relative path or bare name. |
| `page` | `key=value` | `page=my_page` | Which page to display, by exact name. Default: first page. |
| `page-index` | `key=value` | `page-index=2` | Which page to display, by 1-based position. Ignored if `page=` is also set. |
| `height` | `key=value` | `height=600` | Viewer height in pixels. Default: 400. |
| `zoom` | `key=value` | `zoom=80` | Initial zoom level (%). Default: auto-fit. |
| `offset` | `key=value` | `offset=190,34` | Initial pan position. Default: centred. |

Only `file=` is required; the rest can appear in any order.

---

## Shape Libraries

If your diagram uses extended shape libraries (AWS, Azure, GCP, Cisco, Electrical, IBM, and many more), the plugin will detect this automatically and show a **download banner** the first time you open it.

Click **Download** — the missing libraries are fetched from draw.io's official repository, saved locally, and reused for all future diagrams. The banner also has a **Settings** shortcut if you prefer to manage libraries manually.

Go to **Settings → Diagram View → Shape Libraries** to:
- Browse and download official libraries by category
- Use **Auto-detect from vault** to find all libraries needed by your existing diagrams
- Set a **custom folder** for your own shape files

---

## Controls

| Action | Result |
|--------|--------|
| **Scroll wheel** | Zoom in / out |
| **Drag** | Pan the diagram |
| **Two-finger pinch** | Pinch-zoom (touch / mobile) |
| **Double-click** | Reset to initial view |
| **Drag bottom edge** | Resize viewer height |
| **↗** | Open file in system default editor |
| **⛶** | Auto-fit to the viewer's current size |
| **🔍** | Toggle the magnifier |
| **⊙** | Save current view back into the code block |
| **Page tabs** | Switch pages (multi-page diagrams) |

**Tip:** pan and zoom to the view you want, then click ⊙. The code block updates in-place and that view is restored every time you open the note. Once a specific zoom/offset is saved this way, double-click restores *that* saved view rather than auto-fitting — click ⛶ to get back to a fresh auto-fit (e.g. after resizing the viewer), then ⊙ again to save it.

### Shape links

Hover any shape to see a **✎** button. Click it to attach a link to a vault note or external URL. To follow the link, click the shape (exact key depends on the *Click behavior* setting).

### Magnifier

Click **🔍** to inspect fine detail without changing your zoom/pan. A circular loupe follows the cursor at a fixed magnification; **+ / -** change its size. Scroll wheel still zooms the main view as usual. Press **Esc** or click anywhere else to exit.

---

## Dark mode

The viewer automatically adapts to Obsidian's dark theme — no configuration needed.

---

## Settings

| Setting | Description |
|---------|-------------|
| **Zoom modifier key** | Plain scroll or Ctrl+scroll to zoom. |
| **Click behavior** | Whether a plain click or Ctrl+click follows a shape link. |
| **Custom library folder** | A vault folder for your own shape files. |
| **Shape Libraries** | Download official libraries; auto-detect from vault. |

---

## Installation

### Community plugin marketplace (recommended)

1. **Settings → Community plugins → Browse**
2. Search **Diagram View** → Install → Enable

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/SdKay/obsidian-diagram-view/releases/latest) and copy them to `<vault>/.obsidian/plugins/diagram-view/`.

---

## Known limitations

- Some shapes from draw.io's table or extended shape sets may not render perfectly.
- `![[file.drawio]]` wiki-embed syntax is not supported — use the code block instead.
- In Live Preview, exiting the code block editor can cause a small scroll shift (under investigation).

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SdKay/obsidian-diagram-view&type=Date)](https://star-history.com/#SdKay/obsidian-diagram-view&Date)

---

## License

[MIT](LICENSE) © 2026 [sdking.xing](https://github.com/SdKay)
