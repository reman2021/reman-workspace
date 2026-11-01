import { App, Modal, setIcon } from 'obsidian';
import type { BannerData } from '../../core/types';
import { t } from '../../core/i18n';
import { initializeDashboardModal } from '../../ui/theme';
import { createModalField, createModalInputField, createModalTextareaField } from '../../ui/modal-form';

export function renderBanner(
	container: HTMLElement,
	banner: BannerData,
	onEdit: () => void,
	app: App,
): HTMLElement {
	const el = container.createDiv({ cls: 'dashboard-banner' });

	const image = banner.images?.[0] || banner.image;
	if (image) {
		const resolved = resolveVaultImage(app, image);
		if (resolved) {
			el.setCssProps({ 'background-image': `url("${resolved}")` });
		}
	}

	const overlay = el.createDiv({ cls: 'dashboard-banner-overlay' });
	const content = overlay.createDiv({ cls: 'dashboard-banner-content' });

	const quoteText = content.createEl('p', {
		cls: 'dashboard-banner-quote',
		text: banner.quote,
	});

	if (banner.quoteColor) quoteText.setCssProps({ 'color': banner.quoteColor });
	content.createEl('cite', {
		cls: 'dashboard-banner-author',
		text: banner.author,
	});

	const editBtn = overlay.createEl('button', {
		cls: 'dashboard-banner-edit-btn',
		attr: { 'aria-label': t('banner.editLabel') },
	});
	setIcon(editBtn, 'wand');
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onEdit();
	});
	el.addEventListener('dblclick', onEdit);
	return el;
}

export function resolveVaultImage(app: App, relativePath: string): string | null {
	if (/^https?:\/\//i.test(relativePath)) return relativePath;
	const file = app.vault.getFileByPath(relativePath);
	return file ? app.vault.getResourcePath(file) : null;
}

export class BannerEditModal extends Modal {
	private banner: BannerData;
	private onSave: (updates: Partial<BannerData>) => void;

	constructor(app: App, banner: BannerData, onSave: (updates: Partial<BannerData>) => void) {
		super(app);
		this.banner = banner;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('dashboard-modal');
		initializeDashboardModal(this);
		contentEl.createEl('h2', { text: t('banner.editTitle') });

		const form = contentEl.createDiv({ cls: 'dashboard-modal-form' });

		const quoteInput = createModalTextareaField(form, {
			label: t('banner.quote'),
			placeholder: t('banner.quotePlaceholder'),
			value: this.banner.quote,
			rows: 3,
		});

		const authorInput = createModalInputField(form, {
			label: t('banner.author'),
			placeholder: t('banner.authorPlaceholder'),
			value: this.banner.author,
		});

		const libraryInput = createModalInputField(form, {
			label: t('banner.quoteLibraryPath'),
			placeholder: t('banner.quoteLibraryPlaceholder'),
			value: this.banner.quoteLibraryPath ?? '',
		});

		const { field: colorField, controlId: colorInputId } = createModalField(form, t('banner.quoteColor'), 'dashboard-banner-color-row');
		let quoteColor = this.banner.quoteColor ?? '';
		const colorInput = colorField.createEl('input', {
			cls: 'dashboard-banner-color-input',
			attr: { id: colorInputId, type: 'color', 'aria-label': t('banner.quoteColor') },
		});
		colorInput.value = /^#[0-9a-f]{6}$/i.test(quoteColor) ? quoteColor : '#ffffff';
		colorInput.addEventListener('input', () => { quoteColor = colorInput.value; });
		colorField.createEl('button', {
			cls: 'dashboard-banner-color-reset',
			text: t('banner.resetColor'),
			attr: { type: 'button' },
		}).addEventListener('click', () => { quoteColor = ''; colorInput.value = '#ffffff'; });

		const imageInput = createModalTextareaField(form, {
			label: t('banner.imagesLabel'),
			placeholder: t('banner.imagesPlaceholder'),
			value: (this.banner.images?.length ? this.banner.images : this.banner.image ? [this.banner.image] : []).join('\n'),
			rows: 4,
		});

		const actions = form.createDiv({ cls: 'dashboard-modal-actions' });

		const saveBtn = actions.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => {
			this.onSave({
				quote: quoteInput.value,
				author: authorInput.value,
				image: '',
				images: imageInput.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
				quoteLibraryPath: libraryInput.value.trim(),
				quoteColor,
			});
			this.close();
		});

		const cancelBtn = actions.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
