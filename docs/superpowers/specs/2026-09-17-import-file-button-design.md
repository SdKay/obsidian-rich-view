# Import-file button for a blank `rich-view` code block

## Problem

Inserting a `rich-view` code block requires the user to hand-write
`file=<path>` (and optionally `page=`/`zoom=`/etc.). There's no discoverable
way to pick a file.

Separately: notes converted from the pre-rewrite `drawio-view` format still
carry the *old* positional syntax (e.g. `file.drawio|440px|页名|54%|(418,
15)`). `viewParams.ts` today only understands `key=value` pairs — a bare
token like `440px` or `54%` has no `=` and is silently ignored (`if (eq ===
-1) continue`). So any note still in the old positional format has been
silently degraded to file-only defaults (page/zoom/offset lost) since the
`viewParams.ts` rewrite. Fixing this migration is in scope for this change,
since the import-button write-back and the legacy-format write-back share
the same code path (silently rewriting a code block's params via
`vault.process()`).

## Scope

1. A blank `rich-view` code block (`source.trim() === ''`) renders an
   "Import file" button instead of the current `No filename specified`
   error.
2. A non-empty block that uses the *old* positional format is detected and
   silently rewritten to the new explicit format (recovering all fields it
   can), rather than silently losing every param past the filename.
3. Clicking "Import file" opens a vault-scoped fuzzy file picker
   (`.drawio`/`.vsdx` only); choosing a file writes `file=<path>` into the
   code block and lets the normal viewer take over.

Out of scope: writing zoom/offset/page on import (relies on existing
`zoom=0` auto-fit), an OS-native file dialog (vault files only, consistent
with `LinkEditorModal`/`xlsxFilePicker.ts` precedent), any change to the
`⊙`/resize/apply-view write-back paths (untouched).

## 1. Blank-block import button

`main.ts`'s code-block processor currently does:

```ts
const options = parseViewParams(source.trim());
if (!options.filename) {
	el.createDiv({ cls: 'drawing-view-error', text: 'No filename specified. Use `file=<name>`.' });
	return;
}
```

New branch, checked *before* the existing `!options.filename` error, and
only for a literally empty block:

```ts
if (!source.trim()) {
	renderImportPrompt(el, () => openDiagramFilePicker(this.app, (file: TFile) => {
		void this.writeBlockParams(ctx.sourcePath, ctx.getSectionInfo(el), source, `file=${file.path}`);
	}));
	return;
}
```

- `renderImportPrompt` builds the same `<span role="button">` + keydown
  pattern used elsewhere (`drawing-view-open-btn` etc.), labelled "Import
  file" / "导入文件" (new `i18n.ts` key `importFile`).
- `writeBlockParams(sourcePath, sectionInfo, originalSource, newParams)` is
  a new private helper extracted from `RichCodeBlock.rewrite()`'s existing
  logic (currently an instance method on `RichCodeBlock`, tied to a live
  code-block instance) — generalized to a plain function so both
  `RichCodeBlock`'s `⊙`-button write-back and this blank-block import path
  can call it. Same two-path behavior as today's `rewrite()`: precise
  line replacement via `sectionInfo` when available, else the
  original-content regex match (here `originalSource` is `''`, so the
  regex fallback degenerates to matching an empty-body `rich-view` fence —
  still correct, just worth naming explicitly since it's a new edge case
  `rewrite()` never previously hit).
- Looks up the note (`vault.getAbstractFileByPath(sourcePath)`) and calls
  `vault.process()` on it — same atomic-write mechanism already used for
  the `⊙` button.
- Obsidian re-runs the code-block processor after the file write (as it
  already does for `⊙`/resize param updates), so no manual re-render call
  is needed — the next processor pass sees non-empty `source` with
  `file=<path>` and renders the real `DrawingViewer`.
- A block that has *some* content but is still missing `file=` (e.g. the
  user typed `height=300` and stopped) keeps today's error message
  unchanged — the import button is blank-block-only, per your answer.

## 2. Old positional-format migration

Add a pure function (new file `legacyParams.ts`, or exported from
`viewParams.ts` — leaning toward the latter, one small function, same
module it's migrating *into*) that recognizes the pre-rewrite bare-token
format and converts it:

```ts
export function migrateLegacyParams(paramStr: string): string | null
```

- Returns `null` if `paramStr` already looks like the current format (any
  segment contains `=`) — no-op, most common case.
- Otherwise, splits on `|` (same separator) and classifies each bare token
  using the *exact* regexes from the pre-rewrite parser (recovered from git
  history at `4140dd4:src/parser.ts`):
  - `/\.(drawio|xml)$/i` → `file=`
  - `/^page[-\s]?(\d+)$/i` → `page-index=<N>`. The old parser treated the
    captured N as 1-based (`pageIndex = N - 1` internally), which matches
    today's `page-index=` semantics exactly — pass N through unchanged.
  - `/^(\d+(?:\.\d+)?)%$/` → `zoom=`
  - `/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/` → `offset=`
  - `/^\d+px$/i` → `height=` (strip the `px` suffix)
  - anything else non-empty → `page=` (the old parser's fallback, for a
    literal page name like `页名`)
  - a token that also matches `.vsdx` — extend the file regex to
    `/\.(drawio|xml|vsdx)$/i` since Visio didn't exist when this format was
    original, but a migrated note could theoretically reference one now.
- If no token matched a file extension, return `null` (not actually the
  legacy format — e.g. a genuinely malformed/unrelated block; don't touch
  it).
- Classification order matters and must match the old parser's own
  `if`/`else if` chain exactly: file-extension check first, then
  `page-N`, then `%`, then `(x,y)`, then `NNpx`, with bare-page-name as the
  final catch-all. This preserves the old parser's own disambiguation of
  edge cases — e.g. Visio's own default page names can literally be `"80"`
  or `"Page-2"` (see `viewParams.ts`'s docstring on why the *current*
  parser deliberately avoids shape-sniffing at all) — the migration
  function inherits the old parser's judgment calls here rather than
  re-deciding them, since it's reproducing legacy behavior, not improving
  it.
- Otherwise return the new-format string, e.g.
  `file=diagram.drawio|height=440|page=页名|zoom=54|offset=418,15`.

Call site: in the code-block processor, before `parseViewParams`:

```ts
const migrated = migrateLegacyParams(source.trim());
const options = parseViewParams(migrated ?? source.trim());
if (migrated) {
	// Silent rewrite, same writeBlockParams() helper as the import-button write-back (§1).
	void this.writeBlockParams(ctx.sourcePath, ctx.getSectionInfo(el), source, migrated);
}
```

The rewrite is fire-and-forget (`void`) since the *current* render should
proceed immediately using the migrated in-memory params — no need to wait
for the file write before painting the diagram. Obsidian will re-invoke the
processor once the write lands, which is harmless (same params, re-parsed
from the now-updated source).

## 3. Vault file picker

New file `diagramFilePicker.ts`, directly modeled on
`obsidian-rich-table/src/xlsxFilePicker.ts`:

```ts
class DiagramFilePickerModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private readonly onChoose: (file: TFile) => void) {
		super(app);
		this.setPlaceholder(t('importFilePickerPlaceholder'));
	}
	getItems(): TFile[] {
		return this.app.vault.getFiles().filter(f => ['drawio', 'vsdx'].includes(f.extension.toLowerCase()));
	}
	getItemText(file: TFile): string { return file.path; }
	onChooseItem(file: TFile): void { this.onChoose(file); }
}

export function openDiagramFilePicker(app: App, onChoose: (file: TFile) => void): void {
	const hasAny = app.vault.getFiles().some(f => ['drawio', 'vsdx'].includes(f.extension.toLowerCase()));
	if (!hasAny) { new Notice(t('noDiagramFilesInVault')); return; }
	new DiagramFilePickerModal(app, onChoose).open();
}
```

New `i18n.ts` keys: `importFile` (button label/tooltip),
`importFilePickerPlaceholder`, `noDiagramFilesInVault`.

## 4. CSS

New `drawing-view-import-btn` (or reuse `drawing-view-error`'s container
plus a nested button) styled consistently with existing HUD buttons —
`drawing-view-*` prefix, no new namespace.

## Testing

- `migrateLegacyParams` is pure-function, data-in/data-out — add
  `test/viewParams.test.ts` (new, mirroring `visioParser.test.ts`'s
  structure) covering: already-new-format passthrough (`null`), full
  legacy string with all five fields, legacy string with only file+percent,
  a `.vsdx` legacy reference, and a non-matching unrelated block (`null`).
- Blank-block button rendering, the file picker modal, and the
  `vault.process()` write-back all require live Obsidian
  (`Component`/`MarkdownRenderChild`/real vault) — manual verification only,
  per this repo's existing test-scope convention.
