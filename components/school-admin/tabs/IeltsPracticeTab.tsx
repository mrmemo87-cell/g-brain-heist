import { IeltsButton, IeltsNotice, IeltsConfirm } from '../../../src/components/ielts/IeltsUi';
import IeltsMaterialProvenance from "../../../src/components/ielts/IeltsMaterialProvenance";
import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useIeltsMaterialUsage } from '../../../src/pages/ielts/useIeltsMaterialUsage';
import { materialUsageLabel } from '../../../services/ieltsTeacherPracticeService';
import { friendlyIeltsAdminError } from '../../../src/lib/schoolAdminPresentation';

type DraftItem = IeltsPracticeAssignmentItemInput & {
  display_code?: string | null;
  originality_label?: string | null;
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

interface IeltsPracticeTabProps {
  onOpenReviews: () => void;
  initialAssignmentId?: string;
}

const IeltsPracticeTab: React.FC<IeltsPracticeTabProps> = ({ onOpenReviews, initialAssignmentId }) => {
  const { classes = [], students = [], studentCount = students.length, studentAssignments = {}, school, addToast } = useSchoolAdmin();
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [listClassId, setListClassId] = useState('');
  const [pendingAssignment, setPendingAssignment] = useState<IeltsPracticeAssignmentSummary | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; action: 'close' | 'archive' | 'restore' } | null>(null);
  const saveLock = useRef(false);
  const mutationLock = useRef(false);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const catalogRequest = useRef(0);
  const formHeading = useRef<HTMLHeadingElement>(null);
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
  const [historyRevision, setHistoryRevision] = useState(0);
  const [repeatScope, setRepeatScope] = useState('');
  const chosenMaterials = items.filter(i=>i.contentId.trim()).map(i=>({type:i.contentType,id:i.contentId.trim()}));
  const selectedUsage = useIeltsMaterialUsage(school?.id, chosenMaterials.slice(0,50), {classId:classId || undefined}, historyRevision);
  const catalogUsage = useIeltsMaterialUsage(school?.id, pickerOpenFor ? contentCatalog.map(c=>({type:c.content_type,id:c.content_id})).slice(0,50) : [], {classId:classId || undefined}, historyRevision);
  const repeatedMaterials = selectedUsage.data?.filter(u=>u.assigned_count>0) ?? [];
  const currentRepeatScope = JSON.stringify([school?.id,classId,chosenMaterials,selectedUsage.data]);
  const repeatAcknowledged = repeatScope === currentRepeatScope;


  const selectedClass = useMemo(
    () => classes.find((cls: any) => cls.id === classId) ?? null,
    [classes, classId]
  );

  const selectedProgressAssignment = assignmentDetail?.assignment ?? assignments.find((row) => row.id === selectedAssignmentId) ?? null;

  const selectedClassStudentCount = useMemo(() => {
    if (!classId) return null;
    if (typeof selectedClass?.student_count === 'number') return selectedClass.student_count;
    return students.filter((student: any) => {
      const studentId = student.user_id ?? student.id;
      return student.class_id === classId || student.classId === classId || studentAssignments[studentId] === classId;
    }).length;
  }, [classId, students, studentAssignments, selectedClass]);

  const visibleAssignments = assignments.filter(row => !listClassId || row.class_id === listClassId);
  useEffect(() => { if (creating) formHeading.current?.focus(); }, [creating, step]);
  useEffect(() => () => { detailRequest.current++; listRequest.current++; catalogRequest.current++; }, [school?.id]);

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
    const request = ++listRequest.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await rpcIeltsPracticeListAssignments({ schoolId: school.id, statusFilter: assignmentStatusFilter });
      if (request !== listRequest.current) return;
      setAssignments(rows);
      setHistoryRevision(n=>n+1);

    } catch (loadError) {
      const message = friendlyIeltsAdminError(loadError, 'Unable to load IELTS practice assignments. Please try again.');
      if (request === listRequest.current) setError(message);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, [school?.id, assignmentStatusFilter]);

  const loadContentCatalog = async (skill?: string, search = contentSearch) => {
    const request = ++catalogRequest.current;
    setContentLoading(true);
    setContentError(null);
    try {
      const rows = await rpcIeltsPracticeContentCatalog({ skill: skill || null, search: search || null, limit: 50 });
      if (request === catalogRequest.current) setContentCatalog(rows);
    } catch (catalogError) {
      const message = friendlyIeltsAdminError(catalogError, 'Unable to load IELTS practice content. Please try again.');
      if (request === catalogRequest.current) setContentError(message);
    } finally {
      if (request === catalogRequest.current) setContentLoading(false);
    }
  };

  const loadAssignmentDetail = async (assignmentId: string) => {
    const request = ++detailRequest.current;
    setAssignmentDetail(null);
    setSelectedAssignmentId(assignmentId);
    setProgressFilter('all');
    setProgressLoading(true);
    setError(null);
    try {
      const detail = await rpcIeltsPracticeAssignmentDetail(assignmentId);
      if (request !== detailRequest.current) return;
      setAssignmentDetail(detail);
      setAssignments((current) => current.map((row) => (row.id === assignmentId ? { ...row, ...detail.assignment } : row)));
    } catch (detailError) {
      const message = friendlyIeltsAdminError(detailError, 'Unable to load IELTS practice progress. Please try again.');
      if (request === detailRequest.current) { setError(message); addToast?.(message, 'error'); }
    } finally {
      if (request === detailRequest.current) setProgressLoading(false);
    }
  };

  useEffect(() => {
    if (initialAssignmentId) void loadAssignmentDetail(initialAssignmentId);
  }, [initialAssignmentId, school?.id]);

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
      display_code: content.display_code,
      originality_label: content.originality_label,
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
      if ((next.contentId !== item.contentId || next.contentType !== item.contentType) && !Object.prototype.hasOwnProperty.call(patch, 'display_code')) {
        next.display_code = undefined;
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
    if (saveLock.current || pendingAssignment) return;
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

    if (chosenMaterials.length > 50) {setError('Use up to 50 materials per assignment. Split larger plans into separate assignments.');return;}
    if (!selectedUsage.data || selectedUsage.error) {setError('Check previous material use before creating this assignment.');return;}
    if (repeatedMaterials.length && !repeatAcknowledged) {setError('Review previous use and confirm that this repeat is intentional.');return;}

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

    saveLock.current = true;
    setSaving(true);
    setError(null);
    let created: IeltsPracticeAssignmentSummary | null = null;
    try {
      created = await rpcIeltsPracticeCreateAssignment({
        schoolId: school.id,
        classId,
        title: title.trim(),
        description: description.trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        items: validItems,
      });
      setPendingAssignment(created);
      const assigned = await rpcIeltsPracticeAssignToClass({ assignmentId: created.id, classId });
      setAssignmentStatusFilter('active');
      setAssignments((current) => [assigned, ...current.filter((row) => row.id !== assigned.id)]);
      setPendingAssignment(null);
      setCreating(false);
      setHistoryRevision(n => n + 1);
      resetForm();
      addToast?.('IELTS practice assignment created and assigned.', 'success');
    } catch (saveError) {
      if (created) setAssignments(current => [created!, ...current.filter(row => row.id !== created!.id)]);
      const message = created
        ? 'Your assignment was saved, but class allocation could not be confirmed. Retry allocation below; this uses the same saved assignment.'
        : friendlyIeltsAdminError(saveError, 'Creation could not be confirmed. Refresh the assignment list and check for your title before trying again.');
      setError(message);
      addToast?.(message, 'error');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };


  const retryAllocation = async (assignment: IeltsPracticeAssignmentSummary) => {
    if (saveLock.current || !assignment.class_id) return;
    saveLock.current = true; setSaving(true); setError(null);
    try {
      const assigned = await rpcIeltsPracticeAssignToClass({ assignmentId: assignment.id, classId: assignment.class_id });
      setAssignments(current => [assigned, ...current.filter(row => row.id !== assigned.id)]);
      setPendingAssignment(null); setCreating(false); resetForm(); setHistoryRevision(n => n + 1);
      addToast?.('Assignment allocated to the class.', 'success');
    } catch {
      setError('Class allocation could not be confirmed. Your saved assignment is safe. Retry allocation when your connection is ready.');
    } finally { saveLock.current = false; setSaving(false); }
  };

  const nextStep = () => {
    setError(null);
    if (step === 0 && (!classId || !title.trim())) { setError('Choose a class and add an assignment title.'); return; }
    if (step === 0 && selectedClassStudentCount === 0) { setError('No students in this class. Add students before creating the assignment.'); return; }
    if (step === 1 && items.some(item => !item.contentId.trim())) { setError('Choose content for every item, or remove an unused item.'); return; }
    setStep(n => Math.min(2, n + 1));
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
      const message = friendlyIeltsAdminError(updateError, 'Unable to update the IELTS practice assignment. Please try again.');
      setError(message);
      addToast?.(message, 'error');
    } finally {
      setMutatingAssignmentId(null);
    }
  };

  const handleCloseAssignment = async (assignmentId: string) => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setMutatingAssignmentId(assignmentId);
    setError(null);
    try {
      const updated = await rpcIeltsPracticeCloseAssignment(assignmentId);
      setAssignments((current) => current.map((row) => (row.id === assignmentId ? { ...row, ...updated } : row)));
      setAssignmentDetail((current) => current?.assignment.id === assignmentId ? { ...current, assignment: { ...current.assignment, ...updated } } : current);
      addToast?.('IELTS practice assignment closed. Students can view it read-only.', 'success');
      return true;
    } catch (closeError) {
      const message = friendlyIeltsAdminError(closeError, 'Unable to close the IELTS practice assignment. Please try again.');
      setError(message);
      addToast?.(message, 'error');
      return false;
    } finally {
      mutationLock.current = false;
      setMutatingAssignmentId(null);
    }
  };

  const handleArchiveAssignment = async (assignmentId: string) => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
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
      return true;
    } catch (archiveError) {
      const message = friendlyIeltsAdminError(archiveError, 'Unable to archive the IELTS practice assignment. Please try again.');
      setError(message);
      addToast?.(message, 'error');
      return false;
    } finally {
      mutationLock.current = false;
      setMutatingAssignmentId(null);
    }
  };

  const handleRestoreAssignment = async (assignmentId: string) => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
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
      return true;
    } catch (restoreError) {
      const message = friendlyIeltsAdminError(restoreError, 'Unable to restore the IELTS practice assignment. Please try again.');
      setError(message);
      addToast?.(message, 'error');
      return false;
    } finally {
      mutationLock.current = false;
      setMutatingAssignmentId(null);
    }
  };

  return (
    <div className="ix-workspace" data-testid="ielts-practice-admin-tab">
      <header className="ix-header">
        <div><p className="ix-eyebrow">{school?.name ?? 'IELTS Programme'}</p><h2>Class assignments</h2><p className="ix-muted">Assign purposeful practice and follow each student’s work.</p></div>
        <IeltsButton variant={creating ? 'secondary' : 'primary'} disabled={saving} onClick={() => { setCreating(!creating); setStep(0); setError(null); }}>{creating ? 'Back to assignments' : 'New assignment'}</IeltsButton>
      </header>
      {error && <IeltsNotice error>{error}</IeltsNotice>}
      {pendingAssignment && <IeltsNotice><p><strong>Saved assignment · allocation needs checking</strong></p><p>{pendingAssignment.title} is saved. Retry uses this assignment, without creating another.</p><IeltsButton disabled={saving} onClick={() => void retryAllocation(pendingAssignment)}>{saving ? 'Allocating…' : 'Retry class allocation'}</IeltsButton></IeltsNotice>}

      {!creating && <section className="ix-panel" aria-labelledby="ix-assignment-list-heading">
        <div className="ix-header"><div><h3 id="ix-assignment-list-heading">Assignments</h3><p className="ix-muted">Completion and teacher feedback are separate.</p></div><IeltsButton disabled={loading} onClick={() => void loadAssignments()}>{loading ? 'Refreshing…' : 'Refresh list'}</IeltsButton></div>
        <div className="ix-fields">
          <label className="ix-field">Filter assignments by class<select value={listClassId} onChange={e => setListClassId(e.target.value)}><option value="">All classes</option>{classes.map((cls: any) => <option key={cls.id} value={cls.id}>{cls.class_name}</option>)}</select></label>
          <div className="ix-field"><span>Assignment status</span><div className="ix-actions" aria-label="IELTS practice assignment status">{assignmentStatusFilters.map(filter => <IeltsButton key={filter.value} aria-pressed={assignmentStatusFilter === filter.value} variant={assignmentStatusFilter === filter.value ? 'primary' : 'secondary'} data-testid={`ielts-practice-${filter.value}-tab`} onClick={() => { setAssignmentStatusFilter(filter.value); cancelEditAssignment(); }}>{filter.label}</IeltsButton>)}</div></div>
        </div>
        <details data-testid="ielts-practice-status-helper"><summary>What do assignment statuses mean?</summary><p className="ix-muted">Active = students can work. Closed = read-only, no new submissions. Archived = hidden from active view, history preserved.</p></details>
        {loading && <p role="status">Loading assignments…</p>}
        {!loading && !error && !visibleAssignments.length && <p className="ix-muted">{listClassId ? 'No assignments match this class.' : assignmentStatusFilter === 'archived' ? 'No archived IELTS practice assignments.' : 'No active IELTS practice assignments yet. Choose New assignment to get started.'}</p>}
        <div className="ix-list">{visibleAssignments.map(assignment => {
          const isEditing = editingAssignmentId === assignment.id, isMutating = mutatingAssignmentId === assignment.id, isArchivedView = assignment.status === 'archived';
          return <article key={assignment.id} data-testid={`ielts-practice-assignment-${assignment.id}`} className={`ix-row${selectedAssignmentId === assignment.id ? ' ix-row--selected' : ''}`}>
            <div className="ix-header"><div><h4>{assignment.title}</h4><p className="ix-muted">{assignment.class_name ?? 'No class'} · Due {formatDateTime(assignment.due_at)}</p></div><span data-testid={`ielts-practice-status-${assignment.id}`} className={`ix-status ix-status--${assignment.status}`}>{assignment.status === 'assigned' ? 'Active' : assignment.status === 'draft' ? 'Draft · not allocated' : assignment.status === 'closed' ? 'Closed' : 'Archived'}</span></div>
            {isArchivedView && <p className="ix-muted">Read-only archive</p>}
            <p>{assignment.completed_count ?? 0} of {assignment.total_students ?? 0} students completed · {assignment.in_progress_count ?? 0} in progress · {assignment.overdue_count ?? 0} overdue</p>
            <p className="ix-muted">{assignment.item_count ?? assignment.items?.length ?? 0} items</p>
            {(assignment.item_count ?? assignment.items?.length ?? 0) === 0 && <IeltsNotice>Assignment has no items. Add content before making it available to students.</IeltsNotice>}
            {isEditing && <div className="ix-list" data-testid={`ielts-practice-edit-form-${assignment.id}`}>
              <label className="ix-field">Title<input value={editTitle} onChange={e => setEditTitle(e.target.value)} /></label>
              <label className="ix-field">Due date (optional)<input type="datetime-local" value={editDueAt} onChange={e => setEditDueAt(e.target.value)} /></label>
              <label className="ix-field">Instructions<textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} /></label>
              <div className="ix-actions"><IeltsButton variant="primary" data-testid={`ielts-practice-save-edit-${assignment.id}`} disabled={isMutating} onClick={() => void handleUpdateAssignment(assignment.id)}>{isMutating ? 'Saving…' : 'Save changes'}</IeltsButton><IeltsButton disabled={isMutating} onClick={cancelEditAssignment}>Cancel</IeltsButton></div>
            </div>}
            <div className="ix-actions">
              <IeltsButton data-testid={`ielts-practice-view-progress-${assignment.id}`} disabled={progressLoading && selectedAssignmentId === assignment.id} onClick={() => void loadAssignmentDetail(assignment.id)}>View progress</IeltsButton>
              {assignment.status === 'draft' && assignment.class_id && <IeltsButton disabled={saving} onClick={() => void retryAllocation(assignment)}>Allocate saved assignment</IeltsButton>}
              {!isArchivedView && <><IeltsButton data-testid={`ielts-practice-edit-${assignment.id}`} disabled={isMutating} onClick={() => beginEditAssignment(assignment)}>Edit</IeltsButton><IeltsButton data-testid={`ielts-practice-close-${assignment.id}`} disabled={assignment.status === 'closed' || isMutating} onClick={() => setConfirmation({id:assignment.id,action:'close'})}>Close to new work</IeltsButton><IeltsButton variant="danger" data-testid={`ielts-practice-archive-${assignment.id}`} disabled={isMutating} onClick={() => setConfirmation({id:assignment.id,action:'archive'})}>Archive assignment</IeltsButton></>}
              {isArchivedView && <IeltsButton data-testid={`ielts-practice-restore-${assignment.id}`} disabled={isMutating} onClick={() => setConfirmation({id:assignment.id,action:'restore'})}>Restore as closed</IeltsButton>}
            </div>
          </article>;
        })}</div>
      </section>}

      {creating && <section className="ix-panel" aria-labelledby="ix-new-heading">
        <h3 id="ix-new-heading" ref={formHeading} tabIndex={-1}>{['Choose recipients & instructions', 'Choose practice materials', 'Review & assign'][step]}</h3>
        <ol className="ix-steps" aria-label="New assignment steps">{['Class & instructions','Materials','Review & assign'].map((label,index) => <li key={label} aria-current={step === index ? 'step' : undefined}>{index+1}. {label}</li>)}</ol>
        <fieldset disabled={saving || !!pendingAssignment} className="ix-list" style={{border:0,padding:0,margin:0}}>
          {step === 0 && <div className="ix-list">
            <div className="ix-fields"><label className="ix-field">Assign to class<select data-testid="ielts-practice-class-select" value={classId} onChange={e => setClassId(e.target.value)}><option value="">Choose a class</option>{classes.map((cls: any) => <option key={cls.id} value={cls.id}>{cls.class_name}</option>)}</select></label><label className="ix-field">Assignment title<input data-testid="ielts-practice-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Week 1 IELTS practice" /></label></div>
            {classId && <p className="ix-muted">{selectedClassStudentCount} students in {selectedClass?.class_name ?? 'the selected class'}. Eligibility is checked when assigning.</p>}
            {classId && selectedClassStudentCount === 0 && <IeltsNotice>No students in this class. Add students before creating the assignment.</IeltsNotice>}
            <label className="ix-field">Due date (optional)<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
            <label className="ix-field">Instructions for students (optional)<textarea data-testid="ielts-practice-description-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What should students focus on?" /></label>
          </div>}
          {step === 1 && <>
            <div className="ix-header"><p className="ix-muted">Choose content from the approved catalogue. Check its previous use for this class.</p><IeltsButton disabled={items.length >= 50} onClick={() => setItems(current => [...current,newDraftItem()])}>+ Add item</IeltsButton></div>
            <div className="ix-list">{items.map((item,index) => <article key={item.localId} className="ix-row">
              <div className="ix-header"><h4>Item {index+1}</h4><div className="ix-actions"><IeltsButton aria-label={`Move item ${index+1} up`} disabled={index === 0} onClick={() => moveItem(item.localId,-1)}>Move up</IeltsButton><IeltsButton aria-label={`Move item ${index+1} down`} disabled={index === items.length-1} onClick={() => moveItem(item.localId,1)}>Move down</IeltsButton><IeltsButton aria-label={`Remove item ${index+1}`} disabled={items.length === 1} onClick={() => removeItem(item.localId)}>Remove</IeltsButton></div></div>
              <div className="ix-fields"><label className="ix-field">Skill<select value={item.skill} onChange={e => { updateItem(item.localId,{skill:e.target.value,contentId:'',title:'',display_code:null,originality_label:null,description:null,difficulty:null,band:null}); setPickerOpenFor(null); }}>{['reading','listening','writing','speaking'].map(skill => <option key={skill} value={skill}>{skill[0].toUpperCase()+skill.slice(1)}</option>)}</select></label><label className="ix-check"><input type="checkbox" checked={item.required ?? true} onChange={e => updateItem(item.localId,{required:e.target.checked})}/><span>Required for completion</span></label></div>
              <p><strong>{ieltsMaterialTitle(item.display_code,item.title?.trim() || 'No content selected')}</strong><IeltsMaterialProvenance label={item.originality_label}/></p>
              {item.description && <p className="ix-muted">{item.description}</p>}
              <IeltsButton data-testid={`ielts-practice-content-picker-${index}`} aria-expanded={pickerOpenFor === item.localId} onClick={() => openContentPicker(item)}>{pickerOpenFor === item.localId ? 'Close picker' : 'Choose content'}</IeltsButton>
              {item.contentType !== contentTypesBySkill[String(item.skill)] && <IeltsNotice error>This content type does not match the selected skill. Choose matching content.</IeltsNotice>}
              {pickerOpenFor === item.localId && <section className="ix-panel" aria-label={`Choose material for item ${index+1}`}>
                <div className="ix-fields"><label className="ix-field">Skill filter<select value={contentSkillFilter} onChange={e => { setContentSkillFilter(e.target.value); void loadContentCatalog(e.target.value,contentSearch); }}>{['reading','listening','writing','speaking'].map(skill => <option key={skill} value={skill}>{skill}</option>)}</select></label><label className="ix-field">Title or task code<input value={contentSearch} onChange={e => setContentSearch(e.target.value)} placeholder="Search, e.g. R-003" /></label></div>
                <IeltsButton disabled={contentLoading} onClick={() => void loadContentCatalog(contentSkillFilter,contentSearch)}>{contentLoading ? 'Searching…' : 'Search catalog'}</IeltsButton>
                {contentError && <IeltsNotice error>{contentError}</IeltsNotice>}
                {contentLoading && <p role="status">Loading materials…</p>}
                {!contentLoading && !contentError && !contentCatalog.length && <p>No content found in picker. Try a different skill or title.</p>}
                {!contentLoading && !contentError && <div className="ix-picker">{groupedContentCatalog.map(([skillGroup,groupItems]) => <div key={skillGroup} className="ix-list" data-testid={`ielts-practice-content-group-${skillGroup}`}><h4>{skillGroup}</h4>{groupItems.map(content => {
                  const isSelected = selectedItemKeys.has(`${content.content_type}:${content.content_id}`);
                  return <button type="button" key={content.content_type+content.content_id} className="ix-option" aria-pressed={isSelected} data-testid={`ielts-practice-content-option-${content.content_type}-${content.content_id}`} onClick={() => selectContent(item.localId,content)}>
                    <strong>{ieltsMaterialTitle(content.display_code,content.title)}</strong><IeltsMaterialProvenance label={content.originality_label}/>{isSelected && <span className="ix-status">Selected</span>}
                    <p className="ix-muted">{content.skill}{content.difficulty && <> · Difficulty: {content.difficulty}</>}{content.band && <> · Band {content.band}</>}</p>{content.description && <p>{content.description}</p>}
                    <p className="ix-muted">{!classId ? 'Choose a class to check previous use' : catalogUsage.loading ? 'Checking previous use…' : catalogUsage.error ? 'History unavailable · retry before assigning' : (() => { const u=catalogUsage.data?.find(u => u.type===content.content_type && u.id===content.content_id); return u ? materialUsageLabel(u) : 'History not available'; })()}</p>
                  </button>;
                })}</div>)}</div>}
              </section>}
              <details><summary>Advanced manual fallback</summary><p className="ix-muted">Use only when you know the saved material reference. The same authorization and publication checks apply.</p><div className="ix-fields"><label className="ix-field">Material type<input value={item.contentType} onChange={e => updateItem(item.localId,{contentType:e.target.value})}/></label><label className="ix-field">Saved material reference<input value={item.contentId} onChange={e => updateItem(item.localId,{contentId:e.target.value})}/></label><label className="ix-field">Optional title<input value={item.title ?? ''} onChange={e => updateItem(item.localId,{title:e.target.value})}/></label></div></details>
            </article>)}</div>
          </>}
          {step === 2 && <>
            <div className="ix-row"><h4>{title}</h4><p>{selectedClass?.class_name} · {selectedClassStudentCount} roster members · Due {dueAt ? formatDateTime(new Date(dueAt).toISOString()) : 'No due date'}</p>{description && <p>{description}</p>}</div>
            <div data-testid="ielts-practice-selected-items" className="ix-list">{items.map((item,index) => <div key={item.localId} data-testid={`ielts-practice-selected-item-${index}`} className="ix-row"><strong>{index+1}. {ieltsMaterialTitle(item.display_code,item.title || 'Selected material')}</strong><IeltsMaterialProvenance label={item.originality_label}/><p className="ix-muted">{item.skill} · {item.required ? 'Required' : 'Optional'}</p></div>)}</div>
            {classId && chosenMaterials.length > 0 && <IeltsNotice><h4>Previous use for students in this class</h4>{selectedUsage.loading ? <p>Checking previous assignments…</p> : selectedUsage.error ? <><p>{selectedUsage.error}</p><IeltsButton onClick={selectedUsage.retry}>Retry history check</IeltsButton></> : selectedUsage.data?.map(u => <div key={u.type+':'+u.id}><strong>{ieltsMaterialTitle(items.find(i => i.contentType===u.type && i.contentId.trim()===u.id)?.display_code,items.find(i => i.contentType===u.type && i.contentId.trim()===u.id)?.title || 'Selected material')}</strong><p>{materialUsageLabel(u)}</p>{u.latest_assignment_id && <IeltsButton onClick={() => void loadAssignmentDetail(u.latest_assignment_id!)}>Open existing assignment progress</IeltsButton>}</div>)}{!!repeatedMaterials.length && <label className="ix-check"><input type="checkbox" checked={repeatAcknowledged} onChange={e => setRepeatScope(e.target.checked ? currentRepeatScope : '')}/><span>I checked existing work and intend to assign these materials again for practice.</span></label>}<p className="ix-muted">History covers current class members’ recorded assignments, including earlier classes and archived work. Repeating material does not establish improvement.</p></IeltsNotice>}
            <IeltsButton variant="primary" data-testid="ielts-practice-create-assignment" onClick={() => void handleCreateAssignment()} disabled={saving || !!pendingAssignment || !selectedUsage.data || selectedUsage.loading || !!selectedUsage.error || (!!repeatedMaterials.length && !repeatAcknowledged)}>{saving ? 'Assigning…' : 'Confirm & assign to class'}</IeltsButton>
            {(!selectedUsage.data || selectedUsage.loading || !!selectedUsage.error) && <p className="ix-muted">Previous-use checks must finish successfully before assigning.</p>}
            {!!repeatedMaterials.length && !repeatAcknowledged && <p className="ix-muted">Confirm the intentional repeat above before assigning.</p>}
          </>}
        </fieldset>
        <div className="ix-actions"><IeltsButton disabled={step === 0 || saving || !!pendingAssignment} onClick={() => { setStep(n => n-1); setError(null); }}>Previous step</IeltsButton>{step < 2 && <IeltsButton variant="primary" disabled={saving || !!pendingAssignment} onClick={nextStep}>Continue</IeltsButton>}</div>
      </section>}

      {(selectedAssignmentId || progressLoading) && <section className="ix-panel" aria-labelledby="ix-progress-heading">
        <div className="ix-header"><div><h3 id="ix-progress-heading">Student progress</h3><p className="ix-muted">{selectedProgressAssignment ? `${selectedProgressAssignment.title} · ${selectedProgressAssignment.class_name ?? 'No class'}` : 'Loading selected assignment…'}</p>{selectedProgressAssignment && <p><span className={`ix-status ix-status--${selectedProgressAssignment.status}`}>{selectedProgressAssignment.status}</span></p>}</div><div className="ix-actions"><IeltsButton disabled={progressLoading} onClick={() => selectedAssignmentId && void loadAssignmentDetail(selectedAssignmentId)}>Refresh progress</IeltsButton><IeltsButton onClick={() => { detailRequest.current++; setSelectedAssignmentId(null); setAssignmentDetail(null); setProgressLoading(false); }}>Close progress</IeltsButton></div></div>
        {progressLoading && <p role="status">Loading student progress…</p>}
        {!progressLoading && assignmentDetail && <><div className="ix-actions" aria-label="Student progress filters">{progressFilters.map(filter => <IeltsButton key={filter.value} aria-pressed={progressFilter === filter.value} variant={progressFilter === filter.value ? 'primary' : 'secondary'} onClick={() => setProgressFilter(filter.value)}>{filter.label}</IeltsButton>)}</div>
          {!filteredProgressStudents.length && <p className="ix-muted">{assignmentDetail.students.length === 0 ? 'No students in class for this assignment yet.' : 'No students match this filter.'}</p>}
          {!!filteredProgressStudents.length && <div className="ix-table-wrap" tabIndex={0} aria-label="Scrollable student progress table"><table><caption>Saved progress for this assignment</caption><thead><tr><th scope="col">Student</th><th scope="col">Class</th><th scope="col">Status</th><th scope="col">Completed</th><th scope="col">Updated</th></tr></thead><tbody>{filteredProgressStudents.map(student => { const status=displayStudentStatus(assignmentDetail.assignment,student); return <tr key={student.student_id} data-testid={`ielts-practice-progress-student-${student.student_id}`}><th scope="row">{student.username || student.email || 'Student'}</th><td>{student.class_name ?? '—'}</td><td><span className={`ix-status ix-status--${status}`}>{status.replace(/_/g,' ')}</span></td><td>{formatDateTime(student.completed_at)}</td><td>{formatDateTime(student.updated_at)}</td></tr>; })}</tbody></table></div>}
        </>}
      </section>}
      <details className="ix-panel"><summary>Writing &amp; Speaking reviews</summary><p className="ix-muted">Review Writing &amp; Speaking Submissions without leaving School Administration. Review permissions remain specific to each workflow.</p><IeltsButton onClick={onOpenReviews}>Open review desk</IeltsButton></details>
      {confirmation && <IeltsConfirm title={confirmation.action === 'close' ? 'Close to new work?' : confirmation.action === 'archive' ? 'Archive this assignment?' : 'Restore as closed?'} busy={!!mutatingAssignmentId} action={confirmation.action === 'close' ? 'Close to new work' : confirmation.action === 'archive' ? 'Archive assignment' : 'Restore as closed'} onCancel={() => setConfirmation(null)} onConfirm={() => {
        const operation=confirmation.action === 'close' ? handleCloseAssignment : confirmation.action === 'archive' ? handleArchiveAssignment : handleRestoreAssignment;
        void operation(confirmation.id).then(success => { if (success) setConfirmation(null); });
      }}><p>{confirmation.action === 'close' ? 'Students will retain read-only access. New submissions will be blocked.' : confirmation.action === 'archive' ? 'This assignment will leave the active list. Saved student progress and history will be preserved.' : 'This assignment will return to the active list as closed. It will not accept new submissions.'}</p>{error && <IeltsNotice error>{error}</IeltsNotice>}</IeltsConfirm>}
    </div>
  );
};
export default IeltsPracticeTab;
