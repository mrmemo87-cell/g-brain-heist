import { readLanguage } from '../i18n/language.js';
/**
 * One date style for the whole interface: "17 Nov 2026" in English (not the browser's "11/17/2026"), following the
 * interface language for Arabic and Russian. Latin digits in Arabic, matching the rest of the interface.
 */
export const DISPLAY_DATE = { day: 'numeric', month: 'short', year: 'numeric' };
export function displayDateLocale() {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    const language = readLanguage(storage);
    if (language === 'ar')
        return 'ar-u-nu-latn';
    if (language === 'ru')
        return 'ru-RU';
    return 'en-GB';
}
export const DISPLAY_DATE_TIME = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
export const DISPLAY_TIME = { hour: '2-digit', minute: '2-digit' };
