import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TeacherAssignmentSummary, TeacherAssignmentReportRow, Subject, StudentForAssignment, AssignmentCategory } from '../types';
import { fetchSchoolAcademicSetup, type SchoolAcademicSetup } from '../services/schoolAcademicSetupService';
import { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from '../src/lib/assignmentCategory';
import * as GameService from '../services/gameService';
import { brainsAlert } from '../src/utils/brainsAlert';
import './CollectiveAssignmentReport.css';
import { useSchoolBranding } from '../src/hooks/useSchoolBranding';
import { createSchoolDocumentId, registerSchoolDocumentRecord, schoolDocumentFileName } from '../src/lib/schoolDocument';

// localStorage key prefix for persisted custom orders
const CUSTOM_ORDER_STORAGE_KEY = 'brains_collective_report_custom_order';
const EMPTY_ALLOCATED_CLASS_CODES: string[] = [];

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CollectiveAssignmentReportProps {
  assignments: TeacherAssignmentSummary[];
  students?: StudentForAssignment[];
  allocatedClassCodes?: string[];
  onBack: () => void;
  onViewAssignment?: (assignment: TeacherAssignmentSummary) => void;
  school: { id?: string | null; name: string; logoUrl?: string | null };
  teacherName: string;
}

export interface CollectiveReportData {
  reportId: string;
  school: { id: string; name: string; logoUrl?: string };
  report: { title: string; academicYear?: string; term?: string; dateFrom: string; dateTo: string; generatedAt: string; generatedBy: string };
  context: { className: string; subjects: string[]; assignmentCount: number; studentCount: number };
  assignments: Array<{ id: string; title: string; subject: string; date?: string; category?: AssignmentCategory | null }>;
  students: Array<{ id: string; name: string; className: string; results: Array<{ assignmentId: string; percentage: number | null; status: 'submitted' | 'not_submitted' }>; completedCount: number; assignmentCount: number; average: number | null; status: string }>;
  summary: { classAverage: number | null; completionRate: number; supportCount: number; highestAverage: number | null; lowestAverage: number | null };
}

/** How a column (assignment) can be identified when sorting by it */
type SortColumn =
  | 'name'
  | 'batch'
  | 'average'
  | 'custom'
  | { assignmentId: string };

type SortDirection = 'asc' | 'desc';

/** Flat row model shown in the grid */
interface StudentRow {
  studentId: string;
  studentName: string;
  batch: string;
  /** Map of assignmentId → score info (null = not completed) */
  scores: Record<string, { score: number; accuracy: number; correct: number; incorrect: number; completedAt: string } | null>;
  /** Average accuracy across completed assignments */
  averageAccuracy: number;
  /** Number of assignments completed */
  completedCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

const CollectiveAssignmentReport: React.FC<CollectiveAssignmentReportProps> = ({
  assignments,
  students = [],
  allocatedClassCodes = EMPTY_ALLOCATED_CLASS_CODES,
  onBack,
  onViewAssignment,
  school,
  teacherName,
}) => {
  const { schoolName, schoolLogoUrl } = useSchoolBranding({ schoolId: school.id, schoolName: school.name, schoolLogoUrl: school.logoUrl });
  // Work state
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [reportData, setReportData] = useState<Record<string, TeacherAssignmentReportRow[]>>({});

  // Filters
  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AssignmentCategory>('all');
  const [academicSetup, setAcademicSetup] = useState<SchoolAcademicSetup | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [periodMode, setPeriodMode] = useState<'term' | 'custom'>('term');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(() => assignments.map((assignment) => assignment.id));
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSelectionReady, setStudentSelectionReady] = useState(false);
  const [reportTitle, setReportTitle] = useState('Student Achievement Report');
  const [reportNote, setReportNote] = useState('');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeGradeMatrix, setIncludeGradeMatrix] = useState(true);
  const [includeAssignmentBreakdown, setIncludeAssignmentBreakdown] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3>(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [academicYear, setAcademicYear] = useState(`${new Date().getFullYear()}–${new Date().getFullYear() + 1}`);
  const [term, setTerm] = useState('');
  const printDocumentRef = useRef<HTMLElement>(null);

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('average');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Custom ordering (list of studentIds in the teacher's preferred order)
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Drag-and-drop state
  const dragRowIndex = useRef<number | null>(null);
  const dragOverRowIndex = useRef<number | null>(null);
  const [dragActiveIdx, setDragActiveIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  const localDateKey = useCallback((date = new Date()) => {
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

  // ── Fetch all data on mount ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const ids = assignments.map((a) => a.id);
        setProgress({ done: 0, total: ids.length });

        // Use the bulk fetcher
        const data = await GameService.get_all_assignment_reports(ids);
        if (!cancelled) {
          setReportData(data);
          setProgress({ done: ids.length, total: ids.length });
        }
      } catch (err) {
        console.error('Failed to load collective report:', err);
        if (!cancelled) brainsAlert('Failed to load collective report data. Please try again.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (assignments.length > 0) fetchAll();
    else setLoading(false);

    return () => { cancelled = true; };
  }, [assignments]);

  useEffect(() => {
    if (!builderOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setBuilderOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [builderOpen]);

  // ── Filtered assignments ─────────────────────────────────────────────────
  const filteredAssignments = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return assignments.filter((assignment) => {
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
  }, [assignments, selectedAssignmentIds, subjectFilter, batchFilter, categoryFilter, dateFrom, dateTo, periodMode, reportData, selectedAcademicYearId, selectedTermId, students]);

  useEffect(() => {
    setSelectedAssignmentIds((current) => {
      const valid = new Set(assignments.map((assignment) => assignment.id));
      const kept = current.filter((id) => valid.has(id));
      return kept.length || !assignments.length ? kept : assignments.map((assignment) => assignment.id);
    });
  }, [assignments]);

  // ── Unique subjects for filter dropdown ──────────────────────────────────
  const uniqueSubjects = useMemo(() => {
    const s = new Set(assignments.map((a) => a.subject_name));
    return Array.from(s).sort();
  }, [assignments]);

  // ── Build student rows ───────────────────────────────────────────────────
  const studentRows: StudentRow[] = useMemo(() => {
    const studentMap = new Map<string, StudentRow>();
    const activeIds = new Set(filteredAssignments.map((a) => a.id));

    students.forEach((student) => {
      studentMap.set(student.id, {
        studentId: student.id,
        studentName: student.display_name,
        batch: student.batch || '—',
        scores: {},
        averageAccuracy: 0,
        completedCount: 0,
      });
    });

    for (const assignment of filteredAssignments) {
      const rows = reportData[assignment.id] ?? [];
      for (const row of rows) {
        if (!studentMap.has(row.student_id)) {
          studentMap.set(row.student_id, {
            studentId: row.student_id,
            studentName: row.student_name,
            batch: row.batch ?? '—',
            scores: {},
            averageAccuracy: 0,
            completedCount: 0,
          });
        }
        const student = studentMap.get(row.student_id)!;
        student.scores[assignment.id] = {
          score: row.score,
          accuracy: row.accuracy,
          correct: row.correct,
          incorrect: row.incorrect,
          completedAt: row.completed_at,
        };
      }
    }

    // Compute averages + completedCount
    for (const student of studentMap.values()) {
      let total = 0;
      let count = 0;
      for (const aId of activeIds) {
        const s = student.scores[aId];
        if (s) {
          total += s.accuracy;
          count++;
        }
      }
      student.averageAccuracy = count > 0 ? Math.round(total / count) : 0;
      student.completedCount = count;
    }

    return Array.from(studentMap.values());
  }, [filteredAssignments, reportData, students]);

  useEffect(() => {
    if (!studentRows.length || studentSelectionReady) return;
    setSelectedStudentIds(studentRows.map((student) => student.studentId));
    setStudentSelectionReady(true);
  }, [studentRows, studentSelectionReady]);

  // ── Unique batches for filter ────────────────────────────────────────────
  const uniqueBatches = useMemo(() => {
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
  }, [batchFilter, uniqueBatches]);

  // ── Load saved custom order from localStorage ─────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_ORDER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomOrder(parsed);
        }
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // ── Persist custom order whenever it changes ──────────────────────────
  useEffect(() => {
    if (customOrder.length > 0) {
      try {
        localStorage.setItem(CUSTOM_ORDER_STORAGE_KEY, JSON.stringify(customOrder));
      } catch { /* storage full — non-critical */ }
    }
  }, [customOrder]);

  // ── Sync custom order with current student list ───────────────────────
  // Ensure any new students are appended and removed students are pruned
  useEffect(() => {
    if (studentRows.length === 0) return;
    const currentIds = new Set(studentRows.map((r) => r.studentId));
    setCustomOrder((prev) => {
      const kept = prev.filter((id) => currentIds.has(id));
      const existing = new Set(kept);
      const newIds = studentRows
        .filter((r) => !existing.has(r.studentId))
        .map((r) => r.studentId);
      if (newIds.length === 0 && kept.length === prev.length) return prev; // no change
      return [...kept, ...newIds];
    });
  }, [studentRows]);

  // ── Filtered + sorted rows ──────────────────────────────────────────────
  const displayRows = useMemo(() => {
    let rows = studentRows;

    if (studentSelectionReady) {
      const selected = new Set(selectedStudentIds);
      rows = rows.filter((row) => selected.has(row.studentId));
    }

    // Batch filter
    if (batchFilter) {
      rows = rows.filter((r) => r.batch === batchFilter);
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.studentName.toLowerCase().includes(q) ||
          r.batch.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortColumn === 'custom' && isCustomMode) {
      // Use the teacher's custom order
      const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
      rows = [...rows].sort((a, b) => {
        const ai = orderMap.get(a.studentId) ?? 99999;
        const bi = orderMap.get(b.studentId) ?? 99999;
        return ai - bi;
      });
    } else {
      const dir = sortDirection === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        if (sortColumn === 'name') {
          return a.studentName.localeCompare(b.studentName) * dir;
        }
        if (sortColumn === 'batch') {
          return a.batch.localeCompare(b.batch) * dir;
        }
        if (sortColumn === 'average') {
          return (a.averageAccuracy - b.averageAccuracy) * dir;
        }
        if (sortColumn === 'custom') {
          // fallback if custom mode is off but column is still 'custom'
          return a.studentName.localeCompare(b.studentName) * dir;
        }
        // Sort by specific assignment score
        const aId = (sortColumn as { assignmentId: string }).assignmentId;
        const aScore = a.scores[aId]?.accuracy ?? -1;
        const bScore = b.scores[aId]?.accuracy ?? -1;
        return (aScore - bScore) * dir;
      });
    }

    return rows;
  }, [studentRows, studentSelectionReady, selectedStudentIds, batchFilter, searchTerm, sortColumn, sortDirection, isCustomMode, customOrder]);

  // ── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = useCallback(
    (col: SortColumn) => {
      // If teacher clicks a column header while in custom mode, switch out of custom mode
      if (isCustomMode && col !== 'custom') {
        setIsCustomMode(false);
      }

      const isSame =
        typeof col === 'string' && typeof sortColumn === 'string'
          ? col === sortColumn
          : typeof col === 'object' &&
            typeof sortColumn === 'object' &&
            col.assignmentId === (sortColumn as any).assignmentId;

      if (isSame) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(col);
        setSortDirection('asc');
      }
    },
    [sortColumn, isCustomMode]
  );

  const sortIndicator = (col: SortColumn) => {
    if (isCustomMode && sortColumn === 'custom') {
      // In custom mode, no sort indicator on other columns
      if (col === 'custom') return <span className="text-purple-500 ml-1 text-xs">✋</span>;
      return null;
    }

    const isSame =
      typeof col === 'string' && typeof sortColumn === 'string'
        ? col === sortColumn
        : typeof col === 'object' &&
          typeof sortColumn === 'object' &&
          col.assignmentId === (sortColumn as any).assignmentId;

    if (!isSame) return <span className="text-slate-400 ml-1 text-[10px]">⇅</span>;
    return <span className="text-cyan-500 ml-1 text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // ── Toggle custom order mode ─────────────────────────────────────────────
  const toggleCustomMode = useCallback(() => {
    setIsCustomMode((prev) => {
      const next = !prev;
      if (next) {
        // Entering custom mode — snapshot current display order as the custom order
        // (so the teacher starts from whatever sort they had)
        const currentIds = displayRows.map((r) => r.studentId);
        // Merge: keep order for visible students, append any others at the end
        const allIds = studentRows.map((r) => r.studentId);
        const visible = new Set(currentIds);
        const rest = allIds.filter((id) => !visible.has(id));
        setCustomOrder([...currentIds, ...rest]);
        setSortColumn('custom');
      }
      return next;
    });
  }, [displayRows, studentRows]);

  // ── Drag-and-drop handlers (HTML5 native) ────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    dragRowIndex.current = index;
    setDragActiveIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    // Need to set some data for Firefox
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverRowIndex.current = index;
    setDropTargetIdx(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetIdx(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLTableRowElement>, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragRowIndex.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragActiveIdx(null);
      setDropTargetIdx(null);
      return;
    }

    // Reorder the customOrder array based on the visual displayRows
    setCustomOrder((prev) => {
      const visibleIds = displayRows.map((r) => r.studentId);
      const movedId = visibleIds[fromIndex];
      if (!movedId) return prev;

      // Remove the dragged student and insert at the new position
      const newVisible = visibleIds.filter((_, i) => i !== fromIndex);
      newVisible.splice(dropIndex, 0, movedId);

      // Rebuild full custom order: replace visible portion in-place
      const visibleSet = new Set(visibleIds);
      const nonVisible = prev.filter((id) => !visibleSet.has(id));
      return [...newVisible, ...nonVisible];
    });

    dragRowIndex.current = null;
    dragOverRowIndex.current = null;
    setDragActiveIdx(null);
    setDropTargetIdx(null);
  }, [displayRows]);

  const handleDragEnd = useCallback(() => {
    dragRowIndex.current = null;
    dragOverRowIndex.current = null;
    setDragActiveIdx(null);
    setDropTargetIdx(null);
  }, []);

  // ── Move a student up/down by one position (button controls) ─────────────
  const moveStudent = useCallback((studentId: string, direction: 'up' | 'down') => {
    setCustomOrder((prev) => {
      const visibleIds = displayRows.map((r) => r.studentId);
      const idx = visibleIds.indexOf(studentId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= visibleIds.length) return prev;

      // Swap in visible list
      const newVisible = [...visibleIds];
      [newVisible[idx], newVisible[swapIdx]] = [newVisible[swapIdx], newVisible[idx]];

      // Rebuild full order
      const visibleSet = new Set(visibleIds);
      const nonVisible = prev.filter((id) => !visibleSet.has(id));
      return [...newVisible, ...nonVisible];
    });
  }, [displayRows]);

  // ── Reset custom order to alphabetical ────────────────────────────────────
  const resetCustomOrder = useCallback(() => {
    const sorted = [...studentRows].sort((a, b) => a.studentName.localeCompare(b.studentName));
    setCustomOrder(sorted.map((r) => r.studentId));
  }, [studentRows]);

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (displayRows.length === 0) return;

    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

    const headers = [
      'Student',
      'Class',
      ...filteredAssignments.flatMap((a) => [`${a.title || a.topic_name} Accuracy (%)`, `${a.title || a.topic_name} Raw Score`]),
      'Average Attainment (%)',
      'Completed',
    ];

    const csvRows = displayRows.map((row) => [
      escape(row.studentName),
      escape(row.batch),
      ...filteredAssignments.flatMap((a) => {
        const s = row.scores[a.id];
        if (!s) return [escape('Not submitted'), escape('Not submitted')];
        return [escape(`${s.accuracy}%`), escape(s.score)];
      }),
      escape(row.completedCount ? row.averageAccuracy : '—'),
      escape(`${row.completedCount}/${filteredAssignments.length}`),
    ]);

    const csv = [headers.map(escape).join(','), ...csvRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collective-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [displayRows, filteredAssignments]);

  // ── Accuracy colour helper ───────────────────────────────────────────────
  const accuracyColor = (v: number) => {
    if (v >= 80) return 'text-green-600 bg-green-50';
    if (v >= 60) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const accuracyBg = (v: number) => {
    if (v >= 80) return 'bg-green-100 border-green-300';
    if (v >= 60) return 'bg-amber-100 border-amber-300';
    return 'bg-red-100 border-red-300';
  };

  // ── Summary stats ────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    if (displayRows.length === 0) return null;
    const evidenceRows = displayRows.filter((row) => row.completedCount > 0);
    const evidence = evidenceRows.flatMap((row) => filteredAssignments.map((assignment) => row.scores[assignment.id]).filter((score): score is NonNullable<typeof score> => Boolean(score)));
    const avgAcc = evidence.length
      ? Math.round(evidence.reduce((total, score) => total + score.accuracy, 0) / evidence.length)
      : 0;
    const totalCompleted = displayRows.reduce((s, r) => s + r.completedCount, 0);
    const totalPossible = displayRows.length * filteredAssignments.length;
    const completionRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
    const needsAttention = displayRows.filter((row) => row.completedCount < filteredAssignments.length || (row.completedCount > 0 && row.averageAccuracy < 60)).length;
    return { avgAcc, totalCompleted, totalPossible, completionRate, needsAttention };
  }, [displayRows, filteredAssignments]);

  const visibleScope = useMemo(() => {
    const subjects = [...new Set(filteredAssignments.map((assignment) => assignment.subject_name))];
    const classes = [...new Set(displayRows.map((row) => row.batch))];
    const dates = filteredAssignments.map((assignment) => new Date(assignment.assigned_at)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a.getTime() - b.getTime());
    const formatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const dateLabel = dates.length ? dates.length === 1 ? formatter.format(dates[0]) : `${formatter.format(dates[0])}–${formatter.format(dates[dates.length - 1])}` : 'No assignment dates';
    return { subjects: subjects.join(', ') || 'All subjects', classes: classes.map((batch) => `Class ${batch}`).join(', ') || 'All classes', dateLabel };
  }, [displayRows, filteredAssignments]);

  const getStudentStatus = (row: StudentRow) => {
    if (row.completedCount < filteredAssignments.length) return { label: 'Incomplete', className: 'is-incomplete' };
    if (row.averageAccuracy < 60) return { label: 'Support', className: 'is-support' };
    if (row.averageAccuracy < 80) return { label: 'Review', className: 'is-review' };
    return { label: 'On track', className: 'is-on-track' };
  };

  const assignmentStats = useMemo(() => filteredAssignments.map((assignment) => {
    const completed = displayRows
      .map((row) => row.scores[assignment.id])
      .filter((score): score is NonNullable<typeof score> => Boolean(score));
    const average = completed.length
      ? Math.round(completed.reduce((total, score) => total + score.accuracy, 0) / completed.length)
      : null;
    return {
      assignment,
      completed: completed.length,
      expected: displayRows.length,
      average,
    };
  }), [displayRows, filteredAssignments]);

  const formatGeneratedAt = () => new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const generatedAt = useMemo(formatGeneratedAt, []);
  const previewReportId = useMemo(() => createSchoolDocumentId('class'), []);

  const reportModel: CollectiveReportData = useMemo(() => {
    const averages = displayRows.filter(row => row.completedCount > 0).map(row => row.averageAccuracy);
    return {
      reportId: previewReportId,
      school: { id: school.id || '', name: schoolName, ...(schoolLogoUrl ? { logoUrl: schoolLogoUrl } : {}) },
      report: { title: reportTitle.trim() || 'Class Achievement Report', academicYear, term: term || undefined, dateFrom, dateTo, generatedAt, generatedBy: teacherName },
      context: { className: [...new Set(displayRows.map(row => row.batch))].join(', '), subjects: [...new Set(filteredAssignments.map(a => a.subject_name))], assignmentCount: filteredAssignments.length, studentCount: displayRows.length },
      assignments: filteredAssignments.map(a => ({ id: a.id, title: a.title || a.topic_name, subject: a.subject_name, date: a.assigned_at, category: a.assignment_category })),
      students: displayRows.map(row => ({ id: row.studentId, name: row.studentName, className: row.batch, results: filteredAssignments.map(a => ({ assignmentId: a.id, percentage: row.scores[a.id]?.accuracy ?? null, status: row.scores[a.id] ? 'submitted' : 'not_submitted' })), completedCount: row.completedCount, assignmentCount: filteredAssignments.length, average: row.completedCount ? row.averageAccuracy : null, status: getStudentStatus(row).label })),
      summary: { classAverage: summaryStats?.totalCompleted ? summaryStats.avgAcc : null, completionRate: summaryStats?.completionRate ?? 0, supportCount: summaryStats?.needsAttention ?? 0, highestAverage: averages.length ? Math.max(...averages) : null, lowestAverage: averages.length ? Math.min(...averages) : null },
    };
  }, [academicYear, dateFrom, dateTo, displayRows, filteredAssignments, generatedAt, previewReportId, reportTitle, school.id, schoolLogoUrl, schoolName, summaryStats, teacherName, term]);

  const printReport = useCallback(() => {
    if (!printDocumentRef.current || !reportModel.students.length || !reportModel.assignments.length) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Class Achievement Report print document');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0';
    document.body.appendChild(frame);
    const printDoc = frame.contentDocument;
    if (!printDoc) { frame.remove(); return; }
    const finalReportId = createSchoolDocumentId('class');
    const finalGeneratedAt = formatGeneratedAt();
    const printable = printDocumentRef.current.cloneNode(true) as HTMLElement;
    printable.querySelectorAll<HTMLElement>('[data-collective-report-id]').forEach((element) => { element.textContent = finalReportId; });
    printable.querySelectorAll<HTMLElement>('[data-collective-generated-at]').forEach((element) => { element.textContent = finalGeneratedAt; });
    void registerSchoolDocumentRecord({
      meta: {
        documentId: finalReportId,
        templateVersion: 'class-achievement-v1',
        title: reportModel.report.title,
        subtitle: `${reportModel.context.assignmentCount} assignments · ${reportModel.context.studentCount} students`,
        schoolName: reportModel.school.name,
        schoolLogoUrl: reportModel.school.logoUrl,
        audience: 'teacher',
        status: 'final',
        confidentiality: 'school-use',
        generatedAt: new Date().toISOString(),
        generatedBy: teacherName,
        academicYear: reportModel.report.academicYear,
        term: reportModel.report.term,
        subject: reportModel.context.subjects.join(', '),
        className: reportModel.context.className,
        schoolId: reportModel.school.id,
        sourceType: 'collective_assignment_report',
        sourceId: reportModel.assignments.map((assignment) => assignment.id).join(','),
      },
      bodyHtml: printable.outerHTML,
      orientation: reportModel.assignments.length > 5 ? 'landscape' : 'portrait',
      fileName: schoolDocumentFileName(reportModel.school.name, reportModel.report.title, finalReportId),
      persistPayload: false,
    });
    printDoc.open();
    printDoc.write(`<!doctype html><html><head>${document.head.innerHTML}</head><body>${printable.outerHTML}</body></html>`);
    printDoc.close();
    frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(() => frame.remove(), 1000); };
  }, [reportModel, teacherName]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-medium">
          Preparing report data… ({progress.done}/{progress.total} assignments)
        </p>
      </div>
    );
  }

  return (
    <div className="collective-report-root space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="collective-report-no-print teacher-back-link mb-2">
        <span>←</span> Back to Reports
      </button>

      <article ref={printDocumentRef} className={`collective-print-report ${filteredAssignments.length > 5 ? 'is-landscape' : 'is-portrait'}`} aria-label="Class Achievement Report print document">
        <header className="collective-print-header">
          <div className="collective-print-brand">{reportModel.school.logoUrl ? <img src={reportModel.school.logoUrl} alt="" /> : null}<div><b>{reportModel.school.name}</b><small>School Report</small></div></div>
          <div className="collective-print-document"><small>Class Achievement Report</small><strong>{reportModel.report.title}</strong><span>Generated <span data-collective-generated-at>{generatedAt}</span></span></div>
        </header>
        <section className="collective-print-details"><span><b>Class:</b> {reportModel.context.className || '—'}</span><span><b>Subject:</b> {reportModel.context.subjects.join(', ') || '—'}</span><span><b>Teacher:</b> {teacherName}</span><span><b>Academic year:</b> {academicYear || '—'}</span>{term ? <span><b>Term:</b> {term}</span> : null}<span><b>Reporting period:</b> {dateFrom || 'All dates'} – {dateTo || 'Present'}</span></section>
        <section className="collective-print-scope">
          <div><small>Students</small><strong>{displayRows.length}</strong></div>
          <div><small>Assignments</small><strong>{filteredAssignments.length}</strong></div>
          <div><small>Subjects</small><strong>{[...new Set(filteredAssignments.map((assignment) => assignment.subject_name))].join(', ') || '—'}</strong></div>
          <div><small>Classes</small><strong>{[...new Set(displayRows.map((row) => row.batch))].join(', ') || '—'}</strong></div>
        </section>
        {reportNote.trim() ? <p className="collective-print-note"><strong>Teacher context:</strong> {reportNote.trim()}</p> : null}
        {includeSummary && summaryStats ? (
          <section className="collective-print-section">
            <div className="collective-print-section__heading"><span>01</span><div><h2>Summary</h2><p>Class achievement and assignment completion.</p></div></div>
            <div className="collective-print-kpis">
              <div><small>Class average</small><strong>{summaryStats.totalCompleted ? `${summaryStats.avgAcc}%` : '—'}</strong><span>Across completed assignments</span></div>
              <div><small>Assignment completion</small><strong>{summaryStats.completionRate}%</strong><span>{summaryStats.totalCompleted} of {summaryStats.totalPossible} completed</span></div>
              <div><small>Students requiring support</small><strong>{summaryStats.needsAttention}</strong><span>Below expected level or not submitted</span></div>
            </div>
          </section>
        ) : null}
        {includeGradeMatrix ? (
          <section className="collective-print-section collective-print-page">
            <div className="collective-print-section__heading"><span>02</span><div><h2>Student results</h2><p>Marks for selected assignments. Missing work is labelled and is excluded from the existing completed-work average.</p></div></div>
            <div className="collective-print-table-wrap">
              <table className="collective-print-table">
                <thead><tr><th>Student</th><th>Class</th>{filteredAssignments.map((assignment) => <th key={assignment.id}>{assignment.title || assignment.topic_name}<small>{assignment.subject_name}</small></th>)}<th>Completed</th><th>Average</th><th>Status</th></tr></thead>
                <tbody>
                  {displayRows.map((row) => (
                    <tr key={row.studentId}>
                      <td><strong>{row.studentName}</strong></td>
                      <td>{row.batch}</td>
                      {filteredAssignments.map((assignment) => {
                        const score = row.scores[assignment.id];
                        const band = !score ? '' : score.accuracy >= 80 ? 'collective-grade--strong' : score.accuracy >= 60 ? 'collective-grade--developing' : 'collective-grade--support';
                        return <td key={assignment.id} className={band}>{score ? `${score.accuracy}%` : <span className="collective-not-submitted">Not submitted</span>}</td>;
                      })}
                      <td>{row.completedCount}/{filteredAssignments.length}</td>
                      <td className={row.completedCount ? row.averageAccuracy >= 80 ? 'collective-grade--strong' : row.averageAccuracy >= 60 ? 'collective-grade--developing' : 'collective-grade--support' : ''}><strong>{row.completedCount ? `${row.averageAccuracy}%` : 'Not assessed'}</strong></td>
                      <td>{getStudentStatus(row).label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {includeAssignmentBreakdown ? (
          <section className="collective-print-section">
            <div className="collective-print-section__heading"><span>03</span><div><h2>Assignment performance</h2><p>Use this view to identify which selected tasks need reteaching or follow-up.</p></div></div>
            <table className="collective-print-table collective-print-table--summary">
              <thead><tr><th>Assignment</th><th>Subject</th><th>Class / audience</th><th>Assigned</th><th>Average attainment</th><th>Completed</th></tr></thead>
              <tbody>{assignmentStats.map(({ assignment, average, completed, expected }) => <tr key={assignment.id}><td><strong>{assignment.title || assignment.topic_name}</strong></td><td>{assignment.subject_name}</td><td>{assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || '—'}</td><td>{new Date(assignment.assigned_at).toLocaleDateString()}</td><td><strong>{average === null ? '—' : `${average}%`}</strong></td><td>{completed}/{expected}</td></tr>)}</tbody>
            </table>
          </section>
        ) : null}
        <footer className="collective-print-footer"><span>{reportModel.school.name} · Confidential — For authorised school use only</span><span>Document reference: <span data-collective-report-id>{reportModel.reportId}</span> · Generated <span data-collective-generated-at>{generatedAt}</span></span></footer>
      </article>

      {/* Header */}
      <div className="teacher-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              Class Achievement Report
            </h2>
            <p className="text-slate-500 mt-1">
              {visibleScope.subjects} · {visibleScope.classes} · {visibleScope.dateLabel}<br />
              <span className="text-xs">{filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''} · {displayRows.length} student{displayRows.length !== 1 ? 's' : ''}</span>
            </p>
          </div>

          <div className="collective-report-no-print collective-header-actions">
            <div className="collective-export-menu">
              <button type="button" className="teacher-btn teacher-btn-secondary text-sm" onClick={() => setExportOpen((open) => !open)} aria-expanded={exportOpen}>Export <span aria-hidden="true">⌄</span></button>
              {exportOpen ? <div role="menu"><button type="button" role="menuitem" onClick={() => { handleExportCSV(); setExportOpen(false); }}>Download CSV</button><button type="button" role="menuitem" onClick={() => { printReport(); setExportOpen(false); }}>Print report</button></div> : null}
            </div>
            <button type="button" onClick={() => { setBuilderStep(1); setBuilderOpen(true); }} disabled={!displayRows.length} className="teacher-btn teacher-btn-primary text-sm">Create report</button>
          </div>
        </div>
      </div>

      {builderOpen ? createPortal(<div className="collective-builder-overlay collective-report-no-print" role="presentation"><section className="collective-report-builder" role="dialog" aria-modal="true" aria-labelledby="collective-builder-title">
        <header>
          <div><span>School Report · Step {builderStep} of 3</span><h3 id="collective-builder-title">{builderStep === 1 ? 'Choose class report details' : builderStep === 2 ? 'Choose report sections' : 'Review and generate report'}</h3><p>{builderStep === 1 ? 'Select the assignments and students to include.' : builderStep === 2 ? 'Choose the sections needed for this school report.' : 'Confirm the report details before printing or saving as PDF.'}</p></div>
          <button type="button" className="collective-builder-close" onClick={() => setBuilderOpen(false)} aria-label="Close report builder">×</button>
        </header>
        <div className="collective-builder-progress" aria-label={`Step ${builderStep} of 3`}><i className={builderStep >= 1 ? 'active' : ''}/><i className={builderStep >= 2 ? 'active' : ''}/><i className={builderStep >= 3 ? 'active' : ''}/></div>
        {builderStep === 1 ? <div className="collective-builder-selectors">
          <details open>
            <summary><span><strong>Assignments to include</strong><small>{selectedAssignmentIds.length} of {assignments.length} selected</small></span><span>Choose assignments</span></summary>
            <div className="collective-builder-actions"><button type="button" onClick={() => setSelectedAssignmentIds(assignments.map((assignment) => assignment.id))}>Select all</button><button type="button" onClick={() => setSelectedAssignmentIds([])}>Clear</button></div>
            <div className="collective-builder-list">{assignments.map((assignment) => <label key={assignment.id}><input type="checkbox" checked={selectedAssignmentIds.includes(assignment.id)} onChange={() => setSelectedAssignmentIds((current) => current.includes(assignment.id) ? current.filter((id) => id !== assignment.id) : [...current, assignment.id])} /><span><strong>{assignment.title || assignment.topic_name}</strong><small>{assignment.subject_name} · {assignment.assignment_mode === 'custom' ? 'Selected students' : `Class ${assignment.batch || '—'}`} · {new Date(assignment.assigned_at).toLocaleDateString()}</small></span></label>)}</div>
          </details>
          <details open>
            <summary><span><strong>Students to include</strong><small>{selectedStudentIds.length} of {studentRows.length} selected</small></span><span>Choose students</span></summary>
            <div className="collective-builder-actions"><button type="button" onClick={() => { setStudentSelectionReady(true); setSelectedStudentIds(studentRows.map((student) => student.studentId)); }}>Select all</button><button type="button" onClick={() => { setStudentSelectionReady(true); setSelectedStudentIds([]); }}>Clear</button></div>
            <div className="collective-builder-list">{studentRows.map((student) => <label key={student.studentId}><input type="checkbox" checked={selectedStudentIds.includes(student.studentId)} onChange={() => { setStudentSelectionReady(true); setSelectedStudentIds((current) => current.includes(student.studentId) ? current.filter((id) => id !== student.studentId) : [...current, student.studentId]); }} /><span><strong>{student.studentName}</strong><small>Class {student.batch} · {student.completedCount} selected submission{student.completedCount === 1 ? '' : 's'}</small></span></label>)}</div>
            {!studentRows.length ? <p className="collective-builder-empty">No students are currently assigned to this teacher’s classes.</p> : null}
          </details>
        </div> : null}
        {builderStep === 2 ? <div className="collective-builder-body"><fieldset className="collective-builder-sections"><legend>Include in the report</legend><label><input type="checkbox" checked={includeSummary} onChange={(event) => setIncludeSummary(event.target.checked)} /> <span><strong>Executive summary</strong><small>Headline attainment and completion</small></span></label><label><input type="checkbox" checked={includeGradeMatrix} onChange={(event) => setIncludeGradeMatrix(event.target.checked)} /> <span><strong>Student results</strong><small>Individual grades and completion</small></span></label><label><input type="checkbox" checked={includeAssignmentBreakdown} onChange={(event) => setIncludeAssignmentBreakdown(event.target.checked)} /> <span><strong>Assignment summary</strong><small>Performance by selected task</small></span></label></fieldset><label className="collective-order-field"><span>Student order</span><select value={isCustomMode ? 'custom' : sortColumn === 'average' && sortDirection === 'asc' ? 'attention' : 'name'} onChange={(event) => { if (event.target.value === 'custom') { if (!isCustomMode) toggleCustomMode(); } else { setIsCustomMode(false); setSortColumn(event.target.value === 'attention' ? 'average' : 'name'); setSortDirection('asc'); } }}><option value="name">Name A–Z</option><option value="attention">Lowest attainment first</option><option value="custom">Custom order</option></select><small>Custom order enables drag controls in the results table.</small></label></div> : null}
        {builderStep === 3 ? <div className="collective-builder-body"><div className="collective-builder-grid"><label className="collective-builder-field"><span>Report title</span><input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} maxLength={90} /></label><label className="collective-builder-field"><span>Academic year</span><input value={academicYear} readOnly /></label><label className="collective-builder-field"><span>Term / period</span><input value={term} readOnly /></label><label className="collective-builder-field"><span>Teacher comments <small>optional</small></span><input value={reportNote} onChange={(event) => setReportNote(event.target.value)} placeholder="Context for report recipients…" maxLength={180} /></label></div><div className="collective-review-card"><strong>{reportTitle || 'Class Achievement Report'}</strong><span>{displayRows.length} students, {filteredAssignments.length} assignments, {reportModel.context.subjects.join(', ')}, Class {reportModel.context.className}, {dateFrom || 'all dates'}–{dateTo || 'present'}.</span><span>{[includeSummary, includeGradeMatrix, includeAssignmentBreakdown].filter(Boolean).length} report sections selected</span></div></div> : null}
        <div className="collective-builder-footer"><button type="button" className="secondary" onClick={() => builderStep === 1 ? setBuilderOpen(false) : setBuilderStep((builderStep - 1) as 1 | 2)}> {builderStep === 1 ? 'Close' : 'Back'}</button>{builderStep < 3 ? <button type="button" onClick={() => setBuilderStep((builderStep + 1) as 2 | 3)} disabled={builderStep === 1 && (!displayRows.length || !filteredAssignments.length)}>Continue</button> : <button type="button" onClick={printReport} disabled={!displayRows.length || !filteredAssignments.length || !includeGradeMatrix}>Print report</button>}</div>
      </section></div>, document.body) : null}

      {/* Summary cards */}
      {summaryStats && (
        <div className="collective-kpi-grid">
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Average attainment <span title="Average of the displayed completed assignment percentages" aria-label="Average of the displayed completed assignment percentages">ⓘ</span></div>
            <div className={`text-2xl font-bold ${!summaryStats.totalCompleted ? 'text-slate-400' : summaryStats.avgAcc >= 70 ? 'text-green-600' : summaryStats.avgAcc >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {summaryStats.totalCompleted ? `${summaryStats.avgAcc}%` : '—'}
            </div>
          </div>
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Completion Rate</div>
            <div className="text-2xl font-bold text-cyan-600">{summaryStats.completionRate}%</div>
            <div className="text-xs text-slate-400">{summaryStats.totalCompleted}/{summaryStats.totalPossible}</div>
          </div>
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Needs attention</div>
            <div className="text-2xl font-bold text-rose-600">{summaryStats.needsAttention}</div>
            <div className="text-xs text-slate-400">Low attainment or missing work</div>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="collective-report-no-print teacher-card flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search students…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Subject filter */}
        {uniqueSubjects.length > 1 && (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Subjects</option>
            {uniqueSubjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* One class is always required. There is intentionally no All Classes option. */}
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

        {(subjectFilter !== 'all' || categoryFilter !== 'all' || searchTerm || periodMode === 'custom') && (
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
      </div>

      {/* Custom order info banner */}
      {isCustomMode && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-purple-300 bg-purple-50 text-sm">
          <div className="flex items-center gap-2 text-purple-700">
            <span className="text-lg">✋</span>
            <span>
              <strong>Custom Order mode</strong> — Drag rows or use the ▲ ▼ buttons to rearrange students. Your arrangement is saved automatically.
            </span>
          </div>
          <button
            onClick={resetCustomOrder}
            className="flex-shrink-0 px-3 py-1 rounded-lg border border-purple-300 text-purple-600 text-xs font-semibold hover:bg-purple-100 transition-colors"
          >
            Reset to A–Z
          </button>
        </div>
      )}

      {/* Main table */}
      <div className="collective-status-legend collective-report-no-print" aria-label="Student status guide"><span><i className="is-on-track" />On track (80%+)</span><span><i className="is-review" />Review (60–79%)</span><span><i className="is-support" />Support (below 60%)</span><span><i className="is-incomplete" />Incomplete submission</span></div>
      {displayRows.length === 0 ? (
        <div className="teacher-card p-10 text-center">
          <div className="text-5xl mb-3">📭</div>
          <p className="text-slate-500">
            {studentRows.length === 0
              ? 'No students have completed any assignments yet.'
              : 'No students match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="teacher-card p-0 overflow-hidden">
          <div className="collective-results-table-wrap">
            <table className={`collective-results-table text-left text-sm ${isCustomMode ? 'is-custom-order' : ''}`}>
              <colgroup>
                {isCustomMode && <col className="collective-results-col--drag" />}
                <col className="collective-results-col--student" />
                <col className="collective-results-col--class" />
                {filteredAssignments.map((assignment) => <col key={assignment.id} />)}
                <col className="collective-results-col--completion" />
                <col className="collective-results-col--average" />
                <col className="collective-results-col--status" />
              </colgroup>
              <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {/* Drag handle column (visible only in custom mode) */}
                  {isCustomMode && (
                    <th className="py-3 px-1 w-[60px] text-center text-slate-400 font-semibold text-xs sticky left-0 bg-slate-100 z-20">
                      ↕️
                    </th>
                  )}
                  {/* Fixed columns */}
                  <th
                    className={`collective-results-student-cell py-3 px-3 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none bg-slate-100 z-20 ${isCustomMode ? '' : 'sticky left-0'}`}
                    onClick={() => handleSort('name')}
                  >
                    Student {sortIndicator('name')}
                  </th>
                  <th
                    className="collective-results-class-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none bg-slate-100 z-20"
                    onClick={() => handleSort('batch')}
                  >
                    Class {sortIndicator('batch')}
                  </th>

                  {/* One column per assignment */}
                  {filteredAssignments.map((a) => (
                    <th
                      key={a.id}
                      className="collective-results-assignment-cell py-2 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none text-center"
                      onClick={() => handleSort({ assignmentId: a.id })}
                      title={`${a.subject_name} — ${a.title || a.topic_name}\nClass: ${a.batch ?? 'All'}\nClick to sort`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide" style={assignmentCategoryBadgeStyle(a.assignment_category)}>{getAssignmentCategoryMeta(a.assignment_category).label}</span>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{a.subject_name}</span>
                        <span className="collective-results-assignment-title text-xs" title={a.title || a.topic_name}>{a.title || a.topic_name}</span>
                        {sortIndicator({ assignmentId: a.id })}
                      </div>
                    </th>
                  ))}

                  <th className="collective-results-summary-cell collective-results-completion-cell py-3 px-2 text-slate-700 font-semibold text-center bg-slate-100">Completion</th>
                  {/* Average column */}
                  <th
                    className="collective-results-summary-cell collective-results-average-cell py-3 px-2 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none text-center bg-slate-200/60"
                    onClick={() => handleSort('average')}
                  >
                    Average {sortIndicator('average')}
                  </th>

                  {/* Completion count */}
                  <th className="collective-results-summary-cell collective-results-status-cell py-3 px-2 text-slate-700 font-semibold text-center bg-slate-100">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr
                    key={row.studentId}
                    draggable={isCustomMode}
                    onDragStart={isCustomMode ? (e) => handleDragStart(e, i) : undefined}
                    onDragOver={isCustomMode ? (e) => handleDragOver(e, i) : undefined}
                    onDragLeave={isCustomMode ? handleDragLeave : undefined}
                    onDrop={isCustomMode ? (e) => handleDrop(e, i) : undefined}
                    onDragEnd={isCustomMode ? handleDragEnd : undefined}
                    className={`border-b border-slate-100 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                    } ${
                      isCustomMode ? 'cursor-grab active:cursor-grabbing' : 'hover:bg-cyan-50/40'
                    } ${
                      dragActiveIdx === i ? 'opacity-40 scale-[0.98]' : ''
                    } ${
                      dropTargetIdx === i && dragActiveIdx !== i ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/60' : ''
                    }`}
                  >
                    {/* Drag handle + move buttons (custom mode) */}
                    {isCustomMode && (
                      <td className="py-1 px-1 text-center sticky left-0 bg-inherit z-10">
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            onClick={() => moveStudent(row.studentId, 'up')}
                            disabled={i === 0}
                            className={`w-6 h-5 rounded text-[10px] font-bold transition-colors ${
                              i === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-purple-500 hover:bg-purple-100'
                            }`}
                            title="Move up"
                          >
                            ▲
                          </button>
                          <span className="text-slate-400 text-[10px] select-none cursor-grab" title="Drag to reorder">⠿</span>
                          <button
                            onClick={() => moveStudent(row.studentId, 'down')}
                            disabled={i === displayRows.length - 1}
                            className={`w-6 h-5 rounded text-[10px] font-bold transition-colors ${
                              i === displayRows.length - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-purple-500 hover:bg-purple-100'
                            }`}
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                      </td>
                    )}
                    {/* Name */}
                    <td className={`collective-results-student-cell py-3 px-3 font-medium text-slate-800 bg-inherit z-10 ${isCustomMode ? '' : 'sticky left-0'}`}>
                      {isCustomMode && <span className="text-purple-400 text-xs mr-2 font-mono">{i + 1}.</span>}
                      {row.studentName}
                    </td>
                    {/* Class */}
                    <td className="collective-results-class-cell py-3 px-2 text-slate-600 bg-inherit z-10">{row.batch}</td>

                    {/* Scores */}
                    {filteredAssignments.map((a) => {
                      const s = row.scores[a.id];
                      if (!s) {
                        return (
                          <td key={a.id} className="collective-results-assignment-cell py-3 px-2 text-center">
                          <span className="text-slate-400 text-xs" title="Not submitted" aria-label="Not submitted">Not submitted</span>
                          </td>
                        );
                      }
                      const val = `${s.accuracy}%`;
                      return (
                        <td key={a.id} className="collective-results-assignment-cell py-3 px-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold border ${accuracyBg(s.accuracy)}`}
                            title={`Score: ${s.score} | Accuracy: ${s.accuracy}% | ✅ ${s.correct} ❌ ${s.incorrect}\nCompleted: ${new Date(s.completedAt).toLocaleString()}`}
                          >
                            {val}
                          </span>
                        </td>
                      );
                    })}

                    <td className="collective-results-summary-cell collective-results-completion-cell py-3 px-2 text-center text-slate-600 text-xs font-semibold">{row.completedCount}/{filteredAssignments.length}</td>
                    {/* Average */}
                    <td className="collective-results-summary-cell collective-results-average-cell py-3 px-2 text-center bg-slate-50/95">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${row.completedCount ? accuracyColor(row.averageAccuracy) : 'text-slate-400 bg-slate-100'}`}>
                        {row.completedCount ? `${row.averageAccuracy}%` : '—'}
                      </span>
                    </td>

                    {/* Student status */}
                    <td className="collective-results-summary-cell collective-results-status-cell py-3 px-2 text-center text-slate-600 text-xs bg-inherit">
                      <span className={`collective-status ${getStudentStatus(row).className}`}>{getStudentStatus(row).label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {displayRows.length} student{displayRows.length !== 1 ? 's' : ''} · Completion is shown beside each average ({summaryStats?.totalCompleted ?? 0}/{summaryStats?.totalPossible ?? 0})
            </span>
            <span>
              {isCustomMode
                ? '✋ Drag rows or use ▲▼ to arrange · order saved automatically'
                : 'Click any column header to sort'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectiveAssignmentReport;
