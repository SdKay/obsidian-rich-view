/** A mouse press with Alt held selects text instead of panning; every other press keeps its meaning. */
export function startsTextSelection(e: { pointerType: string; button: number; altKey: boolean }): boolean {
	return e.pointerType === 'mouse' && e.button === 0 && e.altKey;
}
