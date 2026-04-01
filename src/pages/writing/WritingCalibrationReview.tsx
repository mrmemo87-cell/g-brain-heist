import React from 'react';
import { getWritingCalibrationCase, listAdminReviewSignals } from '../../lib/brains_heist/writingIntegrationService.js';
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
  if (isLoading) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading calibration review…</div>;
  }

  if (errorMessage) {
    return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load calibration review: {errorMessage}</div>;
  }

  const calibration = getWritingCalibrationCase(studentId, month);
  if (!calibration.ok || !calibration.data) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No calibration data found for this student yet.</div>;
  }

  const data = calibration.data;
  const assessment = data.latest_assessment;
  const filters = parseAdminDrilldownFilters(filterQuery);
  const reviewSignals = listAdminReviewSignals({ student_id: studentId });

  return (
    <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Admin Calibration Review</h2>
      <small>{WRITING_ADMIN_HELP.low_improvement_tag}</small>

      <section style={sectionStyle}>
        <strong>
          {data.student_name} ({data.student_id})
        </strong>
        <span>Grade {data.grade}</span>
      </section>

      <section style={sectionStyle}>
        <strong>Prompt text</strong>
        <div>{data.prompt_text ?? 'No prompt found.'}</div>
      </section>

      <section style={sectionStyle}>
        <strong>Student submission</strong>
        <div>{data.student_submission ?? 'No student submission found.'}</div>
      </section>

      <section style={sectionStyle}>
        <strong>Latest assessment result</strong>
        {filters.weakness_tag ? <div>Filtered weakness focus: {filters.weakness_tag}</div> : null}
        <div>Calibration follow-up: {data.calibration_follow_up_flag ? 'Flagged' : 'Not flagged'}</div>
        {data.calibration_follow_up_note ? <div>Follow-up note: {data.calibration_follow_up_note}</div> : null}
        <div>Review signals: {reviewSignals.ok ? reviewSignals.data!.length : 0}</div>
        {assessment ? (
          <>
            <div>Total score: {assessment.total_score}</div>
            <div>
              Subscale scores — Content: {assessment.subscores.content}, Communicative:{' '}
              {assessment.subscores.communicative_achievement ?? '—'}, Organisation: {assessment.subscores.organisation}, Language:{' '}
              {assessment.subscores.language}
            </div>
            <div>
              Band justifications — Content: {assessment.band_justification.content}; Communicative:{' '}
              {assessment.band_justification.communicative_achievement}; Organisation: {assessment.band_justification.organisation}; Language:{' '}
              {assessment.band_justification.language}
            </div>
            <div>Weakness tags: {assessment.weakness_tags.join(', ') || 'None'}</div>
          </>
        ) : (
          <div>No assessment available.</div>
        )}
      </section>

      <section style={sectionStyle}>
        <strong>Weekly targets</strong>
        {data.weekly_targets ? (
          <>
            <div>Primary: {data.weekly_targets.primary_target}</div>
            <div>Secondary: {data.weekly_targets.secondary_target}</div>
            <div>Maintenance: {data.weekly_targets.maintenance_target}</div>
          </>
        ) : (
          <div>No weekly targets available.</div>
        )}
      </section>

      <section style={sectionStyle}>
        <strong>Generated daily tasks</strong>
        {data.generated_daily_tasks.length === 0 ? (
          <div>No generated daily tasks found.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.generated_daily_tasks.map((task) => (
              <li key={task.day_number}>
                Day {task.day_number}: {task.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionStyle}>
        <strong>Latest practice evaluations</strong>
        {data.latest_practice_evaluations.length === 0 ? (
          <div>No practice evaluations found.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.latest_practice_evaluations.map((item) => (
              <li key={item.id}>
                Day {item.task_day_number}: {item.evaluation.completion_status} ({item.evaluation.recommended_next_action})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionStyle}>
        <strong>Monthly report snapshot</strong>
        {data.monthly_report_snapshot ? (
          <>
            <div>Month: {data.monthly_report_snapshot.month}</div>
            <div>Score change: {data.monthly_report_snapshot.report.score_change}</div>
          </>
        ) : (
          <div>No monthly report snapshot available for this month.</div>
        )}
      </section>
    </div>
  );
};

export default WritingCalibrationReview;
