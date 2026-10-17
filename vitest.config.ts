import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		// `obsidian` ships types only; modules that import it at runtime get this stub in tests.
		alias: { obsidian: fileURLToPath(new URL('./test/stubs/obsidian.ts', import.meta.url)) },
	},
	test: {
		globals: true,
		// This project's parsing modules (parser.ts, visioParser.ts) use
		// DOMParser/XMLSerializer directly — unlike a plain-logic module, they
		// need a real DOM, so jsdom is the default environment here rather
		// than vitest's plain 'node'.
		environment: 'jsdom',
		// Each worker loads jsdom and the parsers; with every core in use the pool times out starting workers
		// when memory is tight. Four keeps the full suite reliable.
		maxWorkers: 4,
	},
});
