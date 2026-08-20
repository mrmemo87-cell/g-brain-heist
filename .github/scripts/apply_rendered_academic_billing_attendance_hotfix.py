from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match in {path}, found {count}")
    file.write_text(source.replace(old, new, 1))


# 1) Academic report form controls: keep text dark on the light-grey control panel.
css_path = Path('components/student-progress/StudentAcademicProfile.css')
css = css_path.read_text()
marker = '/* Academic report light-control contrast guard */'
if marker in css:
    raise SystemExit('Academic report control contrast guard already present')
css += """

/* Academic report light-control contrast guard */
.sap-report-controls,
.sap-report-controls label,
.sap-report-controls fieldset,
.sap-report-controls fieldset label,
.sap-report-controls legend {
  color: #334155 !important;
}
.sap-report-controls input,
.sap-report-controls textarea {
  color: #0f172a !important;
  caret-color: #0f172a;
}
.sap-report-controls input::placeholder,
.sap-report-controls textarea::placeholder {
  color: #94a3b8 !important;
  opacity: 1;
}
"""
css_path.write_text(css)

# 2) Programme seat selected-card contrast: selected dark blue card must use white text,
# while pale green commitment chips retain dark green text (including 0% committed).
billing_css_path = Path('components/school-admin/BillingContrast.css')
billing_css = billing_css_path.read_text()
marker = '/* Selected programme seat card contrast */'
if marker in billing_css:
    raise SystemExit('Selected programme seat contrast guard already present')
billing_css += """

/* Selected programme seat card contrast */
.billing-tab-ui #programme-access-requests button[aria-pressed="true"] {
  background: #1e4b82 !important;
  border-color: #1e4b82 !important;
  color: #ffffff !important;
}
.billing-tab-ui #programme-access-requests button[aria-pressed="true"] > span:first-child > strong,
.billing-tab-ui #programme-access-requests button[aria-pressed="true"] > span:nth-child(2) {
  color: #ffffff !important;
}
.billing-tab-ui #programme-access-requests button[aria-pressed="true"] > span:nth-child(2) > small,
.billing-tab-ui #programme-access-requests button[aria-pressed="true"] > span:last-child {
  color: #dbeafe !important;
}
.billing-tab-ui #programme-access-requests button[aria-pressed="true"] span.bg-emerald-100 {
  color: #065f46 !important;
}
"""
billing_css_path.write_text(billing_css)

# 3) Remove obsolete Attendance Register generation from teacher My Classes.
teacher_path = Path('components/TeacherPortal.tsx')
source = teacher_path.read_text()
start_marker = "    const printClassDocuments = (groups: typeof classGroups, mode: 'roster' | 'register') => {"
end_marker = "\n\n    return ("
start = source.find(start_marker)
if start < 0:
    raise SystemExit('Teacher class document helper start marker not found')
end = source.find(end_marker, start)
if end < 0:
    raise SystemExit('Teacher class document helper end marker not found')
replacement = '''    const printClassDocuments = (groups: typeof classGroups) => {
      if (!groups.length) return;
      const today = new Date().toISOString().slice(0, 10);
      const bodyHtml = groups.map((group, groupIndex) => `
        <section class="${groupIndex > 0 ? 'document-page-break' : ''}">
          <h2>Class ${escapeSchoolDocumentHtml(group.classCode)}</h2>
          <p><strong>Subjects:</strong> ${escapeSchoolDocumentHtml(group.subjects.join(', ') || 'Not linked')}</p>
          <table>
            <thead><tr><th style="width:8%">No.</th><th>Official student name</th><th style="width:14%">Grade</th><th style="width:35%">Teacher notes</th></tr></thead>
            <tbody>${group.students.length ? group.students.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(student.display_name)}</td><td>${escapeSchoolDocumentHtml(student.grade || '—')}</td><td></td></tr>`).join('') : '<tr><td colspan="4">No students are currently enrolled in this class.</td></tr>'}</tbody>
          </table>
        </section>`).join('');
      try {
        openSchoolDocumentPreview({
          meta: {
            documentId: createSchoolDocumentId('roster'),
            templateVersion: 'class-roster-v1',
            title: 'Class Roster',
            subtitle: groups.length === 1 ? `Class ${groups[0]?.classCode || ''}` : `${groups.length} allocated classes`,
            schoolName: resolvedBranding.schoolName,
            schoolLogoUrl: resolvedBranding.schoolLogoUrl,
            audience: 'teacher',
            status: 'final',
            confidentiality: 'confidential',
            generatedAt: new Date().toISOString(),
            generatedBy: profile.full_name || profile.username || 'Teacher',
            className: groups.length === 1 ? groups[0]?.classCode : undefined,
            schoolId: profile.school_id,
            sourceType: 'class_roster',
            sourceId: groups.length === 1 ? groups[0]?.classCode : 'all-assigned-classes',
          },
          bodyHtml,
          orientation: 'portrait',
          inkSaver: true,
          fileName: schoolDocumentFileName(resolvedBranding.schoolName, 'Class_Roster', groups.length === 1 ? groups[0]?.classCode : 'All_Classes', today),
        });
      } catch (error) {
        brainsAlert(error instanceof Error ? error.message : 'Unable to open the class document.', 'info');
      }
    };'''
source = source[:start] + replacement + source[end:]

replacements = [
    ("onClick={() => printClassDocuments(classGroups, 'roster')}", "onClick={() => printClassDocuments(classGroups)}", 'all-roster action'),
    ("onClick={() => printClassDocuments([group], 'roster')}", "onClick={() => printClassDocuments([group])}", 'single-roster action'),
]
for old, new, label in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    source = source.replace(old, new, 1)

attendance_button = "            <button type=\"button\" className=\"teacher-btn teacher-btn-primary\" onClick={() => printClassDocuments(classGroups, 'register')} disabled={!classGroups.length}>Attendance register</button>\n"
if source.count(attendance_button) != 1:
    raise SystemExit(f'Attendance button: expected 1 match, found {source.count(attendance_button)}')
source = source.replace(attendance_button, '', 1)

helper_start = source.find("    const printClassDocuments = (groups: typeof classGroups) => {")
helper_end = source.find(end_marker, helper_start)
helper = source[helper_start:helper_end]
if 'register' in helper.lower() or 'attendance' in helper.lower():
    raise SystemExit('Attendance/register logic remains in printClassDocuments helper')
if 'Attendance register' in source:
    raise SystemExit('Visible Attendance register label remains in TeacherPortal')
teacher_path.write_text(source)

# 4) Focused regression coverage for the exact rendered misses.
test_path = Path('tests/renderedAcademicBillingAttendanceHotfix.test.ts')
if test_path.exists():
    raise SystemExit('Rendered-state hotfix test already exists')
test_path.write_text("""import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('student report controls use dark text on their light panel', () => {
  const css = read('components/student-progress/StudentAcademicProfile.css');
  assert.match(css, /Academic report light-control contrast guard/);
  assert.match(css, /sap-report-controls label[\\s\\S]*#334155 !important/);
  assert.match(css, /sap-report-controls input[\\s\\S]*#0f172a !important/);
  assert.match(css, /textarea::placeholder[\\s\\S]*#94a3b8 !important/);
});

test('selected programme seat card is white-on-dark while commitment chip stays readable', () => {
  const css = read('components/school-admin/BillingContrast.css');
  assert.match(css, /button\\[aria-pressed="true"\\][\\s\\S]*background: #1e4b82 !important/);
  assert.match(css, /button\\[aria-pressed="true"\\][\\s\\S]*color: #ffffff !important/);
  assert.match(css, /span\\.bg-emerald-100[\\s\\S]*#065f46 !important/);
});

test('teacher My Classes exposes roster printing only', () => {
  const source = read('components/TeacherPortal.tsx');
  assert.doesNotMatch(source, /Attendance register/i);
  assert.doesNotMatch(source, /Class Attendance Register/i);
  assert.doesNotMatch(source, /printClassDocuments\\([^\\n]*'register'/);
  assert.match(source, /const printClassDocuments = \\(groups: typeof classGroups\\) =>/);
  assert.match(source, /title: 'Class Roster'/);
});
""")
