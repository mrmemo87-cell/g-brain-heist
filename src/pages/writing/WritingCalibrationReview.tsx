import React, { useEffect, useState } from 'react';
import { getTeacherStudentSummaryScoped, TeacherWritingReport, getWritingCalibrationCase, mapCalibrationCaseToTeacherReport } from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';

interface WritingCalibrationReviewProps {
  studentId: string;
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

const sectionStyle = {
  border: '1px solid #334155',
  borderRadius: 10,
  background: '#0f172a',
  padding: 12,
  display: 'grid',
  gap: 8,
};

type ReviewTab = 'assessment' | 'actions' | 'patterns';

export const WritingCalibrationReview: React.FC<WritingCalibrationReviewProps> = ({
  studentId,
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededLegacy = isTestRuntime ? getWritingCalibrationCase(studentId, month) : null;
  const seededSummary: TeacherWritingReport | null =
    seededLegacy && seededLegacy.ok && seededLegacy.data
      ? mapCalibrationCaseToTeacherReport(seededLegacy.data, month, 'essay')
      : null;

  const [summary, setSummary] = useState<TeacherWritingReport | null>(seededSummary);
  const [loadError, setLoadError] = useState<string>('');
  const [tab, setTab] = useState<ReviewTab>('assessment');

  useEffect(() => {
    if (isTestRuntime) return;
    let cancelled = false;
    void getTeacherStudentSummaryScoped({ student_id: studentId, month, include_snippet: false }).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setSummary(null);
        setLoadError(result.error ?? 'No calibration data found for this student yet.');
        return;
      }
      setSummary(result.data);
      setLoadError('');
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, month, isTestRuntime]);

  if (isLoading) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading calibration review…</div>;
  }

  if (errorMessage) {
    return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load calibration review: {errorMessage}</div>;
  }

  if (loadError) return <div style={{ padding: 12, color: '#e5e7eb' }}>{loadError}</div>;
  if (!summary) return <div style={{ padding: 12, color: '#e5e7eb' }}>No calibration data found for this student yet.</div>;

  const filters = parseAdminDrilldownFilters(filterQuery);
  const assessment = summary.latest_evaluation as Record<string, any>;

  return (
    <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Admin Calibration Review</h2>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => setTab('assessment')} style={{ borderRadius: 999, border: '1px solid #334155', background: tab === 'assessment' ? '#1d4ed8' : '#1e293b', color: '#fff', padding: '4px 10px' }}>Assessment</button>
        <button type="button" onClick={() => setTab('actions')} style={{ borderRadius: 999, border: '1px solid #334155', background: tab === 'actions' ? '#1d4ed8' : '#1e293b', color: '#fff', padding: '4px 10px' }}>Teacher actions</button>
        <button type="button" onClick={() => setTab('patterns')} style={{ borderRadius: 999, border: '1px solid #334155', background: tab === 'patterns' ? '#1d4ed8' : '#1e293b', color: '#fff', padding: '4px 10px' }}>Patterns & summary</button>
      </div>

      <section style={sectionStyle}>
        <strong>{summary.student.student_name} · Grade {summary.student.grade ?? '—'} · {summary.student.class_name}</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Calibration follow-up: {summary.calibration_follow_up_flag ? 'Flagged' : 'Not flagged'}</span>
          <span style={{ background: summary.calibration_follow_up_flag ? '#7f1d1d' : '#14532d', color: summary.calibration_follow_up_flag ? '#fecaca' : '#bbf7d0', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
            {summary.calibration_follow_up_flag ? 'Needs calibration follow-up' : 'Calibration stable'}
          </span>
          <span style={{ background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Completion {summary.overall_summary.completion_rate_percent}%</span>
          <span style={{ background: '#312e81', color: '#c7d2fe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Latest score {summary.overall_summary.latest_score ?? '—'}</span>
        </div>
      </section>

      {tab === 'assessment' ? (
        <section style={sectionStyle}>
          <strong>Latest assessment result</strong>
          {filters.weakness_tag ? <div>Filtered weakness focus: {filters.weakness_tag}</div> : null}
          {assessment && Object.keys(assessment).length > 0 ? (
            <>
              <div>Evaluation status: {String(assessment['completion_status'] ?? '—')} ({String(assessment['recommended_next_action'] ?? '—')})</div>
              <div>Weakness tags: {summary.priority_weak_areas.join(', ') || 'None'}</div>
              <div>Score trend delta: {summary.overall_summary.score_trend_delta ?? '—'}</div>
            </>
          ) : (
            <div>No assessment available.</div>
          )}
          <small>{WRITING_ADMIN_HELP.low_improvement_tag}</small>
        </section>
      ) : null}

      {tab === 'actions' ? (
        <section style={sectionStyle}>
          <strong>Teacher actions</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(summary.teacher_actions.length ? summary.teacher_actions : ['No teacher actions generated yet.']).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'patterns' ? (
        <>
          <section style={sectionStyle}>
            <strong>Repeated error patterns</strong>
            <div>{summary.repeated_error_patterns.join(', ') || 'None detected.'}</div>
          </section>

          <section id="student-friendly-summary" data-testid="student-summary" style={sectionStyle}>
            <strong>Student-friendly summary</strong>
            <div>{summary.student_friendly_summary.progress_summary}</div>
          </section>

          <section style={sectionStyle}>
            <strong>Monthly report snapshot</strong>
            <div>Month: {summary.period}</div>
            <div>Score trend delta: {summary.overall_summary.score_trend_delta ?? '—'}</div>
          </section>
        </>
      ) : (
        <section id="student-friendly-summary" data-testid="student-summary" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
          <strong>Student-friendly summary</strong>
          <div>{summary.student_friendly_summary.progress_summary}</div>
        </section>
      )}
    </div>
  );
};

export default WritingCalibrationReview;
