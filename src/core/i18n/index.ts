import { en } from './en';
import { zh } from './zh';

export type Language = 'en' | 'zh';

let currentLang: Language = 'en';

export function setLanguage(lang: Language): void {
	currentLang = lang;
}

export function getLanguage(): Language {
	return currentLang;
}

const translations: Record<Language, Record<string, string>> = { en, zh };

export function t(key: string, params?: Record<string, string | number>): string {
	let str = translations[currentLang][key] ?? translations.en[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			str = str.replace(`{${k}}`, String(v));
		}
	}
	return str;
}
