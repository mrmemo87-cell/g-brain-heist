import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const provider = readFileSync('src/contexts/LanguageContext.tsx', 'utf8');
const layer = readFileSync('src/components/AppLocalizationLayer.tsx', 'utf8');
const boundary = readFileSync('src/components/PortalLocalizationBoundary.tsx', 'utf8');
const files = [
  ['Teacher', 'components/TeacherPortalShell.tsx'],
  ['School Admin', 'components/SchoolAdminPortal.tsx'],
  ['Admin', 'components/AdminPortal.tsx'],
  ['School Head', 'components/SchoolHeadPortal.tsx'],
  ['Parent', 'components/guardian/ParentPortal.tsx'],
] as const;

test('one persisted language layer covers public and portal routes', () => {
  assert.match(provider, /AppLocalizationLayer/);
  assert.match(layer, /data-global-language-control="true"/);
  assert.match(layer, /\['en', 'ar', 'ru'\]/);
  for (const [name, path] of files) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /withPortalLocalization/, `${name} portal compatibility wrapper is missing`);
  }
});

test('legacy portal wrappers do not create duplicate translators or switchers', () => {
  assert.doesNotMatch(boundary, /MutationObserver/);
  assert.doesNotMatch(boundary, /staff-language-control/);
  assert.match(boundary, /Compatibility wrapper/);
});

test('assessment content retains explicit English protection', () => {
  assert.match(layer, /data-language-lock/);
  assert.match(layer, /cambridge-question/);
  assert.match(layer, /ielts-question/);
  assert.match(layer, /setAttribute\('dir', 'ltr'\)/);
});
