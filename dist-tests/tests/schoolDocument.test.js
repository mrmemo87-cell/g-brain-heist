import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, renderSchoolDocumentHtml, safeCsvCell, schoolDocumentTypeLabel, schoolDocumentFileName, } from '../src/lib/schoolDocument.js';
test('school document IDs are readable, dated, and unique', () => {
    const first = createSchoolDocumentId('assignment');
    const second = createSchoolDocumentId('assignment');
    assert.match(first, /^ASN-\d{8}-[0-9A-HJKMNP-TV-Z]{12}$/);
    assert.notStrictEqual(first, second);
});
test('document HTML escapes identity fields while preserving trusted template body HTML', () => {
    const html = renderSchoolDocumentHtml({
        meta: {
            documentId: 'ASN-20260802-ABC12345',
            templateVersion: 'assignment-student-v2',
            title: 'Family <Report>',
            schoolName: 'School & Academy',
            audience: 'family',
            status: 'draft',
            confidentiality: 'family-copy',
            generatedAt: '2026-08-02T10:00:00.000Z',
            studentName: 'Alex <script>alert(1)</script>',
        },
        bodyHtml: '<h2>Trusted section</h2>',
    });
    assert.ok(html.includes('Family &lt;Report&gt;'));
    assert.ok(html.includes('School &amp; Academy'));
    assert.ok(html.includes('Alex &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('Alex <script>'));
    assert.ok(html.includes('<h2>Trusted section</h2>'));
    assert.ok(html.includes('school-document__draft-watermark'));
    assert.ok(html.includes('@page{size:'));
    assert.ok(html.includes('Print / Save PDF'));
    assert.ok(html.includes('Ink saver'));
    assert.ok(html.includes('Student learning report'));
    assert.ok(html.includes('Document reference: ASN-20260802-ABC12345'));
    assert.ok(!html.includes('assignment-student-v2'));
    assert.ok(!html.includes('counter(page)'));
    assert.ok(!html.includes('Page 0'));
});
test('document types and references use professional public labels', () => {
    assert.strictEqual(schoolDocumentTypeLabel('admin-class-roster-v1'), 'Class roster');
    assert.strictEqual(schoolDocumentTypeLabel('writing-report-v2'), 'Writing progress report');
    assert.match(createSchoolDocumentId('teacher-answer-key-v1'), /^ANS-/);
    assert.match(createSchoolDocumentId('class-register-v1'), /^ATT-/);
});
test('CSV cells are quoted, quote-safe, and protected from spreadsheet formulas', () => {
    assert.strictEqual(safeCsvCell('plain'), '"plain"');
    assert.strictEqual(safeCsvCell('A "quote"'), '"A ""quote"""');
    assert.strictEqual(safeCsvCell('=HYPERLINK("https://bad.example")'), '"\'=HYPERLINK(""https://bad.example"")"');
    assert.strictEqual(safeCsvCell('+1+1'), '"\'+1+1"');
    assert.strictEqual(safeCsvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
});
test('filename helper removes unsafe path and punctuation characters', () => {
    assert.strictEqual(schoolDocumentFileName('North/West School', '../Student', 'Family Report'), 'North_West_School_Student_Family_Report.pdf');
    assert.strictEqual(escapeSchoolDocumentHtml(`'"&<>`), '&#039;&quot;&amp;&lt;&gt;');
});
