import { describe, expect, it } from 'vitest';
import type { MatchOptions, OpenedHit, RichSearchHostApi, Span } from '../src/richSearchApi';
import { findSearchHost, matchText, readLiveSearch, SearchSubscription, subscribeToSearch } from '../src/searchHost';
import { chooseMarks, marksPerShape, sameAnchor, type MarkableUnit, type MarkTarget } from '../src/matchTargets';
import { shapeIdOfAnchor } from '../src/pageUnits';

/** Case-insensitive literal match, the same shape as the real host's matchLine. */
const literal = (text: string, opts: MatchOptions): Span[] => {
	const out: Span[] = [];
	if (!opts.query) return out;
	const hay = opts.caseSensitive ? text : text.toLowerCase();
	const needle = opts.caseSensitive ? opts.query : opts.query.toLowerCase();
	for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) out.push({ start: i, end: i + needle.length });
	return out;
};

type Mode = 'full' | 'old' | 'throws' | 'newer' | 'none' | 'malformed';

/** A fake Rich Search host that can be put in each degraded state. */
function fakeApp(mode: Mode, state: { query: MatchOptions | null; hit: OpenedHit | null } = { query: null, hit: null }) {
	const queryListeners = new Set<() => void>();
	const hitListeners = new Set<() => void>();
	const api: Partial<RichSearchHostApi> = { apiVersion: 1, matchLine: literal };
	if (mode === 'full' || mode === 'throws') {
		api.currentQuery = () => state.query;
		api.currentHit = () => state.hit;
		api.onQueryChange = l => { const f = () => l(state.query); queryListeners.add(f); return () => { queryListeners.delete(f); }; };
		api.onHitChange = l => { const f = () => l(state.hit); hitListeners.add(f); return () => { hitListeners.delete(f); }; };
	}
	if (mode === 'throws') {
		api.matchLine = () => { throw new Error('boom'); };
		api.currentQuery = () => { throw new Error('boom'); };
		api.currentHit = () => { throw new Error('boom'); };
		api.onQueryChange = () => { throw new Error('boom'); };
	}
	if (mode === 'newer') (api as { apiVersion: number }).apiVersion = 2;
	if (mode === 'malformed') (api as { matchLine: unknown }).matchLine = 'not a function';
	const plugins = mode === 'none' ? {} : { 'rich-search': { api } };
	return { app: { plugins: { plugins } } as never, fire: () => { queryListeners.forEach(f => f()); hitListeners.forEach(f => f()); }, counts: () => queryListeners.size + hitListeners.size };
}

describe('findSearchHost', () => {
	it('finds a current host', () => {
		expect(findSearchHost(fakeApp('full').app)).not.toBeNull();
		expect(findSearchHost(fakeApp('old').app)).not.toBeNull();
	});
	it('returns null when rich-search is not there, has another apiVersion, or is malformed', () => {
		for (const mode of ['none', 'newer', 'malformed'] as Mode[]) expect(findSearchHost(fakeApp(mode).app)).toBeNull();
	});
	it('returns null when the app has no plugin registry at all', () => {
		expect(findSearchHost({} as never)).toBeNull();
		expect(findSearchHost({ plugins: {} } as never)).toBeNull();
	});
});

describe('matchText', () => {
	const q: MatchOptions = { query: 'al' };
	it('returns the host spans', () => {
		expect(matchText(findSearchHost(fakeApp('full').app), 'Alpha', q)).toEqual([{ start: 0, end: 2 }]);
	});
	it('returns nothing without a host, and when the host throws', () => {
		expect(matchText(null, 'Alpha', q)).toEqual([]);
		expect(matchText(findSearchHost(fakeApp('throws').app), 'Alpha', q)).toEqual([]);
	});
});

describe('readLiveSearch', () => {
	it('reads the current query and opened hit', () => {
		const hit: OpenedHit = { path: 'a.drawio', line: 0, index: 0, anchor: { page: 'P', cellId: 'a' } };
		const state = { query: { query: 'x' }, hit };
		expect(readLiveSearch(findSearchHost(fakeApp('full', state).app))).toEqual(state);
	});
	it('reports nothing for an old host (no optional methods), no host, and a host that throws', () => {
		expect(readLiveSearch(findSearchHost(fakeApp('old').app))).toEqual({ query: null, hit: null });
		expect(readLiveSearch(null)).toEqual({ query: null, hit: null });
		expect(readLiveSearch(findSearchHost(fakeApp('throws').app))).toEqual({ query: null, hit: null });
	});
});

describe('readLiveSearch: the query that came with the click (contract 5.8)', () => {
	const clicked: MatchOptions = { query: 'clicked' };

	it('is used when the host has no currentQuery, so the hit is still marked once', () => {
		expect(readLiveSearch(findSearchHost(fakeApp('old').app), clicked).query).toEqual(clicked);
	});
	it('loses to currentQuery when the host has it: the search on screen wins', () => {
		const live: MatchOptions = { query: 'typed since' };
		expect(readLiveSearch(findSearchHost(fakeApp('full', { query: live, hit: null }).app), clicked).query).toEqual(live);
	});
	it('does not bring marks back after the panel closed or the query was emptied (currentQuery says null)', () => {
		expect(readLiveSearch(findSearchHost(fakeApp('full', { query: null, hit: null }).app), clicked).query).toBeNull();
	});
	it('is not used when currentQuery throws: a broken host marks nothing', () => {
		expect(readLiveSearch(findSearchHost(fakeApp('throws').app), clicked).query).toBeNull();
	});
	it('is not used without a host at all, since nothing can find the matches', () => {
		expect(readLiveSearch(null, clicked).query).toBeNull();
	});
	it('leaves the opened hit alone: an old host still draws every match dimmed', () => {
		expect(readLiveSearch(findSearchHost(fakeApp('old').app), clicked).hit).toBeNull();
	});
	it('does nothing when no query came with the click', () => {
		expect(readLiveSearch(findSearchHost(fakeApp('old').app), undefined).query).toBeNull();
	});
});

describe('subscribeToSearch', () => {
	it('calls the listener on query and hit changes, and stops after unsubscribing', () => {
		const fake = fakeApp('full');
		let calls = 0;
		const stop = subscribeToSearch(findSearchHost(fake.app), () => { calls++; });
		fake.fire();
		expect(calls).toBe(2);
		stop();
		fake.fire();
		expect(calls).toBe(2);
		expect(fake.counts()).toBe(0);
	});
	it('unsubscribing twice is harmless', () => {
		const stop = subscribeToSearch(findSearchHost(fakeApp('full').app), () => {});
		stop();
		expect(() => stop()).not.toThrow();
	});
	it('is a no-op for an old host, no host, and a host whose subscribe throws', () => {
		for (const mode of ['old', 'none', 'throws'] as Mode[]) {
			const stop = subscribeToSearch(findSearchHost(fakeApp(mode).app), () => {});
			expect(() => stop()).not.toThrow();
		}
	});
});

describe('chooseMarks', () => {
	const host = findSearchHost(fakeApp('full').app);
	const units: MarkableUnit[] = [
		{ anchor: { page: 'P', cellId: 'a' }, text: 'Alpha' },
		{ anchor: { page: 'P', cellId: 'b' }, text: 'Beta' },
		{ anchor: { page: 'P', cellId: 'c' }, text: 'alphabet soup' },
	];
	const file = 'x.drawio';
	const hitFor = (cellId: string, extra: Partial<OpenedHit> = {}): OpenedHit => ({ path: file, line: 0, index: 0, anchor: { page: 'P', cellId }, ...extra });

	it('marks every unit that matches, dimmed, when nothing is opened', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, null, file);
		expect(marks.map(m => [(m.unit.anchor as { cellId: string }).cellId, m.opened])).toEqual([['a', false], ['c', false]]);
	});
	it('brightens only the unit whose anchor is the opened hit', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, hitFor('c'), file);
		expect(marks.map(m => m.opened)).toEqual([false, true]);
	});
	it('lights exactly the hit.index-th match of a unit that holds several, and none of its other matches', () => {
		const many: MarkableUnit[] = [{ anchor: { page: 'P', cellId: 'm' }, text: 'alpha and alpha and alpha' }];
		for (const index of [0, 1, 2]) {
			const marks = chooseMarks(host, many, { query: 'alpha' }, hitFor('m', { index }), file);
			expect(marks.map(m => m.openedIndex)).toEqual([index]);
		}
	});
	it('a unit without the opened anchor has no opened match', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, hitFor('a'), file);
		expect(marks.map(m => m.openedIndex)).toEqual([0, null]);
	});
	it('falls back to the first match when the hit index is past the unit\'s matches (the file changed since)', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, hitFor('a', { index: 7 }), file);
		expect(marks[0]!.openedIndex).toBe(0);
		// "Alpha" has exactly one match, so index 1 is the first one past it.
		expect(chooseMarks(host, units, { query: 'alpha' }, hitFor('a', { index: 1 }), file)[0]!.openedIndex).toBe(0);
		const negative = chooseMarks(host, units, { query: 'alpha' }, hitFor('a', { index: -1 }), file);
		expect(negative[0]!.openedIndex).toBe(0);
	});
	it('does not brighten anything for a hit in another file', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, hitFor('a', { path: 'other.drawio' }), file);
		expect(marks.every(m => !m.opened)).toBe(true);
	});
	it('does not brighten anything for a hit that belongs to a block in a note', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, hitFor('a', { block: { fromLine: 3, anchor: { page: 'P', cellId: 'a' } } }), file);
		expect(marks.every(m => !m.opened)).toBe(true);
	});
	it('brightens only the first of several units sharing the opened anchor', () => {
		const dup = [units[0]!, { ...units[0]! }];
		const marks = chooseMarks(host, dup, { query: 'alpha' }, hitFor('a'), file);
		expect(marks.map(m => m.opened)).toEqual([true, false]);
	});
	it('an opened anchor that matches no unit text brightens nothing and marks nothing extra', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, hitFor('b'), file);
		expect(marks.map(m => m.opened)).toEqual([false, false]);
	});
	it('marks nothing without a query, with an empty query, or without a host', () => {
		expect(chooseMarks(host, units, null, null, file)).toEqual([]);
		expect(chooseMarks(null, units, { query: 'alpha' }, null, file)).toEqual([]);
	});
	it('marks nothing for an empty query even when the host would match it everywhere', () => {
		const everywhere = { apiVersion: 1, matchLine: (text: string) => [{ start: 0, end: text.length }] } as RichSearchHostApi;
		expect(chooseMarks(everywhere, units, { query: '' }, null, file)).toEqual([]);
		expect(chooseMarks(everywhere, units, { query: 'x' }, null, file).length).toBe(units.length);
	});
	it('an old host (no hit information) leaves every match dimmed', () => {
		const marks = chooseMarks(host, units, { query: 'alpha' }, readLiveSearch(findSearchHost(fakeApp('old').app)).hit, file);
		expect(marks.length).toBe(2);
		expect(marks.every(m => !m.opened)).toBe(true);
	});
});

describe('sameAnchor', () => {
	it('compares anchors by value', () => {
		expect(sameAnchor({ page: 'P', cellId: 'a' }, { page: 'P', cellId: 'a' })).toBe(true);
		expect(sameAnchor({ page: 'P', cellId: 'a' }, { page: 'P', cellId: 'b' })).toBe(false);
		expect(sameAnchor(undefined, undefined)).toBe(true);
	});
});

describe('marksPerShape', () => {
	const t = (cellId: string, openedIndex: number | null): MarkTarget => ({ unit: { anchor: { page: 'P', cellId }, text: 'x' }, openedIndex, opened: openedIndex !== null });

	it('gives one entry per shape even when several of its lines matched', () => {
		expect(marksPerShape([t('a', null), t('a', null), t('b', null)], shapeIdOfAnchor)).toEqual([{ shapeId: 'a', opened: false }, { shapeId: 'b', opened: false }]);
	});
	it('a shape is opened when any one of its lines is, wherever that line sits among the others', () => {
		expect(marksPerShape([t('a', null), t('a', 0), t('a', null)], shapeIdOfAnchor)).toEqual([{ shapeId: 'a', opened: true }]);
		expect(marksPerShape([t('a', 0), t('a', null)], shapeIdOfAnchor)).toEqual([{ shapeId: 'a', opened: true }]);
	});
	it('only the shape holding the opened line is opened', () => {
		expect(marksPerShape([t('a', null), t('b', 0), t('c', null)], shapeIdOfAnchor).map(m => [m.shapeId, m.opened])).toEqual([['a', false], ['b', true], ['c', false]]);
	});
	it('skips anchors that name no shape and keeps first-seen order', () => {
		const odd: MarkTarget = { unit: { anchor: 5, text: 'x' }, openedIndex: null, opened: false };
		expect(marksPerShape([t('z', null), odd, t('y', null)], shapeIdOfAnchor).map(m => m.shapeId)).toEqual(['z', 'y']);
	});
	it('is empty for no marks', () => {
		expect(marksPerShape([], shapeIdOfAnchor)).toEqual([]);
	});
});

describe('SearchSubscription', () => {
	it('starts listening to the host that is there when it is renewed', () => {
		const fake = fakeApp('full');
		let calls = 0;
		const sub = new SearchSubscription(() => findSearchHost(fake.app), () => { calls++; });
		sub.renew();
		fake.fire();
		expect(calls).toBe(2);
	});
	it('picks up a host that was not there when the view opened', () => {
		const registry: { plugins: Record<string, unknown> } = { plugins: {} };
		const app = { plugins: registry } as never;
		let calls = 0;
		const sub = new SearchSubscription(() => findSearchHost(app), () => { calls++; });
		sub.renew();                                   // rich-search is not installed yet: nothing to listen to
		const later = fakeApp('full');
		registry.plugins = (later.app as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins;
		sub.renew();                                   // renewed once it is: now it listens
		later.fire();
		expect(calls).toBe(2);
	});
	it('renewing replaces the earlier subscription instead of adding a second one', () => {
		const fake = fakeApp('full');
		let calls = 0;
		const sub = new SearchSubscription(() => findSearchHost(fake.app), () => { calls++; });
		sub.renew();
		sub.renew();
		sub.renew();
		expect(fake.counts()).toBe(2);                 // one query listener + one hit listener
		fake.fire();
		expect(calls).toBe(2);
	});
	it('stop ends the subscription, and renew after stop starts it again', () => {
		const fake = fakeApp('full');
		let calls = 0;
		const sub = new SearchSubscription(() => findSearchHost(fake.app), () => { calls++; });
		sub.renew();
		sub.stop();
		expect(fake.counts()).toBe(0);
		fake.fire();
		expect(calls).toBe(0);
		sub.renew();
		fake.fire();
		expect(calls).toBe(2);
	});
	it('stop on one that never started is harmless, and so is stopping twice', () => {
		const sub = new SearchSubscription(() => null, () => {});
		expect(() => { sub.stop(); sub.stop(); }).not.toThrow();
	});
});
