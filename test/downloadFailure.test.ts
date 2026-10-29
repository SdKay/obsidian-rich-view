import { describe, expect, it } from 'vitest';
import { describeDownloadFailure } from '../src/downloadFailure';

const http = (status: number) => Object.assign(new Error(`Request failed, status ${status}`), { status });

describe('describeDownloadFailure: what the banner tells the user when downloads fail', () => {
	it('says nothing when nothing failed', () => {
		expect(describeDownloadFailure([])).toBe('');
	});
	it('says the file is not there for a 404, rather than blaming the network', () => {
		const text = describeDownloadFailure([http(404)]);
		expect(text).toMatch(/not found|404/i);
		expect(text).not.toMatch(/check your network/i);
	});
	it('says the server refused or limited the request for 403 and 429', () => {
		expect(describeDownloadFailure([http(403)])).toMatch(/refused|rate-limited/);
		expect(describeDownloadFailure([http(429)])).toMatch(/refused|rate-limited/);
		expect(describeDownloadFailure([http(403)])).toMatch(/403/);
		expect(describeDownloadFailure([http(429)])).toMatch(/429/);
	});
	it('says the server had a problem for a 5xx', () => {
		expect(describeDownloadFailure([http(503)])).toMatch(/server error/);
		expect(describeDownloadFailure([http(503)])).toMatch(/503/);
	});
	it('blames the network only when the request never got an answer', () => {
		expect(describeDownloadFailure([new Error('net::ERR_INTERNET_DISCONNECTED')])).toMatch(/network/i);
		expect(describeDownloadFailure(['something odd'])).toMatch(/network/i);
	});
	it('reports how many failed when there are several', () => {
		expect(describeDownloadFailure([http(404), http(404), http(404)])).toMatch(/3/);
	});
	it('names every kind of failure when they differ, most frequent first', () => {
		const text = describeDownloadFailure([http(404), http(404), http(429), new Error('offline')]);
		expect(text.indexOf('404')).toBeGreaterThanOrEqual(0);
		expect(text.indexOf('404')).toBeLessThan(text.indexOf('429'));
		expect(text).toMatch(/network/i);
	});
	it('reads the status from the places a request error can carry it', () => {
		expect(describeDownloadFailure([{ status: 404 }])).toMatch(/404/);
		expect(describeDownloadFailure([{ response: { status: 404 } }])).toMatch(/404/);
		expect(describeDownloadFailure([{ message: 'Request failed, status 404' }])).toMatch(/404/);
	});
	it('never throws on a reason that is not an object', () => {
		expect(() => describeDownloadFailure([null, undefined, 5, 'x'])).not.toThrow();
	});
});
