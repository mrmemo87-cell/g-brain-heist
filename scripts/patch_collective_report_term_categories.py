from pathlib import Path
import re


def load(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def save(path: str, value: str) -> None:
    Path(path).write_text(value, encoding='utf-8')


def replace_once(value: str, old: str, new: str, label: str) -> str:
    if old not in value:
        raise SystemExit(f'{label}: expected source block not found')
    return value.replace(old, new, 1)


path = 'components/CollectiveAssignmentReport.tsx'
text = load(path)
if 'const [categoryFilter, setCategoryFilter]' not in text:
    text = replace_once(
        text,
        "import { TeacherAssignmentSummary, TeacherAssignmentReportRow, Subject, StudentForAssignment } from '../types';",
        "import { TeacherAssignmentSummary, TeacherAssignmentReportRow, Subject, StudentForAssignment, AssignmentCategory } from '../types';\nimport { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../services/schoolAcademicSetupService';\nimport { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from '../src/lib/assignmentCategory';",
        'CollectiveReport imports',
    )
    text = replace_once(
        text,
        '  assignments: Array<{ id: string; title: string; subject: string; date?: string }>;',
        '  assignments: Array<{ id: string; title: string; subject: string; date?: string; category?: AssignmentCategory | null }>;',
        'CollectiveReport export assignment type',
    )
    text = replace_once(
        text,
        "  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');\n  const [batchFilter, setBatchFilter] = useState<string>('all');",
        "  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');\n  const [batchFilter, setBatchFilter] = useState<string>('');\n  const [categoryFilter, setCategoryFilter] = useState<'all' | AssignmentCategory>('all');\n  const [academicSetup, setAcademicSetup] = useState<SchoolAcademicSetup | null>(null);\n  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');\n  const [selectedTermId, setSelectedTermId] = useState('');\n  const [periodMode, setPeriodMode] = useState<'term' | 'custom'>('term');",
        'CollectiveReport state',
    )

    marker = '  // ── Fetch all data on mount ──────────────────────────────────────────────'
    calendar = '''  const localDateKey = useCallback((date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  useEffect(() => {
    if (!school.id) return;
    let cancelled = false;
    void fetchSchoolAcademicSetup(school.id).then((setup) => {
      if (cancelled) return;
      setAcademicSetup(setup);
      const today = localDateKey();
      const currentYear = setup.years.find((item) => item.status === 'current' && today >= item.startsOn && today <= item.endsOn)
        || setup.years.find((item) => item.status === 'current');
      if (!currentYear) return;
      setSelectedAcademicYearId(currentYear.id);
      setAcademicYear(currentYear.name);
      const yearTerms = setup.terms.filter((item) => item.academicYearId === currentYear.id).sort((a, b) => a.sequence - b.sequence);
      const currentTerm = yearTerms.find((item) => today >= item.startsOn && today <= item.endsOn)
        || [...yearTerms].reverse().find((item) => item.startsOn <= today)
        || yearTerms[0];
      if (currentTerm) {
        setSelectedTermId(currentTerm.id);
        setTerm(currentTerm.name);
        setDateFrom(currentTerm.startsOn);
        setDateTo(currentTerm.endsOn);
      }
    }).catch((error) => console.error('Failed to load academic calendar for collective report', error));
    return () => { cancelled = true; };
  }, [localDateKey, school.id]);

  const selectedAcademicYear = useMemo(
    () => academicSetup?.years.find((item) => item.id === selectedAcademicYearId) || null,
    [academicSetup, selectedAcademicYearId],
  );
  const academicYearTerms = useMemo(
    () => (academicSetup?.terms || []).filter((item) => item.academicYearId === selectedAcademicYearId).sort((a, b) => a.sequence - b.sequence),
    [academicSetup, selectedAcademicYearId],
  );
  const selectedAcademicTerm = useMemo(
    () => academicYearTerms.find((item) => item.id === selectedTermId) || null,
    [academicYearTerms, selectedTermId],
  );

  useEffect(() => {
    if (periodMode !== 'term' || !selectedAcademicTerm) return;
    setTerm(selectedAcademicTerm.name);
    setDateFrom(selectedAcademicTerm.startsOn);
    setDateTo(selectedAcademicTerm.endsOn);
  }, [periodMode, selectedAcademicTerm]);

'''
    if marker not in text:
        raise SystemExit('CollectiveReport fetch marker not found')
    text = text.replace(marker, calendar + marker, 1)

    text = replace_once(
        text,
        '''    return assignments.filter((assignment) => {
      if (!selectedAssignmentIds.includes(assignment.id)) return false;
      if (subjectFilter !== 'all' && assignment.subject_name !== subjectFilter) return false;
      if (batchFilter !== 'all') {
        const assignmentClass = assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || 'Unspecified';
        if (assignmentClass !== batchFilter) return false;
      }
      const created = new Date(assignment.assigned_at).getTime();
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      return true;
    });
  }, [assignments, selectedAssignmentIds, subjectFilter, batchFilter, dateFrom, dateTo]);''',
        '''    return assignments.filter((assignment) => {
      if (!selectedAssignmentIds.includes(assignment.id)) return false;
      if (!batchFilter) return false;
      if (subjectFilter !== 'all' && assignment.subject_name !== subjectFilter) return false;
      if (categoryFilter !== 'all' && assignment.assignment_category !== categoryFilter) return false;
      const classMatches = assignment.assignment_mode === 'custom'
        ? (assignment.student_ids || []).some((studentId) => students.some((student) => student.id === studentId && student.batch === batchFilter))
          || (reportData[assignment.id] || []).some((row) => row.batch === batchFilter)
        : assignment.batch === batchFilter;
      if (!classMatches) return false;
      if (selectedAcademicYearId && assignment.academic_year_id && assignment.academic_year_id !== selectedAcademicYearId) return false;
      if (periodMode === 'term' && selectedTermId && assignment.academic_term_id && assignment.academic_term_id !== selectedTermId) return false;
      const created = new Date(assignment.assigned_at).getTime();
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      return true;
    });
  }, [assignments, selectedAssignmentIds, subjectFilter, batchFilter, categoryFilter, dateFrom, dateTo, periodMode, reportData, selectedAcademicYearId, selectedTermId, students]);''',
        'CollectiveReport scoped assignment filter',
    )
    text = replace_once(
        text,
        '''    if (batchFilter !== 'all' && batchFilter !== 'Selected students') {
      rows = rows.filter((r) => r.batch === batchFilter);
    }''',
        '''    if (batchFilter) {
      rows = rows.filter((r) => r.batch === batchFilter);
    }''',
        'CollectiveReport student class filter',
    )
    text = replace_once(
        text,
        '''  const uniqueBatches = useMemo(() => {
    const batches = new Set(allocatedClassCodes.filter(Boolean));
    assignments.forEach((assignment) => {
      batches.add(assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || 'Unspecified');
    });
    return Array.from(batches).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [assignments, allocatedClassCodes]);''',
        '''  const uniqueBatches = useMemo(() => {
    const batches = new Set(allocatedClassCodes.filter((value) => Boolean(value) && value !== 'All'));
    assignments.forEach((assignment) => {
      if (assignment.assignment_mode !== 'custom' && assignment.batch && assignment.batch !== 'All') batches.add(assignment.batch);
    });
    students.forEach((student) => { if (student.batch) batches.add(student.batch); });
    return Array.from(batches).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [assignments, allocatedClassCodes, students]);

  useEffect(() => {
    if (!uniqueBatches.length) { setBatchFilter(''); return; }
    if (!batchFilter || !uniqueBatches.includes(batchFilter)) setBatchFilter(uniqueBatches[0]);
  }, [batchFilter, uniqueBatches]);''',
        'CollectiveReport class options',
    )
    text = replace_once(
        text,
        '      assignments: filteredAssignments.map(a => ({ id: a.id, title: a.title || a.topic_name, subject: a.subject_name, date: a.assigned_at })),',
        '      assignments: filteredAssignments.map(a => ({ id: a.id, title: a.title || a.topic_name, subject: a.subject_name, date: a.assigned_at, category: a.assignment_category })),',
        'CollectiveReport export category',
    )

    controls_pattern = re.compile(
        r'        \{/\* Class filter \*/\}.*?        <label className="flex items-center gap-2 text-xs text-slate-500">\n          To\n          <input aria-label="Created to".*?</label>\n',
        re.S,
    )
    match = controls_pattern.search(text)
    if not match:
        raise SystemExit('CollectiveReport class/date controls not found')
    controls = '''        {/* One class is always required. There is intentionally no All Classes option. */}
        {uniqueBatches.length > 0 && (
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            Class
            <select aria-label="Filter by class" value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)} className="rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:border-cyan-500">
              {uniqueBatches.map((value) => <option key={value} value={value}>Class {value}</option>)}
            </select>
          </label>
        )}
        {academicSetup ? (
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            Academic year
            <select aria-label="Academic year" value={selectedAcademicYearId} onChange={(event) => {
              const yearId = event.target.value;
              setSelectedAcademicYearId(yearId);
              const year = academicSetup.years.find((item) => item.id === yearId);
              setAcademicYear(year?.name || '');
              const terms = academicSetup.terms.filter((item) => item.academicYearId === yearId).sort((a, b) => a.sequence - b.sequence);
              const nextTerm = terms[0];
              setSelectedTermId(nextTerm?.id || '');
              setTerm(nextTerm?.name || '');
              setPeriodMode('term');
              if (nextTerm) { setDateFrom(nextTerm.startsOn); setDateTo(nextTerm.endsOn); }
            }} className="rounded-lg border border-slate-300 text-sm px-3 py-2">
              {academicSetup.years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.status === 'current' ? ' · Current' : ''}</option>)}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-xs font-bold text-slate-500">
          Period
          <select aria-label="Reporting period" value={periodMode === 'custom' ? 'custom' : selectedTermId} onChange={(event) => {
            if (event.target.value === 'custom') { setPeriodMode('custom'); setTerm('Custom dates'); }
            else { setPeriodMode('term'); setSelectedTermId(event.target.value); }
          }} className="rounded-lg border border-slate-300 text-sm px-3 py-2">
            {academicYearTerms.map((item) => <option key={item.id} value={item.id}>{item.name}{localDateKey() >= item.startsOn && localDateKey() <= item.endsOn ? ' · Current' : ''}</option>)}
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-500">
          Assignment type
          <select aria-label="Assignment type" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'all' | AssignmentCategory)} className="rounded-lg border border-slate-300 text-sm px-3 py-2">
            <option value="all">All types</option><option value="classwork">Classwork</option><option value="homework">Homework</option><option value="quiz">Quiz</option><option value="term_exam">Term Exam</option>
          </select>
        </label>
        {periodMode === 'custom' ? <>
          <label className="flex items-center gap-2 text-xs text-slate-500">From<input aria-label="Created from" type="date" min={selectedAcademicYear?.startsOn} max={selectedAcademicYear?.endsOn} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700" /></label>
          <label className="flex items-center gap-2 text-xs text-slate-500">To<input aria-label="Created to" type="date" min={selectedAcademicYear?.startsOn} max={selectedAcademicYear?.endsOn} value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700" /></label>
        </> : null}
'''
    text = text[:match.start()] + controls + text[match.end():]

    clear_pattern = re.compile(r'        \{\(subjectFilter !== \'all\'.*?\n      </div>\n      \{\(subjectFilter !== \'all\'.*?</div> : null\}', re.S)
    clear_match = clear_pattern.search(text)
    if not clear_match:
        raise SystemExit('CollectiveReport clear filter block not found')
    clear_block = '''        {(subjectFilter !== 'all' || categoryFilter !== 'all' || searchTerm || periodMode === 'custom') && (
          <button type="button" onClick={() => {
            setSubjectFilter('all');
            setCategoryFilter('all');
            setSearchTerm('');
            setPeriodMode('term');
            if (selectedAcademicTerm) { setDateFrom(selectedAcademicTerm.startsOn); setDateTo(selectedAcademicTerm.endsOn); setTerm(selectedAcademicTerm.name); }
          }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Reset report filters</button>
        )}
      </div>
      <div className="collective-filter-chips collective-report-no-print" aria-label="Active report scope">
        {batchFilter ? <span>Class {batchFilter}</span> : null}
        {academicYear ? <span>{academicYear}</span> : null}
        {term ? <span>{term}</span> : null}
        {categoryFilter !== 'all' ? <button onClick={() => setCategoryFilter('all')}>{getAssignmentCategoryMeta(categoryFilter).label} ×</button> : null}
        {searchTerm ? <button onClick={() => setSearchTerm('')}>Search: {searchTerm} ×</button> : null}
        {subjectFilter !== 'all' ? <button onClick={() => setSubjectFilter('all')}>{subjectFilter} ×</button> : null}
      </div>'''
    text = text[:clear_match.start()] + clear_block + text[clear_match.end():]

    text = replace_once(
        text,
        '<label className="collective-builder-field"><span>Academic year</span><input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} maxLength={30} /></label><label className="collective-builder-field"><span>Term <small>optional</small></span><input value={term} onChange={(event) => setTerm(event.target.value)} maxLength={40} /></label>',
        '<label className="collective-builder-field"><span>Academic year</span><input value={academicYear} readOnly /></label><label className="collective-builder-field"><span>Term / period</span><input value={term} readOnly /></label>',
        'CollectiveReport report-builder calendar source of truth',
    )
    text = replace_once(
        text,
        '<table className="collective-results-table text-left text-sm">',
        '<table className={`collective-results-table text-left text-sm ${isCustomMode ? \'is-custom-order\' : \'\'}`}>',
        'CollectiveReport table custom-order class',
    )
    text = replace_once(
        text,
        'className="collective-results-class-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none"',
        'className="collective-results-class-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none bg-slate-100 z-20"',
        'CollectiveReport class header sticky styling',
    )
    text = replace_once(
        text,
        '''                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{a.subject_name}</span>''',
        '''                      <div className="flex flex-col items-center gap-1">
                        <span className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide" style={assignmentCategoryBadgeStyle(a.assignment_category)}>{getAssignmentCategoryMeta(a.assignment_category).label}</span>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{a.subject_name}</span>''',
        'CollectiveReport assignment category header',
    )
    text = replace_once(
        text,
        'className="collective-results-class-cell py-3 px-2 text-slate-600"',
        'className="collective-results-class-cell py-3 px-2 text-slate-600 bg-inherit z-10"',
        'CollectiveReport class body sticky styling',
    )

    # Give the right-side summary columns unique classes so Average and Status stay frozen.
    text = text.replace('collective-results-summary-cell py-3 px-2 text-slate-700 font-semibold text-center">Completion', 'collective-results-summary-cell collective-results-completion-cell py-3 px-2 text-slate-700 font-semibold text-center bg-slate-100">Completion', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer', 'collective-results-summary-cell collective-results-average-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-slate-700 font-semibold text-center">\n                    Status', 'collective-results-summary-cell collective-results-status-cell py-3 px-2 text-slate-700 font-semibold text-center bg-slate-100">\n                    Status', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-center text-slate-600 text-xs font-semibold', 'collective-results-summary-cell collective-results-completion-cell py-3 px-2 text-center text-slate-600 text-xs font-semibold', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-center bg-slate-50/50', 'collective-results-summary-cell collective-results-average-cell py-3 px-2 text-center bg-slate-50/95', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-center text-slate-600 text-xs', 'collective-results-summary-cell collective-results-status-cell py-3 px-2 text-center text-slate-600 text-xs bg-inherit', 1)

    save(path, text)


path = 'components/CollectiveAssignmentReport.css'
text = load(path)
if '.collective-results-assignment-cell{min-width:140px' not in text:
    text = replace_once(
        text,
        '''.collective-results-table-wrap{width:100%;max-width:100%;overflow:hidden}
.collective-results-table{width:100%;table-layout:fixed;border-collapse:collapse}
.collective-results-table col.collective-results-col--drag{width:4%}
.collective-results-table col.collective-results-col--student{width:18%}
.collective-results-table col.collective-results-col--class{width:8%}
.collective-results-table col.collective-results-col--completion{width:9%}
.collective-results-table col.collective-results-col--average{width:9%}
.collective-results-table col.collective-results-col--status{width:11%}
.collective-results-table th,.collective-results-table td{min-width:0;overflow-wrap:anywhere}''',
        '''.collective-results-table-wrap{width:100%;max-width:100%;overflow-x:auto;overflow-y:visible;position:relative}
.collective-results-table{width:max-content;min-width:100%;table-layout:auto;border-collapse:separate;border-spacing:0}
.collective-results-table col.collective-results-col--drag{width:44px}
.collective-results-table col.collective-results-col--student{width:220px}
.collective-results-table col.collective-results-col--class{width:90px}
.collective-results-table col.collective-results-col--completion{width:100px}
.collective-results-table col.collective-results-col--average{width:90px}
.collective-results-table col.collective-results-col--status{width:120px}
.collective-results-table th,.collective-results-table td{overflow-wrap:anywhere}
.collective-results-assignment-cell{min-width:140px;width:140px}
.collective-results-student-cell{position:sticky;left:0;min-width:220px;width:220px}
.collective-results-class-cell{position:sticky;left:220px;min-width:90px;width:90px}
.collective-results-table.is-custom-order .collective-results-student-cell{left:44px}
.collective-results-table.is-custom-order .collective-results-class-cell{left:264px}
.collective-results-completion-cell{min-width:100px;width:100px}
.collective-results-average-cell{position:sticky;right:120px;min-width:90px;width:90px;z-index:12}
.collective-results-status-cell{position:sticky;right:0;min-width:120px;width:120px;z-index:12}
.collective-results-table thead .collective-results-average-cell,.collective-results-table thead .collective-results-status-cell{z-index:30}''',
        'CollectiveReport wide table CSS',
    )
    text += '\n@media print{.collective-results-student-cell,.collective-results-class-cell,.collective-results-average-cell,.collective-results-status-cell{position:static!important}.collective-results-table-wrap{overflow:visible!important}}\n'
    save(path, text)

print('Collective Report term/category UX materialized.')
