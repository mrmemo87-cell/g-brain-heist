import assert from 'node:assert/strict';
import test from 'node:test';
import { isLanguage, readLanguage, saveLanguage, translate, LANGUAGE_STORAGE_KEY } from '../src/i18n/language';
import { messages, type MessageKey } from '../src/i18n/messages';

test('language preference validates stored data and tolerates blocked storage', () => {
  for (const value of ['ar', 'ru', 'en']) {
    assert.equal(readLanguage({ getItem: () => value }), value);
  }
  for (const value of ['xx', 'constructor', '__proto__', '', null]) {
    assert.equal(readLanguage({ getItem: () => value }), 'en');
    assert.equal(isLanguage(value), false);
  }
  assert.equal(readLanguage({ getItem: () => { throw new Error('blocked'); } }), 'en');
  assert.doesNotThrow(() => saveLanguage('ar', { setItem: () => { throw new Error('blocked'); } }));
  let saved: [string, string] | undefined;
  saveLanguage('ru', { setItem: (key, value) => { saved = [key, value]; } });
  assert.deepEqual(saved, [LANGUAGE_STORAGE_KEY, 'ru']);
});

test('every UI translation preserves message placeholders and has both languages', () => {
  const tokens = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, translations] of Object.entries(messages)) {
    for (const language of ['ar', 'ru'] as const) {
      assert.ok(translations[language].trim(), `${key}: ${language} is empty`);
      assert.deepEqual(tokens(translations[language]), tokens(key), `${key}: ${language} placeholders`);
    }
  }
});

test('English fallback and interpolation preserve arbitrary names verbatim', () => {
  assert.equal(translate('en', 'Settings'), 'Settings');
  assert.equal(translate('ar', 'Settings'), 'الإعدادات');
  assert.equal(translate('ru', 'Settings'), 'Настройки');
  assert.equal(translate('ru', 'Missing message' as MessageKey), 'Missing message');
  const name = '<b>Cambridge</b> {count} $&';
  assert.equal(translate('en', 'Go to {name} dashboard', { name }), `Go to ${name} dashboard`);
  assert.equal(translate('ar', 'Days: {count}', { count: 0 }), 'عدد الأيام: 0');
});
