import type { MatchOptions } from './richSearchApi';

/** What rich-search hands over through `eState.richSearch` when it opens a hit. */
export interface SearchRequest {
	/** Absent when the hit has no position inside the file; the view then opens at its default place. */
	anchor?: unknown;
	query?: MatchOptions;
}

/**
 * Reads `state.richSearch` defensively: it comes from another plugin, so anything that is not
 * the expected shape is treated as "no request" rather than trusted or thrown on.
 */
export function readSearchRequest(state: unknown): SearchRequest | null {
	if (typeof state !== 'object' || state === null) return null;
	const raw = (state as { richSearch?: unknown }).richSearch;
	if (typeof raw !== 'object' || raw === null) return null;
	const { anchor, query } = raw as { anchor?: unknown; query?: unknown };
	const request: SearchRequest = {};
	if (anchor !== undefined) request.anchor = anchor;
	if (isMatchOptions(query)) request.query = query;
	return request;
}

function isMatchOptions(value: unknown): value is MatchOptions {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.query === 'string'
		&& (v.caseSensitive === undefined || typeof v.caseSensitive === 'boolean')
		&& (v.wholeWord === undefined || typeof v.wholeWord === 'boolean')
		&& (v.regex === undefined || typeof v.regex === 'boolean');
}

/**
 * A request can arrive before the viewer has finished loading, or after. This holds it
 * until a consumer is ready and hands it out exactly once, so later reloads of the same
 * file (it changed on disk) do not drag the view back to the hit.
 */
export class PendingSearchRequest {
	private request: SearchRequest | null = null;
	private deliver: ((request: SearchRequest) => void) | null = null;

	/** A new request replaces any that has not been delivered yet. */
	submit(request: SearchRequest): void {
		this.request = request;
		this.flush();
	}

	/** Marks the viewer ready (or not ready, with null); a waiting request is delivered at once. */
	setConsumer(deliver: ((request: SearchRequest) => void) | null): void {
		this.deliver = deliver;
		this.flush();
	}

	private flush(): void {
		if (!this.request || !this.deliver) return;
		const request = this.request;
		this.request = null;
		this.deliver(request);
	}
}
