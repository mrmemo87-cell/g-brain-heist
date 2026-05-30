import React, { useEffect } from 'react';
import { bandGapLabel, humanizeIeltsSnapshotStatus, type IeltsSchoolStudentSnapshot } from '../../../../services/ieltsSchoolStudentSnapshotService';

type ModalState = 'idle' | 'loading' | 'ready' | 'error';

interface IeltsSchoolStudentProgressModalProps {
  isOpen: boolean;
  state: ModalState;
  snapshot: IeltsSchoolStudentSnapshot | null;
  error: string | null;
  onClose: () => void;
}

const skillLabels: Record<string, string> = {
  overall: 'Overall',
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
};

const skillSources: Record<string, string> = {
  reading: 'Latest objective result',
  listening: 'Latest objective result',
  writing: 'Latest finalized feedback',
  speaking: 'Latest finalized feedback',
};

const formatDate = (value?: string | null, fallback = 'Not available') => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const gaugeColor = (band?: number | null) => {
  if (band == null) return '#cbd5e1';
  if (band >= 7) return '#059669';
  if (band >= 5.5) return '#0891b2';
  return '#ea580c';
};

const readinessValue = (snapshot: IeltsSchoolStudentSnapshot, skill: string): number | null => {
  const key = `${skill}_band` as keyof IeltsSchoolStudentSnapshot['readiness'];
  return skill === 'overall' ? snapshot.readiness.overall_band : snapshot.readiness[key] as number | null;
};

const ReadinessGauge: React.FC<{ label: string; band: number | null; target: number | null; source?: string | null }> = ({ label, band, target, source }) => {
  const percent = band == null ? 0 : Math.max(0, Math.min(100, (band / 9) * 100));
  const color = gaugeColor(band);
  const gap = bandGapLabel(band, target);
  return (
    <div data-testid={`ielts-progress-gauge-${label.toLowerCase()}`} style={{ border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '0.85rem', background: '#ffffff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 900, color: '#0f172a' }}>{label}</p>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: '#64748b' }}>{source ?? 'Readiness estimate'}</p>
        </div>
        <strong style={{ fontSize: '1rem', color }}>{band == null ? '—' : `${band.toFixed(1)} / 9.0`}</strong>
      </div>
      <div aria-hidden="true" style={{ marginTop: '0.65rem', height: '0.55rem', borderRadius: '9999px', background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', borderRadius: '9999px', background: `linear-gradient(90deg, ${color}, #7c3aed)` }} />
      </div>
      <p style={{ margin: '0.45rem 0 0', fontSize: '0.7rem', color: gap ? (gap.includes('below') ? '#b45309' : '#059669') : '#94a3b8', fontWeight: 700 }}>
        {band == null ? 'Not enough data yet' : gap ?? 'Target band not set'}
      </p>
    </div>
  );
};

const AssignmentList: React.FC<{ title: string; assignments: IeltsSchoolStudentSnapshot['assignments']['active']; empty: string }> = ({ title, assignments, empty }) => (
  <div style={{ display: 'grid', gap: '0.75rem' }}>
    <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 900, color: '#0f172a' }}>{title}</h3>
    {assignments.length === 0 ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem' }}>{empty}</p> : assignments.map((assignment, index) => (
      <article key={`${assignment.title}-${index}`} data-testid="ielts-progress-assignment" style={{ border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '0.85rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 900, color: '#0f172a', fontSize: '0.9rem' }}>{assignment.title}</p>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.74rem' }}>Due: {formatDate(assignment.due_at, 'No due date')}</p>
          </div>
          <span style={{ alignSelf: 'flex-start', borderRadius: '9999px', padding: '0.24rem 0.6rem', background: '#f1f5f9', color: '#475569', fontSize: '0.68rem', fontWeight: 900 }}>
            {humanizeIeltsSnapshotStatus(assignment.status)} · {assignment.progress.completed_count} / {assignment.progress.total_count} completed
          </span>
        </div>
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.4rem' }}>
          {assignment.items.length === 0 ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.78rem' }}>No practice items are attached to this assignment.</p> : assignment.items.map((item, itemIndex) => (
            <div key={`${item.skill}-${item.title}-${itemIndex}`} data-testid="ielts-progress-assignment-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#334155', fontSize: '0.8rem', fontWeight: 800 }}>{skillLabels[item.skill] ?? humanizeIeltsSnapshotStatus(item.skill)} — {item.title ?? 'IELTS practice'}</span>
              <span style={{ color: item.feedback_status === 'feedback_ready' ? '#059669' : item.feedback_status === 'awaiting_feedback' ? '#b45309' : '#64748b', fontSize: '0.78rem', fontWeight: 800, display: 'inline-flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span>{item.feedback_status === 'feedback_ready' ? 'Feedback ready' : item.feedback_status === 'awaiting_feedback' ? 'Review pending' : humanizeIeltsSnapshotStatus(item.status)}</span>
                {item.cta && (
                  <a href={item.cta.route} style={{ color: '#0e7490', textDecoration: 'none', fontWeight: 900 }}>
                    {item.cta.label}
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      </article>
    ))}
  </div>
);

const IeltsSchoolStudentProgressModal: React.FC<IeltsSchoolStudentProgressModalProps> = ({ isOpen, state, snapshot, error, onClose }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const readinessSkills = ['overall', 'reading', 'listening', 'writing', 'speaking'];

  return (
    <div data-testid="ielts-progress-modal-backdrop" role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <section role="dialog" aria-modal="true" aria-label="Student IELTS progress" onClick={(event) => event.stopPropagation()} style={{ width: 'min(960px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f8fafc', color: '#0f172a', borderRadius: '1.1rem', boxShadow: '0 24px 80px rgba(15,23,42,0.32)', border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: '0 0 0.25rem', color: '#0891b2', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.13em', textTransform: 'uppercase' }}>IELTS student progress</p>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 950 }}>{snapshot?.student.name ?? 'Loading student…'}</h2>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.78rem' }}>
              {snapshot ? `${snapshot.student.class_name ?? snapshot.student.batch ?? 'No class'} · Last activity: ${formatDate(snapshot.student.last_activity_at, 'No activity yet')}` : 'Fetching a secure school-scoped snapshot…'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {snapshot && <span style={{ borderRadius: '9999px', padding: '0.32rem 0.7rem', fontWeight: 900, fontSize: '0.72rem', background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc' }}>{snapshot.readiness.status_label}</span>}
            <button aria-label="Close student progress" type="button" onClick={onClose} style={{ width: '2rem', height: '2rem', borderRadius: '9999px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 900, cursor: 'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
          {state === 'loading' && <div style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: '0.9rem', padding: '1.25rem', color: '#64748b', textAlign: 'center' }}>Loading IELTS progress…</div>}
          {state === 'error' && <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '0.9rem', padding: '1rem', color: '#b91c1c' }}>{error ?? 'Unable to load this student snapshot.'}</div>}
          {state === 'ready' && snapshot && (
            <>
              <section>
                <h3 style={{ margin: '0 0 0.7rem', fontSize: '0.9rem', fontWeight: 950 }}>Readiness Gauges</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
                  {readinessSkills.map((skill) => <ReadinessGauge key={skill} label={skillLabels[skill]} band={readinessValue(snapshot, skill)} target={snapshot.readiness.target_band} source={skillSources[skill] ?? 'Combined estimate'} />)}
                </div>
              </section>

              <section style={{ border: '1px solid #e2e8f0', borderRadius: '0.9rem', background: '#fff', padding: '0.9rem' }}>
                <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.9rem', fontWeight: 950 }}>Needs Attention</h3>
                {snapshot.needs_attention.length === 0 ? <p style={{ margin: 0, color: '#059669', fontSize: '0.84rem', fontWeight: 800 }}>No urgent issues right now.</p> : (
                  <div style={{ display: 'grid', gap: '0.45rem' }}>{snapshot.needs_attention.map((item) => <div key={item} data-testid="ielts-progress-need" style={{ border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', borderRadius: '0.65rem', padding: '0.55rem 0.7rem', fontSize: '0.8rem', fontWeight: 800 }}>• {item}</div>)}</div>
                )}
              </section>

              <section style={{ display: 'grid', gap: '0.9rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 950 }}>Assignment Progress</h3>
                <AssignmentList title="Current assignments" assignments={snapshot.assignments.active} empty="No active IELTS assignments for this student." />
                <AssignmentList title="Completed assignments" assignments={snapshot.assignments.completed} empty="No completed IELTS assignments yet." />
              </section>

              <section style={{ border: '1px solid #e2e8f0', borderRadius: '0.9rem', background: '#fff', padding: '0.9rem' }}>
                <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.9rem', fontWeight: 950 }}>Recent Results & Feedback</h3>
                {[...snapshot.recent_activity.objective_results, ...snapshot.recent_activity.reviewed_feedback, ...snapshot.recent_activity.pending_reviews].length === 0 ? (
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem' }}>No results or reviewed feedback yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    {[...snapshot.recent_activity.objective_results, ...snapshot.recent_activity.reviewed_feedback, ...snapshot.recent_activity.pending_reviews].map((item, index) => (
                      <div key={`${item.skill}-${item.occurred_at}-${index}`} data-testid="ielts-progress-activity" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', borderTop: index === 0 ? 'none' : '1px solid #f1f5f9', paddingTop: index === 0 ? 0 : '0.45rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#334155', fontSize: '0.8rem', fontWeight: 800 }}>{skillLabels[item.skill] ?? humanizeIeltsSnapshotStatus(item.skill)} — {item.title ?? 'IELTS practice'}</span>
                        <span style={{ color: item.status.toLowerCase().includes('pending') ? '#b45309' : '#059669', fontSize: '0.78rem', fontWeight: 800, display: 'inline-flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span>{humanizeIeltsSnapshotStatus(item.status)}{item.band != null ? ` · Band ${item.band.toFixed(1)}` : item.score ? ` · ${item.score}` : ''}</span>
                          {item.route && <a href={item.route} style={{ color: '#0e7490', textDecoration: 'none', fontWeight: 900 }}>View</a>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default IeltsSchoolStudentProgressModal;
