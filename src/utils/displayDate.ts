import { readLanguage } from '../i18n/language';

/**
 * One date style for the whole interface: "17 Nov 2026" in English (not the browser's "11/17/2026"), following the
 * interface language for Arabic and Russian. Latin digits in Arabic, matching the rest of the interface.
 */
export const DISPLAY_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function displayDateLocale(): string {
  const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
  const language = readLanguage(storage);
  if (language === 'ar') return 'ar-u-nu-latn';
  if (language === 'ru') return 'ru-RU';
  return 'en-GB';
}
