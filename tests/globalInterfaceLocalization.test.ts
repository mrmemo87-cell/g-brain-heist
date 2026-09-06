import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const provider = readFileSync('src/contexts/LanguageContext.tsx', 'utf8');
const layer = readFileSync('src/components/AppLocalizationLayer.tsx', 'utf8');
const translations = readFileSync('src/i18n/interfaceTranslations.ts', 'utf8');
const supplemental = readFileSync('src/i18n/interfaceTranslationSupplement.ts', 'utf8');
const fragments = readFileSync('src/i18n/interfaceTranslationFragments.ts', 'utf8');

const allTranslations = `${translations}\n${supplemental}\n${fragments}`;

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
    'Every assigned class, subject, and student in one organised view.',
    'Print all rosters',
    'Search by class, subject, or student…',
    'Brains Heist Verified',
    'Where school',
    'For schools',
    'For students',
    'Terms of Service',
  ]) {
    assert.ok(allTranslations.includes(`'${phrase}'`) || allTranslations.includes(`^${phrase}`), `missing translation coverage for: ${phrase}`);
  }
});

test('global layer protects English assessment content', () => {
  assert.match(layer, /cambridge-question/);
  assert.match(layer, /ielts-question/);
  assert.match(layer, /setAttribute\('dir', 'ltr'\)/);
});

test('language control is compact and does not occupy the mobile bottom navigation area', () => {
  assert.match(layer, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(layer, /top: '50%'/);
  assert.match(layer, /left: 'max\(10px, env\(safe-area-inset-left\)\)'/);
  assert.doesNotMatch(layer, /bottom: 'max\(14px, env\(safe-area-inset-bottom\)\)'/);
  assert.match(layer, /setOpen\(false\)/);
});

test('split JSX fragments and dynamic allocated-class labels are translated', () => {
  for (const phrase of [
    'Open',
    'to see allocated classes, subjects and students.',
    'when you need a current class list.',
    'feels like a',
    'Guide & Help',
  ]) {
    assert.ok(fragments.includes(`'${phrase}'`), `missing split-fragment translation for: ${phrase}`);
  }
  assert.match(fragments, /Your Allocated Classes/);
  assert.match(layer, /hasFragmentInterfaceTranslation/);
});
