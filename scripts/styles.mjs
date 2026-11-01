import { watch } from 'node:fs';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const STYLE_SOURCES = [
	'00-tokens.css',
	'10-page-frame.css',
	'20-banner-sidebar.css',
	'30-sections-cards.css',
	'40-modal-foundation.css',
	'50-todo-tracking.css',
	'60-database.css',
	'70-responsive-overrides.css',
];

const sourceDir = new URL('../src/styles/', import.meta.url);
const outputFile = new URL('../styles.css', import.meta.url);
const GENERATED_HEADER = `/*
 * GENERATED FILE — edit src/styles/*.css and run npm run build:styles.
 * The ordered source list lives in scripts/styles.mjs.
 */\n\n`;

async function composeStyles() {
	const parts = await Promise.all(STYLE_SOURCES.map(async name => {
		const content = await readFileAsync(new URL(name, sourceDir), 'utf8');
		return content.trimEnd();
	}));
	return `${GENERATED_HEADER}${parts.join('\n\n')}\n`;
}

export async function buildStyles() {
	await writeFileAsync(outputFile, await composeStyles(), 'utf8');
}

export async function checkStyles() {
	const [expected, actual] = await Promise.all([
		composeStyles(),
		readFileAsync(outputFile, 'utf8').catch(() => ''),
	]);
	if (actual !== expected) {
		throw new Error('styles.css is stale; run npm run build:styles and commit the result.');
	}
}

export function watchStyles() {
	let timer;
	const watchers = STYLE_SOURCES.map(name => watch(new URL(name, sourceDir), () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			void buildStyles().then(() => console.log('[styles] rebuilt styles.css')).catch(console.error);
		}, 50);
	}));
	return () => watchers.forEach(watcher => watcher.close());
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
	if (process.argv.includes('--check')) {
		await checkStyles();
		console.log('[styles] styles.css is up to date');
	} else if (process.argv.includes('--watch')) {
		await buildStyles();
		watchStyles();
		console.log('[styles] watching src/styles');
	} else {
		await buildStyles();
		console.log('[styles] generated styles.css');
	}
}
