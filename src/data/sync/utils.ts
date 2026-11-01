export function simpleHash(value: string): string {
	let hash = 0;
	for (let index = 0; index < value.length; index++) {
		const char = value.charCodeAt(index);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return hash.toString(36);
}

export function getDateStamp(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
