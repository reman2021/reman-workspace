import type { App, TFile } from 'obsidian';
import { t } from './i18n';

const extensions = new Set(['md', 'base', 'canvas', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'mp3', 'mp4', 'm4a', 'm4b', 'mov', 'mkv', 'avi']);

export function searchFiles(files: TFile[], query: string): TFile[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [];
	return files.filter(file => !file.path.split('/').some(part => part.startsWith('.'))
		&& extensions.has(file.extension.toLowerCase())
		&& (file.path.toLowerCase().includes(needle) || file.basename.toLowerCase().includes(needle)))
		.slice(0, 20);
}

/** Reads the current vault for every query: no stale rename/delete index. */
export function renderFileSearch(container: HTMLElement, app: App, onOpen: (path: string) => void): void {
	const wrap = container.createDiv({ cls: 'dashboard-file-search' });
	const input = wrap.createEl('input', { cls: 'dashboard-modal-input', attr: {
		type: 'search', placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder'),
		role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list',
	} });
	const list = wrap.createDiv({ cls: 'dashboard-file-search-results', attr: { role: 'listbox' } });
	list.id = `dashboard-search-${Math.random().toString(36).slice(2)}`;
	input.setAttribute('aria-controls', list.id);
	let matches: TFile[] = [];
	let selected = 0;
	const close = () => {
		list.empty(); list.hidden = true; matches = [];
		input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
	};
	const open = (file: TFile) => {
		if (app.vault.getFileByPath(file.path)) onOpen(file.path);
		close();
	};
	const highlight = () => {
		Array.from(list.children).forEach((child, index) => child.setAttribute('aria-selected', String(index === selected)));
		const active = list.children[selected] as HTMLElement | undefined;
		if (active) { input.setAttribute('aria-activedescendant', active.id); active.scrollIntoView({ block: 'nearest' }); }
	};
	const refresh = () => {
		close();
		if (!input.value.trim()) return;
		matches = searchFiles(app.vault.getFiles(), input.value); selected = 0;
		list.hidden = false; input.setAttribute('aria-expanded', 'true');
		if (!matches.length) list.createDiv({ text: t('search.empty'), attr: { role: 'status' } });
		matches.forEach((file, index) => {
			const item = list.createDiv({ cls: 'dashboard-file-search-result', attr: { role: 'option', id: `${list.id}-${index}` } });
			item.createDiv({ text: file.basename }); item.createEl('small', { text: file.path });
			item.addEventListener('mousedown', event => event.preventDefault());
			item.addEventListener('pointerdown', event => event.preventDefault());
			item.addEventListener('click', () => open(file));
		});
		highlight();
	};
	input.addEventListener('input', refresh);
	input.addEventListener('focus', refresh);
	input.addEventListener('blur', close);
	input.addEventListener('keydown', event => {
		if (event.isComposing) return;
		if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault(); if (list.hidden) refresh();
			if (matches.length) { selected = (selected + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length; highlight(); }
		}
		if (event.key === 'Enter' && !list.hidden) { event.preventDefault(); const file = matches[selected]; if (file) open(file); }
	});
	close();
}
