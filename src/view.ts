import { TodoSourceController } from './todo-source-controller';
import { TodoSourceConfigModal } from './todo-source-config-modal';
import { handleAsync } from './async-utils';
import { getCommands } from './internal-api';
import { ItemView, Notice, setIcon, WorkspaceLeaf, TFile, Events } from 'obsidian';
import type DashboardPlugin from './main';
import type { DashboardData, DashboardCard, DashboardUpdate, QuickAction, BannerData, LibraryConfig } from './types';
import { SyncEngine } from './sync';
import { renderDashboard, renderDashboardSection, destroyAllCharts, destroyChartsIn, renderSidebarWeekCalendar } from './renderer';
import { renderBanner, BannerEditModal, resolveVaultImage } from './banner';
import { getRecentDocs, renderRecentDocs } from './recent';
import { renderQuickActions, AddActionModal, DocSearchModal } from './quick-actions';
import { CardEditModal } from './card-edit-modal';
import { showConfirmDialog } from './confirm-dialog';
import { LibraryConfigModal } from './library-config-modal';
import { TrackerConfigModal } from './tracker-config-modal';
import { HeatmapConfigModal } from './heatmap-config-modal';
import { TemplatePickerModal } from './template-modal';
import { ReminderNoticeModal } from './reminder-notice';
import { t } from './i18n';
import {
	DASHBOARD_ROOT_CLASS,
	LEGACY_DASHBOARD_ROOT_CLASS,
	DASHBOARD_VIEW_TYPE,
	SIDEBAR_PINNED_STORAGE_KEY,
	LEGACY_SIDEBAR_PINNED_STORAGE_KEY,
	BANNER_COLLAPSED_STORAGE_KEY,
	LEGACY_BANNER_COLLAPSED_STORAGE_KEY,
} from './identity';

export { DASHBOARD_VIEW_TYPE, LEGACY_DASHBOARD_VIEW_TYPE } from './identity';

export class DashboardView extends ItemView {
	private sourceControllers = new Map<string, TodoSourceController>();
	private plugin: DashboardPlugin;
	private sync: SyncEngine;
	private data: DashboardData | null = null;
	private cleanupFns: Array<() => void> = [];
	private bannerCleanupFns: Array<() => void> = [];
	private vaultEventRefs: Array<{ evt: Events; ref: unknown }> = [];
	private recentDocsTimer: ReturnType<typeof setTimeout> | null = null;
	private libraryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly RECENT_DOCS_DEBOUNCE = 500;
	private bannerQuoteIndex = 0;
	private bannerImageIndex = 0;
	private static readonly BANNER_QUOTE_ROTATION_MS = 60 * 60 * 1000; // 1 hour (on the hour)
	private static readonly BANNER_IMAGE_ROTATION_MS = 30 * 60 * 1000; // 30 min (on the half)
	private static readonly REMINDER_CHECK_MS = 60 * 1000; // 1 minute
	private static readonly BANNER_QUOTE_OFFSET_MS = 60 * 60 * 1000; // offset by 1 hour from image
	private reminderTimer: ReturnType<typeof setInterval> | null = null;
	private firedReminders = new Set<string>();
	private sidebarPinned = (this.app.loadLocalStorage(SIDEBAR_PINNED_STORAGE_KEY)
		?? window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY)
		?? this.app.loadLocalStorage(LEGACY_SIDEBAR_PINNED_STORAGE_KEY)
		?? this.app.loadLocalStorage('sidebar-pinned')
		?? window.localStorage.getItem(LEGACY_SIDEBAR_PINNED_STORAGE_KEY)) === 'true';
	private sidebarExpanded = false;
	private bannerCollapsed = (this.app.loadLocalStorage(BANNER_COLLAPSED_STORAGE_KEY)
		?? window.localStorage.getItem(BANNER_COLLAPSED_STORAGE_KEY)
		?? this.app.loadLocalStorage(LEGACY_BANNER_COLLAPSED_STORAGE_KEY)
		?? this.app.loadLocalStorage('banner-collapsed')
		?? window.localStorage.getItem(LEGACY_BANNER_COLLAPSED_STORAGE_KEY)) === 'true';
	private pendingScrollCardId: string | null = null;
	private pendingScrollToLastCardOfColumn: string | null = null;
	private preserveBannerOnNextRender = false;
	private sourceControllersMountedInRender: Set<string> | null = null;
	private readonly viewType: string;

	constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin, viewType = DASHBOARD_VIEW_TYPE) {
		super(leaf);
		this.plugin = plugin;
		this.viewType = viewType;
		const backupDir = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/backups`;
		this.sync = new SyncEngine(this.app, this.plugin.settings, backupDir);
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.plugin.settings.dashboardTitle.trim() || t('main.dashboard');
	}

	getIcon(): string {
		return 'home';
	}

	async onOpen(): Promise<void> {
		this.sync.updateSettings(this.plugin.settings);
		this.sync.onDataUpdate((data, update) => this.applyDataUpdate(data, update));

		await this.sync.init();
		this.registerVaultListeners();
		this.startReminderChecker();

	}

	async onClose(): Promise<void> {
		this.runCleanup();
		this.unregisterVaultListeners();
		this.stopReminderChecker();
		this.sync.destroy();
	}

	async refresh(): Promise<void> {
		this.sync.updateSettings(this.plugin.settings);
		const data = this.sync.getData();
		if (data) {
			this.render(data);
		}
	}

	addSection(): void {
		this.containerEl.querySelector<HTMLElement>('.dashboard-add-section')?.click();
	}

	private applyDataUpdate(data: DashboardData, update: DashboardUpdate): void {
		if (this.getDashboardRoot()) {
			if (update.scope === 'columns') {
				this.renderUpdatedColumns(data, update.columnNames);
				return;
			}
			if (update.scope === 'quick-actions') {
				this.renderUpdatedQuickActions(data);
				return;
			}
			if (update.scope === 'banner') {
				this.renderUpdatedBanner(data);
				return;
			}
		}
		this.render(data);
	}

	private getDashboardRoot(): HTMLElement | null {
		const host = this.containerEl.children[1] as HTMLElement | undefined;
		if (!host) return null;
		if (host.hasClass(DASHBOARD_ROOT_CLASS) || host.hasClass(LEGACY_DASHBOARD_ROOT_CLASS)) return host;
		return host.querySelector<HTMLElement>(`:scope > .${DASHBOARD_ROOT_CLASS}, :scope > .${LEGACY_DASHBOARD_ROOT_CLASS}`);
	}

	private render(data: DashboardData): void {
		const host = this.containerEl.children[1] as HTMLElement;
		const previousRoot = this.getDashboardRoot();
		const shouldPreserveBanner = this.preserveBannerOnNextRender;
		this.preserveBannerOnNextRender = false;
		const preservedBanner = shouldPreserveBanner
			? previousRoot?.querySelector<HTMLElement>('.dashboard-banner') ?? null
			: null;

		const savedKanbanScroll = previousRoot?.querySelector<HTMLElement>('.dashboard-kanban')?.scrollTop ?? 0;
		const savedSidebarScroll = previousRoot?.querySelector<HTMLElement>('.dashboard-sidebar-scroll')?.scrollTop ?? 0;
		const savedCardScrolls = new Map<string, number>();
		previousRoot?.querySelectorAll<HTMLElement>('.dashboard-section-cards').forEach((cards) => {
			const key = cards.closest<HTMLElement>('.dashboard-section-row')?.dataset.column;
			if (key) savedCardScrolls.set(key, cards.scrollLeft);
		});
		const savedTaskListScrolls = new Map<string, number>();
		previousRoot?.querySelectorAll<HTMLElement>('.dashboard-task-list').forEach((list) => {
			if (list.dataset.cardId) savedTaskListScrolls.set(list.dataset.cardId, list.scrollTop);
		});

		this.runCleanup(Boolean(preservedBanner), true);
		this.data = data;
		this.firedReminders.clear();
		this.sourceControllersMountedInRender = new Set();

		const root = document.createElement('div');
		root.addClass(DASHBOARD_ROOT_CLASS, LEGACY_DASHBOARD_ROOT_CLASS);
		root.dataset.theme = 'default';

		if (preservedBanner) {
			root.appendChild(preservedBanner);
		} else {
			const bannerEl = renderBanner(root, data.banner, () => this.openBannerEditModal(data), this.app);
			this.renderMobileActions(bannerEl);
			if (this.bannerCollapsed && window.innerWidth > 640) bannerEl.addClass('dashboard-banner--collapsed');
			this.setupBannerBehavior(bannerEl);
			void this.applyQuoteLibrary(data.banner, bannerEl);
			this.setupBannerRotation(root, data.banner);
		}

		const mainLayout = root.createDiv({ cls: 'dashboard-main' });
		const sidebar = mainLayout.createDiv({ cls: 'dashboard-sidebar' });
		if (this.sidebarPinned) sidebar.addClass('dashboard-sidebar--pinned');
		else if (this.sidebarExpanded) sidebar.addClass('dashboard-sidebar--expanded');
		else sidebar.addClass('dashboard-sidebar--collapsed');
		this.renderSidebar(sidebar, root);
		this.setupSidebarBehavior(sidebar, root);

		const kanban = mainLayout.createDiv({ cls: 'dashboard-kanban-wrapper' });
		renderDashboard(kanban, data, this.createCallbacks(), this.app, this.plugin.settings);
		for (const [name, controller] of this.sourceControllers) {
			if (this.sourceControllersMountedInRender.has(name)) continue;
			controller.unload();
			this.sourceControllers.delete(name);
		}
		this.sourceControllersMountedInRender = null;
		kanban.addEventListener('dashboard-library-config', ((event: CustomEvent) => {
			this.openLibraryConfigModal((event.detail as { columnName: string }).columnName);
		}) as EventListener);

		host.removeClass(DASHBOARD_ROOT_CLASS, LEGACY_DASHBOARD_ROOT_CLASS);
		host.removeAttribute('data-theme');
		host.replaceChildren(root);

		root.querySelector<HTMLElement>('.dashboard-kanban')?.scrollTo({ top: savedKanbanScroll });
		root.querySelector<HTMLElement>('.dashboard-sidebar-scroll')?.scrollTo({ top: savedSidebarScroll });
		root.querySelectorAll<HTMLElement>('.dashboard-section-cards').forEach((cards) => {
			const key = cards.closest<HTMLElement>('.dashboard-section-row')?.dataset.column;
			const saved = key ? savedCardScrolls.get(key) : undefined;
			if (saved !== undefined) cards.scrollLeft = saved;
		});
		root.querySelectorAll<HTMLElement>('.dashboard-task-list').forEach((list) => {
			const saved = list.dataset.cardId ? savedTaskListScrolls.get(list.dataset.cardId) : undefined;
			if (saved !== undefined) list.scrollTop = saved;
		});
		this.applyPendingScroll(root);
	}

	private renderUpdatedColumns(data: DashboardData, columnNames: string[]): void {
		const root = this.getDashboardRoot();
		if (!root) { this.render(data); return; }
		this.data = data;
		for (const columnName of [...new Set(columnNames)]) {
			const column = data.columns.find(item => item.name === columnName);
			const current = Array.from(root.querySelectorAll<HTMLElement>('.dashboard-section-row'))
				.find(section => section.dataset.column === columnName);
			if (!column || !current) { this.render(data); return; }
			const parent = current.parentElement;
			if (!parent) continue;
			const active = document.activeElement;
			if (active instanceof HTMLElement && current.contains(active)) active.blur();
			if (current.parentElement !== parent) continue;
			const cardsScroll = current.querySelector<HTMLElement>('.dashboard-section-cards')?.scrollLeft ?? 0;
			this.sourceControllers.get(columnName)?.unload();
			this.sourceControllers.delete(columnName);
			destroyChartsIn(current);
			if (current.parentElement !== parent) continue;
			const replacement = renderDashboardSection(column, this.createCallbacks(), this.app, data, this.plugin.settings);
			if (current.parentElement !== parent) continue;
			parent.replaceChild(replacement, current);
			const cards = replacement.querySelector<HTMLElement>('.dashboard-section-cards');
			if (cards) cards.scrollLeft = cardsScroll;
		}
		this.applyPendingScroll(root);
	}

	private renderUpdatedQuickActions(data: DashboardData): void {
		const root = this.getDashboardRoot();
		const sidebar = root?.querySelector<HTMLElement>('.dashboard-sidebar');
		const current = sidebar?.querySelector<HTMLElement>('.dashboard-quick-actions');
		if (!root || !sidebar || !current) { this.render(data); return; }
		this.data = data;
		const staging = document.createElement('div');
		this.renderSidebarQuickActions(staging, sidebar);
		const replacement = staging.firstElementChild;
		if (!(replacement instanceof HTMLElement)) { this.render(data); return; }
		current.replaceWith(replacement);
		this.closeMobileDrawer();
	}

	private renderUpdatedBanner(data: DashboardData): void {
		const root = this.getDashboardRoot();
		const current = root?.querySelector<HTMLElement>('.dashboard-banner');
		if (!root || !current) { this.render(data); return; }
		this.data = data;
		for (const fn of this.bannerCleanupFns) fn();
		this.bannerCleanupFns = [];
		const staging = document.createElement('div');
		const replacement = renderBanner(staging, data.banner, () => this.openBannerEditModal(data), this.app);
		this.renderMobileActions(replacement);
		if (this.bannerCollapsed && window.innerWidth > 640) replacement.addClass('dashboard-banner--collapsed');
		current.replaceWith(replacement);
		this.setupBannerBehavior(replacement);
		void this.applyQuoteLibrary(data.banner, replacement);
		this.setupBannerRotation(root, data.banner);
	}

	private applyPendingScroll(root: HTMLElement): void {
		if (this.pendingScrollCardId) {
			const card = Array.from(root.querySelectorAll<HTMLElement>('[data-card-id]'))
				.find(item => item.dataset.cardId === this.pendingScrollCardId);
			if (card) requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }));
			this.pendingScrollCardId = null;
		}
		if (this.pendingScrollToLastCardOfColumn) {
			const columnName = this.pendingScrollToLastCardOfColumn;
			const section = Array.from(root.querySelectorAll<HTMLElement>('.dashboard-section-row'))
				.find(item => item.dataset.column === columnName);
			const cards = section?.querySelectorAll<HTMLElement>('.dashboard-card');
			const lastCard = cards?.[cards.length - 1];
			if (lastCard) requestAnimationFrame(() => lastCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }));
			this.pendingScrollToLastCardOfColumn = null;
		}
	}

	private renderMobileActions(bannerEl: HTMLElement): void {
		const actions = bannerEl.createDiv({ cls: 'dashboard-mobile-actions' });

		const linksBtn = actions.createEl('button', {
			cls: 'dashboard-mobile-action-btn',
			attr: { 'aria-label': t('mobile.quickActions') },
		});
		setIcon(linksBtn, 'zap');
		linksBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openMobileDrawer('quickActions');
		});

		const recentBtn = actions.createEl('button', {
			cls: 'dashboard-mobile-action-btn',
			attr: { 'aria-label': t('mobile.recent') },
		});
		setIcon(recentBtn, 'clock');
		recentBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openMobileDrawer('recent');
		});

		// On mobile, tapping right half of banner reveals the edit button
		const overlay = bannerEl.querySelector('.dashboard-banner-overlay') as HTMLElement;
		if (overlay) {
			overlay.addEventListener('click', (e) => {
				const rect = overlay.getBoundingClientRect();
				const tapX = (e).clientX - rect.left;
				if (tapX > rect.width * 0.5) {
					const editBtn = overlay.querySelector('.dashboard-banner-edit-btn') as HTMLElement;
					if (editBtn) {
						editBtn.addClass('dashboard-banner-edit-btn--mobile-visible');
					}
				}
			});
		}
	}

	private setupBannerBehavior(bannerEl: HTMLElement): void {
		const pinBtn = bannerEl.createEl('button', {
			cls: 'dashboard-banner-pin-btn',
			attr: { 'aria-label': 'Toggle banner' },
		});
		setIcon(pinBtn, 'bookmark');

		pinBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (window.innerWidth <= 640) return;
			this.bannerCollapsed = !this.bannerCollapsed;
			bannerEl.toggleClass('dashboard-banner--collapsed', this.bannerCollapsed);
			this.app.saveLocalStorage(BANNER_COLLAPSED_STORAGE_KEY, String(this.bannerCollapsed));
		});

		const onResize = () => {
			if (window.innerWidth <= 640 && this.bannerCollapsed) {
				bannerEl.removeClass('dashboard-banner--collapsed');
			} else if (this.bannerCollapsed) {
				bannerEl.addClass('dashboard-banner--collapsed');
			}
		};
		window.addEventListener('resize', onResize);
		this.bannerCleanupFns.push(() => window.removeEventListener('resize', onResize));
	}

	private setupBannerRotation(container: HTMLElement, banner: BannerData): void {
		// Quote rotation
		const quotes = banner.quoteLibraryPath?.trim() ? undefined : banner.quotes;
		if (quotes && quotes.length > 1) {
			// Offset by 1 hour so quote and image swaps don't overlap
			const quoteIndex = Math.floor((Date.now() + DashboardView.BANNER_QUOTE_OFFSET_MS) / DashboardView.BANNER_QUOTE_ROTATION_MS) % quotes.length;
			this.bannerQuoteIndex = quoteIndex;

			const quoteEl = container.querySelector('.dashboard-banner-quote') as HTMLElement;
			const authorEl = container.querySelector('.dashboard-banner-author') as HTMLElement;
			if (quoteEl && authorEl) {
				const initial = quotes[quoteIndex]!;
				quoteEl.textContent = initial.quote;
				authorEl.textContent = initial.author;

				const rotateQuote = () => {
					this.bannerQuoteIndex = (this.bannerQuoteIndex + 1) % quotes.length;
					const next = quotes[this.bannerQuoteIndex]!;

					quoteEl.addClass('dashboard-banner-quote--fading');
					authorEl.addClass('dashboard-banner-author--fading');

					setTimeout(() => {
						quoteEl.textContent = next.quote;
						authorEl.textContent = next.author;
						quoteEl.removeClass('dashboard-banner-quote--fading');
						authorEl.removeClass('dashboard-banner-author--fading');
					}, 400);
				};

				const quoteTimer = setInterval(rotateQuote, DashboardView.BANNER_QUOTE_ROTATION_MS);
				this.bannerCleanupFns.push(() => clearInterval(quoteTimer));
			}
		}

		// Image rotation
		const images = banner.images;
		if (images && images.length > 1) {
			const imgIndex = Math.floor(Date.now() / DashboardView.BANNER_IMAGE_ROTATION_MS) % images.length;
			this.bannerImageIndex = imgIndex;

			const bannerEl = container.querySelector('.dashboard-banner') as HTMLElement;
			if (bannerEl) {
				const resolved = resolveVaultImage(this.app, images[imgIndex]!);
				if (resolved) {
					bannerEl.setCssProps({ 'background-image': `url("${resolved}")` });
				}

				const rotateImage = () => {
					this.bannerImageIndex = (this.bannerImageIndex + 1) % images.length;
					const nextPath = images[this.bannerImageIndex]!;
					const nextResolved = resolveVaultImage(this.app, nextPath);

					bannerEl.addClass('dashboard-banner--fading');

					setTimeout(() => {
						if (nextResolved) {
							bannerEl.setCssProps({ 'background-image': `url("${nextResolved}")` });
						}
						bannerEl.removeClass('dashboard-banner--fading');
					}, 600);
				};

				const imgTimer = setInterval(rotateImage, DashboardView.BANNER_IMAGE_ROTATION_MS);
				this.bannerCleanupFns.push(() => clearInterval(imgTimer));
			}
		}
	}

	private async applyQuoteLibrary(banner: BannerData, bannerEl: HTMLElement): Promise<void> {
		const path = banner.quoteLibraryPath?.trim();
		if (!path) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const quotes = raw.split(/\r?\n/).map(parseQuoteLibraryLine).filter(item => item.quote);
			if (quotes.length === 0) return;
			const quoteEl = bannerEl.querySelector('.dashboard-banner-quote');
			const authorEl = bannerEl.querySelector('.dashboard-banner-author');
			if (!quoteEl || !authorEl) return;
			if (!bannerEl.isConnected) return;
			const rotate = () => {
				const index = Math.floor(Date.now() / DashboardView.BANNER_QUOTE_ROTATION_MS) % quotes.length;
				const next = quotes[index];
				if (next) { quoteEl.textContent = next.quote; authorEl.textContent = next.author; }
			};
			rotate();
			const timer = setInterval(rotate, DashboardView.BANNER_QUOTE_ROTATION_MS);
			this.bannerCleanupFns.push(() => clearInterval(timer));
		} catch {
			// Keep the manually configured quote as the fallback.
		}
	}

	private openMobileDrawer(type: 'quickActions' | 'recent'): void {
		this.closeMobileDrawer();

		const root = this.getDashboardRoot();
		if (!root) return;

		const firstSection = root.querySelector('.dashboard-section-row') as HTMLElement;
		const drawerTop = firstSection ? firstSection.getBoundingClientRect().top : 0;

		const drawer = root.createDiv({ cls: 'dashboard-mobile-drawer' });
		drawer.setCssProps({ 'top': `${drawerTop}px` });

		const content = drawer.createDiv({ cls: 'dashboard-mobile-drawer-content' });

		if (type === 'quickActions') {
			content.createEl('h4', { text: t('mobile.quickActions'), cls: 'dashboard-mobile-drawer-title' });
			if (this.data) {
				renderQuickActions(
					content,
					this.data.quickActions,
					(action) => { void this.executeAction(action); this.closeMobileDrawer(); },
					handleAsync(async (index: number) => {
						const confirmed = await showConfirmDialog(this.app, {
							title: t('common.confirmDelete'),
							message: t('common.confirmDeleteMessage'),
						});
						if (!confirmed) return;
						void this.sync.removeQuickAction(index);
					}),
					() => this.openAddActionModal(),
					undefined,
					undefined,
					this.data.quickActionOrder,
					handleAsync((order: string[]) => this.sync.reorderQuickActions(order)),
					handleAsync(async (key: string) => {
						const confirmed = await showConfirmDialog(this.app, {
							title: t('common.confirmDelete'),
							message: t('common.confirmDeleteMessage'),
						});
						if (!confirmed) return;
						void this.sync.removeQuickActionByKey(key);
					}),
					this.data.hiddenPresets,
			{ app: this.app, onOpen: path => { void this.navigateToPath(path); } },
				);
			}
		} else {
			content.createEl('h4', { text: t('mobile.recent'), cls: 'dashboard-mobile-drawer-title' });
			const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
			renderRecentDocs(content, docs, handleAsync((path: string) => this.navigateToPath(path)));
		}

		const backdrop = drawer.createDiv({ cls: 'dashboard-mobile-drawer-backdrop' });
		backdrop.addEventListener('click', () => this.closeMobileDrawer());

		requestAnimationFrame(() => {
			content.addClass('dashboard-mobile-drawer-content--open');
		});
	}

	private closeMobileDrawer(): void {
		const root = this.getDashboardRoot();
		if (!root) return;
		const existing = root.querySelector('.dashboard-mobile-drawer');
		if (existing) existing.remove();
	}

	private renderSidebar(sidebar: HTMLElement, root: HTMLElement): void {
		if (!this.data) return;

		const scroll = sidebar.createDiv({ cls: 'dashboard-sidebar-scroll' });
		renderSidebarWeekCalendar(scroll);
		this.renderSidebarQuickActions(scroll, sidebar);

		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(
			scroll,
			docs,
			handleAsync((path: string) => this.navigateToPath(path)),
		);
	}

	private renderSidebarQuickActions(container: HTMLElement, sidebar: HTMLElement): void {
		if (!this.data) return;
		renderQuickActions(
			container,
			this.data.quickActions,
			handleAsync((action: QuickAction) => this.executeAction(action)),
			(index) => {
				void showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then(confirmed => {
					if (confirmed) void this.sync.removeQuickAction(index);
				});
			},
			() => this.openAddActionModal(),
			this.sidebarPinned,
			() => {
				this.sidebarPinned = !this.sidebarPinned;
				this.app.saveLocalStorage(SIDEBAR_PINNED_STORAGE_KEY, String(this.sidebarPinned));
				if (this.sidebarPinned) {
					sidebar.addClass('dashboard-sidebar--pinned');
					sidebar.removeClass('dashboard-sidebar--expanded');
					sidebar.removeClass('dashboard-sidebar--collapsed');
					this.sidebarExpanded = false;
				} else {
					sidebar.removeClass('dashboard-sidebar--pinned');
					sidebar.removeClass('dashboard-sidebar--collapsed');
					sidebar.addClass('dashboard-sidebar--expanded');
					this.sidebarExpanded = true;
				}
			},
			this.data.quickActionOrder,
			handleAsync((order: string[]) => this.sync.reorderQuickActions(order)),
			(key) => {
				void showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then(confirmed => {
					if (confirmed) void this.sync.removeQuickActionByKey(key);
				});
			},
			this.data.hiddenPresets,
			{ app: this.app, onOpen: path => { void this.navigateToPath(path); } },
		);
	}

	private setupSidebarBehavior(sidebar: HTMLElement, root: HTMLElement): void {
		// Create slim indicator (visible only when collapsed)
		sidebar.createDiv({ cls: 'dashboard-sidebar-slim-indicator' });

		// Use capture phase so child handlers can't stopPropagation before we see it
		sidebar.addEventListener('mousedown', (e: MouseEvent) => {
			if (this.sidebarPinned) return;
			if (sidebar.hasClass('dashboard-sidebar--collapsed')) {
				e.preventDefault();
				e.stopPropagation();
				sidebar.removeClass('dashboard-sidebar--collapsed');
				sidebar.addClass('dashboard-sidebar--expanded');
				this.sidebarExpanded = true;
			}
		}, true);

		// Click outside to collapse
		const outsideHandler = (e: MouseEvent) => {
			if (this.sidebarPinned) return;
			if (!this.sidebarExpanded) return;
			if (sidebar.contains(e.target as Node)) return;
			sidebar.removeClass('dashboard-sidebar--expanded');
			sidebar.addClass('dashboard-sidebar--collapsed');
			this.sidebarExpanded = false;
		};
		root.addEventListener('click', outsideHandler);
		this.cleanupFns.push(() => root.removeEventListener('click', outsideHandler));
	}

	private createCallbacks() {
		return {
			onTodoSourcesConfigure: (columnName: string) => {
				const config = this.data?.columns.find(column => column.name === columnName)?.todoSources;
				new TodoSourceConfigModal(this.app, config, config => { void this.sync.updateTodoSources(columnName, config); }).open();
			},
			onTodoSourcesMount: (container: HTMLElement, column: import('./types').DashboardColumn) => {
				this.sourceControllersMountedInRender?.add(column.name);
				const existing = this.sourceControllers.get(column.name);
				if (!column.todoSources?.monthly.enabled && !column.todoSources?.daily.enabled) {
					existing?.unload(); this.sourceControllers.delete(column.name); return;
				}
				if (existing?.rebind(container, column.todoSources)) return;
				existing?.unload(); this.sourceControllers.delete(column.name);
				const controller = new TodoSourceController(this.app, container, column.todoSources);
				this.sourceControllers.set(column.name, controller); controller.load();
			},
			onCardEdit: (card: DashboardCard) => this.openCardEditModal(card),
			onCardDelete: async (cardId: string) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				void this.sync.deleteCard(cardId);
				new Notice(t('card.deleted'));
			},
			onCardArchive: async (cardId: string) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('renderer.archiveCard'),
					message: t('renderer.archiveCardConfirm'),
					confirmText: t('renderer.archiveCard'),
				});
				if (!confirmed) return;
				void this.sync.archiveCard(cardId);
				new Notice(t('renderer.cardArchived'));
			},
			onCardRestore: (cardId: string) => {
				void this.sync.restoreCard(cardId);
				new Notice(t('renderer.cardRestored'));
			},
			onCheckboxToggle: (cardId: string, idx: number, checked: boolean) => this.runTaskMutation(() => this.sync.toggleTask(cardId, idx, checked)),
			onTaskAdd: (cardId: string, text: string) => this.runTaskMutation(() => this.sync.addTask(cardId, text)),
			onTaskDelete: async (cardId: string, idx: number) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				void this.runTaskMutation(() => this.sync.deleteTask(cardId, idx));
			},
			onTaskReorder: (cardId: string, from: number, to: number) => this.runTaskMutation(() => this.sync.reorderTask(cardId, from, to)),
			onTaskMoveToCard: (srcCardId: string, taskIndex: number, destCardId: string, destIndex: number) => this.runTaskMutation(() => this.sync.moveTaskToCard(srcCardId, taskIndex, destCardId, destIndex)),
			onTaskEdit: (cardId: string, idx: number, text: string) => this.runTaskMutation(() => this.sync.editTask(cardId, idx, text)),
			onMemoUpdate: (card: DashboardCard, updates: { body: string; blockquote: string }) => this.sync.updateMemoCard(card.id, updates),
			onProjectDocsUpdate: (card: DashboardCard, docPaths: string[]) => this.sync.updateProjectDocs(card.id, docPaths),
			onProjectDocsReorder: (cardId: string, from: number, to: number) => this.sync.reorderDocPaths(cardId, from, to),
				onDocMoveToCard: (srcCardId: string, docIndex: number, destCardId: string, destIndex: number) => this.sync.moveDocToCard(srcCardId, docIndex, destCardId, destIndex),
			onCardAdd: (colName: string) => {
				const column = this.data?.columns.find(col => col.name === colName);
				const effectiveType = column?.sectionType ?? colName.toLowerCase();
				if (effectiveType === 'dashboard') {
					this.openTrackerConfigModal(colName);
				} else if (effectiveType === 'memo' || effectiveType === 'todo') {
					this.pendingScrollToLastCardOfColumn = colName;
					void this.sync.addCard(colName);
				} else {
					this.openProjectSearchModal(colName);
				}
			},
				onColumnAdd: (name: string, sectionType?: string) => {
					void this.sync.addColumn(name, sectionType).then(() => {
						if (sectionType === 'library') {
							this.openLibraryConfigModal(name);
						}
					});
				},
			onBannerEdit: () => {
				if (this.data) this.openBannerEditModal(this.data);
			},
			onQuickActionAdd: () => this.openAddActionModal(),
			onQuickActionRemove: (index: number) => {
				void showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then(confirmed => {
					if (confirmed) void this.sync.removeQuickAction(index);
				});
			},
			onMemoColorChange: (card: DashboardCard, color: string) => this.sync.updateMemoColor(card.id, color),
			onProjectCoverChange: (card: DashboardCard, imagePath: string) => this.sync.updateProjectCover(card.id, imagePath),
				onCardTitleEdit: (cardId: string, newTitle: string) => this.sync.updateCard(cardId, { title: newTitle }),
				onCardWidthChange: (cardId: string, width: number) => void this.sync.updateCardWidth(cardId, width),
					onCardSizeChange: (cardId: string, size: string) => this.sync.updateCardSize(cardId, size as import('./types').CardSize),
				onCardGridChange: (cardId: string, gridCols: number, gridRows: number) => this.sync.updateCardGrid(cardId, gridCols, gridRows),
				onCardGridMove: (cardId: string, gridCol: number, gridRow: number) => this.sync.updateCardGridMove(cardId, gridCol, gridRow),
				onFileDrop: (cardId: string, filePath: string) => this.handleFileDrop(cardId, filePath),
				onColumnRename: (oldName: string, newName: string) => this.sync.renameColumn(oldName, newName),
			onTaskReminderEdit: (cardId: string, taskIndex: number, reminder: string | undefined) => this.sync.editTaskReminder(cardId, taskIndex, reminder),
			onAddFromTemplate: (columnName: string) => this.openTemplatePicker(columnName),
				onLibraryConfigChange: (columnName: string, config: LibraryConfig) => this.sync.updateLibraryConfig(columnName, config, false),
			onHeatmapAdd: (columnName: string) => this.openHeatmapConfigModal(columnName),
			onHeatmapEdit: (columnName: string, itemId: string) => {
				const col = this.data?.columns.find(c => c.name === columnName);
				const item = col?.heatmapItems?.find(i => i.id === itemId);
				if (item) this.openHeatmapConfigModal(columnName, item);
			},
			onHeatmapDelete: (columnName: string, itemId: string) => {
				void import('./confirm-dialog').then(({ showConfirmDialog }) =>
					showConfirmDialog(this.app, {
						title: t('common.confirmDelete'),
						message: t('common.confirmDeleteMessage'),
					}).then(confirmed => {
						if (confirmed) void this.sync.deleteHeatmapItem(columnName, itemId);
					})
				);
			},
			onHeatmapLayoutToggle: (columnName: string) => this.sync.toggleHeatmapLayout(columnName),
		};
	}

	private handleFileDrop(cardId: string, filePath: string): void {
		if (!this.data) return;
		let sectionType = 'projects';
		let cardType = 'generic';
		for (const col of this.data.columns) {
			const card = col.cards.find(c =>void  c.id === cardId);
			if (card) {
				sectionType = col.sectionType ?? col.name.toLowerCase();
				cardType = card.type;
				break;
			}
		}
		if (cardType === 'weather' || cardType === 'tracker') return;
			if (cardType === 'task' || sectionType === 'todo') {
			void this.runTaskMutation(() => this.sync.addTask(cardId, `[[${filePath}]]`));
		} else if (sectionType === 'memo') {
			void this.sync.addFileLinkToMemo(cardId, filePath);
		} else {
			void this.sync.addDocToCard(cardId, filePath);
		}
	}

	private openBannerEditModal(data: DashboardData): void {
		const modal = new BannerEditModal(this.app, data.banner, (updates) => {
			void this.sync.updateBanner(updates);
		});
		modal.open();
	}

	private async runTaskMutation(action: () => Promise<void>): Promise<void> {
		this.preserveBannerOnNextRender = true;
		try {
			await action();
		} finally {
			this.preserveBannerOnNextRender = false;
		}
	}

	private openCardEditModal(card: DashboardCard): void {
		const modal = new CardEditModal(this.app, card, (updates) => {
			void this.sync.updateCard(card.id, updates);
		});
		modal.open();
	}

	private openTrackerConfigModal(colName: string): void {
		const modal = new TrackerConfigModal(this.app, (title, config) => {
			void this.sync.addCard(colName, {
				title,
				type: 'tracker',
				trackerConfig: config,
			});
		});
		modal.open();
	}

	private openTemplatePicker(colName: string): void {
		const modal = new TemplatePickerModal(
			this.app,
			this.plugin,
			(template) => {
				this.pendingScrollToLastCardOfColumn = colName;
				void this.sync.addCard(colName, {
					title: template.name,
					type: 'task',
					tasks: template.tasks.map(text => ({ text, checked: false })),
				});
			},
		);
		modal.open();
	}

		private openHeatmapConfigModal(columnName: string, existing?: import('./types').HeatmapItem): void {
		const modal = new HeatmapConfigModal(this.app, (item) => {
			if (existing) {
				void this.sync.updateHeatmapItem(columnName, existing.id, item);
			} else {
				void this.sync.addHeatmapItem(columnName, item);
			}
		}, existing);
		modal.open();
	}

	private openLibraryConfigModal(colName: string): void {
		const column = this.data?.columns.find(col => col.name === colName);
		const existingConfig = column?.libraryConfig ?? {
			filters: [],
			viewMode: 'grid' as const,
			sortBy: 'modified',
			sortDesc: true,
		};
		const modal = new LibraryConfigModal(
			this.app,
			existingConfig,
			(config) => {
				void this.sync.updateLibraryConfig(colName, config);
			},
		);
		modal.open();
	}

	private openAddActionModal(): void {
		const modal = new AddActionModal(this.app, (action) => {
			void this.sync.addQuickAction(action);
		});
		modal.open();
	}

	private async executeAction(action: QuickAction): Promise<void> {
		if (action.type === 'file') {
			await this.navigateToPath(action.target);
		} else if (action.type === 'command') {
			if (action.target === 'daily-notes') {
				await this.createNewJournal();
			} else {
				getCommands(this.app)?.executeCommandById(action.target);
			}
		}
	}

	private async createNewJournal(): Promise<void> {
		const now = new Date();
		const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		const filePath = `${dateStr}.md`;

		let file = this.app.vault.getFileByPath(filePath);
		if (!file) {
			file = await this.app.vault.create(filePath, `# ${dateStr}\n\n`);
		}

		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private openProjectSearchModal(colName: string): void {
		const modal = new DocSearchModal(this.app, (link) => {
			void this.sync.addCard(colName, {
				title: link.name,
				body: `[[${link.path}]]`,
			});
		});
		modal.open();
	}

	private async navigateToPath(path: string): Promise<void> {
		let file = this.app.vault.getFileByPath(path);
		if (!file && !path.endsWith('.md')) {
			file = this.app.vault.getFileByPath(`${path}.md`);
		}

		if (!file) {
			const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			if (basename) {
				const found = this.app.vault.getMarkdownFiles().find(mf => mf.basename === basename);
				if (found) file = found;
			}
		}

		if (file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			return;
		}

		const folderPath = path.replace(/\/$/, '');
		const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
		if (abstractFile) {
			const leaves = this.app.workspace.getLeavesOfType('file-explorer');
			if (leaves.length > 0) {
				this.app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
			}
		}
	}

	private registerVaultListeners(): void {
		const events = this.app.vault;
		const handler = (file?: import('obsidian').TAbstractFile) => {
			if (this.sync.isDashboardFile(file)) return;
			this.debouncedRefreshRecentDocs();
			if (!file || ![...this.sourceControllers.values()].some(controller => controller.usesPath(file.path))) this.debouncedRefreshLibrarySections();
		};

		const createRef = events.on('create', handler);
		const modifyRef = events.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				handler(file);
			}
		});
		const deleteRef = events.on('delete', handler);
		const renameRef = events.on('rename', handler);

		this.vaultEventRefs = [
			{ evt: events, ref: createRef },
			{ evt: events, ref: modifyRef },
			{ evt: events, ref: deleteRef },
			{ evt: events, ref: renameRef },
		];
	}

	private unregisterVaultListeners(): void {
		if (this.libraryRefreshTimer) { clearTimeout(this.libraryRefreshTimer); this.libraryRefreshTimer = null; }
		for (const { evt, ref } of this.vaultEventRefs) {
			evt.offref(ref as Parameters<typeof evt.offref>[0]);
		}
		this.vaultEventRefs = [];
		if (this.recentDocsTimer) {
			clearTimeout(this.recentDocsTimer);
			this.recentDocsTimer = null;
		}
	}

	private debouncedRefreshRecentDocs(): void {
		if (this.recentDocsTimer) clearTimeout(this.recentDocsTimer);
		this.recentDocsTimer = setTimeout(() => {
			this.refreshRecentDocs();
		}, this.RECENT_DOCS_DEBOUNCE);
	}

	private debouncedRefreshLibrarySections(): void {
		if (!this.data) return;
		const hasLibrary = this.data.columns.some(col => col.sectionType === 'library');
		if (!hasLibrary) return;
		if (this.libraryRefreshTimer) clearTimeout(this.libraryRefreshTimer);
		this.libraryRefreshTimer = setTimeout(() => {
			const data = this.sync.getData();
			if (data) {
				const columns = data.columns.filter(column => column.sectionType === 'library').map(column => column.name);
				this.renderUpdatedColumns(data, columns);
			}
		}, 500);
	}


	private refreshRecentDocs(): void {
		const root = this.getDashboardRoot();
		if (!root) return;

		const recentSection = root.querySelector('.dashboard-recent');
		if (!recentSection) return;

		const parent = recentSection.parentElement;
		if (!parent) return;

		recentSection.remove();
		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(parent, docs, handleAsync((path: string) => this.navigateToPath(path)));
	}

	private runCleanup(preserveBanner = false, preserveSourceControllers = false): void {
		if (!preserveSourceControllers) {
			this.sourceControllers.forEach(controller => controller.unload()); this.sourceControllers.clear();
		}
		destroyAllCharts();
		for (const fn of this.cleanupFns) fn();
		this.cleanupFns = [];
		if (!preserveBanner) {
			for (const fn of this.bannerCleanupFns) fn();
			this.bannerCleanupFns = [];
		}
	}

	private startReminderChecker(): void {
		this.checkReminders();
		this.reminderTimer = setInterval(() => this.checkReminders(), DashboardView.REMINDER_CHECK_MS);
	}

	private stopReminderChecker(): void {
		if (this.reminderTimer) {
			clearInterval(this.reminderTimer);
			this.reminderTimer = null;
		}
	}

	private checkReminders(): void {
		if (!this.data) return;
		const now = new Date();

		for (const col of this.data.columns) {
			for (const card of col.cards) {
				for (let i = 0; i < card.tasks.length; i++) {
					const task = card.tasks[i]!;
					if (!task.reminder || task.checked) continue;

					const key = `${card.id}-${i}`;
					if (this.firedReminders.has(key)) continue;

					const parts = task.reminder.trim().split(/\s+/);
					if (parts.length < 2) continue;
					const [dateStr, timeStr] = parts;
					const [year, month, day] = dateStr!.split('-').map(Number);
					const [hour, min] = timeStr!.split(':').map(Number);
					if (!year || !month || !day) continue;
					const due = new Date(year, month - 1, day, hour ?? 0, min ?? 0);

					if (now >= due) {
						this.firedReminders.add(key);
						const cleanText = task.text.replace(/\[\[[^\]]+\]\]/g, (match) => {
							const inner = match.slice(2, -2);
							return inner.split('|').pop()?.split('/').pop()?.replace(/\.md$/, '') ?? inner;
						});
						this.showReminderModal(cleanText, card.id, i);
					}
				}
			}

		}
	}

	private showReminderModal(taskText: string, cardId: string, taskIndex: number): void {
		const modal = new ReminderNoticeModal(
			this.app,
			taskText,
			() => {
				void this.sync.editTaskReminder(cardId, taskIndex, undefined);
			},
			() => {
				const snoozed = new Date(Date.now() + 60 * 60 * 1000);
				const pad = (n: number) => String(n).padStart(2, '0');
				const newReminder = `${snoozed.getFullYear()}-${pad(snoozed.getMonth() + 1)}-${pad(snoozed.getDate())} ${pad(snoozed.getHours())}:${pad(snoozed.getMinutes())}`;
				this.firedReminders.delete(`${cardId}-${taskIndex}`);
				void this.sync.editTaskReminder(cardId, taskIndex, newReminder);
			},
		);
		modal.open();
	}
}

function parseQuoteLibraryLine(line: string): { quote: string; author: string } {
	const trimmed = line.trim();
	if (!trimmed) return { quote: '', author: '' };
	const separator = /\s(?:\||—|–|-)\s/;
	const match = trimmed.match(separator);
	if (!match || match.index === undefined) return { quote: trimmed, author: '' };
	return {
		quote: trimmed.slice(0, match.index).trim(),
		author: trimmed.slice(match.index + match[0].length).trim(),
	};
}
