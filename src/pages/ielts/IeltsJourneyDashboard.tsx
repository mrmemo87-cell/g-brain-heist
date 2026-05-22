import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rpcIeltsStudentJourney, type IeltsStudentJourney } from '../../../services/ieltsJourneyService';

type LoadState = 'loading' | 'ready' | 'error';

const skillLabels: Record<string, string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  overall: 'Overall',
};

const formatEstimate = (value: number | null | undefined) => (value === null || value === undefined ? 'Not enough data' : value.toFixed(1));


const feedbackStatusLabel = (item: { has_finalized_review?: boolean | null; feedback_status?: string | null; completed_at?: string | null; objective_result_link?: string | null }) => {
  if (item.has_finalized_review || item.feedback_status === 'feedback_ready') return 'Feedback ready';
  if (item.feedback_status === 'not_required') return item.objective_result_link ? 'Result available' : 'Completed';
  if (item.completed_at) return 'Review pending';
  return 'Started';
};

const skillSummaryLabel = (item: { skills?: string[] | null; has_finalized_review?: boolean | null; feedback_status?: string | null; objective_result_link?: string | null }) => {
  const skills = item.skills ?? [];
  if (skills.length === 0) return [] as string[];
  return skills.map((skill) => {
    if (skill === 'reading' || skill === 'listening') return `${skillLabels[skill]}: ${item.objective_result_link ? 'Result available' : 'Submitted'}`;
    if (skill === 'writing' || skill === 'speaking') return `${skillLabels[skill]}: ${item.has_finalized_review || item.feedback_status === 'feedback_ready' ? 'Feedback ready' : 'Review pending'}`;
    return `${skill}: completed`;
  });
};

const examResultStateLabel = (item: { result_status?: string | null; grading_status?: string | null; has_finalized_review?: boolean | null }) => {
  if (item.has_finalized_review) return 'Result ready';
  if ((item.result_status ?? '').toLowerCase().includes('ready')) return 'Result ready';
  if ((item.result_status ?? '').toLowerCase().includes('pending')) return 'Results pending';
  if ((item.grading_status ?? '').toLowerCase().includes('pending')) return 'Results pending';
  return 'Submitted';
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const IeltsJourneyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [journey, setJourney] = useState<IeltsStudentJourney | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const loadJourney = async () => {
    setLoadState('loading');
    setError(null);
    try {
      const data = await rpcIeltsStudentJourney();
      setJourney(data);
      setLoadState('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your IELTS journey.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    void loadJourney();
  }, []);

  const skillCards = useMemo(() => {
    const estimates = journey?.current_estimates;
    return [
      { key: 'reading', value: estimates?.reading ?? null },
      { key: 'listening', value: estimates?.listening ?? null },
      { key: 'writing', value: estimates?.writing ?? null },
      { key: 'speaking', value: estimates?.speaking ?? null },
      { key: 'overall', value: estimates?.overall ?? null },
    ];
  }, [journey]);

  const assigned = journey?.assigned_practice_summary;
  const assignedTotal = assigned?.total ?? 0;
  const assignedCompleted = assigned?.completed ?? 0;
  const completionPercent = assignedTotal > 0 ? Math.round((assignedCompleted / assignedTotal) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#111827', padding: '1rem' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{ marginBottom: '1rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
        >
          ← Back to IELTS Home
        </button>

        <header style={{ background: 'linear-gradient(135deg, #312e81 0%, #2563eb 100%)', borderRadius: '1rem', padding: '1.5rem', color: '#ffffff', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem', color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.75rem', fontWeight: 800 }}>My IELTS Journey</p>
          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 900 }}>Estimated readiness dashboard</h1>
          <p style={{ margin: '0.75rem 0 0', color: '#dbeafe', lineHeight: 1.6 }}>
            This first version uses your existing practice, assigned work, and Exam Mode submission metadata. These are estimated readiness signals, not official IELTS bands.
          </p>
        </header>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.875rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loadState === 'loading' && (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', color: '#64748b' }}>
            Loading your IELTS journey…
          </div>
        )}

        {loadState === 'error' && (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', color: '#64748b' }}>We could not load your journey dashboard.</p>
            <button type="button" onClick={() => void loadJourney()} style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem', cursor: 'pointer', fontWeight: 800 }}>
              Try again
            </button>
          </div>
        )}

        {loadState === 'ready' && journey && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {skillCards.map((card) => (
                <div key={card.key} style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                  <p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.8125rem', fontWeight: 700 }}>{skillLabels[card.key]}</p>
                  <p style={{ margin: 0, color: card.value === null ? '#94a3b8' : '#1d4ed8', fontSize: card.value === null ? '1rem' : '1.75rem', fontWeight: 900 }}>
                    {formatEstimate(card.value)}
                  </p>
                  <p style={{ margin: '0.35rem 0 0', color: '#94a3b8', fontSize: '0.75rem' }}>Estimated readiness</p>
                </div>
              ))}
            </section>

            <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Readiness context</h2>
                <p style={{ margin: '0.35rem 0', color: '#475569' }}>Target band: <strong>{journey.target_band ?? 'Not set yet'}</strong></p>
                <p style={{ margin: '0.35rem 0', color: '#475569' }}>Confidence level: <strong style={{ textTransform: 'capitalize' }}>{journey.confidence_level}</strong></p>
                <p style={{ margin: '0.35rem 0', color: '#475569' }}>Weak skill: <strong>{journey.weak_skill ? skillLabels[journey.weak_skill] ?? journey.weak_skill : 'Not enough data yet'}</strong></p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Assigned practice progress</h2>
                <div style={{ backgroundColor: '#e0f2fe', borderRadius: '9999px', height: '0.7rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ backgroundColor: '#2563eb', width: `${completionPercent}%`, height: '100%' }} />
                </div>
                <p style={{ margin: '0 0 0.5rem', color: '#475569' }}>{assignedCompleted} of {assignedTotal} assigned items completed ({completionPercent}%).</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', color: '#475569', fontSize: '0.8125rem' }}>
                  <span>Assigned: {assigned?.assigned ?? 0}</span>
                  <span>In progress: {assigned?.in_progress ?? 0}</span>
                  <span>Overdue: {assigned?.overdue ?? 0}</span>
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Next recommendation</h2>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>{journey.next_recommendation}</p>
              </div>
            </section>

            <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Assigned Practice</h2>
                {journey.assigned_practice.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748b' }}>No assignments yet. New IELTS assignments will appear here when your teacher publishes them.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {journey.assigned_practice.map((item) => (
                      <div key={item.assignment_id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.625rem', padding: '0.75rem' }}>
                        <p style={{ margin: 0, color: '#111827', fontWeight: 800 }}>{item.title}</p>
                        <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8125rem' }}>Status: Started · Due: {formatDate(item.due_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Completed Practice</h2>
                {journey.completed_practice.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748b' }}>No completed attempts yet. Finish one practice task to unlock your result timeline.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {journey.completed_practice.map((item) => (
                      <div key={item.assignment_id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.625rem', padding: '0.75rem' }}>
                        <p style={{ margin: 0, color: '#111827', fontWeight: 800 }}>{item.title}</p>
                        <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8125rem' }}>Completed: {formatDate(item.completed_at)}</p>
                        <p style={{ margin: '0.2rem 0 0', color: item.has_finalized_review || item.feedback_status === 'not_required' ? '#166534' : '#92400e', fontSize: '0.8125rem', fontWeight: 700 }}>Status: {feedbackStatusLabel(item)}</p>
                        {item.feedback_status === 'not_required' ? (
                          <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.79rem' }}>{item.score_correct !== null && item.score_total !== null ? `Score: ${item.score_correct}/${item.score_total}${item.percent_correct !== null ? ` (${item.percent_correct}%)` : ''}` : 'No review required. Practice completed.'}</p>
                        ) : item.feedback_preview && item.has_finalized_review ? <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.79rem' }}>{item.feedback_preview}</p> : <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.79rem' }}>Review is pending finalization. Feedback will appear once finalized.</p>}
                        {skillSummaryLabel(item).map((line) => <p key={line} style={{ margin: '0.15rem 0 0', color: '#64748b', fontSize: '0.77rem' }}>{line}</p>)}
                        {item.feedback_status === 'not_required' && item.objective_result_link ? <button type="button" onClick={() => navigate(item.objective_result_link as string)} style={{ marginTop: '0.45rem', border: 'none', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>View result</button> : null}
                        {item.review_result_link && item.has_finalized_review ? <button type="button" onClick={() => navigate(item.review_result_link as string)} style={{ marginTop: '0.45rem', border: 'none', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>View feedback</button> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Recent Reviewed IELTS Feedback</h2>
                {journey.teacher_feedback.length === 0 ? <p style={{ margin: 0, color: '#64748b' }}>No reviewed feedback yet.</p> : journey.teacher_feedback.map((item) => (
                  <div key={item.review_id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.625rem', padding: '0.75rem', marginBottom: '0.6rem' }}>
                    <p style={{ margin: 0, fontWeight: 800 }}>{skillLabels[item.skill] ?? item.skill} · Band {formatEstimate(item.overall_band)}</p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#64748b' }}>{item.rubric_summary ?? 'Rubric summary unavailable.'}</p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#64748b' }}>{item.feedback_preview}</p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: '#94a3b8' }}>Reviewed: {formatDate(item.reviewed_at)}</p>
                    <button type="button" onClick={() => navigate(item.review_result_link)} style={{ border: 'none', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>View feedback</button>
                  </div>
                ))}
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.875rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 900 }}>Exam Results</h2>
                {journey.recent_exam_mode_submissions.length === 0 ? <p style={{ margin: 0, color: '#64748b' }}>No secure Exam Mode submissions yet.</p> : journey.recent_exam_mode_submissions.map((item) => (
                  <div key={item.submission_id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.625rem', padding: '0.75rem', marginBottom: '0.6rem' }}>
                    <p style={{ margin: 0, fontWeight: 800 }}>{item.title ?? 'IELTS Exam Mode'}</p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#64748b' }}>Submitted: {formatDate(item.submitted_at)}</p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#64748b' }}>Submission: {item.attempt_status ?? 'submitted'}</p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: item.has_finalized_review ? '#166534' : '#64748b' }}>Result: {examResultStateLabel(item)}</p>
                    {item.overall_band !== null && item.overall_band !== undefined ? <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#64748b' }}>Overall band: {item.overall_band.toFixed(1)}</p> : null}
                    {item.feedback_preview ? <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#475569' }}>{item.feedback_preview}</p> : <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#64748b' }}>No feedback available yet.</p>}
                    {item.review_result_link && item.has_finalized_review ? <button type="button" onClick={() => navigate(item.review_result_link as string)} style={{ border: 'none', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>View feedback</button> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default IeltsJourneyDashboard;
