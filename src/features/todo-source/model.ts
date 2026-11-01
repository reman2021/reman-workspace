import type { TodoSourceConfig, TodoSourceOptions } from '../../core/types';

export type SourceState = ' ' | '/' | 'x' | 'X' | '-';
export interface SourceTask {
	path: string;
	line: number;
	offset: number;
	markerOffset: number;
	rawLine: string;
	text: string;
	state: SourceState;
	heading: string;
	indent: number;
}
export interface SourceSnapshot {
	path: string;
	content: string;
	heading: string;
	sectionFound: boolean;
	tasks: SourceTask[];
}

export function defaultTodoSources(): TodoSourceConfig {
	const common = { enabled: false, createCommandId: 'templater-obsidian:create-new-note-from-template' };
	return {
		monthly: { ...common, pathTemplate: 'Plan/{{YYYY}}Month/Plan_{{YYYYMM}}.md', heading: '' },
		daily: { ...common, pathTemplate: 'Diary/Diary_{{YYYY}}/Diary_{{YYYYMM}}/Diary_{{YYYYMMDD}}.md', heading: '今日待办' },
	};
}

export function parseTodoSources(value: unknown): TodoSourceConfig | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const defaults = defaultTodoSources();
	for (const key of ['monthly', 'daily'] as const) {
		const raw: unknown = (value as Record<string, unknown>)[key];
		if (!raw || typeof raw !== 'object') continue;
		const item = raw as Record<string, unknown>;
		const option: TodoSourceOptions = defaults[key];
		option.enabled = item.enabled === true;
		for (const field of ['pathTemplate', 'heading', 'createCommandId'] as const) if (typeof item[field] === 'string') option[field] = item[field];
	}
	return defaults;
}

export function resolveSourcePath(template: string, date = new Date()): string {
	const year = String(date.getFullYear()), month = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0');
	const tokens: Record<string, string> = { YYYY: year, MM: month, DD: day, YYYYMM: year + month, YYYYMMDD: year + month + day };
	const path = template.trim().replace(/\\/g, '/').replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
		if (!Object.prototype.hasOwnProperty.call(tokens, key)) throw new Error('Unsupported date token');
		return tokens[key]!;
	});
	if (!path || path.startsWith('/') || path.includes(':') || /[{}]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid vault-relative path');
	return path.endsWith('.md') ? path : path + '.md';
}

function plainHeading(text: string): string { return text.replace(/[*_`]/g, '').trim(); }

export function readSourceTasks(content: string, path: string, heading = ''): SourceSnapshot {
	const target = plainHeading(heading);
	const snapshot: SourceSnapshot = { path, content, heading, tasks: [], sectionFound: !target };
	let frontmatter = content.startsWith('---\n') || content.startsWith('---\r\n');
	let fence = '', fenceLength = 0, comment = false, scopeDepth = 0;
	const headings: Array<{ level: number; text: string }> = [];
	Array.from(content.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)).forEach((match, lineNumber) => {
		const line = match[0].replace(/[\r\n]+$/, '');
		if (frontmatter) { if (lineNumber > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; return; }
		if (comment) { if (line.includes('-->')) comment = false; return; }
		const boundary = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (boundary) {
			const marker = boundary[1]!;
			if (!fence) { fence = marker[0]!; fenceLength = marker.length; }
			else if (marker[0] === fence && marker.length >= fenceLength && !line.slice(boundary[0].length).trim()) fence = '';
			return;
		}
		if (fence) return;
		if (/^\s*<!--/.test(line)) { comment = !line.includes('-->'); return; }
		const section = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (section) {
			const level = section[1]!.length, title = plainHeading(section[2]!);
			while (headings.length && headings[headings.length - 1]!.level >= level) headings.pop();
			headings.push({ level, text: title });
			if (scopeDepth && level <= scopeDepth) scopeDepth = 0;
			if (target && title === target) { scopeDepth = level; snapshot.sectionFound = true; }
			return;
		}
		if (target && !scopeDepth) return;
		const task = line.match(/^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX/-])(\]\s+)(.*)$/);
		if (!task) return;
		snapshot.tasks.push({ path, line: lineNumber, offset: match.index, markerOffset: match.index + task[1]!.length,
			rawLine: line, text: task[4]!, state: task[2] as SourceState, heading: headings.map(item => item.text).join(' / '),
			indent: (line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length });
	});
	return snapshot;
}

/** Pure single-character patch, suitable for an atomic Vault.process callback. */
export function patchSourceTask(content: string, snapshot: SourceSnapshot, task: SourceTask, checked: boolean): string {
	if (task.state === '-' || !snapshot.tasks.includes(task)) throw new Error('Task is not editable');
	let current = task;
	if (content !== snapshot.content) {
		const same = (candidate: SourceTask) => candidate.rawLine === task.rawLine && candidate.heading === task.heading;
		const candidates = readSourceTasks(content, snapshot.path, snapshot.heading).tasks.filter(same);
		if (snapshot.tasks.filter(same).length !== 1 || candidates.length !== 1) throw new Error('Task changed or cannot be located uniquely');
		current = candidates[0]!;
	}
	if (content.slice(current.offset, current.offset + current.rawLine.length) !== current.rawLine) throw new Error('Task changed');
	return content.slice(0, current.markerOffset) + (checked ? 'x' : ' ') + content.slice(current.markerOffset + 1);
}
