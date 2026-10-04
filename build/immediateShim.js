/**
 * Drop-in replacement for the `immediate` package (a microtask scheduler that
 * jszip's Promise layer, `lie`, depends on). The original falls back to
 * injecting a <script> element on ancient browsers, which Obsidian's review
 * flags and which can never run inside Obsidian's Chromium. Every environment
 * the plugin supports has queueMicrotask, which is exactly the semantics
 * `immediate` provides: run the callback asynchronously, in call order.
 */
'use strict';

module.exports = function immediate(callback) {
	queueMicrotask(callback);
};
