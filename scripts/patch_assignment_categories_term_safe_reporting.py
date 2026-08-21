from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Cannot safely patch {label}: expected source block not found.')
    return text.replace(old, new, 1)


def replace_all_expected(text: str, old: str, new: str, count: int, label: str) -> str:
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f'Cannot safely patch {label}: expected {count} matches, found {actual}.')
    return text.replace(old, new)


# ---------------------------------------------------------------------------
# Shared TypeScript contracts
# ---------------------------------------------------------------------------
path = 'types.ts'
text = read(path)
if "export type AssignmentCategory = 'classwork'" not in text:
    text = replace_once(
        text,
        "export type AssignmentBatch = SchoolBatch | 'All';",
        "export type AssignmentBatch = SchoolBatch | 'All';\nexport type AssignmentCategory = 'classwork' | 'homework' | 'quiz' | 'term_exam';",
        'types assignment category union',
    )

    summary_start = text.index('export interface TeacherAssignmentSummary')
    summary_end = text.index('\n}\n', summary_start)
    block = text[summary_start:summary_end]
    if 'assignment_category?:' not in block:
        block = replace_once(
            block,
            "  assignment_mode?: 'batch' | 'custom';",
            "  assignment_mode?: 'batch' | 'custom';\n  assignment_category?: AssignmentCategory | null;\n  academic_year_id?: string | null;\n  academic_term_id?: string | null;\n  class_id?: string | null;",
            'teacher assignment summary category fields',
        )
        text = text[:summary_start] + block + text[summary_end:]

    student_start = text.index('export interface StudentAssignmentTask')
    student_end = text.index('\n}\n', student_start)
    block = text[student_start:student_end]
    if 'assignment_category?:' not in block:
        block = replace_once(
            block,
            "  publish_status?: 'draft' | 'scheduled' | 'published';",
            "  publish_status?: 'draft' | 'scheduled' | 'published';\n  assignment_category?: AssignmentCategory | null;\n  academic_year_id?: string | null;\n  academic_term_id?: string | null;\n  class_id?: string | null;",
            'student assignment task category fields',
        )
        text = text[:student_start] + block + text[student_end:]

    request_start = text.index('export interface CreateAssignmentRequest')
    request_end = text.index('\n}\n', request_start)
    block = text[request_start:request_end]
    if 'assignment_category?:' not in block:
        block = replace_once(
            block,
            "  notify_students_by_email?: boolean;",
            "  notify_students_by_email?: boolean;\n  assignment_category?: AssignmentCategory | null;\n  client_timezone?: string;",
            'create assignment category request fields',
        )
        text = text[:request_start] + block + text[request_end:]
    write(path, text)


# ---------------------------------------------------------------------------
# Game service: pass metadata and merge category/calendar context into reads.
# ---------------------------------------------------------------------------
path = 'services/gameService.ts'
text = read(path)
if 'AssignmentCategoryContextRow' not in text:
    text = replace_all_expected(
        text,
        "        p_difficulty: payload.difficulty ?? null,\n        p_assignment_mode: mode,",
        "        p_difficulty: payload.difficulty ?? null,\n        p_assignment_category: payload.assignment_category ?? null,\n        p_client_timezone: payload.client_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',\n        p_assignment_mode: mode,",
        2,
        'game service create/update category parameters',
    )

    anchor = 'export const get_teacher_assignments = async (teacherId?: string): Promise<TeacherAssignmentSummary[]> => {'
    helper = """type AssignmentCategoryContextRow = {\n    assignment_id: string;\n    assignment_category?: TeacherAssignmentSummary['assignment_category'];\n    academic_year_id?: string | null;\n    academic_term_id?: string | null;\n    class_id?: string | null;\n};\n\nconst mergeAssignmentCategoryContext = <T extends { assignment_id?: string; id?: string }>(\n    assignments: T[],\n    contextRows: AssignmentCategoryContextRow[]\n): T[] => {\n    const context = new Map(contextRows.map((row) => [row.assignment_id, row]));\n    return assignments.map((assignment) => {\n        const assignmentId = assignment.assignment_id || assignment.id;\n        const extra = assignmentId ? context.get(assignmentId) : undefined;\n        return extra ? { ...assignment, ...extra } : assignment;\n    });\n};\n\nconst enrichStudentAssignmentsWithCategoryContext = async <T extends StudentAssignmentTask>(assignments: T[]): Promise<T[]> => {\n    const ids = assignments.map((assignment) => assignment.assignment_id).filter(Boolean);\n    if (!ids.length) return assignments;\n    const { data, error } = await supabase.rpc('rpc_my_assignment_category_context', { p_assignment_ids: ids });\n    if (error) throw new Error(error.message || 'Failed to load assignment category context');\n    return mergeAssignmentCategoryContext(assignments, (data as AssignmentCategoryContextRow[]) || []) as T[];\n};\n\n"""
    if anchor not in text:
        raise SystemExit('Cannot safely patch game service category helpers: assignment list anchor not found.')
    text = text.replace(anchor, helper + anchor, 1)

    text = replace_once(
        text,
        "    return (data as TeacherAssignmentSummary[]) || [];\n};",
        "    const assignments = (data as TeacherAssignmentSummary[]) || [];\n    const { data: contextData, error: contextError } = await supabase.rpc('rpc_teacher_assignment_category_context', { p_teacher_id: resolvedTeacherId });\n    if (contextError) throw new Error(contextError.message || 'Failed to load assignment category context');\n    return mergeAssignmentCategoryContext(assignments, (contextData as AssignmentCategoryContextRow[]) || []) as TeacherAssignmentSummary[];\n};",
        'teacher assignment context merge',
    )

    text = replace_once(
        text,
        "    return {\n        ...parsedRow,\n        questions: normalizedQuestions,\n    };\n};\n\n// ── Brains Master Premium",
        "    const enriched = await enrichStudentAssignmentsWithCategoryContext([{\n        ...parsedRow,\n        questions: normalizedQuestions,\n    }]);\n    return enriched[0] || null;\n};\n\n// ── Brains Master Premium",
        'active student assignment category merge',
    )

    pending_old = """    return rows.map((row) => {\n        const parsedRow = row as StudentAssignmentTask;\n        const normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map(normalizeTeacherQuestionPayload);\n        return {\n            ...parsedRow,\n            questions: normalizedQuestions,\n        };\n    });"""
    pending_new = """    const normalizedAssignments = rows.map((row) => {\n        const parsedRow = row as StudentAssignmentTask;\n        const normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map(normalizeTeacherQuestionPayload);\n        return {\n            ...parsedRow,\n            questions: normalizedQuestions,\n        };\n    });\n    return enrichStudentAssignmentsWithCategoryContext(normalizedAssignments);"""
    text = replace_once(text, pending_old, pending_new, 'pending student assignment category merge')
    write(path, text)


# ---------------------------------------------------------------------------
# Teacher portal state + payload + Assignment Wizard wiring.
# ---------------------------------------------------------------------------
path = 'components/TeacherPortal.tsx'
text = read(path)
if 'const [assignmentCategory, setAssignmentCategory]' not in text:
    text = replace_once(
        text,
        "AssignmentQuestionAnalysis, AssignmentBatch } from '../types';",
        "AssignmentQuestionAnalysis, AssignmentBatch, AssignmentCategory } from '../types';",
        'teacher portal assignment category import',
    )
    text = replace_once(
        text,
        "  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');",
        "  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');\n  const [assignmentCategory, setAssignmentCategory] = useState<AssignmentCategory | null>(null);",
        'teacher portal assignment category state',
    )
    text = replace_once(
        text,
        "    setAssignmentPublishStatus('published');\n    setAssignmentCloseAfterDue(false);",
        "    setAssignmentPublishStatus('published');\n    setAssignmentCategory(null);\n    setAssignmentCloseAfterDue(false);",
        'teacher portal assignment category reset',
    )
    text = replace_once(
        text,
        "    setAssignmentPublishStatus(assignment.publish_status || (new Date(assignment.assigned_at).getTime() > Date.now() ? 'scheduled' : 'published'));\n    setAssignmentCloseAfterDue(Boolean(assignment.close_submissions_after_due));",
        "    setAssignmentPublishStatus(assignment.publish_status || (new Date(assignment.assigned_at).getTime() > Date.now() ? 'scheduled' : 'published'));\n    setAssignmentCategory(assignment.assignment_category ?? null);\n    setAssignmentCloseAfterDue(Boolean(assignment.close_submissions_after_due));",
        'teacher portal edit category hydration',
    )
    text = replace_once(
        text,
        "        difficulty: assignmentDifficulty,\n        publish_status: publishStatus,",
        "        difficulty: assignmentDifficulty,\n        assignment_category: assignmentCategory,\n        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',\n        publish_status: publishStatus,",
        'teacher portal category payload',
    )

    save_pattern = re.compile(r"(const saveAssignment = async \(publishStatus: 'draft' \| 'scheduled' \| 'published', e\?: React\.FormEvent\) => \{\n)")
    if not save_pattern.search(text):
        raise SystemExit('Cannot safely patch teacher portal publish category guard: saveAssignment signature not found.')
    text = save_pattern.sub(
        r"\1    if (publishStatus !== 'draft' && !assignmentCategory) { brainsAlert('Choose Classwork, Homework, Quiz, or Term Exam before publishing.', 'error'); return; }\n",
        text,
        count=1,
    )

    text = replace_once(
        text,
        "          assignmentPublishStatus={assignmentPublishStatus}\n          setAssignmentPublishStatus={setAssignmentPublishStatus}",
        "          assignmentPublishStatus={assignmentPublishStatus}\n          setAssignmentPublishStatus={setAssignmentPublishStatus}\n          assignmentCategory={assignmentCategory}\n          setAssignmentCategory={setAssignmentCategory}\n          schoolId={profile.school_id || undefined}",
        'teacher portal wizard category props',
    )
    write(path, text)


# ---------------------------------------------------------------------------
# Assignment Wizard: category chooser + school calendar aware scheduling.
# ---------------------------------------------------------------------------
path = 'components/teacher/AssignmentWizard.tsx'
text = read(path)
if 'assignmentCategory: AssignmentCategory | null;' not in text:
    text = replace_once(
        text,
        "import type { QuestionDifficulty, QuestionType, StudentForAssignment, Subject, TeacherQuestion } from '../../types';",
        "import type { AssignmentCategory, QuestionDifficulty, QuestionType, StudentForAssignment, Subject, TeacherQuestion } from '../../types';\nimport { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../../services/schoolAcademicSetupService';\nimport { ASSIGNMENT_CATEGORY_META, getAssignmentCategoryMeta } from '../../src/lib/assignmentCategory';",
        'assignment wizard category imports',
    )
    text = replace_once(
        text,
        "  setAssignmentPublishStatus: (value: 'draft' | 'scheduled' | 'published') => void;",
        "  setAssignmentPublishStatus: (value: 'draft' | 'scheduled' | 'published') => void;\n  assignmentCategory: AssignmentCategory | null;\n  setAssignmentCategory: (value: AssignmentCategory | null) => void;\n  schoolId?: string;",
        'assignment wizard category props',
    )
    text = replace_once(
        text,
        "const isPastDueDate = (value: string) => {\n  if (!value) return false;\n  const due = new Date(value);\n  return Number.isNaN(due.getTime()) || due.getTime() <= Date.now();\n};",
        "const isPastDueDate = (value: string) => {\n  if (!value) return false;\n  const due = new Date(value);\n  return Number.isNaN(due.getTime()) || due.getTime() <= Date.now();\n};\n\nconst localDateKey = (date = new Date()) => {\n  const year = date.getFullYear();\n  const month = String(date.getMonth() + 1).padStart(2, '0');\n  const day = String(date.getDate()).padStart(2, '0');\n  return `${year}-${month}-${day}`;\n};",
        'assignment wizard local date helper',
    )
    text = replace_once(
        text,
        "  assignmentPublishStatus,\n  setAssignmentPublishStatus,\n  assignmentCloseAfterDue,",
        "  assignmentPublishStatus,\n  setAssignmentPublishStatus,\n  assignmentCategory,\n  setAssignmentCategory,\n  schoolId,\n  assignmentCloseAfterDue,",
        'assignment wizard category destructuring',
    )
    text = replace_once(
        text,
        "  const [reviewConfirmed, setReviewConfirmed] = useState(false);\n  const wizardTopRef = useRef<HTMLDivElement>(null);",
        "  const [reviewConfirmed, setReviewConfirmed] = useState(false);\n  const [academicSetup, setAcademicSetup] = useState<SchoolAcademicSetup | null>(null);\n  const [academicSetupLoading, setAcademicSetupLoading] = useState(false);\n  const wizardTopRef = useRef<HTMLDivElement>(null);\n\n  useEffect(() => {\n    if (!schoolId) { setAcademicSetup(null); return; }\n    let cancelled = false;\n    setAcademicSetupLoading(true);\n    void fetchSchoolAcademicSetup(schoolId)\n      .then((setup) => { if (!cancelled) setAcademicSetup(setup); })\n      .catch((error) => { console.error('Failed to load academic calendar for assignment scheduling', error); if (!cancelled) setAcademicSetup(null); })\n      .finally(() => { if (!cancelled) setAcademicSetupLoading(false); });\n    return () => { cancelled = true; };\n  }, [schoolId]);\n\n  const scheduleWindow = useMemo(() => {\n    if (!academicSetup) return null;\n    const today = localDateKey();\n    const year = academicSetup.years.find((item) => item.status === 'current' && today >= item.startsOn && today <= item.endsOn);\n    if (!year) return null;\n    const term = academicSetup.terms.find((item) => item.academicYearId === year.id && today >= item.startsOn && today <= item.endsOn);\n    return term ? { year, term } : null;\n  }, [academicSetup]);\n\n  const scheduledDateKey = assignmentAssignedAt ? assignmentAssignedAt.slice(0, 10) : '';\n  const scheduledOutsideCurrentTerm = assignmentPublishStatus === 'scheduled' && Boolean(scheduleWindow) && Boolean(scheduledDateKey) && (scheduledDateKey < scheduleWindow!.term.startsOn || scheduledDateKey > scheduleWindow!.term.endsOn);",
        'assignment wizard academic schedule state',
    )
    text = replace_once(
        text,
        "    if (currentStep === 4 && !assignmentTitle.trim()) {\n      return brainsAlert('Add an assignment title before continuing.', 'info');\n    }",
        "    if (currentStep === 4 && !assignmentTitle.trim()) {\n      return brainsAlert('Add an assignment title before continuing.', 'info');\n    }\n    if (currentStep === 4 && !assignmentCategory) {\n      return brainsAlert('Choose whether this is Classwork, Homework, Quiz, or Term Exam.', 'info');\n    }",
        'assignment wizard category validation',
    )
    text = replace_once(
        text,
        "    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && (!assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {\n      return brainsAlert('Choose a future publication date and time.', 'error');\n    }",
        "    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && (!assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {\n      return brainsAlert('Choose a future publication date and time in your local timezone.', 'error');\n    }\n    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && !scheduleWindow) {\n      return brainsAlert('Scheduling requires the school admin to configure the current academic year and term.', 'error');\n    }\n    if (currentStep === 5 && scheduledOutsideCurrentTerm) {\n      return brainsAlert(`Schedule this assignment inside ${scheduleWindow?.term.name || 'the current term'} of ${scheduleWindow?.year.name || 'the current academic year'}.`, 'error');\n    }",
        'assignment wizard schedule term validation',
    )
    text = replace_once(
        text,
        "    if (!assignmentTitle.trim()) {\n      brainsAlert('Assignment title is required.', 'info');\n      goToStep(4);\n      return;\n    }",
        "    if (!assignmentTitle.trim()) {\n      brainsAlert('Assignment title is required.', 'info');\n      goToStep(4);\n      return;\n    }\n    if (!assignmentCategory) {\n      brainsAlert('Choose Classwork, Homework, Quiz, or Term Exam before publishing.', 'info');\n      goToStep(4);\n      return;\n    }\n    if (assignmentPublishStatus === 'scheduled' && (!scheduleWindow || scheduledOutsideCurrentTerm || !assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {\n      brainsAlert('Scheduled publication must be a future local time inside the current academic term and year.', 'error');\n      goToStep(5);\n      return;\n    }",
        'assignment wizard submit category schedule validation',
    )
    text = replace_once(
        text,
        "              <label><span>Assignment title <strong aria-hidden=\"true\">*</strong></span><input required aria-required=\"true\" value={assignmentTitle} onChange={(event) => { setAssignmentTitle(event.target.value); setReviewConfirmed(false); }} placeholder=\"e.g. Fractions confidence check\" /><small>Required. This is the name students and reports will show.</small></label>\n              <label><span>Description</span>",
        "              <label><span>Assignment title <strong aria-hidden=\"true\">*</strong></span><input required aria-required=\"true\" value={assignmentTitle} onChange={(event) => { setAssignmentTitle(event.target.value); setReviewConfirmed(false); }} placeholder=\"e.g. Fractions confidence check\" /><small>Required. This is the name students and reports will show.</small></label>\n              <fieldset className=\"grid gap-2\"><legend className=\"text-sm font-bold text-slate-700\">Assignment type <strong aria-hidden=\"true\">*</strong></legend><div className=\"grid gap-2 sm:grid-cols-2\" role=\"radiogroup\" aria-label=\"Assignment type\">{(Object.keys(ASSIGNMENT_CATEGORY_META) as AssignmentCategory[]).map((category) => { const meta = ASSIGNMENT_CATEGORY_META[category]; const selected = assignmentCategory === category; return <button key={category} type=\"button\" role=\"radio\" aria-checked={selected} onClick={() => { setAssignmentCategory(category); setReviewConfirmed(false); }} className={`rounded-xl border px-4 py-3 text-left transition ${selected ? 'ring-2 ring-slate-700 ring-offset-1' : 'hover:shadow-sm'}`} style={{ backgroundColor: meta.background, borderColor: meta.border, color: meta.text }}><strong className=\"block\">{meta.label}</strong><small>{category === 'classwork' ? 'Work completed during class' : category === 'homework' ? 'Work completed outside class' : category === 'quiz' ? 'Short assessment or knowledge check' : 'Formal assessment for the current term'}</small></button>; })}</div><small className=\"text-slate-500\">The type is reporting metadata only; it does not change marks, XP, rewards, or completion rules.</small></fieldset>\n              <label><span>Description</span>",
        'assignment wizard category chooser',
    )
    text = replace_once(
        text,
        "                {assignmentPublishStatus === 'scheduled' ? <label className=\"aw-custom-date\"><span>Publish at</span><input type=\"datetime-local\" min={localDateTimeValue()} value={assignmentAssignedAt} onChange={(event) => setAssignmentAssignedAt(event.target.value)} /></label> : null}",
        "                {assignmentPublishStatus === 'scheduled' ? <label className=\"aw-custom-date\"><span>Publish at</span><input type=\"datetime-local\" min={localDateTimeValue()} max={scheduleWindow ? `${scheduleWindow.term.endsOn}T23:59` : undefined} value={assignmentAssignedAt} aria-invalid={scheduledOutsideCurrentTerm || (!academicSetupLoading && !scheduleWindow)} onChange={(event) => setAssignmentAssignedAt(event.target.value)} />{academicSetupLoading ? <small>Checking the school calendar…</small> : scheduleWindow ? <small>Scheduling is limited to {scheduleWindow.term.name} ({scheduleWindow.term.startsOn}–{scheduleWindow.term.endsOn}) in {scheduleWindow.year.name}.</small> : <small className=\"aw-field-error\">The school admin must configure a current academic year and term before assignments can be scheduled.</small>}{scheduledOutsideCurrentTerm ? <small className=\"aw-field-error\">Choose a publication time inside the current term.</small> : null}</label> : null}",
        'assignment wizard scheduled date bounds',
    )
    text = replace_once(
        text,
        "                ['Subject', assignmentSubject, 1],\n                ['Audience'",
        "                ['Subject', assignmentSubject, 1],\n                ['Assignment type', getAssignmentCategoryMeta(assignmentCategory).label, 4],\n                ['Audience'",
        'assignment wizard review category row',
    )
    write(path, text)


# ---------------------------------------------------------------------------
# Student assignment card badge.
# ---------------------------------------------------------------------------
path = 'App.tsx'
text = read(path)
if 'getAssignmentCategoryMeta' not in text:
    text = replace_once(
        text,
        "import { enrollInApprovedSchoolClass, listMySchoolClasses, type ApprovedSignupClass } from './services/authService';",
        "import { enrollInApprovedSchoolClass, listMySchoolClasses, type ApprovedSignupClass } from './services/authService';\nimport { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from './src/lib/assignmentCategory';",
        'student assignment category helper import',
    )
    text = replace_once(
        text,
        "            const dueLabel = assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No deadline';\n            const statusLabel = assignment.is_closed ? 'Closed' : assignment.is_late ? 'Late · still open' : 'Ready';",
        "            const dueLabel = assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No deadline';\n            const statusLabel = assignment.is_closed ? 'Closed' : assignment.is_late ? 'Late · still open' : 'Ready';\n            const categoryMeta = getAssignmentCategoryMeta(assignment.assignment_category);",
        'student assignment category badge data',
    )
    text = replace_once(
        text,
        "                    <span className=\"block text-sm font-black text-white\">{assignment.title || assignment.topic_name || 'New assignment'}</span>\n                    <span className=\"mt-1 block text-xs text-slate-400\">",
        "                    <span className=\"block text-sm font-black text-white\">{assignment.title || assignment.topic_name || 'New assignment'}</span>\n                    <span className=\"mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide\" style={assignmentCategoryBadgeStyle(assignment.assignment_category)}>{categoryMeta.label}</span>\n                    <span className=\"mt-1 block text-xs text-slate-400\">",
        'student assignment category badge render',
    )
    write(path, text)


# ---------------------------------------------------------------------------
# Collective report: one class, current term/year, category filter, readable grid.
# ---------------------------------------------------------------------------
path = 'components/CollectiveAssignmentReport.tsx'
text = read(path)
if 'categoryFilter' not in text:
    text = replace_once(
        text,
        "import { TeacherAssignmentSummary, TeacherAssignmentReportRow, Subject, StudentForAssignment } from '../types';",
        "import { TeacherAssignmentSummary, TeacherAssignmentReportRow, Subject, StudentForAssignment, AssignmentCategory } from '../types';\nimport { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../services/schoolAcademicSetupService';\nimport { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from '../src/lib/assignmentCategory';",
        'collective report category/calendar imports',
    )
    text = replace_once(
        text,
        "  assignments: Array<{ id: string; title: string; subject: string; date?: string }>;
",
        "  assignments: Array<{ id: string; title: string; subject: string; date?: string; category?: AssignmentCategory | null }>;
",
        'collective report export category type',
    )
    text = replace_once(
        text,
        "  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');\n  const [batchFilter, setBatchFilter] = useState<string>('all');",
        "  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');\n  const [batchFilter, setBatchFilter] = useState<string>('');\n  const [categoryFilter, setCategoryFilter] = useState<'all' | AssignmentCategory>('all');\n  const [academicSetup, setAcademicSetup] = useState<SchoolAcademicSetup | null>(null);\n  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');\n  const [selectedTermId, setSelectedTermId] = useState('');\n  const [periodMode, setPeriodMode] = useState<'term' | 'custom'>('term');",
        'collective report filter state',
    )
    calendar_insert = """\n  const localDateKey = useCallback((date = new Date()) => {\n    const year = date.getFullYear();\n    const month = String(date.getMonth() + 1).padStart(2, '0');\n    const day = String(date.getDate()).padStart(2, '0');\n    return `${year}-${month}-${day}`;\n  }, []);\n\n  useEffect(() => {\n    if (!school.id) return;\n    let cancelled = false;\n    void fetchSchoolAcademicSetup(school.id).then((setup) => {\n      if (cancelled) return;\n      setAcademicSetup(setup);\n      const today = localDateKey();\n      const currentYear = setup.years.find((item) => item.status === 'current' && today >= item.startsOn && today <= item.endsOn) || setup.years.find((item) => item.status === 'current');\n      if (!currentYear) return;\n      setSelectedAcademicYearId(currentYear.id);\n      setAcademicYear(currentYear.name);\n      const yearTerms = setup.terms.filter((item) => item.academicYearId === currentYear.id).sort((a, b) => a.sequence - b.sequence);\n      const currentTerm = yearTerms.find((item) => today >= item.startsOn && today <= item.endsOn) || yearTerms.find((item) => item.startsOn <= today) || yearTerms[0];\n      if (currentTerm) {\n        setSelectedTermId(currentTerm.id);\n        setTerm(currentTerm.name);\n        setDateFrom(currentTerm.startsOn);\n        setDateTo(currentTerm.endsOn);\n      }\n    }).catch((error) => console.error('Failed to load academic calendar for collective report', error));\n    return () => { cancelled = true; };\n  }, [localDateKey, school.id]);\n\n  const selectedAcademicYear = useMemo(() => academicSetup?.years.find((item) => item.id === selectedAcademicYearId) || null, [academicSetup, selectedAcademicYearId]);\n  const academicYearTerms = useMemo(() => (academicSetup?.terms || []).filter((item) => item.academicYearId === selectedAcademicYearId).sort((a, b) => a.sequence - b.sequence), [academicSetup, selectedAcademicYearId]);\n  const selectedAcademicTerm = useMemo(() => academicYearTerms.find((item) => item.id === selectedTermId) || null, [academicYearTerms, selectedTermId]);\n\n  useEffect(() => {\n    if (periodMode !== 'term' || !selectedAcademicTerm) return;\n    setTerm(selectedAcademicTerm.name);\n    setDateFrom(selectedAcademicTerm.startsOn);\n    setDateTo(selectedAcademicTerm.endsOn);\n  }, [periodMode, selectedAcademicTerm]);\n"""
    marker = "  // ── Fetch all data on mount ──────────────────────────────────────────────"
    if marker not in text:
        raise SystemExit('Cannot safely patch collective report academic calendar: fetch marker not found.')
    text = text.replace(marker, calendar_insert + '\n' + marker, 1)

    old_filter = """    return assignments.filter((assignment) => {\n      if (!selectedAssignmentIds.includes(assignment.id)) return false;\n      if (subjectFilter !== 'all' && assignment.subject_name !== subjectFilter) return false;\n      if (batchFilter !== 'all') {\n        const assignmentClass = assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || 'Unspecified';\n        if (assignmentClass !== batchFilter) return false;\n      }\n      const created = new Date(assignment.assigned_at).getTime();\n      if (from !== null && created < from) return false;\n      if (to !== null && created > to) return false;\n      return true;\n    });\n  }, [assignments, selectedAssignmentIds, subjectFilter, batchFilter, dateFrom, dateTo]);"""
    new_filter = """    return assignments.filter((assignment) => {\n      if (!selectedAssignmentIds.includes(assignment.id)) return false;\n      if (!batchFilter) return false;\n      if (subjectFilter !== 'all' && assignment.subject_name !== subjectFilter) return false;\n      if (categoryFilter !== 'all' && assignment.assignment_category !== categoryFilter) return false;\n      const classMatches = assignment.assignment_mode === 'custom'\n        ? (assignment.student_ids || []).some((studentId) => students.some((student) => student.id === studentId && student.batch === batchFilter))\n          || (reportData[assignment.id] || []).some((row) => row.batch === batchFilter)\n        : assignment.batch === batchFilter;\n      if (!classMatches) return false;\n      if (selectedAcademicYearId && assignment.academic_year_id && assignment.academic_year_id !== selectedAcademicYearId) return false;\n      if (periodMode === 'term' && selectedTermId && assignment.academic_term_id && assignment.academic_term_id !== selectedTermId) return false;\n      const created = new Date(assignment.assigned_at).getTime();\n      if (from !== null && created < from) return false;\n      if (to !== null && created > to) return false;\n      return true;\n    });\n  }, [assignments, selectedAssignmentIds, subjectFilter, batchFilter, categoryFilter, dateFrom, dateTo, periodMode, reportData, selectedAcademicYearId, selectedTermId, students]);"""
    text = replace_once(text, old_filter, new_filter, 'collective report scoped assignment filter')
    text = replace_once(
        text,
        "    if (batchFilter !== 'all' && batchFilter !== 'Selected students') {\n      rows = rows.filter((r) => r.batch === batchFilter);\n    }",
        "    if (batchFilter) {\n      rows = rows.filter((r) => r.batch === batchFilter);\n    }",
        'collective report single class student filter',
    )
    old_batches = """  const uniqueBatches = useMemo(() => {\n    const batches = new Set(allocatedClassCodes.filter(Boolean));\n    assignments.forEach((assignment) => {\n      batches.add(assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || 'Unspecified');\n    });\n    return Array.from(batches).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));\n  }, [assignments, allocatedClassCodes]);"""
    new_batches = """  const uniqueBatches = useMemo(() => {\n    const batches = new Set(allocatedClassCodes.filter((value) => Boolean(value) && value !== 'All'));\n    assignments.forEach((assignment) => { if (assignment.assignment_mode !== 'custom' && assignment.batch && assignment.batch !== 'All') batches.add(assignment.batch); });\n    students.forEach((student) => { if (student.batch) batches.add(student.batch); });\n    return Array.from(batches).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));\n  }, [assignments, allocatedClassCodes, students]);\n\n  useEffect(() => {\n    if (!uniqueBatches.length) { setBatchFilter(''); return; }\n    if (!batchFilter || !uniqueBatches.includes(batchFilter)) setBatchFilter(uniqueBatches[0]);\n  }, [batchFilter, uniqueBatches]);"""
    text = replace_once(text, old_batches, new_batches, 'collective report available class list')
    text = replace_once(
        text,
        "      assignments: filteredAssignments.map(a => ({ id: a.id, title: a.title || a.topic_name, subject: a.subject_name, date: a.assigned_at })),",
        "      assignments: filteredAssignments.map(a => ({ id: a.id, title: a.title || a.topic_name, subject: a.subject_name, date: a.assigned_at, category: a.assignment_category })),",
        'collective report export category',
    )

    class_block_pattern = re.compile(r"        /\* Class filter \*/.*?        <label className=\"flex items-center gap-2 text-xs text-slate-500\">\n          From.*?</label>\n", re.S)
    match = class_block_pattern.search(text)
    if not match:
        raise SystemExit('Cannot safely patch collective report filter controls: class/date block not found.')
    controls = """        {/* Class is always required: Collective Report never combines classes. */}\n        {uniqueBatches.length > 0 && (\n          <label className=\"grid gap-1 text-xs font-bold text-slate-500\">Class<select aria-label=\"Filter by class\" value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)} className=\"rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:border-cyan-500\">{uniqueBatches.map((value) => <option key={value} value={value}>Class {value}</option>)}</select></label>\n        )}\n        {academicSetup && (\n          <label className=\"grid gap-1 text-xs font-bold text-slate-500\">Academic year<select aria-label=\"Academic year\" value={selectedAcademicYearId} onChange={(event) => { const yearId = event.target.value; setSelectedAcademicYearId(yearId); const year = academicSetup.years.find((item) => item.id === yearId); setAcademicYear(year?.name || ''); const terms = academicSetup.terms.filter((item) => item.academicYearId === yearId).sort((a, b) => a.sequence - b.sequence); const nextTerm = terms[0]; setSelectedTermId(nextTerm?.id || ''); setTerm(nextTerm?.name || ''); if (nextTerm) { setDateFrom(nextTerm.startsOn); setDateTo(nextTerm.endsOn); } }} className=\"rounded-lg border border-slate-300 text-sm px-3 py-2\">{academicSetup.years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.status === 'current' ? ' · Current' : ''}</option>)}</select></label>\n        )}\n        <label className=\"grid gap-1 text-xs font-bold text-slate-500\">Period<select aria-label=\"Reporting period\" value={periodMode === 'custom' ? 'custom' : selectedTermId} onChange={(event) => { if (event.target.value === 'custom') { setPeriodMode('custom'); setTerm('Custom dates'); } else { setPeriodMode('term'); setSelectedTermId(event.target.value); } }} className=\"rounded-lg border border-slate-300 text-sm px-3 py-2\">{academicYearTerms.map((item) => <option key={item.id} value={item.id}>{item.name}{selectedAcademicTerm?.id === item.id && localDateKey() >= item.startsOn && localDateKey() <= item.endsOn ? ' · Current' : ''}</option>)}<option value=\"custom\">Custom dates</option></select></label>\n        <label className=\"grid gap-1 text-xs font-bold text-slate-500\">Assignment type<select aria-label=\"Assignment type\" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'all' | AssignmentCategory)} className=\"rounded-lg border border-slate-300 text-sm px-3 py-2\"><option value=\"all\">All types</option><option value=\"classwork\">Classwork</option><option value=\"homework\">Homework</option><option value=\"quiz\">Quiz</option><option value=\"term_exam\">Term Exam</option></select></label>\n        {periodMode === 'custom' ? <><label className=\"flex items-center gap-2 text-xs text-slate-500\">From<input aria-label=\"Created from\" type=\"date\" min={selectedAcademicYear?.startsOn} max={selectedAcademicYear?.endsOn} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className=\"rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700\" /></label><label className=\"flex items-center gap-2 text-xs text-slate-500\">To<input aria-label=\"Created to\" type=\"date\" min={selectedAcademicYear?.startsOn} max={selectedAcademicYear?.endsOn} value={dateTo} onChange={(event) => setDateTo(event.target.value)} className=\"rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700\" /></label></> : null}\n"""
    text = text[:match.start()] + controls + text[match.end():]
    # Remove the original trailing To field if the regex only consumed From.
    text = re.sub(r"\n        <label className=\"flex items-center gap-2 text-xs text-slate-500\">\n          To\n          <input aria-label=\"Created to\".*?</label>\n", '\n', text, count=1, flags=re.S)

    text = text.replace("batchFilter !== 'all'", "Boolean(batchFilter)")
    text = text.replace("setBatchFilter('all');", "setBatchFilter(uniqueBatches[0] || '');")
    text = text.replace("batchFilter !== 'all' ? <button onClick={() => setBatchFilter('all')}>Class {batchFilter} ×</button> : null", "batchFilter ? <span>Class {batchFilter}</span> : null")

    text = replace_once(
        text,
        "<label className=\"collective-builder-field\"><span>Academic year</span><input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} maxLength={30} /></label><label className=\"collective-builder-field\"><span>Term <small>optional</small></span><input value={term} onChange={(event) => setTerm(event.target.value)} maxLength={40} /></label>",
        "<label className=\"collective-builder-field\"><span>Academic year</span><input value={academicYear} readOnly /></label><label className=\"collective-builder-field\"><span>Term / period</span><input value={term} readOnly /></label>",
        'collective report source-of-truth report fields',
    )
    text = replace_once(
        text,
        "<table className=\"collective-results-table text-left text-sm\">",
        "<table className={`collective-results-table text-left text-sm ${isCustomMode ? 'is-custom-order' : ''}`}",
        'collective report table custom order class',
    )
    text = replace_once(
        text,
        "className=\"collective-results-class-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none\"",
        "className=\"collective-results-class-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none bg-slate-100 z-20\"",
        'collective report sticky class header',
    )
    text = replace_once(
        text,
        "                      <div className=\"flex flex-col items-center gap-0.5\">\n                        <span className=\"text-[10px] font-medium text-slate-400 uppercase tracking-wider\">{a.subject_name}</span>",
        "                      <div className=\"flex flex-col items-center gap-1\">\n                        <span className=\"rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide\" style={assignmentCategoryBadgeStyle(a.assignment_category)}>{getAssignmentCategoryMeta(a.assignment_category).label}</span>\n                        <span className=\"text-[10px] font-medium text-slate-500 uppercase tracking-wider\">{a.subject_name}</span>",
        'collective report category header badge',
    )
    text = replace_all_expected(
        text,
        "className=\"collective-results-class-cell py-3 px-2 text-slate-600\"",
        "className=\"collective-results-class-cell py-3 px-2 text-slate-600 bg-inherit z-10\"",
        1,
        'collective report sticky class body',
    )
    text = text.replace('collective-results-summary-cell py-3 px-2 text-center text-slate-600 text-xs font-semibold', 'collective-results-summary-cell collective-results-completion-cell py-3 px-2 text-center text-slate-600 text-xs font-semibold', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-center bg-slate-50/50', 'collective-results-summary-cell collective-results-average-cell py-3 px-2 text-center bg-slate-50/95', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-center text-slate-600 text-xs', 'collective-results-summary-cell collective-results-status-cell py-3 px-2 text-center text-slate-600 text-xs bg-inherit', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-slate-700 font-semibold text-center">Completion', 'collective-results-summary-cell collective-results-completion-cell py-3 px-2 text-slate-700 font-semibold text-center bg-slate-100">Completion', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer', 'collective-results-summary-cell collective-results-average-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer', 1)
    text = text.replace('collective-results-summary-cell py-3 px-2 text-slate-700 font-semibold text-center">\n                    Status', 'collective-results-summary-cell collective-results-status-cell py-3 px-2 text-slate-700 font-semibold text-center bg-slate-100">\n                    Status', 1)
    write(path, text)


# CSS for readable large assignment matrices + frozen identity/summary columns.
path = 'components/CollectiveAssignmentReport.css'
text = read(path)
if 'min-width:140px' not in text:
    old = ".collective-results-table-wrap{width:100%;max-width:100%;overflow:hidden}\n.collective-results-table{width:100%;table-layout:fixed;border-collapse:collapse}\n.collective-results-table col.collective-results-col--drag{width:4%}\n.collective-results-table col.collective-results-col--student{width:18%}\n.collective-results-table col.collective-results-col--class{width:8%}\n.collective-results-table col.collective-results-col--completion{width:9%}\n.collective-results-table col.collective-results-col--average{width:9%}\n.collective-results-table col.collective-results-col--status{width:11%}\n.collective-results-table th,.collective-results-table td{min-width:0;overflow-wrap:anywhere}"
    new = ".collective-results-table-wrap{width:100%;max-width:100%;overflow-x:auto;overflow-y:visible;position:relative}\n.collective-results-table{width:max-content;min-width:100%;table-layout:auto;border-collapse:separate;border-spacing:0}\n.collective-results-table col.collective-results-col--drag{width:44px}\n.collective-results-table col.collective-results-col--student{width:220px}\n.collective-results-table col.collective-results-col--class{width:90px}\n.collective-results-table col.collective-results-col--completion{width:100px}\n.collective-results-table col.collective-results-col--average{width:90px}\n.collective-results-table col.collective-results-col--status{width:120px}\n.collective-results-table th,.collective-results-table td{overflow-wrap:anywhere}\n.collective-results-assignment-cell{min-width:140px;width:140px}\n.collective-results-student-cell{position:sticky;left:0;min-width:220px;width:220px}\n.collective-results-class-cell{position:sticky;left:220px;min-width:90px;width:90px}\n.collective-results-table.is-custom-order .collective-results-student-cell{left:44px}\n.collective-results-table.is-custom-order .collective-results-class-cell{left:264px}\n.collective-results-completion-cell{min-width:100px;width:100px}\n.collective-results-average-cell{position:sticky;right:120px;min-width:90px;width:90px;z-index:12}\n.collective-results-status-cell{position:sticky;right:0;min-width:120px;width:120px;z-index:12}\n.collective-results-table thead .collective-results-average-cell,.collective-results-table thead .collective-results-status-cell{z-index:30}"
    text = replace_once(text, old, new, 'collective report large matrix CSS')
    text += "\n@media print{.collective-results-student-cell,.collective-results-class-cell,.collective-results-average-cell,.collective-results-status-cell{position:static!important}.collective-results-table-wrap{overflow:visible!important}}\n"
    write(path, text)


# ---------------------------------------------------------------------------
# Assignment emails: render category on initial + lifecycle emails.
# ---------------------------------------------------------------------------
path = 'supabase/functions/school_email_dispatcher/index.ts'
text = read(path)
if 'const assignmentCategoryLabel' not in text:
    text = replace_once(
        text,
        "const sha256 = async (value: string) => {",
        "const assignmentCategoryLabel = (value: unknown) => {\n  switch (cleanText(value, 40).toLowerCase()) {\n    case 'classwork': return 'Classwork';\n    case 'homework': return 'Homework';\n    case 'quiz': return 'Quiz';\n    case 'term_exam': return 'Term Exam';\n    default: return 'Uncategorized';\n  }\n};\nconst sha256 = async (value: string) => {",
        'email assignment category formatter',
    )
    text = replace_once(
        text,
        "  const subjectName = cleanText(payload.subject, 100);",
        "  const subjectName = cleanText(payload.subject, 100);\n  const assignmentCategory = assignmentCategoryLabel(payload.assignment_category);",
        'transactional email category value',
    )
    for label, old in [
        ('result ready', "details: [{ label: \"Assignment\", value: title || \"Assignment\" }, { label: \"Subject\", value: subjectName }],"),
        ('submission received', "details: [{ label: \"Assignment\", value: title || \"Assignment\" }, { label: \"Subject\", value: subjectName }],"),
        ('due reminder', "details: [{ label: \"Assignment\", value: title || \"Assignment\" }, { label: \"Subject\", value: subjectName }, { label: \"Due\", value: fmt(payload.due_at) }],"),
        ('assignment updated', "details: [{ label: \"Assignment\", value: title || \"Assignment\" }, { label: \"Subject\", value: subjectName }, { label: \"Due\", value: fmt(payload.due_at) }],"),
        ('assignment cancelled', "details: [{ label: \"Assignment\", value: title || \"Assignment\" }, { label: \"Subject\", value: subjectName }],"),
    ]:
        if old in text:
            if 'Due' in old:
                new = old.replace('{ label: "Subject", value: subjectName },', '{ label: "Subject", value: subjectName }, { label: "Type", value: assignmentCategory },')
            else:
                new = old.replace('{ label: "Subject", value: subjectName }', '{ label: "Subject", value: subjectName }, { label: "Type", value: assignmentCategory }')
            text = text.replace(old, new, 1)
        else:
            raise SystemExit(f'Cannot safely patch assignment email {label}: detail block not found.')
    text = replace_once(
        text,
        '.select("id,teacher_id,school_id,title,subject_name,subject_id,description,assigned_at,due_at,publish_status,notify_students_by_email")',
        '.select("id,teacher_id,school_id,title,subject_name,subject_id,description,assignment_category,assigned_at,due_at,publish_status,notify_students_by_email")',
        'initial assignment email category select',
    )
    text = replace_once(
        text,
        "        const subjectName = cleanText(assignment.subject_name || assignment.subject_id, 100) || \"School assignment\";\n        const rendered = renderBrandedEmail(school, {",
        "        const subjectName = cleanText(assignment.subject_name || assignment.subject_id, 100) || \"School assignment\";\n        const categoryName = assignmentCategoryLabel(assignment.assignment_category);\n        const rendered = renderBrandedEmail(school, {",
        'initial assignment email category value',
    )
    text = replace_once(
        text,
        "          intro: `Hi ${studentName}, ${teacherName} has published a ${subjectName} assignment for you.`,\n          details: [{ label: \"Subject\", value: subjectName }, { label: \"Due\", value: fmt(assignment.due_at) }],",
        "          intro: `Hi ${studentName}, ${teacherName} has published ${categoryName === 'Uncategorized' ? 'an assignment' : `a ${categoryName.toLowerCase()}`} for ${subjectName}.`,\n          details: [{ label: \"Subject\", value: subjectName }, { label: \"Type\", value: categoryName }, { label: \"Due\", value: fmt(assignment.due_at) }],",
        'initial assignment email category render',
    )
    write(path, text)

print('Assignment categories, term-safe scheduling, emails, student badges, and Collective Report UX materialized successfully.')
