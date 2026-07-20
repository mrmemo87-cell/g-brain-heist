import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TeacherAssignmentSummary, TeacherAssignmentReportRow, Subject } from '../types';
import * as GameService from '../services/gameService';
import { brainsAlert } from '../src/utils/brainsAlert';

// localStorage key prefix for persisted custom orders
const CUSTOM_ORDER_STORAGE_KEY = 'brains_collective_report_custom_order';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CollectiveAssignmentReportProps {
  assignments: TeacherAssignmentSummary[];
  onBack: () => void;
  onViewAssignment?: (assignment: TeacherAssignmentSummary) => void;
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
  onBack,
  onViewAssignment,
}) => {
  // Work state
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [reportData, setReportData] = useState<Record<string, TeacherAssignmentReportRow[]>>({});

  // Filters
  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Custom ordering (list of studentIds in the teacher's preferred order)
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Drag-and-drop state
  const dragRowIndex = useRef<number | null>(null);
  const dragOverRowIndex = useRef<number | null>(null);
  const [dragActiveIdx, setDragActiveIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  // Display mode
  const [showScore, setShowScore] = useState<'accuracy' | 'score'>('accuracy');

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

  // ── Filtered assignments ─────────────────────────────────────────────────
  const filteredAssignments = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return assignments.filter((assignment) => {
      if (subjectFilter !== 'all' && assignment.subject_name !== subjectFilter) return false;
      if (assignmentFilter !== 'all' && assignment.id !== assignmentFilter) return false;
      const created = new Date(assignment.assigned_at).getTime();
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      return true;
    });
  }, [assignments, subjectFilter, assignmentFilter, dateFrom, dateTo]);

  // ── Unique subjects for filter dropdown ──────────────────────────────────
  const uniqueSubjects = useMemo(() => {
    const s = new Set(assignments.map((a) => a.subject_name));
    return Array.from(s).sort();
  }, [assignments]);

  // ── Build student rows ───────────────────────────────────────────────────
  const studentRows: StudentRow[] = useMemo(() => {
    const studentMap = new Map<string, StudentRow>();
    const activeIds = new Set(filteredAssignments.map((a) => a.id));

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
  }, [filteredAssignments, reportData]);

  // ── Unique batches for filter ────────────────────────────────────────────
  const uniqueBatches = useMemo(() => {
    const b = new Set(studentRows.map((r) => r.batch));
    return Array.from(b).sort();
  }, [studentRows]);

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

    // Batch filter
    if (batchFilter !== 'all') {
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
  }, [studentRows, batchFilter, searchTerm, sortColumn, sortDirection, isCustomMode, customOrder]);

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
      'Batch',
      ...filteredAssignments.map((a) => a.title || a.topic_name),
      'Average Accuracy (%)',
      'Completed',
    ];

    const csvRows = displayRows.map((row) => [
      escape(row.studentName),
      escape(row.batch),
      ...filteredAssignments.map((a) => {
        const s = row.scores[a.id];
        if (!s) return escape('—');
        return showScore === 'accuracy' ? escape(`${s.accuracy}%`) : escape(s.score);
      }),
      escape(row.averageAccuracy),
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
  }, [displayRows, filteredAssignments, showScore]);

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
    const avgAcc = Math.round(displayRows.reduce((s, r) => s + r.averageAccuracy, 0) / displayRows.length);
    const totalCompleted = displayRows.reduce((s, r) => s + r.completedCount, 0);
    const totalPossible = displayRows.length * filteredAssignments.length;
    const completionRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
    const topStudent = [...displayRows].sort((a, b) => b.averageAccuracy - a.averageAccuracy)[0];
    return { avgAcc, totalCompleted, totalPossible, completionRate, topStudent };
  }, [displayRows, filteredAssignments]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-medium">
          Loading collective report… ({progress.done}/{progress.total} assignments)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="teacher-back-link mb-2">
        <span>←</span> Back to Reports
      </button>

      {/* Header */}
      <div className="teacher-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              📊 Collective Assignment Report
            </h2>
            <p className="text-slate-500 mt-1">
              Overview of all student scores across {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''}
              {displayRows.length > 0 && ` · ${displayRows.length} student${displayRows.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Toggle score display */}
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
              <button
                onClick={() => setShowScore('accuracy')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  showScore === 'accuracy'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Accuracy %
              </button>
              <button
                onClick={() => setShowScore('score')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  showScore === 'score'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Score
              </button>
            </div>

            {/* Custom arrangement toggle */}
            <button
              onClick={toggleCustomMode}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                isCustomMode
                  ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-200'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-purple-400 hover:bg-purple-50'
              }`}
              title={isCustomMode ? 'Exit custom arrangement mode' : 'Arrange students in a custom order (drag & drop)'}
            >
              {isCustomMode ? '✋ Custom Order ON' : '↕️ Custom Order'}
            </button>

            <button
              onClick={handleExportCSV}
              disabled={displayRows.length === 0}
              className={`teacher-btn ${displayRows.length === 0 ? 'opacity-50 cursor-not-allowed' : 'teacher-btn-secondary'} text-sm`}
            >
              📥 Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {summaryStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Average Accuracy</div>
            <div className={`text-2xl font-bold ${summaryStats.avgAcc >= 70 ? 'text-green-600' : summaryStats.avgAcc >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {summaryStats.avgAcc}%
            </div>
          </div>
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Completion Rate</div>
            <div className="text-2xl font-bold text-cyan-600">{summaryStats.completionRate}%</div>
            <div className="text-xs text-slate-400">{summaryStats.totalCompleted}/{summaryStats.totalPossible}</div>
          </div>
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Students</div>
            <div className="text-2xl font-bold text-indigo-600">{displayRows.length}</div>
          </div>
          <div className="teacher-card text-center py-4">
            <div className="text-sm text-slate-500 mb-1">Top Student</div>
            <div className="text-lg font-bold text-emerald-600 truncate px-2">
              {summaryStats.topStudent?.studentName ?? '—'}
            </div>
            <div className="text-xs text-slate-400">{summaryStats.topStudent?.averageAccuracy ?? 0}% avg</div>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
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

        {/* Class filter */}
        {uniqueBatches.length > 1 && (
          <select
            aria-label="Filter by class"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Classes</option>
            {uniqueBatches.map((b) => (
              <option key={b} value={b}>Class {b}</option>
            ))}
          </select>
        )}

        <select
          aria-label="Filter by assignment"
          value={assignmentFilter}
          onChange={(event) => setAssignmentFilter(event.target.value)}
          className="max-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">All Assignments</option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>{assignment.title || assignment.topic_name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          From
          <input aria-label="Created from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700" />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          To
          <input aria-label="Created to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700" />
        </label>

        {(subjectFilter !== 'all' || batchFilter !== 'all' || assignmentFilter !== 'all' || dateFrom || dateTo || searchTerm) && (
          <button
            type="button"
            onClick={() => {
              setSubjectFilter('all');
              setBatchFilter('all');
              setAssignmentFilter('all');
              setDateFrom('');
              setDateTo('');
              setSearchTerm('');
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
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
                    className={`py-3 px-4 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none whitespace-nowrap bg-slate-100 z-20 min-w-[180px] ${isCustomMode ? '' : 'sticky left-0'}`}
                    onClick={() => handleSort('name')}
                  >
                    Student {sortIndicator('name')}
                  </th>
                  <th
                    className="py-3 px-4 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none whitespace-nowrap"
                    onClick={() => handleSort('batch')}
                  >
                    Batch {sortIndicator('batch')}
                  </th>

                  {/* One column per assignment */}
                  {filteredAssignments.map((a) => (
                    <th
                      key={a.id}
                      className="py-2 px-3 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none text-center min-w-[110px]"
                      onClick={() => handleSort({ assignmentId: a.id })}
                      title={`${a.subject_name} — ${a.title || a.topic_name}\nBatch: ${a.batch ?? 'All'}\nClick to sort`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{a.subject_name}</span>
                        <span className="text-xs truncate max-w-[100px]">{a.title || a.topic_name}</span>
                        {sortIndicator({ assignmentId: a.id })}
                      </div>
                    </th>
                  ))}

                  {/* Average column */}
                  <th
                    className="py-3 px-4 text-slate-700 font-semibold cursor-pointer hover:bg-slate-200 transition-colors select-none text-center whitespace-nowrap bg-slate-200/60"
                    onClick={() => handleSort('average')}
                  >
                    Average {sortIndicator('average')}
                  </th>

                  {/* Completion count */}
                  <th className="py-3 px-4 text-slate-700 font-semibold text-center whitespace-nowrap">
                    Done
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
                    <td className={`py-3 px-4 font-medium text-slate-800 whitespace-nowrap bg-inherit z-10 ${isCustomMode ? '' : 'sticky left-0'}`}>
                      {isCustomMode && <span className="text-purple-400 text-xs mr-2 font-mono">{i + 1}.</span>}
                      {row.studentName}
                    </td>
                    {/* Batch */}
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{row.batch}</td>

                    {/* Scores */}
                    {filteredAssignments.map((a) => {
                      const s = row.scores[a.id];
                      if (!s) {
                        return (
                          <td key={a.id} className="py-3 px-3 text-center">
                            <span className="text-slate-300 text-xs">—</span>
                          </td>
                        );
                      }
                      const val = showScore === 'accuracy' ? `${s.accuracy}%` : s.score;
                      return (
                        <td key={a.id} className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold border ${accuracyBg(s.accuracy)}`}
                            title={`Score: ${s.score} | Accuracy: ${s.accuracy}% | ✅ ${s.correct} ❌ ${s.incorrect}\nCompleted: ${new Date(s.completedAt).toLocaleString()}`}
                          >
                            {val}
                          </span>
                        </td>
                      );
                    })}

                    {/* Average */}
                    <td className="py-3 px-4 text-center bg-slate-50/50">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${accuracyColor(row.averageAccuracy)}`}>
                        {row.averageAccuracy}%
                      </span>
                    </td>

                    {/* Completed count */}
                    <td className="py-3 px-4 text-center text-slate-600 text-xs">
                      {row.completedCount}/{filteredAssignments.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {displayRows.length} student{displayRows.length !== 1 ? 's' : ''} × {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''}
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
