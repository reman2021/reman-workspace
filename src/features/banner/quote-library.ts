export interface ParsedQuote {
	quote: string;
	author: string;
}

export function parseQuoteLibraryLine(line: string): ParsedQuote {
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
