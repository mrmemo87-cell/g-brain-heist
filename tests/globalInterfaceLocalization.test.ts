import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const provider = readFileSync('src/contexts/LanguageContext.tsx', 'utf8');
const layer = readFileSync('src/components/AppLocalizationLayer.tsx', 'utf8');
const translations = readFileSync('src/i18n/interfaceTranslations.ts', 'utf8');

test('global interface language coverage includes public and teacher surfaces', () => {
  assert.match(provider, /AppLocalizationLayer/);
  assert.match(layer, /data-global-language-control="true"/);
  for (const phrase of [
    'Dashboard Overview',
    'Your Allocated Classes',
    'Question Bank & My Pool',
    'Teacher Guide & Help',
    'Geometry Diagrams',
    'All tools',
    'Brains Heist access',
    'Welcome back 👋',
    'Continue with Google',
  ]) {
    assert.ok(translations.includes(`'${phrase}'`) || translations.includes(`^${phrase}`), `missing translation coverage for: ${phrase}`);
  }
});

test('global layer protects English assessment content', () => {
  assert.match(layer, /cambridge-question/);
  assert.match(layer, /ielts-question/);
  assert.match(layer, /setAttribute\('dir', 'ltr'\)/);
});
