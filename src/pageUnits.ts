import type { DrawioPage } from './drawioParser';
import type { VisioPage } from './visioParser';
import { cellLabels } from './search/drawioExtract';
import { htmlLabelToLines } from './search/labelText';
import type { MarkableUnit } from './matchTargets';
import { drawioAnchor, visioAnchor } from './search/anchors';

/**
 * The text units of one page that a search can mark, built by the same rules `extract` uses
 * (same label reading, same line splitting, same anchor), so what is searchable is what is marked.
 * One unit per line, as in the search results; units of one shape share its anchor.
 */
export function drawioPageUnits(page: DrawioPage): MarkableUnit[] {
	const units: MarkableUnit[] = [];
	for (const cell of cellLabels(page.xml)) {
		for (const [line, text] of htmlLabelToLines(cell.label).entries()) units.push({ anchor: drawioAnchor(page.name, cell.id, line), text });
	}
	return units;
}

export function visioPageUnits(page: VisioPage): MarkableUnit[] {
	const units: MarkableUnit[] = [];
	for (const shape of page.shapes) {
		let line = 0;
		for (const part of shape.text.split(/\r?\n/)) {
			const text = part.trim();
			if (text) units.push({ anchor: visioAnchor(page.name, shape.id, line++), text });
		}
	}
	return units;
}

/** The id the renderer knows a unit's shape by, taken from the anchor shape `extract` produces. */
export function shapeIdOfAnchor(anchor: unknown): string | null {
	if (typeof anchor !== 'object' || anchor === null) return null;
	const a = anchor as { cellId?: unknown; shapeId?: unknown };
	if (typeof a.cellId === 'string') return a.cellId;
	if (typeof a.shapeId === 'string') return a.shapeId;
	return null;
}

/** The page name an anchor points at, or null when the anchor is not one of ours. */
export function pageOfAnchor(anchor: unknown): string | null {
	if (typeof anchor !== 'object' || anchor === null) return null;
	const page = (anchor as { page?: unknown }).page;
	return typeof page === 'string' ? page : null;
}
