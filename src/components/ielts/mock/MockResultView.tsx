import React, { useEffect, useMemo, useState } from 'react';
import IeltsStudentShell from '../student/IeltsStudentShell';
import {
  IELTS_MOCKS_ROUTE,
  fetchMockResult,
  questionTexts,
  type MockIndicative,
  type MockItemOutcome,
  type MockResult,
} from '../../../../services/ieltsMockCbtService';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Visual & UX Bible 13.1: the range is the headline, with its labels, confidence, form, date and raw score beside it. */
export function IndicativeBlock({ indicative, form, raw, date }: { indicative: MockIndicative; form: string; raw: string; date: string }) {
  const low = indicative.low ?? 0;
  const high = indicative.high ?? 9;
  return (
    <div className="mk-ind">
      <p className="mk-ind-range">{indicative.label}</p>
      <p className="mk-ind-label">Indicative band range</p>
      <div className="mk-ind-bar" aria-hidden="true">
        <span style={{ left: `${(low / 9) * 100}%`, width: `${((high - low) / 9) * 100}%` }} />
      </div>
      <ul className="mk-ind-meta">
        <li>Not an official IELTS result</li>
        <li className="mk-chip">Confidence: low</li>
        <li>{form} · {raw} · {date}</li>
      </ul>
    </div>
  );
}

function ObjectiveCard({ skill, raw, indicative, practice, form, date }: { skill: string; raw: number; indicative: MockIndicative | null; practice: boolean; form: string; date: string }) {
  return (
    <section className="mk-card">
      <h2>{skill}</h2>
      <p className="mk-raw"><b>{raw}</b>/40 correct</p>
      {indicative && !practice ? (
        <IndicativeBlock indicative={indicative} form={form} raw={`${raw}/40`} date={date} />
      ) : (
        <p className="mk-note">{practice ? 'No band range for this attempt: you have seen this test before.' : 'Indicative range needs a full, unseen mock.'}</p>
      )}
    </section>
  );
}

function ReviewList({ items, texts }: { items: MockItemOutcome[]; texts: Record<number, string> }) {
  return (
    <ol className="mk-review-list">
      {items.map((it) => (
        <li key={it.n} className={it.correct ? 'is-right' : 'is-wrong'}>
          <span className="mk-q-num">{it.n}</span>
          <div>
            <p className="mk-review-q">{texts[it.n] ?? ''}</p>
            <p>
              <span className="mk-review-tag">{it.correct ? '✓ Correct' : it.state === 'blank' ? '– No answer' : '✗ Incorrect'}</span>
              {' '}Your answer: <b>{it.response ?? '—'}</b>
              {!it.correct && <> · Answer: <b>{it.key}</b></>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const CRITERIA: Array<{ task: 't1' | 't2'; key: string; label: string }> = [
  { task: 't1', key: 'ta', label: 'Task Achievement' },
  { task: 't1', key: 'cc', label: 'Coherence and Cohesion' },
  { task: 't1', key: 'lr', label: 'Lexical Resource' },
  { task: 't1', key: 'gra', label: 'Grammatical Range and Accuracy' },
  { task: 't2', key: 'tr', label: 'Task Response' },
  { task: 't2', key: 'cc', label: 'Coherence and Cohesion' },
  { task: 't2', key: 'lr', label: 'Lexical Resource' },
  { task: 't2', key: 'gra', label: 'Grammatical Range and Accuracy' },
];

export function WritingResult({ result }: { result: MockResult }) {
  const w = result.skills.writing;
  const review = w.review;
  const date = fmtDate(result.completed_at);
  return (
    <section className="mk-card">
      <h2>Writing</h2>
      <p className="mk-raw">Task 1: <b>{w.t1_words}</b> words · Task 2: <b>{w.t2_words}</b> words</p>
      {review ? (
        <>
          {review.indicative && !result.practice ? (
            <IndicativeBlock indicative={review.indicative} form={result.code.replace('IELTS-', '')} raw="Task 1 + Task 2 × 2" date={date} />
          ) : (
            <p className="mk-note">{result.practice ? 'No band range for this attempt: you have seen this test before.' : 'Indicative range needs both tasks marked.'}</p>
          )}
          <p className="mk-small">Marked by the Brains Heist team, {fmtDate(review.reviewed_at)}.</p>
          <table className="mk-crit">
            <thead><tr><th scope="col">Criterion</th><th scope="col">Task 1</th><th scope="col">Task 2</th></tr></thead>
            <tbody>
              {(['Task Achievement / Response', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy'] as const).map((label, i) => {
                const k1 = ['ta', 'cc', 'lr', 'gra'][i] as 'ta' | 'cc' | 'lr' | 'gra';
                const k2 = ['tr', 'cc', 'lr', 'gra'][i] as 'tr' | 'cc' | 'lr' | 'gra';
                return <tr key={label}><th scope="row">{label}</th><td>{review.criteria.t1[k1]}</td><td>{review.criteria.t2[k2]}</td></tr>;
              })}
            </tbody>
          </table>
          {review.comment && <p className="mk-comment">{review.comment}</p>}
        </>
      ) : (
        <p className="mk-note">Your writing is waiting to be marked. Each task will get a band for the four IELTS criteria, then you will see your Writing band range here.</p>
      )}
    </section>
  );
}

export { CRITERIA };

/** Results of a completed computer mock: raw scores, eligible ranges, and every question with its answer. */
export default function MockResultView({ attemptId }: { attemptId: string }) {
  const [result, setResult] = useState<MockResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'listening' | 'reading' | 'writing'>('listening');

  useEffect(() => {
    let alive = true;
    fetchMockResult(attemptId).then((r) => { if (alive) setResult(r); }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Your result could not load.'); });
    return () => { alive = false; };
  }, [attemptId]);

  const texts = useMemo(() => ({
    listening: questionTexts((result?.payload.listening?.parts ?? []).flatMap((p) => p.groups)),
    reading: questionTexts((result?.payload.reading?.passages ?? []).flatMap((p) => p.groups)),
  }), [result]);

  const form = result ? result.code.replace('IELTS-', '') : '';
  const date = fmtDate(result?.completed_at ?? null);

  return (
    <IeltsStudentShell focus={{ label: 'Mock tests', to: IELTS_MOCKS_ROUTE }}>
      <div className="mk-result">
        {error && <p className="mk-note" role="alert">{error}</p>}
        {!result && !error && <p className="mk-note">Loading your result…</p>}
        {result && result.status !== 'completed' && (
          <div className="mk-card"><p>This test is still in progress.</p>
            <button type="button" className="mk-btn mk-btn--primary" onClick={() => window.location.reload()}>Continue the test</button></div>
        )}
        {result && result.status === 'completed' && (
          <>
            <header className="mk-result-head">
              <p className="mk-eyebrow">{result.title} · Academic · {date}{result.practice ? ' · Practice attempt' : ''}</p>
              <h1>Your mock test result</h1>
              <p>Listening and Reading were marked as soon as you finished them. Speaking is not part of this computer test.</p>
            </header>
            <div className="mk-cards">
              {result.skills.listening && <ObjectiveCard skill="Listening" raw={result.skills.listening.raw} indicative={result.skills.listening.indicative} practice={result.practice} form={form} date={date} />}
              {result.skills.reading && <ObjectiveCard skill="Reading" raw={result.skills.reading.raw} indicative={result.skills.reading.indicative} practice={result.practice} form={form} date={date} />}
              <WritingResult result={result} />
            </div>

            <section className="mk-card mk-review-card">
              <h2>Check every answer</h2>
              <div className="mk-tabs" role="tablist" aria-label="Review by section">
                {(['listening', 'reading', 'writing'] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
                    {t[0]!.toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {tab === 'listening' && result.skills.listening && <ReviewList items={result.skills.listening.items} texts={texts.listening} />}
              {tab === 'reading' && result.skills.reading && <ReviewList items={result.skills.reading.items} texts={texts.reading} />}
              {tab === 'writing' && (
                <div className="mk-essays">
                  <h3>Task 1</h3>
                  <p className="mk-small">{result.payload.writing?.task1.prompt}</p>
                  <div className="mk-essay">{result.skills.writing.t1 || '(no answer)'}</div>
                  <h3>Task 2</h3>
                  <p className="mk-small">{result.payload.writing?.task2.prompt}</p>
                  <div className="mk-essay">{result.skills.writing.t2 || '(no answer)'}</div>
                </div>
              )}
            </section>
            <p className="mk-small mk-rights">Original Brains Heist practice test. Not official IELTS material and not endorsed by IELTS.</p>
          </>
        )}
      </div>
    </IeltsStudentShell>
  );
}
