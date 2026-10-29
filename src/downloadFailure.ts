/** The HTTP status a failed request carries, wherever the error keeps it; null when it never got an answer. */
function statusOf(reason: unknown): number | null {
	if (typeof reason !== 'object' || reason === null) return null;
	const r = reason as { status?: unknown; response?: { status?: unknown }; message?: unknown };
	const direct = typeof r.status === 'number' ? r.status : typeof r.response?.status === 'number' ? r.response.status : null;
	if (direct !== null) return direct;
	const fromText = typeof r.message === 'string' ? /status\s+(\d{3})/i.exec(r.message) : null;
	return fromText ? Number(fromText[1]) : null;
}

function wording(status: number | null): string {
	if (status === null) return 'no answer from the server (check your network)';
	if (status === 404) return 'file not found (404)';
	if (status === 403 || status === 429) return `refused or rate-limited by the server (${status})`;
	if (status >= 500) return `server error (${status})`;
	return `request failed (${status})`;
}

/** One line for the banner saying why downloads failed, so a missing file is not blamed on the network. */
export function describeDownloadFailure(reasons: readonly unknown[]): string {
	if (reasons.length === 0) return '';
	const counts = new Map<string, number>();
	for (const reason of reasons) {
		const text = wording(statusOf(reason));
		counts.set(text, (counts.get(text) ?? 0) + 1);
	}
	const kinds = [...counts].sort((a, b) => b[1] - a[1]).map(([text, n]) => (reasons.length > 1 ? `${n}× ${text}` : text));
	return `${reasons.length === 1 ? 'A download' : `${reasons.length} downloads`} failed: ${kinds.join('; ')}.`;
}
