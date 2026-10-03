import type { App } from 'obsidian';
import { openDiagramFilePicker } from './diagramFilePicker';
import { buildSwitchFileParams, type ViewOptions } from './viewParams';

/**
 * The shared "switch the loaded file" action: pick a vault file, then write
 * the new `file=` back into the code block. Format-agnostic, so every viewer
 * offers it identically.
 */
export function switchFile(
	app: App,
	options: ViewOptions,
	writeParams: (newParams: string) => Promise<void>,
): void {
	openDiagramFilePicker(app, file => {
		writeParams(buildSwitchFileParams(file.path, options.height))
			.catch((err: unknown) => console.error('switchFile:', err));
	});
}
