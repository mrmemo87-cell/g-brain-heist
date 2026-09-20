import { messages } from './messages.js';
export const LANGUAGE_STORAGE_KEY = 'brains-heist:ui-language:v1';
export const languages = {
    en: { name: 'English', direction: 'ltr' },
    ar: { name: 'العربية', direction: 'rtl' },
    ru: { name: 'Русский', direction: 'ltr' },
};
export function isLanguage(value) {
    return typeof value === 'string' && Object.hasOwn(languages, value);
}
export function readLanguage(storage) {
    try {
        const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
        return isLanguage(saved) ? saved : 'en';
    }
    catch {
        return 'en';
    }
}
export function saveLanguage(language, storage) {
    try {
        storage?.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    catch { /* In-memory switching still works. */ }
}
export function translate(language, key, params = {}) {
    // English message IDs are also the fallback; unknown runtime IDs never become blank UI.
    const entry = Object.hasOwn(messages, key) ? messages[key] : undefined;
    const template = language === 'en' ? key : entry?.[language] || key;
    return template.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(params, name) ? String(params[name]) : token);
}
