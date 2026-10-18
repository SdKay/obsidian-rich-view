export type ExtensionOutcome =
	| { status: 'registered' }
	/** The user switched this format off in settings; nothing was attempted. */
	| { status: 'disabled' }
	/** Obsidian (or another plugin's claim on the extension) refused it. */
	| { status: 'refused'; reason: string };

/**
 * Registers the file view for each extension on its own, so one refusal (another plugin
 * already owns `.drawio`) never stops the others and never throws out of `onload`.
 * The record it keeps is what `viewRegistered` answers from.
 */
export class ViewRegistry {
	private readonly outcomes = new Map<string, ExtensionOutcome>();

	register(
		extensions: readonly string[],
		enabled: (ext: string) => boolean,
		registerExtension: (ext: string) => void,
	): void {
		for (const ext of extensions) {
			if (!enabled(ext)) {
				this.outcomes.set(ext, { status: 'disabled' });
				continue;
			}
			try {
				registerExtension(ext);
				this.outcomes.set(ext, { status: 'registered' });
			} catch (err) {
				this.outcomes.set(ext, { status: 'refused', reason: err instanceof Error ? err.message : String(err) });
			}
		}
	}

	isRegistered(ext: string): boolean {
		return this.outcomes.get(ext)?.status === 'registered';
	}

	outcome(ext: string): ExtensionOutcome | undefined {
		return this.outcomes.get(ext);
	}

	/** Extensions Obsidian turned down, with the reason it gave, for the settings tab. */
	refusals(): { ext: string; reason: string }[] {
		const out: { ext: string; reason: string }[] = [];
		for (const [ext, outcome] of this.outcomes) if (outcome.status === 'refused') out.push({ ext, reason: outcome.reason });
		return out;
	}
}
