import { App, SuggestModal, TFile } from 'obsidian';

type LinkItem = TFile | string;

/** Fuzzy vault-file picker that also accepts raw URLs. */
export class LinkEditorModal extends SuggestModal<LinkItem> {
	constructor(
		app: App,
		private readonly currentLink: string,
		private readonly onChoose: (link: string) => void,
	) {
		super(app);
		this.setPlaceholder('Search notes or enter a URL…');
	}

	onOpen(): void {
		void super.onOpen();
		if (this.currentLink) {
			// Strip [[...]] so the bare path is shown and matched correctly.
			this.inputEl.value = this.currentLink.replace(/^\[\[(.+)\]\]$/, '$1');
			this.inputEl.dispatchEvent(new Event('input'));
		}
	}

	getSuggestions(query: string): LinkItem[] {
		// Strip [[...]] in case the stored link uses wikilink format.
		const q = query.replace(/^\[\[(.+)\]\]$/, '$1').toLowerCase().trim();
		const files = this.app.vault.getMarkdownFiles()
			.filter(f => !q || f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
			.slice(0, 20);
		// If the input looks like a URL, offer it as a raw-string option at the top.
		if (/^https?:\/\//i.test(query)) return [query, ...files];
		return files;
	}

	renderSuggestion(item: LinkItem, el: HTMLElement): void {
		if (typeof item === 'string') {
			el.createDiv({ text: `URL: ${item}` });
		} else {
			el.createDiv({ text: item.basename });
			el.createEl('small', { cls: 'drawio-link-editor-path', text: item.path });
		}
	}

	onChooseSuggestion(item: LinkItem): void {
		this.onChoose(typeof item === 'string' ? item : item.path);
	}
}
