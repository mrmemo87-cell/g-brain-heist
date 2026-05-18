import React, { useEffect, useMemo, useState } from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import {
  rpcIeltsPracticeArchiveAssignment,
  rpcIeltsPracticeAssignToClass,
  rpcIeltsPracticeAssignmentDetail,
  rpcIeltsPracticeCloseAssignment,
  rpcIeltsPracticeCreateAssignment,
  rpcIeltsPracticeListAssignments,
  rpcIeltsPracticeRestoreAssignment,
  rpcIeltsPracticeUpdateAssignment,
  type IeltsPracticeAssignmentDetail,
  type IeltsPracticeAssignmentListStatusFilter,
  type IeltsPracticeAssignmentItemInput,
  type IeltsPracticeAssignmentStudentProgress,
  type IeltsPracticeAssignmentSummary,
  type IeltsPracticeStudentStatus,
} from '../../../services/ieltsPracticeAssignmentService';
import {
  rpcIeltsPracticeContentCatalog,
  type IeltsPracticeContentCatalogItem,
} from '../../../services/ieltsPracticeContentService';

type DraftItem = IeltsPracticeAssignmentItemInput & {
  localId: string;
  description?: string | null;
  difficulty?: string | null;
  band?: string | null;
};
type ProgressFilter = 'all' | 'assigned' | 'in_progress' | 'completed' | 'overdue';
type AssignmentStatusFilter = Extract<IeltsPracticeAssignmentListStatusFilter, 'active' | 'archived'>;

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

const assignmentStatusFilters: Array<{ value: AssignmentStatusFilter; label: string; description: string }> = [
  { value: 'active', label: 'Active', description: 'Active = students can work; Closed = read-only, no new submissions' },
  { value: 'archived', label: 'Archived', description: 'Archived = hidden from active view, history preserved' },
];

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


const toLocalDateTimeInputValue = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
};

const statusBadgeClasses: Record<string, string> = {
  draft: 'border-gray-500/50 bg-gray-500/10 text-gray-200',
  assigned: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
  closed: 'border-amber-400/50 bg-amber-500/10 text-amber-100',
  archived: 'border-slate-500/50 bg-slate-500/10 text-slate-200',
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
  const { classes = [], students = [], studentAssignments = {}, school, addToast } = useSchoolAdmin();
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<AssignmentStatusFilter>('active');
  const [assignments, setAssignments] = useState<IeltsPracticeAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutatingAssignmentId, setMutatingAssignmentId] = useState<string | null>(null);
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
  const [contentSkillFilter, setContentSkillFilter] = useState('reading');
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueAt, setEditDueAt] = useState('');

  const selectedClass = useMemo(
    () => classes.find((cls: any) => cls.id === classId) ?? null,
    [classes, classId]
  );

  const selectedProgressAssignment = assignmentDetail?.assignment ?? assignments.find((row) => row.id === selectedAssignmentId) ?? null;

  const selectedClassStudentCount = useMemo(() => {
    if (!classId) return null;
    return students.filter((student: any) => {
      const studentId = student.user_id ?? student.id;
      return student.class_id === classId || student.classId === classId || studentAssignments[studentId] === classId;
    }).length;
  }, [classId, students, studentAssignments]);

  const hasSelectedContent = items.some((item) => item.contentId.trim());

  const selectedItemKeys = useMemo(() => new Set(items
    .filter((item) => item.contentType && item.contentId.trim())
    .map((item) => `${item.contentType}:${item.contentId.trim()}`)), [items]);

  const groupedContentCatalog = useMemo(() => {
    const groups = new Map<string, IeltsPracticeContentCatalogItem[]>();
    for (const content of contentCatalog) {
      const groupKey = String(content.skill || 'other');
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), content]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [contentCatalog]);

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
      const rows = await rpcIeltsPracticeListAssignments({ schoolId: school.id, statusFilter: assignmentStatusFilter });
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
  }, [school?.id, assignmentStatusFilter]);

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
    const contentKey = `${content.content_type}:${content.content_id}`;
    const duplicateItem = items.find((item) => item.localId !== localId && `${item.contentType}:${item.contentId.trim()}` === contentKey);
    if (duplicateItem) {
      setError('This IELTS practice content is already in the assignment. Choose a different item to avoid duplicate student work.');
      return;
    }
    updateItem(localId, {
      skill: content.skill,
      contentType: content.content_type,
      contentId: content.content_id,
      title: content.title,
      description: content.description,
      difficulty: content.difficulty,
      band: content.band,
    });
    setError(null);
    setPickerOpenFor(null);
    setContentSearch('');
  };

  const openContentPicker = (item: DraftItem) => {
    const isOpening = pickerOpenFor !== item.localId;
    setPickerOpenFor(isOpening ? item.localId : null);
    if (isOpening) {
      setContentSkillFilter(String(item.skill));
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

  const moveItem = (localId: string, direction: -1 | 1) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
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

    const duplicateKeys = new Set<string>();
    const duplicateIndex = items.findIndex((item) => {
      const key = `${item.contentType}:${item.contentId.trim()}`;
      if (duplicateKeys.has(key)) return true;
      duplicateKeys.add(key);
      return false;
    });
    if (duplicateIndex >= 0) {
      setError(`Item ${duplicateIndex + 1} duplicates content already selected in this assignment. Remove it or choose a different IELTS practice item.`);
      return;
    }

    const mismatchIndex = items.findIndex((item) => item.contentType && item.contentType !== contentTypesBySkill[String(item.skill)]);
    if (mismatchIndex >= 0) {
      setError(`Item ${mismatchIndex + 1} content type does not match the selected skill. Fix the skill or content type before assigning.`);
      return;
    }

    if (!items.some((item) => item.required ?? true)) {
      setError('Mark at least one IELTS practice item as required so students have a clear completion target.');
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
      setAssignmentStatusFilter('active');
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


  const beginEditAssignment = (assignment: IeltsPracticeAssignmentSummary) => {
    if (assignment.status === 'archived') return;
    setEditingAssignmentId(assignment.id);
    setEditTitle(assignment.title);
    setEditDescription(assignment.description ?? '');
    setEditDueAt(toLocalDateTimeInputValue(assignment.due_at));
    setError(null);
  };

  const cancelEditAssignment = () => {
    setEditingAssignmentId(null);
    setEditTitle('');
    setEditDescription('');
    setEditDueAt('');
  };

  const handleUpdateAssignment = async (assignmentId: string) => {
    if (!editTitle.trim()) {
      setError('Add an assignment title before saving changes.');
      return;
    }

    setMutatingAssignmentId(assignmentId);
    setError(null);
    try {
      const updated = await rpcIeltsPracticeUpdateAssignment({
        assignmentId,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        dueAt: editDueAt ? new Date(editDueAt).toISOString() : null,
      });
      setAssignments((current) => current.map((row) => (row.id === assignmentId ? { ...row, ...updated } : row)));
      setAssignmentDetail((current) => current?.assignment.id === assignmentId ? { ...current, assignment: { ...current.assignment, ...updated } } : current);
      cancelEditAssignment();
      addToast?.('IELTS practice assignment updated.', 'success');
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Unable to update IELTS practice assignment.';
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setMutatingAssignmentId(null);
    }
  };

  const handleCloseAssignment = async (assignmentId: string) => {
    setMutatingAssignmentId(assignmentId);
    setError(null);
    try {
      const updated = await rpcIeltsPracticeCloseAssignment(assignmentId);
      setAssignments((current) => current.map((row) => (row.id === assignmentId ? { ...row, ...updated } : row)));
      setAssignmentDetail((current) => current?.assignment.id === assignmentId ? { ...current, assignment: { ...current.assignment, ...updated } } : current);
      addToast?.('IELTS practice assignment closed. Students can view it read-only.', 'success');
    } catch (closeError) {
      const message = closeError instanceof Error ? closeError.message : 'Unable to close IELTS practice assignment.';
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setMutatingAssignmentId(null);
    }
  };

  const handleArchiveAssignment = async (assignmentId: string) => {
    setMutatingAssignmentId(assignmentId);
    setError(null);
    try {
      await rpcIeltsPracticeArchiveAssignment(assignmentId);
      setAssignments((current) => current.filter((row) => row.id !== assignmentId));
      if (selectedAssignmentId === assignmentId) {
        setSelectedAssignmentId(null);
        setAssignmentDetail(null);
      }
      if (editingAssignmentId === assignmentId) {
        cancelEditAssignment();
      }
      addToast?.('IELTS practice assignment archived. Progress history was preserved.', 'success');
    } catch (archiveError) {
      const message = archiveError instanceof Error ? archiveError.message : 'Unable to archive IELTS practice assignment.';
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setMutatingAssignmentId(null);
    }
  };

  const handleRestoreAssignment = async (assignmentId: string) => {
    setMutatingAssignmentId(assignmentId);
    setError(null);
    try {
      await rpcIeltsPracticeRestoreAssignment(assignmentId, 'closed');
      setAssignments((current) => current.filter((row) => row.id !== assignmentId));
      if (selectedAssignmentId === assignmentId) {
        setSelectedAssignmentId(null);
        setAssignmentDetail(null);
      }
      addToast?.('IELTS practice assignment restored as closed. Progress history was preserved.', 'success');
    } catch (restoreError) {
      const message = restoreError instanceof Error ? restoreError.message : 'Unable to restore IELTS practice assignment.';
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setMutatingAssignmentId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="ielts-practice-admin-tab">
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-gray-900 to-emerald-950/40 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">IELTS Academy</p>
        <h3 className="mt-2 text-2xl font-bold text-white">IELTS Practice</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-50/80">
          Create school-scoped IELTS practice assignments for {school?.name ?? 'your school'} with a safe content picker for active
          IELTS practice content. Manual content IDs remain available as an advanced fallback.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1.2fr]">
        <label className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Class filter</span>
          <select data-testid="ielts-practice-class-select" className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-gray-200" value={classId} onChange={(event) => setClassId(event.target.value)}>
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
          {classId && selectedClassStudentCount === 0 && (
            <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs font-semibold text-amber-100">No students in this class. Add students before running the pilot assignment.</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
          <span className="mb-2 block font-semibold text-white">Completion tracking</span>
          <p className="text-gray-400">View roster progress by assignment with simple status filters. No charts yet.</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-gray-300" data-testid="ielts-practice-pilot-checklist">
          <span className="mb-2 block font-semibold text-white">Pilot checklist</span>
          <ul className="space-y-1 text-xs text-gray-300">
            <li>✓ Assignments created: {assignments.length > 0 ? 'ready' : 'create one assignment'}</li>
            <li>✓ Content selected: {hasSelectedContent ? 'selected' : 'choose catalog content'}</li>
            <li>✓ Class assigned: {classId ? 'class selected' : 'select a class'}</li>
            <li>✓ Progress visible: use View progress after assigning</li>
            <li>✓ Results visible: check IELTS Results after completed practice</li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-50" data-testid="ielts-practice-status-helper">
        <p className="font-semibold text-white">Assignment status guide</p>
        <p className="mt-1">Active = students can work. Closed = read-only, no new submissions. Archived = hidden from active view, history preserved.</p>
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
              <input data-testid="ielts-practice-title-input" className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Week 1 IELTS Practice" />
            </label>
            <label className="text-sm text-gray-300">
              <span className="mb-1 block font-semibold text-white">Due date</span>
              <input className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </label>
            <label className="text-sm text-gray-300 md:col-span-2">
              <span className="mb-1 block font-semibold text-white">Description</span>
              <textarea data-testid="ielts-practice-description-input" className="min-h-[80px] w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Instructions for students" />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="ielts-practice-selected-items">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h5 className="font-semibold text-white">Selected assignment items</h5>
                <p className="text-xs text-emerald-100/70">Drag-free ordering controls keep the student sequence clear before assigning.</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {items.map((item, index) => (
                <div key={`selected-${item.localId}`} className={`rounded-lg border p-3 ${item.contentId ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-amber-400/50 bg-amber-500/10'}`} data-testid={`ielts-practice-selected-item-${index}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">#{index + 1} · {String(item.skill)} · {item.required ?? true ? 'Required' : 'Optional'}</p>
                      <p className="mt-1 truncate font-semibold text-white">{item.title?.trim() || 'No content selected'}</p>
                      <p className="mt-1 text-xs text-gray-300">{item.contentType || contentTypesBySkill[String(item.skill)]} · {item.contentId || 'Choose content'}</p>
                    </div>
                    <button type="button" className="text-xs text-red-200 hover:text-red-100" onClick={() => removeItem(item.localId)} disabled={items.length === 1}>Remove</button>
                  </div>
                  {(item.difficulty || item.band) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.difficulty && <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-200">Difficulty: {item.difficulty}</span>}
                      {item.band && <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">Band {item.band}</span>}
                    </div>
                  )}
                  {item.description && <p className="mt-2 line-clamp-2 text-xs text-gray-300">{item.description}</p>}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => moveItem(item.localId, -1)} disabled={index === 0} className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Move up</button>
                    <button type="button" onClick={() => moveItem(item.localId, 1)} disabled={index === items.length - 1} className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 disabled:opacity-40">Move down</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div key={item.localId} className={`rounded-xl border p-4 ${item.contentId ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-gray-700 bg-black/20'}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-white">Item {index + 1}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-300">
                      <input type="checkbox" checked={item.required ?? true} onChange={(event) => updateItem(item.localId, { required: event.target.checked })} />
                      Required
                    </label>
                    <button type="button" className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 disabled:opacity-40" onClick={() => moveItem(item.localId, -1)} disabled={index === 0}>Move up</button>
                    <button type="button" className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 disabled:opacity-40" onClick={() => moveItem(item.localId, 1)} disabled={index === items.length - 1}>Move down</button>
                    <button type="button" className="text-sm text-red-300 hover:text-red-200 disabled:opacity-40" onClick={() => removeItem(item.localId)} disabled={items.length === 1}>Remove</button>
                  </div>
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
                        {(item.difficulty || item.band) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.difficulty && <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-200">Difficulty: {item.difficulty}</span>}
                            {item.band && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Band {item.band}</span>}
                          </div>
                        )}
                        {item.description && <p className="mt-2 line-clamp-2 text-xs text-gray-400">{item.description}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => openContentPicker(item)}
                        data-testid={`ielts-practice-content-picker-${index}`}
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
                        <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Skill filter
                            <select
                              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white"
                              value={contentSkillFilter}
                              onChange={(event) => {
                                setContentSkillFilter(event.target.value);
                                void loadContentCatalog(event.target.value, contentSearch);
                              }}
                            >
                              <option value="reading">Reading</option>
                              <option value="listening">Listening</option>
                              <option value="writing">Writing</option>
                              <option value="speaking">Speaking</option>
                            </select>
                          </label>
                          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Title search
                            <input
                              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white"
                              value={contentSearch}
                              onChange={(event) => setContentSearch(event.target.value)}
                              placeholder="Search by title"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void loadContentCatalog(contentSkillFilter, contentSearch)}
                            disabled={contentLoading}
                            className="self-end rounded-lg border border-emerald-400/50 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
                          >
                            {contentLoading ? 'Searching…' : 'Search catalog'}
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">Difficulty and band are shown for teacher comparison only; use skill and title to filter.</p>
                        {contentError && <p className="mt-2 text-sm text-red-200">{contentError}</p>}
                        {!contentLoading && contentCatalog.length === 0 && <p className="mt-3 rounded-lg border border-dashed border-gray-700 bg-gray-950/60 p-3 text-sm text-gray-300">No content found in picker. Try a different skill or title, then use the advanced fallback only if you know the content ID.</p>}
                        <div className="mt-3 max-h-72 space-y-4 overflow-y-auto">
                          {groupedContentCatalog.map(([skillGroup, groupItems]) => (
                            <div key={skillGroup} data-testid={`ielts-practice-content-group-${skillGroup}`}>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">{skillGroup}</p>
                              <div className="space-y-2">
                                {groupItems.map((content) => {
                                  const isSelected = selectedItemKeys.has(`${content.content_type}:${content.content_id}`);
                                  return (
                                    <button
                                      key={`${content.content_type}-${content.content_id}`}
                                      type="button"
                                      onClick={() => selectContent(item.localId, content)}
                                      data-testid={`ielts-practice-content-option-${content.content_type}-${content.content_id}`}
                                      className={`w-full rounded-lg border p-3 text-left ${isSelected ? 'border-emerald-300 bg-emerald-500/15 ring-1 ring-emerald-300/40' : 'border-gray-700 bg-gray-900 hover:border-emerald-400 hover:bg-emerald-500/10'}`}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-white">{content.title}</span>
                                        {isSelected && <span className="rounded-full bg-emerald-400 px-2 py-1 text-xs font-semibold text-emerald-950">Selected</span>}
                                        <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300">{content.skill}</span>
                                        {content.difficulty && <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300">Difficulty: {content.difficulty}</span>}
                                        {content.band && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Band {content.band}</span>}
                                      </div>
                                      {content.description && <p className="mt-2 line-clamp-2 text-xs text-gray-400">{content.description}</p>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
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
            <button type="button" data-testid="ielts-practice-create-assignment" onClick={handleCreateAssignment} disabled={saving} className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create & assign to class'}
            </button>
            <button type="button" onClick={() => void loadAssignments()} disabled={loading} className="rounded-xl border border-gray-600 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60">
              {loading ? 'Refreshing…' : 'Refresh list'}
            </button>
          </div>
        </section>

        <aside className="rounded-2xl border border-emerald-500/30 bg-gray-900/80 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Assignments</h4>
              <p className="mt-1 text-sm text-gray-400">Completion counts come from school-scoped IELTS assignment RPCs.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="IELTS practice assignment status">
              {assignmentStatusFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={assignmentStatusFilter === filter.value}
                  title={filter.description}
                  data-testid={`ielts-practice-${filter.value}-tab`}
                  onClick={() => {
                    setAssignmentStatusFilter(filter.value);
                    setSelectedAssignmentId(null);
                    setAssignmentDetail(null);
                    cancelEditAssignment();
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${assignmentStatusFilter === filter.value ? 'bg-emerald-500 text-white' : 'border border-gray-600 text-gray-300 hover:bg-gray-800'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {loading && <p className="text-sm text-gray-400">Loading assignments…</p>}
            {!loading && assignments.length === 0 && <p className="text-sm text-gray-400">{assignmentStatusFilter === 'archived' ? 'No archived IELTS practice assignments.' : 'No active IELTS practice assignments yet.'}</p>}
            {assignments.map((assignment) => {
              const isEditing = editingAssignmentId === assignment.id;
              const isMutating = mutatingAssignmentId === assignment.id;
              const statusClass = statusBadgeClasses[assignment.status] ?? statusBadgeClasses.draft;
              const isArchivedView = assignmentStatusFilter === 'archived' || assignment.status === 'archived';
              return (
                <div key={assignment.id} data-testid={`ielts-practice-assignment-${assignment.id}`} className={`rounded-xl border p-4 text-sm ${isArchivedView ? 'opacity-85' : ''} ${selectedAssignmentId === assignment.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-gray-700 bg-black/20'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{assignment.title}</p>
                        <span data-testid={`ielts-practice-status-${assignment.id}`} className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${statusClass}`}>{assignment.status}</span>
                        {isArchivedView && <span className="rounded-full border border-slate-600 bg-slate-800/70 px-2 py-1 text-xs font-semibold text-slate-300">Read-only archive</span>}
                      </div>
                      <p className="text-xs text-gray-500">{assignment.class_name ?? 'No class'}</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">{assignment.completion_percent ?? 0}% done</span>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 rounded-lg border border-gray-700 bg-gray-950/70 p-3" data-testid={`ielts-practice-edit-form-${assignment.id}`}>
                      <div className="grid gap-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Title
                          <input className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Due date
                          <input className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" type="datetime-local" value={editDueAt} onChange={(event) => setEditDueAt(event.target.value)} />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Description
                          <textarea className="mt-1 min-h-[72px] w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" data-testid={`ielts-practice-save-edit-${assignment.id}`} onClick={() => void handleUpdateAssignment(assignment.id)} disabled={isMutating} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">
                          {isMutating ? 'Saving…' : 'Save changes'}
                        </button>
                        <button type="button" onClick={cancelEditAssignment} disabled={isMutating} className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-gray-300 sm:grid-cols-3">
                    <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.total_students ?? 0}</strong>Total</div>
                    <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.assigned_count ?? 0}</strong>Assigned</div>
                    <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.in_progress_count ?? 0}</strong>Started</div>
                    <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.completed_count ?? 0}</strong>Done</div>
                    <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.overdue_count ?? 0}</strong>Overdue</div>
                    <div className="rounded-lg bg-gray-800 p-2"><strong className="block text-white">{assignment.excused_count ?? 0}</strong>Excused</div>
                  </div>
                  {(assignment.item_count ?? assignment.items?.length ?? 0) === 0 && (
                    <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs font-semibold text-amber-100">Assignment has no items. Add content before using it in the pilot.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                    <span>{assignment.item_count ?? assignment.items?.length ?? 0} items · Due {formatDateTime(assignment.due_at)}</span>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-testid={`ielts-practice-view-progress-${assignment.id}`} onClick={() => void loadAssignmentDetail(assignment.id)} disabled={progressLoading && selectedAssignmentId === assignment.id} className="rounded-lg border border-emerald-400/50 px-3 py-2 font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60">
                        {progressLoading && selectedAssignmentId === assignment.id ? 'Loading…' : 'View progress'}
                      </button>
                      {!isArchivedView && (
                        <>
                          <button type="button" data-testid={`ielts-practice-edit-${assignment.id}`} onClick={() => beginEditAssignment(assignment)} disabled={isMutating} className="rounded-lg border border-sky-400/50 px-3 py-2 font-semibold text-sky-200 hover:bg-sky-500/10 disabled:opacity-60">
                            Edit
                          </button>
                          <button type="button" data-testid={`ielts-practice-close-${assignment.id}`} onClick={() => void handleCloseAssignment(assignment.id)} disabled={assignment.status === 'closed' || isMutating} className="rounded-lg border border-amber-400/50 px-3 py-2 font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-60">
                            {isMutating ? 'Working…' : 'Close'}
                          </button>
                          <button type="button" data-testid={`ielts-practice-archive-${assignment.id}`} onClick={() => void handleArchiveAssignment(assignment.id)} disabled={isMutating} className="rounded-lg border border-red-400/50 px-3 py-2 font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60">
                            Archive
                          </button>
                        </>
                      )}
                      {isArchivedView && (
                        <button type="button" data-testid={`ielts-practice-restore-${assignment.id}`} onClick={() => void handleRestoreAssignment(assignment.id)} disabled={isMutating} className="rounded-lg border border-slate-400/50 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-500/10 disabled:opacity-60">
                          {isMutating ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
        {!progressLoading && assignmentDetail && (assignmentDetail.assignment.item_count ?? assignmentDetail.assignment.items?.length ?? 0) === 0 && (
          <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">Assignment has no items, so students have nothing to complete yet.</p>
        )}
        {!progressLoading && assignmentDetail && filteredProgressStudents.length === 0 && (
          <p className="mt-4 text-sm text-gray-400">{assignmentDetail.students.length === 0 ? 'No students in class for this assignment yet.' : 'No students match this filter.'}</p>
        )}

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
                  <div key={student.student_id} data-testid={`ielts-practice-progress-student-${student.student_id}`} className={`grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] md:gap-3 ${overdue ? 'bg-red-500/10' : 'bg-black/10'}`}>
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
