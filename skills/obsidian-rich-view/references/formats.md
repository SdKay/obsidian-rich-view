# Formats

What differs between the three file types a `rich-view` block can show. The block syntax is the same for all of them.

| | draw.io `.drawio` | Visio `.vsdx` | PowerPoint `.pptx` |
|---|---|---|---|
| Viewer | Infinite canvas: pan, zoom | Infinite canvas: pan, zoom | One slide at a time |
| Pages | Diagram pages | Pages | Slides |
| `page=` | Exact page name | Exact page name | **Not used** |
| `page-index=` | Position from 1 | Position from 1 | Slide number from 1 |
| `zoom=` | Percent | Percent | Percent of the whole slide; left out: whole slide fitted |
| `offset=` | Yes | Yes | **Not used**: the slide scrolls natively once zoomed in |
| Text selectable (for copying) | Hold **Alt** and drag | Hold **Alt** and drag | Plain drag |

`page-index` on a draw.io or Visio file and on a slide deck means the same thing: the position, starting at 1.

## draw.io

- Compressed and uncompressed `<mxGraphModel>` files both open.
- Shape libraries beyond draw.io's built-in set (AWS, Azure, Cisco, IBM...) are downloaded on demand. The first time a
  diagram needs one, a banner offers **Download**; until then those shapes show as plain boxes. Nothing in the block
  controls this.
- Shape links (a link set on a shape in draw.io) can be followed with Ctrl+click, or a plain click if the user chose
  that in the plugin settings.

## Visio

Only `.vsdx` (2013 and later). The old binary `.vsd` is not supported.

Known gaps, where the viewer approximates or leaves something out:

- Arrowheads are drawn as one generic triangle, sized by line weight, not in Visio's numbered styles.
- Fill and line patterns map to a handful of generic textures and dashes.
- Elliptical arcs are drawn as straight lines.
- Hyperlinks set on a shape are not read.
- A plain text box (a shape with no geometry) is not drawn, and neither is text a shape only inherits from its master.
  This also means such text is not searchable.

## PowerPoint

- Vector pictures stored as EMF or WMF (common in decks exported from Office) are converted so they show.
- Slide notes, and (unverified) text inside SmartArt and charts, are not searched.
- A page number in a block that is out of range is clamped to the first or last slide.

Selecting text was checked in a browser against the real controller and styles, not yet in Obsidian itself.

## Reading files, not only blocks

If the user asks what a diagram or deck *says*, the block is not the place: open the file. Neither the block nor the
plugin exposes the text to an agent. Rich Search, when installed, indexes the text of all three formats.
