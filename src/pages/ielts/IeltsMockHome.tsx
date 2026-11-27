import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/ielts-mock-cbt.css';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import { IELTS_COURSE_ROUTE } from '../../../services/ieltsCourseService';
import {
  IELTS_MOCKS_ROUTE,
  fetchMockHome,
  ieltsMockAttemptRoute,
  mockContentsLine,
  mockSections,
  sectionLabel,
  startMock,
  type MockAttemptSummary,
  type MockHomeEntry,
} from '../../../services/ieltsMockCbtService';

const writingLine = (a: MockAttemptSummary) => {
  if (a.writing_tasks && a.writing_tasks.length) {
    const left = a.writing_tasks.filter((t) => !t.reviewed).length;
    return left ? 'Writing waiting for your teacher' : 'Writing checked · read your feedback';
  }
  return `Writing ${a.writing_reviewed ? 'marked' : 'waiting for marking'}`;
};

const attemptLine = (e: MockHomeEntry, a: MockAttemptSummary) => mockSections(e.sections)
  .map((x) => (x === 'writing' ? writingLine(a) : `${sectionLabel[x]} ${(x === 'listening' ? a.listening : a.reading) ?? '–'}/40`)).join(' · ');

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '');

/** Course map card: shown only when a computer mock is open for this learner. */
export function IeltsMockCard() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MockHomeEntry[] | null>(null);
  useEffect(() => { let alive = true; fetchMockHome().then((e) => { if (alive) setEntries(e); }).catch(() => undefined); return () => { alive = false; }; }, []);
  if (!entries?.length) return null;
  const open = entries.flatMap((e) => e.attempts).find((a) => a.status === 'in_progress');
  const ready = entries.find((e) => e.available);
  const rewrite = ready?.kind === 'writing_rewrite';
  return (
    <button type="button" className="mk-course-card" onClick={() => navigate(open ? ieltsMockAttemptRoute(open.id) : IELTS_MOCKS_ROUTE)}>
      <span className="mk-course-icon" aria-hidden="true">📝</span>
      <span className="mk-course-text">
        <b>{open ? 'Continue your mock test' : rewrite ? ready.title : 'Full mock test'}</b>
        <small>{open ? (open.section === 'done' ? 'Finishing up' : `${sectionLabel[open.section]} is next`)
          : rewrite ? 'Both Writing tasks on screen, 60 minutes' : 'Listening, Reading and Writing, like the real computer test'}</small>
      </span>
      <span className="mk-course-go" aria-hidden="true">→</span>
    </button>
  );
}

const IeltsMockHome: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MockHomeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMockHome().then((e) => { if (alive) setEntries(e); }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Mock tests could not load.'); });
    return () => { alive = false; };
  }, []);

  const begin = async (code: string) => {
    setBusy(code);
    try { const r = await startMock(code); navigate(ieltsMockAttemptRoute(r.attempt_id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The test could not start.'); setBusy(null); }
  };

  return (
    <IeltsStudentShell focus={{ label: 'Course map', to: IELTS_COURSE_ROUTE }}>
      <div className="mk-result">
        <header className="mk-result-head">
          <p className="mk-eyebrow">Brains Heist IELTS · Academic</p>
          <h1>Full mock tests</h1>
          <p>Sit Listening, Reading and Writing in one go, on screen and against the clock, the way the computer-delivered IELTS works. Listening and Reading are marked straight away; your Writing is checked by your teacher or the Brains Heist team.</p>
        </header>
        {error && <p className="mk-note" role="alert">{error}</p>}
        {!entries && !error && <p className="mk-note">Loading…</p>}
        {entries && entries.length === 0 && <p className="mk-note">No mock test is open for your account yet.</p>}
        {entries?.map((e) => {
          const open = e.attempts.find((a) => a.status === 'in_progress');
          const done = e.attempts.filter((a) => a.status === 'completed');
          const sections = mockSections(e.sections);
          const hasListening = sections.includes('listening');
          const length = e.minutes < 90 ? `${e.minutes} min` : `${Math.floor(e.minutes / 60)} h ${e.minutes % 60} min`;
          return (
            <section key={e.code} className="mk-card mk-home-card">
              <div className="mk-home-top">
                <div>
                  <h2>{e.title}</h2>
                  <p className="mk-small">About {length} · {mockContentsLine(sections)}{e.practice_only ? ' · practice (no band range)' : ''}</p>
                </div>
                {open ? (
                  <button type="button" className="mk-btn mk-btn--primary" onClick={() => navigate(ieltsMockAttemptRoute(open.id))}>Continue</button>
                ) : e.available ? (
                  <button type="button" className="mk-btn mk-btn--primary" disabled={busy === e.code} onClick={() => { void begin(e.code); }}>
                    {busy === e.code ? 'Starting…' : done.length ? 'Take it again' : 'Start the test'}
                  </button>
                ) : null}
              </div>
              {!open && e.available && (
                <ul className="mk-checklist">
                  <li>Find a quiet place and allow about {length}.</li>
                  {hasListening && <li>Use headphones. The recording plays once only.</li>}
                  <li>Once a section starts, its timer keeps running even if you close the page.</li>
                  {e.kind === 'writing_rewrite' && <li>You write both tasks again. Your teacher checks them like your other writing.</li>}
                  {done.length > 0 && !e.practice_only && <li>You have taken this test before, so a new attempt is practice and shows no band range.</li>}
                </ul>
              )}
              {done.length > 0 && (
                <ul className="mk-attempts">
                  {done.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => navigate(ieltsMockAttemptRoute(a.id))}>
                        <span>{fmtDate(a.completed_at)}{a.practice ? ' · practice' : ''}</span>
                        <span>{attemptLine(e, a)}</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <p className="mk-small mk-rights">Original Brains Heist practice tests. Not official IELTS material and not endorsed by IELTS.</p>
      </div>
    </IeltsStudentShell>
  );
};

export default IeltsMockHome;
