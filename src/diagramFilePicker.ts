import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import { t } from './i18n';

const DIAGRAM_EXTENSIONS = ['drawio', 'vsdx'];

/**
 * Fuzzy file picker scoped to `.drawio`/`.vsdx` files already in the vault —
 * modeled on obsidian-rich-table's xlsxFilePicker.ts. Vault files only, not
 * an OS-native "any file on disk" dialog: the chosen file's path is written
 * straight into the code block's `file=` param, so it must already be
 * something `resolveRelative()` in main.ts can resolve.
 */
class DiagramFilePickerModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private readonly onChoose: (file: TFile) => void) {
		super(app);
		this.setPlaceholder(t('importFilePickerPlaceholder'));
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter(f => DIAGRAM_EXTENSIONS.includes(f.extension.toLowerCase()));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}

/** Opens the picker, or — if the vault has no diagram files at all — shows a
 *  Notice instead, rather than opening a modal with nothing to search. */
export function openDiagramFilePicker(app: App, onChoose: (file: TFile) => void): void {
	const hasAny = app.vault.getFiles().some(f => DIAGRAM_EXTENSIONS.includes(f.extension.toLowerCase()));
	if (!hasAny) {
		new Notice(t('noDiagramFilesInVault'));
		return;
	}
	new DiagramFilePickerModal(app, onChoose).open();
}
