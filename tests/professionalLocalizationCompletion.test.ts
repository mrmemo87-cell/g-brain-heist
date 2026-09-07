import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('global localization layer bridges the typed message catalog and completion catalog', () => {
  const layer = read('src/components/AppLocalizationLayer.tsx');
  assert.match(layer, /interfaceTranslationCompletion/);
  assert.match(layer, /hasCompletionInterfaceTranslation/);
  assert.match(layer, /translateCompletionInterfaceText/);
  assert.match(layer, /Object\.hasOwn\(messages, value\)/);
  assert.match(layer, /translateTypedMessage/);
  assert.match(layer, /data-assessment-language="en"/);
});

test('completion catalog covers reported parent, profile, shop, clan, task and leaderboard gaps', () => {
  const source = read('src/i18n/interfaceTranslationCompletion.ts');
  [
    'Quick academic signals',
    'Completed assignment average',
    'Student Academic Profile',
    'Defensive Arsenal',
    'Join a Syndicate',
    'Complete 3 Knowledge Quests',
    'Leaderboards',
    "You're not selected for this program. Ask your school admin if you need it 🔒",
  ].forEach((literal) => assert.ok(source.includes(literal), `missing completion translation: ${literal}`));
});

test('all public policy, pricing, contact and Prime pages load the professional static completion layer', () => {
  for (const file of ['contact.html', 'terms.html', 'privacy.html', 'refund.html', 'pricing.html', 'prime.html']) {
    const source = read(`public/${file}`);
    assert.match(source, /static-localization-completion\.js/);
    assert.match(source, /static-localization\.js/);
  }
});

test('static completion covers full legal and commercial surfaces in Arabic and Russian', () => {
  const source = read('public/static-localization-completion.js');
  [
    'Acceptance of Terms',
    'Accounts & Registration',
    'Children\'s Privacy',
    'Data Storage & Security',
    '14-Day Refund Window',
    'Paddle as Merchant of Record',
    'Build the package your school actually needs.',
    'Test your real numbers.',
    'Unlock Prime',
    'Frequently Asked Questions',
  ].forEach((literal) => assert.ok(source.includes(literal), `missing static translation coverage: ${literal}`));
  assert.match(source, /__BH_STATIC_I18N_PATTERNS__/);
});

test('static localization supports dynamic translations, page metadata and RTL tables', () => {
  const source = read('public/static-localization.js');
  assert.match(source, /__BH_STATIC_I18N_COMPLETION__/);
  assert.match(source, /__BH_STATIC_I18N_PATTERNS__/);
  assert.match(source, /document\.title/);
  assert.match(source, /meta\[name="description"\]/);
  assert.match(source, /th,\.static-localized-rtl td/);
});
