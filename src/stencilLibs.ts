import { App, Component } from 'obsidian';
import { OFFICIAL_LIBS, stencilManager } from './stencilManager';
import type { RichViewSettings } from './settings';

/** What the stencil-library support needs from the viewer that owns it. */
export interface StencilLibsHost {
	/** Re-render the current page after libs finished downloading. */
	rerender(): void;
	/** The XML of the page currently shown (stencil libs are a draw.io-only concept). */
	currentPageXml(): string;
}

/**
 * draw.io's third-party shape libraries: registers locally cached libs and
 * inline SVGs before the first paint, and — for libs that are missing —
 * shows a banner offering to download them. Visio never uses this.
 */
export class StencilLibs extends Component {
	private readonly bannerEl: HTMLElement;
	/** Libs (stencil stems) waiting for the user to trigger a download. */
	private pendingStencils: string[] = [];
	/** SVG image ref paths waiting for the user to trigger a download. */
	private pendingImages: string[] = [];
	private unloaded = false;

	constructor(
		parent: HTMLElement,
		private readonly app: App,
		private readonly settings: RichViewSettings,
		private readonly stencilsDir: string,
		private readonly host: StencilLibsHost,
	) {
		super();
		this.bannerEl = parent.createDiv({ cls: 'drawing-view-libs-banner' });
	}

	onunload(): void {
		this.unloaded = true;
		this.bannerEl.remove();
	}

	private get userDir(): string | null {
		return this.settings.customStencilDir?.trim() || null;
	}

	/**
	 * Register locally-cached stencil libs and inline locally-cached SVGs, then
	 * return the render-ready XML. Runs BEFORE the first paint so everything
	 * already on disk renders in one pass. Genuinely-missing (network-required)
	 * libs are detected in the background and surfaced via the banner — they
	 * never block or double-render.
	 */
	async prepareForRender(pageXml: string): Promise<string> {
		const adapter = this.app.vault.adapter;

		const neededLibs = stencilManager.detectUsedLibs(pageXml);
		if (neededLibs.length > 0) {
			await stencilManager.registerLocalLibs(neededLibs, pageXml, adapter, this.stencilsDir, this.userDir);
		}
		const { xml, missing: missingImages } = await stencilManager.preloadImages(
			pageXml, adapter, this.stencilsDir,
		);

		void this.checkMissing(neededLibs, missingImages);
		return xml;
	}

	private async checkMissing(neededLibs: string[], missingImages: string[]): Promise<void> {
		const missingStencils = await stencilManager.findMissingLibs(
			neededLibs, this.app.vault.adapter, this.stencilsDir, this.userDir,
		);
		if (this.unloaded) return;

		this.pendingStencils = missingStencils;
		this.pendingImages = missingImages;

		if (missingStencils.length === 0 && missingImages.length === 0) {
			this.bannerEl.removeClass('is-visible');
			return;
		}

		// Human-readable names: stencil libs by catalog name, image refs by
		// their top-level lib folder (e.g. "ibm/social/x.svg" → "IBM").
		const stencilNames = missingStencils.map(lib =>
			OFFICIAL_LIBS.find(e => e.file === lib)?.name ?? lib);
		const imageLibStems = [...new Set(missingImages.map(r => r.split('/')[0]!))];
		const imageNames = imageLibStems.map(stem =>
			OFFICIAL_LIBS.find(e => e.file === stem)?.name ?? stem);
		this.showBanner([...new Set([...stencilNames, ...imageNames])]);
	}

	private addBannerButton(parent: HTMLElement, text: string, cls: string, onClick: () => void): void {
		const btn = parent.createSpan({
			cls,
			attr: { role: 'button', tabindex: '0' },
			text,
		});
		this.registerDomEvent(btn, 'click', onClick);
		this.registerDomEvent(btn, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
		});
	}

	private showBanner(names: string[]): void {
		const banner = this.bannerEl;
		banner.empty();

		const msg = banner.createSpan({ cls: 'drawio-libs-banner-msg' });
		msg.appendText(`⚠ Missing shape libraries: ${names.join(', ')} `);
		msg.createSpan({ cls: 'drawio-libs-banner-hint', text: '— download here or in plugin settings' });

		const actions = banner.createDiv('drawio-libs-banner-actions');
		this.addBannerButton(actions, 'Download', 'drawio-libs-banner-btn drawio-libs-banner-btn-primary',
			() => { void this.downloadPending(); });
		this.addBannerButton(actions, 'Settings', 'drawio-libs-banner-btn', () => { this.openPluginSettings(); });
		this.addBannerButton(actions, '✕', 'drawio-libs-banner-btn', () => { banner.removeClass('is-visible'); });

		banner.addClass('is-visible');
	}

	/** Open Obsidian's settings dialog on this plugin's tab. */
	private openPluginSettings(): void {
		const setting = (this.app as unknown as {
			setting?: { open(): void; openTabById(id: string): void };
		}).setting;
		setting?.open();
		setting?.openTabById('rich-view');
	}

	private async downloadPending(): Promise<void> {
		const banner = this.bannerEl;
		const adapter = this.app.vault.adapter;
		const stencils = this.pendingStencils;
		const images = this.pendingImages;

		banner.empty();
		const msg = banner.createSpan({ cls: 'drawio-libs-banner-msg', text: 'Downloading…' });

		const results = await Promise.allSettled([
			...stencils.map(lib => stencilManager.downloadLib(lib, adapter, this.stencilsDir)),
			...images.map(ref => stencilManager.downloadImage(ref, adapter, this.stencilsDir)),
		]);
		// Unloaded while the downloads were in flight — the banner DOM is stale
		// and re-rendering would resurrect a renderer nothing will ever destroy().
		if (this.unloaded) return;

		if (results.some(r => r.status === 'rejected')) {
			banner.empty();
			banner.createSpan({
				cls: 'drawio-libs-banner-msg drawio-libs-banner-error',
				text: 'Some downloads failed — check your network and reload.',
			});
			this.addBannerButton(banner.createDiv('drawio-libs-banner-actions'), '✕', 'drawio-libs-banner-btn',
				() => { banner.removeClass('is-visible'); });
			return;
		}

		msg.setText('Done — rendering…');
		// Register the newly downloaded libs, then re-render once.
		await stencilManager.registerLocalLibs(stencils, this.host.currentPageXml(), adapter, this.stencilsDir, this.userDir);
		banner.removeClass('is-visible');
		this.host.rerender();
	}
}
