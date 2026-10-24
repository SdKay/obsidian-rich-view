import type { MatchOptions, OpenedHit, RichSearchHostApi } from './richSearchApi';
import { matchText } from './searchHost';

/** One text unit a view can mark: a shape label, a text box, a table cell. */
export interface MarkableUnit {
	/** The provider's own anchor for this unit (same value `extract` gave), compared by `sameAnchor`. */
	anchor: unknown;
	text: string;
}

export interface MarkTarget {
	unit: MarkableUnit;
	/**
	 * The index (0-based, in the unit's matches) of the one match the user opened, or null when this unit holds
	 * none. Every other match is drawn dimmed, so a unit with several matches has at most one bright one.
	 */
	openedIndex: number | null;
	/** True when `openedIndex` is not null; kept for callers that only mark whole units. */
	opened: boolean;
}

/** Anchors are small JSON values; two are the same when they serialise the same. */
export function sameAnchor(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Which units to mark for `query`, and which single match is the opened one (contract 5.8 / 5.10).
 * `filePath` is the file this view shows: a hit in another file never brightens anything here.
 * The opened match is the `hit.index`-th match in the first unit whose anchor equals the hit's, so a unit
 * with five matches has one bright and four dim, and two units sharing an anchor cannot both light up.
 */
export function chooseMarks(
	host: RichSearchHostApi | null,
	units: readonly MarkableUnit[],
	query: MatchOptions | null,
	hit: OpenedHit | null,
	filePath: string,
): MarkTarget[] {
	if (!query || query.query === '') return [];
	const openedAnchor = hit && hit.path === filePath && !hit.block && hit.anchor !== undefined ? hit.anchor : undefined;
	let openedTaken = false;
	const out: MarkTarget[] = [];
	for (const unit of units) {
		const count = matchText(host, unit.text, query).length;
		if (count === 0) continue;
		let openedIndex: number | null = null;
		if (!openedTaken && openedAnchor !== undefined && sameAnchor(unit.anchor, openedAnchor)) {
			openedTaken = true;
			// A hit whose index is beyond this unit's matches (the file changed) still lights the unit's first match.
			openedIndex = hit!.index >= 0 && hit!.index < count ? hit!.index : 0;
		}
		out.push({ unit, openedIndex, opened: openedIndex !== null });
	}
	return out;
}

/**
 * One mark per shape. Several lines of one label share a shape, and drawing a translucent rectangle for each
 * would stack them into something as dark as the opened one. A shape is opened when any of its lines is.
 */
export function marksPerShape(marks: readonly MarkTarget[], shapeIdOf: (anchor: unknown) => string | null): { shapeId: string; opened: boolean }[] {
	const byShape = new Map<string, boolean>();
	for (const mark of marks) {
		const id = shapeIdOf(mark.unit.anchor);
		if (id === null) continue;
		byShape.set(id, (byShape.get(id) ?? false) || mark.opened);
	}
	return Array.from(byShape, ([shapeId, opened]) => ({ shapeId, opened }));
}
