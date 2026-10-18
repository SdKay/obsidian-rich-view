import { App, normalizePath, PluginSettingTab, Setting } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type RichViewPlugin from './main';
import { OFFICIAL_LIBS, stencilManager } from './stencilManager';

export type ZoomModifier = 'none' | 'ctrl';
export type PanModifier = 'none' | 'ctrl';

export interface RichViewSettings {
	/** Whether wheel-zoom requires holding Ctrl/Cmd (avoids zooming while scrolling the note). */
	zoomModifier: ZoomModifier;
	/** 'none': drag=pan, Ctrl+click=follow link.  'ctrl': Ctrl+drag=pan, click=follow link. */
	panModifier: PanModifier;
	/** Vault-relative path to a folder containing custom stencil .xml files. */
	customStencilDir: string;
	/** Open these file types in Rich View's own tab view. Off leaves the extension to another plugin. */
	openInRichView: Record<'drawio' | 'vsdx' | 'pptx', boolean>;
}

export const DEFAULT_SETTINGS: RichViewSettings = {
	zoomModifier: 'none',
	panModifier: 'none',
	customStencilDir: '',
	openInRichView: { drawio: true, vsdx: true, pptx: true },
};

const ZOOM_MODIFIER_OPTIONS: Record<ZoomModifier, string> = {
	none: 'Scroll wheel',
	ctrl: 'Ctrl + scroll wheel',
};

const PAN_MODIFIER_OPTIONS: Record<PanModifier, string> = {
	none: 'Drag to pan · Ctrl+click to follow links',
	ctrl: 'Click to follow links · Ctrl+drag to pan',
};

type FileFormat = keyof RichViewSettings['openInRichView'];

const FILE_FORMATS: { ext: FileFormat; label: string; desc: string }[] = [
	{ ext: 'drawio', label: 'draw.io files (.drawio)', desc: 'Open .drawio files in a Rich View tab. Turn off if another plugin should open them.' },
	{ ext: 'vsdx', label: 'Visio files (.vsdx)', desc: 'Open .vsdx files in a Rich View tab.' },
	{ ext: 'pptx', label: 'PowerPoint files (.pptx)', desc: 'Open .pptx files in a Rich View tab.' },
];

function formatOfKey(key: string): FileFormat | null {
	const ext = key.startsWith('openInRichView.') ? key.slice('openInRichView.'.length) : '';
	return FILE_FORMATS.find(f => f.ext === ext)?.ext ?? null;
}

export class RichViewSettingTab extends PluginSettingTab {
	private readonly plugin: RichViewPlugin;

	constructor(app: App, plugin: RichViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings (Obsidian 1.13+) — surfaces every control in the
	 * app's settings search. `display()` below is kept purely as the
	 * fallback this plugin's minAppVersion (1.8.7) still needs: hosts older
	 * than 1.13.0 have no `getSettingDefinitions` and call `display()`
	 * directly instead.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Zoom modifier key',
				desc: 'How the scroll wheel zooms a diagram. Choose "Ctrl + scroll" to avoid zooming while scrolling through the note.',
				control: {
					type: 'dropdown',
					key: 'zoomModifier',
					options: ZOOM_MODIFIER_OPTIONS,
					defaultValue: DEFAULT_SETTINGS.zoomModifier,
				},
			},
			{
				name: 'Click behavior',
				desc:
					'Controls how clicking and dragging interact with links set on shapes. ' +
					'"Drag to pan" keeps current pan behavior and uses Ctrl+click to follow links. ' +
					'"Click to follow links" makes a plain click follow the link on a shape, and requires Ctrl+drag to pan.',
				control: {
					type: 'dropdown',
					key: 'panModifier',
					options: PAN_MODIFIER_OPTIONS,
					defaultValue: DEFAULT_SETTINGS.panModifier,
				},
			},
			{
				type: 'group',
				heading: 'File tabs',
				items: [
					...FILE_FORMATS.map(format => ({
						name: format.label,
						desc: format.desc,
						control: { type: 'toggle' as const, key: `openInRichView.${format.ext}`, defaultValue: true },
					})),
					{
						name: 'Status',
						desc: 'Changes apply after you turn the plugin off and on again.',
						render: (setting: Setting) => { this.renderRegistrationNotice(setting.descEl); },
					},
				],
			},
			{
				type: 'group',
				heading: 'Shape libraries',
				items: [
					{
						name: 'Custom library folder',
						desc:
							'Vault-relative path to a folder containing your own stencil .xml files. ' +
							'Leave empty to disable. Example: drawio-stencils',
						control: {
							type: 'text',
							key: 'customStencilDir',
							placeholder: 'Drawio-stencils',
							defaultValue: DEFAULT_SETTINGS.customStencilDir,
						},
					},
					{
						// Renders as a full-width custom block (header buttons + a per-library
						// checkbox list), not a name/desc/control row — settingEl is cleared
						// and rebuilt in renderShapeLibrariesInto. name/desc here only feed
						// the settings-search index.
						name: 'Official libraries',
						desc: 'Third-party draw.io shape libraries, downloaded on demand.',
						render: setting => {
							setting.settingEl.empty();
							setting.settingEl.addClass('drawio-libs-setting-block');
							this.renderShapeLibrariesInto(setting.settingEl);
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		const format = formatOfKey(key);
		if (format) return this.plugin.settings.openInRichView[format];
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const format = formatOfKey(key);
		if (format) this.plugin.settings.openInRichView[format] = value === true;
		else (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
	}

	/** @deprecated Fallback for Obsidian < 1.13.0 — see getSettingDefinitions(). */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Zoom modifier key')
			.setDesc(
				'How the scroll wheel zooms a diagram. Choose "Ctrl + scroll" to avoid zooming while scrolling through the note.',
			)
			.addDropdown(dd => {
				for (const [value, label] of Object.entries(ZOOM_MODIFIER_OPTIONS)) dd.addOption(value, label);
				dd.setValue(this.plugin.settings.zoomModifier).onChange(async value => {
					this.plugin.settings.zoomModifier = value as ZoomModifier;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Click behavior')
			.setDesc(
				'Controls how clicking and dragging interact with links set on shapes. ' +
				'"Drag to pan" keeps current pan behavior and uses Ctrl+click to follow links. ' +
				'"Click to follow links" makes a plain click follow the link on a shape, and requires Ctrl+drag to pan.',
			)
			.addDropdown(dd => {
				for (const [value, label] of Object.entries(PAN_MODIFIER_OPTIONS)) dd.addOption(value, label);
				dd.setValue(this.plugin.settings.panModifier).onChange(async value => {
					this.plugin.settings.panModifier = value as PanModifier;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName('File tabs').setHeading();
		for (const format of FILE_FORMATS) {
			new Setting(containerEl)
				.setName(format.label)
				.setDesc(format.desc)
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.openInRichView[format.ext])
					.onChange(async value => {
						this.plugin.settings.openInRichView[format.ext] = value;
						await this.plugin.saveSettings();
					}));
		}
		const status = new Setting(containerEl).setName('Status').setDesc('Changes apply after you turn the plugin off and on again.');
		this.renderRegistrationNotice(status.descEl);

		new Setting(containerEl).setName('Shape libraries').setHeading();

		new Setting(containerEl)
			.setName('Custom library folder')
			.setDesc(
				'Vault-relative path to a folder containing your own stencil .xml files. ' +
				'Leave empty to disable. Example: drawio-stencils',
			)
			.addText(text =>
				text
					.setPlaceholder('Drawio-stencils')
					.setValue(this.plugin.settings.customStencilDir)
					.onChange(async value => {
						this.plugin.settings.customStencilDir = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		this.renderShapeLibrariesInto(containerEl);
	}

	/** One line per extension Obsidian refused, so a draw.io plugin already owning `.drawio` is explained rather than silent. */
	private renderRegistrationNotice(el: HTMLElement): void {
		const refusals = this.plugin.viewRegistry.refusals();
		if (refusals.length === 0) return;
		for (const { ext, reason } of refusals) {
			el.createDiv({ cls: 'rich-view-setting-warning', text: `.${ext} was not taken: Obsidian refused it (${reason}). Another plugin probably opens these files; turn this format off here to stop trying.` });
		}
	}

	/** Builds the header buttons + per-library checkbox list + "Delete all" row into `root`. Shared by the declarative render() entry and the display() fallback. */
	private renderShapeLibrariesInto(root: HTMLElement): void {
		const stencilsDir = normalizePath(
			`${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/stencils`,
		);
		const adapter = this.plugin.app.vault.adapter;

		const libsHeader = root.createDiv({ cls: 'drawio-libs-header' });
		libsHeader.createSpan({ text: 'Official libraries' });
		const headerControls = libsHeader.createDiv({ cls: 'drawio-libs-controls' });

		const selectAllBtn   = headerControls.createEl('button', { text: 'Select all' });
		const deselectAllBtn = headerControls.createEl('button', { text: 'Deselect all' });
		const autoDetectBtn  = headerControls.createEl('button', { text: '⚡ Auto-detect from vault' });
		const downloadBtn    = headerControls.createEl('button', { text: '⬇ Download selected' });

		const checkboxMap = new Map<string, HTMLInputElement>();

		const refreshBadges = async () => {
			const localLibs = await stencilManager.getLocalLibs(adapter, stencilsDir);
			checkboxMap.forEach((_, file) => {
				const row = root.querySelector(`.drawio-lib-row[data-file="${file}"]`);
				const badge = row?.querySelector('.drawio-lib-badge');
				if (!badge) return;
				const isLocal = localLibs.includes(file);
				badge.setText(isLocal ? '✓ Downloaded' : 'Not downloaded');
				badge.toggleClass('is-downloaded', isLocal);
			});
		};

		const listEl = root.createDiv({ cls: 'drawio-libs-list' });
		let currentCategory = '';
		for (const entry of OFFICIAL_LIBS) {
			if (entry.category !== currentCategory) {
				currentCategory = entry.category;
				listEl.createDiv({ cls: 'drawio-libs-category', text: entry.category });
			}
			const row = listEl.createDiv({ cls: 'drawio-lib-row', attr: { 'data-file': entry.file } });
			const checkbox = row.createEl('input', { attr: { type: 'checkbox' } });
			checkboxMap.set(entry.file, checkbox);
			row.createSpan({ cls: 'drawio-lib-name', text: entry.name });
			row.createSpan({ cls: 'drawio-lib-file', text: `(${entry.file}.xml)` });
			row.createSpan({ cls: 'drawio-lib-badge', text: 'Not downloaded' });
		}

		void refreshBadges();

		selectAllBtn.addEventListener('click',   () => checkboxMap.forEach(cb => { cb.checked = true; }));
		deselectAllBtn.addEventListener('click', () => checkboxMap.forEach(cb => { cb.checked = false; }));

		autoDetectBtn.addEventListener('click', () => {
			void (async () => {
				autoDetectBtn.setText('Detecting…');
				autoDetectBtn.disabled = true;
				try {
					const detected = await stencilManager.detectFromVault(this.plugin.app.vault);
					checkboxMap.forEach((cb, file) => { if (detected.includes(file)) cb.checked = true; });
				} finally {
					autoDetectBtn.setText('⚡ Auto-detect from vault');
					autoDetectBtn.disabled = false;
				}
			})();
		});

		downloadBtn.addEventListener('click', () => {
			void (async () => {
				const selected = [...checkboxMap.entries()].filter(([, cb]) => cb.checked).map(([f]) => f);
				if (selected.length === 0) return;
				downloadBtn.disabled = true;
				let done = 0;
				for (const file of selected) {
					try {
						await stencilManager.downloadLib(file, adapter, stencilsDir);
					} catch (err) {
						console.error(`drawio: failed to download ${file}.xml`, err);
					}
					done++;
					downloadBtn.setText(`Downloading ${done}/${selected.length}…`);
				}
				downloadBtn.setText('⬇ Download selected');
				downloadBtn.disabled = false;
				await refreshBadges();
			})();
		});

		new Setting(root)
			.setName('Delete all downloaded libraries')
			.setDesc('Remove all stencil XML files downloaded to the plugin folder.')
			.addButton(btn =>
				btn
					.setButtonText('Delete all')
					.onClick(async () => {
						const libs = await stencilManager.getLocalLibs(adapter, stencilsDir);
						for (const lib of libs) {
							await adapter.remove(normalizePath(`${stencilsDir}/${lib}.xml`));
						}
						await refreshBadges();
					}),
			);
	}
}
