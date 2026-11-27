import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../styles/ielts-mock-cbt.css';
import MockQuestionGroup from '../../components/ielts/mock/MockQuestionGroup';
import MockPassage from '../../components/ielts/mock/MockPassage';
import MockResultView from '../../components/ielts/mock/MockResultView';
import {
  IELTS_MOCKS_ROUTE,
  beginMockSection,
  clearLocalAnswers,
  countWords,
  fetchMockState,
  finishMockSection,
  groupNumbers,
  logMockEvent,
  readLocalAnswers,
  saveMockAnswers,
  sectionLabel,
  writeLocalAnswers,
  type MockAnswers,
  type MockGroup,
  type MockListeningPart,
  type MockPassage as MockPassageData,
  type MockSection,
  type MockState,
  type MockWritingTask,
} from '../../../services/ieltsMockCbtService';

/**
 * Computer-delivered IELTS mock (Diagnostic Bible 2.1A, 6.1, 12A; Visual & UX Bible 6.5, 14.3: quiet exam surface).
 * The server opens one section at a time and keeps the clock. This page only shows the open section, saves answers
 * and moves on when the server says the section has closed.
 */

const fmtClock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

function useServerClock(state: MockState | null) {
  // Offset between this device's clock and the server, fixed when each server response arrives (never trust the device clock).
  const offset = useRef(0);
  const seen = useRef<string | null>(null);
  if (state?.server_now && seen.current !== state.server_now) {
    seen.current = state.server_now;
    offset.current = Date.parse(state.server_now) - Date.now();
  }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const serverNow = now + offset.current;
  const remaining = state?.deadline ? (Date.parse(state.deadline) - serverNow) / 1000 : null;
  const elapsed = state?.section_started_at ? (serverNow - Date.parse(state.section_started_at)) / 1000 : null;
  return { remaining, elapsed };
}

function Confirm({ title, body, yes, onYes, onNo }: { title: string; body: string; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="mk-modal" role="dialog" aria-modal="true" aria-labelledby="mk-confirm-title">
      <div className="mk-modal-card">
        <h2 id="mk-confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="mk-modal-actions">
          <button type="button" className="mk-btn" onClick={onNo} autoFocus>Go back</button>
          <button type="button" className="mk-btn mk-btn--primary" onClick={onYes}>{yes}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ intro screens */

function SectionIntro({ state, audio, onStart, busy }: { state: MockState; audio: HTMLAudioElement | null; onStart: () => void; busy: boolean }) {
  const section = state.section as MockSection;
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => audio?.volume ?? 1);
  const minutes = state.section_seconds ? Math.round(state.section_seconds / 60) : 60;
  const rewrite = state.kind === 'writing_rewrite';
  const writingMock = state.kind === 'writing_mock';

  const sample = () => {
    if (!audio || !state.audio) return;
    audio.currentTime = 0;
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
    const stopAt = state.audio.sample_end;
    const stop = () => {
      if (audio.currentTime >= stopAt) { audio.pause(); audio.currentTime = 0; setPlaying(false); audio.removeEventListener('timeupdate', stop); }
    };
    audio.addEventListener('timeupdate', stop);
  };

  return (
    <div className="mk-intro">
      <div className="mk-intro-card">
        <p className="mk-eyebrow">{state.title} · Academic · {sectionLabel[section]}</p>
        <h1>IELTS {sectionLabel[section]}</h1>
        <p className="mk-intro-time">Time: {section === 'listening' ? `about ${minutes} minutes` : `${minutes} minutes`}</p>
        {rewrite ? (
          <p className="mk-note" data-testid="mk-rewrite-note">
            <b>Writing rewrite · practice.</b> You write both tasks of this mock again on screen. Your teacher checks them like
            your other writing and shares feedback for each task. A rewrite has no band range.
          </p>
        ) : writingMock ? (
          <p className="mk-note" data-testid="mk-writing-mock-note">
            Your teacher checks both tasks and shares feedback for each. When both are checked, you see your Writing
            indicative band range.
          </p>
        ) : state.practice && (
          <p className="mk-note">Practice attempt: you have taken this test before, so your result will show raw scores but no band range.</p>
        )}
        <h2>Instructions to candidates</h2>
        <ul>
          <li>Answer <b>all</b> the questions.</li>
          <li>You can change your answers at any time during this section.</li>
          {section === 'listening' && <li>The recording plays <b>once only</b>. It cannot be paused or replayed.</li>}
          {section === 'listening' && <li>When the recording ends you have <b>2 minutes</b> to check your answers.</li>}
          {section === 'writing' && <li>Task 1: at least <b>150 words</b> (about 20 minutes). Task 2: at least <b>250 words</b> (about 40 minutes).</li>}
          {section === 'writing' && <li>Type your answers. Pasting is turned off, and there is no spelling check.</li>}
          <li>The timer runs on our server. It keeps running if you close the page, so stay until you finish.</li>
          <li>Your work is saved as you go. If you leave this page or switch tabs, your teacher can see that you left.</li>
        </ul>
        <h2>Information for candidates</h2>
        <ul>
          {section === 'listening' && <li>There are 40 questions in four parts. Each question carries one mark.</li>}
          {section === 'reading' && <li>There are 40 questions in three passages. Each question carries one mark.</li>}
          {section === 'writing' && <li>There are two tasks. Task 2 counts twice as much as Task 1.</li>}
          <li>Spelling counts. Answers that go over the word limit are marked wrong.</li>
        </ul>
        {section === 'listening' && (
          <div className="mk-soundcheck">
            <h2>Check your sound</h2>
            <p>Put on headphones, press <b>Play sound</b> and adjust the volume.</p>
            <div className="mk-soundcheck-row">
              <button type="button" className="mk-btn" onClick={sample} disabled={playing || !audio}>{playing ? 'Playing…' : '▶ Play sound'}</button>
              <label className="mk-volume">Volume
                <input type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audio) audio.volume = v; }} />
              </label>
            </div>
          </div>
        )}
        <button type="button" className="mk-btn mk-btn--primary mk-btn--big" onClick={onStart} disabled={busy}>
          {busy ? 'Starting…' : `Start ${sectionLabel[section]}`}
        </button>
        {section === 'listening' && <p className="mk-small">Speaking is not part of this computer test.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ player */

interface PlayerProps {
  state: MockState;
  audio: HTMLAudioElement | null;
  onClosed: (next: MockState) => void;
}

type Pane = { key: string; label: string; range: [number, number]; groups: MockGroup[]; passage?: MockPassageData; part?: MockListeningPart };

function SectionPlayer({ state, audio, onClosed }: PlayerProps) {
  const section = state.section as MockSection;
  const attemptId = state.attempt_id;
  const { remaining, elapsed } = useServerClock(state);
  const [answers, setAnswers] = useState<MockAnswers>(() => ({ ...(state.answers ?? {}), ...(readLocalAnswers(attemptId, section) ?? {}) }));
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'offline'>('saved');
  const [pane, setPane] = useState(0);
  const [current, setCurrent] = useState<number>(1);
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [textSize, setTextSize] = useState<'s' | 'm' | 'l'>('m');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [listenDone, setListenDone] = useState(false);
  const [volume, setVolume] = useState(() => audio?.volume ?? 1);
  const answersRef = useRef(answers);
  const dirty = useRef(false);
  const closing = useRef(false);
  answersRef.current = answers;

  const panes: Pane[] = useMemo(() => {
    if (section === 'listening') {
      const parts = (state.payload as { parts: MockListeningPart[] } | null)?.parts ?? [];
      return parts.map((p) => ({ key: `p${p.part}`, label: `Part ${p.part}`, range: p.range, groups: p.groups, part: p }));
    }
    if (section === 'reading') {
      const passages = (state.payload as { passages: MockPassageData[] } | null)?.passages ?? [];
      return passages.map((p) => ({ key: `r${p.n}`, label: `Part ${p.n}`, range: p.range, groups: p.groups, passage: p }));
    }
    return [];
  }, [section, state.payload]);

  /* ---------- saving */
  const save = useCallback(async () => {
    if (!dirty.current || closing.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      const r = await saveMockAnswers(attemptId, section, answersRef.current);
      if (r.saved) {
        if (!dirty.current) { clearLocalAnswers(attemptId, section); setSaveState('saved'); }
      } else {
        // The server closed this section (time is up): load what comes next.
        closing.current = true;
        onClosed(await fetchMockState(attemptId));
      }
    } catch {
      dirty.current = true;
      setSaveState('offline');
    }
  }, [attemptId, section, onClosed]);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = window.setTimeout(() => { void save(); }, 1500);
    return () => window.clearTimeout(t);
  }, [answers, save]);

  useEffect(() => {
    const retry = window.setInterval(() => { if (dirty.current) void save(); }, 10000);
    const hide = () => { if (document.visibilityState === 'hidden' && dirty.current) void save(); };
    document.addEventListener('visibilitychange', hide);
    return () => { window.clearInterval(retry); document.removeEventListener('visibilitychange', hide); };
  }, [save]);

  /* ---------- integrity: leaving the page is recorded for the teacher (never a score, never blocks the test) */
  useEffect(() => {
    let blurTimer = 0;
    const onVisibility = () => logMockEvent(attemptId, document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible');
    // A window switch that also hides the tab is already a tab switch; record a focus loss only when the page stays visible.
    const onBlur = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => { if (document.visibilityState === 'visible' && !document.hasFocus()) logMockEvent(attemptId, 'window_blur'); }, 400);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => { window.clearTimeout(blurTimer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur); };
  }, [attemptId]);

  const setAnswer = useCallback((n: number | string, v: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [String(n)]: v };
      writeLocalAnswers(attemptId, section, next);
      return next;
    });
    dirty.current = true;
    setSaveState('unsaved');
  }, [attemptId, section]);

  const setMulti = useCallback((nums: number[], letters: string[]) => {
    setAnswers((prev) => {
      const next = { ...prev };
      nums.forEach((n, i) => { next[String(n)] = letters[i] ?? ''; });
      writeLocalAnswers(attemptId, section, next);
      return next;
    });
    dirty.current = true;
    setSaveState('unsaved');
  }, [attemptId, section]);

  /* ---------- finishing */
  const finish = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    setFinishing(true);
    setConfirm(false);
    if (audio) audio.pause();
    for (let i = 0; i < 4; i += 1) {
      try {
        const next = await finishMockSection(attemptId, section, answersRef.current);
        clearLocalAnswers(attemptId, section);
        onClosed(next);
        return;
      } catch {
        setSaveState('offline');
        await new Promise((r) => window.setTimeout(r, 2500 * (i + 1)));
      }
    }
    closing.current = false;
    setFinishing(false);
  }, [attemptId, section, audio, onClosed]);

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !closing.current) void finish();
  }, [remaining, finish]);

  /* ---------- listening audio: once only, positioned by the server clock */
  const listenEnd = state.audio?.listen_end ?? 0;
  const startAudioAt = useCallback(async (pos: number) => {
    if (!audio) return;
    if (pos >= listenEnd) { setListenDone(true); return; }
    try {
      if (Math.abs(audio.currentTime - pos) > 1.5) audio.currentTime = pos;
      await audio.play();
      setAudioBlocked(false);
      setAudioError(false);
    } catch {
      setAudioBlocked(true);
    }
  }, [audio, listenEnd]);

  useEffect(() => {
    if (section !== 'listening' || !audio) return undefined;
    const onTime = () => { if (audio.currentTime >= listenEnd) { audio.pause(); setListenDone(true); } };
    const onError = () => setAudioError(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('error', onError);
    if (state.audio?.elapsed != null) void startAudioAt(Math.max(0, state.audio.elapsed));
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('error', onError); audio.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, audio]);

  /* ---------- navigation */
  const goTo = (n: number) => {
    const idx = panes.findIndex((p) => n >= p.range[0] && n <= p.range[1]);
    if (idx >= 0) setPane(idx);
    setCurrent(n);
    window.setTimeout(() => {
      const el = document.getElementById(`mk-q${n}`);
      el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      const input = el?.matches('input') ? (el as HTMLInputElement) : el?.querySelector('input');
      (input as HTMLInputElement | null | undefined)?.focus({ preventScroll: true });
    }, 60);
  };
  const toggleFlag = () => setFlagged((prev) => { const next = new Set(prev); if (next.has(current)) next.delete(current); else next.add(current); return next; });
  const answered = (n: number) => Boolean((answers[String(n)] ?? '').trim());
  const answeredCount = Array.from({ length: 40 }, (_, i) => i + 1).filter(answered).length;

  const timeLow = remaining !== null && remaining < 300;
  const active = panes[pane];

  return (
    <div className={`mk-shell mk-text-${textSize}`}>
      <header className="mk-top">
        <div className="mk-top-id">
          <b>{state.title}</b>
          <span>{sectionLabel[section]}</span>
        </div>
        <div className={`mk-timer${timeLow ? ' is-low' : ''}`} role="timer" aria-live={timeLow ? 'polite' : 'off'}>
          {section === 'listening' && !listenDone ? 'Recording playing · ' : section === 'listening' ? 'Check your answers · ' : ''}
          <b>{remaining === null ? '--:--' : fmtClock(remaining)}</b> left
        </div>
        <div className="mk-top-tools">
          <span className={`mk-save mk-save--${saveState}`} aria-live="polite">
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'offline' ? 'Offline: answers kept on this device' : 'Not saved yet'}
          </span>
          {section === 'listening' && (
            <label className="mk-volume mk-volume--top" title="Volume">
              <span aria-hidden="true">🔊</span>
              <span className="mk-sr">Volume</span>
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audio) audio.volume = v; }} />
            </label>
          )}
          <div className="mk-size" role="group" aria-label="Text size">
            {(['s', 'm', 'l'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={textSize === s} className={textSize === s ? 'is-on' : ''} onClick={() => setTextSize(s)}>
                {s === 's' ? 'A−' : s === 'm' ? 'A' : 'A+'}
              </button>
            ))}
          </div>
          <button type="button" className="mk-btn mk-btn--finish" onClick={() => setConfirm(true)} disabled={finishing}>
            {finishing ? 'Submitting…' : section === 'writing' ? 'Submit test' : `Finish ${sectionLabel[section]}`}
          </button>
        </div>
      </header>

      {(audioBlocked || audioError) && section === 'listening' && !listenDone && (
        <div className="mk-banner" role="alert">
          <span>{audioError ? 'The recording stopped loading. Check your connection.' : 'Your Listening test is running. Press the button to continue the recording.'}</span>
          <button type="button" className="mk-btn mk-btn--primary" onClick={() => { if (elapsed !== null) void startAudioAt(Math.max(0, elapsed)); }}>
            {audioError ? 'Reconnect the recording' : '▶ Continue the recording'}
          </button>
        </div>
      )}

      {section === 'writing' ? (
        <WritingPane state={state} answers={answers} onChange={setAnswer} pane={pane} onBlocked={(kind) => logMockEvent(attemptId, kind)} />
      ) : active ? (
        <main className={`mk-body${active.passage ? ' mk-body--split' : ''}`}>
          <div className="mk-part-bar">
            <b>{active.label}</b>
            <span>{section === 'listening' ? `Listen and answer questions ${active.range[0]}–${active.range[1]}.` : `Read the text and answer questions ${active.range[0]}–${active.range[1]}.`}</span>
          </div>
          {active.passage && <MockPassage passage={active.passage} attemptId={attemptId} />}
          <div className="mk-questions">
            {active.groups.map((g) => (
              <MockQuestionGroup key={g.range[0]} group={g} answers={answers} onAnswer={setAnswer} onMulti={setMulti}
                flagged={flagged} onFocusQuestion={setCurrent} disabled={finishing} />
            ))}
          </div>
        </main>
      ) : (
        <main className="mk-body"><p className="mk-note">Loading questions…</p></main>
      )}

      <nav className="mk-nav" aria-label="Questions">
        {section === 'writing' ? (
          <div className="mk-nav-parts">
            {(['t1', 't2'] as const).map((t, i) => (
              <button key={t} type="button" className={`mk-nav-part${pane === i ? ' is-on' : ''}`} onClick={() => setPane(i)}>
                Task {i + 1} <small>{countWords(answers[t] ?? '')} words</small>
              </button>
            ))}
          </div>
        ) : (
          <>
            <label className="mk-review">
              <input type="checkbox" checked={flagged.has(current)} onChange={toggleFlag} /> Review question {current}
            </label>
            <div className="mk-nav-parts">
              {panes.map((p, i) => pane !== i ? (
                <button key={p.key} type="button" className="mk-nav-part mk-nav-part--closed" onClick={() => setPane(i)}>
                  {p.label} <small>{groupNumbersOf(p).filter(answered).length} of {groupNumbersOf(p).length}</small>
                </button>
              ) : (
                <div key={p.key} className="mk-nav-part is-on">
                  <span className="mk-nav-label">{p.label}</span>
                  <span className="mk-nav-nums">
                    {groupNumbersOf(p).map((n) => (
                      <button key={n} type="button"
                        className={`mk-num${answered(n) ? ' is-done' : ''}${current === n ? ' is-cur' : ''}${flagged.has(n) ? ' is-flag' : ''}`}
                        aria-label={`Question ${n}${answered(n) ? ', answered' : ''}${flagged.has(n) ? ', marked for review' : ''}`}
                        onClick={() => goTo(n)}>{n}</button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <span className="mk-nav-count">{answeredCount} of 40 answered</span>
            <div className="mk-nav-arrows">
              <button type="button" aria-label="Previous question" onClick={() => goTo(Math.max(1, current - 1))}>←</button>
              <button type="button" aria-label="Next question" onClick={() => goTo(Math.min(40, current + 1))}>→</button>
            </div>
          </>
        )}
      </nav>

      {confirm && (
        <Confirm
          title={section === 'writing' ? 'Submit the whole test?' : `Finish ${sectionLabel[section]}?`}
          body={section === 'listening'
            ? `You have answered ${answeredCount} of 40 questions. Once you finish, you cannot come back to Listening, even if the recording is still playing.`
            : section === 'reading'
              ? `You have answered ${answeredCount} of 40 questions. Once you finish, you cannot come back to Reading.`
              : `Task 1: ${countWords(answers['t1'] ?? '')} words. Task 2: ${countWords(answers['t2'] ?? '')} words. You cannot change your writing after you submit.`}
          yes={section === 'writing' ? 'Submit test' : 'Finish section'}
          onYes={() => { void finish(); }}
          onNo={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

const groupNumbersOf = (p: Pane) => p.groups.flatMap((g) => groupNumbers(g));

/* ------------------------------------------------------------------ writing */

function WritingPane({ state, answers, onChange, pane, onBlocked }: {
  state: MockState; answers: MockAnswers; onChange: (key: string, v: string) => void; pane: number;
  onBlocked: (kind: 'paste_blocked' | 'drop_blocked') => void;
}) {
  const tasks = state.payload as { task1: MockWritingTask; task2: MockWritingTask } | null;
  const [blocked, setBlocked] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!blocked) return undefined;
    const t = window.setTimeout(() => setBlocked(false), 4000);
    return () => window.clearTimeout(t);
  }, [blocked]);
  if (!tasks) return <main className="mk-body"><p className="mk-note">Loading the tasks…</p></main>;
  const key = pane === 0 ? 't1' : 't2';
  const task = pane === 0 ? tasks.task1 : tasks.task2;
  const words = countWords(answers[key] ?? '');
  return (
    <main className="mk-body mk-body--split">
      <div className="mk-part-bar">
        <b>Task {pane + 1}</b>
        <span>You should spend about {task.suggested_minutes} minutes on this task. Write at least {task.minimum_words} words.</span>
      </div>
      <section className="mk-passage mk-task" aria-label={`Writing Task ${pane + 1}`}>
        <p className="mk-task-prompt">{task.prompt}</p>
        {task.figure && (
          <figure className={`mk-figure${zoom ? ' is-zoomed' : ''}`}>
            <img src={task.figure.src} alt={task.figure.alt || task.figure.title} />
            {task.figure.note && <figcaption>{task.figure.note}</figcaption>}
            <button type="button" className="mk-btn mk-figure-zoom" aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
              {zoom ? 'Smaller picture' : 'Bigger picture'}
            </button>
          </figure>
        )}
      </section>
      <section className="mk-questions mk-write">
        <label htmlFor={`mk-${key}`} className="mk-sr">Your answer to Task {pane + 1}</label>
        <textarea
          id={`mk-${key}`}
          key={key}
          className="mk-textarea"
          value={answers[key] ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          onPaste={(e) => { e.preventDefault(); setBlocked(true); onBlocked('paste_blocked'); }}
          onDrop={(e) => { e.preventDefault(); setBlocked(true); onBlocked('drop_blocked'); }}
          spellCheck={false}
          autoCorrect="off"
          autoComplete="off"
          autoCapitalize="sentences"
          data-gramm="false"
          placeholder={`Write your answer to Task ${pane + 1} here.`}
        />
        {blocked && <p className="mk-note mk-paste-note" role="status">Pasting is turned off in the test. Please type your answer.</p>}
        <p className={`mk-words${words < task.minimum_words ? ' is-under' : ''}`}>
          Words: <b>{words}</b>{words < task.minimum_words ? ` (at least ${task.minimum_words})` : ''}
        </p>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ page */

const IeltsMockTest: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<MockState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    if (!attemptId) return;
    try { setError(null); setState(await fetchMockState(attemptId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The test could not load.'); }
  }, [attemptId]);

  useEffect(() => { void load(); }, [load]);

  // One audio element for the whole Listening section, created as soon as its URL is known so it can buffer.
  useEffect(() => {
    const url = state?.audio?.url;
    if (!url || audioRef.current) return;
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
    audioRef.current = a;
  }, [state?.audio?.url]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const start = async () => {
    if (!state || !attemptId) return;
    setBusy(true);
    const audio = audioRef.current;
    if (state.section === 'listening' && audio) {
      // Start inside the tap so phones allow playback; the player then aligns it with the server clock.
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    }
    try { setState(await beginMockSection(attemptId, state.section as MockSection)); }
    catch (e) { audio?.pause(); setError(e instanceof Error ? e.message : 'The section could not start.'); }
    finally { setBusy(false); }
  };

  if (error) {
    return (
      <div className="mk-intro"><div className="mk-intro-card" role="alert">
        <h1>We could not open your test</h1><p>{error}</p>
        <div className="mk-modal-actions">
          <button type="button" className="mk-btn" onClick={() => navigate(IELTS_MOCKS_ROUTE)}>Back to mock tests</button>
          <button type="button" className="mk-btn mk-btn--primary" onClick={() => { void load(); }}>Try again</button>
        </div>
      </div></div>
    );
  }
  if (!state) return <div className="mk-intro"><div className="mk-intro-card"><p>Loading your test…</p></div></div>;
  if (state.status === 'completed') return <MockResultView attemptId={state.attempt_id} />;
  if (!state.started) return <SectionIntro state={state} audio={audioRef.current} onStart={() => { void start(); }} busy={busy} />;
  return <SectionPlayer key={state.section} state={state} audio={state.section === 'listening' ? audioRef.current : null} onClosed={setState} />;
};

export default IeltsMockTest;
