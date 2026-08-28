from pathlib import Path

path = Path('components/TeacherPortal.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { supabase } from '../services/supabaseClient';\n",
    "import { supabase } from '../services/supabaseClient';\nimport { getAcademicReportingContext, type AcademicReportingYear } from '../services/academicReportingService';\n",
    'academic reporting import',
)

replace_once(
    "  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);\n",
    "  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);\n"
    "  const [reportAcademicYears, setReportAcademicYears] = useState<AcademicReportingYear[]>([]);\n"
    "  const [reportAcademicYearId, setReportAcademicYearId] = useState('');\n"
    "  const [reportAssignments, setReportAssignments] = useState<TeacherAssignmentSummary[]>([]);\n"
    "  const [reportAssignmentsLoading, setReportAssignmentsLoading] = useState(false);\n",
    'report state',
)

marker = "  const [assignmentQuestionTypeFilter, setAssignmentQuestionTypeFilter] = useState<'all' | QuestionType>('all');\n\n  // Assignment Filtering State (Folder Organization)"
replacement = """  const [assignmentQuestionTypeFilter, setAssignmentQuestionTypeFilter] = useState<'all' | QuestionType>('all');

  useEffect(() => {
    if (!teacher || !canUseTeacherFeature(FEATURE_KEYS.REPORTS)) return;
    let cancelled = false;
    void getAcademicReportingContext()
      .then((reportingContext) => {
        if (cancelled) return;
        setReportAcademicYears(reportingContext.years);
        const currentYear = reportingContext.years.find((year) => year.status === 'current') || reportingContext.years[0] || null;
        setReportAcademicYearId((current) => current && reportingContext.years.some((year) => year.id === current)
          ? current
          : currentYear?.id || '');
      })
      .catch((error) => console.error('Error loading report academic years:', error));
    return () => { cancelled = true; };
  }, [teacher?.id, canUseTeacherFeature]);

  useEffect(() => {
    if (!teacher || !reportAcademicYearId) {
      setReportAssignments([]);
      return;
    }
    const selectedYear = reportAcademicYears.find((year) => year.id === reportAcademicYearId) || null;
    if (!selectedYear || selectedYear.status === 'current') {
      setReportAssignments(assignments);
      setReportAssignmentsLoading(false);
      return;
    }

    let cancelled = false;
    setReportAssignments([]);
    setReportAssignmentsLoading(true);
    void supabase.rpc('rpc_get_assignments_for_teacher_for_year', {
      p_teacher_id: teacher.id,
      p_academic_year_id: reportAcademicYearId,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Error loading archived assignment reports:', error);
        setReportAssignments([]);
      } else {
        setReportAssignments((data as TeacherAssignmentSummary[]) || []);
      }
      setReportAssignmentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [teacher?.id, assignments, reportAcademicYearId, reportAcademicYears]);

  const selectedReportAcademicYear = reportAcademicYears.find((year) => year.id === reportAcademicYearId) || null;
  const isArchivedReportYear = Boolean(selectedReportAcademicYear && selectedReportAcademicYear.status !== 'current');

  // Assignment Filtering State (Folder Organization)"""
replace_once(marker, replacement, 'report academic year effects')

start = text.index('  const renderReports = () => (')
end = text.index('  const renderReportDetail = () => (', start)
segment = text[start:end]
segment = segment.replace(
    '  const renderReports = () => (\n    <div>\n',
    "  const renderReports = () => {\n    const assignments = reportAssignments;\n    return (\n    <div>\n      {reportAssignmentsLoading && <div className=\"teacher-info-message\">Loading archived assignment reports…</div>}\n",
    1,
)
segment = segment.replace(
    '        <h2>📊 Assignment Reports</h2>\n',
    """        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>📊 Assignment Reports</h2>
          {reportAcademicYears.length > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            Academic Year
            <select
              value={reportAcademicYearId}
              onChange={(event) => setReportAcademicYearId(event.target.value)}
              style={{ border: '1px solid #dbe3ef', borderRadius: 8, padding: '7px 10px', background: '#fff' }}
            >
              {reportAcademicYears.map((year) => <option key={year.id} value={year.id}>
                {year.name} {year.status === 'current' ? '(Current)' : '(Archived)'}
              </option>)}
            </select>
          </label>}
          {isArchivedReportYear && <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>Archived · read only</span>}
        </div>
""",
    1,
)
segment = segment.replace('{assignments.length > 0 && (', '{assignments.length > 0 && !isArchivedReportYear && (', 1)
if not segment.rstrip().endswith(');'):
    raise RuntimeError('renderReports closing marker changed unexpectedly')
segment = segment.rstrip()[:-2] + ');\n  };\n\n'
text = text[:start] + segment + text[end:]

path.write_text(text, encoding='utf-8')
print('TeacherPortal cleaned to academic-year report changes only.')
