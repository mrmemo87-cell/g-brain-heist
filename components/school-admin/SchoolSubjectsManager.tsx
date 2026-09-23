import React, { useEffect, useMemo, useState } from 'react';
import {
  deleteSchoolSubject,
  fetchSchoolSubjectCatalog,
  saveSchoolSubject,
  type SchoolSubjectAccessMode,
  type SchoolSubjectCatalog,
  type SchoolSubjectOffering,
  type SchoolSubjectRecord,
} from '../../services/schoolSubjectCatalogService';
import {
  fetchSchoolAcademicSetup,
  type AcademicScopeSetup,
  type SchoolAcademicSetup,
} from '../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from './SchoolAdminContext';
import SubjectTeachingGroupsPanel from './SubjectTeachingGroupsPanel';

const gradeLabel = (value: string | number) => `Grade ${value}`;
const studentId = (student: any) => student?.user_id || student?.id;
const studentName = (student: any) => student?.full_name || student?.username || student?.email || 'Student';
const teacherName = (teacher: any) => teacher?.full_name || teacher?.username || teacher?.email || 'Teacher';
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S';
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

interface AcademicChoice {
  id: string;
  name: string;
  code: string;
  scopes: AcademicScopeSetup[];
}

type MappingFilter = 'all' | 'mapped' | 'unmapped';

const SchoolSubjectsManager: React.FC = () => {
  const {
    school,
    students = [],
    classes = [],
    teachers = [],
    addToast,
    loadAdminTools,
  } = useSchoolAdmin();

  const [catalog, setCatalog] = useState<SchoolSubjectCatalog | null>(null);
  const [academicSetup, setAcademicSetup] = useState<SchoolAcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchoolSubjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [academicSubjectId, setAcademicSubjectId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [accessMode, setAccessMode] = useState<SchoolSubjectAccessMode>('all_grade');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');

  const load = async () => {
    if (!school?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [subjectCatalog, setup] = await Promise.all([
        fetchSchoolSubjectCatalog(school.id),
        fetchSchoolAcademicSetup(school.id),
      ]);
      setCatalog(subjectCatalog);
      setAcademicSetup(setup);
    } catch (error) {
      console.error('Failed to load school subjects workspace', error);
      setLoadError(error instanceof Error ? error.message : 'School subjects are unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school?.id]);

  const academicChoices = useMemo(() => {
    const choices = new Map<string, AcademicChoice>();
    (academicSetup?.frameworks || []).forEach((framework) => {
      framework.subjects.forEach((subject) => {
        const existing = choices.get(subject.academicSubjectId);
        if (!existing) {
          choices.set(subject.academicSubjectId, {
            id: subject.academicSubjectId,
            name: subject.name,
            code: subject.code,
            scopes: [...subject.scopes],
          });
          return;
        }
        const known = new Set(existing.scopes.map((scope) => scope.scopeId));
        subject.scopes.forEach((scope) => { if (!known.has(scope.scopeId)) existing.scopes.push(scope); });
      });
    });
    return Array.from(choices.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [academicSetup?.frameworks]);

  const selectedAcademic = academicChoices.find((item) => item.id === academicSubjectId) || null;
  const currentYear = academicSetup?.years.find((year) => year.status === 'current') || academicSetup?.years[0] || null;
  const selectedScope = selectedAcademic?.scopes.find((scope) => Number(scope.gradeLevel) === Number(gradeLevel)) || null;

  const activeClasses = useMemo(() => classes.filter((item: any) => item.is_active !== false), [classes]);
  const schoolGrades = useMemo(() => Array.from(new Set([
    ...activeClasses.map((item: any) => Number(item.grade_level)),
    ...students.map((item: any) => Number(item.grade)),
    ...(catalog?.subjects || []).flatMap((subject) => subject.offerings.map((offering) => Number(offering.gradeLevel))),
  ].filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 12))).sort((a, b) => a - b), [activeClasses, catalog?.subjects, students]);

  const gradeStudents = useMemo(() => students
    .filter((student: any) => gradeLevel && Number(student.grade) === Number(gradeLevel))
    .sort((a: any, b: any) => studentName(a).localeCompare(studentName(b))), [gradeLevel, students]);

  const visibleStudents = useMemo(() => {
    const normalized = studentSearch.trim().toLowerCase();
    if (!normalized) return gradeStudents;
    return gradeStudents.filter((student: any) => [student.full_name, student.username, student.email]
      .some((value) => String(value || '').toLowerCase().includes(normalized)));
  }, [gradeStudents, studentSearch]);

  const filteredSubjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (catalog?.subjects || []).filter((subject) => {
      if (mappingFilter !== 'all' && subject.mappingStatus !== mappingFilter) return false;
      if (!normalized) return true;
      return [subject.name, subject.code, subject.academicSubjectName]
        .some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [catalog?.subjects, mappingFilter, query]);

  const mappedCount = (catalog?.subjects || []).filter((subject) => subject.mappingStatus === 'mapped').length;
  const unmappedCount = (catalog?.subjects || []).filter((subject) => subject.mappingStatus === 'unmapped').length;

  const resetEditor = () => {
    setEditingSubjectId(null);
    setName('');
    setCode('');
    setCodeTouched(false);
    setAcademicSubjectId('');
    setGradeLevel('');
    setAccessMode('all_grade');
    setSelectedStudentIds(new Set());
    setStudentSearch('');
  };

  const openCreate = () => {
    resetEditor();
    setEditorOpen(true);
  };

  const loadOfferingIntoEditor = (offering?: SchoolSubjectOffering | null) => {
    if (!offering) {
      setGradeLevel('');
      setAccessMode('all_grade');
      setSelectedStudentIds(new Set());
      return;
    }
    setGradeLevel(offering.gradeLevel);
    setAccessMode(offering.accessMode);
    setSelectedStudentIds(new Set(offering.selectedStudentIds || []));
  };

  const openEdit = (subject: SchoolSubjectRecord) => {
    setEditingSubjectId(subject.id);
    setName(subject.name);
    setCode(subject.code || '');
    setCodeTouched(Boolean(subject.code));
    setAcademicSubjectId(subject.academicSubjectId || '');
    setStudentSearch('');
    loadOfferingIntoEditor(subject.offerings[0]);
    setEditorOpen(true);
  };

  const selectGrade = (value: string) => {
    setGradeLevel(value);
    const subject = editingSubjectId ? catalog?.subjects.find((item) => item.id === editingSubjectId) : null;
    const existing = subject?.offerings.find((offering) => offering.gradeLevel === value);
    if (existing) {
      setAccessMode(existing.accessMode);
      setSelectedStudentIds(new Set(existing.selectedStudentIds || []));
    } else {
      setAccessMode('all_grade');
      setSelectedStudentIds(new Set());
    }
  };

  const updateName = (value: string) => {
    setName(value);
    if (!codeTouched) setCode(normalizeCode(value));
  };

  const toggleStudent = (id: string) => setSelectedStudentIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async () => {
    if (!school?.id || !name.trim()) return;
    if (gradeLevel && !currentYear?.id) {
      addToast('Create or activate an academic year before adding a grade offering.', 'info');
      return;
    }
    if (accessMode === 'selected' && gradeLevel && selectedStudentIds.size === 0) {
      addToast('Select at least one student, or choose the whole grade.', 'info');
      return;
    }
    setSaving(true);
    try {
      const result = await saveSchoolSubject({
        schoolId: school.id,
        schoolSubjectId: editingSubjectId,
        name,
        code,
        academicSubjectId: academicSubjectId || null,
        academicYearId: gradeLevel ? currentYear?.id || null : null,
        gradeLevel: gradeLevel || null,
        curriculumScopeId: academicSubjectId && gradeLevel ? selectedScope?.scopeId || null : null,
        accessMode,
        selectedStudentIds: accessMode === 'selected' && gradeLevel ? Array.from(selectedStudentIds) : [],
        teacherUserId: null,
        classIds: [],
        replaceTeacherAllocations: false,
      });
      const subjectLabel = result.name || name.trim();
      addToast(
        academicSubjectId
          ? `${subjectLabel} saved as an independent school subject.`
          : `${subjectLabel} saved. Academic mapping attention has been requested automatically.`,
        'success',
      );
      setEditorOpen(false);
      resetEditor();
      await Promise.all([
        load(),
        typeof loadAdminTools === 'function' ? loadAdminTools(school.id) : Promise.resolve(),
      ]);
    } catch (error) {
      console.error('Failed to save school subject', error);
      addToast(error instanceof Error ? error.message : 'The subject could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!school?.id || !deleteTarget) return;
    setDeleting(true);
    try {
      const deleted = await deleteSchoolSubject(school.id, deleteTarget.id);
      addToast(`${deleted.name || deleteTarget.name} was removed. Historical assignments and results were preserved.`, 'success');
      setDeleteTarget(null);
      await Promise.all([
        load(),
        typeof loadAdminTools === 'function' ? loadAdminTools(school.id) : Promise.resolve(),
      ]);
    } catch (error) {
      console.error('Failed to delete school subject', error);
      addToast(error instanceof Error ? error.message : 'The subject could not be removed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-10 w-80 max-w-full animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-50" />)}
        </div>
        <div className="mt-6 h-72 animate-pulse rounded-2xl bg-slate-50" />
      </section>
    );
  }

  if (loadError || !catalog) {
    return (
      <section className="rounded-[28px] border border-rose-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-600">School Subjects</p>
        <h3 className="mt-2 text-xl font-bold text-slate-950">Subject catalogue unavailable</h3>
        <p className="mt-2 text-sm text-slate-600">{loadError || 'The subject catalogue could not be loaded.'}</p>
        <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
      </section>
    );
  }

  return (
    <section className="space-y-5 text-slate-900">
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_60px_-44px_rgba(15,23,42,0.55)]">
        <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Source of truth</span>
                {catalog.academicYearName ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{catalog.academicYearName}</span> : null}
              </div>
              <h3 className="mt-3 text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-[30px]">School Subjects</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Your school owns this catalogue. Create any subject you teach, then optionally connect it to a Brains Heist academic subject to unlock governed curriculum and question resources.
              </p>
            </div>
            <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-blue-100 transition hover:bg-blue-800 lg:self-center">
              <span className="text-lg leading-none">+</span> Add subject
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white p-5 sm:px-7">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Active subjects</span>
            <strong className="mt-1 block text-3xl tracking-tight text-slate-950">{catalog.subjects.length}</strong>
            <p className="mt-1 text-xs text-slate-500">Defined by {school?.name || 'your school'}</p>
          </div>
          <div className="bg-white p-5 sm:px-7">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Academic resources</span>
            <strong className="mt-1 block text-3xl tracking-tight text-emerald-700">{mappedCount}</strong>
            <p className="mt-1 text-xs text-slate-500">Mapped to governed academic content</p>
          </div>
          <div className="bg-white p-5 sm:px-7">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Needs attention</span>
            <strong className={`mt-1 block text-3xl tracking-tight ${unmappedCount ? 'text-amber-700' : 'text-slate-950'}`}>{unmappedCount}</strong>
            <p className="mt-1 text-xs text-slate-500">Valid school subjects awaiting an academic map</p>
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block flex-1 lg:max-w-md">
            <span className="sr-only">Search school subjects</span>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Search subjects or academic mappings…"
            />
          </label>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {([
              ['all', 'All'],
              ['mapped', 'Mapped'],
              ['unmapped', 'Needs mapping'],
            ] as Array<[MappingFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setMappingFilter(value)} className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${mappingFilter === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
            ))}
          </div>
        </div>

        {filteredSubjects.length ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_minmax(150px,1fr)_120px_160px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 lg:grid">
              <span>School subject</span><span>Academic resources</span><span>Availability</span><span>Students</span><span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200">
              {filteredSubjects.map((subject) => {
                const offering = subject.offerings[0];
                const grades = subject.offerings.map((item) => gradeLabel(item.gradeLevel));
                const selectedCount = subject.offerings.reduce((sum, item) => sum + (item.accessMode === 'selected' ? item.selectedStudentIds.length : 0), 0);
                const teacherIds = new Set(subject.offerings.flatMap((item) => item.teacherUserIds || []));
                const teacherLabels = teachers.filter((teacher: any) => teacherIds.has(teacher.user_id)).map(teacherName);
                return (
                  <article key={subject.id} className="grid gap-4 px-5 py-5 transition hover:bg-slate-50/70 lg:grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_minmax(150px,1fr)_120px_160px] lg:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-xs font-bold text-white">{initials(subject.name)}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-[15px] font-bold text-slate-950">{subject.name}</h4>
                          {subject.code ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-500">{subject.code}</span> : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{teacherLabels.length ? teacherLabels.join(', ') : 'No teacher allocated yet'}</p>
                      </div>
                    </div>

                    <div>
                      {subject.mappingStatus === 'mapped' ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><span>✓</span>{subject.academicSubjectName}</span>
                          <p className="mt-1.5 text-xs text-slate-500">Shared curriculum &amp; question resources</p>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700"><span>!</span> Academic mapping needed</span>
                          <p className="mt-1.5 text-xs text-slate-500">Platform academics notified</p>
                        </div>
                      )}
                    </div>

                    <div>
                      {grades.length ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">{grades.map((item) => <span key={item} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">{item}</span>)}</div>
                          <p className="mt-1.5 text-xs text-slate-500">{subject.offerings.map((item) => item.accessMode === 'selected' ? `${gradeLabel(item.gradeLevel)} selective` : `${gradeLabel(item.gradeLevel)} whole grade`).join(' · ')}</p>
                        </>
                      ) : <span className="text-xs font-medium text-slate-400">Not offered to a grade yet</span>}
                    </div>

                    <div>
                      {offering ? (
                        offering.accessMode === 'selected'
                          ? <><strong className="block text-sm text-slate-900">{selectedCount}</strong><span className="text-xs text-slate-500">selected</span></>
                          : <><strong className="block text-sm text-slate-900">Whole grade</strong><span className="text-xs text-slate-500">automatic access</span></>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </div>

                    <div className="flex gap-2 lg:justify-end">
                      <button type="button" onClick={() => openEdit(subject)} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">Edit</button>
                      <button type="button" onClick={() => setDeleteTarget(subject)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50">Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-xl shadow-sm ring-1 ring-slate-200">◎</div>
            <h4 className="mt-4 text-sm font-bold text-slate-800">{catalog.subjects.length ? 'No subjects match this view' : 'Create your school’s first subject'}</h4>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">{catalog.subjects.length ? 'Try a different search or mapping filter.' : 'Subject names belong to your school. Add exactly the subjects your school teaches; academic mapping is optional and never changes the subject’s identity.'}</p>
            {!catalog.subjects.length ? <button type="button" onClick={openCreate} className="mt-5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">Add first subject</button> : null}
          </div>
        )}
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/45 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="school-subject-editor-title">
          <button type="button" aria-label="Close subject editor" className="absolute inset-0 cursor-default" onClick={() => !saving && setEditorOpen(false)} />
          <div className="relative flex h-full w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-8">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">{editingSubjectId ? 'Manage subject' : 'New school subject'}</span>
                <h3 id="school-subject-editor-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{editingSubjectId ? name || 'Edit subject' : 'Add a subject'}</h3>
                <p className="mt-1 text-sm text-slate-500">The school subject stays independent even when it shares academic resources with another subject.</p>
              </div>
              <button type="button" disabled={saving} onClick={() => setEditorOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-50">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="space-y-7">
                <section>
                  <div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white">1</span><div><h4 className="text-sm font-bold text-slate-950">Subject identity</h4><p className="text-xs text-slate-500">Use the name your school actually uses.</p></div></div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                    <label><span className="text-xs font-bold text-slate-700">Subject name</span><input autoFocus={!editingSubjectId} value={name} onChange={(event) => updateName(event.target.value)} placeholder="e.g. ESL, Math Club, Chinese" className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
                    <label><span className="text-xs font-bold text-slate-700">Code <span className="font-normal text-slate-400">optional</span></span><input value={code} onChange={(event) => { setCodeTouched(true); setCode(event.target.value.toUpperCase()); }} placeholder="ESL" className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-semibold uppercase tracking-wide text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
                  </div>
                </section>

                <section className="border-t border-slate-200 pt-6">
                  <div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white">2</span><div><h4 className="text-sm font-bold text-slate-950">Academic resources</h4><p className="text-xs text-slate-500">Optional. Mapping shares curriculum/questions; it never merges the subject.</p></div></div>
                  <label className="block"><span className="text-xs font-bold text-slate-700">Map to Brains Heist academic subject</span><select value={academicSubjectId} onChange={(event) => setAcademicSubjectId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="">No academic mapping yet</option>{academicChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  {academicSubjectId ? (
                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span><div><p className="text-sm font-semibold text-emerald-950">{name.trim() || 'This subject'} will use {selectedAcademic?.name} academic resources.</p><p className="mt-1 text-xs leading-5 text-emerald-800">Assignments, grades and student membership remain attached to <strong>{name.trim() || 'the school subject'}</strong>, not to {selectedAcademic?.name}.</p></div></div></div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500 text-sm font-bold text-white">!</span><div><p className="text-sm font-semibold text-amber-950">Academic mapping needed</p><p className="mt-1 text-xs leading-5 text-amber-800">You can still create and use this school subject. Brains Heist will open an academic-mapping request and notify the platform team. Governed question resources stay unavailable until a mapping is added.</p></div></div></div>
                  )}
                </section>

                <section className="border-t border-slate-200 pt-6">
                  <div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white">3</span><div><h4 className="text-sm font-bold text-slate-950">Grade &amp; student access</h4><p className="text-xs text-slate-500">Optional now; you can add or change an offering later.</p></div></div>
                  <label className="block"><span className="text-xs font-bold text-slate-700">Grade</span><select value={gradeLevel} onChange={(event) => selectGrade(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="">No grade offering yet</option>{schoolGrades.map((grade) => <option key={grade} value={String(grade)}>{gradeLabel(grade)}</option>)}</select></label>

                  {gradeLevel ? (
                    <div className="mt-4 space-y-4">
                      {academicSubjectId && !selectedScope ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><strong>{selectedAcademic?.name}</strong> is mapped at subject level, but no governed curriculum scope is currently available for {gradeLabel(gradeLevel)}. The school subject can still be saved; grade-specific question-bank resources will remain unavailable until curriculum coverage is added.</div> : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => setAccessMode('all_grade')} className={`rounded-2xl border p-4 text-left transition ${accessMode === 'all_grade' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}><span className="text-sm font-bold text-slate-950">Everyone in {gradeLabel(gradeLevel)}</span><p className="mt-1 text-xs text-slate-500">Automatically available to the whole grade.</p></button>
                        <button type="button" onClick={() => setAccessMode('selected')} className={`rounded-2xl border p-4 text-left transition ${accessMode === 'selected' ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 hover:border-slate-300'}`}><span className="text-sm font-bold text-slate-950">Selected students</span><p className="mt-1 text-xs text-slate-500">Use for ESL, clubs, interventions or specialist groups.</p></button>
                      </div>

                      {accessMode === 'selected' ? (
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          <div className="border-b border-slate-200 bg-slate-50 p-3.5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students…" className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-500" /><div className="flex gap-2"><button type="button" onClick={() => setSelectedStudentIds(new Set(gradeStudents.map(studentId)))} className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-blue-700 ring-1 ring-slate-200">Select all</button><button type="button" onClick={() => setSelectedStudentIds(new Set())} className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">Clear</button></div></div><p className="mt-2 text-[11px] font-semibold text-slate-500">{selectedStudentIds.size} of {gradeStudents.length} selected</p></div>
                          <div className="max-h-52 overflow-y-auto p-2">{visibleStudents.length ? visibleStudents.map((student: any) => { const id = studentId(student); const checked = selectedStudentIds.has(id); return <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><input type="checkbox" checked={checked} onChange={() => toggleStudent(id)} className="h-4 w-4 accent-blue-700" /><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{initials(studentName(student))}</span><span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{studentName(student)}</strong><span className="block truncate text-[11px] text-slate-500">{student.email || gradeLabel(gradeLevel)}</span></span></label>; }) : <p className="p-5 text-center text-xs text-slate-500">No students found in {gradeLabel(gradeLevel)}.</p>}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                {gradeLevel ? (
                  <section className="border-t border-slate-200 pt-6">
                    <div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white">4</span><div><h4 className="text-sm font-bold text-slate-950">Teaching groups &amp; staffing</h4><p className="text-xs text-slate-500">Teaching groups decide who studies together. Registration classes remain unchanged.</p></div></div>
                    {(() => {
                      const currentSubject = editingSubjectId ? catalog.subjects.find((item) => item.id === editingSubjectId) : null;
                      const currentOffering = currentSubject?.offerings.find((item) => String(item.gradeLevel) === String(gradeLevel));
                      return currentOffering ? (
                        <SubjectTeachingGroupsPanel
                          schoolId={school.id}
                          subjectName={name || currentSubject?.name || 'Subject'}
                          offering={currentOffering}
                          classes={classes}
                          students={students}
                          teachers={teachers}
                          addToast={addToast}
                          onChanged={load}
                        />
                      ) : (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-xs leading-5 text-blue-900">
                          <strong className="block text-sm">Save the subject offering first</strong>
                          After saving, reopen this subject to choose <strong>By registration class</strong>, <strong>Whole grade</strong>, or <strong>Custom teaching groups</strong>, then allocate teachers to the exact group they teach.
                        </div>
                      );
                    })()}
                  </section>
                ) : null}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-6 py-4 sm:px-8"><div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><button type="button" disabled={saving} onClick={() => setEditorOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Cancel</button><button type="button" disabled={saving || !name.trim()} onClick={() => void handleSave()} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? 'Saving…' : editingSubjectId ? 'Save changes' : 'Create subject'}</button></div></div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[2px]" role="alertdialog" aria-modal="true" aria-labelledby="delete-school-subject-title">
          <div className="w-full max-w-md rounded-[26px] bg-white p-6 shadow-2xl">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-xl text-rose-600">!</span>
            <h3 id="delete-school-subject-title" className="mt-4 text-xl font-bold text-slate-950">Delete {deleteTarget.name}?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">The subject will disappear from active school operations, student access and teacher allocations. Historical assignments, results and reports will be preserved.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" disabled={deleting} onClick={() => void handleDelete()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:bg-rose-300">{deleting ? 'Deleting…' : 'Delete subject'}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default SchoolSubjectsManager;
