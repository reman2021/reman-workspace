import type { App } from 'obsidian';
import type { DashboardCard, RenderCallbacks } from '../../core/types';
import { t } from '../../core/i18n';
import { attachFileSuggest } from '../../ui/file-suggest';
import { renderTextWithLinks } from '../../ui/rich-text';

export function renderMemoBody(container: HTMLElement, card: DashboardCard, callbacks: RenderCallbacks, app: App): void {
	const text = [card.blockquote, card.body].filter(Boolean).join('\n');
	let dirty = false;

	// View mode: rendered text with clickable links
	const view = container.createDiv({ cls: 'dashboard-memo-view' });
	renderMemoViewContent(view, text, app);
	view.addEventListener('click', () => {
		view.setCssProps({ 'display': 'none' });
		textarea.setCssProps({ 'display': '' });
		textarea.focus();
	});

	// Edit mode: textarea (hidden by default)
	const textarea = container.createEl('textarea', {
		cls: 'dashboard-memo-textarea',
		text: text,
		attr: { placeholder: t('renderer.writeThoughts') },
	});
	textarea.setCssProps({ 'display': 'none' });

	attachFileSuggest(textarea, app);

	textarea.addEventListener('input', () => {
		dirty = true;
	});

	const save = () => {
		if (!dirty) return;
		dirty = false;
		const value = textarea.value;
		const lines = value.split('\n');
		const quoteLines: string[] = [];
		const bodyLines: string[] = [];

		for (const line of lines) {
			if (line.startsWith('> ')) {
				quoteLines.push(line.slice(2));
			} else {
				bodyLines.push(line);
			}
		}

		callbacks.onMemoUpdate(card, {
			body: bodyLines.join('\n').trim(),
			blockquote: quoteLines.join('\n'),
		});
	};

	textarea.addEventListener('blur', () => {
		save();
		// If re-render didn't happen (not dirty), switch to view manually
		if (document.body.contains(view)) {
			renderMemoViewContent(view, textarea.value, app);
			view.setCssProps({ 'display': '' });
			textarea.setCssProps({ 'display': 'none' });
		}
	});
}

function renderMemoViewContent(container: HTMLElement, text: string, app: App): void {
	container.empty();
	if (!text) {
		container.addClass('dashboard-memo-view--empty');
		container.setText(t('renderer.writeThoughts'));
		return;
	}
	container.removeClass('dashboard-memo-view--empty');

	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) container.createEl('br');
		const line = lines[i]!;
		if (line.startsWith('> ')) {
			const quote = container.createDiv({ cls: 'dashboard-note-quote' });
			quote.setText(line.slice(2));
		} else {
			renderTextWithLinks(container, line, app);
		}
	}
}
