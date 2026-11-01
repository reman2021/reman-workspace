import { App, Modal, Setting } from 'obsidian';
import type { TodoSourceConfig } from '../../core/types';
import { defaultTodoSources, resolveSourcePath } from './model';
import { initializeDashboardModal } from '../../ui/theme';
import { t } from '../../core/i18n';

export class TodoSourceConfigModal extends Modal {
	constructor(app: App, private config: TodoSourceConfig | undefined, private onSave: (config: TodoSourceConfig) => void) { super(app); }
	onOpen(): void {
		initializeDashboardModal(this);
		const config = structuredClone(this.config ?? defaultTodoSources());
		this.contentEl.createEl('h2', { text: t('source.configure') });
		const previews: Array<() => boolean> = [];
		for (const kind of ['monthly', 'daily'] as const) {
			const options = config[kind], root = this.contentEl.createDiv({ cls: 'dashboard-source-config-group' });
			root.createEl('h3', { text: t(`source.${kind}`) });
			const preview = root.createDiv({ cls: 'dashboard-source-preview' });
			const updatePreview = (): boolean => {
				try {
					const path = resolveSourcePath(options.pathTemplate);
					preview.setText(`${path} · ${t(this.app.vault.getFileByPath(path) ? 'source.exists' : 'source.notCreated')}`); return true;
				} catch { preview.setText(t('source.invalidPath')); return !options.enabled; }
			};
			previews.push(updatePreview);
			new Setting(root).setName(t('source.enabled')).addToggle(control => control.setValue(options.enabled).onChange(value => { options.enabled = value; updatePreview(); }));
			new Setting(root).setName(t('source.pathTemplate')).addText(control => control.setValue(options.pathTemplate).onChange(value => { options.pathTemplate = value; updatePreview(); }));
			new Setting(root).setName(t('source.heading')).addText(control => control
				.setPlaceholder(t('source.headingHelp'))
				.setValue(options.heading)
				.onChange(value => { options.heading = value.trim(); }));
			new Setting(root).setName(t('source.createCommand')).addText(control => control.setValue(options.createCommandId).onChange(value => { options.createCommandId = value.trim(); }));
			updatePreview();
		}
		const actions = this.contentEl.createDiv({ cls: 'dashboard-modal-actions' });
		actions.createEl('button', { text: t('common.save'), cls: 'mod-cta' }).addEventListener('click', () => {
			if (!previews.every(validate => validate())) return;
			this.onSave(config); this.close();
		});
		actions.createEl('button', { text: t('common.cancel') }).addEventListener('click', () => this.close());
	}
	onClose(): void { this.contentEl.empty(); }
}
