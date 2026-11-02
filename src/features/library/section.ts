import { formatValue } from '../../utils/value';
import { App, TFile, setIcon } from 'obsidian';
import type { LibraryConfig, PropertyFilter, LibraryViewMode } from '../../core/types';
import { t } from '../../core/i18n';
import { inheritDashboardThemeVars } from '../../ui/theme';
import { popupCleanups, showCalendarPopup } from './calendar-popup';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, formatDate, loadPreview, queryVaultFiles, type LibraryFileResult } from './query';
import { resolveTableColumns } from './table-columns';

export function renderLibrarySection(
	el: HTMLElement,
	column: { name: string; color: string; libraryConfig?: LibraryConfig },
	app: App,
	onConfigChange: (config: LibraryConfig) => void,
): void {
	const config = column.libraryConfig ?? {
		filters: [] as PropertyFilter[],
		viewMode: 'grid' as LibraryViewMode,
		sortBy: 'modified',
		sortDesc: true,
	};

	const sectionContent = el.createDiv({ cls: 'dashboard-library-content' });

	// Toolbar
	const toolbar = sectionContent.createDiv({ cls: 'dashboard-library-toolbar' });

	// Search
	const searchInput = toolbar.createEl('input', {
		cls: 'dashboard-library-search',
		attr: { type: 'text', placeholder: t('library.searchPlaceholder') },
	});

	// Sort
	const sortSelect = toolbar.createEl('select', { cls: 'dashboard-library-sort' });
	const sortOptions = [
		{ value: 'modified', label: t('library.sortModified') },
		{ value: 'created', label: t('library.sortCreated') },
		{ value: 'name', label: t('library.sortName') },
	];
	for (const opt of sortOptions) {
		const option = sortSelect.createEl('option', { text: opt.label, attr: { value: opt.value } });
		if (opt.value === config.sortBy) option.selected = true;
	}

	// Sort direction toggle
	const sortDirBtn = toolbar.createDiv({ cls: 'dashboard-library-sort-dir' });
	setIcon(sortDirBtn, config.sortDesc ? 'arrow-down-wide-narrow' : 'arrow-up-wide-narrow');

	// View mode toggle
	const viewToggle = toolbar.createDiv({ cls: 'dashboard-library-view-toggle' });
	const viewModes: LibraryViewMode[] = ['grid', 'list', 'table', 'kanban'];
	const viewIcons: Record<string, string> = { grid: 'layout-grid', list: 'list', table: 'table', kanban: 'columns' };
	for (const mode of viewModes) {
		const btn = viewToggle.createDiv({
			cls: 'dashboard-library-view-btn' + (mode === config.viewMode ? ' active' : ''),
		});
		setIcon(btn, viewIcons[mode] ?? 'file');
		btn.title = t('library.view' + mode.charAt(0).toUpperCase() + mode.slice(1));
		btn.dataset.viewMode = mode;
		btn.addEventListener('click', () => {
			viewToggle.querySelectorAll('.dashboard-library-view-btn').forEach(b => b.removeClass('active'));
			btn.addClass('active');
			const newConfig = { ...config, viewMode: mode };
			onConfigChange(newConfig);
			Object.assign(config, { viewMode: mode });
			currentPage = 1;
			renderContent(config);
		});
	}

		// Quick date filter button
		const filterBtn = toolbar.createDiv({ cls: 'dashboard-library-filter-btn' });
		setIcon(filterBtn, 'filter');
		filterBtn.title = t('library.quickFilter');

		// Filter tag
		const filterTag = toolbar.createDiv({ cls: 'dashboard-library-filter-tags' });

		// Quick date filter state (separate from config.filters)
		let quickProp: 'created' | 'modified' = config.quickDateFilter?.property ?? 'created';
		let quickStart = config.quickDateFilter?.start ?? '';
		let quickEnd = config.quickDateFilter?.end ?? '';

		// Popup
		let filterPopup: HTMLElement | null = null;


		function applyQuickFilter(): void {
			config.quickDateFilter = (quickStart || quickEnd) ? { property: quickProp, start: quickStart, end: quickEnd } : undefined;
			onConfigChange({ ...config });
			currentPage = 1;
			renderContent(config);
			renderFilterTag();
			updateFilterBtnState();
		}

		function onOutsideClick(event: MouseEvent): void {
			if (filterPopup && !filterPopup.contains(event.target as Node) && !filterBtn.contains(event.target as Node)) closePopup();
		}
		function openPopup(): void {
			closePopup();
			document.addEventListener('click', onOutsideClick);
			popupCleanups.add(closePopup);
			filterPopup = document.body.createDiv({ cls: 'dashboard-library-filter-popup' });

			inheritDashboardThemeVars(filterPopup, filterBtn);

			// Position below the filter button
			const rect = filterBtn.getBoundingClientRect();
			filterPopup.setCssProps({ 'position': 'fixed' });
			filterPopup.setCssProps({ 'top': `${rect.bottom + 4}px` });
			filterPopup.setCssProps({ 'left': `${rect.left}px` });
			filterPopup.setCssProps({ 'z-index': '10000' });

			// Property selector
			const propRow = filterPopup.createDiv({ cls: 'dashboard-library-quickfilter-row' });
			propRow.createDiv({ cls: 'dashboard-library-quickfilter-label', text: t('library.filterProperty') });
			const propSelect = propRow.createEl('select', { cls: 'dashboard-library-filter-popup-prop' });
			propSelect.createEl('option', { text: t('library.created'), attr: { value: 'created' } });
			propSelect.createEl('option', { text: t('library.modified'), attr: { value: 'modified' } });
			propSelect.value = quickProp;
			propSelect.addEventListener('change', () => {
				quickProp = propSelect.value as 'created' | 'modified';
			});

			// Date range
			const dateRow = filterPopup.createDiv({ cls: 'dashboard-library-quickfilter-row' });
			dateRow.createDiv({ cls: 'dashboard-library-quickfilter-label', text: t('library.filterDateRange') });
			const dateWrap = dateRow.createDiv({ cls: 'dashboard-library-filter-popup-dates' });
			const startBtn = dateWrap.createEl('button', {
				cls: 'dashboard-library-filter-date-btn' + (quickStart ? ' has-value' : ''),
				text: quickStart || t('library.dateStart'),
			});
			const endBtn = dateWrap.createEl('button', {
				cls: 'dashboard-library-filter-date-btn' + (quickEnd ? ' has-value' : ''),
				text: quickEnd || t('library.dateEnd'),
			});

			startBtn.addEventListener('click', (ev) => {
				ev.stopPropagation();
				showCalendarPopup(startBtn, quickStart, (date) => {
					quickStart = date;
					applyQuickFilter();
					if (document.body.contains(filterBtn)) openPopup();
				});
			});
			endBtn.addEventListener('click', (ev) => {
				ev.stopPropagation();
				showCalendarPopup(endBtn, quickEnd, (date) => {
					quickEnd = date;
					applyQuickFilter();
					if (document.body.contains(filterBtn)) openPopup();
				});
			});

			// Clear button
			if (quickStart || quickEnd) {
				const clearBtn = filterPopup.createEl('button', {
					cls: 'dashboard-library-filter-popup-clear',
					text: t('reminder.clearReminder'),
				});
				clearBtn.addEventListener('click', (ev) => {
					ev.stopPropagation();
					quickStart = '';
					quickEnd = '';
					applyQuickFilter();
					closePopup();
				});
			}
		}

		function closePopup(): void {
			document.removeEventListener('click', onOutsideClick);
			popupCleanups.delete(closePopup);
			if (filterPopup) {
				filterPopup.remove();
				filterPopup = null;
			}
		}

		function renderFilterTag(): void {
			filterTag.empty();
			if (!quickStart && !quickEnd) return;
			const start = quickStart || '...';
			const end = quickEnd || '...';
			const tag = filterTag.createDiv({
				cls: 'dashboard-library-filter-tag',
				text: `${quickProp}: ${start} ~ ${end}`,
			});
			const x = tag.createSpan({ cls: 'dashboard-library-filter-tag-x', text: '×' });
			x.addEventListener('click', () => {
				quickStart = '';
				quickEnd = '';
				applyQuickFilter();
				openPopup();
			});
		}

		function updateFilterBtnState(): void {
			filterBtn.classList.toggle('active', !!(quickStart || quickEnd));
		}

		filterBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (filterPopup) {
				closePopup();
			} else {
				openPopup();
			}
		});



		renderFilterTag();
		updateFilterBtnState();


	// Spacer
	toolbar.createDiv({ cls: 'dashboard-library-toolbar-spacer' });

	// File count
	const countEl = toolbar.createDiv({ cls: 'dashboard-library-count' });

	// Page size selector
	const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
	const pageSizeSelect = toolbar.createEl('select', { cls: 'dashboard-library-page-size' });
	for (const size of PAGE_SIZE_OPTIONS) {
		const opt = pageSizeSelect.createEl('option', { text: t('library.pageSize', { count: size }), attr: { value: formatValue(size) } });
		if (size === pageSize) opt.selected = true;
	}
	pageSizeSelect.addEventListener('change', () => {
		const newSize = parseInt(pageSizeSelect.value) || DEFAULT_PAGE_SIZE;
		Object.assign(config, { pageSize: newSize });
		onConfigChange({ ...config });
		currentPage = 1;
		renderContent(config);
	});

	// Configure button
	const configBtn = toolbar.createDiv({ cls: 'dashboard-library-config-btn' });
	setIcon(configBtn, 'settings');
	configBtn.title = t('library.configure');

	// Content area
	const contentArea = sectionContent.createDiv({ cls: 'dashboard-library-files' });

	// Pagination area
	const paginationArea = sectionContent.createDiv({ cls: 'dashboard-library-pagination' });

	let currentPage = 1;

	function renderContent(currentConfig: LibraryConfig): void {
		contentArea.empty();
		paginationArea.empty();

		let results = queryVaultFiles(app, currentConfig);

		// Apply search
		const search = searchInput.value.trim().toLowerCase();
		if (search) {
			results = results.filter(r => r.basename.toLowerCase().includes(search));
		}

			// Apply quick date filter
			if (currentConfig.quickDateFilter) {
				const qdf = currentConfig.quickDateFilter;
				results = results.filter(r => {
					const ts = qdf.property === 'modified' ? r.mtime : r.ctime;
					const dateStr = new Date(ts).toISOString().slice(0, 10);
					if (qdf.start && dateStr < qdf.start) return false;
					if (qdf.end && dateStr > qdf.end) return false;
					return true;
				});
			}

		const totalResults = results.length;
		countEl.textContent = t('library.fileCount', { count: totalResults });
		el.toggleClass('dashboard-section-row--empty', totalResults === 0);

		if (totalResults === 0 && currentConfig.filters.length === 0) {
			contentArea.createDiv({ cls: 'dashboard-library-empty', text: t('library.noConfig') });
			return;
		}

		if (totalResults === 0) {
			contentArea.createDiv({ cls: 'dashboard-library-empty', text: t('library.noFiles') });
			return;
		}

		// Paginate
		const effectivePageSize = currentConfig.pageSize ?? DEFAULT_PAGE_SIZE;
		const totalPages = Math.ceil(totalResults / effectivePageSize);
		if (currentPage > totalPages) currentPage = totalPages;
		if (currentPage < 1) currentPage = 1;

		const startIdx = (currentPage - 1) * effectivePageSize;
		const endIdx = Math.min(startIdx + effectivePageSize, totalResults);
		const pageResults = results.slice(startIdx, endIdx);

		switch (currentConfig.viewMode) {
			case 'grid':
				renderGridView(contentArea, pageResults, app);
				break;
			case 'list':
				renderListView(contentArea, pageResults, app);
				break;
			case 'table':
				renderTableView(contentArea, pageResults, app, currentConfig);
				break;
			case 'kanban':
				renderKanbanView(contentArea, pageResults, app, currentConfig);
				break;
		}

		// Render pagination controls
		if (totalPages > 1) {
			renderPagination(paginationArea, currentPage, totalPages, totalResults, (page) => {
				currentPage = page;
				renderContent(currentConfig);
				// Scroll to top of section content
				sectionContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			});
		}
	}

	// Search handler
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	searchInput.addEventListener('input', () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			currentPage = 1;
			renderContent(config);
		}, 200);
	});

	// Sort handlers
	sortSelect.addEventListener('change', () => {
		config.sortBy = sortSelect.value;
		onConfigChange(config);
		currentPage = 1;
		renderContent(config);
	});

	sortDirBtn.addEventListener('click', () => {
		config.sortDesc = !config.sortDesc;
		setIcon(sortDirBtn, config.sortDesc ? 'arrow-down-wide-narrow' : 'arrow-up-wide-narrow');
		onConfigChange(config);
		currentPage = 1;
		renderContent(config);
	});

	// Config button handler - will be wired in view.ts via custom event
	configBtn.addEventListener('click', () => {
		const event = new CustomEvent('dashboard-library-config', { detail: { columnName: column.name }, bubbles: true });
		el.dispatchEvent(event);
	});

	// Initial render
	renderContent(config);
}

function renderPagination(
	container: HTMLElement,
	currentPage: number,
	totalPages: number,
	totalResults: number,
	onPageChange: (page: number) => void,
): void {
	const nav = container.createDiv({ cls: 'dashboard-library-pagination-nav' });

	// Previous button
	const prevBtn = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage <= 1 ? ' disabled' : ''),
		text: '<',
	});
	if (currentPage > 1) {
		prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
	}

	// Page buttons
	const maxVisible = 5;
	let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
	const endPage = Math.min(totalPages, startPage + maxVisible - 1);
	startPage = Math.max(1, endPage - maxVisible + 1);

	if (startPage > 1) {
		const firstBtn = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: '1' });
		firstBtn.addEventListener('click', () => onPageChange(1));
		if (startPage > 2) {
			nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		}
	}

	for (let i = startPage; i <= endPage; i++) {
		const pageBtn = nav.createDiv({
			cls: 'dashboard-library-pagination-page' + (i === currentPage ? ' active' : ''),
			text: formatValue(i),
		});
		if (i !== currentPage) {
			pageBtn.addEventListener('click', () => onPageChange(i));
		}
	}

	if (endPage < totalPages) {
		if (endPage < totalPages - 1) {
			nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		}
		const lastBtn = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: formatValue(totalPages) });
		lastBtn.addEventListener('click', () => onPageChange(totalPages));
	}

	// Next button
	const nextBtn = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage >= totalPages ? ' disabled' : ''),
		text: '>',
	});
	if (currentPage < totalPages) {
		nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
	}
}

function openFile(app: App, file: TFile): void {
	void app.workspace.getLeaf(false).openFile(file);
}

function renderGridView(container: HTMLElement, results: LibraryFileResult[], app: App): void {
	const grid = container.createDiv({ cls: 'dashboard-library-grid' });

	for (const result of results) {
		const card = grid.createDiv({ cls: 'dashboard-library-card' });
		card.addEventListener('click', () => openFile(app, result.file));

		card.createDiv({ cls: 'dashboard-library-card-title', text: result.basename });

		// Path + creation time on same row
		const metaRow = card.createDiv({ cls: 'dashboard-library-card-meta' });
		const parts = result.file.path.split('/');
		if (parts.length > 1) {
			metaRow.createDiv({ cls: 'dashboard-library-card-path', text: parts.slice(0, -1).join('/') + '/' });
		}
		metaRow.createDiv({ cls: 'dashboard-library-card-date', text: formatDate(result.ctime) });

		// Async body preview
		const previewEl = card.createDiv({ cls: 'dashboard-library-card-preview dashboard-library-card-preview--loading' });
		loadPreview(app, result.file).then(text => {
			if (!previewEl.isConnected) return;
			previewEl.removeClass('dashboard-library-card-preview--loading');
			if (text) {
				previewEl.textContent = text;
			} else {
				previewEl.remove();
			}
		}).catch(() => {
			if (previewEl.isConnected) previewEl.remove();
		});
	}
}

function renderListView(container: HTMLElement, results: LibraryFileResult[], app: App): void {
	const list = container.createDiv({ cls: 'dashboard-library-list' });

	for (const result of results) {
		const item = list.createDiv({ cls: 'dashboard-library-list-item' });
		item.addEventListener('click', () => openFile(app, result.file));

		item.createDiv({ cls: 'dashboard-library-list-name', text: result.basename });
		item.createDiv({ cls: 'dashboard-library-list-spacer' });
		item.createDiv({ cls: 'dashboard-library-list-date', text: formatDate(result.ctime) });
	}
}

function startCellEdit(
	td: HTMLElement,
	file: TFile,
	prop: string,
	originalValue: unknown,
	app: App,
): void {
	if (td.querySelector('input, select')) return;

	const isArr = Array.isArray(originalValue);
	const displayValue = originalValue == null ? '' : isArr
		? (originalValue as unknown[]).map(String).join(', ')
		: formatValue(originalValue);

	td.empty();
	td.removeClass('dashboard-library-table-empty');

	const input = td.createEl('input', {
		cls: 'dashboard-library-table-edit-input',
		attr: { type: 'text', value: displayValue },
	});
	input.focus();
	input.select();

	let finished = false;
	const finish = (save: boolean) => {
		if (finished || !input.isConnected) return;
		finished = true;
		const raw = input.value.trim();
		input.remove();

		if (!save) {
			td.textContent = displayValue || '—';
			if (!displayValue) td.addClass('dashboard-library-table-empty');
			return;
		}

		// Parse value
		let newValue: unknown;
		if (raw === '') {
			newValue = null;
		} else if (isArr) {
			newValue = raw.split(',').map(s => s.trim()).filter(Boolean);
		} else {
			const num = Number(raw);
			newValue = !isNaN(num) && raw !== '' ? num : raw;
		}

		// Write via processFrontMatter
		void app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (newValue === null) {
				delete fm[prop];
			} else {
				fm[prop] = newValue;
			}
		});

		// Update display
		if (newValue === null) {
			td.textContent = '—';
			td.addClass('dashboard-library-table-empty');
		} else if (Array.isArray(newValue)) {
			td.textContent = newValue.join(', ');
		} else {
			td.textContent = formatValue(newValue);
		}
	};

	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') { e.preventDefault(); finish(true); }
		else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
	});
	input.addEventListener('blur', () => finish(true));
}

function renderTableView(container: HTMLElement, results: LibraryFileResult[], app: App, config: LibraryConfig): void {
	const columns = ['name', ...resolveTableColumns(config, results)];

	const table = container.createEl('table', { cls: 'dashboard-library-table' });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	for (const col of columns) {
		const th = headerRow.createEl('th', {
			text: col === 'name' ? t('library.sortName') : col === 'modified' ? t('library.sortModified') : col,
		});
		th.dataset.sortKey = col;
	}

	const tbody = table.createEl('tbody');
	for (const result of results) {
		const tr = tbody.createEl('tr');

		for (const col of columns) {
			const td = tr.createEl('td');
			if (col === 'name') {
				td.textContent = result.basename;
				td.addClass('dashboard-library-table-name');
				td.addEventListener('click', (e) => {
					e.stopPropagation();
					openFile(app, result.file);
				});
			} else if (col === 'modified') {
				td.textContent = formatDate(result.mtime);
			} else {
				const value = result.frontmatter[col];
				if (value == null) {
					td.addClass('dashboard-library-table-empty');
					td.textContent = '—';
				} else if (Array.isArray(value)) {
					td.textContent = value.map(String).join(', ');
				} else {
					td.textContent = formatValue(value);
				}
				td.addClass('dashboard-library-table-editable');
				td.addEventListener('dblclick', (e) => {
					e.stopPropagation();
					startCellEdit(td, result.file, col, value, app);
				});
			}
		}
	}
}

function renderKanbanView(container: HTMLElement, results: LibraryFileResult[], app: App, config: LibraryConfig): void {
	const groupBy = config.kanbanGroupBy ?? config.filters[0]?.property ?? 'tags';
	const kanban = container.createDiv({ cls: 'dashboard-library-kanban' });

	// Group results
	const groups = new Map<string, LibraryFileResult[]>();
	const noGroup: LibraryFileResult[] = [];

	for (const result of results) {
		const value = result.frontmatter[groupBy];
		if (value == null) {
			noGroup.push(result);
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				const key = formatValue(v);
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key)!.push(result);
			}
		} else {
			const key = formatValue(value);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(result);
		}
	}

	// Render columns
	for (const [groupName, groupResults] of groups) {
		const col = kanban.createDiv({ cls: 'dashboard-library-kanban-col' });
		col.createDiv({ cls: 'dashboard-library-kanban-col-title', text: `${groupName} (${groupResults.length})` });
		for (const result of groupResults) {
			const card = col.createDiv({ cls: 'dashboard-library-kanban-card' });
			card.addEventListener('click', () => openFile(app, result.file));
			card.createDiv({ cls: 'dashboard-library-kanban-card-title', text: result.basename });
			card.createDiv({ cls: 'dashboard-library-kanban-card-date', text: formatDate(result.mtime) });
		}
	}

	if (noGroup.length > 0) {
		const col = kanban.createDiv({ cls: 'dashboard-library-kanban-col' });
		col.createDiv({ cls: 'dashboard-library-kanban-col-title', text: `${t('library.notSet')} (${noGroup.length})` });
		for (const result of noGroup) {
			const card = col.createDiv({ cls: 'dashboard-library-kanban-card' });
			card.addEventListener('click', () => openFile(app, result.file));
			card.createDiv({ cls: 'dashboard-library-kanban-card-title', text: result.basename });
		}
	}
}
