import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boundary = readFileSync('src/components/PortalLocalizationBoundary.tsx', 'utf8');
const files = [
  ['Teacher', 'components/TeacherPortalShell.tsx'],
  ['School Admin', 'components/SchoolAdminPortal.tsx'],
  ['Admin', 'components/AdminPortal.tsx'],
  ['School Head', 'components/SchoolHeadPortal.tsx'],
  ['Parent', 'components/guardian/ParentPortal.tsx'],
] as const;

test('all non-student portals use the shared persisted language boundary', () => {
  for (const [name, path] of files) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /withPortalLocalization/ , `${name} portal is missing localization boundary`);
  }
  assert.match(boundary, /useLanguage\(\)/);
  assert.match(boundary, /\['en', 'ar', 'ru'\]/);
  assert.match(boundary, /data-portal-language=\{language\}/);
});

test('staff localization preserves English assessment surfaces', () => {
  assert.match(boundary, /cambridge-question/i);
  assert.match(boundary, /ielts-question/i);
  assert.match(boundary, /\[lang="en"\]/);
});

test('staff portal translation is exact-literal only and leaves unknown dynamic content untouched', () => {
  assert.match(boundary, /STAFF_MESSAGES\[source\]/);
  assert.match(boundary, /\|\| source/);
  assert.doesNotMatch(boundary, /innerHTML\s*=/);
});
