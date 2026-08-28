from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


# 1) Fix Writing Hub persistence: one ON CONFLICT statement must never contain
# the same attempt_key twice.
path = 'src/lib/brains_heist/writingRepository.ts'
text = read(path)
old = """  const payloadRows = rows
    .filter((payload) => Boolean(readKey(payload, 'id')))
    .map((payload) => ({
      attempt_key: readKey(payload, 'id'),
      payload: safe(payload),
    }));
  if (!payloadRows.length) return;
"""
new = """  const payloadByAttemptKey = new Map<string, { attempt_key: string; payload: unknown }>();
  rows.forEach((payload) => {
    const attemptKey = readKey(payload, 'id');
    if (!attemptKey) return;
    // The in-memory writing history can temporarily contain duplicate copies of
    // the same attempt while feedback is enriched. Postgres rejects duplicate
    // conflict keys within one UPSERT, so keep the latest payload per attempt.
    payloadByAttemptKey.set(attemptKey, {
      attempt_key: attemptKey,
      payload: safe(payload),
    });
  });
  const payloadRows = [...payloadByAttemptKey.values()];
  if (!payloadRows.length) return;
"""
text = replace_once(text, old, new, 'writing attempt upsert dedupe')
write(path, text)


# 2) Student academic profile service: add explicit academic-year contracts.
path = 'services/studentAcademicProfileService.ts'
text = read(path)
text = replace_once(
    text,
    "scope: { subject?: string | null; date_from?: string | null; date_to?: string | null; viewer: 'student' | 'teacher' | 'school_admin' | 'school_head'; allowed_subjects: string[] };",
    "scope: { subject?: string | null; date_from?: string | null; date_to?: string | null; viewer: 'student' | 'teacher' | 'school_admin' | 'school_head'; allowed_subjects: string[]; academic_year_id?: string | null; academic_year_name?: string | null; academic_year_status?: string | null; archived?: boolean };",
    'academic profile scope type',
)
text = replace_once(
    text,
    "export interface StudentAcademicProfileQuery { studentId?: string | null; subject?: string | null; dateFrom?: string | null; dateTo?: string | null }",
    "export interface StudentAcademicProfileQuery { studentId?: string | null; subject?: string | null; academicYearId?: string | null; dateFrom?: string | null; dateTo?: string | null }",
    'academic profile query type',
)
start = text.index('export const fetchStudentAcademicProfile = async')
end = text.index('export const fetchStudentAcademicSubjects = async', start)
text = text[:start] + """export const fetchStudentAcademicProfile = async (query: StudentAcademicProfileQuery = {}): Promise<StudentAcademicProfile> => {
  const params = {
    p_student_id: query.studentId ?? null,
    p_subject: query.subject ?? null,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
  };
  const request = query.academicYearId
    ? supabase.rpc('rpc_student_academic_profile_for_year', {
        ...params,
        p_academic_year_id: query.academicYearId,
      })
    : supabase.rpc('rpc_student_academic_profile', params);
  const { data, error } = await request;
  if (error) throw userFacingError(error, 'We could not open this student’s progress just now. Please try again.');
  if (!data || typeof data !== 'object') return emptyProfile();
  return data as StudentAcademicProfile;
};

""" + text[end:]
start = text.index('export const fetchStudentAcademicConfidence = async')
end = text.index('export const formatLearningStatus =', start)
text = text[:start] + """export const fetchStudentAcademicConfidence = async (
  studentId?: string | null,
  academicYearId?: string | null,
): Promise<StudentAcademicConfidence> => {
  let resolvedAcademicYearId = academicYearId ?? null;
  if (!resolvedAcademicYearId) {
    const reportingContext = await getAcademicReportingContext(studentId);
    resolvedAcademicYearId = reportingContext.years.find((year) => year.status === 'current')?.id ?? null;
  }
  const { data, error } = await supabase.rpc('rpc_student_academic_confidence', {
    p_student_id: studentId ?? null,
    p_academic_year_id: resolvedAcademicYearId,
    p_academic_subject_id: null,
  });
  if (error) throw userFacingError(error, 'We could not load the evidence confidence record just now. Please try again.');
  if (!data || typeof data !== 'object') {
    return {
      success: true,
      studentId: studentId || '',
      summary: { skillsTracked: 0, assessedSkills: 0, lowDataSkills: 0, staleSkills: 0, contradictorySkills: 0, teacherReviewRequired: 0 },
      confidenceStates: [],
      coverage: [],
    };
  }
  return data as StudentAcademicConfidence;
};

""" + text[end:]
write(path, text)


# 3) Teacher academic-profile directory: choose current or archived roster.
path = 'services/teacherAcademicProfileDirectoryService.ts'
text = read(path)
start = text.index('export const fetchTeacherAcademicProfileStudents = async')
text = text[:start] + """export const fetchTeacherAcademicProfileStudents = async (
  academicYearId?: string | null,
): Promise<TeacherAcademicProfileStudent[]> => {
  const request = academicYearId
    ? supabase.rpc('rpc_teacher_academic_profile_students_for_year', { p_academic_year_id: academicYearId })
    : supabase.rpc('rpc_teacher_academic_profile_students');
  const { data, error } = await request;
  if (error) throw userFacingError(error, 'We could not open the student progress directory just now. Please try again.');
  if (!Array.isArray(data)) return [];
  return data as TeacherAcademicProfileStudent[];
};
"""
write(path, text)


# 4) Teacher Academic Profiles: current year by default, historical years explicit/read-only.
path = 'components/student-progress/TeacherAcademicProfilesPage.tsx'
write(path, """import React, { useEffect, useMemo, useState } from 'react';
import StudentAcademicProfile from './StudentAcademicProfile';
import {
  fetchTeacherAcademicProfileStudents,
  type TeacherAcademicProfileStudent,
} from '../../services/teacherAcademicProfileDirectoryService';
import {
  academicProgressBackDestination,
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
} from '../../services/academicProgressExperienceService';
import {
  getAcademicReportingContext,
  type AcademicReportingYear,
} from '../../services/academicReportingService';
import {
  AcademicProgressHeader,
  AcademicStudentPicker,
  selectionFromStudent,
} from './AcademicProgressSuite';
import './StudentAcademicProfile.css';

interface TeacherAcademicProfilesPageProps {
  onBack?: () => void;
}

const TeacherAcademicProfilesPage: React.FC<TeacherAcademicProfilesPageProps> = ({ onBack }) => {
  const [students, setStudents] = useState<TeacherAcademicProfileStudent[]>([]);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicReportingYear[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');
  const [grade, setGrade] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadContext = async () => {
      try {
        const [nextContext, reportingContext] = await Promise.all([
          getAcademicProgressExperienceContext(),
          getAcademicReportingContext(),
        ]);
        if (cancelled) return;
        setContext(nextContext);
        setAcademicYears(reportingContext.years);
        const currentYear = reportingContext.years.find((year) => year.status === 'current') || reportingContext.years[0] || null;
        if (!currentYear) throw new Error('No academic year is configured for this school.');
        setSelectedAcademicYearId(currentYear.id);
      } catch (err) {
        console.error('Failed to load academic profile context', err);
        if (!cancelled) {
          setError('Student progress could not be loaded. Please check the school academic year setup and try again.');
          setLoading(false);
        }
      }
    };
    void loadContext();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedAcademicYearId) return;
    let cancelled = false;
    const loadStudents = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextStudents = await fetchTeacherAcademicProfileStudents(selectedAcademicYearId);
        if (cancelled) return;
        setStudents(nextStudents);
        const params = new URLSearchParams(window.location.search);
        const requestedStudent = params.get('student') || '';
        if (requestedStudent) {
          const selection = selectionFromStudent(nextStudents, requestedStudent);
          if (selection) {
            setGrade(selection.grade);
            setClassFilter(selection.className);
            setSelectedStudentId(requestedStudent);
            setSubjectFilter(params.get('subject') || 'all');
          }
        }
      } catch (err) {
        console.error('Failed to load academic profile directory', err);
        if (!cancelled) setError('Student progress could not be loaded for this academic year. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadStudents();
    return () => { cancelled = true; };
  }, [selectedAcademicYearId]);

  const selected = useMemo(() => students.find((student) => student.student_id === selectedStudentId) || null, [students, selectedStudentId]);
  const selectedAcademicYear = academicYears.find((year) => year.id === selectedAcademicYearId) || null;
  const archivedYear = Boolean(selectedAcademicYear && selectedAcademicYear.status !== 'current');
  const viewerRole = context?.viewer.role || 'teacher';
  const profileMode = viewerRole === 'school_admin' || viewerRole === 'school_head' ? viewerRole : 'teacher';
  const scopeNote = viewerRole === 'teacher'
    ? 'Only students and subjects covered by your authorised teacher allocations for the selected academic year are shown here.'
    : 'Only students in your school are shown here. Access remains school-scoped and role-authorised.';

  if (profileOpen && selectedStudentId) {
    return (
      <StudentAcademicProfile
        studentId={selectedStudentId}
        initialSubject={subjectFilter === 'all' ? null : subjectFilter}
        academicYearId={selectedAcademicYearId}
        academicYearName={selectedAcademicYear?.name}
        mode={profileMode}
        schoolName={context?.school.name}
        schoolLogoUrl={context?.school.logo_url}
        teacherName={context?.viewer.name}
        backLabel="Back to student selection"
        onClose={() => setProfileOpen(false)}
      />
    );
  }

  return <section className="sap-shell">
    <AcademicProgressHeader
      context={context}
      eyebrow="Student Progress"
      title="Student Academic Profiles"
      subtitle="Choose an academic year, grade, class and student to see the correct historical or current attainment record."
      onBack={onBack}
      backLabel={onBack ? academicProgressBackDestination(viewerRole).label : undefined}
    />

    <section className="aps-selection-summary" style={{ alignItems: 'flex-end', gap: 16 }}>
      <label style={{ display: 'grid', gap: 6, minWidth: 220 }}>
        <strong>Academic Year</strong>
        <select
          value={selectedAcademicYearId}
          onChange={(event) => {
            setSelectedAcademicYearId(event.target.value);
            setGrade('');
            setClassFilter('');
            setSelectedStudentId('');
            setSubjectFilter('all');
            setProfileOpen(false);
          }}
        >
          {academicYears.map((year) => <option key={year.id} value={year.id}>
            {year.name} {year.status === 'current' ? '(Current)' : '(Archived)'}
          </option>)}
        </select>
      </label>
      <div>
        <strong>{selectedAcademicYear?.name || 'Academic year'}</strong>
        <span>{archivedYear ? 'Archived · read only' : 'Current academic year · live evidence'}</span>
      </div>
    </section>

    <p className="aps-scope-note">{scopeNote}</p>

    {loading ? <div className="aps-empty-state">Loading the selected academic year…</div> : null}
    {error ? <div className="aps-empty-state">{error}</div> : null}

    {!loading && !error ? <>
      <AcademicStudentPicker
        students={students}
        grade={grade}
        className={classFilter}
        studentId={selectedStudentId}
        subject={subjectFilter}
        onGradeChange={(value) => { setGrade(value); setClassFilter(''); setSelectedStudentId(''); setSubjectFilter('all'); }}
        onClassChange={(value) => { setClassFilter(value); setSelectedStudentId(''); setSubjectFilter('all'); }}
        onStudentChange={(value) => { setSelectedStudentId(value); setSubjectFilter('all'); }}
        onSubjectChange={setSubjectFilter}
      />

      {selected ? <section className="aps-selection-summary">
        <div>
          <strong>{selected.student_name}</strong>
          <span>{selected.grade ? `Grade ${selected.grade} · ` : ''}Class {selected.class_name || '—'}{subjectFilter !== 'all' ? ` · ${subjectFilter}` : ''}</span>
        </div>
        <button type="button" className="aps-primary-button" onClick={() => setProfileOpen(true)}>Open academic profile</button>
      </section> : <div className="aps-empty-state">Start with the grade above. The next step becomes available automatically.</div>}
    </> : null}
  </section>;
};

export default TeacherAcademicProfilesPage;
""")


# 5) Student Academic Profile V2: bind every profile/confidence read to selected year.
path = 'components/student-progress/StudentAcademicProfileV2.tsx'
text = read(path)
text = replace_once(
    text,
    "  initialSubject?: string | null;\n  mode?: 'student' | 'teacher' | 'school_admin' | 'school_head';",
    "  initialSubject?: string | null;\n  academicYearId?: string | null;\n  academicYearName?: string | null;\n  mode?: 'student' | 'teacher' | 'school_admin' | 'school_head';",
    'academic profile props',
)
text = replace_once(
    text,
    "  initialSubject,\n  mode = 'teacher',",
    "  initialSubject,\n  academicYearId,\n  academicYearName,\n  mode = 'teacher',",
    'academic profile destructuring',
)
text = replace_once(
    text,
    "          subject: subject === 'all' ? null : subject,\n          dateFrom:",
    "          subject: subject === 'all' ? null : subject,\n          academicYearId: academicYearId ?? null,\n          dateFrom:",
    'academic profile year rpc arg',
)
text = replace_once(
    text,
    "  }, [studentId, subject, dateFrom, dateTo]);",
    "  }, [studentId, subject, academicYearId, dateFrom, dateTo]);",
    'academic profile load dependency',
)
text = replace_once(
    text,
    "        fetchStudentAcademicConfidence(studentId),",
    "        fetchStudentAcademicConfidence(studentId, academicYearId),",
    'academic confidence year',
)
text = replace_once(
    text,
    "  }, [studentId]);\n\n  const resolvedContext",
    "  }, [studentId, academicYearId]);\n\n  useEffect(() => {\n    if (!academicYearId || !profile) return;\n    setAvailableSubjects(profile.subjects.map((item) => item.subject));\n  }, [academicYearId, profile]);\n\n  const resolvedContext",
    'academic context dependency',
)
text = replace_once(
    text,
    "  const preparedBy = context?.viewer.name || teacherName || undefined;\n  const supportCount",
    "  const preparedBy = context?.viewer.name || teacherName || undefined;\n  const archivedYear = profile.scope.archived === true;\n  const profileYearLabel = profile.scope.academic_year_name || academicYearName || null;\n  const supportCount",
    'academic profile archive state',
)
text = replace_once(
    text,
    "      actions={canGenerateReport ? <button type=\"button\" className=\"aps-primary-button\" onClick={() => setShowReport(true)}>Generate individual report</button> : null}\n    />\n\n    <div className=\"sap-filterbar\"",
    "      actions={canGenerateReport && !archivedYear ? <button type=\"button\" className=\"aps-primary-button\" onClick={() => setShowReport(true)}>Generate individual report</button> : null}\n    />\n\n    {profileYearLabel ? <div className=\"aps-scope-note\"><strong>{profileYearLabel}</strong> · {archivedYear ? 'Archived · read only. Historical evidence and placement are frozen to this school year.' : 'Current academic year · live evidence.'}</div> : null}\n\n    <div className=\"sap-filterbar\"",
    'academic profile archive banner',
)
write(path, text)


# 6) Teacher Reports: current academic year by default, explicit archived-year reads.
path = 'components/TeacherPortal.tsx'
text = read(path)
text = replace_once(
    text,
    "import { supabase } from '../services/supabaseClient';\n",
    "import { supabase } from '../services/supabaseClient';\nimport { getAcademicReportingContext, type AcademicReportingYear } from '../services/academicReportingService';\n",
    'teacher report academic context import',
)
text = replace_once(
    text,
    "  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);\n  const [dashboardAssignmentReports",
    "  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);\n  const [reportAcademicYears, setReportAcademicYears] = useState<AcademicReportingYear[]>([]);\n  const [reportAcademicYearId, setReportAcademicYearId] = useState('');\n  const [reportAssignments, setReportAssignments] = useState<TeacherAssignmentSummary[]>([]);\n  const [reportAssignmentsLoading, setReportAssignmentsLoading] = useState(false);\n  const [dashboardAssignmentReports",
    'teacher report year state',
)
anchor = "  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');"
pos = text.index(anchor)
# Insert effects after the contiguous assignment state declarations, immediately before the next blank comment.
insert_pos = text.index('\n\n', pos) + 2
effects = """  useEffect(() => {
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

"""
text = text[:insert_pos] + effects + text[insert_pos:]
start = text.index('  const renderReports = () => (')
end = text.index('  const renderReportDetail = () => (', start)
segment = text[start:end]
segment = segment.replace('  const renderReports = () => (', '  const renderReports = () => {\n    const assignments = reportAssignments;\n    return (', 1)
# Existing function ends with two-space indented `);` before the next render function.
last_close = segment.rfind('  );')
if last_close == -1:
    raise RuntimeError('teacher reports: could not find renderReports closing')
segment = segment[:last_close] + '  );\n  };' + segment[last_close + len('  );'):]
segment = replace_once(
    segment,
    '        <h2>📊 Assignment Reports</h2>',
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
        </div>""",
    'teacher reports year selector',
)
segment = segment.replace('{assignments.length > 0 && (', '{assignments.length > 0 && !isArchivedReportYear && (', 1)
# Make the archive transition explicit while the historical RPC loads.
segment = segment.replace(
    "      <div className=\"teacher-section-header\"",
    "      {reportAssignmentsLoading && <div className=\"teacher-info-message\">Loading archived assignment reports…</div>}\n      <div className=\"teacher-section-header\"",
    1,
)
text = text[:start] + segment + text[end:]
write(path, text)


# 7) Writing Hub: current year is operational; older years remain selectable/read-only.
path = 'src/pages/writing/WritingHub.tsx'
text = read(path)
text = replace_once(
    text,
    "import { quest_get_missions, QuestMissionRow } from '../../../services/gameService.js';\n",
    "import { quest_get_missions, QuestMissionRow } from '../../../services/gameService.js';\nimport { getAcademicReportingContext, type AcademicReportingYear } from '../../../services/academicReportingService.js';\n",
    'writing academic context import',
)
# Target the SimpleLoop state block (the second persistenceStatus declaration follows hydratedForStudentId).
old = """  const [hydratedForStudentId, setHydratedForStudentId] = useState<string | null>(null);
  const [hydrationStatus, setHydrationStatus] = useState(getWritingHydrationStatus());
  const [persistenceStatus, setPersistenceStatus] = useState(getWritingPersistenceStatus());
  const responseFieldRef"""
new = """  const [hydratedForStudentId, setHydratedForStudentId] = useState<string | null>(null);
  const [hydrationStatus, setHydrationStatus] = useState(getWritingHydrationStatus());
  const [persistenceStatus, setPersistenceStatus] = useState(getWritingPersistenceStatus());
  const [academicYears, setAcademicYears] = useState<AcademicReportingYear[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');
  const [academicYearsReady, setAcademicYearsReady] = useState(false);
  const responseFieldRef"""
text = replace_once(text, old, new, 'writing academic year state')
# Add year context loading before history readiness calculations.
marker = """  const voidingAttemptRef = useRef(false);
  const wordCount = countWords(draft);"""
insert = """  const voidingAttemptRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setAcademicYearsReady(false);
    void getAcademicReportingContext(studentId)
      .then((reportingContext) => {
        if (cancelled) return;
        setAcademicYears(reportingContext.years);
        const currentYear = reportingContext.years.find((year) => year.status === 'current') || reportingContext.years[0] || null;
        setSelectedAcademicYearId(currentYear?.id || '');
        setAcademicYearsReady(true);
      })
      .catch((error) => {
        console.warn('[writing-hub] Academic year context unavailable:', error);
        if (!cancelled) setAcademicYearsReady(true);
      });
    return () => { cancelled = true; };
  }, [studentId]);

  const selectedAcademicYear = academicYears.find((year) => year.id === selectedAcademicYearId) || null;
  const isArchivedAcademicYear = Boolean(selectedAcademicYear && selectedAcademicYear.status !== 'current');
  const wordCount = countWords(draft);"""
text = replace_once(text, marker, insert, 'writing academic year context')
text = replace_once(
    text,
    """  const studentHistoryReady = hydratedForStudentId === studentId
    && hydrationStatus !== 'idle'
    && hydrationStatus !== 'loading';""",
    """  const studentHistoryReady = hydratedForStudentId === studentId
    && hydrationStatus !== 'idle'
    && hydrationStatus !== 'loading'
    && academicYearsReady;""",
    'writing history readiness',
)
old = """  const writingHistoryByGenre = useMemo(
    () => listStudentWritingHistoryByGenre(studentId),
    [studentId, hydrationStatus, assessment?.total_score, aiFeedback]
  );
  const archivedEntries = useMemo(
    () => (writingHistoryByGenre.data ?? []).flatMap((item) => item.entries),
    [writingHistoryByGenre]
  );"""
new = """  const allWritingHistoryByGenre = useMemo(
    () => listStudentWritingHistoryByGenre(studentId),
    [studentId, hydrationStatus, assessment?.total_score, aiFeedback]
  );
  const writingHistoryByGenre = useMemo(() => {
    if (!selectedAcademicYear || !allWritingHistoryByGenre.ok || !allWritingHistoryByGenre.data) {
      return allWritingHistoryByGenre;
    }
    const startsAt = Date.parse(`${selectedAcademicYear.startsOn}T00:00:00.000Z`);
    const endsAt = Date.parse(`${selectedAcademicYear.endsOn}T23:59:59.999Z`);
    return {
      ...allWritingHistoryByGenre,
      data: allWritingHistoryByGenre.data.map((item) => ({
        ...item,
        entries: item.entries.filter((entry) => {
          const createdAt = Date.parse(entry.created_at);
          return Number.isFinite(createdAt) && createdAt >= startsAt && createdAt <= endsAt;
        }),
      })),
    };
  }, [allWritingHistoryByGenre, selectedAcademicYear]);
  const archivedEntries = useMemo(
    () => (writingHistoryByGenre.data ?? []).flatMap((item) => item.entries),
    [writingHistoryByGenre]
  );"""
text = replace_once(text, old, new, 'writing year-filtered history')
text = replace_once(
    text,
    """  const sortedArchivedEntries = [...archivedEntries].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const dashboardFocusAreas = Array.from(new Set([
    ...(assessment?.weakness_tags ?? []),
    ...sortedArchivedEntries.flatMap((entry) => entry.weakness_tags),
  ])).filter(Boolean);
  const scoredHistory = sortedArchivedEntries.filter((entry) => entry.total_score != null);
  const currentDashboardScore = assessment?.total_score ?? scoredHistory[0]?.total_score ?? null;
  const priorDashboardScore = scoredHistory[assessment ? 0 : 1]?.total_score ?? null;""",
    """  const sortedArchivedEntries = [...archivedEntries].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const selectedYearAssessment = isArchivedAcademicYear ? null : assessment;
  const dashboardFocusAreas = Array.from(new Set([
    ...(selectedYearAssessment?.weakness_tags ?? []),
    ...sortedArchivedEntries.flatMap((entry) => entry.weakness_tags),
  ])).filter(Boolean);
  const scoredHistory = sortedArchivedEntries.filter((entry) => entry.total_score != null);
  const currentDashboardScore = selectedYearAssessment?.total_score ?? scoredHistory[0]?.total_score ?? null;
  const priorDashboardScore = scoredHistory[selectedYearAssessment ? 0 : 1]?.total_score ?? null;""",
    'writing selected-year dashboard',
)
# Add year selector immediately before dashboard.
marker = """      {!wizardOpen && <section className="writing-studio__card writing-studio__dashboard" aria-labelledby="writing-progress-title">"""
replacement = """      {!wizardOpen && academicYears.length > 0 && <section className="writing-studio__card" aria-label="Writing academic year">
        <div className="writing-studio__section-heading">
          <div><span>Academic Year</span><h3 style={{ margin: 0 }}>{selectedAcademicYear?.name || 'School year'}</h3></div>
          <select
            value={selectedAcademicYearId}
            onChange={(event) => setSelectedAcademicYearId(event.target.value)}
            aria-label="Writing academic year"
            style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff', color: '#0f172a', fontWeight: 700 }}
          >
            {academicYears.map((year) => <option key={year.id} value={year.id}>
              {year.name} {year.status === 'current' ? '(Current)' : '(Archived)'}
            </option>)}
          </select>
        </div>
        <p style={{ margin: 0, color: '#475569' }}>
          {isArchivedAcademicYear
            ? 'Archived · read only. Your writing, scores and feedback are preserved exactly as school-year history.'
            : 'Current academic year. New writing and live progress are recorded here.'}
        </p>
      </section>}

      {!wizardOpen && <section className="writing-studio__card writing-studio__dashboard" aria-labelledby="writing-progress-title">"""
text = replace_once(text, marker, replacement, 'writing year selector UI')
# Disable creation in archived year and make the state obvious.
text = replace_once(
    text,
    """          <button type="button" className="writing-studio__primary-button" onClick={() => {
            setRemainingSeconds(timeLimitSeconds);""",
    """          <button type="button" className="writing-studio__primary-button" disabled={isArchivedAcademicYear} onClick={() => {
            if (isArchivedAcademicYear) return;
            setRemainingSeconds(timeLimitSeconds);""",
    'writing archived create guard',
)
text = replace_once(
    text,
    """>Start a new writing task
          </button>""",
    """>{isArchivedAcademicYear ? 'Archived year — switch to current year' : 'Start a new writing task'}
          </button>""",
    'writing archived button label',
)
text = replace_once(
    text,
    """          <h3 style={{ margin: 0 }}>Writing archive</h3>
          <p style={{ margin: 0, color: '#475569' }}>All previous writing by genre with saved feedback.</p>""",
    """          <h3 style={{ margin: 0 }}>{isArchivedAcademicYear ? 'Writing archive' : 'Writing this academic year'}</h3>
          <p style={{ margin: 0, color: '#475569' }}>
            {selectedAcademicYear?.name || 'Selected year'} · {isArchivedAcademicYear ? 'Archived · read only, with saved feedback.' : 'Current-year writing and saved feedback.'}
          </p>""",
    'writing archive copy',
)
write(path, text)


# 8) Source-control the production Writing Hub academic-year migration.
migration = Path('supabase/migrations/20260828113023_scope_writing_attempts_by_academic_year.sql')
migration.write_text("""-- Writing Hub academic-year archive boundary.
-- Historical attempts are preserved and backfilled by their original timestamps.
-- New attempts follow the school's explicit current academic year, including
-- pre-term preparation windows where the current year starts in the future.

alter table public.bh_writing_attempts
  add column if not exists academic_year_id uuid;

alter table public.bh_writing_attempts
  drop constraint if exists bh_writing_attempts_academic_year_id_fkey;
alter table public.bh_writing_attempts
  add constraint bh_writing_attempts_academic_year_id_fkey
  foreign key (academic_year_id)
  references public.school_academic_years(id)
  on delete restrict;

update public.bh_writing_attempts a
set academic_year_id = public.academic_resolve_year_id(
  u.school_id,
  coalesce(
    case
      when coalesce(a.payload->>'created_at','') ~ '^\\d{4}-\\d{2}-\\d{2}'
        then (a.payload->>'created_at')::timestamptz
      else null
    end,
    a.created_at
  )
)
from public.users u
where a.academic_year_id is null
  and u.id::text = a.payload->>'student_id'
  and u.school_id is not null;

create index if not exists bh_writing_attempts_academic_year_created_idx
  on public.bh_writing_attempts(academic_year_id, created_at desc);

create or replace function private.bh_writing_attempt_assign_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_current_year_id uuid;
  v_attempt_at timestamptz;
begin
  if nullif(new.payload->>'student_id','') is null then return new; end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id::text = new.payload->>'student_id';
  if v_school_id is null then return new; end if;

  if new.academic_year_id is not null then
    if not exists (
      select 1 from public.school_academic_years y
      where y.id = new.academic_year_id and y.school_id = v_school_id
    ) then
      raise exception using errcode = '23514', message = 'writing_attempt_academic_year_school_mismatch';
    end if;
    return new;
  end if;

  select y.id into v_current_year_id
  from public.school_academic_years y
  where y.school_id = v_school_id and y.status = 'current'
  order by y.starts_on desc, y.id
  limit 1;
  if v_current_year_id is not null then
    new.academic_year_id := v_current_year_id;
    return new;
  end if;

  v_attempt_at := coalesce(
    case
      when coalesce(new.payload->>'created_at','') ~ '^\\d{4}-\\d{2}-\\d{2}'
        then (new.payload->>'created_at')::timestamptz
      else null
    end,
    new.created_at,
    now()
  );
  new.academic_year_id := public.academic_resolve_year_id(v_school_id, v_attempt_at);
  return new;
end;
$$;

revoke all on function private.bh_writing_attempt_assign_academic_year()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_bh_writing_attempt_assign_academic_year on public.bh_writing_attempts;
create trigger trg_bh_writing_attempt_assign_academic_year
before insert or update of payload, academic_year_id
on public.bh_writing_attempts
for each row execute function private.bh_writing_attempt_assign_academic_year();
""", encoding='utf-8')

print('Academic-year rollover surfaces patched successfully.')
