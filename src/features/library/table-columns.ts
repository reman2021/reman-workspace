import type { LibraryConfig } from '../../core/types';
import type { LibraryFileResult } from './query';

const RESERVED_TABLE_COLUMNS = new Set(['name', 'position']);

export function normalizeTableColumns(raw: unknown): string[] | undefined {
	if (!Array.isArray(raw)) return undefined;

	const columns: string[] = [];
	const seen = new Set<string>();
	for (const value of raw) {
		if (typeof value !== 'string') continue;
		const column = value.trim();
		if (!column || RESERVED_TABLE_COLUMNS.has(column) || seen.has(column)) continue;
		seen.add(column);
		columns.push(column);
	}
	return columns;
}

export function resolveTableColumns(config: LibraryConfig, results: LibraryFileResult[]): string[] {
	if (config.tableColumns !== undefined) {
		return normalizeTableColumns(config.tableColumns) ?? [];
	}

	// Preserve the legacy automatic-column behavior until the user changes the selection.
	const propKeys = new Set<string>();
	for (const filter of config.filters) {
		if (!RESERVED_TABLE_COLUMNS.has(filter.property) && filter.property !== 'tags' && filter.property !== 'modified' && filter.property !== 'created' && filter.property !== 'path') {
			propKeys.add(filter.property);
		}
	}
	for (const result of results.slice(0, 20)) {
		for (const key of Object.keys(result.frontmatter)) {
			if (RESERVED_TABLE_COLUMNS.has(key)) continue;
			propKeys.add(key);
			if (propKeys.size >= 6) break;
		}
	}
	return ['modified', ...propKeys];
}

export function collectTableColumnCandidates(results: LibraryFileResult[]): string[] {
	const candidates = new Set<string>(['modified']);
	for (const result of results) {
		for (const key of Object.keys(result.frontmatter)) {
			if (!RESERVED_TABLE_COLUMNS.has(key)) candidates.add(key);
		}
	}
	return [...candidates];
}
