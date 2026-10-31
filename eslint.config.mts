import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...Array.from(obsidianmd.configs.recommended).filter(config => !config.files?.includes('**/*.js')).map(config => ({ ...config, files: config.files?.includes('package.json') ? ['package.json'] : ['src/**/*.ts'] })),
	{
		files: ['tests/**/*.js', 'tests/**/*.mjs'],
		extends: [js.configs.recommended],
		languageOptions: { globals: { ...globals.node, ...globals.browser, dashboard: 'readonly' } },
	},
	globalIgnores([
		".test-output/**",
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
