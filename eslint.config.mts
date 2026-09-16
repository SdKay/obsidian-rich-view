import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'test',
		'esbuild.config.mjs',
		'vitest.config.ts',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'vitest.config.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// linkEditor.ts's `doc` is an XML Document from `DOMParser`, not the
		// live app DOM — it has no `.win`, so the rule's `createEl`
		// suggestion doesn't apply. Scoped off here (not an inline disable
		// comment) because obsidianmd/* disables are blocked by
		// eslint-comments/no-restricted-disable.
		files: ['src/linkEditor.ts'],
		rules: {
			'obsidianmd/prefer-create-el': 'off',
		},
	},
);
