import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const questionBankStyles = readFileSync('components/teacher/QuestionBank.css', 'utf8');
const schoolDocument = readFileSync('src/lib/schoolDocument.ts', 'utf8');

test('question bank topic modal owns its action styling and responsive hierarchy', () => {
  const actionButtonRule = questionBankStyles.match(/\.qb-modal__header-actions>button\{([^}]*)\}/s)?.[1] ?? '';
  assert.ok(actionButtonRule, 'expected the topic modal action button rule');
  assert.match(actionButtonRule, /border:1px solid #cbd5e1/);
  assert.match(actionButtonRule, /background:#fff/);
  assert.match(actionButtonRule, /color:#334155/);
  assert.match(actionButtonRule, /font-weight:800/);

  const assignmentRule = questionBankStyles.match(/\.qb-modal__assign\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(assignmentRule, /background:linear-gradient\(135deg,#2563eb,#4f46e5\)!important/);
  assert.match(assignmentRule, /color:#fff!important/);

  assert.match(
    questionBankStyles,
    /@media\(max-width:720px\)\{[\s\S]*?\.qb-modal__header-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  );

  const closeRule = questionBankStyles.match(/\.qb-modal__close\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(closeRule, /background:#fff!important/);
  assert.match(closeRule, /color:#475569!important/);
});

test('school document printing reserves a page-safe band for repeated header and footer', () => {
  assert.match(schoolDocument, /margin:32mm 15mm 22mm/);
  assert.match(schoolDocument, /@media print\{[\s\S]*?\.school-document\{[^}]*padding:0!important/s);

  const printCss = schoolDocument.match(/@media print\{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(printCss, 'expected print-specific school document CSS');

  const headerRule = printCss.match(/\.school-document__repeating-header\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(headerRule, /position:fixed/);
  assert.match(headerRule, /top:-20mm/);
  assert.match(headerRule, /right:0/);
  assert.match(headerRule, /left:0/);
  assert.match(headerRule, /height:15mm/);
  assert.match(headerRule, /background:#fff/);
  assert.match(headerRule, /z-index:2/);

  const footerRule = printCss.match(/\.school-document__page-footer\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(footerRule, /position:fixed/);
  assert.match(footerRule, /bottom:-12mm/);
  assert.match(footerRule, /min-height:7mm/);
  assert.match(footerRule, /background:#fff/);
  assert.match(footerRule, /z-index:2/);

  const cardRule = schoolDocument.match(/\.school-document__body \.document-card\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(cardRule, /break-inside:avoid-page/);
  assert.match(cardRule, /page-break-inside:avoid/);

  assert.doesNotMatch(schoolDocument, /padding:23mm 0 18mm!important/);
});
