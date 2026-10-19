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
import { friendlyIeltsAdminError } from '../../lib/schoolAdminPresentation';
import { useSchoolBranding } from '../../hooks/useSchoolBranding';
import IeltsPracticeAiFeedback from '../../components/ielts/IeltsPracticeAiFeedback';
import { IeltsButton } from '../../components/ielts/IeltsUi';
import '../../styles/ielts-submission-review.css';
import { practiceFeedback, criterionLabel } from '../../../services/ieltsPracticeFeedback';

// Review rubric key -> AI practice feedback criterion keys (Diagnostic Bible 2.0.0 section 10.5). The AI never sets a band;
// its range is shown as a hint beside the teacher's own selection.
const aiCriterionFor: Record<string, string[]> = {
  task_achievement: ['task_achievement', 'task_response'], coherence_cohesion: ['coherence_cohesion'],
  lexical_resource: ['lexical_resource'], grammar: ['grammar_range_accuracy'],
};
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  schoolDocumentFileName,
} from '../../lib/schoolDocument';

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

interface IeltsSubmissionReviewProps {
  embedded?: boolean;
  skillOverride?: IeltsReviewSkill;
  attemptIdOverride?: string;
  onBack?: () => void;
}

const IeltsSubmissionReview: React.FC<IeltsSubmissionReviewProps> = ({ embedded = false, skillOverride, attemptIdOverride, onBack }) => {
  const navigate = useNavigate();
  const params = useParams<{ skill: string; attemptId: string }>();
  const skill = skillOverride ?? ((params.skill === 'speaking' ? 'speaking' : 'writing') as IeltsReviewSkill);
  const attemptId = attemptIdOverride ?? decodeURIComponent(params.attemptId ?? '');
  const aiFeedbackQuery = useQuery({
    queryKey: ['ielts-practice-feedback-review', attemptId],
    queryFn: () => practiceFeedback(attemptId),
    enabled: skill === 'writing' && Boolean(attemptId),
    refetchInterval: (q) => (q.state.data?.status === 'working' ? 4000 : false),
  });
  const aiFields = aiFeedbackQuery.data?.status === 'ready' ? aiFeedbackQuery.data.fields : null;
  const aiFor = (key: string) => (aiCriterionFor[key] ?? []).map((k) => aiFields?.criteria?.[k]).find(Boolean) ?? null;
  const applyAiFeedback = () => {
    if (!aiFields) return;
    const entries = Object.entries(aiFields.criteria);
    setStrengths(entries.map(([k, c]) => `• ${criterionLabel[k] ?? k}: ${c.comment}`).join('\n'));
    setImprovements(entries.map(([k, c]) => `• ${criterionLabel[k] ?? k}: ${c.action}`).join('\n'));
    setNextSteps(aiFields.next_step);
  };
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
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState('IELTS teacher');
  const { schoolName, schoolLogoUrl } = useSchoolBranding({ schoolId });

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data: authData }) => {
      if (!active || !authData.user) return;
      const { data: profile } = await supabase
        .from('users')
        .select('school_id, username, full_name')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (!active) return;
      setSchoolId((profile as { school_id?: string | null } | null)?.school_id ?? null);
      const typedProfile = profile as { username?: string | null; full_name?: string | null } | null;
      setReviewerName(typedProfile?.full_name || typedProfile?.username || authData.user.email || 'IELTS teacher');
    });
    return () => { active = false; };
  }, []);

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
      setAiError(friendlyIeltsAdminError(err, 'The AI check could not be completed. Please try again.'));
    },
  });

  const locked = detail?.review_status === 'finalized';
  const title = skill === 'writing' ? 'Writing Review' : 'Speaking Review';

  const printReview = (copy: 'student' | 'reviewer') => {
    if (!detail) return;
    const isStudentCopy = copy === 'student';
    if (isStudentCopy && !locked) return;
    const generatedAt = new Date().toISOString();
    const documentId = createSchoolDocumentId('ielts');
    const rubricRows = rubricKeys.map((key) => `
      <tr><td>${escapeSchoolDocumentHtml(rubricLabels[key] ?? key)}</td><td><strong>${escapeSchoolDocumentHtml(rubric[key] ?? 'Not scored')}</strong></td></tr>
    `).join('');
    const evidence = skill === 'writing'
      ? `<h2 class="document-page-break">Writing evidence appendix</h2>
         <p><strong>Task:</strong> ${escapeSchoolDocumentHtml(detail.task_title || detail.prompt || 'IELTS writing task')}</p>
         <p><strong>Word count:</strong> ${escapeSchoolDocumentHtml(detail.word_count ?? 'Not recorded')}</p>
         <div class="document-card" style="white-space:pre-wrap">${escapeSchoolDocumentHtml(detail.student_answer || 'No answer text available.')}</div>`
      : `<h2 class="document-page-break">Speaking evidence record</h2>
         <p><strong>Task:</strong> ${escapeSchoolDocumentHtml(detail.task_title || detail.prompt || 'IELTS speaking task')}</p>
         <p><strong>Recording duration:</strong> ${escapeSchoolDocumentHtml(detail.duration_seconds ? `${detail.duration_seconds} seconds` : 'Not recorded')}</p>
         <p class="document-callout">The audio remains in the secure school system. This printed record does not embed or expose a recording link.</p>
         <div class="document-card" style="white-space:pre-wrap">${escapeSchoolDocumentHtml(detail.transcript || 'No transcript available.')}</div>`;
    const bodyHtml = `
      ${isStudentCopy ? '<p class="document-callout"><strong>Final school feedback copy.</strong> This is a Brains Heist practice report and is not an official IELTS Test Report Form or an endorsement by IELTS.</p>' : `<p class="document-callout document-callout--private"><strong>Confidential reviewer copy.</strong> Contains assessment evidence and private working notes. Do not distribute to students or families.</p>`}
      <div class="document-grid">
        <div class="document-card"><strong>Reviewed task band</strong><span style="font-size:28px;font-weight:700">${escapeSchoolDocumentHtml(overallBand ?? '—')}</span></div>
        <div class="document-card"><strong>Review status</strong>${escapeSchoolDocumentHtml(locked ? 'Finalized' : 'Draft / in review')}</div>
      </div>
      <h2>Rubric profile</h2>
      <table><thead><tr><th>Criterion</th><th>Band</th></tr></thead><tbody>${rubricRows}</tbody></table>
      <div class="document-grid">
        <div class="document-card"><strong>Strengths</strong><div style="white-space:pre-wrap">${escapeSchoolDocumentHtml(strengths || 'No strengths recorded.')}</div></div>
        <div class="document-card"><strong>Priority improvements</strong><div style="white-space:pre-wrap">${escapeSchoolDocumentHtml(improvements || 'No improvements recorded.')}</div></div>
        <div class="document-card"><strong>Next steps</strong><div style="white-space:pre-wrap">${escapeSchoolDocumentHtml(nextSteps || 'No next steps recorded.')}</div></div>
        <div class="document-card"><strong>Teacher feedback</strong><div style="white-space:pre-wrap">${escapeSchoolDocumentHtml(teacherFeedback || 'No additional feedback recorded.')}</div></div>
      </div>
      ${isStudentCopy ? '' : `<h2>Private reviewer notes</h2><div class="document-card" style="white-space:pre-wrap">${escapeSchoolDocumentHtml(privateNotes || 'No private notes recorded.')}</div>${evidence}`}
      <div class="document-signatures"><div class="document-signature">Reviewer signature / date</div><div class="document-signature">Quality assurance / date</div></div>
    `;

    void openSchoolDocumentPreview({
      meta: {
        documentId,
        templateVersion: 'ielts-productive-review-v1',
        title: `${title} — ${isStudentCopy ? 'Student feedback' : 'Reviewer record'}`,
        subtitle: detail.task_title || 'IELTS practice productive-skill review',
        schoolName,
        schoolLogoUrl,
        audience: isStudentCopy ? 'student' : 'teacher',
        status: locked ? 'final' : 'draft',
        confidentiality: isStudentCopy ? 'family-copy' : 'confidential',
        generatedAt,
        generatedBy: reviewerName,
        className: detail.class_name || undefined,
        studentName: detail.student_name || 'Student',
        schoolId,
        studentUserId: detail.student_id,
        visibilityScope: isStudentCopy && locked ? 'student_family' : 'private',
        sourceType: `ielts_${skill}_review`,
        sourceId: attemptId,
      },
      bodyHtml,
      fileName: schoolDocumentFileName(schoolName, detail.student_name, title, isStudentCopy ? 'Student_Copy' : 'Reviewer_Record'),
    });
  };

  const statusLabel = !detail ? '' : locked ? 'Finalized' : detail.review_status === 'in_review' ? 'Draft saved' : 'Not reviewed yet';
  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown');
  const back = () => (onBack ? onBack() : navigate('/ielts/programme?programmeSection=reviews'));

  return (
    <main data-testid={embedded ? 'embedded-ielts-submission-review' : 'ielts-submission-review'} className={`bh-ielts-page bh-ielts-review-form ir-page${embedded ? ' ir-embedded' : ''}`}>
      <section className="ir-shell">
        <button type="button" className="ir-back" onClick={back}>← Back to review desk</button>
        <header className="ir-head">
          <div>
            <p className="ir-eyebrow">{skill === 'writing' ? 'Writing review' : 'Speaking review'}</p>
            <h1>{detail?.student_name || detail?.task_title || (skill === 'writing' ? 'Writing practice' : 'Speaking practice')}</h1>
            {detail ? <p className="ir-muted">{detail.student_name ? (detail.task_title ?? 'IELTS practice') : 'Student'}{detail.class_name ? ` · ${detail.class_name}` : ''} · submitted {when(detail.submitted_at)}</p> : null}
          </div>
          {detail ? <span className={`ir-status ir-status--${locked ? 'final' : detail.review_status}`}>{statusLabel}</span> : null}
        </header>

        {error ? <div className="ir-notice ir-notice--error" role="alert">{friendlyIeltsAdminError(error, 'Unable to load the submission. Please try again.')}</div> : null}
        {isLoading ? <p className="ir-muted" role="status">Loading submission…</p> : null}
        {locked && detail ? <div className="ir-notice" role="status">Finalized{detail.reviewed_at ? ` on ${when(detail.reviewed_at)}` : ''} and shared with the student. This review is read-only.</div> : null}

        {detail ? (
          <div className="ir-grid">
            <article className="ir-card">
              <h2>Task</h2>
              <div className="ir-prompt">{detail.prompt ?? 'No prompt available.'}</div>
              {skill === 'writing' ? (
                <>
                  <h2>Student answer <span className="ir-muted ir-small">· Word count: {detail.word_count ?? 'unknown'}</span></h2>
                  <div className="ir-answer">{detail.student_answer ?? 'No answer text available.'}</div>
                  <IeltsPracticeAiFeedback attemptId={attemptId} mode="teacher" />
                </>
              ) : (
                <>
                  <h2>Speaking evidence <span className="ir-muted ir-small">· {detail.duration_seconds ? `${detail.duration_seconds}s` : 'duration unknown'}</span></h2>
                  {resolvedAudioUrl ? (
                    <audio controls src={resolvedAudioUrl} className="ir-audio" onError={() => setAudioLoadError('Audio unavailable. The recording could not be loaded.')} />
                  ) : (
                    <p className="ir-muted">Audio unavailable.</p>
                  )}
                  {audioLoadError ? <p className="ir-warning">{audioLoadError}</p> : null}
                  <div className="ir-answer">{detail.transcript ?? 'No transcript available.'}</div>
                </>
              )}
            </article>

            <aside className="ir-card ir-form">
              <h2>Your bands</h2>
              <div className="ir-bands">
                {rubricKeys.map((key) => (
                  <label key={key} className="ir-field">{rubricLabels[key] ?? key}
                    <select disabled={locked} value={rubric[key] ?? ''} onChange={(e) => setRubric((current) => ({ ...current, [key]: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">Select band</option>
                      {bandOptions.map((band) => <option key={band} value={band}>{band}</option>)}
                    </select>
                    {aiFor(key)?.indication ? <span className="ir-hint">AI suggests {aiFor(key)!.indication!.low}–{aiFor(key)!.indication!.high} · you decide</span> : null}
                  </label>
                ))}
              </div>
              <label className="ir-field ir-field--strong">Task-level reviewed band (required to finalize)
                <select disabled={locked} value={overallBand ?? ''} onChange={(e) => setOverallBand(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select task band</option>
                  {bandOptions.map((band) => <option key={band} value={band}>{band}</option>)}
                </select>
              </label>

              <h2>Feedback for the student</h2>
              {!locked ? (
                <div className="ir-ai">
                  <p><strong>Assistant suggestion — verify before finalizing.</strong> Automated feedback can make mistakes. Verify the evidence before finalizing.</p>
                  {skill === 'speaking' ? <p className="ir-small">Transcript may contain errors. Listen to the audio before finalizing Speaking criteria, especially pronunciation.</p> : null}
                  <div className="ir-actions">
                    {skill === 'writing' ? (
                      <IeltsButton type="button" disabled={!aiFields} onClick={applyAiFeedback}>Copy AI feedback into the form</IeltsButton>
                    ) : (
                      <IeltsButton type="button" disabled={aiCheckMutation.isPending} onClick={() => aiCheckMutation.mutate()}>{aiCheckMutation.isPending ? 'Running AI check…' : 'Run AI check'}</IeltsButton>
                    )}
                    {aiDraft ? <IeltsButton type="button" onClick={() => {
                      const suggested = typeof aiDraft.suggested_feedback === 'string' ? aiDraft.suggested_feedback : '';
                      const strengthsList = Array.isArray(aiDraft.strengths) ? aiDraft.strengths.join('\n• ') : '';
                      const fixesList = Array.isArray(aiDraft.priority_fixes) ? aiDraft.priority_fixes.join('\n• ') : '';
                      if (suggested) setTeacherFeedback(suggested);
                      if (strengthsList) setStrengths(`• ${strengthsList}`);
                      if (fixesList) setImprovements(`• ${fixesList}`);
                    }}>Copy AI draft into the form</IeltsButton> : null}
                  </div>
                  {skill === 'writing' && !aiFields ? <p className="ir-small">Run the AI check in the panel under the student answer first.</p> : null}
                  {aiError ? <p className="ir-error">{aiError}</p> : null}
                </div>
              ) : null}
              {aiDraft ? <details className="ir-draft"><summary>Show the AI draft</summary><pre>{JSON.stringify(aiDraft, null, 2)}</pre></details> : null}
              {[
                ['Strengths', strengths, setStrengths, 'What the student did well'],
                ['Improvements', improvements, setImprovements, 'The most important things to fix'],
                ['Next steps', nextSteps, setNextSteps, 'One clear thing to practise next'],
                ['Teacher feedback', teacherFeedback, setTeacherFeedback, 'Anything else you want the student to read'],
                ['Private notes', privateNotes, setPrivateNotes, 'Only staff can see these'],
              ].map(([label, value, setter, hint]) => (
                <label key={String(label)} className="ir-field">{String(label)} <span className="ir-muted ir-small">{String(hint)}</span>
                  <textarea disabled={locked} value={String(value)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)} rows={String(label) === 'Private notes' ? 3 : 5} />
                </label>
              ))}

              {submitMutation.error ? <div className="ir-notice ir-notice--error" role="alert">{friendlyIeltsAdminError(submitMutation.error, 'Unable to save the review. Please try again.')}</div> : null}
              {submitMutation.isSuccess ? <div className="ir-notice" role="status">Review saved.</div> : null}

              {!locked ? (
                <>
                  <div className="ir-actions ir-actions--submit">
                    <IeltsButton type="button" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(false)}>Save draft</IeltsButton>
                    <IeltsButton type="button" variant="primary" disabled={submitMutation.isPending || overallBand === null} onClick={() => submitMutation.mutate(true)}>Finalize review</IeltsButton>
                  </div>
                  {overallBand === null ? <p className="ir-small ir-muted">Choose the task-level band to finalize. Finalizing shares the feedback with the student.</p> : null}
                </>
              ) : null}
              <div className="ir-print">
                <h3>Print</h3>
                <div className="ir-actions">
                  <IeltsButton type="button" onClick={() => printReview('reviewer')}>Reviewer record</IeltsButton>
                  <IeltsButton type="button" disabled={!locked} title={locked ? 'Print the finalized student feedback copy' : 'Finalize the review before printing a student copy'} onClick={() => printReview('student')}>Student feedback copy</IeltsButton>
                </div>
                {!locked ? <p className="ir-small ir-muted">The student copy is available after you finalize.</p> : null}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default IeltsSubmissionReview;
