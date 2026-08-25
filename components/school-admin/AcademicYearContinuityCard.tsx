import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchAcademicYearContinuity,
  type AcademicYearContinuity,
  type AcademicYearContinuityYear,
} from '../../services/academicYearContinuityService';
import { useSchoolAdmin } from './SchoolAdminContext';
import './AcademicYearContinuityCard.css';

const formatDateRange = (year: AcademicYearContinuityYear) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatter.format(new Date(`${year.startsOn}T00:00:00Z`))} – ${formatter.format(new Date(`${year.endsOn}T00:00:00Z`))}`;
};

const metricLabel = (value: number) => new Intl.NumberFormat().format(value || 0);

const Metric: React.FC<{ label: string; value: number; note?: string }> = ({ label, value, note }) => (
  <div className="academic-continuity-metric">
    <strong>{metricLabel(value)}</strong>
    <span>{label}</span>
    {note ? <small>{note}</small> : null}
  </div>
);

const AcademicYearContinuityCard: React.FC = () => {
  const { school } = useSchoolAdmin();
  const [continuity, setContinuity] = useState<AcademicYearContinuity | null>(null);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAcademicYearContinuity(school.id)
      .then((result) => {
        if (cancelled) return;
        setContinuity(result);
        setSelectedYearId(result.currentYearId || result.years[0]?.id || '');
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        console.error('Failed to load academic-year continuity', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Academic-year continuity is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [school.id]);

  const selectedYear = useMemo(() => (
    continuity?.years.find((year) => year.id === selectedYearId)
    || continuity?.years[0]
    || null
  ), [continuity?.years, selectedYearId]);

  const currentYear = useMemo(() => (
    continuity?.years.find((year) => year.id === continuity.currentYearId) || null
  ), [continuity]);

  const latestClosedYear = useMemo(() => (
    continuity?.years.find((year) => year.status === 'closed') || null
  ), [continuity?.years]);

  if (loading) {
    return (
      <section className="academic-continuity-card is-loading" aria-busy="true">
        <div className="academic-continuity-loading-line" />
        <div className="academic-continuity-loading-grid">
          <span /><span /><span /><span />
        </div>
      </section>
    );
  }

  if (error || !continuity || !selectedYear) return null;

  const selectedIsCurrent = selectedYear.id === continuity.currentYearId;
  const currentStatusTitle = continuity.freshStart
    ? 'Clean start confirmed'
    : 'Current year is underway';
  const currentStatusCopy = continuity.freshStart
    ? `No previous assignments, writing or official learning evidence is being counted in ${currentYear?.name || 'the current year'}.`
    : `The dashboard is showing only activity recorded inside ${currentYear?.name || 'the current academic year'}.`;
  const projectedHistory = selectedYear.legacyProjectedAssignments > 0
    ? `${metricLabel(selectedYear.legacyProjectedAssignments)} published assignment${selectedYear.legacyProjectedAssignments === 1 ? '' : 's'} are placed here by their original dates. Their historical records were not rewritten.`
    : null;

  return (
    <section className="academic-continuity-card" data-testid="academic-year-continuity-card">
      <div className="academic-continuity-hero">
        <div>
          <p className="academic-continuity-eyebrow">Fresh Start · Smart Memory</p>
          <h3>Start clean. Keep the story.</h3>
          <p>
            Each academic year has its own results and reporting space, while previous work remains available as protected history.
          </p>
        </div>
        <div className={`academic-continuity-status ${continuity.freshStart ? 'is-fresh' : 'is-active'}`}>
          <span aria-hidden="true" />
          <div>
            <strong>{currentStatusTitle}</strong>
            <small>{currentStatusCopy}</small>
          </div>
        </div>
      </div>

      <div className="academic-continuity-policy-strip" aria-label="Academic-year safeguards">
        <span>Current-year results only</span>
        <span>Closed years stay read-only</span>
        <span>Past evidence is context, not current attainment</span>
      </div>

      <div className="academic-continuity-toolbar">
        <div>
          <small>Explore academic history</small>
          <strong>{selectedYear.name}</strong>
          <span>{formatDateRange(selectedYear)}</span>
        </div>
        <label>
          <span>View year</span>
          <select
            value={selectedYear.id}
            onChange={(event) => setSelectedYearId(event.target.value)}
            aria-label="View academic year"
          >
            {continuity.years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name} — {year.status === 'closed' ? 'History' : year.status === 'current' ? 'Current' : 'Planned'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="academic-continuity-year-head">
        <div>
          <span className={`academic-continuity-year-badge ${selectedIsCurrent ? 'is-current' : 'is-history'}`}>
            {selectedIsCurrent ? 'Current workspace' : 'Read-only history'}
          </span>
          <h4>{selectedIsCurrent ? 'This year’s clean workspace' : `${selectedYear.name} academic memory`}</h4>
          <p>
            {selectedIsCurrent
              ? 'New assignments and evidence will build this year from zero without carrying old scores forward.'
              : 'Teachers and school leaders can review this history without changing the original academic record.'}
          </p>
        </div>
        {selectedYear.latestEvidenceAt ? (
          <small>Latest evidence {new Date(selectedYear.latestEvidenceAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</small>
        ) : <small>No evidence recorded yet</small>}
      </div>

      <div className="academic-continuity-metrics">
        <Metric label="Assignments" value={selectedYear.assignments} />
        <Metric label="Writing submissions" value={selectedYear.writingSubmissions} note={selectedYear.teacherReviewedWriting ? `${selectedYear.teacherReviewedWriting} teacher reviewed` : undefined} />
        <Metric label="Official evidence signals" value={selectedYear.officialLearningObservations} />
        <Metric label="Students enrolled" value={selectedYear.studentsEnrolled} />
      </div>

      <div className="academic-continuity-foot">
        <div>
          <strong>{selectedIsCurrent ? 'Fair by design' : 'History preserved safely'}</strong>
          <p>
            {selectedIsCurrent
              ? 'Previous-year writing can guide a teacher’s first conversations, but fresh assessed evidence is required before it affects this year’s Academic Profile.'
              : projectedHistory || 'Historical work remains attached to this year and is excluded from current-year attainment.'}
          </p>
        </div>
        {!selectedIsCurrent && latestClosedYear?.id === selectedYear.id ? (
          <span className="academic-continuity-memory-count">
            {metricLabel(selectedYear.assignments + selectedYear.writingSubmissions)} preserved records
          </span>
        ) : null}
      </div>
    </section>
  );
};

export default AcademicYearContinuityCard;
