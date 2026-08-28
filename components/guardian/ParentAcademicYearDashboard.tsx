import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getGuardianChildProgress, type GuardianChild, type GuardianChildProgress } from '../../services/guardianService';
import ParentDashboardPremium from './ParentDashboardPremium';
import './ParentAcademicYearDashboard.css';

interface ParentAcademicYearDashboardProps {
  children: GuardianChild[];
  selectedId: string | null;
  progress: GuardianChildProgress | null;
  days: number;
  loading: boolean;
  error: string | null;
  message: string | null;
  onSelectChild: (studentId: string) => void;
  onChangeDays: (days: number) => void;
  onRetry: () => void;
  onSignOut: () => void;
  onChooseWorkspace?: () => void;
}

const formatYearDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const escapeCssContent = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const ParentAcademicYearDashboard: React.FC<ParentAcademicYearDashboardProps> = ({
  children,
  selectedId,
  progress,
  days,
  loading,
  error,
  message,
  onSelectChild,
  onChangeDays,
  onRetry,
  onSignOut,
  onChooseWorkspace,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [displayProgress, setDisplayProgress] = useState<GuardianChildProgress | null>(progress);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

  useEffect(() => {
    setControlsHost(rootRef.current?.querySelector<HTMLElement>('.parent-premium-actions') || null);
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    setSelectedSubject('all');
    setDisplayProgress(progress);
    setFilterLoading(false);
    setFilterError(null);
  }, [progress, selectedId]);

  const subjects = useMemo(() => {
    const source = displayProgress?.available_subjects?.length
      ? displayProgress.available_subjects
      : progress?.available_subjects?.length
        ? progress.available_subjects
        : progress?.subjects.map((item) => item.subject) || [];
    return [...new Set(source.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }, [displayProgress, progress]);

  const currentChild = children.find((child) => child.student_id === selectedId) || children[0];
  const year = displayProgress?.academic_year || progress?.academic_year;
  const yearLabel = year?.name || displayProgress?.period?.label || progress?.period?.label || 'Current school year';
  const yearDates = year?.starts_on && year?.ends_on
    ? `${formatYearDate(year.starts_on)} – ${formatYearDate(year.ends_on)}`
    : 'School-configured academic period';
  const visibleDays = displayProgress?.period?.days ?? progress?.period?.days ?? days;
  const childContext = [
    currentChild?.grade ? `Grade ${currentChild.grade}` : 'Grade —',
    `Class ${currentChild?.class_name || '—'}`,
    `Current school year · ${yearLabel}`,
  ].join(' · ');
  const shellStyle = {
    '--parent-child-context': `"${escapeCssContent(childContext)}"`,
  } as React.CSSProperties & { '--parent-child-context': string };

  const changeSubject = async (nextSubject: string) => {
    setSelectedSubject(nextSubject);
    setFilterError(null);
    const requestId = ++requestIdRef.current;

    if (nextSubject === 'all') {
      setDisplayProgress(progress);
      setFilterLoading(false);
      return;
    }
    if (!selectedId) return;

    setFilterLoading(true);
    try {
      const next = await getGuardianChildProgress(selectedId, days, nextSubject);
      if (requestId === requestIdRef.current) setDisplayProgress(next);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setFilterError(loadError instanceof Error ? loadError.message : 'This subject could not be loaded.');
      setSelectedSubject('all');
      setDisplayProgress(progress);
    } finally {
      if (requestId === requestIdRef.current) setFilterLoading(false);
    }
  };

  const selectChild = (studentId: string) => {
    requestIdRef.current += 1;
    setSelectedSubject('all');
    setDisplayProgress(null);
    setFilterError(null);
    onSelectChild(studentId);
  };

  const controls = <div className="parent-academic-year-controls" aria-label="Academic progress filters">
    <div className="parent-academic-year-chip" title={yearDates}>
      <span>School year</span>
      <strong>{yearLabel}</strong>
    </div>
    <label className="parent-academic-subject-filter">
      <span>Subject</span>
      <select
        aria-label="Choose subject"
        value={selectedSubject}
        disabled={filterLoading || !subjects.length}
        onChange={(event) => void changeSubject(event.target.value)}
      >
        <option value="all">All subjects</option>
        {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
      </select>
    </label>
  </div>;

  return <div
    ref={rootRef}
    className={`parent-academic-year-shell ${selectedSubject !== 'all' ? 'is-subject-filtered' : ''}`}
    style={shellStyle}
  >
    <ParentDashboardPremium
      children={children}
      selectedId={selectedId}
      progress={displayProgress}
      days={visibleDays}
      loading={loading || filterLoading}
      error={filterError || error}
      message={message}
      onSelectChild={selectChild}
      onChangeDays={onChangeDays}
      onRetry={onRetry}
      onSignOut={onSignOut}
      onChooseWorkspace={onChooseWorkspace}
    />
    {controlsHost ? createPortal(controls, controlsHost) : null}
  </div>;
};

export default ParentAcademicYearDashboard;
