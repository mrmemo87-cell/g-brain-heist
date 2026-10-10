import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchIeltsDiagnosticResult, type IeltsDiagnosticResult } from '../../../services/ieltsDiagnosticEvidenceService';
import { fetchTeacherProgrammeEntries, teacherProgrammeRoute } from '../../../services/ieltsTeacherProgrammeEntry';
import { supabase } from '../../../services/supabaseClient';
import { schoolAdminIeltsUrl } from '../../lib/schoolAdminIeltsNavigation';
import { IeltsButton, IeltsNotice } from '../../components/ielts/IeltsUi';
import '../../styles/ielts-screener-result.css';

const landing = { href: '/ielts', label: 'Back to IELTS', staff: false };
export default function IeltsGovernedScreenerResult() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<IeltsDiagnosticResult | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [back, setBack] = useState(landing);
  useEffect(() => {
    let active = true;
    // Navigation uses the authenticated profile; it never changes result access.
    const resolve = async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) return;
      const { data: profile, error: profileError } = await supabase.from('users').select('role, is_admin').eq('id', data.user.id).maybeSingle();
      if (!active || profileError || !profile) return;
      const role = String(profile.role ?? '').toLowerCase();
      if (profile.is_admin || ['admin', 'superadmin'].includes(role)) setBack({ ...landing, staff: true });
      else if (['school_admin', 'school_head'].includes(role)) setBack({ href: schoolAdminIeltsUrl('ielts-student-progress'), label: 'Back to student progress', staff: true });
      else if (role === 'teacher') {
        const workspace = { href: '/', label: 'Back to teacher workspace', staff: true };
        if (active) setBack(workspace);
        try {
          const entries = await fetchTeacherProgrammeEntries();
          if (active && entries.length) setBack({ href: entries.length === 1 ? teacherProgrammeRoute(entries[0]) + '&programmeSection=students' : '/ielts/programme?programmeSection=students', label: 'Back to IELTS Programme', staff: true });
        } catch { /* A revoked or unavailable allocation keeps the teacher workspace link. */ }
      }
      else if (role === 'student') setBack({ href: '/ielts/journey', label: 'My IELTS Journey', staff: false });
    };
    void resolve().catch(() => { /* Keep the safe IELTS landing link. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    if (!attemptId) setError('The result reference is missing. Return to IELTS and open the saved work again.');
    else fetchIeltsDiagnosticResult(attemptId)
      .then(r => { if (active) { setResult(r); if (!r) setError('No submitted result is available yet. Return to the saved work to check its status.'); } })
      .catch(() => { if (active) setError('This result could not open. Check your access and connection, then try again.'); });
    return () => { active = false; };
  }, [attemptId, retry]);
  const warnings = result ? [...new Set(result.warnings)] : [];
  return <main className="ix-workspace isr-page">
    <a className="isr-back" href={back.href}>← {back.label}</a>
    <header className="isr-heading">
      <p className="ix-eyebrow">IELTS · Saved evidence</p>
      <h1>Saved screener result</h1>
      <p className="ix-muted">A starting point for the next learning conversation.</p>
    </header>
    {error ? <section className="ix-panel isr-state"><IeltsNotice error>{error}</IeltsNotice>{attemptId && <IeltsButton onClick={() => setRetry(n => n + 1)}>Retry result</IeltsButton>}</section>
      : !result ? <section className="ix-panel" role="status">Opening saved evidence…</section>
      : <>
        <section className="ix-panel isr-evidence" aria-labelledby="isr-score-heading">
          <div className="isr-evidence-header"><h2 id="isr-score-heading">Starting evidence</h2><span className="ix-status">Short check · More evidence needed</span></div>
          <dl className="isr-metrics">
            <div className="isr-score"><dt>Screener score</dt><dd>{result.raw_score} <span>/ {result.marks_possible}</span></dd><p>Marks recorded in this short check</p></div>
            <div><dt>Items answered</dt><dd>{result.confidence.items_answered} <span>/ {result.confidence.items_possible}</span></dd><p>Response coverage</p></div>
            <div><dt>Skill areas attempted</dt><dd>{result.confidence.constructs_with_responses} <span>/ {result.confidence.constructs_sampled}</span></dd><p>An area counts when you answer at least one question. This does not show mastery.</p></div>
          </dl>
          {result.integrity_state === 'review_required' && <IeltsNotice>Assessment conditions need teacher review before this result is interpreted.</IeltsNotice>}
        </section>
        <section className="ix-panel isr-next" aria-labelledby="isr-next-heading">
          <p className="ix-eyebrow">The next step</p><h2 id="isr-next-heading">{back.staff ? 'Guide the next learning conversation' : 'Make the next check count'}</h2>
          <p>{result.next_step}</p>
          <a className="ix-button ix-button--primary" href={back.href}>{back.label} →</a>
        </section>
        <section className="ix-panel isr-notes" aria-labelledby="isr-notes-heading">
          <h2 id="isr-notes-heading">How to read this result</h2>
          <p>Confidence in this evidence is low because the check is short. This describes the amount of evidence, not the student’s ability.</p>
          <p>This is starting evidence from a short check, not a full IELTS skill assessment or an official IELTS result. It does not establish a band or a persistent weakness.</p>
          {warnings.length > 0 && <ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul>}
        </section>
      </>}
  </main>;
}
