import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rpcIeltsReviewDetail, type IeltsReviewSkill } from '../../../services/ieltsTeacherReviewService';
import { speakingPracticeFeedback } from '../../../services/ieltsPracticeFeedback';
import SpeakingTranscript from '../../components/ielts/SpeakingTranscript';
import '../../styles/ielts-review-result.css';

const label = (key: string) => key.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
const speakingLabels: Record<string, { name: string; short: string; tone: string }> = {
  fluency: { name: 'Fluency & Coherence', short: 'FC', tone: 'fc' },
  lexical_resource: { name: 'Vocabulary', short: 'LR', tone: 'lr' },
  grammar: { name: 'Grammar', short: 'GR', tone: 'gr' },
  pronunciation: { name: 'Pronunciation', short: 'P', tone: 'pr' },
};
const fmt = (n: unknown) => (typeof n === 'number' ? n.toFixed(1) : n == null || n === '' ? '—' : String(n));

/**
 * Premium Speaking result (Diagnostic Bible 2.2.0 section 10.7; Visual & UX Bible 13.9): the teacher-confirmed band for
 * this Speaking part, the four teacher criterion bands and a collapsible colour-highlighted transcript.
 */
function SpeakingResult({ data, attemptId }: { data: Awaited<ReturnType<typeof rpcIeltsReviewDetail>>; attemptId: string }) {
  const feedback = useQuery({ queryKey: ['ielts-speaking-result-feedback', attemptId], queryFn: () => speakingPracticeFeedback(attemptId) });
  const fields = feedback.data?.status === 'ready' ? feedback.data.fields : null;
  const part = data.part ?? fields?.part ?? null;
  const rubric = (data.rubric ?? {}) as Record<string, number | null>;
  return (
    <div className="rr-speaking">
      <section className="rr-hero" aria-labelledby="rr-band">
        <div className="rr-hero-glow" aria-hidden="true" />
        <p className="rr-eyebrow">IELTS Speaking{part ? ` · Part ${part}` : ''} · teacher-checked</p>
        <div className="rr-hero-row">
          <div>
            <p className="rr-band-label" id="rr-band">{part ? `Part ${part} band` : 'Speaking task band'}</p>
            <p className="rr-band">{fmt(data.overall_band)}</p>
          </div>
          <div className="rr-hero-meta">
            <span className="rr-chip">Checked by your teacher{data.reviewed_at ? ` · ${new Date(data.reviewed_at).toLocaleDateString()}` : ''}</span>
            <span className="rr-chip rr-chip--quiet">Not an official IELTS result</span>
          </div>
        </div>
        <p className="rr-hero-note">This band is for this Speaking part only. It is not a full IELTS Speaking band or an overall readiness band.</p>
      </section>

      <section className="rr-criteria" aria-label="Band for each criterion">
        {Object.keys(speakingLabels).map((key, i) => {
          const value = rubric[key];
          const meta = speakingLabels[key];
          return (
            <article key={key} className={`rr-crit rr-tone-${meta.tone}`} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <span className="rr-crit-tag" aria-hidden="true">{meta.short}</span>
              <h3>{meta.name}</h3>
              <p className="rr-crit-band">{fmt(value)}</p>
              <div className="rr-meter" aria-hidden="true"><span style={{ width: `${typeof value === 'number' ? (value / 9) * 100 : 0}%` }} /></div>
            </article>
          );
        })}
      </section>

      {fields && typeof fields.transcript === 'string' ? (
        <details className="rr-transcript">
          <summary>
            <span className="rr-summary-icon" aria-hidden="true">🎙️</span>
            <span><strong>Your transcript with colour highlights</strong><small>See what you said, what worked, what to fix and how to say tricky words.</small></span>
            <span className="rr-summary-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="rr-transcript-body">
            <SpeakingTranscript
              transcript={fields.transcript}
              highlights={fields.highlights ?? []}
              pronunciationWords={fields.pronunciation_words ?? []}
              pronunciationAssessed={fields.pronunciation_assessed !== false}
            />
            <p className="rr-fine">Highlights and word corrections are AI practice feedback; your teacher's bands above are the checked result.</p>
          </div>
        </details>
      ) : null}

      <section className="rr-feedback" aria-label="Teacher feedback">
        {[
          ['✓', 'What you did well', data.strengths],
          ['✎', 'What to fix first', data.improvements],
          ['→', 'Practise next', data.next_steps],
          ['✉', 'Message from your teacher', data.teacher_feedback],
        ].filter(([, , value]) => String(value || '').trim()).map(([icon, title, value]) => (
          <article key={String(title)} className="rr-fb">
            <span aria-hidden="true">{String(icon)}</span>
            <div><h3>{String(title)}</h3><p>{String(value)}</p></div>
          </article>
        ))}
      </section>
    </div>
  );
}

const IeltsReviewResult: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ skill: string; attemptId: string }>();
  const skill = (params.skill === 'speaking' ? 'speaking' : 'writing') as IeltsReviewSkill;
  const attemptId = decodeURIComponent(params.attemptId ?? '');
  const { data, isLoading, error } = useQuery({
    queryKey: ['ielts-review-result', skill, attemptId],
    queryFn: () => rpcIeltsReviewDetail(skill, attemptId),
    enabled: !!attemptId,
  });

  return (
    <main className="bh-ielts-page bh-ielts-result" style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <section style={{ maxWidth: '54rem', margin: '0 auto', background: 'white', border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1.5rem' }}>
        <button onClick={() => navigate('/ielts/journey')} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem' }}>← Back to My IELTS Journey</button>
        <h1 style={{ color: '#0f172a', marginTop: 0 }}>{skill === 'speaking' ? 'Your Speaking result' : `IELTS ${skill} reviewed feedback`}</h1>
        {isLoading ? <p style={{ color: '#64748b' }}>Loading review…</p> : null}
        {error ? <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '0.75rem' }}>{error instanceof Error ? error.message : 'Unable to load review.'}</div> : null}
        {data ? (
          <>
            {data.review_status !== 'finalized' ? (
              <div style={{ background: '#fef3c7', color: '#92400e', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>Your teacher review is still in progress. Feedback will appear after it is finalized.</div>
            ) : null}
            {data.review_status !== 'finalized' ? null : skill === 'speaking' ? <SpeakingResult data={data} attemptId={attemptId} /> : (
              <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: '#eff6ff', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ color: '#475569', fontSize: '0.85rem' }}>Reviewed task band</div>
                <strong style={{ color: '#1d4ed8', fontSize: '2rem' }}>{data.overall_band ?? '—'}</strong>
                <div style={{ marginTop: '0.35rem', color: '#64748b', fontSize: '0.72rem', lineHeight: 1.45 }}>This score belongs to this submitted task only. It is not a complete IELTS skill or overall readiness band.</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ color: '#475569', fontSize: '0.85rem' }}>Reviewed timestamp</div>
                <strong style={{ color: '#334155' }}>{data.reviewed_at ? new Date(data.reviewed_at).toLocaleString() : 'Not finalized'}</strong>
              </div>
            </div>
            <h2 style={{ color: '#0f172a' }}>Rubric breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {Object.entries(data.rubric ?? {}).map(([key, value]) => (
                <div key={key} style={{ border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.9rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{label(key)}</div>
                  <strong style={{ color: '#0f172a', fontSize: '1.35rem' }}>{value ?? '—'}</strong>
                </div>
              ))}
            </div>
            <h2 style={{ color: '#0f172a' }}>Teacher feedback</h2>
            {[
              ['Strengths', data.strengths],
              ['Priority fixes', data.improvements],
              ['Next practice recommendation', data.next_steps],
              ['Teacher summary', data.teacher_feedback],
            ].map(([title, value]) => (
              <section key={String(title)} style={{ marginBottom: '0.9rem' }}>
                <h3 style={{ color: '#334155', marginBottom: '0.25rem' }}>{String(title)}</h3>
                <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', background: '#f8fafc', borderRadius: '0.5rem', padding: '0.85rem' }}>{String(value || 'No feedback provided yet.')}</div>
              </section>
            ))}
              </>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
};

export default IeltsReviewResult;
