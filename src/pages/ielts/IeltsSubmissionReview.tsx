import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  rpcIeltsReviewDetail,
  rpcIeltsSubmitReview,
  requestIeltsAiDraft,
  rubricForSkill,
  speakingRubricKeys,
  writingRubricKeys,
  type IeltsReviewDetail,
  type IeltsReviewRubric,
  type IeltsReviewSkill,
} from '../../../services/ieltsTeacherReviewService';
import { supabase } from '../../../services/supabaseClient';

const rubricLabels: Record<string, string> = {
  task_achievement: 'Task achievement',
  coherence_cohesion: 'Coherence/cohesion',
  lexical_resource: 'Lexical resource',
  grammar: 'Grammar',
  fluency: 'Fluency',
  pronunciation: 'Pronunciation',
};

const bandOptions = Array.from({ length: 19 }, (_, index) => (index / 2).toFixed(index % 2 === 0 ? 0 : 1));

const toRubricState = (skill: IeltsReviewSkill, detail?: IeltsReviewDetail | null) => rubricForSkill(skill, detail?.rubric as IeltsReviewRubric | undefined) as Record<string, number | null>;
const SPEAKING_BUCKET = 'ielts-recordings';

const normalizeStoragePath = (audioRef: string): string | null => {
  const trimmed = audioRef.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const objectIndex = parsed.pathname.indexOf('/object/');
    if (objectIndex === -1) return null;
    const objectPath = parsed.pathname.slice(objectIndex + '/object/'.length);
    const bucketPrefixPatterns = [
      `public/${SPEAKING_BUCKET}/`,
      `sign/${SPEAKING_BUCKET}/`,
      `${SPEAKING_BUCKET}/`,
    ];
    const matchedPrefix = bucketPrefixPatterns.find((prefix) => objectPath.startsWith(prefix));
    if (!matchedPrefix) return null;
    return decodeURIComponent(objectPath.slice(matchedPrefix.length));
  } catch {
    return null;
  }
};

const IeltsSubmissionReview: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ skill: string; attemptId: string }>();
  const skill = (params.skill === 'speaking' ? 'speaking' : 'writing') as IeltsReviewSkill;
  const attemptId = decodeURIComponent(params.attemptId ?? '');
  const rubricKeys = useMemo(() => skill === 'writing' ? writingRubricKeys : speakingRubricKeys, [skill]);

  const { data: detail, isLoading, error, refetch } = useQuery({
    queryKey: ['ielts-review-detail', skill, attemptId],
    queryFn: () => rpcIeltsReviewDetail(skill, attemptId),
    enabled: !!attemptId,
  });

  const [rubric, setRubric] = useState<Record<string, number | null>>(() => toRubricState(skill));
  const [overallBand, setOverallBand] = useState<number | null>(null);
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [audioLoadError, setAudioLoadError] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<Record<string, unknown> | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    setRubric(toRubricState(skill, detail));
    setOverallBand(detail.overall_band ?? null);
    setStrengths(detail.strengths ?? '');
    setImprovements(detail.improvements ?? '');
    setNextSteps(detail.next_steps ?? '');
    setTeacherFeedback(detail.teacher_feedback ?? '');
    setPrivateNotes(detail.private_notes ?? '');
  }, [detail, skill]);

  useEffect(() => {
    let active = true;
    const resolveAudioUrl = async () => {
      setResolvedAudioUrl(null);
      setAudioLoadError(null);

      if (skill !== 'speaking') return;
      const rawAudio = detail?.audio_url?.trim();
      if (!rawAudio) return;

      const storagePath = normalizeStoragePath(rawAudio);
      if (!storagePath) {
        if (active) {
          setResolvedAudioUrl(rawAudio);
        }
        return;
      }

      const { data, error } = await supabase.storage
        .from(SPEAKING_BUCKET)
        .createSignedUrl(storagePath, 60 * 30);

      if (!active) return;
      if (error || !data?.signedUrl) {
        const { data: publicData } = supabase.storage
          .from(SPEAKING_BUCKET)
          .getPublicUrl(storagePath);
        if (publicData?.publicUrl) {
          setResolvedAudioUrl(publicData.publicUrl);
          setAudioLoadError(null);
          return;
        }
        setAudioLoadError('Audio unavailable. Recording URL could not be generated.');
        return;
      }
      setResolvedAudioUrl(data.signedUrl);
    };

    void resolveAudioUrl();
    return () => {
      active = false;
    };
  }, [detail?.audio_url, skill]);

  const submitMutation = useMutation({
    mutationFn: (finalize: boolean) => rpcIeltsSubmitReview({
      skill,
      attemptId,
      rubric,
      overallBand,
      strengths,
      improvements,
      nextSteps,
      teacherFeedback,
      privateNotes,
      finalize,
    }),
    onSuccess: () => void refetch(),
  });

  const aiCheckMutation = useMutation({
    mutationFn: () => requestIeltsAiDraft({ skill, attemptId }),
    onSuccess: (payload) => {
      setAiDraft(payload.draft);
      setAiError(null);
    },
    onError: (err) => {
      setAiError(err instanceof Error ? err.message : 'AI check failed.');
    },
  });

  const locked = detail?.review_status === 'finalized';
  const title = skill === 'writing' ? 'Writing Review' : 'Speaking Review';

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <section style={{ maxWidth: '76rem', margin: '0 auto' }}>
        <button onClick={() => navigate('/ielts/reviews')} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem' }}>← Back to IELTS Review Queue</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#0f172a' }}>{title}</h1>
            <p style={{ color: '#64748b', margin: '0.35rem 0 0' }}>Structured IELTS rubric scoring and teacher feedback.</p>
          </div>
          {detail ? <div style={{ color: '#475569' }}>Status: <strong>{detail.review_status}</strong>{detail.reviewed_at ? ` • Reviewed ${new Date(detail.reviewed_at).toLocaleString()}` : ''}</div> : null}
        </div>

        {error ? <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '0.75rem' }}>{error instanceof Error ? error.message : 'Unable to load submission.'}</div> : null}
        {isLoading ? <div style={{ color: '#475569' }}>Loading submission…</div> : null}

        {detail ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '1rem', alignItems: 'start' }}>
            <article style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem' }}>
              <h2 style={{ color: '#0f172a', marginTop: 0 }}>Submission</h2>
              <div style={{ color: '#64748b', marginBottom: '1rem' }}>Submitted {detail.submitted_at ? new Date(detail.submitted_at).toLocaleString() : 'unknown'}</div>
              <section style={{ marginBottom: '1rem' }}>
                <h3 style={{ color: '#334155' }}>Prompt</h3>
                <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', background: '#f8fafc', borderRadius: '0.5rem', padding: '1rem' }}>{detail.prompt ?? 'No prompt available.'}</div>
              </section>
              {skill === 'writing' ? (
                <section>
                  <h3 style={{ color: '#334155' }}>Student answer</h3>
                  <div style={{ color: '#64748b', marginBottom: '0.5rem' }}>Word count: {detail.word_count ?? 'unknown'}</div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', minHeight: '18rem' }}>{detail.student_answer ?? 'No answer text available.'}</div>
                </section>
              ) : (
                <section>
                  <h3 style={{ color: '#334155' }}>Speaking evidence</h3>
                  <div style={{ color: '#64748b', marginBottom: '0.5rem' }}>Duration: {detail.duration_seconds ? `${detail.duration_seconds}s` : 'unknown'}</div>
                  {resolvedAudioUrl ? (
                    <audio controls src={resolvedAudioUrl} style={{ width: '100%', marginBottom: '1rem' }} onError={() => setAudioLoadError('Audio unavailable. The recording could not be loaded.')} />
                  ) : (
                    <div style={{ color: '#64748b', marginBottom: '1rem' }}>Audio unavailable.</div>
                  )}
                  {audioLoadError ? <div style={{ color: '#b45309', marginBottom: '1rem' }}>{audioLoadError}</div> : null}
                  <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', minHeight: '10rem' }}>{detail.transcript ?? 'No transcript available.'}</div>
                </section>
              )}
            </article>

            <aside style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem' }}>
              <h2 style={{ color: '#0f172a', marginTop: 0 }}>IELTS rubric</h2>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {rubricKeys.map((key) => (
                  <label key={key} style={{ color: '#334155', fontSize: '0.9rem' }}>{rubricLabels[key] ?? key}
                    <select disabled={locked} value={rubric[key] ?? ''} onChange={(e) => setRubric((current) => ({ ...current, [key]: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem' }}>
                      <option value="">Select band</option>
                      {bandOptions.map((band) => <option key={band} value={band}>{band}</option>)}
                    </select>
                  </label>
                ))}
                <label style={{ color: '#334155', fontSize: '0.9rem', fontWeight: 700 }}>Overall band
                  <select disabled={locked} value={overallBand ?? ''} onChange={(e) => setOverallBand(e.target.value ? Number(e.target.value) : null)} style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem' }}>
                    <option value="">Select overall band</option>
                    {bandOptions.map((band) => <option key={band} value={band}>{band}</option>)}
                  </select>
                </label>
              </div>

              <h2 style={{ color: '#0f172a' }}>Feedback</h2>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 700, color: '#1e3a8a' }}>AI suggestion — review before finalizing.</div>
                <div style={{ color: '#1e40af', fontSize: '0.85rem', marginTop: '0.3rem' }}>AI feedback can make mistakes. Review before finalizing.</div>
                {skill === 'speaking' ? <div style={{ color: '#1e40af', fontSize: '0.85rem', marginTop: '0.2rem' }}>Transcript may contain errors. Check audio if unsure.</div> : null}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  <button disabled={locked || aiCheckMutation.isPending} onClick={() => aiCheckMutation.mutate()} style={{ border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.45rem', padding: '0.45rem 0.7rem', cursor: 'pointer' }}>
                    {aiCheckMutation.isPending ? 'Running AI check…' : 'AI check'}
                  </button>
                  {aiDraft ? <button disabled={locked} onClick={() => {
                    const suggested = typeof aiDraft.suggested_feedback === 'string' ? aiDraft.suggested_feedback : '';
                    const strengthsList = Array.isArray(aiDraft.strengths) ? aiDraft.strengths.join('\n• ') : '';
                    const fixesList = Array.isArray(aiDraft.priority_fixes) ? aiDraft.priority_fixes.join('\n• ') : '';
                    if (suggested) setTeacherFeedback(suggested);
                    if (strengthsList) setStrengths(`• ${strengthsList}`);
                    if (fixesList) setImprovements(`• ${fixesList}`);
                  }} style={{ border: '1px solid #cbd5e1', background: 'white', borderRadius: '0.45rem', padding: '0.45rem 0.7rem', cursor: 'pointer' }}>Apply to form</button> : null}
                </div>
                {aiError ? <div style={{ color: '#991b1b', marginTop: '0.6rem', fontSize: '0.85rem' }}>{aiError}</div> : null}
              </div>

              {aiDraft ? <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', color: '#1e3a8a' }}>AI Draft</h3>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#1e293b' }}>{JSON.stringify(aiDraft, null, 2)}</pre>
              </div> : null}
              {[
                ['Strengths', strengths, setStrengths],
                ['Improvements', improvements, setImprovements],
                ['Next steps', nextSteps, setNextSteps],
                ['Teacher feedback', teacherFeedback, setTeacherFeedback],
                ['Private notes', privateNotes, setPrivateNotes],
              ].map(([label, value, setter]) => (
                <label key={String(label)} style={{ display: 'block', color: '#334155', fontSize: '0.9rem', marginBottom: '0.75rem' }}>{String(label)}
                  <textarea disabled={locked} value={String(value)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)} rows={String(label) === 'Private notes' ? 3 : 4} style={{ width: '100%', marginTop: '0.25rem', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', resize: 'vertical' }} />
                </label>
              ))}

              {submitMutation.error ? <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '0.75rem' }}>{submitMutation.error instanceof Error ? submitMutation.error.message : 'Review save failed.'}</div> : null}
              {submitMutation.isSuccess ? <div style={{ background: '#dcfce7', color: '#166534', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '0.75rem' }}>Review saved.</div> : null}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button disabled={locked || submitMutation.isPending} onClick={() => submitMutation.mutate(false)} style={{ flex: 1, minWidth: '8rem', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', background: 'white', cursor: locked ? 'not-allowed' : 'pointer' }}>Save draft</button>
                <button disabled={locked || submitMutation.isPending || overallBand === null} onClick={() => submitMutation.mutate(true)} style={{ flex: 1, minWidth: '8rem', padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: locked ? '#94a3b8' : '#2563eb', color: 'white', cursor: locked ? 'not-allowed' : 'pointer' }}>Finalize review</button>
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default IeltsSubmissionReview;
