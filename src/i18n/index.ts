import { getLanguage } from 'obsidian';
import { en, type Dictionary, type StringKey } from './en';
import { zh } from './zh';

/**
 * Language code (the part of Obsidian's UI locale before any "-") → dictionary.
 * To add a language: create `<code>.ts` exporting a `Dictionary`, register it here.
 * Keys a language omits fall back to English.
 */
const DICTIONARIES: Readonly<Record<string, Dictionary>> = { en, zh };

function baseLanguage(locale: string): string {
	return locale.split('-')[0]?.toLowerCase() ?? 'en';
}

export function t(key: StringKey): string {
	const dictionary = DICTIONARIES[baseLanguage(getLanguage())];
	return dictionary?.[key] ?? en[key];
}

export type { StringKey };
