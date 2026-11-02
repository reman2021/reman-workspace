import { App, Modal, Setting, setIcon } from 'obsidian';
import type { LibraryConfig, LibraryViewMode, PropertyFilter } from '../../core/types';
import { extractFrontmatterProperties, queryVaultFiles } from './query';
import { collectTableColumnCandidates, normalizeTableColumns, resolveTableColumns } from './table-columns';
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

		let tableColumnsTouched = config.tableColumns !== undefined;
		let selectedTableColumns = config.tableColumns !== undefined
			? normalizeTableColumns(config.tableColumns) ?? []
			: resolveTableColumns(config, queryVaultFiles(this.app, config));

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
							renderTableColumns();
						});
					}
				};
				search.addEventListener('input', renderValues);
				renderValues();
			});
			renderTableColumns();
		};
		new Setting(root).addButton(button => button.setButtonText(t('library.addFilter')).onClick(() => {
			const property = names[0]; if (!property) return;
			const filter: PropertyFilter = { property, values: [] };
			config.filters.push(filter);
			expandedIndex = config.filters.length - 1;
			renderFilters();
		}));

		const tableColumnEditor = root.createEl('details', { cls: 'dashboard-library-table-column-editor' });
		tableColumnEditor.createEl('summary', { text: t('library.tableColumns') });
		const tableColumnSearch = tableColumnEditor.createEl('input', {
			cls: 'dashboard-modal-input dashboard-library-table-column-search',
			attr: {
				type: 'search',
				placeholder: t('library.tableColumnSearchPlaceholder'),
				'aria-label': t('library.tableColumnSearchPlaceholder'),
			},
		});
		const tableColumnList = tableColumnEditor.createDiv({ cls: 'dashboard-library-table-column-list' });

		const displayTableColumn = (column: string): string => column === 'modified' ? t('library.sortModified') : column;
		const commitTableColumns = () => {
			tableColumnsTouched = true;
			config.tableColumns = [...selectedTableColumns];
		};
		const renderTableColumns = () => {
			const results = queryVaultFiles(this.app, config);
			const candidates = collectTableColumnCandidates(results);
			const candidateSet = new Set(candidates);
			if (!tableColumnsTouched) selectedTableColumns = resolveTableColumns(config, results);
			const availableSelection = selectedTableColumns.filter(column => candidateSet.has(column));
			if (availableSelection.length !== selectedTableColumns.length) {
				selectedTableColumns = availableSelection;
				if (tableColumnsTouched) config.tableColumns = [...selectedTableColumns];
			}
			const selected = new Set(selectedTableColumns);
			const ordered = [
				...selectedTableColumns,
				...candidates.filter(column => !selected.has(column)).sort((a, b) => a.localeCompare(b)),
			];
			const search = tableColumnSearch.value.trim().toLowerCase();
			const visible = search
				? ordered.filter(column => displayTableColumn(column).toLowerCase().includes(search))
				: ordered;

			tableColumnList.empty();
			if (visible.length === 0) {
				tableColumnList.createDiv({ cls: 'dashboard-library-table-column-empty', text: t('library.tableColumnNoMatches') });
				return;
			}
			for (const column of visible) {
				const isSelected = selected.has(column);
				const row = tableColumnList.createDiv({
					cls: 'dashboard-library-table-column-row' + (isSelected ? ' is-selected' : ''),
				});
				row.dataset.tableColumn = column;
				const label = row.createEl('label');
				const checkbox = label.createEl('input', {
					attr: { type: 'checkbox', 'aria-label': t('library.tableColumnToggle', { property: displayTableColumn(column) }) },
				});
				checkbox.checked = isSelected;
				label.createSpan({ text: displayTableColumn(column) });
				checkbox.addEventListener('change', () => {
					selectedTableColumns = checkbox.checked
						? [...selectedTableColumns, column]
						: selectedTableColumns.filter(item => item !== column);
					commitTableColumns();
					renderTableColumns();
				});

				const actions = row.createDiv({ cls: 'dashboard-library-table-column-actions' });
				if (!isSelected) continue;
				const selectedIndex = selectedTableColumns.indexOf(column);
				for (const [direction, offset, icon] of [['up', -1, 'arrow-up'], ['down', 1, 'arrow-down']] as const) {
					const targetIndex = selectedIndex + offset;
					const button = actions.createEl('button', {
						cls: 'dashboard-library-table-column-move',
						attr: {
							type: 'button',
							'aria-label': t(direction === 'up' ? 'library.tableColumnMoveUp' : 'library.tableColumnMoveDown', { property: displayTableColumn(column) }),
							'data-direction': direction,
						},
					});
					setIcon(button, icon);
					button.disabled = targetIndex < 0 || targetIndex >= selectedTableColumns.length;
					button.addEventListener('click', () => {
						if (button.disabled) return;
						const current = selectedTableColumns[selectedIndex]!;
						selectedTableColumns[selectedIndex] = selectedTableColumns[targetIndex]!;
						selectedTableColumns[targetIndex] = current;
						commitTableColumns();
						renderTableColumns();
					});
				}
			}
		};
		tableColumnSearch.addEventListener('input', renderTableColumns);
		renderFilters();
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
