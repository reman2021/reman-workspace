import { handleAsync } from '../utils/async';
import { App, setIcon } from 'obsidian';
import type { DashboardData, DashboardColumn, DashboardCard, RenderCallbacks, DashboardSettings, CardSize } from '../core/types';
import { t } from '../core/i18n';
import { renderLibrarySection } from '../features/library/section';
import { destroyLibraryPopups } from '../features/library/calendar-popup';
import { resolveVaultImage } from '../features/banner';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { readAllFrontmatterTrackerData } from '../features/tracking/service';
import { destroyAllTrackerCharts, destroyTrackerChartsIn, renderTrackerBody } from '../features/tracking/render';
import { getDashboardCssColor } from '../ui/css-color';
import { renderTaskBody } from '../features/cards/task-renderer';
import { renderMemoBody } from '../features/cards/memo-renderer';
import { closeAllReminderPopups } from '../features/cards/reminder-popup';

export { renderSidebarWeekCalendar } from './sidebar-calendar';
import {
	COLLAPSED_STORAGE_KEY,
	LEGACY_COLLAPSED_STORAGE_KEY,
	SHOW_ARCHIVED_STORAGE_KEY,
	LEGACY_SHOW_ARCHIVED_STORAGE_KEY,
} from '../core/identity';
export function destroyAllCharts(): void {
	destroyLibraryPopups();
	closeAllReminderPopups();
	destroyAllTrackerCharts();
}

export function destroyChartsIn(container: HTMLElement): void {
	destroyTrackerChartsIn(container);
	if (container.querySelector('.dashboard-library-content')) destroyLibraryPopups();
	closeAllReminderPopups();
}

let docDragSource: { cardId: string; docIndex: number } | null = null;

const VAULT_FILE_EXTS = new Set(['md', 'pdf', 'canvas', 'base', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'mp3', 'mp4', 'm4a', 'm4b', 'mov', 'mkv', 'avi']);

function getSearchableFiles(app: App) {
	return app.vault.getFiles()
		.filter(f => !f.path.startsWith('.') && VAULT_FILE_EXTS.has(f.extension));
}

export function renderDashboard(
	container: HTMLElement,
	data: DashboardData,
	callbacks: RenderCallbacks,
	app: App,
	settings?: DashboardSettings,
): void {
	container.empty();
	container.addClass('dashboard-kanban');

	for (const original of data.columns) {
		const column = { ...original, cards: original.cards.filter(card => card.type !== 'weather') };
		const section = renderDashboardSection(column, callbacks, app, data, settings);
		container.appendChild(section);
	}

	const addColBtn = container.createDiv({ cls: 'dashboard-add-section' });
	addColBtn.setText(t('renderer.addSection'));
	addColBtn.setAttribute('role', 'button');
	addColBtn.addEventListener('click', () => {
		if (addColBtn.querySelector('input')) return;
		addColBtn.empty();

		let selectedType = 'projects';

		const row = addColBtn.createDiv({ cls: 'dashboard-add-section-row' });

		const input = row.createEl('input', {
			cls: 'dashboard-task-input',
			attr: { type: 'text', placeholder: t('renderer.sectionName') },
		});

		const typePicker = row.createDiv({ cls: 'dashboard-section-type-picker' });
		const typeOptions = [
			{ value: 'projects', label: t('renderer.typeNotes') },
			{ value: 'todo', label: t('renderer.typeTodo') },
			{ value: 'memo', label: t('renderer.typeMemo') },
			{ value: 'library', label: t('renderer.typeLibrary') },
			{ value: 'heatmap', label: t('renderer.typeHeatmap') },
		];

		for (const opt of typeOptions) {
			const btn = typePicker.createEl('button', {
				cls: 'dashboard-section-type-btn' + (opt.value === selectedType ? ' active' : ''),
				text: opt.label,
				attr: { 'data-type': opt.value },
			});
			btn.addEventListener('mousedown', (e) => {
				e.preventDefault();
			});
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				selectedType = opt.value;
				typePicker.querySelectorAll('.dashboard-section-type-btn').forEach(b => b.removeClass('active'));
				btn.addClass('active');
			});
		}

		const confirmBtn = row.createEl('button', {
			cls: 'dashboard-section-confirm-btn',
			attr: { 'aria-label': t('common.save') },
		});
		setIcon(confirmBtn, 'check');
		confirmBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			finish();
		});

		const finish = () => {
			const name = input.value.trim();
			input.value = '';
			if (name) {
				callbacks.onColumnAdd(name, selectedType);
			}
			addColBtn.empty();
			addColBtn.setText(t('renderer.addSection'));
		};

		input.addEventListener('input', () => {
			const name = input.value.trim().toLowerCase();
			if (name === 'memo') {
				selectedType = 'memo';
			} else if (name === 'todo') {
				selectedType = 'todo';
			} else {
				return;
			}
			typePicker.querySelectorAll('.dashboard-section-type-btn').forEach(b => {
				b.toggleClass('active', b.getAttribute('data-type') === selectedType);
			});
		});

		input.addEventListener('keydown', (ke: KeyboardEvent) => {
			if (ke.key === 'Enter') {
				ke.preventDefault();
				finish();
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				addColBtn.empty();
				addColBtn.setText(t('renderer.addSection'));
			}
		});

		input.focus();
	});
}

function getCollapsedSections(app: App): Set<string> {
	try {
		const raw: unknown = app.loadLocalStorage(COLLAPSED_STORAGE_KEY)
			?? window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
			?? app.loadLocalStorage(LEGACY_COLLAPSED_STORAGE_KEY)
			?? window.localStorage.getItem(LEGACY_COLLAPSED_STORAGE_KEY);
		if (typeof raw !== 'string' || !raw) return new Set();
		return new Set(JSON.parse(raw) as string[]);
	} catch {
		return new Set();
	}
}

function saveCollapsedSections(app: App, collapsed: Set<string>): void {
	app.saveLocalStorage(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
}

function getShowArchivedSections(app: App): Set<string> {
	try {
		const raw: unknown = app.loadLocalStorage(SHOW_ARCHIVED_STORAGE_KEY)
			?? window.localStorage.getItem(SHOW_ARCHIVED_STORAGE_KEY)
			?? app.loadLocalStorage(LEGACY_SHOW_ARCHIVED_STORAGE_KEY)
			?? window.localStorage.getItem(LEGACY_SHOW_ARCHIVED_STORAGE_KEY);
		if (typeof raw !== 'string' || !raw) return new Set();
		return new Set(JSON.parse(raw) as string[]);
	} catch {
		return new Set();
	}
}

function saveShowArchivedSections(app: App, sections: Set<string>): void {
	app.saveLocalStorage(SHOW_ARCHIVED_STORAGE_KEY, JSON.stringify([...sections]));
}

function renderHeatmapItem(container: HTMLElement, item: import('../core/types').HeatmapItem, columnName: string, callbacks: RenderCallbacks, app: App): void {
	const el = container.createDiv({ cls: 'dashboard-heatmap-item' });
	el.dataset.heatmapId = item.id;

	// Label row
	const headerRow = el.createDiv({ cls: 'dashboard-heatmap-item-header' });
	const titleArea = headerRow.createDiv({ cls: 'dashboard-heatmap-item-title' });
	titleArea.createSpan({ cls: 'dashboard-heatmap-item-label', text: item.label });
	titleArea.createSpan({ cls: 'dashboard-heatmap-item-key', text: `(${item.key})` });

	const actions = headerRow.createDiv({ cls: 'dashboard-heatmap-item-actions' });

	const editBtn = actions.createEl('button', {
		cls: 'dashboard-heatmap-item-btn',
		attr: { 'aria-label': t('heatmap.editItem') },
	});
	setIcon(editBtn, 'settings');
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onHeatmapEdit(columnName, item.id);
	});

	const deleteBtn = actions.createEl('button', {
		cls: 'dashboard-heatmap-item-btn dashboard-heatmap-item-btn--danger',
		attr: { 'aria-label': t('heatmap.deleteItem') },
	});
	setIcon(deleteBtn, 'trash-2');
	deleteBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onHeatmapDelete(columnName, item.id);
	});

	// Heatmap grid
	const heatmapEl = el.createDiv({ cls: 'dashboard-heatmap-item-grid' });
	const data = readAllFrontmatterTrackerData(app, item.key, item.days);
	const validPoints = data.filter(p => p.value !== null);

	if (validPoints.length === 0) {
		heatmapEl.createDiv({ cls: 'dashboard-heatmap-item-no-data', text: t('heatmap.noData', { key: item.key }) });
		return;
	}

	const values = data.map(p => p.value);
	const minVal = Math.min(...values.filter((v): v is number => v !== null));
	const maxVal = Math.max(...values.filter((v): v is number => v !== null));
	const accentColor = getDashboardCssColor('--db-accent') || '#6366f1';
	const range = maxVal - minVal || 1;

	const firstDate = data[0] ? new Date(data[0].date + 'T00:00:00') : new Date();
	const startDayOfWeek = firstDate.getDay();
	const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

	const weeks: (import('../core/types').TrackerDataPoint | null)[][] = [];
	let currentWeek: (import('../core/types').TrackerDataPoint | null)[] = [];
	for (let i = 0; i < mondayOffset; i++) {
		currentWeek.push(null);
	}
	for (const point of data) {
		currentWeek.push(point);
		if (currentWeek.length === 7) {
			weeks.push(currentWeek);
			currentWeek = [];
		}
	}
	if (currentWeek.length > 0) {
		weeks.push(currentWeek);
	}

	const visibleWeeks = weeks;
	const grid = heatmapEl.createDiv({ cls: 'dashboard-heatmap-item-grid-inner' });
	grid.setCssProps({ 'display': 'grid' });
	grid.setCssProps({ 'grid-template-columns': `repeat(${visibleWeeks.length}, var(--dashboard-heatmap-cell-size))` });
	grid.setCssProps({ 'grid-template-rows': 'repeat(7, var(--dashboard-heatmap-cell-size))' });
	grid.setCssProps({ 'gap': '2px' });

	for (const week of visibleWeeks) {
		for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
			const point = week[dayIdx] ?? null;
			const cell = grid.createDiv({ cls: 'dashboard-heatmap-item-cell' });
			if (point === null || point.value === null) {
				cell.addClass('dashboard-heatmap-item-cell--empty');
			} else {
				const intensity = (point.value - minVal) / range;
				cell.setCssProps({ 'background-color': item.color || accentColor });
				cell.setCssProps({ 'opacity': String(0.38 + intensity * 0.62) });
				cell.title = `${point.date}: ${point.value}`;
			}
		}
	}

	// Stats row
	const statsRow = el.createDiv({ cls: 'dashboard-heatmap-item-stats' });
	const avgValue = Number((validPoints.reduce((sum, point) => sum + (point.value ?? 0), 0) / validPoints.length).toFixed(2));
	let streak = 0;
	for (let i = validPoints.length - 1; i >= 0; i--) {
		if (validPoints[i]!.value !== null) streak++;
		else break;
	}
	const completionRate = Math.round((validPoints.length / data.length) * 100);

	const currentEl = statsRow.createSpan({ cls: 'dashboard-heatmap-item-stat' });
	setIcon(currentEl.createSpan({ cls: 'dashboard-heatmap-item-stat-icon' }), 'chart-no-axes-column-increasing');
	currentEl.createSpan({ text: `${t('heatmap.current')}: ${avgValue}` });

	const streakEl = statsRow.createSpan({ cls: 'dashboard-heatmap-item-stat' });
	setIcon(streakEl.createSpan({ cls: 'dashboard-heatmap-item-stat-icon' }), 'flame');
	streakEl.createSpan({ text: t('heatmap.streak', { count: streak }) });

	const rateEl = statsRow.createSpan({ cls: 'dashboard-heatmap-item-stat' });
	setIcon(rateEl.createSpan({ cls: 'dashboard-heatmap-item-stat-icon' }), 'circle-check');
	rateEl.createSpan({ text: t('heatmap.rate', { rate: completionRate }) });
}

export function renderDashboardSection(originalColumn: DashboardColumn, callbacks: RenderCallbacks, app: App, data?: DashboardData, settings?: DashboardSettings): HTMLElement {
	const column = { ...originalColumn, cards: originalColumn.cards.filter(card => card.type !== 'weather') };
	const el = document.createElement('div');
	el.addClass('dashboard-section-row');
	el.dataset.column = column.name;
	const sectionType = getSectionType(column);
	el.dataset.sectionType = sectionType;

	const collapsed = getCollapsedSections(app);
	if (collapsed.has(column.name)) {
		el.addClass('dashboard-section-row--collapsed');
	}

	const header = el.createDiv({ cls: 'dashboard-section-header' });

	const titleWrap = header.createDiv({ cls: 'dashboard-section-title-wrap' });
	const toggle = titleWrap.createDiv({ cls: 'dashboard-section-toggle' });
	toggle.setAttribute('role', 'button');
	toggle.setAttribute('aria-label', 'Toggle section');
	const titleEl = titleWrap.createEl('h3', { text: column.name, cls: 'dashboard-section-title' });

	titleEl.addEventListener('dblclick', (e) => {
		e.stopPropagation();
		const currentName = titleEl.getText();
		titleEl.empty();
		const input = titleEl.createEl('input', {
			cls: 'dashboard-section-rename-input',
			attr: { type: 'text', value: currentName },
		});
		input.focus();
		input.select();

		const finish = (save: boolean) => {
			const newName = input.value.trim();
			if (save && newName && newName !== currentName) {
				callbacks.onColumnRename(currentName, newName);
			} else {
				titleEl.empty();
				titleEl.setText(currentName);
			}
		};

		input.addEventListener('keydown', (ke: KeyboardEvent) => {
			if (ke.key === 'Enter') {
				ke.preventDefault();
				finish(true);
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				finish(false);
			}
		});

		input.addEventListener('blur', () => {
			finish(true);
		});
	});
	titleEl.setCssProps({ 'cursor': 'pointer' });

	toggle.addEventListener('click', (e) => {
		e.stopPropagation();
		const isNowCollapsed = el.hasClass('dashboard-section-row--collapsed');
		if (isNowCollapsed) {
			el.removeClass('dashboard-section-row--collapsed');
			collapsed.delete(column.name);
		} else {
			el.addClass('dashboard-section-row--collapsed');
			collapsed.add(column.name);
		}
		saveCollapsedSections(app, collapsed);
	});

		const headerActions = header.createDiv({ cls: 'dashboard-section-header-actions' });

	if (sectionType === 'todo') {
		const sourcesBtn = headerActions.createEl('button', { cls: 'dashboard-section-add-btn dashboard-source-configure', attr: { 'aria-label': t('source.configure') } });
		setIcon(sourcesBtn, 'settings');
		sourcesBtn.addEventListener('click', () => callbacks.onTodoSourcesConfigure(column.name));
		const templateBtn = headerActions.createEl('button', {
			cls: 'dashboard-section-add-btn',
			attr: { 'aria-label': t('template.addFromTemplate') },
		});
		setIcon(templateBtn, 'layout-template');
		templateBtn.addEventListener('click', () => callbacks.onAddFromTemplate(column.name));

		const archivedCount = column.cards.filter(card => card.archived).length;
		if (archivedCount > 0) {
			const showArchived = getShowArchivedSections(app);
			const isShowingArchived = showArchived.has(column.name);
			const archiveToggleBtn = headerActions.createEl('button', {
				cls: `dashboard-section-add-btn dashboard-section-archive-toggle${isShowingArchived ? ' dashboard-section-archive-toggle--active' : ''}`,
				attr: { 'aria-label': isShowingArchived ? t('renderer.hideArchived') : t('renderer.showArchived') },
			});
			setIcon(archiveToggleBtn, isShowingArchived ? 'archive-x' : 'archive');
			archiveToggleBtn.createSpan({ cls: 'dashboard-section-archive-count', text: String(archivedCount) });
			archiveToggleBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!data) return;
				if (isShowingArchived) {
					showArchived.delete(column.name);
				} else {
					showArchived.add(column.name);
				}
				saveShowArchivedSections(app, showArchived);
				renderDashboard(el.parentElement as HTMLElement, data, callbacks, app, settings);
			});
		}
	}

	// Library section: render differently
	// Heatmap section: render heatmap items instead of cards
	if (sectionType === 'heatmap') {
		const isRowLayout = column.heatmapLayout === 'row';
		const layoutBtn = headerActions.createEl('button', {
			cls: 'dashboard-section-add-btn',
			attr: { 'aria-label': isRowLayout ? t('heatmap.layoutColumn') : t('heatmap.layoutRow') },
		});
		setIcon(layoutBtn, isRowLayout ? 'list' : 'columns-3');
		layoutBtn.addEventListener('click', () => {
			callbacks.onHeatmapLayoutToggle(column.name);
		});

		const addHeatmapBtn = headerActions.createEl('button', {
			cls: 'dashboard-section-add-btn',
			attr: { 'aria-label': t('heatmap.addItem') },
		});
		setIcon(addHeatmapBtn, 'plus');
		addHeatmapBtn.addEventListener('click', () => {
			callbacks.onHeatmapAdd(column.name);
		});

		const heatmapContainer = el.createDiv({
			cls: 'dashboard-heatmap-section' + (isRowLayout ? ' dashboard-heatmap-section--row' : ' dashboard-heatmap-section--column'),
		});
		const items = column.heatmapItems ?? [];
		if (items.length === 0) el.addClass('dashboard-section-row--empty');
		for (const item of items) {
			renderHeatmapItem(heatmapContainer, item, column.name, callbacks, app);
		}
		return el;
	}

	if (sectionType === 'library') {
		const configBtn = headerActions.createEl('button', {
			cls: 'dashboard-section-add-btn',
			attr: { 'aria-label': t('library.configure') },
		});
		setIcon(configBtn, 'settings');
		configBtn.addEventListener('click', () => {
			const event = new CustomEvent('dashboard-library-config', { detail: { columnName: column.name }, bubbles: true });
			el.dispatchEvent(event);
		});

		renderLibrarySection(el, column, app, (config) => {
			callbacks.onLibraryConfigChange(column.name, config);
		});
		return el;
	}

	const addCardBtn = headerActions.createEl('button', {
		cls: 'dashboard-section-add-btn',
		attr: { 'aria-label': t('renderer.addCardTo', { column: column.name }) },
	});
	setIcon(addCardBtn, 'plus');
	addCardBtn.addEventListener('click', () => callbacks.onCardAdd(column.name));

	const cardsContainer = el.createDiv({ cls: 'dashboard-section-cards' });
	if (sectionType === 'todo') callbacks.onTodoSourcesMount(cardsContainer, column);

	const visibleCards = column.cards.filter(card => !card.archived);
	for (const card of visibleCards) {
		try {
			const cardEl = renderCard(card, column.name, sectionType, callbacks, app, data, settings);
			cardsContainer.appendChild(cardEl);
		} catch (err) {
			console.error('[Dashboard] renderCard error:', card.id, card.type, err);
		}
	}

	const showArchived = sectionType === 'todo' && getShowArchivedSections(app).has(column.name);
	if (showArchived) {
		renderArchivedTodoList(el, column, callbacks);
	}
	const hasTodoSources = sectionType === 'todo'
		&& Boolean(column.todoSources?.monthly.enabled || column.todoSources?.daily.enabled);
	if (visibleCards.length === 0 && !hasTodoSources && !showArchived) {
		el.addClass('dashboard-section-row--empty');
	}

	return el;
}

function renderArchivedTodoList(container: HTMLElement, column: DashboardColumn, callbacks: RenderCallbacks): void {
	const archivedCards = column.cards
		.filter(card => card.archived)
		.sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
	if (archivedCards.length === 0) return;

	const archivePanel = container.createDiv({ cls: 'dashboard-archive-panel' });
	const header = archivePanel.createDiv({ cls: 'dashboard-archive-panel-header' });
	header.createDiv({ cls: 'dashboard-archive-panel-title', text: t('renderer.archivedCards') });
	header.createDiv({ cls: 'dashboard-archive-panel-count', text: String(archivedCards.length) });

	const list = archivePanel.createDiv({ cls: 'dashboard-archive-list' });
	for (const card of archivedCards) {
		const row = list.createDiv({ cls: 'dashboard-archive-row' });
		const main = row.createDiv({ cls: 'dashboard-archive-row-main' });
		main.createDiv({ cls: 'dashboard-archive-row-title', text: card.title });
		const meta = main.createDiv({ cls: 'dashboard-archive-row-meta' });
		meta.createSpan({ text: card.archivedAt ? `${t('renderer.archivedAt')} ${card.archivedAt}` : t('renderer.archivedAtUnknown') });
		if (card.tasks.length > 0) {
			meta.createSpan({ text: `${card.tasks.filter(task => task.checked).length}/${card.tasks.length}` });
		}

		const actions = row.createDiv({ cls: 'dashboard-archive-row-actions' });
		const restoreBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--restore',
			attr: { 'aria-label': t('renderer.restoreCard') },
		});
		setIcon(restoreBtn, 'undo-2');
		restoreBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardRestore(card.id);
		});

		const deleteBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--danger',
			attr: { 'aria-label': t('renderer.deleteCard') },
		});
		setIcon(deleteBtn, 'trash-2');
		deleteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardDelete(card.id);
		});
	}
}

function renderCard(card: DashboardCard, columnName: string, sectionType: string, callbacks: RenderCallbacks, app: App, data?: DashboardData, settings?: DashboardSettings): HTMLElement {
	const el = document.createElement('div');
	el.addClass('dashboard-card', `dashboard-card--${card.type}`);
	el.dataset.cardId = card.id;
	el.dataset.cardType = card.type;
	if (card.archived) el.dataset.archived = 'true';
	el.setAttribute('role', 'article');
	el.setAttribute('aria-label', card.title);

	if (card.color) {
		el.dataset.hasColor = 'true';
		el.style.setProperty('--db-card-accent', card.color);
	}

	const isMemo = sectionType === 'memo';
	const isTask = card.type === 'task' || sectionType === 'todo';
	const isTracker = card.type === 'tracker';
	const isWidget = isTracker;
	const isProjectLike = !isMemo && !isTask && !isWidget;
	const isDashboardSection = sectionType === 'dashboard';
	const showCover = isProjectLike && !isDashboardSection && Boolean(card.coverImage.trim());

	if (showCover) {
		el.addClass('dashboard-card--cover');
	}

	if (card.coverImage && showCover) {
		const resolved = resolveVaultImage(app, card.coverImage);
		if (resolved) {
			const cover = el.createDiv({ cls: 'dashboard-project-cover' });
			cover.setCssProps({ 'background-image': `url("${resolved}")` });
		} else {
			el.createDiv({ cls: 'dashboard-project-cover dashboard-project-cover--default' });
		}
	}

	const header = el.createDiv({ cls: 'dashboard-card-header' });

	// Mobile: tap header to toggle card action buttons
	header.addEventListener('touchstart', () => {
		const wasActive = header.hasClass('dashboard-card-header--touched');
		document.querySelectorAll('.dashboard-card-header--touched').forEach(el => {
			el.removeClass('dashboard-card-header--touched');
		});
		if (!wasActive) {
			header.addClass('dashboard-card-header--touched');
		}
	}, { passive: true });

	const titleEl = header.createEl('h4', { text: card.title, cls: 'dashboard-card-title' });

	const skipEditBtn = isMemo || isTask || (isWidget && isDashboardSection);

	titleEl.addEventListener('dblclick', (e) => {
		e.stopPropagation();
		const currentTitle = titleEl.getText();
		titleEl.empty();
		const input = titleEl.createEl('input', {
			cls: 'dashboard-title-edit-input',
			attr: { type: 'text', value: currentTitle },
		});
		input.focus();
		input.select();

		const finish = (save: boolean) => {
			const newTitle = input.value.trim();
			if (save && newTitle && newTitle !== currentTitle) {
				callbacks.onCardTitleEdit(card.id, newTitle);
			} else {
				titleEl.empty();
				titleEl.setText(currentTitle);
			}
		};

		input.addEventListener('keydown', (ke: KeyboardEvent) => {
			if (ke.key === 'Enter') {
				ke.preventDefault();
				finish(true);
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				finish(false);
			}
		});

		input.addEventListener('blur', () => {
			finish(true);
		});
	});
	titleEl.setCssProps({ 'cursor': 'pointer' });

	const actions = header.createDiv({ cls: 'dashboard-card-actions' });

	// Dashboard grid layout for widget cards
	if (isWidget && isDashboardSection) {
		const currentSize: CardSize = card.size || 'M';
		const sizeToGrid: Record<CardSize, { cols: number; rows: number }> = {
			S: { cols: 1, rows: 1 },
			M: { cols: 2, rows: 1 },
			L: { cols: 2, rows: 2 },
		};
		const grid = sizeToGrid[currentSize];
		el.setCssProps({ 'grid-column': `span ${grid.cols}` });
		el.setCssProps({ 'grid-row': `span ${grid.rows}` });

		// Size selector button for dashboard widgets only
		const sizeBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--size',
			attr: { 'aria-label': 'Card size' },
		});
		sizeBtn.setText(t('widget.size' + currentSize));
		sizeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const sizes: CardSize[] = ['S', 'M', 'L'];
			const nextIdx = (sizes.indexOf(currentSize) + 1) % sizes.length;
			const nextSize = sizes[nextIdx]!;
			callbacks.onCardSizeChange(card.id, nextSize);
		});
	}

	if (isMemo && (card.type === 'generic' || card.type === 'note') || isWidget) {
		const colorBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--color',
			attr: { 'aria-label': t('renderer.setMemoColor') },
		});
		setIcon(colorBtn, 'palette');
		if (card.color) {
			colorBtn.setCssProps({ 'color': card.color });
		}
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const input = document.createElement('input');
			input.type = 'color';
			input.value = card.color || '#f59e0b';
			input.setCssProps({ 'position': 'absolute' });
			input.setCssProps({ 'opacity': '0' });
			input.setCssProps({ 'width': '0' });
			input.setCssProps({ 'height': '0' });
			document.body.appendChild(input);
			input.addEventListener('input', () => {
				callbacks.onMemoColorChange(card, input.value);
			});
			input.addEventListener('change', () => {
				if (input.value) {
					callbacks.onMemoColorChange(card, input.value);
				}
				input.remove();
			});
			input.addEventListener('blur', () => {
				input.remove();
			});
			input.click();
		});
	}

	if (!skipEditBtn) {
		const editBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.editCard') },
		});
		setIcon(editBtn, 'pencil');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardEdit(card);
		});
	}

	if (isTask && !card.archived) {
		const archiveBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.archiveCard') },
		});
		setIcon(archiveBtn, 'archive');
		archiveBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardArchive(card.id);
		});
	}

	if (isTask && card.archived) {
		const restoreBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--restore',
			attr: { 'aria-label': t('renderer.restoreCard') },
		});
		setIcon(restoreBtn, 'undo-2');
		restoreBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardRestore(card.id);
		});
	}

	const deleteBtn = actions.createEl('button', {
		cls: 'dashboard-card-btn dashboard-card-btn--danger',
		attr: { 'aria-label': t('renderer.deleteCard') },
	});
	setIcon(deleteBtn, 'trash-2');
	deleteBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onCardDelete(card.id);
	});

	const body = el.createDiv({ cls: 'dashboard-card-body' });

	// When this is a project-like card, allow dropping docs onto the card body
	if (isProjectLike) {
		body.addEventListener('dragover', (e) => {
			if (!docDragSource) return;
			if (docDragSource.cardId === card.id) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			body.addClass('dashboard-card-body--doc-drop');
		});

		body.addEventListener('dragleave', (e) => {
			if (!body.contains(e.relatedTarget as Node)) {
				body.removeClass('dashboard-card-body--doc-drop');
			}
		});

		body.addEventListener('drop', (e) => {
			body.removeClass('dashboard-card-body--doc-drop');
			if (!docDragSource) return;
			if (docDragSource.cardId === card.id) return;
			if (e.defaultPrevented) return;
			e.preventDefault();
			const parseDocPaths = (b: string): string[] =>
				b.split('\n').map(l => l.trim()).filter(l => l.startsWith('[[') && l.endsWith(']]')).map(l => l.slice(2, -2));
			const destIndex = parseDocPaths(card.body).length;
			callbacks.onDocMoveToCard(docDragSource.cardId, docDragSource.docIndex, card.id, destIndex);
		});
	}

	renderCardBody(body, card, columnName, sectionType, callbacks, app, data, settings);

	if (card.dueDate) {
		const due = el.createDiv({ cls: 'dashboard-card-due' });
		due.createSpan({ text: card.dueDate });
	}

	if (isMemo) {
		if (card.width > 0) {
			const w = Math.max(200, Math.min(600, card.width));
			el.setCssProps({ 'flex': `0 0 ${w}px` });
			el.setCssProps({ 'min-width': `${w}px` });
			el.setCssProps({ 'max-width': `${w}px` });
		}
	}

	// Dashboard grid layout for widget cards (styles only, button already created above)
	if (isWidget && isDashboardSection) {
		// grid styles already set above when creating the size button
	} else if (isMemo || isTask || isProjectLike) {
		const minW = 200;
		const maxW = 600;
		if (!isMemo && card.width > 0) {
			const w = Math.max(minW, Math.min(500, card.width));
			el.setCssProps({ 'flex': `0 0 ${w}px` });
			el.setCssProps({ 'min-width': `${w}px` });
			el.setCssProps({ 'max-width': `${w}px` });
		}
		const handle = el.createDiv({ cls: 'dashboard-card-resize-handle' });
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startWidth = el.offsetWidth;
			el.addClass('dashboard-card--resizing');

			const onMove = (ev: MouseEvent) => {
				const delta = ev.clientX - startX;
				const newWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
				el.setCssProps({ 'flex': `0 0 ${newWidth}px` });
				el.setCssProps({ 'min-width': `${newWidth}px` });
				el.setCssProps({ 'max-width': `${newWidth}px` });
			};

			const onUp = (ev: MouseEvent) => {
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
				el.removeClass('dashboard-card--resizing');
				const finalWidth = Math.max(minW, Math.min(maxW, startWidth + (ev.clientX - startX)));
				if (finalWidth !== card.width) {
					callbacks.onCardWidthChange(card.id, finalWidth);
				}
			};

			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		});
	}

	return el;
}

function renderCardBody(container: HTMLElement, card: DashboardCard, columnName: string, sectionType: string, callbacks: RenderCallbacks, app: App, data?: DashboardData, settings?: DashboardSettings): void {
	if (card.type === 'weather') {

		return;
	}

	if (card.type === 'tracker') {
		renderTrackerBody(container, card, app, settings);
		return;
	}

	const isMemo = sectionType === 'memo';
	const isTaskCard = card.type === 'task' || sectionType === 'todo';

	if (isTaskCard) {
		renderTaskBody(container, card, callbacks, app);
		return;
	}

	if (isMemo) {
		renderMemoBody(container, card, callbacks, app);
		return;
	}

	// All non-memo, non-task cards render as project body
	renderProjectBody(container, card, callbacks, app);
}

function renderProjectBody(container: HTMLElement, card: DashboardCard, callbacks: RenderCallbacks, app: App): void {
		const parseDocPaths = (body: string): string[] =>
			body.split('\n')
				.map(line => line.trim())
				.filter(line => line.startsWith('[[') && line.endsWith(']]'))
				.map(line => line.slice(2, -2));

		const docPaths = parseDocPaths(card.body);

		const docList = container.createDiv({ cls: 'dashboard-project-docs' });
		docList.dataset.cardId = card.id;

		// Empty list drop target so docs can be dragged in
		docList.addEventListener('dragover', (e) => {
			if (!docDragSource) return;
			if (docDragSource.cardId === card.id) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			docList.addClass('dashboard-project-docs--drop-target');
		});

		docList.addEventListener('dragleave', (e) => {
			if (!docList.contains(e.relatedTarget as Node)) {
				docList.removeClass('dashboard-project-docs--drop-target');
			}
		});

		docList.addEventListener('drop', (e) => {
			e.preventDefault();
			docList.removeClass('dashboard-project-docs--drop-target');
			if (!docDragSource) return;
			if (docDragSource.cardId === card.id) return;
			const destIndex = docPaths.length;
			callbacks.onDocMoveToCard(docDragSource.cardId, docDragSource.docIndex, card.id, destIndex);
		});

		if (docPaths.length > 0) {

			docPaths.forEach((docPath, idx) => {
				const file = app.vault.getFileByPath(docPath);
				const docItem = docList.createDiv({ cls: 'dashboard-project-doc-item' });
				docItem.setAttribute('draggable', 'true');
				docItem.dataset.docIndex = String(idx);
				docItem.createSpan({ text: file?.basename ?? docPath.split('/').pop() ?? docPath, cls: 'dashboard-project-doc-name' });

				const removeBtn = docItem.createEl('button', {
					cls: 'dashboard-project-doc-remove',
					attr: { 'aria-label': t('renderer.removeDoc') },
				});
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', handleAsync(async (e: MouseEvent) => {
					e.stopPropagation();
					const currentPaths = parseDocPaths(card.body);
					const newPaths = currentPaths.filter((_, i) => i !== idx);
					const confirmed = await showConfirmDialog(app, {
						title: t('common.confirmDelete'),
						message: t('common.confirmDeleteMessage'),
					});
					if (!confirmed) return;
					callbacks.onProjectDocsUpdate(card, newPaths);
				}));

				docItem.addEventListener('click', (e) => {
					if ((e.target as HTMLElement).tagName === 'BUTTON') return;
					const f = app.vault.getFileByPath(docPath);
					if (f) {
						void app.workspace.getLeaf(false).openFile(f);
					} else {
						const basename = docPath.split('/').pop()?.replace(/\.md$/, '') ?? '';
						if (basename) {
							const found = getSearchableFiles(app).find(mf => mf.basename === basename);
							if (found) void app.workspace.getLeaf(false).openFile(found);
						}
					}
				});

				docItem.addEventListener('dragstart', (e) => {
					e.stopPropagation();
					docDragSource = { cardId: card.id, docIndex: idx };
					docItem.addClass('dashboard-task-item--dragging');
					if (e.dataTransfer) {
						e.dataTransfer.effectAllowed = 'move';
						e.dataTransfer.setData('text/plain', String(idx));
					}
				});

				docItem.addEventListener('dragend', () => {
					docItem.removeClass('dashboard-task-item--dragging');
					document.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
						(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
					});
					docDragSource = null;
				});

				docItem.addEventListener('dragover', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (!docDragSource) return;
					if (docDragSource.cardId === card.id && docDragSource.docIndex === idx) return;
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'move';
					}
					document.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
						(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
					});
					docItem.addClass('dashboard-task-item--drag-over');
				});

				docItem.addEventListener('dragleave', () => {
					docItem.removeClass('dashboard-task-item--drag-over');
				});

				docItem.addEventListener('drop', (e) => {
					e.preventDefault();
					e.stopPropagation();
					docItem.removeClass('dashboard-task-item--drag-over');
					if (!docDragSource) return;
					if (docDragSource.cardId === card.id && docDragSource.docIndex === idx) return;

					if (docDragSource.cardId === card.id) {
						callbacks.onProjectDocsReorder(card.id, docDragSource.docIndex, idx);
					} else {
						callbacks.onDocMoveToCard(docDragSource.cardId, docDragSource.docIndex, card.id, idx);
					}
				});
			});
		}

		const addDocRow = container.createDiv({ cls: 'dashboard-project-add-doc' });
		const docInput = addDocRow.createEl('input', {
			cls: 'dashboard-task-input',
			attr: { type: 'text', placeholder: t('renderer.addDocument') },
		});

		const docResults = addDocRow.createDiv({ cls: 'dashboard-project-doc-results' });

		docInput.addEventListener('input', () => {
			docResults.empty();
			const q = docInput.value.toLowerCase().trim();
			if (!q) return;

			const currentPaths = parseDocPaths(card.body);
			const files = getSearchableFiles(app)
				.filter(f => !f.path.startsWith('.'))
				.filter(f => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
				.filter(f => !currentPaths.includes(f.path))
				.slice(0, 50);

			for (const file of files) {
				const item = docResults.createDiv({ cls: 'dashboard-project-doc-result' });
				item.setText(file.basename);
				item.addEventListener('click', () => {
					const latestPaths = parseDocPaths(card.body);
					const newPaths = [...latestPaths, file.path];
					callbacks.onProjectDocsUpdate(card, newPaths);
				});
			}
		});

		docInput.addEventListener('blur', () => {
			setTimeout(() => docResults.empty(), 200);
		});
	}

function getSectionType(column: DashboardColumn): string {
	if (column.sectionType) return column.sectionType === 'notes' ? 'projects' : column.sectionType;
	const lower = column.name.toLowerCase();
	if (lower === 'memo') return 'memo';
	if (lower === 'todo') return 'todo';
	if (lower === 'projects') return 'projects';
	if (lower === 'notes') return 'projects';
	if (lower === 'dashboard') return 'dashboard';
	if (lower === 'library') return 'library';
	if (lower === 'heatmap') return 'heatmap';
	if (column.cards.length > 0) {
		const types = new Set(column.cards.map(c => c.type));
		const dashboardTypes = new Set(['chart', 'weather', 'tracker']);
		if ([...types].every(t => dashboardTypes.has(t)) && types.size > 0) return 'dashboard';
		if (types.has('task') && types.size === 1) return 'todo';
		if (types.has('task') && !types.has('project')) return 'todo';
		if (types.has('project') && types.size === 1) return 'projects';
		if (types.has('generic') && !types.has('project') && !types.has('task')) return 'memo';
	}
	return 'projects';
}
