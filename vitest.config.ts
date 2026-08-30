import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		// This project's parsing modules (parser.ts, visioParser.ts) use
		// DOMParser/XMLSerializer directly — unlike a plain-logic module, they
		// need a real DOM, so jsdom is the default environment here rather
		// than vitest's plain 'node'.
		environment: 'jsdom',
	},
});
