import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rpcIeltsReviewDetail, type IeltsReviewSkill } from '../../../services/ieltsTeacherReviewService';
import { practiceFeedback, speakingPracticeFeedback, type SpeakingHighlight, type WritingHighlight } from '../../../services/ieltsPracticeFeedback';
import SpeakingTranscript from '../../components/ielts/SpeakingTranscript';
import WritingEssayHighlights from '../../components/ielts/WritingEssayHighlights';
import '../../styles/ielts-review-result.css';

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
              highlights={fields.highlights as SpeakingHighlight[] | undefined}
              pronunciationWords={fields.pronunciation_words}
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

/**
 * Premium Writing result (Diagnostic Bible 2.4.0 section 10.9; Visual & UX Bible 13.10): the teacher-confirmed band for
 * this task, the four teacher criterion bands, how it compares with the AI estimate, and a collapsible essay with colour
 * highlights and corrections.
 */
function WritingResult({ data, attemptId }: { data: Awaited<ReturnType<typeof rpcIeltsReviewDetail>>; attemptId: string }) {
  const feedback = useQuery({ queryKey: ['ielts-writing-result-feedback', attemptId], queryFn: () => practiceFeedback(attemptId) });
  const fields = feedback.data?.status === 'ready' ? feedback.data.fields : null;
  const task = fields?.task_number === 1 || /task\s*1/i.test(String(data.task_title ?? '')) ? 1 : 2;
  const rubric = (data.rubric ?? {}) as Record<string, number | null>;
  const writingLabels: Record<string, { name: string; short: string; tone: string }> = {
    task_achievement: { name: task === 1 ? 'Task Achievement' : 'Task Response', short: task === 1 ? 'TA' : 'TR', tone: 'tr' },
    coherence_cohesion: { name: 'Coherence & Cohesion', short: 'CC', tone: 'fc' },
    lexical_resource: { name: 'Vocabulary', short: 'LR', tone: 'lr' },
    grammar: { name: 'Grammar', short: 'GR', tone: 'gr' },
  };
  const estimate = fields?.estimate ?? null;
  const essay = typeof fields?.essay === 'string' ? fields.essay : data.student_answer ?? '';
  return (
    <div className="rr-speaking rr-writing">
      <section className="rr-hero" aria-labelledby="rr-band">
        <div className="rr-hero-glow" aria-hidden="true" />
        <p className="rr-eyebrow">IELTS Writing · Task {task} · teacher-checked</p>
        <div className="rr-hero-row">
          <div>
            <p className="rr-band-label" id="rr-band">Task {task} band</p>
            <p className="rr-band">{fmt(data.overall_band)}</p>
          </div>
          <div className="rr-hero-meta">
            <span className="rr-chip">Checked by your teacher{data.reviewed_at ? ` · ${new Date(data.reviewed_at).toLocaleDateString()}` : ''}</span>
            {estimate ? <span className="rr-chip rr-chip--quiet">AI estimate was {estimate.band.toFixed(1)}{typeof data.overall_band === 'number' && data.overall_band === estimate.band ? ' · confirmed' : ''}</span> : null}
            <span className="rr-chip rr-chip--quiet">Not an official IELTS result</span>
          </div>
        </div>
        <p className="rr-hero-note">This band is for this one Writing task only. It is not a full IELTS Writing band or an overall readiness band.</p>
      </section>

      <section className="rr-criteria" aria-label="Band for each criterion">
        {Object.keys(writingLabels).map((key, i) => {
          const value = rubric[key];
          const meta = writingLabels[key];
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

      {essay.trim() ? (
        <details className="rr-transcript" open>
          <summary>
            <span className="rr-summary-icon" aria-hidden="true">✍️</span>
            <span><strong>Your essay with colour highlights</strong><small>See what worked, what to fix and the corrected wording.</small></span>
            <span className="rr-summary-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="rr-transcript-body">
            <WritingEssayHighlights essay={essay} taskNumber={task} highlights={typeof fields?.essay === 'string' ? fields.highlights as WritingHighlight[] | undefined : undefined} />
            <p className="rr-fine">Highlights and corrections are AI practice feedback; your teacher's bands above are the checked result.</p>
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
        <h1 style={{ color: '#0f172a', marginTop: 0 }}>{skill === 'speaking' ? 'Your Speaking result' : 'Your Writing result'}</h1>
        {isLoading ? <p style={{ color: '#64748b' }}>Loading review…</p> : null}
        {error ? <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '0.75rem' }}>{error instanceof Error ? error.message : 'Unable to load review.'}</div> : null}
        {data ? (
          <>
            {data.review_status !== 'finalized' ? (
              <div style={{ background: '#fef3c7', color: '#92400e', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>Your teacher review is still in progress. Feedback will appear after it is finalized.</div>
            ) : null}
            {data.review_status !== 'finalized' ? null : skill === 'speaking' ? <SpeakingResult data={data} attemptId={attemptId} /> : <WritingResult data={data} attemptId={attemptId} />}
          </>
        ) : null}
      </section>
    </main>
  );
};

export default IeltsReviewResult;
