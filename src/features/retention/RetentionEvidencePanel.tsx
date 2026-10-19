import React, { useState } from 'react';
import { getTrialEvidence } from '../../../services/retentionTrialService';
import type { RetentionEvidence } from './retentionModel';

const format = (count: number) => Number(count || 0).toLocaleString('en-US');
const dateLabel = (iso: string) => iso.slice(0, 10);
const matured = (ready: boolean, returned: number, members: number) =>
  ready ? `${returned}/${members} · ${Math.round(returned / Math.max(1, members) * 100)}%` : 'Not yet';

/** Data is fetched on demand from a superadmin-only, aggregate-only RPC. */
export default function RetentionEvidencePanel() {
  const [evidence, setEvidence] = useState<RetentionEvidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await getTrialEvidence();
      if (!response || !response.summary || !Array.isArray(response.weekly) || !Array.isArray(response.cohorts)) {
        throw new Error('INVALID_EVIDENCE_RESPONSE');
      }
      setEvidence(response);
    } catch {
      setError('Evidence is unavailable. Apply the retention evidence v2 migration, then try again as a superadmin.');
    } finally {
      setBusy(false);
    }
  };

  const figures = evidence ? [
    { label: 'Student meaningful users · 28d', value: evidence.summary.student_users_28d },
    { label: 'Teacher meaningful users · 28d', value: evidence.summary.teacher_users_28d },
    { label: 'Online assignments completed · 28d', value: evidence.summary.online_completions_28d },
    { label: 'Teacher assignments created · 28d', value: evidence.summary.teacher_assignments_28d },
    { label: 'Students active in 2+ weeks · 28d', value: evidence.summary.student_repeat_2weeks_28d },
    { label: 'Schools with meaningful actions · 28d', value: evidence.summary.active_schools_28d },
  ] : [];

  return (
    <section className="retention-suite retention-admin" aria-labelledby="investor-evidence-title" lang="en" dir="ltr">
      <div className="retention-metrics-heading">
        <div>
          <span className="retention-eyebrow">Superadmin · traction intelligence</span>
          <h3 id="investor-evidence-title">Investor retention evidence v2</h3>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy}>
          {busy ? 'Calculating…' : evidence ? 'Refresh evidence' : 'Load evidence'}
        </button>
      </div>
      <p className="retention-note">
        Meaningful actions only. Teacher actions are assignment creation, confirmed paper capture and intervention creation.
        Student actions are online assignment completion, completed quests and saved trial practice.
        Trial page views are reported separately and never count as meaningful returns.
      </p>
      {error && <p className="retention-error" role="alert">{error}</p>}
      {!evidence && !busy && !error && <p className="retention-note">Load the aggregate report on demand. Only platform superadmins can access these numbers.</p>}
      {evidence && (
        <>
          <p className="retention-note">
            UTC · {format(evidence.window_days)}-day weekly history · Snapshot {new Date(evidence.generated_at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
          </p>
          <div className="retention-mini-stats">
            {figures.map((item) => (
              <div key={item.label}><strong>{format(item.value)}</strong><span>{item.label}</span></div>
            ))}
          </div>

          <h4>Source breakdown · last 28 days</h4>
          <div className="retention-mini-stats">
            <div><strong>{format(evidence.summary.online_students_28d)}</strong><span>Students completing online work</span></div>
            <div><strong>{format(evidence.summary.quest_completions_28d)}</strong><span>Quest completions · choice unverified</span></div>
            <div><strong>{format(evidence.summary.trial_practice_completions_28d)}</strong><span>Pilot practice completions · may include tests</span></div>
            <div><strong>{format(evidence.summary.teachers_creating_28d)}</strong><span>Teachers creating assignments</span></div>
            <div><strong>{format(evidence.summary.teacher_interventions_28d)}</strong><span>Teacher-created interventions</span></div>
            <div><strong>{format(evidence.summary.paper_completions_28d)}</strong><span>Paper student completions · not online engagement</span></div>
          </div>

          <div className="retention-table-scroll">
            <table>
              <caption>Weekly meaningful actions · current week is incomplete</caption>
              <thead><tr>
                <th scope="col">Week (UTC)</th><th scope="col">Role</th><th scope="col">Users</th>
                <th scope="col">Actions</th><th scope="col">Evidence</th>
              </tr></thead>
              <tbody>{evidence.weekly.map((week) => (
                <tr key={week.week + ':' + week.actor_role}>
                  <td>{dateLabel(week.week)}{week.is_partial ? ' · partial' : ''}</td>
                  <td>{week.actor_role}</td>
                  <td>{format(week.users)}</td>
                  <td>{format(week.actions)}</td>
                  <td>{week.actor_role === 'student'
                    ? `${week.online_assignments} online · ${week.quests} quests · ${week.trial_practice} trial`
                    : `${week.teacher_assignments} assignments · ${week.teacher_paper_captures} paper captures · ${week.teacher_interventions} interventions`}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            <table>
              <caption>First-ever observed meaningful activity cohorts · week-one and week-four return</caption>
              <thead><tr><th scope="col">Cohort week</th><th scope="col">Role</th><th scope="col">Members</th><th scope="col">W1</th><th scope="col">W4</th></tr></thead>
              <tbody>{evidence.cohorts.map((cohort) => (
                <tr key={cohort.first_week + ':' + cohort.actor_role}>
                  <td>{dateLabel(cohort.first_week)}</td>
                  <td>{cohort.actor_role}</td>
                  <td>{format(cohort.users)}</td>
                  <td>{matured(cohort.week_one_mature, cohort.week_one, cohort.users)}</td>
                  <td>{matured(cohort.week_four_mature, cohort.week_four, cohort.users)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <p className="retention-note">{evidence.cohort_definition}</p>
          <p className="retention-note">{evidence.disclaimer}</p>
          <p className="retention-note">
            Data quality: {format(evidence.quality.excluded_username_flags)} test-like student/teacher usernames and {format(evidence.quality.excluded_named_test_schools)}
            {' '}test-like school names excluded. {evidence.quality.exclusion_rule}
          </p>
          <p className="retention-note">
            These are first meaningful-use cohorts—not sign-up cohorts or evidence of product-caused learning gains.
            W1/W4 are shown only after the entire target week has ended. Confirm pilot/test traffic and payment receipts before an external investor claim.
          </p>
        </>
      )}
    </section>
  );
}
