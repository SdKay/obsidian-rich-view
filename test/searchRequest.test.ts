import { describe, expect, it } from 'vitest';
import { PendingSearchRequest, readSearchRequest, type SearchRequest } from '../src/searchRequest';

describe('readSearchRequest', () => {
	const query = { query: 'alpha', caseSensitive: false, wholeWord: true, regex: false };

	it('reads anchor and query from state.richSearch', () => {
		expect(readSearchRequest({ richSearch: { anchor: { page: 'P', cellId: 'a' }, query } })).toEqual({ anchor: { page: 'P', cellId: 'a' }, query });
	});

	it('keeps a request that has a query but no anchor', () => {
		expect(readSearchRequest({ richSearch: { query } })).toEqual({ query });
	});

	it('returns null when there is no request at all', () => {
		for (const state of [undefined, null, 5, 'x', {}, { richSearch: null }, { richSearch: 3 }, { other: 1 }]) {
			expect(readSearchRequest(state)).toBeNull();
		}
	});

	it('drops a malformed query but keeps the anchor, instead of trusting or throwing', () => {
		for (const bad of [{ query: 5 }, { query: 'x', regex: 'yes' }, 'alpha', null, []]) {
			expect(readSearchRequest({ richSearch: { anchor: 1, query: bad } })).toEqual({ anchor: 1 });
		}
	});
});

describe('PendingSearchRequest', () => {
	const req = (n: number): SearchRequest => ({ anchor: n });

	it('delivers a request that arrives after the consumer is ready, immediately', () => {
		const pending = new PendingSearchRequest();
		const got: SearchRequest[] = [];
		pending.setConsumer(r => got.push(r));
		pending.submit(req(1));
		expect(got).toEqual([req(1)]);
	});

	it('holds a request that arrives before the consumer is ready, and delivers it when it is', () => {
		const pending = new PendingSearchRequest();
		const got: SearchRequest[] = [];
		pending.submit(req(1));
		expect(got).toEqual([]);
		pending.setConsumer(r => got.push(r));
		expect(got).toEqual([req(1)]);
	});

	it('delivers each request once: a consumer that is set again does not get it a second time', () => {
		const pending = new PendingSearchRequest();
		const got: SearchRequest[] = [];
		pending.submit(req(1));
		pending.setConsumer(r => got.push(r));
		pending.setConsumer(null);
		pending.setConsumer(r => got.push(r));
		expect(got).toEqual([req(1)]);
	});

	it('a newer request replaces one that was never delivered', () => {
		const pending = new PendingSearchRequest();
		const got: SearchRequest[] = [];
		pending.submit(req(1));
		pending.submit(req(2));
		pending.setConsumer(r => got.push(r));
		expect(got).toEqual([req(2)]);
	});

	it('does not deliver while the consumer is withdrawn, and does after it returns', () => {
		const pending = new PendingSearchRequest();
		const got: SearchRequest[] = [];
		pending.setConsumer(r => got.push(r));
		pending.setConsumer(null);
		pending.submit(req(1));
		expect(got).toEqual([]);
		pending.setConsumer(r => got.push(r));
		expect(got).toEqual([req(1)]);
	});
});
