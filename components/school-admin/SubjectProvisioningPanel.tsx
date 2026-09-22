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

const gradeLabel = (grade: number | string) => `Grade ${grade}`;
const studentName = (student: any) => student?.full_name || student?.username || student?.email || 'Student';
const teacherName = (teacher: any) => teacher?.username || teacher?.email || 'Teacher';
const normalizeCode = (value: string) => value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 24);

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

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [grade, setGrade] = useState(6);
  const [academicSubjectId, setAcademicSubjectId] = useState('');
  const [accessMode, setAccessMode] = useState<SubjectAccessMode>('selected');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
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

  const gradeStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return students
      .filter((student: any) => Number(student.grade) === grade)
      .filter((student: any) => {
        if (!query) return true;
        return [student.full_name, student.username, student.email]
          .some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((left: any, right: any) => studentName(left).localeCompare(studentName(right)));
  }, [grade, studentSearch, students]);

  const gradeClasses = useMemo(() => classes
    .filter((item: any) => item.is_active !== false && Number(item.grade_level) === grade)
    .sort((left: any, right: any) => String(left.class_name || left.class_code).localeCompare(String(right.class_name || right.class_code))), [classes, grade]);

  const academicSubjects = useMemo(() => (framework?.subjects || [])
    .map((subject) => ({
      ...subject,
      scope: subject.scopes.find((scope) => Number(scope.gradeLevel) === grade),
    }))
    .filter((subject) => subject.scope)
    .sort((left, right) => left.name.localeCompare(right.name)), [framework?.subjects, grade]);

  const selectedAcademicSubject = academicSubjects.find((subject) => subject.academicSubjectId === academicSubjectId);
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
    setTeacherUserId('');
    setSelectedClasses(new Set());
  };

  const chooseGrade = (nextGrade: number) => {
    setGrade(nextGrade);
    setAcademicSubjectId('');
    setSelectedStudents(new Set());
    setSelectedClasses(new Set());
  };

  const chooseAcademicSubject = (subjectId: string) => {
    setAcademicSubjectId(subjectId);
    const subject = academicSubjects.find((item) => item.academicSubjectId === subjectId);
    if (subject && !name.trim()) {
      setName(subject.name);
      if (!codeTouched) setCode(normalizeCode(subject.name));
    }
  };

  const updateName = (value: string) => {
    setName(value);
    if (!codeTouched) setCode(normalizeCode(value));
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const selectVisibleStudents = () => setSelectedStudents((current) => {
    const next = new Set(current);
    gradeStudents.forEach((student: any) => next.add(student.user_id || student.id));
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

  const editOffering = (offering: SubjectProvisioningOffering) => {
    setEditingMappingId(offering.mappingId);
    setName(offering.displayName);
    setCode(normalizeCode(offering.displayName));
    setCodeTouched(false);
    setGrade(Number(offering.gradeLevel));
    setAcademicSubjectId(offering.academicSubjectId);
    setAccessMode(offering.accessMode);
    setSelectedStudents(new Set(offering.selectedStudentIds || []));
    setTeacherUserId(offering.teacherUserIds?.[0] || '');
    setSelectedClasses(new Set(offering.classIds || []));
    setStudentSearch('');
    window.requestAnimationFrame(() => document.getElementById('subject-studio-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
    if (!selectedAcademicSubject?.scope) {
      addToast('Choose the academic subject this school subject maps to.', 'error');
      return;
    }
    if (accessMode === 'selected' && selectedStudents.size === 0) {
      addToast('Select at least one student.', 'error');
      return;
    }
    if (teacherUserId && selectedClasses.size === 0) {
      addToast('Choose at least one class for the teacher allocation.', 'error');
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
        scopeId: selectedAcademicSubject.scope.scopeId,
        accessMode,
        selectedStudentIds: accessMode === 'selected' ? Array.from(selectedStudents) : [],
        teacherUserId: teacherUserId || null,
        classIds: teacherUserId ? Array.from(selectedClasses) : [],
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

  if (loading) return <section className="admin-form-card"><p>Loading Subject Studio…</p></section>;
  if (error || !setup) return (
    <section className="admin-form-card">
      <p className="school-admin-eyebrow">Subject Studio</p>
      <h3>Subject provisioning unavailable</h3>
      <p>{error || 'The academic setup could not be loaded.'}</p>
      <button type="button" className="admin-button-primary" onClick={() => void load()}>Try again</button>
    </section>
  );

  return (
    <section className="admin-form-card" aria-labelledby="subject-studio-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="school-admin-eyebrow">Subject Studio</p>
          <h3 id="subject-studio-title" className="text-xl font-semibold">Create the subject once. Control exactly who studies it.</h3>
          <p className="mt-2 max-w-3xl text-sm opacity-80">
            Use the school&apos;s own label — for example <strong>ESL</strong> — while mapping it to the governed academic subject underneath. Select the grade, audience, and optional teacher allocation in one workflow.
          </p>
        </div>
        <div className="rounded-xl border border-current/10 px-4 py-3 text-sm">
          <span className="block text-xs uppercase tracking-wide opacity-60">Academic year</span>
          <strong>{currentYear?.name || 'Not configured'}</strong>
        </div>
      </div>

      {currentOfferings.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold">Active school subjects</h4>
              <p className="text-sm opacity-70">School terminology stays visible while academic mapping remains protected underneath.</p>
            </div>
            <span className="rounded-full border border-current/10 px-3 py-1 text-xs font-semibold">{currentOfferings.length} configured</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {currentOfferings.map((offering) => {
              const allocatedTeachers = teachers.filter((teacher: any) => offering.teacherUserIds?.includes(teacher.user_id));
              return (
                <article key={offering.mappingId} className="rounded-2xl border border-current/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-lg font-semibold">{offering.displayName}</h5>
                        <span className="rounded-full bg-current/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">{gradeLabel(offering.gradeLevel)}</span>
                      </div>
                      {offering.displayName !== offering.canonicalName ? (
                        <p className="mt-1 text-xs opacity-60">Academic mapping: {offering.canonicalName}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full border border-current/10 px-2 py-1 text-xs font-semibold">
                      {offering.accessMode === 'selected' ? 'Selective' : 'Whole grade'}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-current/5 p-3">
                      <span className="block text-xs opacity-60">Students</span>
                      <strong>{offering.accessMode === 'selected' ? offering.selectedStudentIds.length : `All ${gradeLabel(offering.gradeLevel)}`}</strong>
                    </div>
                    <div className="rounded-xl bg-current/5 p-3">
                      <span className="block text-xs opacity-60">Teacher</span>
                      <strong>{allocatedTeachers.length ? allocatedTeachers.map(teacherName).join(', ') : 'Not assigned'}</strong>
                    </div>
                  </div>
                  <button type="button" className="admin-button-secondary mt-4 w-full" onClick={() => editOffering(offering)}>Manage subject</button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div id="subject-studio-form" className="mt-7 rounded-2xl border border-current/10 p-4 md:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold">{editingMappingId ? 'Manage subject' : 'New subject'}</h4>
            <p className="text-sm opacity-70">A concise five-step setup designed for school administrators.</p>
          </div>
          {editingMappingId ? <button type="button" className="admin-button-secondary" onClick={resetForm}>Create another</button> : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-current/10 px-2 py-1 text-xs font-bold">1</span><strong>Name & academic mapping</strong></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">School subject name
                  <input className="mt-1 w-full rounded-xl border border-current/15 bg-transparent px-3 py-2" value={name} onChange={(event) => updateName(event.target.value)} placeholder="e.g. ESL" />
                </label>
                <label className="text-sm font-medium">Code
                  <input className="mt-1 w-full rounded-xl border border-current/15 bg-transparent px-3 py-2" value={code} onChange={(event) => { setCodeTouched(true); setCode(event.target.value.toUpperCase()); }} placeholder="ESL" />
                </label>
              </div>
              <label className="mt-3 block text-sm font-medium">Academic mapping
                <select className="mt-1 w-full rounded-xl border border-current/15 bg-transparent px-3 py-2" value={academicSubjectId} onChange={(event) => chooseAcademicSubject(event.target.value)}>
                  <option value="">Choose academic subject…</option>
                  {academicSubjects.map((subject) => <option key={subject.academicSubjectId} value={subject.academicSubjectId}>{subject.name}</option>)}
                </select>
              </label>
              {name.trim() && selectedAcademicSubject ? <p className="mt-2 text-xs opacity-70">Students see <strong>{name.trim()}</strong>; curriculum, question authority and analytics remain mapped to <strong>{selectedAcademicSubject.name}</strong>.</p> : null}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-current/10 px-2 py-1 text-xs font-bold">2</span><strong>Grade</strong></div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
                  <button key={item} type="button" onClick={() => chooseGrade(item)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${grade === item ? 'border-current bg-current/10' : 'border-current/10'}`}>{item}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-current/10 px-2 py-1 text-xs font-bold">3</span><strong>Student access</strong></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setAccessMode('all_grade')} className={`rounded-xl border p-3 text-left ${accessMode === 'all_grade' ? 'border-current bg-current/10' : 'border-current/10'}`}>
                  <strong className="block">Everyone in {gradeLabel(grade)}</strong><span className="text-xs opacity-70">Required subject for the whole grade.</span>
                </button>
                <button type="button" onClick={() => setAccessMode('selected')} className={`rounded-xl border p-3 text-left ${accessMode === 'selected' ? 'border-current bg-current/10' : 'border-current/10'}`}>
                  <strong className="block">Selected students</strong><span className="text-xs opacity-70">Ideal for ESL, interventions and specialist programmes.</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {accessMode === 'selected' ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><span className="rounded-full bg-current/10 px-2 py-1 text-xs font-bold">4</span><strong>Select students</strong></div>
                  <span className="text-xs font-semibold opacity-70">{selectedStudents.size} selected</span>
                </div>
                <input className="w-full rounded-xl border border-current/15 bg-transparent px-3 py-2" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder={`Search ${gradeLabel(grade)}…`} />
                <div className="mt-2 flex gap-2">
                  <button type="button" className="admin-button-secondary" onClick={selectVisibleStudents}>Select visible</button>
                  <button type="button" className="admin-button-secondary" onClick={clearStudents}>Clear</button>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {gradeStudents.length ? gradeStudents.map((student: any) => {
                    const id = student.user_id || student.id;
                    const checked = selectedStudents.has(id);
                    return (
                      <label key={id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${checked ? 'border-current bg-current/10' : 'border-current/10'}`}>
                        <span><strong className="block text-sm">{studentName(student)}</strong><span className="text-xs opacity-60">{student.email || student.username}</span></span>
                        <input type="checkbox" checked={checked} onChange={() => toggleStudent(id)} />
                      </label>
                    );
                  }) : <p className="rounded-xl border border-dashed border-current/15 p-4 text-sm opacity-70">No students are currently placed in {gradeLabel(grade)}.</p>}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-current/10 p-4">
                <div className="flex items-center gap-2"><span className="rounded-full bg-current/10 px-2 py-1 text-xs font-bold">4</span><strong>Audience confirmed</strong></div>
                <p className="mt-2 text-sm opacity-70">Every student enrolled in {gradeLabel(grade)} will receive this subject automatically.</p>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-current/10 px-2 py-1 text-xs font-bold">5</span><strong>Teacher allocation <span className="font-normal opacity-60">(optional)</span></strong></div>
              <select className="w-full rounded-xl border border-current/15 bg-transparent px-3 py-2" value={teacherUserId} onChange={(event) => chooseTeacher(event.target.value)}>
                <option value="">Assign later</option>
                {teachers.map((teacher: any) => <option key={teacher.user_id} value={teacher.user_id}>{teacherName(teacher)}</option>)}
              </select>
              {teacherUserId ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {gradeClasses.length ? gradeClasses.map((item: any) => (
                    <label key={item.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${selectedClasses.has(item.id) ? 'border-current bg-current/10' : 'border-current/10'}`}>
                      <input type="checkbox" checked={selectedClasses.has(item.id)} onChange={() => toggleClass(item.id)} />
                      <span><strong className="block text-sm">{item.class_name || item.class_code}</strong><span className="text-xs opacity-60">{item.class_code}</span></span>
                    </label>
                  )) : <p className="text-sm opacity-70">Create a class for {gradeLabel(grade)} before allocating a teacher.</p>}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-current/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-60">Ready to publish</p>
              <p className="font-semibold">{name.trim() || 'New subject'} · {gradeLabel(grade)} · {accessMode === 'selected' ? `${selectedStudents.size} selected students` : 'whole grade'}</p>
              <p className="text-xs opacity-70">{selectedAcademicSubject ? `Academic mapping: ${selectedAcademicSubject.name}` : 'Choose an academic mapping to continue.'}</p>
            </div>
            <button type="button" className="admin-button-primary" disabled={saving || !currentYear || !name.trim() || !selectedAcademicSubject} onClick={() => void handleSave()}>
              {saving ? 'Publishing…' : editingMappingId ? 'Save subject' : 'Publish subject'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SubjectProvisioningPanel;
