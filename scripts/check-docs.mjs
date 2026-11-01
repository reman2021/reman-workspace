import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDocs = ['README.md', 'README_ZH.md', '使用说明_ZH.md'];

async function collectMarkdown(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...await collectMarkdown(path));
		else if (extname(entry.name).toLowerCase() === '.md') files.push(path);
	}
	return files;
}

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

const files = [
	...rootDocs.map(file => join(root, file)),
	...await collectMarkdown(join(root, 'docs')),
];
const errors = [];
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const file of files) {
	const relativeFile = file.slice(root.length + 1).replaceAll('\\', '/');
	const content = await readFile(file, 'utf8');
	if (content.includes('screenshot1.png')) errors.push(`${relativeFile}: references removed screenshot1.png`);
	if (/(^|[^/])dashboard-template\.md/.test(content)) errors.push(`${relativeFile}: references the old dashboard-template.md path`);

	for (const match of content.matchAll(linkPattern)) {
		let target = match[1].trim();
		if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
		target = target.split(/\s+["']/)[0];
		if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
		const pathText = decodeURIComponent(target.split('#')[0].split('?')[0]);
		if (!pathText) continue;
		const absoluteTarget = resolve(dirname(file), pathText);
		if (!(await exists(absoluteTarget))) errors.push(`${relativeFile}: missing link target ${target}`);
	}
}

if (!(await exists(join(root, 'examples', 'dashboard-template.md')))) {
	errors.push('examples/dashboard-template.md is missing');
}

if (errors.length) {
	console.error(errors.join('\n'));
	process.exitCode = 1;
} else {
	console.log(`[docs] checked ${files.length} Markdown files`);
}
