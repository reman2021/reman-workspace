import { parseTodoSources } from '../../features/todo-source/model';
import { formatValue } from '../../utils/value';
import type {
	BannerData,
	CardType,
	CardSize,
	DashboardCard,
	DashboardColumn,
	DashboardData,
	QuickAction,
	TaskItem,
	WeatherConfig,
	TrackerConfig,
	LibraryConfig,
} from '../../core/types';
import { parse as parseYaml } from 'yaml';

const KNOWN_METADATA_KEYS = new Set(['id', 'link', 'progress', 'due', 'streak', 'type', 'color', 'cover', 'archived', 'archivedAt', 'width', 'size', 'lat', 'lon', 'city', 'track', 'days', 'cols', 'rows', 'gcol', 'grow', 'style']);

const REMINDER_REGEX = /\s*⏰\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*$/;

const DEFAULT_BANNER: BannerData = {
	quote: 'The mind is everything. What you think you become.',
	author: 'Buddha',
	image: '',
};

const DEFAULT_COLUMNS = [
	{ name: 'Memo', color: '#f59e0b', sectionType: 'memo' },
	{ name: 'Todo', color: '#6366f1', sectionType: 'todo' },
	{ name: 'Projects', color: '#10b981', sectionType: 'projects' },
	{ name: 'Library', color: '#8b5cf6', sectionType: 'projects' },
];

export function parse(markdown: string): DashboardData {
	const { frontmatter, body } = splitFrontmatter(markdown);
	const banner = parseBanner(frontmatter);
	const quickActions = parseQuickActions(frontmatter);
	const quickActionOrder = parseQuickActionOrder(frontmatter);
	const columnDefs = parseColumnDefs(frontmatter);
	const columns = parseColumns(body, columnDefs);

	const data: DashboardData = { banner, quickActions, columns };
	if (quickActionOrder) data.quickActionOrder = quickActionOrder;
	const hiddenPresets = parseHiddenPresets(frontmatter);
	if (hiddenPresets) data.hiddenPresets = hiddenPresets;
	return data;
}

function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
	const trimmed = markdown.trimStart();
	if (!trimmed.startsWith('---')) {
		return { frontmatter: {}, body: trimmed };
	}

	const end = trimmed.indexOf('---', 3);
	if (end === -1) {
		return { frontmatter: {}, body: trimmed };
	}

	const yaml = trimmed.slice(3, end).trim();
	const body = trimmed.slice(end + 3).trim();

	return { frontmatter: (parseYaml(yaml) ?? {}) as Record<string, unknown>, body };
}

function parseBanner(fm: Record<string, unknown>): BannerData {
	const raw = fm.banner as Record<string, unknown> | undefined;
	if (!raw) return { ...DEFAULT_BANNER };

	const quotesRaw = raw.quotes;
	let quotes: Array<{ quote: string; author: string }> | undefined;
	if (Array.isArray(quotesRaw)) {
		quotes = quotesRaw.map((item: Record<string, string>) => ({
			quote: item.quote ?? '',
			author: item.author ?? '',
		}));
	}

	const imagesRaw = raw.images;
	let images: string[] | undefined;
	if (Array.isArray(imagesRaw)) {
		images = (imagesRaw as unknown[]).map((item: unknown) => formatValue(item)).filter((s: string) => s.trim());
	}

	return {
		quote: (raw.quote as string) ?? DEFAULT_BANNER.quote,
		author: (raw.author as string) ?? DEFAULT_BANNER.author,
		image: (raw.image as string) ?? '',
		quoteColor: (raw.quoteColor as string) || undefined,
		quoteLibraryPath: (raw.quoteLibraryPath as string) || undefined,
		quotes,
		images,
	};
}

function parseQuickActions(fm: Record<string, unknown>): QuickAction[] {
	const rawActions = fm.quickActions;
	if (Array.isArray(rawActions)) {
		return rawActions.map<QuickAction>((item: Record<string, string>) => ({
			name: item.name ?? '',
			icon: item.icon ?? (item.type === 'command' ? 'terminal' : 'file-text'),
			type: (item.type === 'command' ? 'command' : 'file'),
			target: item.target ?? '',
		})).filter(a => a.name && a.target);
	}

	// Backward compat: migrate old quickLinks
	const rawLinks = fm.quickLinks;
	if (Array.isArray(rawLinks)) {
		return rawLinks.map((item: Record<string, string>) => ({
			name: item.name ?? '',
			icon: 'file-text',
			type: 'file' as const,
			target: item.path ?? '',
		})).filter(a => a.name && a.target);
	}

	return [];
}

function parseQuickActionOrder(fm: Record<string, unknown>): string[] | undefined {
	const raw = fm.quickActionOrder;
	if (Array.isArray(raw) && raw.length > 0) {
		return raw.map((v: unknown) => formatValue(v));
	}
	return undefined;
}

function parseHiddenPresets(fm: Record<string, unknown>): string[] | undefined {
	const raw = fm.hiddenPresets;
	if (Array.isArray(raw) && raw.length > 0) {
		return raw.map((v: unknown) => formatValue(v));
	}
	return undefined;
}

function parseColumnDefs(fm: Record<string, unknown>): Array<{ name: string; color: string; sectionType?: string; libraryConfig?: LibraryConfig; heatmapItems?: import('../../core/types').HeatmapItem[]; heatmapLayout?: 'column' | 'row'; todoSources?: import('../../core/types').TodoSourceConfig }> {
	const raw = fm.columns;
	if (!Array.isArray(raw)) return DEFAULT_COLUMNS;

	return (raw as Array<Record<string, unknown>>).map(item => ({
			name: formatValue(item.name ?? 'Unnamed'),
			color: formatValue(item.color ?? '#6366f1'),
			sectionType: item.type ? normalizeSectionType(formatValue(item.type)) : undefined,
		todoSources: parseTodoSources(item.todoSources),
		libraryConfig: item.library ? parseLibraryConfig(item.library as Record<string, unknown>) : undefined,
		heatmapItems: item.heatmapItems ? parseHeatmapItems(item.heatmapItems as Array<Record<string, unknown>>) : undefined,
		heatmapLayout: item.heatmapLayout === 'row' ? 'row' : 'column',
	}));
}

function parseHeatmapItems(raw: Array<Record<string, unknown>>): import('../../core/types').HeatmapItem[] {
	return raw.map(item => ({
		id: formatValue(item.id ?? ''),
		key: formatValue(item.key ?? ''),
		label: formatValue(item.label ?? item.key ?? ''),
		days: typeof item.days === 'number' ? item.days : 30,
		color: item.color ? formatValue(item.color) : undefined,
	})).filter(item => item.id && item.key);
}

function parseColumns(body: string, defs: Array<{ name: string; color: string; sectionType?: string; libraryConfig?: LibraryConfig; heatmapItems?: import('../../core/types').HeatmapItem[]; heatmapLayout?: 'column' | 'row'; todoSources?: import('../../core/types').TodoSourceConfig }>): DashboardColumn[] {
	const sections = splitByH2(body);
	const defMap = new Map(defs.map(d => [d.name, d]));
	const usedDefIndices = new Set<number>();

	return sections.map((section, sectionIdx) => {
		let def = defMap.get(section.heading);
		if (!def && sectionIdx < defs.length && !usedDefIndices.has(sectionIdx)) {
			def = defs[sectionIdx];
		}
		if (def) {
			const defIdx = defs.indexOf(def);
			usedDefIndices.add(defIdx);
		}
		const cards = parseCards(section.content, section.heading);
		return {
			name: section.heading,
			color: def?.color ?? '#6366f1',
			sectionType: resolveSectionType(section.heading, cards, def?.sectionType),
			cards,
			libraryConfig: def?.libraryConfig,
			todoSources: def?.todoSources,
			heatmapItems: def?.heatmapItems,
			heatmapLayout: def?.heatmapLayout,
		};
	});
}

function resolveSectionType(
	name: string,
	cards: DashboardCard[],
	fallback?: string,
): string {
	if (fallback) return normalizeSectionType(fallback);

	const lower = name.toLowerCase();
	if (lower === 'memo') return 'memo';
	if (lower === 'todo') return 'todo';
	if (lower === 'projects') return 'projects';
	if (lower === 'notes') return 'projects';
	if (lower === 'dashboard') return 'dashboard';
	if (lower === 'library') return 'library';

	if (cards.length > 0) {
		const types = new Set(cards.map(c => c.type));
		const dashboardTypes = new Set(['weather', 'tracker']);
		if ([...types].every(t => dashboardTypes.has(t)) && types.size > 0) return 'dashboard';
		if (types.has('task') && types.size === 1) return 'todo';
		if (types.has('task') && !types.has('project')) return 'todo';
		if (types.has('project') && types.size === 1) return 'projects';
		if (types.has('generic') && !types.has('project') && !types.has('task')) return 'memo';
	}

	return 'projects';
}

function normalizeSectionType(sectionType: string): string {
	return sectionType === 'notes' ? 'projects' : sectionType;
}

function parseLibraryConfig(raw: Record<string, unknown>): LibraryConfig {
	const filters: import('../../core/types').PropertyFilter[] = [];
	const rawFilters = raw.filters;
	if (Array.isArray(rawFilters)) {
		for (const item of rawFilters) {
			const rec = item as Record<string, unknown>;
			const property = formatValue(rec.property ?? '');
			const rawValues = rec.values;
			const values = Array.isArray(rawValues) ? rawValues.map((v: unknown) => formatValue(v)) : [];
			const dateStart = rec.dateStart ? formatValue(rec.dateStart) : '';
			const dateEnd = rec.dateEnd ? formatValue(rec.dateEnd) : '';
			const dateRange = (dateStart || dateEnd) ? { start: dateStart, end: dateEnd } : undefined;
			filters.push({ property, values, dateRange });
		}
	}

	return {
		filters,
		viewMode: (['grid', 'list', 'table', 'kanban'].includes(formatValue(raw.viewMode ?? '')) ? raw.viewMode : 'grid') as import('../../core/types').LibraryViewMode,
		sortBy: formatValue(raw.sortBy ?? 'modified'),
		sortDesc: raw.sortDesc !== false,
		kanbanGroupBy: raw.kanbanGroupBy ? formatValue(raw.kanbanGroupBy) : undefined,
		pageSize: typeof raw.pageSize === 'number' ? raw.pageSize : undefined,
			quickDateFilter: raw.quickDateFilter && typeof raw.quickDateFilter === 'object' ? {
				property: (raw.quickDateFilter as Record<string, unknown>).property === 'modified' ? 'modified' as const : 'created' as const,
				start: formatValue((raw.quickDateFilter as Record<string, unknown>).start ?? ''),
				end: formatValue((raw.quickDateFilter as Record<string, unknown>).end ?? ''),
			} : undefined,
		};
	}
function splitByH2(body: string): Array<{ heading: string; content: string }> {
	const lines = body.split('\n');
	const sections: Array<{ heading: string; content: string }> = [];
	let current: { heading: string; lines: string[] } | null = null;

	for (const line of lines) {
		if (line.startsWith('## ')) {
			if (current) {
				sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
			}
			current = { heading: line.slice(3).trim(), lines: [] };
		} else if (current) {
			current.lines.push(line);
		}
	}

	if (current) {
		sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
	}

	return sections;
}

function parseCards(content: string, columnName: string): DashboardCard[] {
	const blocks = splitByH3(content);
	return blocks.map(block => parseCard(block, columnName));
}

function splitByH3(content: string): Array<{ title: string; body: string; rawMarkdown: string }> {
	const headings = Array.from(content.matchAll(/^### (.+)\r?$/gm));
	return headings.map((heading, index) => {
		const rawMarkdown = content.slice(heading.index, headings[index + 1]?.index ?? content.length).trimEnd();
		return { title: heading[1]!.trim(), body: rawMarkdown.slice(heading[0].length).trim(), rawMarkdown };
	});
}

function parseCard(block: { title: string; body: string; rawMarkdown: string }, columnName: string): DashboardCard {
	const { metadata, tasks, blockquote, cleanBody } = extractCardParts(block.body);
	const cardType = detectCardType(tasks, blockquote, metadata);
	const weatherConfig = cardType === 'weather' ? parseWeatherConfig(metadata) : undefined;
	const trackerConfig = cardType === 'tracker' ? parseTrackerConfig(metadata) : undefined;

	return {
		id: metadata.id ?? generateId(block.title, columnName),
		title: block.title,
		type: cardType,
		column: columnName,
		body: cleanBody,
		tasks,
		url: extractUrl(metadata),
		wikiLink: extractWikiLink(metadata),
		progress: extractProgress(metadata),
		streak: extractStreak(metadata),
		dueDate: extractDue(metadata),
		blockquote,
		color: metadata.color ?? '',
		coverImage: metadata.cover ?? '',
		archived: isTruthy(metadata.archived),
		archivedAt: metadata.archivedAt ?? '',
		width: parseInt(metadata.width ?? '0', 10) || 0,
			size: parseCardSize(metadata.size),
		gridCols: parseInt(metadata.cols ?? '0', 10) || 0,
		gridRows: parseInt(metadata.rows ?? '0', 10) || 0,
		gridCol: parseInt(metadata.gcol ?? '0', 10) || 0,
		gridRow: parseInt(metadata.grow ?? '0', 10) || 0,
		legacyMarkdown: cardType === 'weather' ? block.rawMarkdown : undefined,
			weatherConfig,
			trackerConfig,
	};
}

function extractCardParts(body: string): {
	metadata: Record<string, string>;
	tasks: TaskItem[];
	blockquote: string;
	cleanBody: string;
} {
	const lines = body.split('\n');
	const metadata: Record<string, string> = {};
	const tasks: TaskItem[] = [];
	const bodyLines: string[] = [];
	let blockquote = '';

	for (const line of lines) {
		const trimmed = line.trim();

		const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
		if (kvMatch && kvMatch[1] && kvMatch[2] && KNOWN_METADATA_KEYS.has(kvMatch[1])) {
			metadata[kvMatch[1]] = kvMatch[2];
			continue;
		}

		const taskMatch = trimmed.match(/^- \[([ xX])\]\s*(.+)$/);
		if (taskMatch && taskMatch[1] && taskMatch[2]) {
			let taskText = taskMatch[2];
			let taskReminder: string | undefined;
			const reminderMatch = taskText.match(REMINDER_REGEX);
			if (reminderMatch) {
				taskText = taskText.replace(REMINDER_REGEX, '');
				taskReminder = reminderMatch[1];
			}
			tasks.push({ checked: taskMatch[1] !== ' ', text: taskText, reminder: taskReminder });
			continue;
		}

		if (trimmed.startsWith('> ')) {
			blockquote += (blockquote ? '\n' : '') + trimmed.slice(2);
			continue;
		}

		if (trimmed) {
			bodyLines.push(trimmed);
		}
	}

	return { metadata, tasks, blockquote, cleanBody: bodyLines.join('\n') };
}

function detectCardType(
	tasks: TaskItem[],
	blockquote: string,
	metadata: Record<string, string>,
): CardType {
	if (metadata.type === 'task') return 'task';
	if (metadata.type === 'project') return 'project';
	if (metadata.type === 'weather') return 'weather';
	if (metadata.type === 'tracker') return 'tracker';

	const link = metadata.link ?? '';

	if (tasks.length > 0) return 'task';
	if (blockquote) return 'note';
	if (metadata.streak) return 'habit';
	if (link.startsWith('[[')) return 'project';
	if (link.startsWith('http')) return 'link';
	if (metadata.progress) return 'project';
	return 'generic';
}

function parseCardSize(raw: string | undefined): CardSize {
	const v = (raw ?? '').toUpperCase().trim();
	if (v === 'S' || v === 'L') return v;
	return 'M';
}

function extractUrl(metadata: Record<string, string>): string {
	const link = metadata.link ?? '';
	return link.startsWith('http') ? link : '';
}

function extractWikiLink(metadata: Record<string, string>): string {
	const link = metadata.link ?? '';
	const match = link.match(/^\[\[(.+)]]$/);
	return match && match[1] ? match[1] : '';
}

function extractProgress(metadata: Record<string, string>): number {
	if (!metadata.progress) return -1;
	const num = parseInt(metadata.progress.replace('%', ''), 10);
	return isNaN(num) ? -1 : Math.min(100, Math.max(0, num));
}

function extractStreak(metadata: Record<string, string>): number {
	if (!metadata.streak) return 0;
	const num = parseInt(metadata.streak, 10);
	return isNaN(num) ? 0 : num;
}

function extractDue(metadata: Record<string, string>): string {
	return metadata.due ?? '';
}

function isTruthy(raw: string | undefined): boolean {
	if (!raw) return false;
	return ['true', 'yes', '1', 'y'].includes(raw.trim().toLowerCase());
}

function generateId(title: string, column: string): string {
	const raw = `${title}::${column}`;
	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw.charCodeAt(i);
		hash = ((hash << 5) - hash) + ch;
		hash |= 0;
	}
	return `card-${Math.abs(hash).toString(36)}`;
}


function dequote(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
	}
	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}

function parseWeatherConfig(metadata: Record<string, string>): WeatherConfig {
	return {
		latitude: parseFloat(metadata.lat ?? '0') || 0,
		longitude: parseFloat(metadata.lon ?? '0') || 0,
		cityName: dequote(metadata.city ?? ''),
	};
}

function parseTrackerConfig(metadata: Record<string, string>): TrackerConfig {
	const style = metadata.style ?? 'line';
	return {
		key: metadata.track ?? '',
		days: parseInt(metadata.days ?? '14', 10) || 14,
		style: style === 'heatmap' || style === 'bar' ? style : 'line',
	};
}
