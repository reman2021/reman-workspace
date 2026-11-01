import { App, Modal, Setting, setIcon } from 'obsidian';
import type { LibraryConfig, LibraryViewMode, PropertyFilter } from '../../core/types';
import { extractFrontmatterProperties } from './query';
import { initializeDashboardModal } from '../../ui/theme';
import { t } from '../../core/i18n';

export class LibraryConfigModal extends Modal {
	constructor(app: App, private config: LibraryConfig, private onSave: (config: LibraryConfig) => void) { super(app); }
	onOpen(): void {
		const root = this.contentEl;
		root.addClass('dashboard-modal'); initializeDashboardModal(this);
		root.createEl('h2', { text: t('library.configTitle') });
		const config: LibraryConfig = JSON.parse(JSON.stringify(this.config)) as LibraryConfig;
		new Setting(root).setName(t('library.viewMode')).addDropdown(control => control
			.addOptions({ grid: t('library.viewGrid'), list: t('library.viewList'), table: t('library.viewTable'), kanban: t('library.viewKanban') })
			.setValue(config.viewMode).onChange(value => { config.viewMode = value as LibraryViewMode; }));
		const properties = extractFrontmatterProperties(this.app);
		// Configuration choices contain only properties explicitly declared in frontmatter.
		for (const synthetic of ['modified', 'created', 'path', 'tags']) {
			const declared = this.app.vault.getMarkdownFiles().some(file => Object.prototype.hasOwnProperty.call(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}, synthetic));
			if (!declared) properties.delete(synthetic);
		}
		const names = [...properties.keys()].sort();
		const filterArea = root.createDiv({ cls: 'dashboard-library-filter-editor' });
		let expandedIndex: number | null = null;
		const renderFilters = () => {
			filterArea.empty();
			config.filters.forEach((filter, index) => {
				const card = filterArea.createDiv({ cls: 'dashboard-library-filter-config' });
				const header = card.createDiv({ cls: 'dashboard-library-filter-config-header' });
				const propertySelect = header.createEl('select', {
					cls: 'dashboard-library-filter-config-property',
					attr: { 'aria-label': t('library.filterProperty') },
				});
				for (const name of [...new Set([filter.property, ...names])]) {
					const option = propertySelect.createEl('option', { text: name, attr: { value: name } });
					option.selected = name === filter.property;
				}
				propertySelect.addEventListener('change', () => {
					filter.property = propertySelect.value;
					filter.values = [];
					expandedIndex = index;
					renderFilters();
				});

				const summary = header.createEl('button', {
					cls: 'dashboard-library-filter-config-summary',
					attr: { type: 'button', 'aria-expanded': String(expandedIndex === index) },
				});
				const updateSummary = () => {
					summary.textContent = filter.values.length > 0
						? t('library.filterSelectedCount', { count: filter.values.length })
						: t('library.filterAnyValue');
				};
				updateSummary();
				summary.addEventListener('click', () => {
					expandedIndex = expandedIndex === index ? null : index;
					renderFilters();
				});

				const remove = header.createEl('button', {
					cls: 'dashboard-library-filter-config-remove',
					attr: { type: 'button', 'aria-label': t('common.delete') },
				});
				setIcon(remove, 'trash-2');
				remove.addEventListener('click', () => {
					config.filters.splice(index, 1);
					expandedIndex = null;
					renderFilters();
				});

				if (expandedIndex !== index) return;
				const body = card.createDiv({ cls: 'dashboard-library-filter-config-body' });
				const search = body.createEl('input', {
					cls: 'dashboard-modal-input dashboard-library-filter-config-search',
					attr: { type: 'search', placeholder: t('library.filterSearchPlaceholder') },
				});
				const list = body.createDiv({ cls: 'dashboard-library-filter-config-values' });
				const values = [...new Set([...(properties.get(filter.property) ?? []), ...filter.values])].sort();
				const renderValues = () => {
					list.empty();
					const query = search.value.trim().toLowerCase();
					const filtered = query ? values.filter(value => value.toLowerCase().includes(query)) : values;
					if (filtered.length === 0) {
						list.createDiv({ cls: 'dashboard-library-filter-config-empty', text: t('library.filterNoValues') });
						return;
					}
					for (const value of filtered) {
						const label = list.createEl('label', { cls: 'dashboard-library-filter-config-value' });
						const checkbox = label.createEl('input', { attr: { type: 'checkbox' } });
						checkbox.checked = filter.values.includes(value);
						label.createSpan({ text: value });
						checkbox.addEventListener('change', () => {
							filter.values = checkbox.checked
								? [...new Set([...filter.values, value])]
								: filter.values.filter(item => item !== value);
							updateSummary();
						});
					}
				};
				search.addEventListener('input', renderValues);
				renderValues();
			});
		};
		renderFilters();
		new Setting(root).addButton(button => button.setButtonText(t('library.addFilter')).onClick(() => {
			const property = names[0]; if (!property) return;
			const filter: PropertyFilter = { property, values: [] };
			config.filters.push(filter);
			expandedIndex = config.filters.length - 1;
			renderFilters();
		}));
		const sortOptions = Object.fromEntries(['modified', 'created', 'name', ...names].map(name => [name, name]));
		new Setting(root).setName(t('library.sortBy')).addDropdown(control => control.addOptions(sortOptions).setValue(config.sortBy).onChange(value => { config.sortBy = value; }));
		new Setting(root).setName(t('library.sortDesc')).addToggle(control => control.setValue(config.sortDesc).onChange(value => { config.sortDesc = value; }));
		new Setting(root).setName(t('library.kanbanGroupBy')).addDropdown(control => control.addOptions({ '': '—', ...Object.fromEntries(names.map(name => [name, name])) })
			.setValue(config.kanbanGroupBy ?? '').onChange(value => { config.kanbanGroupBy = value; }));
		new Setting(root).addButton(button => button.setButtonText(t('common.save')).setCta().onClick(() => { this.onSave(config); this.close(); }))
			.addButton(button => button.setButtonText(t('common.cancel')).onClick(() => this.close()));
	}
	onClose(): void { this.contentEl.empty(); }
}
