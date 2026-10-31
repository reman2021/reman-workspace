import { App, Modal } from 'obsidian';
import type { HeatmapItem } from './types';
import { suggestTrackerKeys } from './tracker-service';
import { t } from './i18n';
import { initializeDashboardModal } from './theme-utils';
import { createModalInputField } from './modal-form';

export class HeatmapConfigModal extends Modal {
	private onSave: (item: HeatmapItem) => void;
	private existing: HeatmapItem | null;

	private keyValue = '';
	private labelValue = '';
	private daysValue = 30;

	constructor(
		app: App,
		onSave: (item: HeatmapItem) => void,
		existing?: HeatmapItem,
	) {
		super(app);
		this.onSave = onSave;
		this.existing = existing ?? null;
		if (existing) {
			this.keyValue = existing.key;
			this.labelValue = existing.label;
			this.daysValue = existing.days;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('dashboard-modal');
		initializeDashboardModal(this);
		contentEl.createEl('h2', { text: t('heatmap.configTitle') });

		const form = contentEl.createDiv({ cls: 'dashboard-modal-form' });

		// Label input
		const labelInput = createModalInputField(form, {
			label: t('heatmap.labelLabel'),
			placeholder: t('heatmap.labelPlaceholder'),
			value: this.labelValue,
			fieldClass: 'chart-config-field',
		});
		labelInput.addEventListener('input', () => {
			this.labelValue = labelInput.value.trim();
		});

		// Frontmatter key input
		const keyInput = createModalInputField(form, {
			label: t('heatmap.keyLabel'),
			placeholder: t('heatmap.keyPlaceholder'),
			value: this.keyValue,
			fieldClass: 'chart-config-field',
		});
		const keyField = keyInput.parentElement!;
		keyInput.addEventListener('input', () => {
			this.keyValue = keyInput.value.trim();
		});

		// Suggested keys
		const suggestions = suggestTrackerKeys(this.app);
		if (suggestions.length > 0) {
			const sugWrap = keyField.createDiv({ cls: 'tracker-key-suggestions' });
			sugWrap.createDiv({ cls: 'tracker-key-suggestions-label', text: t('heatmap.keySuggestions') });
			const tagRow = sugWrap.createDiv({ cls: 'tracker-key-tags' });
			for (const k of suggestions.slice(0, 8)) {
				const tag = tagRow.createEl('button', { cls: 'tracker-key-tag', text: k });
				tag.addEventListener('click', () => {
					this.keyValue = k;
					keyInput.value = k;
					if (!labelInput.value.trim()) {
						this.labelValue = k;
						labelInput.value = k;
					}
				});
			}
		}

		// Days selector
		const daysField = form.createDiv({ cls: 'chart-config-field' });
		daysField.createEl('label', { text: t('heatmap.daysLabel') });
		const daysRow = daysField.createDiv({ cls: 'chart-config-type-row' });

		const dayOptions = [
			{ value: 30, label: '30 ' + t('tracker.days') },
			{ value: 90, label: '90 ' + t('tracker.days') },
			{ value: 180, label: '180 ' + t('tracker.days') },
			{ value: 365, label: '365 ' + t('tracker.days') },
		];

		for (const opt of dayOptions) {
			const btn = daysRow.createEl('button', {
				cls: 'chart-config-type-btn' + (opt.value === this.daysValue ? ' active' : ''),
				text: opt.label,
			});
			btn.addEventListener('click', () => {
				this.daysValue = opt.value;
				daysRow.querySelectorAll('.chart-config-type-btn').forEach(b => b.removeClass('active'));
				btn.addClass('active');
			});
		}

		// Actions
		const actions = form.createDiv({ cls: 'dashboard-modal-actions' });
		const saveBtn = actions.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => {
			if (!this.keyValue) return;
			const label = this.labelValue || this.keyValue;
			this.onSave({
				id: this.existing?.id ?? `hm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
				key: this.keyValue,
				label,
				days: this.daysValue,
			});
			this.close();
		});

		const cancelBtn = actions.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());

		keyInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				saveBtn.click();
			}
		});

		if (!this.existing) {
			labelInput.focus();
		} else {
			keyInput.focus();
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
