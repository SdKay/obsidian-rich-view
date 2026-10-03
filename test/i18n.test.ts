import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from 'obsidian';
import { t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { zh } from '../src/i18n/zh';

describe('t', () => {
	beforeEach(() => { setLanguage('en'); });

	it('returns the English string for en', () => {
		expect(t('fullscreen')).toBe(en.fullscreen);
	});

	it('returns the Chinese string for zh and regional variants like zh-TW', () => {
		setLanguage('zh');
		expect(t('fullscreen')).toBe(zh.fullscreen);
		setLanguage('zh-TW');
		expect(t('fullscreen')).toBe(zh.fullscreen);
	});

	it('falls back to English for a language with no dictionary', () => {
		setLanguage('fr');
		expect(t('fullscreen')).toBe(en.fullscreen);
	});

	it('every non-English dictionary only uses keys English defines', () => {
		for (const key of Object.keys(zh)) expect(Object.keys(en)).toContain(key);
	});
});
