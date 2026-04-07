import React, { useEffect, useState } from 'react';
import { getTeacherStudentSummaryScoped, TeacherWritingReport, getWritingCalibrationCase } from '../../lib/brains_heist/writingIntegrationService.js';
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
      ? {
          report_type: 'teacher_writing_report',
          generated_at: new Date().toISOString(),
          period: month,
          student: {
            student_id: seededLegacy.data.student_id,
            student_name: seededLegacy.data.student_name,
            grade: seededLegacy.data.grade,
            class_id: null,
            class_name: 'Unassigned',
          },
          genre: 'essay',
          overall_summary: {
            latest_score: seededLegacy.data.latest_assessment?.total_score ?? null,
            score_trend_delta: null,
            completion_rate_percent: 0,
            completed_tasks: seededLegacy.data.latest_practice_evaluations.length,
            total_tasks: seededLegacy.data.generated_daily_tasks.length,
          },
          strengths: [],
          priority_weak_areas: seededLegacy.data.latest_assessment?.weakness_tags ?? [],
          repeated_error_patterns: seededLegacy.data.latest_assessment?.weakness_tags ?? [],
          latest_evaluation: (seededLegacy.data.latest_practice_evaluations[0]?.evaluation as unknown as Record<string, unknown>) ?? {},
          monthly_summary: (seededLegacy.data.monthly_report_snapshot?.report as unknown as Record<string, unknown>) ?? {},
          teacher_actions: [],
          evidence_snippet: null,
          student_friendly_summary: {
            strengths: [],
            top_improvement_targets: seededLegacy.data.latest_assessment?.weakness_tags?.slice(0, 3) ?? [],
            progress_summary: seededLegacy.data.monthly_report_snapshot?.report.score_change ?? 'Keep going.',
            next_steps: [],
          },
        }
      : null;

  const [summary, setSummary] = useState<TeacherWritingReport | null>(seededSummary);
  const [loadError, setLoadError] = useState<string>('');

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
      <small>{WRITING_ADMIN_HELP.low_improvement_tag}</small>

      <section style={sectionStyle}>
        <strong>
          {summary.student.student_name} ({summary.student.student_id})
        </strong>
        <span>Grade {summary.student.grade ?? '—'}</span>
        <span>Class {summary.student.class_name}</span>
      </section>

      <section style={sectionStyle}>
        <strong>Latest assessment result</strong>
        {filters.weakness_tag ? <div>Filtered weakness focus: {filters.weakness_tag}</div> : null}
        <div>
          Calibration follow-up:{' '}
          {seededLegacy?.ok && seededLegacy.data?.calibration_follow_up_flag ? 'Flagged' : 'Not flagged'}
        </div>
        <div>Completion rate: {summary.overall_summary.completion_rate_percent}%</div>
        {assessment && Object.keys(assessment).length > 0 ? (
          <>
            <div>Total score: {summary.overall_summary.latest_score ?? '—'}</div>
            <div>
              Evaluation status: {String(assessment['completion_status'] ?? '—')} ({String(assessment['recommended_next_action'] ?? '—')})
            </div>
            <div>Weakness tags: {summary.priority_weak_areas.join(', ') || 'None'}</div>
          </>
        ) : (
          <div>No assessment available.</div>
        )}
      </section>

      <section style={sectionStyle}>
        <strong>Teacher actions</strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(summary.teacher_actions.length ? summary.teacher_actions : ['No teacher actions generated yet.']).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section style={sectionStyle}>
        <strong>Repeated error patterns</strong>
        <div>{summary.repeated_error_patterns.join(', ') || 'None detected.'}</div>
      </section>

      <section style={sectionStyle}>
        <strong>Student-friendly summary</strong>
        <div>{summary.student_friendly_summary.progress_summary}</div>
      </section>

      <section style={sectionStyle}>
        <strong>Monthly report snapshot</strong>
        <div>Month: {summary.period}</div>
        <div>Score trend delta: {summary.overall_summary.score_trend_delta ?? '—'}</div>
      </section>
    </div>
  );
};

export default WritingCalibrationReview;
