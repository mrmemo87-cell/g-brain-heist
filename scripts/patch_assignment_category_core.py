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


# types.ts ------------------------------------------------------------------
path = 'types.ts'
text = load(path)
if "export type AssignmentCategory = 'classwork'" not in text:
    text = replace_once(
        text,
        "export type AssignmentBatch = SchoolBatch | 'All';",
        "export type AssignmentBatch = SchoolBatch | 'All';\nexport type AssignmentCategory = 'classwork' | 'homework' | 'quiz' | 'term_exam';",
        'types category union',
    )

    def patch_interface(source: str, name: str, marker: str, addition: str) -> str:
        start = source.index(f'export interface {name}')
        end = source.index('\n}\n', start)
        block = source[start:end]
        if addition.splitlines()[0].strip() in block:
            return source
        if marker not in block:
            raise SystemExit(f'{name}: marker not found')
        block = block.replace(marker, marker + '\n' + addition, 1)
        return source[:start] + block + source[end:]

    text = patch_interface(
        text,
        'TeacherAssignmentSummary',
        "  assignment_mode?: 'batch' | 'custom';",
        "  assignment_category?: AssignmentCategory | null;\n  academic_year_id?: string | null;\n  academic_term_id?: string | null;\n  class_id?: string | null;",
    )
    text = patch_interface(
        text,
        'StudentAssignmentTask',
        "  publish_status?: 'draft' | 'scheduled' | 'published';",
        "  assignment_category?: AssignmentCategory | null;\n  academic_year_id?: string | null;\n  academic_term_id?: string | null;\n  class_id?: string | null;",
    )
    text = patch_interface(
        text,
        'CreateAssignmentRequest',
        '  notify_students_by_email?: boolean;',
        "  assignment_category?: AssignmentCategory | null;\n  client_timezone?: string;",
    )
    save(path, text)


# services/gameService.ts ---------------------------------------------------
path = 'services/gameService.ts'
text = load(path)
if 'AssignmentCategoryContextRow' not in text:
    param_old = "        p_difficulty: payload.difficulty ?? null,\n        p_assignment_mode: mode,"
    if text.count(param_old) != 2:
        raise SystemExit(f'gameService category params: expected 2 matches, found {text.count(param_old)}')
    text = text.replace(
        param_old,
        "        p_difficulty: payload.difficulty ?? null,\n        p_assignment_category: payload.assignment_category ?? null,\n        p_client_timezone: payload.client_timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),\n        p_assignment_mode: mode,",
    )

    anchor = 'export const get_teacher_assignments = async (teacherId?: string): Promise<TeacherAssignmentSummary[]> => {'
    helper = '''type AssignmentCategoryContextRow = {
    assignment_id: string;
    assignment_category?: TeacherAssignmentSummary['assignment_category'];
    academic_year_id?: string | null;
    academic_term_id?: string | null;
    class_id?: string | null;
};

const mergeAssignmentCategoryContext = <T extends { assignment_id?: string; id?: string }>(
    assignments: T[],
    contextRows: AssignmentCategoryContextRow[]
): T[] => {
    const context = new Map(contextRows.map((row) => [row.assignment_id, row]));
    return assignments.map((assignment) => {
        const assignmentId = assignment.assignment_id || assignment.id;
        const extra = assignmentId ? context.get(assignmentId) : undefined;
        return extra ? { ...assignment, ...extra } : assignment;
    });
};

const enrichStudentAssignmentsWithCategoryContext = async <T extends StudentAssignmentTask>(assignments: T[]): Promise<T[]> => {
    const ids = assignments.map((assignment) => assignment.assignment_id).filter(Boolean);
    if (!ids.length) return assignments;
    const { data, error } = await supabase.rpc('rpc_my_assignment_category_context', { p_assignment_ids: ids });
    if (error) throw new Error(error.message || 'Failed to load assignment category context');
    return mergeAssignmentCategoryContext(assignments, (data as AssignmentCategoryContextRow[]) || []) as T[];
};

'''
    if anchor not in text:
        raise SystemExit('gameService teacher assignment anchor not found')
    text = text.replace(anchor, helper + anchor, 1)
    text = replace_once(
        text,
        "    return (data as TeacherAssignmentSummary[]) || [];\n};",
        "    const assignments = (data as TeacherAssignmentSummary[]) || [];\n    const { data: contextData, error: contextError } = await supabase.rpc('rpc_teacher_assignment_category_context', { p_teacher_id: resolvedTeacherId });\n    if (contextError) throw new Error(contextError.message || 'Failed to load assignment category context');\n    return mergeAssignmentCategoryContext(assignments, (contextData as AssignmentCategoryContextRow[]) || []) as TeacherAssignmentSummary[];\n};",
        'gameService teacher context merge',
    )
    text = replace_once(
        text,
        '''    return {
        ...parsedRow,
        questions: normalizedQuestions,
    };
};

// ── Brains Master Premium''',
        '''    const enriched = await enrichStudentAssignmentsWithCategoryContext([{
        ...parsedRow,
        questions: normalizedQuestions,
    }]);
    return enriched[0] || null;
};

// ── Brains Master Premium''',
        'gameService active student context merge',
    )
    text = replace_once(
        text,
        '''    return rows.map((row) => {
        const parsedRow = row as StudentAssignmentTask;
        const normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map(normalizeTeacherQuestionPayload);
        return {
            ...parsedRow,
            questions: normalizedQuestions,
        };
    });''',
        '''    const normalizedAssignments = rows.map((row) => {
        const parsedRow = row as StudentAssignmentTask;
        const normalizedQuestions = ((parsedRow.questions ?? []) as TeacherQuestion[]).map(normalizeTeacherQuestionPayload);
        return {
            ...parsedRow,
            questions: normalizedQuestions,
        };
    });
    return enrichStudentAssignmentsWithCategoryContext(normalizedAssignments);''',
        'gameService pending student context merge',
    )
    save(path, text)


# components/TeacherPortal.tsx ---------------------------------------------
path = 'components/TeacherPortal.tsx'
text = load(path)
if 'const [assignmentCategory, setAssignmentCategory]' not in text:
    text = replace_once(
        text,
        "AssignmentQuestionAnalysis, AssignmentBatch } from '../types';",
        "AssignmentQuestionAnalysis, AssignmentBatch, AssignmentCategory } from '../types';",
        'TeacherPortal category import',
    )
    text = replace_once(
        text,
        "  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');",
        "  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');\n  const [assignmentCategory, setAssignmentCategory] = useState<AssignmentCategory | null>(null);",
        'TeacherPortal category state',
    )
    text = replace_once(
        text,
        "    setAssignmentPublishStatus('published');\n    setAssignmentCloseAfterDue(false);",
        "    setAssignmentPublishStatus('published');\n    setAssignmentCategory(null);\n    setAssignmentCloseAfterDue(false);",
        'TeacherPortal category reset',
    )
    text = replace_once(
        text,
        "    setAssignmentPublishStatus(assignment.publish_status || (new Date(assignment.assigned_at).getTime() > Date.now() ? 'scheduled' : 'published'));\n    setAssignmentCloseAfterDue(Boolean(assignment.close_submissions_after_due));",
        "    setAssignmentPublishStatus(assignment.publish_status || (new Date(assignment.assigned_at).getTime() > Date.now() ? 'scheduled' : 'published'));\n    setAssignmentCategory(assignment.assignment_category ?? null);\n    setAssignmentCloseAfterDue(Boolean(assignment.close_submissions_after_due));",
        'TeacherPortal edit category',
    )
    text = replace_once(
        text,
        "        difficulty: assignmentDifficulty,\n        publish_status: publishStatus,",
        "        difficulty: assignmentDifficulty,\n        assignment_category: assignmentCategory,\n        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',\n        publish_status: publishStatus,",
        'TeacherPortal category payload',
    )
    save_sig = "const saveAssignment = async (publishStatus: 'draft' | 'scheduled' | 'published', e?: React.FormEvent) => {\n"
    text = replace_once(
        text,
        save_sig,
        save_sig + "    if (publishStatus !== 'draft' && !assignmentCategory) { brainsAlert('Choose Classwork, Homework, Quiz, or Term Exam before publishing.', 'error'); return; }\n",
        'TeacherPortal category publish guard',
    )
    text = replace_once(
        text,
        "          assignmentPublishStatus={assignmentPublishStatus}\n          setAssignmentPublishStatus={setAssignmentPublishStatus}",
        "          assignmentPublishStatus={assignmentPublishStatus}\n          setAssignmentPublishStatus={setAssignmentPublishStatus}\n          assignmentCategory={assignmentCategory}\n          setAssignmentCategory={setAssignmentCategory}\n          schoolId={profile.school_id || undefined}",
        'TeacherPortal wizard category props',
    )
    save(path, text)


# components/teacher/AssignmentWizard.tsx ----------------------------------
path = 'components/teacher/AssignmentWizard.tsx'
text = load(path)
if 'assignmentCategory: AssignmentCategory | null;' not in text:
    text = replace_once(
        text,
        "import type { QuestionDifficulty, QuestionType, StudentForAssignment, Subject, TeacherQuestion } from '../../types';",
        "import type { AssignmentCategory, QuestionDifficulty, QuestionType, StudentForAssignment, Subject, TeacherQuestion } from '../../types';\nimport { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../../services/schoolAcademicSetupService';\nimport { ASSIGNMENT_CATEGORY_META, getAssignmentCategoryMeta } from '../../src/lib/assignmentCategory';",
        'AssignmentWizard category imports',
    )
    text = replace_once(
        text,
        "  setAssignmentPublishStatus: (value: 'draft' | 'scheduled' | 'published') => void;",
        "  setAssignmentPublishStatus: (value: 'draft' | 'scheduled' | 'published') => void;\n  assignmentCategory: AssignmentCategory | null;\n  setAssignmentCategory: (value: AssignmentCategory | null) => void;\n  schoolId?: string;",
        'AssignmentWizard category props',
    )
    text = replace_once(
        text,
        '''const isPastDueDate = (value: string) => {
  if (!value) return false;
  const due = new Date(value);
  return Number.isNaN(due.getTime()) || due.getTime() <= Date.now();
};''',
        '''const isPastDueDate = (value: string) => {
  if (!value) return false;
  const due = new Date(value);
  return Number.isNaN(due.getTime()) || due.getTime() <= Date.now();
};

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};''',
        'AssignmentWizard local date helper',
    )
    text = replace_once(
        text,
        "  assignmentPublishStatus,\n  setAssignmentPublishStatus,\n  assignmentCloseAfterDue,",
        "  assignmentPublishStatus,\n  setAssignmentPublishStatus,\n  assignmentCategory,\n  setAssignmentCategory,\n  schoolId,\n  assignmentCloseAfterDue,",
        'AssignmentWizard category destructuring',
    )
    text = replace_once(
        text,
        "  const [reviewConfirmed, setReviewConfirmed] = useState(false);\n  const wizardTopRef = useRef<HTMLDivElement>(null);",
        '''  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [academicSetup, setAcademicSetup] = useState<SchoolAcademicSetup | null>(null);
  const [academicSetupLoading, setAcademicSetupLoading] = useState(false);
  const wizardTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!schoolId) { setAcademicSetup(null); return; }
    let cancelled = false;
    setAcademicSetupLoading(true);
    void fetchSchoolAcademicSetup(schoolId)
      .then((setup) => { if (!cancelled) setAcademicSetup(setup); })
      .catch((error) => { console.error('Failed to load academic calendar for assignment scheduling', error); if (!cancelled) setAcademicSetup(null); })
      .finally(() => { if (!cancelled) setAcademicSetupLoading(false); });
    return () => { cancelled = true; };
  }, [schoolId]);

  const scheduleWindow = useMemo(() => {
    if (!academicSetup) return null;
    const today = localDateKey();
    const year = academicSetup.years.find((item) => item.status === 'current' && today >= item.startsOn && today <= item.endsOn);
    if (!year) return null;
    const term = academicSetup.terms.find((item) => item.academicYearId === year.id && today >= item.startsOn && today <= item.endsOn);
    return term ? { year, term } : null;
  }, [academicSetup]);

  const scheduledDateKey = assignmentAssignedAt ? assignmentAssignedAt.slice(0, 10) : '';
  const scheduledOutsideCurrentTerm = assignmentPublishStatus === 'scheduled' && Boolean(scheduleWindow) && Boolean(scheduledDateKey) && Boolean(
    scheduleWindow && (scheduledDateKey < scheduleWindow.term.startsOn || scheduledDateKey > scheduleWindow.term.endsOn)
  );''',
        'AssignmentWizard academic schedule context',
    )
    text = replace_once(
        text,
        '''    if (currentStep === 4 && !assignmentTitle.trim()) {
      return brainsAlert('Add an assignment title before continuing.', 'info');
    }''',
        '''    if (currentStep === 4 && !assignmentTitle.trim()) {
      return brainsAlert('Add an assignment title before continuing.', 'info');
    }
    if (currentStep === 4 && !assignmentCategory) {
      return brainsAlert('Choose whether this is Classwork, Homework, Quiz, or Term Exam.', 'info');
    }''',
        'AssignmentWizard category validation',
    )
    text = replace_once(
        text,
        '''    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && (!assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {
      return brainsAlert('Choose a future publication date and time.', 'error');
    }''',
        '''    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && (!assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {
      return brainsAlert('Choose a future publication date and time in your local timezone.', 'error');
    }
    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && !scheduleWindow) {
      return brainsAlert('Scheduling requires the school admin to configure the current academic year and term.', 'error');
    }
    if (currentStep === 5 && scheduledOutsideCurrentTerm) {
      return brainsAlert(`Schedule this assignment inside ${scheduleWindow?.term.name || 'the current term'} of ${scheduleWindow?.year.name || 'the current academic year'}.`, 'error');
    }''',
        'AssignmentWizard schedule window validation',
    )
    text = replace_once(
        text,
        '''    if (!assignmentTitle.trim()) {
      brainsAlert('Assignment title is required.', 'info');
      goToStep(4);
      return;
    }''',
        '''    if (!assignmentTitle.trim()) {
      brainsAlert('Assignment title is required.', 'info');
      goToStep(4);
      return;
    }
    if (!assignmentCategory) {
      brainsAlert('Choose Classwork, Homework, Quiz, or Term Exam before publishing.', 'info');
      goToStep(4);
      return;
    }
    if (assignmentPublishStatus === 'scheduled' && (!scheduleWindow || scheduledOutsideCurrentTerm || !assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {
      brainsAlert('Scheduled publication must be a future local time inside the current academic term and year.', 'error');
      goToStep(5);
      return;
    }''',
        'AssignmentWizard submit validation',
    )
    text = replace_once(
        text,
        '''              <label><span>Assignment title <strong aria-hidden="true">*</strong></span><input required aria-required="true" value={assignmentTitle} onChange={(event) => { setAssignmentTitle(event.target.value); setReviewConfirmed(false); }} placeholder="e.g. Fractions confidence check" /><small>Required. This is the name students and reports will show.</small></label>
              <label><span>Description</span>''',
        '''              <label><span>Assignment title <strong aria-hidden="true">*</strong></span><input required aria-required="true" value={assignmentTitle} onChange={(event) => { setAssignmentTitle(event.target.value); setReviewConfirmed(false); }} placeholder="e.g. Fractions confidence check" /><small>Required. This is the name students and reports will show.</small></label>
              <fieldset className="grid gap-2"><legend className="text-sm font-bold text-slate-700">Assignment type <strong aria-hidden="true">*</strong></legend><div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Assignment type">{(Object.keys(ASSIGNMENT_CATEGORY_META) as AssignmentCategory[]).map((category) => { const meta = ASSIGNMENT_CATEGORY_META[category]; const selected = assignmentCategory === category; return <button key={category} type="button" role="radio" aria-checked={selected} onClick={() => { setAssignmentCategory(category); setReviewConfirmed(false); }} className={`rounded-xl border px-4 py-3 text-left transition ${selected ? 'ring-2 ring-slate-700 ring-offset-1' : 'hover:shadow-sm'}`} style={{ backgroundColor: meta.background, borderColor: meta.border, color: meta.text }}><strong className="block">{meta.label}</strong><small>{category === 'classwork' ? 'Work completed during class' : category === 'homework' ? 'Work completed outside class' : category === 'quiz' ? 'Short assessment or knowledge check' : 'Formal assessment for the current term'}</small></button>; })}</div><small className="text-slate-500">The type is reporting metadata only; it does not change marks, XP, rewards, or completion rules.</small></fieldset>
              <label><span>Description</span>''',
        'AssignmentWizard category selector',
    )
    text = replace_once(
        text,
        '''                {assignmentPublishStatus === 'scheduled' ? <label className="aw-custom-date"><span>Publish at</span><input type="datetime-local" min={localDateTimeValue()} value={assignmentAssignedAt} onChange={(event) => setAssignmentAssignedAt(event.target.value)} /></label> : null}''',
        '''                {assignmentPublishStatus === 'scheduled' ? <label className="aw-custom-date"><span>Publish at</span><input type="datetime-local" min={localDateTimeValue()} max={scheduleWindow ? `${scheduleWindow.term.endsOn}T23:59` : undefined} value={assignmentAssignedAt} aria-invalid={scheduledOutsideCurrentTerm || (!academicSetupLoading && !scheduleWindow)} onChange={(event) => setAssignmentAssignedAt(event.target.value)} />{academicSetupLoading ? <small>Checking the school calendar…</small> : scheduleWindow ? <small>Scheduling is limited to {scheduleWindow.term.name} ({scheduleWindow.term.startsOn}–{scheduleWindow.term.endsOn}) in {scheduleWindow.year.name}.</small> : <small className="aw-field-error">The school admin must configure a current academic year and term before assignments can be scheduled.</small>}{scheduledOutsideCurrentTerm ? <small className="aw-field-error">Choose a publication time inside the current term.</small> : null}</label> : null}''',
        'AssignmentWizard schedule input bounds',
    )
    text = replace_once(
        text,
        "                ['Subject', assignmentSubject, 1],\n                ['Audience'",
        "                ['Subject', assignmentSubject, 1],\n                ['Assignment type', getAssignmentCategoryMeta(assignmentCategory).label, 4],\n                ['Audience'",
        'AssignmentWizard review category',
    )
    save(path, text)


# App.tsx -------------------------------------------------------------------
path = 'App.tsx'
text = load(path)
if 'assignmentCategoryBadgeStyle' not in text:
    import_anchor = "import { enrollInApprovedSchoolClass, listMySchoolClasses, type ApprovedSignupClass } from './services/authService';"
    text = replace_once(
        text,
        import_anchor,
        import_anchor + "\nimport { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from './src/lib/assignmentCategory';",
        'App category import',
    )
    text = replace_once(
        text,
        "            const dueLabel = assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No deadline';\n            const statusLabel = assignment.is_closed ? 'Closed' : assignment.is_late ? 'Late · still open' : 'Ready';",
        "            const dueLabel = assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No deadline';\n            const statusLabel = assignment.is_closed ? 'Closed' : assignment.is_late ? 'Late · still open' : 'Ready';\n            const categoryMeta = getAssignmentCategoryMeta(assignment.assignment_category);",
        'App category badge value',
    )
    text = replace_once(
        text,
        '''                    <span className="block text-sm font-black text-white">{assignment.title || assignment.topic_name || 'New assignment'}</span>
                    <span className="mt-1 block text-xs text-slate-400">''',
        '''                    <span className="block text-sm font-black text-white">{assignment.title || assignment.topic_name || 'New assignment'}</span>
                    <span className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={assignmentCategoryBadgeStyle(assignment.assignment_category)}>{categoryMeta.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">''',
        'App student assignment badge',
    )
    save(path, text)

print('Assignment category core materialized.')
