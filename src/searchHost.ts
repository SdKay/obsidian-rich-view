import type { App } from 'obsidian';
import type { MatchOptions, OpenedHit, RichSearchHostApi, Span } from './richSearchApi';

type PluginRegistry = { plugins?: Record<string, { api?: unknown } | undefined> };

/**
 * The rich-search host API, or null when rich-search is not installed, is disabled, or
 * publishes something this code does not understand. Looked up on every call, never
 * remembered: rich-search can be enabled, disabled or replaced while a view is open.
 */
export function findSearchHost(app: App): RichSearchHostApi | null {
	const registry = (app as unknown as { plugins?: PluginRegistry }).plugins;
	const api = registry?.plugins?.['rich-search']?.api;
	if (typeof api !== 'object' || api === null) return null;
	const candidate = api as Partial<RichSearchHostApi>;
	if (candidate.apiVersion !== 1 || typeof candidate.matchLine !== 'function') return null;
	return candidate as RichSearchHostApi;
}

/** All matches of `query` in one text unit; empty when there is no host, so callers simply mark nothing. */
export function matchText(host: RichSearchHostApi | null, text: string, query: MatchOptions): Span[] {
	if (!host) return [];
	try {
		const spans = host.matchLine(text, query);
		return Array.isArray(spans) ? spans : [];
	} catch {
		return [];
	}
}

/** What a view needs to know about the search on screen, read from the host (absent pieces mean "not available"). */
export interface LiveSearch {
	query: MatchOptions | null;
	hit: OpenedHit | null;
}

export function readLiveSearch(host: RichSearchHostApi | null): LiveSearch {
	return {
		query: safeCall(() => host?.currentQuery?.() ?? null),
		hit: safeCall(() => host?.currentHit?.() ?? null),
	};
}

function safeCall<T>(read: () => T | null): T | null {
	try {
		return read();
	} catch {
		return null;
	}
}

/**
 * Subscribes to query and opened-hit changes, tolerating a host that predates either.
 * Returns one function that ends every subscription it managed to make.
 */
export function subscribeToSearch(host: RichSearchHostApi | null, listener: () => void): () => void {
	const stops: (() => void)[] = [];
	const add = (subscribe: () => unknown) => {
		try {
			const stop = subscribe();
			if (typeof stop === 'function') stops.push(stop as () => void);
		} catch {
			// A host that cannot subscribe just means no live updates.
		}
	};
	if (host && typeof host.onQueryChange === 'function') add(() => host.onQueryChange?.(listener));
	if (host && typeof host.onHitChange === 'function') add(() => host.onHitChange?.(listener));
	return () => {
		for (const stop of stops.splice(0)) {
			try { stop(); } catch { /* already gone */ }
		}
	};
}
