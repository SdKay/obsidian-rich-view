# Examples

Every example is the whole content of the block, between its fences.

**Just show a file** (first page, fitted to the viewer, 400 px tall):

````markdown
```rich-view
file=architecture/system.drawio
```
````

**A named page of a draw.io or Visio file:**

````markdown
```rich-view
file=architecture/system.drawio|page=Data flow
```
````

**The third page, when the name is unknown or awkward:**

````markdown
```rich-view
file=network/topology.vsdx|page-index=3
```
````

**A slide of a deck, taller than the default:**

````markdown
```rich-view
file=decks/kickoff.pptx|page-index=5|height=520
```
````

**A fixed view of a large diagram** (the exact numbers come from the toolbar's *Copy as code block*, not from a guess):

````markdown
```rich-view
file=architecture/system.drawio|page=Overview|height=460|zoom=54|offset=348,105
```
````

**Inside a callout** (every line of the block gets the `> ` prefix):

````markdown
> [!note] Architecture
> ```rich-view
> file=architecture/system.drawio|height=480
> ```
````

**Page names with spaces or numbers are fine**; they are read as plain text, never as an index:

````markdown
```rich-view
file=plan.vsdx|page=Page-2
```
````

## Mistakes that look like they should work

| Written | What happens |
|---------|--------------|
| `file=deck.pptx\|page=Intro` | `page=` is ignored for a deck: use `page-index=` |
| `file=a.drawio\|pageindex=2` | Unknown key, ignored: the key is `page-index` |
| `file=a.drawio\|page-index=0` | Ignored: positions start at 1 |
| `file=a.drawio\|zoom=80%` | The value is read as `80`; the `%` is harmless |
| `a.drawio\|zoom=80` | No `file=` key: shows a "no file" card with a button to choose one |
| `file=a.drawio` and `zoom=80` on two lines | Read as one block, but the plugin rewrites the block as a single line the next time the user pins a view. Write one line. |
