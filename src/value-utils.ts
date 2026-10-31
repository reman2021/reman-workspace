/** Frontmatter may contain arrays/objects; aaccidental [object Object] labels. */
export function formatValue(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'object') return JSON.stringify(value);
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'symbol') return String(value);
	return '';
}
