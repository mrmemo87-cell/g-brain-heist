import { messages, type MessageKey } from './messages';

export const LANGUAGE_STORAGE_KEY = 'brains-heist:ui-language:v1';
export const languages = {
  en: { name: 'English', direction: 'ltr' },
  ar: { name: 'العربية', direction: 'rtl' },
  ru: { name: 'Русский', direction: 'ltr' },
} as const;
export type Language = keyof typeof languages;
export type MessageParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(languages, value);
}

export function readLanguage(storage?: Pick<Storage, 'getItem'>): Language {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

export function saveLanguage(language: Language, storage?: Pick<Storage, 'setItem'>): void {
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* In-memory switching still works. */ }
}

export function translate(language: Language, key: MessageKey, params: MessageParams = {}): string {
  // English message IDs are also the fallback; unknown runtime IDs never become blank UI.
  const entry = Object.hasOwn(messages, key) ? messages[key] : undefined;
  const template = language === 'en' ? key : entry?.[language] || key;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : token);
}
