import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const questionBankStyles = readFileSync('components/teacher/QuestionBank.css', 'utf8');
const schoolDocument = readFileSync('src/lib/schoolDocument.ts', 'utf8');

test('question bank topic modal owns its action styling and responsive hierarchy', () => {
  assert.match(
    questionBankStyles,
    /\.qb-modal__header-actions>button\{[^}]*border:1px solid #cbd5e1;[^}]*background:#fff;[^}]*color:#334155;[^}]*font-weight:800;/s,
  );
  assert.match(
    questionBankStyles,
    /\.qb-modal__assign\{[^}]*background:linear-gradient\(135deg,#2563eb,#4f46e5\)!important;[^}]*color:#fff!important;/s,
  );
  assert.match(
    questionBankStyles,
    /@media\(max-width:720px\)\{[\s\S]*?\.qb-modal__header-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/,
  );
  assert.match(
    questionBankStyles,
    /\.qb-modal__close\{[^}]*background:#fff!important;[^}]*color:#475569!important;/s,
  );
});

test('school document printing reserves a page-safe band for repeated header and footer', () => {
  assert.match(schoolDocument, /margin:32mm 15mm 22mm/);
  assert.match(
    schoolDocument,
    /@media print\{[\s\S]*?\.school-document\{[^}]*padding:0!important[^}]*\}/,
  );
  assert.match(
    schoolDocument,
    /\.school-document__repeating-header\{position:fixed;top:-20mm;right:0;left:0;height:15mm;[^}]*background:#fff;z-index:2\}/,
  );
  assert.match(
    schoolDocument,
    /\.school-document__page-footer\{position:fixed;right:0;bottom:-12mm;left:0;min-height:7mm;[^}]*background:#fff;z-index:2\}/,
  );
  assert.match(
    schoolDocument,
    /\.document-card\{[^}]*break-inside:avoid-page;page-break-inside:avoid\}/,
  );
  assert.doesNotMatch(schoolDocument, /padding:23mm 0 18mm!important/);
});
