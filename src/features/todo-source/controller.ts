import { App, Component, MarkdownRenderer, Notice, setIcon, TFile } from 'obsidian';
import type { TodoSourceConfig, TodoSourceOptions } from '../../core/types';
import { defaultTodoSources, patchSourceTask, readSourceTasks, resolveSourcePath } from './model';
import type { SourceSnapshot, SourceTask } from './model';
import { getCommands } from '../../utils/internal-api';
import { t } from '../../core/i18n';

type SourceKind = keyof TodoSourceConfig;
interface SourceCard { el: HTMLElement; options: TodoSourceOptions; generation: number; }

/** One component per Todo section; source changes never serialize the dashboard. */
export class TodoSourceController extends Component {
	private cards = new Map<SourceKind, SourceCard>();
	private timer: number | null = null;
	private day = '';
	private disposed = false;
	private renderComponents = new Map<SourceKind, Component>();
	constructor(private app: App, private container: HTMLElement, private config: TodoSourceConfig = defaultTodoSources()) { super(); }
	/** Reuse the live controller during an atomic dashboard rebuild when its source configuration is unchanged. */
	rebind(container: HTMLElement, config: TodoSourceConfig): boolean {
		if (this.disposed || JSON.stringify(this.config) !== JSON.stringify(config)) return false;
		this.container = container;
		for (const kind of ['monthly', 'daily'] as const) {
			const card = this.cards.get(kind);
			if (card) container.appendChild(card.el);
		}
		return true;
	}

	onload(): void {
		for (const kind of ['monthly', 'daily'] as const) {
			if (!this.config[kind].enabled) continue;
			this.cards.set(kind, { el: this.container.createDiv({ cls: 'dashboard-card dashboard-card--task dashboard-source-card' }), options: this.config[kind], generation: 0 });
		}
		const changed = (file: TFile, oldPath?: string) => { if (this.usesPath(file.path) || (oldPath && this.usesPath(oldPath))) this.scheduleRefresh(); };
		const changedFile = (file: import('obsidian').TAbstractFile) => { if (file instanceof TFile) changed(file); };
		this.registerEvent(this.app.vault.on('create', changedFile));
		this.registerEvent(this.app.vault.on('modify', changedFile));
		this.registerEvent(this.app.vault.on('delete', changedFile));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { if (file instanceof TFile) changed(file, oldPath); }));
		this.registerDomEvent(document, 'visibilitychange', () => { if (!document.hidden) void this.refresh(); });
		this.registerDomEvent(window, 'focus', () => { void this.refresh(); });
		this.registerInterval(window.setInterval(() => {
			const key = this.dateKey(); if (key !== this.day) void this.refresh();
		}, 60_000));
		void this.refresh();
	}

	onunload(): void {
		this.disposed = true;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.cards.forEach(card => { card.generation++; });
		this.renderComponents.forEach(component => this.removeChild(component));
		this.renderComponents.clear();
	}
	private dateKey(): string { const now = new Date(); return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`; }
	usesPath(path: string): boolean {
		return [...this.cards.values()].some(card => { try { return resolveSourcePath(card.options.pathTemplate) === path; } catch { return false; } });
	}
	private scheduleRefresh(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => { this.timer = null; void this.refresh(); }, 100);
	}
	async refresh(): Promise<void> {
		if (this.disposed) return;
		this.day = this.dateKey();
		await Promise.all([...this.cards].map(([kind, card]) => this.renderCard(kind, card)));
	}
	private openFile(file: TFile, line?: number): void {
		void this.app.workspace.getLeaf(false).openFile(file, line === undefined ? undefined : { eState: { line } });
	}
	private async renderCard(kind: SourceKind, card: SourceCard): Promise<void> {
		const generation = ++card.generation;
		const previous = this.renderComponents.get(kind); if (previous) this.removeChild(previous);
		const component = this.addChild(new Component()); this.renderComponents.set(kind, component);
		const el = card.el; el.empty(); el.dataset.sourceKind = kind;
		const header = el.createDiv({ cls: 'dashboard-card-header dashboard-source-header' });
		header.createEl('h4', { cls: 'dashboard-card-title', text: t(`source.${kind}`) });
		const refresh = header.createEl('button', { cls: 'dashboard-source-refresh', attr: { 'aria-label': t('source.refresh') } });
		setIcon(refresh, 'refresh-cw'); refresh.addEventListener('click', () => { void this.renderCard(kind, card); });
		const cardBody = el.createDiv({ cls: 'dashboard-card-body' });
		let path: string;
		try { path = resolveSourcePath(card.options.pathTemplate); }
		catch { cardBody.createDiv({ text: t('source.invalidPath'), cls: 'dashboard-source-empty' }); return; }
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			cardBody.createDiv({ cls: 'dashboard-source-empty', text: t('source.missing', { name: t(`source.${kind}`) }) });
			cardBody.createEl('code', { cls: 'dashboard-source-path', text: path });
			const registry = getCommands(this.app), commandId = card.options.createCommandId;
			const available = Boolean(commandId && registry?.commands[commandId]);
			const create = cardBody.createEl('button', { text: t('source.create') }); create.disabled = !available;
			if (!available) cardBody.createDiv({ cls: 'dashboard-source-empty', text: t('source.commandUnavailable') });
			create.addEventListener('click', () => {
				try {
					if (!getCommands(this.app)?.executeCommandById(commandId)) new Notice(t('source.commandUnavailable'));
				} catch (error) { console.error('Todo source creation command failed', error); new Notice(t('source.commandUnavailable')); }
			});
			return;
		}
		const sourceLink = cardBody.createEl('a', { cls: 'internal-link dashboard-source-path', text: `[[${file.basename}]]`, href: path });
		sourceLink.addEventListener('click', event => { event.preventDefault(); this.openFile(file); });
		const body = cardBody.createDiv({ cls: 'dashboard-task-list dashboard-source-body' }); body.setText(t('source.loading'));
		try {
			const content = await this.app.vault.read(file);
			if (this.disposed || generation !== card.generation) return;
			const snapshot = readSourceTasks(content, path, card.options.heading);
			body.empty();
			const rank = (task: SourceTask) => task.state === 'x' || task.state === 'X' ? 2 : task.state === '-' ? 1 : 0;
			const tasks = [...snapshot.tasks].sort((left, right) => rank(left) - rank(right));
			if (!tasks.length) {
				const key = !snapshot.sectionFound ? 'source.headingMissing' : 'source.noTasks';
				body.createDiv({ cls: 'dashboard-source-empty', text: t(key) }); return;
			}
			const active = tasks.filter(task => task.state !== '-');
			if (active.length) {
				const percent = Math.round(active.filter(task => task.state === 'x' || task.state === 'X').length / active.length * 100);
				const progress = cardBody.createDiv({ cls: 'dashboard-progress' });
				progress.createDiv({ cls: 'dashboard-progress-bar' }).createDiv({ cls: 'dashboard-progress-fill', attr: { style: `width: ${percent}%` } });
				progress.createSpan({ cls: 'dashboard-progress-text', text: `${percent}%` });
			}
			let heading: string | undefined;
			for (const task of tasks) {
				if (task.heading !== heading) { heading = task.heading; if (heading) body.createDiv({ cls: 'dashboard-source-heading', text: heading }); }
				await this.renderTask(body, file, snapshot, task, component, () => this.renderCard(kind, card));
				if (this.disposed || generation !== card.generation) return;
			}
		} catch (error) {
			if (this.disposed || generation !== card.generation) return;
			body.empty(); body.createDiv({ cls: 'dashboard-source-empty', text: t('source.readFailed') }); console.error('Todo source read failed', error);
		}
	}
	private async renderTask(body: HTMLElement, file: TFile, snapshot: SourceSnapshot, task: SourceTask, component: Component, refresh: () => Promise<void>): Promise<void> {
		const row = body.createDiv({ cls: 'dashboard-task-item dashboard-source-task', attr: { 'data-state': task.state, 'data-line': String(task.line) } });
		row.style.setProperty('--source-indent', `${Math.min(task.indent * 4, 48)}px`);
		const checkbox = row.createEl('input', { cls: 'dashboard-task-checkbox', type: 'checkbox', attr: { 'aria-label': task.text } });
		checkbox.checked = task.state === 'x' || task.state === 'X'; checkbox.indeterminate = task.state === '/'; checkbox.disabled = task.state === '-';
		checkbox.addEventListener('change', () => {
			const checked = checkbox.checked;
			checkbox.checked = task.state === 'x' || task.state === 'X'; checkbox.indeterminate = task.state === '/';
			checkbox.disabled = true;
			void this.app.vault.process(file, content => {
				if (file.path !== snapshot.path) throw new Error('Source file moved');
				return patchSourceTask(content, snapshot, task, checked);
			}).catch((error: unknown) => { console.error('Todo source sync failed', error); new Notice(t('source.writeFailed')); }).finally(() => { if (!this.disposed) void refresh(); });
		});
		const text = row.createDiv({ cls: 'dashboard-task-text dashboard-source-task-text' + (task.state === 'x' || task.state === 'X' || task.state === '-' ? ' dashboard-task-text--done' : '') });
		await MarkdownRenderer.render(this.app, task.text, text, snapshot.path, component);
		if (task.state === '/') row.createSpan({ cls: 'dashboard-source-status', text: t('source.inProgress') });
		if (task.state === '-') row.createSpan({ cls: 'dashboard-source-status', text: t('source.cancelled') });
		const locate = row.createEl('button', { cls: 'dashboard-source-locate', attr: { 'aria-label': t('source.locate') } });
		setIcon(locate, 'arrow-up-right'); locate.addEventListener('click', () => this.openFile(file, task.line));
	}
}
