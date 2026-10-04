/**
 * Replacement for the `setimmediate` polyfill that jszip loads for its side
 * effect (defining a global `setImmediate`). The original falls back to
 * injecting a <script> element on ancient browsers — flagged by Obsidian's
 * review and unreachable inside Obsidian's Chromium. jszip only ever calls
 * `setImmediate(fn)` to run `fn` soon and asynchronously; a macrotask via
 * setTimeout(0) matches that, and where the host already provides a native
 * setImmediate it is left alone.
 */
'use strict';

(function (global) {
	if (global.setImmediate) return;
	global.setImmediate = function (callback) {
		var args = Array.prototype.slice.call(arguments, 1);
		return global.setTimeout(function () { callback.apply(undefined, args); }, 0);
	};
	global.clearImmediate = function (handle) { global.clearTimeout(handle); };
})(typeof self === 'undefined' ? (typeof global === 'undefined' ? this : global) : self);
