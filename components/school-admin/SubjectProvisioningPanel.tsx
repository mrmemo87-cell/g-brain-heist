import React, { useEffect, useMemo, useState } from 'react';
import { fetchSchoolAcademicSetup, type AcademicFrameworkSetup, type SchoolAcademicSetup } from '../../services/schoolAcademicSetupService';
import {
  fetchSubjectProvisioningState,
  provisionSchoolSubject,
  type SubjectAccessMode,
  type SubjectProvisioningOffering,
  type SubjectProvisioningState,
} from '../../services/subjectProvisioningService';
import { useSchoolAdmin } from './SchoolAdminContext';

const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);
const gradeLabel = (grade: number | string) => `Grade ${grade}`;
const studentName = (student: any) => student?.full_name || student?.username || student?.email || 'Student';
const studentId = (student: any) => student?.user_id || student?.id;
const teacherName = (teacher: any) => teacher?.full_name || teacher?.username || teacher?.email || 'Teacher';
const className = (item: any) => item?.class_name || item?.class_code || 'Class';
const initials = (value: string) => value
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'S';
const normalizeCode = (value: string) => value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 24);

type WizardStep = 1 | 2 | 3 | 4 | 5;
type TeacherPlan = 'later' | 'now';

const STEPS: Array<{ id: WizardStep; label: string; shortLabel: string }> = [
  { id: 1, label: 'Subject', shortLabel: 'Subject' },
  { id: 2, label: 'Grade', shortLabel: 'Grade' },
  { id: 3, label: 'Access', shortLabel: 'Access' },
  { id: 4, label: 'Teacher', shortLabel: 'Teacher' },
  { id: 5, label: 'Review', shortLabel: 'Review' },
];

const SubjectProvisioningPanel: React.FC = () => {
  const {
    school,
    students = [],
    classes = [],
    teachers = [],
    addToast,
    loadAdminTools,
  } = useSchoolAdmin();

  const [setup, setSetup] = useState<SchoolAcademicSetup | null>(null);
  const [state, setState] = useState<SubjectProvisioningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [furthestStep, setFurthestStep] = useState<WizardStep>(1);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [grade, setGrade] = useState(6);
  const [academicSubjectId, setAcademicSubjectId] = useState('');
  const [accessMode, setAccessMode] = useState<SubjectAccessMode>('selected');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [teacherPlan, setTeacherPlan] = useState<TeacherPlan>('later');
  const [teacherUserId, setTeacherUserId] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!school?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [academicSetup, provisioningState] = await Promise.all([
        fetchSchoolAcademicSetup(school.id),
        fetchSubjectProvisioningState(school.id),
      ]);
      setSetup(academicSetup);
      setState(provisioningState);

      const currentYear = academicSetup.years.find((item) => item.status === 'current') || academicSetup.years[0];
      const currentOfferings = provisioningState.offerings.filter((item) => item.academicYearId === currentYear?.id);
      const firstGrade = currentOfferings[0]?.gradeLevel
        || students.map((student: any) => Number(student.grade)).find((value: number) => Number.isFinite(value) && value > 0)
        || 6;
      setGrade(Number(firstGrade));
    } catch (loadError) {
      console.error('Failed to load subject provisioning', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Subject provisioning is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school?.id]);

  const currentYear = setup?.years.find((item) => item.status === 'current') || setup?.years[0];
  const framework: AcademicFrameworkSetup | undefined = useMemo(() => {
    const frameworks = setup?.frameworks || [];
    return frameworks.find((item) => /brains?-heist-international/i.test(item.code) && !/qa/i.test(item.code))
      || frameworks.find((item) => !/qa/i.test(`${item.code} ${item.name}`))
      || frameworks[0];
  }, [setup?.frameworks]);

  const academicSubjects = useMemo(() => (framework?.subjects || [])
    .filter((subject) => subject.scopes.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name)), [framework?.subjects]);

  const selectedAcademicSubject = academicSubjects.find((subject) => subject.academicSubjectId === academicSubjectId);
  const selectedScope = selectedAcademicSubject?.scopes.find((scope) => Number(scope.gradeLevel) === grade);
  const availableGrades = useMemo(() => new Set(
    (selectedAcademicSubject?.scopes || []).map((scope) => Number(scope.gradeLevel)).filter(Number.isFinite),
  ), [selectedAcademicSubject]);

  const studentsInGrade = useMemo(() => students
    .filter((student: any) => Number(student.grade) === grade)
    .sort((left: any, right: any) => studentName(left).localeCompare(studentName(right))), [grade, students]);

  const visibleGradeStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return studentsInGrade;
    return studentsInGrade.filter((student: any) => [student.full_name, student.username, student.email]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [studentSearch, studentsInGrade]);

  const gradeClasses = useMemo(() => classes
    .filter((item: any) => item.is_active !== false && Number(item.grade_level) === grade)
    .sort((left: any, right: any) => className(left).localeCompare(className(right))), [classes, grade]);

  const selectedTeacher = teachers.find((teacher: any) => teacher.user_id === teacherUserId);
  const selectedClassNames = gradeClasses
    .filter((item: any) => selectedClasses.has(item.id))
    .map((item: any) => className(item));

  const currentOfferings = useMemo(() => (state?.offerings || [])
    .filter((offering) => offering.academicYearId === currentYear?.id)
    .sort((left, right) => Number(left.gradeLevel) - Number(right.gradeLevel) || left.displayName.localeCompare(right.displayName)), [currentYear?.id, state?.offerings]);

  const resetForm = () => {
    setEditingMappingId(null);
    setName('');
    setCode('');
    setCodeTouched(false);
    setAcademicSubjectId('');
    setAccessMode('selected');
    setSelectedStudents(new Set());
    setStudentSearch('');
    setTeacherPlan('later');
    setTeacherUserId('');
    setSelectedClasses(new Set());
    setCurrentStep(1);
    setFurthestStep(1);
  };

  const chooseGrade = (nextGrade: number) => {
    if (academicSubjectId && !availableGrades.has(nextGrade)) return;
    setGrade(nextGrade);
    setSelectedStudents(new Set());
    setStudentSearch('');
    setSelectedClasses(new Set());
  };

  const chooseAcademicSubject = (subjectId: string) => {
    setAcademicSubjectId(subjectId);
    const subject = academicSubjects.find((item) => item.academicSubjectId === subjectId);
    if (!subject) return;

    if (!name.trim()) {
      setName(subject.name);
      if (!codeTouched) setCode(normalizeCode(subject.name));
    }

    const gradeSupported = subject.scopes.some((scope) => Number(scope.gradeLevel) === grade);
    if (!gradeSupported) {
      const firstAvailableGrade = subject.scopes
        .map((scope) => Number(scope.gradeLevel))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)[0];
      if (firstAvailableGrade) setGrade(firstAvailableGrade);
    }
    setSelectedStudents(new Set());
    setStudentSearch('');
    setSelectedClasses(new Set());
  };

  const updateName = (value: string) => {
    setName(value);
    if (!codeTouched) setCode(normalizeCode(value));
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisibleStudents = () => setSelectedStudents((current) => {
    const next = new Set(current);
    visibleGradeStudents.forEach((student: any) => next.add(studentId(student)));
    return next;
  });

  const clearStudents = () => setSelectedStudents(new Set());

  const toggleClass = (classId: string) => {
    setSelectedClasses((current) => {
      const next = new Set(current);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const chooseTeacher = (userId: string) => {
    setTeacherUserId(userId);
    if (userId && selectedClasses.size === 0) {
      setSelectedClasses(new Set(gradeClasses.map((item: any) => item.id)));
    }
  };

  const chooseTeacherPlan = (plan: TeacherPlan) => {
    setTeacherPlan(plan);
    if (plan === 'later') {
      setTeacherUserId('');
      setSelectedClasses(new Set());
    }
  };

  const editOffering = (offering: SubjectProvisioningOffering) => {
    setEditingMappingId(offering.mappingId);
    setName(offering.displayName);
    setCode(normalizeCode(offering.displayName));
    setCodeTouched(false);
    setGrade(Number(offering.gradeLevel));
    setAcademicSubjectId(offering.academicSubjectId);
    setAccessMode(offering.accessMode);
    setSelectedStudents(new Set(offering.selectedStudentIds || []));
    setTeacherPlan(offering.teacherUserIds?.length ? 'now' : 'later');
    setTeacherUserId(offering.teacherUserIds?.[0] || '');
    setSelectedClasses(new Set(offering.classIds || []));
    setStudentSearch('');
    setCurrentStep(1);
    setFurthestStep(5);
    window.requestAnimationFrame(() => document.getElementById('subject-studio-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const stepReady = (step: WizardStep) => {
    if (step === 1) return Boolean(name.trim() && selectedAcademicSubject);
    if (step === 2) return Boolean(selectedScope);
    if (step === 3) return accessMode === 'all_grade' || selectedStudents.size > 0;
    if (step === 4) return teacherPlan === 'later' || Boolean(teacherUserId && selectedClasses.size > 0);
    return true;
  };

  const continueWizard = () => {
    if (!stepReady(currentStep)) {
      if (currentStep === 1) addToast('Add a subject name and academic mapping to continue.', 'info');
      if (currentStep === 2) addToast('Choose a supported grade to continue.', 'info');
      if (currentStep === 3) addToast('Select at least one student, or choose the whole grade.', 'info');
      if (currentStep === 4) addToast('Choose a teacher and at least one class, or assign later.', 'info');
      return;
    }
    if (currentStep < 5) {
      const nextStep = (currentStep + 1) as WizardStep;
      setCurrentStep(nextStep);
      setFurthestStep((current) => Math.max(current, nextStep) as WizardStep);
    }
  };

  const backWizard = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as WizardStep);
  };

  const jumpToStep = (step: WizardStep) => {
    if (step <= furthestStep) setCurrentStep(step);
  };

  const handleSave = async () => {
    if (!school?.id || !currentYear?.id) {
      addToast('Set up the current academic year first.', 'info');
      return;
    }
    if (!name.trim()) {
      addToast('Enter the school-facing subject name.', 'error');
      return;
    }
    if (!selectedAcademicSubject || !selectedScope) {
      addToast('Choose a valid academic subject and grade.', 'error');
      return;
    }
    if (accessMode === 'selected' && selectedStudents.size === 0) {
      addToast('Select at least one student.', 'error');
      return;
    }
    if (teacherPlan === 'now' && (!teacherUserId || selectedClasses.size === 0)) {
      addToast('Choose a teacher and at least one class.', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await provisionSchoolSubject({
        schoolId: school.id,
        academicYearId: currentYear.id,
        name,
        code,
        academicSubjectId,
        gradeLevel: String(grade),
        scopeId: selectedScope.scopeId,
        accessMode,
        selectedStudentIds: accessMode === 'selected' ? Array.from(selectedStudents) : [],
        teacherUserId: teacherPlan === 'now' ? teacherUserId : null,
        classIds: teacherPlan === 'now' ? Array.from(selectedClasses) : [],
      });
      addToast(
        `${result.displayName || name} is ready for ${accessMode === 'selected' ? `${result.selectedStudents || selectedStudents.size} selected students` : `all ${gradeLabel(grade)} students`}.`,
        'success',
      );
      resetForm();
      await Promise.all([
        load(),
        typeof loadAdminTools === 'function' ? loadAdminTools(school.id) : Promise.resolve(),
      ]);
    } catch (saveError) {
      console.error('Failed to provision subject', saveError);
      addToast(saveError instanceof Error ? saveError.message : 'The subject could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-[1120px] text-slate-900">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="mt-3 h-4 w-[520px] max-w-full animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-8 h-80 animate-pulse rounded-3xl bg-slate-50" />
        </div>
      </section>
    );
  }

  if (error || !setup) {
    return (
      <section className="mx-auto w-full max-w-[1120px] text-slate-900">
        <div className="rounded-[28px] border border-rose-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Subject Studio</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Subject provisioning unavailable</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{error || 'The academic setup could not be loaded.'}</p>
          <button type="button" className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800" onClick={() => void load()}>Try again</button>
        </div>
      </section>
    );
  }

  const accessSummary = accessMode === 'selected'
    ? `${selectedStudents.size} selected student${selectedStudents.size === 1 ? '' : 's'}`
    : `Everyone in ${gradeLabel(grade)}`;
  const teacherSummary = teacherPlan === 'now' && selectedTeacher
    ? teacherName(selectedTeacher)
    : 'Assign later';

  return (
    <section className="mx-auto w-full max-w-[1120px] space-y-6 text-slate-900" aria-labelledby="subject-studio-title">
      <header className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.45)] sm:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Subject Studio</span>
              {editingMappingId ? <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">Editing subject</span> : null}
            </div>
            <h3 id="subject-studio-title" className="mt-3 text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-[30px]">Create a subject students can actually access.</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Use your school&apos;s own label, connect it to the right academic curriculum, then decide exactly who studies it.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:self-center">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-sm font-bold text-blue-700 shadow-sm ring-1 ring-slate-200">AY</span>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Academic year</span>
              <strong className="mt-0.5 block text-sm text-slate-900">{currentYear?.name || 'Not configured'}</strong>
            </div>
          </div>
        </div>
      </header>

      <div id="subject-studio-wizard" className="scroll-mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_-42px_rgba(15,23,42,0.55)]">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-6">
          <div className="overflow-x-auto pb-1">
            <ol className="flex min-w-[640px] items-center" aria-label="Subject setup progress">
              {STEPS.map((step, index) => {
                const active = currentStep === step.id;
                const complete = step.id < currentStep || (step.id < furthestStep && stepReady(step.id));
                const available = step.id <= furthestStep;
                return (
                  <React.Fragment key={step.id}>
                    <li className="flex min-w-[94px] flex-1 justify-center">
                      <button
                        type="button"
                        disabled={!available}
                        onClick={() => jumpToStep(step.id)}
                        className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition ${available ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}
                        aria-current={active ? 'step' : undefined}
                      >
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition ${active ? 'bg-blue-700 text-white shadow-sm shadow-blue-200' : complete ? 'bg-emerald-100 text-emerald-700' : 'border border-slate-300 bg-white text-slate-500'}`}>
                          {complete ? '✓' : step.id}
                        </span>
                        <span>
                          <span className={`block text-[10px] font-bold uppercase tracking-[0.12em] ${active ? 'text-blue-700' : 'text-slate-400'}`}>Step {step.id}</span>
                          <span className={`block text-sm font-semibold ${active ? 'text-slate-950' : 'text-slate-600'}`}>{step.shortLabel}</span>
                        </span>
                      </button>
                    </li>
                    {index < STEPS.length - 1 ? <span className={`h-px min-w-5 flex-1 ${step.id < currentStep ? 'bg-emerald-300' : 'bg-slate-200'}`} aria-hidden="true" /> : null}
                  </React.Fragment>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="min-h-[500px] px-5 py-7 sm:px-8 sm:py-8">
            {currentStep === 1 ? (
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Step 1 of 5</span>
                <h4 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">What should your school call this subject?</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">Students and teachers will see the school-facing name. Brain Heist keeps the academic mapping underneath for curriculum, questions and reporting.</p>

                <div className="mt-7 space-y-5">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">Subject name</span>
                    <span className="ml-2 text-xs text-slate-400">Students will see this</span>
                    <input
                      autoFocus
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      value={name}
                      onChange={(event) => updateName(event.target.value)}
                      placeholder="e.g. ESL"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">Academic foundation</span>
                    <span className="ml-2 text-xs text-slate-400">Used for curriculum and analytics</span>
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      value={academicSubjectId}
                      onChange={(event) => chooseAcademicSubject(event.target.value)}
                    >
                      <option value="">Choose academic subject…</option>
                      {academicSubjects.map((subject) => <option key={subject.academicSubjectId} value={subject.academicSubjectId}>{subject.name}</option>)}
                    </select>
                  </label>

                  {name.trim() && selectedAcademicSubject ? (
                    <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-bold text-blue-700 shadow-sm">↳</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900"><strong>{name.trim()}</strong> will run on the <strong>{selectedAcademicSubject.name}</strong> academic engine.</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">The local label stays visible to your school while question authority, curriculum intelligence and reporting remain governed.</p>
                      </div>
                    </div>
                  ) : null}

                  <label className="block max-w-sm">
                    <span className="text-sm font-semibold text-slate-800">Subject code</span>
                    <span className="ml-2 text-xs text-slate-400">Optional</span>
                    <input
                      className="mt-2 h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold uppercase tracking-wide text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      value={code}
                      onChange={(event) => { setCodeTouched(true); setCode(event.target.value.toUpperCase()); }}
                      placeholder="ESL"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Step 2 of 5</span>
                <h4 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Which grade studies {name.trim() || 'this subject'}?</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">Only grades supported by the {selectedAcademicSubject?.name || 'selected'} academic framework are available.</p>

                <div className="mt-7 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {GRADES.map((item) => {
                    const supported = availableGrades.has(item);
                    const selected = grade === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        disabled={!supported}
                        onClick={() => chooseGrade(item)}
                        className={`relative min-h-[86px] rounded-2xl border p-3 text-left transition ${selected ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' : supported ? 'border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm' : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'}`}
                      >
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">Grade</span>
                        <span className="mt-1 block text-2xl font-bold">{item}</span>
                        {!supported ? <span className="mt-1 block text-[10px] font-medium">Unavailable</span> : null}
                        {selected ? <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">✓</span> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Students in {gradeLabel(grade)}</span>
                    <strong className="mt-1 block text-2xl text-slate-950">{studentsInGrade.length}</strong>
                    <p className="mt-1 text-xs text-slate-500">Current academic roster</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Active classes</span>
                    <strong className="mt-1 block text-2xl text-slate-950">{gradeClasses.length}</strong>
                    <p className="mt-1 text-xs text-slate-500">Available for teacher allocation</p>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Step 3 of 5</span>
                <h4 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Who should have access?</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">Choose the whole grade for a core subject, or build a selective roster for ESL, interventions and specialist programmes.</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAccessMode('all_grade')}
                    className={`rounded-2xl border p-5 text-left transition ${accessMode === 'all_grade' ? 'border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl text-lg ${accessMode === 'all_grade' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>◎</span>
                    <strong className="mt-4 block text-base text-slate-950">Everyone in {gradeLabel(grade)}</strong>
                    <span className="mt-1 block text-sm leading-5 text-slate-500">Automatically available to all {studentsInGrade.length} students in this grade.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessMode('selected')}
                    className={`rounded-2xl border p-5 text-left transition ${accessMode === 'selected' ? 'border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl text-lg ${accessMode === 'selected' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>✓</span>
                    <strong className="mt-4 block text-base text-slate-950">Selected students</strong>
                    <span className="mt-1 block text-sm leading-5 text-slate-500">Build a precise roster. Only enrolled students receive the subject.</span>
                  </button>
                </div>

                {accessMode === 'selected' ? (
                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <strong className="text-sm text-slate-950">Select students</strong>
                          <p className="mt-0.5 text-xs text-slate-500">{selectedStudents.size} of {studentsInGrade.length} selected</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50" onClick={selectVisibleStudents}>Select visible</button>
                          <button type="button" className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100" onClick={clearStudents}>Clear</button>
                        </div>
                      </div>
                      <div className="relative mt-3">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                        <input
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          value={studentSearch}
                          onChange={(event) => setStudentSearch(event.target.value)}
                          placeholder={`Search ${gradeLabel(grade)} students…`}
                        />
                      </div>
                    </div>
                    <div className="max-h-[330px] overflow-y-auto p-2">
                      {visibleGradeStudents.length ? visibleGradeStudents.map((student: any) => {
                        const id = studentId(student);
                        const checked = selectedStudents.has(id);
                        const label = studentName(student);
                        return (
                          <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{initials(label)}</span>
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-sm text-slate-900">{label}</strong>
                              <span className="block truncate text-xs text-slate-500">{student.email || student.username || gradeLabel(grade)}</span>
                            </span>
                            <input className="h-4 w-4 accent-blue-700" type="checkbox" checked={checked} onChange={() => toggleStudent(id)} />
                          </label>
                        );
                      }) : (
                        <div className="p-8 text-center">
                          <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">⌕</span>
                          <p className="mt-3 text-sm font-semibold text-slate-700">No students found</p>
                          <p className="mt-1 text-xs text-slate-500">Try another search or confirm the {gradeLabel(grade)} roster.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Step 4 of 5</span>
                <h4 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Who teaches it?</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">Teacher allocation is optional. You can publish the subject now and allocate teaching staff later.</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => chooseTeacherPlan('later')}
                    className={`rounded-2xl border p-5 text-left transition ${teacherPlan === 'later' ? 'border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-bold ${teacherPlan === 'later' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>→</span>
                    <strong className="mt-4 block text-base text-slate-950">Assign later</strong>
                    <span className="mt-1 block text-sm leading-5 text-slate-500">Publish the subject now without changing teacher allocations.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseTeacherPlan('now')}
                    className={`rounded-2xl border p-5 text-left transition ${teacherPlan === 'now' ? 'border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-bold ${teacherPlan === 'now' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>+T</span>
                    <strong className="mt-4 block text-base text-slate-950">Assign a teacher now</strong>
                    <span className="mt-1 block text-sm leading-5 text-slate-500">Connect a teacher to one or more {gradeLabel(grade)} classes.</span>
                  </button>
                </div>

                {teacherPlan === 'now' ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Teacher</span>
                      <select
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        value={teacherUserId}
                        onChange={(event) => chooseTeacher(event.target.value)}
                      >
                        <option value="">Choose teacher…</option>
                        {teachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{teacherName(teacher)}</option>)}
                      </select>
                    </label>

                    <div className="mt-5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <span className="text-sm font-semibold text-slate-800">Classes</span>
                          <p className="mt-0.5 text-xs text-slate-500">Choose where this teacher delivers {name.trim() || 'the subject'}.</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">{selectedClasses.size} selected</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {gradeClasses.length ? gradeClasses.map((item: any) => {
                          const checked = selectedClasses.has(item.id);
                          return (
                            <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-blue-300 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                              <input className="h-4 w-4 accent-blue-700" type="checkbox" checked={checked} onChange={() => toggleClass(item.id)} />
                              <span>
                                <strong className="block text-sm text-slate-900">{className(item)}</strong>
                                <span className="text-xs text-slate-500">{item.class_code || gradeLabel(grade)}</span>
                              </span>
                            </label>
                          );
                        }) : <p className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No active classes exist for {gradeLabel(grade)} yet. Choose <strong>Assign later</strong> or create a class first.</p>}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentStep === 5 ? (
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Final step</span>
                <h4 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Review before publishing.</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">Nothing changes until you publish. Confirm the student-facing name, academic mapping and access rules below.</p>

                <div className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">Ready to publish</span>
                        <h5 className="mt-2 text-3xl font-bold tracking-tight">{name.trim()}</h5>
                        <p className="mt-1 text-sm text-slate-300">Powered academically by {selectedAcademicSubject?.name}</p>
                      </div>
                      <span className="self-start rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15">{gradeLabel(grade)}</span>
                    </div>
                  </div>
                  <dl className="grid gap-px bg-slate-200 sm:grid-cols-2">
                    <div className="bg-white p-5">
                      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Student access</dt>
                      <dd className="mt-2 text-sm font-semibold text-slate-900">{accessSummary}</dd>
                    </div>
                    <div className="bg-white p-5">
                      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Teacher</dt>
                      <dd className="mt-2 text-sm font-semibold text-slate-900">{teacherSummary}</dd>
                    </div>
                    <div className="bg-white p-5">
                      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Academic mapping</dt>
                      <dd className="mt-2 text-sm font-semibold text-slate-900">{selectedAcademicSubject?.name}</dd>
                    </div>
                    <div className="bg-white p-5">
                      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Classes</dt>
                      <dd className="mt-2 text-sm font-semibold text-slate-900">{teacherPlan === 'now' ? (selectedClassNames.join(', ') || 'None selected') : 'Not allocated yet'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">Access rules are enforced by the academic enrolment model.</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">Selected students receive the subject without exposing it to the rest of the grade, while the canonical academic mapping remains intact.</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 px-5 py-6 lg:border-l lg:border-t-0 lg:px-6" aria-label="Current subject plan">
            <div className="lg:sticky lg:top-6">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Current plan</span>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-100">{initials(name.trim() || 'New subject')}</span>
                  <div className="min-w-0">
                    <strong className="block truncate text-base text-slate-950">{name.trim() || 'New subject'}</strong>
                    <span className="block truncate text-xs text-slate-500">{selectedAcademicSubject?.name ? `Based on ${selectedAcademicSubject.name}` : 'Academic mapping not chosen'}</span>
                  </div>
                </div>
              </div>

              <dl className="mt-4 space-y-1">
                <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5">
                  <dt className="text-xs font-medium text-slate-500">Grade</dt>
                  <dd className="text-xs font-bold text-slate-800">{gradeLabel(grade)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5">
                  <dt className="text-xs font-medium text-slate-500">Access</dt>
                  <dd className="max-w-[160px] text-right text-xs font-bold text-slate-800">{accessSummary}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5">
                  <dt className="text-xs font-medium text-slate-500">Teacher</dt>
                  <dd className="max-w-[160px] truncate text-right text-xs font-bold text-slate-800">{teacherSummary}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5">
                  <dt className="text-xs font-medium text-slate-500">Year</dt>
                  <dd className="text-xs font-bold text-slate-800">{currentYear?.name || '—'}</dd>
                </div>
              </dl>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Students will see</span>
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-950 p-3 text-white">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-xs font-bold">{initials(name.trim() || 'S')}</span>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{name.trim() || 'Subject name'}</strong>
                    <span className="text-[11px] text-slate-400">{gradeLabel(grade)}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            {currentStep > 1 ? (
              <button type="button" onClick={backWizard} className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:w-auto">← Back</button>
            ) : editingMappingId ? (
              <button type="button" onClick={resetForm} className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:w-auto">Cancel editing</button>
            ) : <span />}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {currentStep < 5 ? (
              <button
                type="button"
                disabled={!stepReady(currentStep)}
                onClick={continueWizard}
                className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                Continue <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || !currentYear || !stepReady(1) || !stepReady(2) || !stepReady(3) || !stepReady(4)}
                onClick={() => void handleSave()}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {saving ? 'Publishing…' : editingMappingId ? 'Save changes' : 'Publish subject'}
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="configured-subjects-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Your school</span>
            <h4 id="configured-subjects-title" className="mt-1 text-lg font-bold text-slate-950">Configured subjects</h4>
            <p className="mt-1 text-sm text-slate-500">Manage existing school labels, access rules and teacher allocations.</p>
          </div>
          <span className="self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:self-auto">{currentOfferings.length} configured</span>
        </div>

        {currentOfferings.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {currentOfferings.map((offering) => {
              const allocatedTeachers = teachers.filter((teacher: any) => offering.teacherUserIds?.includes(teacher.user_id));
              const selective = offering.accessMode === 'selected';
              return (
                <article key={offering.mappingId} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-100">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white">{initials(offering.displayName)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="truncate text-base font-bold text-slate-950">{offering.displayName}</h5>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${selective ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>{selective ? 'Selective' : 'Whole grade'}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{gradeLabel(offering.gradeLevel)} · {offering.canonicalName}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Students</span>
                      <strong className="mt-1 block truncate text-sm text-slate-800">{selective ? offering.selectedStudentIds.length : `All ${gradeLabel(offering.gradeLevel)}`}</strong>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Teacher</span>
                      <strong className="mt-1 block truncate text-sm text-slate-800">{allocatedTeachers.length ? allocatedTeachers.map(teacherName).join(', ') : 'Not assigned'}</strong>
                    </div>
                  </div>
                  <button type="button" className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" onClick={() => editOffering(offering)}>Manage subject</button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-700">No subjects configured yet.</p>
            <p className="mt-1 text-xs text-slate-500">Your first published subject will appear here.</p>
          </div>
        )}
      </section>
    </section>
  );
};

export default SubjectProvisioningPanel;
