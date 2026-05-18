import React, { useEffect, useMemo, useState } from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import {
  rpcIeltsPracticeAssignToClass,
  rpcIeltsPracticeAssignmentDetail,
  rpcIeltsPracticeCreateAssignment,
  rpcIeltsPracticeListAssignments,
  type IeltsPracticeAssignmentDetail,
  type IeltsPracticeAssignmentItemInput,
  type IeltsPracticeAssignmentStudentProgress,
  type IeltsPracticeAssignmentSummary,
  type IeltsPracticeStudentStatus,
} from '../../../services/ieltsPracticeAssignmentService';
import {
  rpcIeltsPracticeContentCatalog,
  type IeltsPracticeContentCatalogItem,
} from '../../../services/ieltsPracticeContentService';

type DraftItem = IeltsPracticeAssignmentItemInput & { localId: string };
type ProgressFilter = 'all' | 'assigned' | 'in_progress' | 'completed' | 'overdue';

const newDraftItem = (): DraftItem => ({
  localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  skill: 'reading',
  contentType: 'ielts_reading_set',
  contentId: '',
  title: '',
  required: true,
});

const contentTypesBySkill: Record<string, string> = {
  reading: 'ielts_reading_set',
  listening: 'ielts_listening_set',
  writing: 'ielts_writing_task',
  speaking: 'ielts_speaking_task',
};

const progressFilters: Array<{ value: ProgressFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const isStudentOverdue = (assignment: IeltsPracticeAssignmentSummary, student: IeltsPracticeAssignmentStudentProgress) => {
  if (student.status === 'completed' || student.status === 'excused') return false;
  if (student.status === 'overdue') return true;
  if (!assignment.due_at) return false;
  const dueTime = new Date(assignment.due_at).getTime();
  return Number.isFinite(dueTime) && dueTime < Date.now();
};

const displayStudentStatus = (assignment: IeltsPracticeAssignmentSummary, student: IeltsPracticeAssignmentStudentProgress): IeltsPracticeStudentStatus => (
  isStudentOverdue(assignment, student) ? 'overdue' : student.status
);

const IeltsPracticeTab: React.FC = () => {
  const { classes = [], students = [], school, addToast } = useSchoolAdmin();
  const [assignments, setAssignments] = useState<IeltsPracticeAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [classId, setClassId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [assignmentDetail, setAssignmentDetail] = useState<IeltsPracticeAssignmentDetail | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');
  const [contentCatalog, setContentCatalog] = useState<IeltsPracticeContentCatalogItem[]>([]);
  const [contentSearch, setContentSearch] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((cls: any) => cls.id === classId) ?? null,
    [classes, classId]
  );

  const selectedProgressAssignment = assignmentDetail?.assignment ?? assignments.find((row) => row.id === selectedAssignmentId) ?? null;

  const filteredProgressStudents = useMemo(() => {
    if (!assignmentDetail) return [];
    return assignmentDetail.students.filter((student) => {
      const status = displayStudentStatus(assignmentDetail.assignment, student);
      return progressFilter === 'all' || status === progressFilter;
    });
  }, [assignmentDetail, progressFilter]);

  const loadAssignments = async () => {
    if (!school?.id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await rpcIeltsPracticeListAssignments({ schoolId: school.id });
      setAssignments(rows);
      if (selectedAssignmentId) {
        const selectedStillVisible = rows.some((row) => row.id === selectedAssignmentId);
        if (!selectedStillVisible) {
          setSelectedAssignmentId(null);
          setAssignmentDetail(null);
        }
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load IELTS practice assignments.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, [school?.id]);

  const loadContentCatalog = async (skill?: string, search = contentSearch) => {
    setContentLoading(true);
    setContentError(null);
    try {
      const rows = await rpcIeltsPracticeContentCatalog({ skill: skill || null, search: search || null, limit: 50 });
      setContentCatalog(rows);
    } catch (catalogError) {
      const message = catalogError instanceof Error ? catalogError.message : 'Unable to load IELTS practice content.';
      setContentError(message);
    } finally {
      setContentLoading(false);
    }
  };

  const loadAssignmentDetail = async (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setProgressFilter('all');
    setProgressLoading(true);
    setError(null);
    try {
      const detail = await rpcIeltsPracticeAssignmentDetail(assignmentId);
      setAssignmentDetail(detail);
      setAssignments((current) => current.map((row) => (row.id === assignmentId ? { ...row, ...detail.assignment } : row)));
    } catch (detailError) {
      const message = detailError instanceof Error ? detailError.message : 'Unable to load IELTS practice progress.';
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setProgressLoading(false);
    }
  };

  const selectContent = (localId: string, content: IeltsPracticeContentCatalogItem) => {
    updateItem(localId, {
      skill: content.skill,
      contentType: content.content_type,
      contentId: content.content_id,
      title: content.title,
    });
    setPickerOpenFor(null);
    setContentSearch('');
  };

  const openContentPicker = (item: DraftItem) => {
    const isOpening = pickerOpenFor !== item.localId;
    setPickerOpenFor(isOpening ? item.localId : null);
    if (isOpening) {
      void loadContentCatalog(String(item.skill), contentSearch);
    }
  };

  const updateItem = (localId: string, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => {
      if (item.localId !== localId) return item;
      const next = { ...item, ...patch };
      if (patch.skill) {
        next.contentType = contentTypesBySkill[String(patch.skill)] ?? next.contentType;
      }
      return next;
    }));
  };

  const removeItem = (localId: string) => {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.localId !== localId)));
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueAt('');
    setClassId('');
    setItems([newDraftItem()]);
  };

  const handleCreateAssignment = async () => {
    if (!school?.id) {
      setError('School context is required.');
      return;
    }
    if (!title.trim()) {
      setError('Add an assignment title first.');
      return;
    }
    if (!classId) {
      setError('Choose a class before assigning practice.');
      return;
    }

    const firstMissingIndex = items.findIndex((item) => !item.contentId.trim());
    if (firstMissingIndex >= 0) {
      setError(`Choose content for item ${firstMissingIndex + 1}, or enter a content ID in the advanced fallback.`);
      return;
    }

    const validItems = items.map((item, index) => ({
      skill: item.skill,
      contentType: item.contentType,
      contentId: item.contentId.trim(),
      title: item.title?.trim() || null,
      required: item.required ?? true,
      orderIndex: index,
    }));

    setSaving(true);
    setError(null);
    try {
      const created = await rpcIeltsPracticeCreateAssignment({
        schoolId: school.id,
        classId,
        title: title.trim(),
        description: description.trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        items: validItems,
      });
      const assigned = await rpcIeltsPracticeAssignToClass({ assignmentId: created.id, classId });
      setAssignments((current) => [assigned, ...current.filter((row) => row.id !== assigned.id)]);
      resetForm();
      addToast?.('IELTS practice assignment created and assigned.', 'success');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to create IELTS practice assignment.';
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-gray-900 to-emerald-950/40 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">IELTS Academy</p>
        <h3 className="mt-2 text-2xl font-bold text-white">IELTS Practice</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-50/80">
          Create school-scoped IELTS practice assignments for {school?.name ?? 'your school'} with a safe content picker for active
          IELTS practice content. Manual content IDs remain available as an advanced fallback.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Class filter</span>
          <select className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-gray-200" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Choose a class ({classes.length})</option>
            {classes.map((cls: any) => (
              <option key={cls.id} value={cls.id}>{cls.class_name}</option>
            ))}
          </select>
        </label>
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Student scope</span>
          <p className="text-gray-400">
            Assigning to {selectedClass?.class_name ?? 'a class'} will create student rows for matching school roster members.
          </p>
          <p className="mt-2 text-xs text-gray-500">Portal context currently has {students.length} students loaded.</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Completion tracking</span>
          <p className="text-gray-400">View roster progress by assignment with simple status filters. No charts yet.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="rounded-2xl border border-emerald-500/30 bg-gray-900/80 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Create practice assignment</h4>
              <p className="text-sm text-gray-400">Choose active IELTS practice content from the safe catalog, or use the advanced manual fallback.</p>
            </div>
            <button
              type="button"
              onClick={() => setItems((current) => [...current, newDraftItem()])}
              className="rounded-lg border border-emerald-400/50 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10"
            >
              + Add item
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-gray-300">
              <span className="mb-1 block font-semibold text-white">Title</span>
              <input className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Week 1 IELTS Practice" />
            </label>
            <label className="text-sm text-gray-300">
              <span className="mb-1 block font-semibold text-white">Due date</span>
              <input className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </label>
            <label className="text-sm text-gray-300 md:col-span-2">
              <span className="mb-1 block font-semibold text-white">Description</span>
              <textarea className="min-h-[80px] w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Instructions for students" />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div key={item.localId} className="rounded-xl border border-gray-700 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">Item {index + 1}</p>
                  <button type="button" className="text-sm text-red-300 hover:text-red-200" onClick={() => removeItem(item.localId)} disabled={items.length === 1}>Remove</button>
                </div>
                <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Skill
                    <select className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" value={item.skill} onChange={(event) => updateItem(item.localId, { skill: event.target.value })}>
                      <option value="reading">Reading</option>
                      <option value="listening">Listening</option>
                      <option value="writing">Writing</option>
                      <option value="speaking">Speaking</option>
                    </select>
                  </label>
                  <div className="rounded-lg border border-emerald-500/20 bg-gray-950/60 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Chosen content</p>
                        <p className="mt-1 font-semibold text-white">{item.title?.trim() || 'No content selected'}</p>
                        <p className="mt-1 text-xs text-gray-400">{item.contentType || contentTypesBySkill[String(item.skill)]} · {item.contentId || 'Choose content to fill ID'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openContentPicker(item)}
                        className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                      >
                        {pickerOpenFor === item.localId ? 'Close picker' : 'Choose content'}
                      </button>
                    </div>
                    {item.contentType && item.contentType !== contentTypesBySkill[String(item.skill)] && (
                      <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                        Warning: this content type does not match the selected skill. Students may be sent to the wrong practice route.
                      </p>
                    )}
                    {pickerOpenFor === item.localId && (
                      <div className="mt-3 rounded-xl border border-gray-700 bg-black/30 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white"
                            value={contentSearch}
                            onChange={(event) => setContentSearch(event.target.value)}
                            placeholder="Search by title"
                          />
                          <button
                            type="button"
                            onClick={() => void loadContentCatalog(String(item.skill), contentSearch)}
                            disabled={contentLoading}
                            className="rounded-lg border border-emerald-400/50 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
                          >
                            {contentLoading ? 'Searching…' : 'Search catalog'}
                          </button>
                        </div>
                        {contentError && <p className="mt-2 text-sm text-red-200">{contentError}</p>}
                        {!contentLoading && contentCatalog.length === 0 && <p className="mt-3 text-sm text-gray-400">No matching content found. Try a different title or use the advanced fallback below.</p>}
                        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                          {contentCatalog.map((content) => (
                            <button
                              key={`${content.content_type}-${content.content_id}`}
                              type="button"
                              onClick={() => selectContent(item.localId, content)}
                              className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-left hover:border-emerald-400 hover:bg-emerald-500/10"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-white">{content.title}</span>
                                <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300">{content.skill}</span>
                                {content.difficulty && <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300">{content.difficulty}</span>}
                                {content.band && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Band {content.band}</span>}
                              </div>
                              {content.description && <p className="mt-2 line-clamp-2 text-xs text-gray-400">{content.description}</p>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <details className="mt-3 rounded-lg border border-gray-700 bg-black/20 p-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-400">Advanced manual fallback</summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <input className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" value={item.contentType} onChange={(event) => updateItem(item.localId, { contentType: event.target.value })} placeholder="content_type" />
                        <input className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" value={item.contentId} onChange={(event) => updateItem(item.localId, { contentId: event.target.value })} placeholder="content_id" />
                        <input className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" value={item.title ?? ''} onChange={(event) => updateItem(item.localId, { title: event.target.value })} placeholder="Optional title" />
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={handleCreateAssignment} disabled={saving} className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create & assign to class'}
            </button>
            <button type="button" onClick={() => void loadAssignments()} disabled={loading} className="rounded-xl border border-gray-600 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60">
              {loading ? 'Refreshing…' : 'Refresh list'}
            </button>
          </div>
        </section>

        <aside className="rounded-2xl border border-emerald-500/30 bg-gray-900/80 p-5">
          <h4 className="text-lg font-semibold text-white">Assignments</h4>
          <p className="mt-1 text-sm text-gray-400">Completion counts come from school-scoped IELTS assignment RPCs.</p>
          <div className="mt-4 space-y-3">
            {loading && <p className="text-sm text-gray-400">Loading assignments…</p>}
            {!loading && assignments.length === 0 && <p className="text-sm text-gray-400">No IELTS practice assignments yet.</p>}
            {assignments.map((assignment) => (
              <div key={assignment.id} className={`rounded-xl border p-4 text-sm ${selectedAssignmentId === assignment.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-gray-700 bg-black/20'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{assignment.title}</p>
                    <p className="text-xs text-gray-500">{assignment.class_name ?? 'No class'} · {assignment.status}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">{assignment.completion_percent ?? 0}% done</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-gray-300 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.total_students ?? 0}</strong>Total</div>
                  <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.assigned_count ?? 0}</strong>Assigned</div>
                  <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.in_progress_count ?? 0}</strong>Started</div>
                  <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.completed_count ?? 0}</strong>Done</div>
                  <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.overdue_count ?? 0}</strong>Overdue</div>
                  <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.excused_count ?? 0}</strong>Excused</div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-400">
                  <span>{assignment.item_count ?? assignment.items?.length ?? 0} items · Due {formatDateTime(assignment.due_at)}</span>
                  <button type="button" onClick={() => void loadAssignmentDetail(assignment.id)} disabled={progressLoading && selectedAssignmentId === assignment.id} className="rounded-lg border border-emerald-400/50 px-3 py-2 font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60">
                    {progressLoading && selectedAssignmentId === assignment.id ? 'Loading…' : 'View progress'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="rounded-2xl border border-emerald-500/30 bg-gray-900/80 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">Student progress</h4>
            <p className="mt-1 text-sm text-gray-400">
              {selectedProgressAssignment ? `${selectedProgressAssignment.title} · ${selectedProgressAssignment.class_name ?? 'No class'}` : 'Choose an assignment to view roster completion.'}
            </p>
          </div>
          {assignmentDetail && (
            <div className="flex flex-wrap gap-2">
              {progressFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setProgressFilter(filter.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${progressFilter === filter.value ? 'bg-emerald-500 text-white' : 'border border-gray-600 text-gray-300 hover:bg-gray-800'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {progressLoading && <p className="mt-4 text-sm text-gray-400">Loading student progress…</p>}
        {!progressLoading && !assignmentDetail && <p className="mt-4 text-sm text-gray-400">No assignment selected.</p>}
        {!progressLoading && assignmentDetail && filteredProgressStudents.length === 0 && <p className="mt-4 text-sm text-gray-400">No students match this filter.</p>}

        {!progressLoading && assignmentDetail && filteredProgressStudents.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-700">
            <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] gap-3 bg-gray-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 md:grid">
              <span>Name</span>
              <span>Class</span>
              <span>Status</span>
              <span>Completed</span>
              <span>Updated</span>
            </div>
            <div className="divide-y divide-gray-800">
              {filteredProgressStudents.map((student) => {
                const status = displayStudentStatus(assignmentDetail.assignment, student);
                const overdue = status === 'overdue';
                return (
                  <div key={student.student_id} className={`grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] md:gap-3 ${overdue ? 'bg-red-500/10' : 'bg-black/10'}`}>
                    <div>
                      <p className="font-semibold text-white">{student.username || student.email || student.student_id}</p>
                      {student.email && <p className="text-xs text-gray-500">{student.email}</p>}
                    </div>
                    <p className="text-gray-300"><span className="md:hidden text-gray-500">Class: </span>{student.class_name ?? '—'}</p>
                    <p>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${overdue ? 'bg-red-500/20 text-red-200' : status === 'completed' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-gray-700 text-gray-200'}`}>
                        {status.replace(/_/g, ' ')}
                      </span>
                    </p>
                    <p className="text-gray-300"><span className="md:hidden text-gray-500">Completed: </span>{formatDateTime(student.completed_at)}</p>
                    <p className="text-gray-300"><span className="md:hidden text-gray-500">Updated: </span>{formatDateTime(student.updated_at)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default IeltsPracticeTab;
