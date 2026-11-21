// Diagnostic Bible 2.7.0 section 10.12; Visual & UX Bible 13.11. A student takes a Speaking practice
// mock alone with a recorded examiner. One action per screen; every answer is kept on the device until
// the server has it; the server keeps the order and the Part 2 minute. The examiner never comments.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../../services/supabaseClient";
import {
  beginAnswer,
  finishMock,
  loadExaminerAudio,
  localAnswers,
  mockHome,
  mockSitting,
  MockError,
  requestJoin,
  saveChecks,
  sendAnswer,
  startMock,
  startPreparation,
  requestReplay,
  type LocalMockAnswer,
  type MockHome,
  type MockLine,
  type MockSitting,
} from "../../../services/ieltsSpeakingMockService";
import {
  clock,
  levelDb,
  partEndingAt,
  PART_NAMES,
  preparationLeft,
  resumePoint,
  roomVerdict,
  sortedLines,
  voiceVerdict,
} from "../../lib/speakingMockFlow";
import { IeltsButton, IeltsNotice } from "../../components/ielts/IeltsUi";
import "../../styles/ielts-speaking-mock.css";

type Screen =
  | "loading" | "list" | "intro" | "consent" | "voice" | "audio" | "sound" | "room" | "mic"
  | "test" | "saving" | "done" | "error";
type Phase = "listen" | "record" | "prepare" | "waiting";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newId = () => crypto.randomUUID();

export default function IeltsSpeakingMock() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("loading");
  const [home, setHome] = useState<MockHome | null>(null);
  const [sitting, setSitting] = useState<MockSitting | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("listen");
  const [left, setLeft] = useState(0);
  const [pending, setPending] = useState(0);
  const [roomResult, setRoomResult] = useState<"" | "checking" | "noisy" | "quiet">("");
  const [micResult, setMicResult] = useState<"" | "recording" | "too_quiet" | "ok">("");
  const [micUrl, setMicUrl] = useState("");
  const [canFinish, setCanFinish] = useState(false);

  const owner = useRef("");
  const sessionId = useRef("");
  const voiceAnswer = useRef<boolean | null>(null);
  const audioUrls = useRef<Record<string, string>>({});
  const player = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const current = useRef<LocalMockAnswer | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const offset = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const replayRef = useRef<() => void>(() => {});
  const mounted = useRef(true);
  const inTest = screen === "test" || screen === "mic" || screen === "room";

  const lines = sitting ? sortedLines(sitting) : [];
  const line: MockLine | undefined = lines[index];

  const remember = (s: MockSitting) => {
    offset.current = Date.parse(s.server_now) - Date.now();
    setSitting(s);
  };

  // ---- Upload queue: one answer at a time, retried until the server has it ----------------
  const enqueue = useCallback((a: LocalMockAnswer) => {
    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      for (let attempt = 0; mounted.current; attempt++) {
        try {
          remember(await sendAnswer(a, a.maxSeconds ?? 120));
          break;
        } catch {
          await wait(Math.min(15000, 3000 + attempt * 2000));
        }
      }
      setPending((n) => n - 1);
    });
  }, []);

  /** Retries a server step while the connection is down; the student sees "Waiting for connection". */
  async function untilOnline<T>(step: () => Promise<T>, onWait?: () => void): Promise<T> {
    for (;;) {
      try {
        return await step();
      } catch (e) {
        if (e instanceof MockError && e.code !== "offline") throw e;
        onWait?.();
        await wait(3000);
      }
    }
  }

  // ---- Loading and resume ------------------------------------------------------------------
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        owner.current = data.user?.id ?? "";
        const h = await mockHome();
        setHome(h);
        if (!h.available) return setScreen("list");
        if (!assignmentId) return setScreen("list");
        const mine = h.mocks?.find((m) => m.assignment_id === assignmentId);
        if (!mine) return setScreen("list");
        if (!mine.session_id) return setScreen("intro");
        sessionId.current = mine.session_id;
        const s = await mockSitting(mine.session_id);
        remember(s);
        await recoverAnswers(s);
        const r = resumePoint(s);
        if (r.kind === "done") return setScreen("done");
        if (r.kind === "saving") return void saveAndFinish(s, true);
        setScreen("audio");
      } catch {
        setMessage("We could not open the mock. Check your connection and try again.");
        setScreen("error");
      }
    })();
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  async function recoverAnswers(s: MockSitting) {
    const local = (await localAnswers("list")).filter((a) => a.sessionId === s.session_id && a.ownerId === owner.current);
    const known = new Set(local.map((a) => a.id));
    const limit = (key: string) => s.lines.find((l) => l.key === key)?.answer_seconds ?? 120;
    for (const a of local) enqueue({ ...a, maxSeconds: a.maxSeconds ?? limit(a.lineKey), interrupted: a.interrupted || !a.complete });
    // Started on the server but nothing survived on this device: recorded as lost, never invented.
    for (const a of s.answers.filter((x) => !x.uploaded && !x.missing && !known.has(x.id)))
      enqueue({ id: a.id, sessionId: s.session_id, ownerId: owner.current, lineKey: a.line_key, chunks: [], complete: false, interrupted: true, maxSeconds: limit(a.line_key) });
  }

  // Keep the screen on and warn before leaving during the test.
  useEffect(() => {
    if (!inTest) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => { window.removeEventListener("beforeunload", warn); void lock?.release(); };
  }, [inTest]);

  // ---- Start ----------------------------------------------------------------------------------
  async function start() {
    if (!home?.recording_wording || !assignmentId) return;
    setBusy(true);
    setMessage("");
    try {
      const id = sessionId.current || newId();
      sessionId.current = id;
      const s = await startMock(assignmentId, id, home.recording_wording.version,
        home.voice_wording ? { answer: voiceAnswer.current === true, wording: home.voice_wording.version } : null);
      remember(s);
      setScreen("audio");
    } catch (e) {
      setMessage(e instanceof MockError && e.code === "speaking_mock_assignment_cancelled"
        ? "Your teacher has cancelled this mock." : "We could not start the mock. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Load every examiner line once, before the sound check.
  useEffect(() => {
    if (screen !== "audio" || !sitting) return;
    let cancelled = false;
    (async () => {
      try {
        audioUrls.current = await untilOnline(() => loadExaminerAudio(sortedLines(sitting)), () => setMessage("Waiting for connection…"));
        if (cancelled) return;
        setMessage("");
        player.current = player.current ?? new Audio();
        setScreen("sound");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "This mock is not ready yet.");
        setScreen("error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function play(key: string) {
    return new Promise<void>((resolve) => {
      const a = player.current ?? (player.current = new Audio());
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.src = audioUrls.current[key];
      void a.play().catch(() => resolve());
    });
  }

  // ---- Checks ---------------------------------------------------------------------------------
  async function microphone() {
    if (stream.current) return stream.current;
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
    return stream.current;
  }
  async function measure(seconds: number) {
    const s = await microphone();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(s).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let total = 0, n = 0, peak = -100;
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      analyser.getFloatTimeDomainData(buf);
      const l = levelDb(buf);
      total += l.average; n++; peak = Math.max(peak, l.peak);
      await wait(100);
    }
    await ctx.close();
    return { average: total / Math.max(1, n), peak };
  }
  async function checkRoom() {
    setRoomResult("checking");
    try {
      const { average } = await measure(5);
      setRoomResult(roomVerdict(average));
    } catch {
      setRoomResult("");
      setMessage("We need your microphone. Allow the microphone in your browser, then try again.");
    }
  }
  async function checkMic() {
    setMessage("");
    setMicResult("recording");
    try {
      const s = await microphone();
      const chunks: Blob[] = [];
      const r = new MediaRecorder(s);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((res) => (r.onstop = () => res()));
      r.start();
      const level = measure(4);
      const { peak } = await level;
      r.stop();
      await done;
      if (micUrl) URL.revokeObjectURL(micUrl);
      setMicUrl(URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type || "audio/webm" })));
      setMicResult(voiceVerdict(peak));
    } catch {
      setMicResult("");
      setMessage("We need your microphone. Allow the microphone in your browser, then try again.");
    }
  }
  async function checksPassed() {
    setBusy(true);
    try {
      const s = await untilOnline(() => saveChecks(sessionId.current, { sound: true, room: true, microphone: true }), () => setMessage("Waiting for connection…"));
      setMessage("");
      remember(s);
      const r = resumePoint(s);
      if (r.kind === "play" || r.kind === "closing") runFrom(s, r.index, "listen");
      else if (r.kind === "preparing") runFrom(s, r.index, "prepare");
      else void saveAndFinish(s, false);
    } finally {
      setBusy(false);
    }
  }

  // ---- The test -------------------------------------------------------------------------------
  function runFrom(s: MockSitting, i: number, p: Phase) {
    setScreen("test");
    setIndex(i);
    setPhase(p);
    void step(s, i, p);
  }

  async function step(s: MockSitting, i: number, p: Phase) {
    const all = sortedLines(s);
    const l = all[i];
    if (!l) return void saveAndFinish(s, false);
    if (p === "listen") {
      await play(l.key);
      if (l.kind === "question" || l.kind === "long_turn") return void record(s, i);
      if (l.kind === "prepare") {
        const prepared = await untilOnline(() => startPreparation(s.session_id), () => setPhase("waiting"));
        remember(prepared);
        setPhase("prepare");
        return void prepare(prepared, i);
      }
      return void advance(s, i);
    }
    if (p === "prepare") return void prepare(s, i);
  }

  function advance(s: MockSitting, i: number) {
    const all = sortedLines(s);
    if (partEndingAt(all, i)) void queue.current.then(() => requestJoin(s.session_id));
    if (i + 1 >= all.length) return void saveAndFinish(s, false);
    setIndex(i + 1);
    setPhase("listen");
    void step(s, i + 1, "listen");
  }

  function prepare(s: MockSitting, i: number) {
    setPhase("prepare");
    const tick = () => {
      const remaining = preparationLeft(s.preparation_started_at, offset.current);
      setLeft(remaining);
      if (remaining <= 0) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        // One extra second so the server's minute has certainly passed.
        void wait(1000).then(() => advance(s, i));
      }
    };
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(tick, 250);
    tick();
  }

  async function record(s: MockSitting, i: number) {
    const l = sortedLines(s)[i];
    const id = newId();
    setPhase("waiting");
    let started: MockSitting;
    try {
      started = await untilOnline(() => beginAnswer(s.session_id, l.key, id), () => setPhase("waiting"));
    } catch (e) {
      // The minute is not over yet on the server: wait briefly and try again.
      if (e instanceof MockError && e.code === "speaking_preparation_required") { await wait(1500); return void record(s, i); }
      setMessage("Something went wrong. Please reload the page; your answers are safe.");
      return;
    }
    remember(started);
    const limit = l.answer_seconds ?? 30;
    const a: LocalMockAnswer = { id, sessionId: s.session_id, ownerId: owner.current, lineKey: l.key, chunks: [], complete: false, interrupted: false, maxSeconds: limit };
    current.current = a;
    await localAnswers("put", a);
    const r = new MediaRecorder(await microphone());
    recorder.current = r;
    r.ondataavailable = (e) => {
      if (!e.data.size || current.current?.id !== a.id) return;
      a.chunks.push(e.data);
      void localAnswers("put", a);
    };
    const stopped = new Promise<void>((res) => (r.onstop = () => res()));
    r.start(1000);
    setPhase("record");
    setCanFinish(false);
    let elapsed = 0, paused = false;
    setLeft(limit);
    const done = new Promise<void>((resolve) => {
      finishRef.current = resolve;
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        if (paused) return;
        elapsed += 0.25;
        setLeft(limit - elapsed);
        if (elapsed >= 3) setCanFinish(true);
        if (elapsed >= limit) resolve();
      }, 250);
    });
    replayRef.current = async () => {
      try {
        remember(await requestReplay(s.session_id, l.key));
      } catch {
        return;
      }
      paused = true;
      r.pause();
      await play(l.key);
      r.resume();
      paused = false;
    };
    await done;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    r.stop();
    await stopped;
    a.complete = true;
    await localAnswers("put", a);
    current.current = null;
    enqueue(a);
    advance(started, i);
  }

  async function saveAndFinish(s: MockSitting, alreadyFinished: boolean) {
    setScreen("saving");
    await queue.current;
    if (!alreadyFinished) {
      const f = await untilOnline(() => finishMock(s.session_id), () => setMessage("Waiting for connection…"));
      remember(f);
    }
    setMessage("");
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    for (let i = 0; i < 3; i++) {
      const j = await requestJoin(s.session_id);
      if (j?.submitted || j?.blocked) break;
      await wait(3000);
    }
    setScreen("done");
  }

  // ---- Screens --------------------------------------------------------------------------------
  const shell = (body: React.ReactNode, label = "") => (
    <main className="sm-page" aria-labelledby="sm-title">
      <header className="sm-header">
        <p className="sm-labels"><span>Speaking practice mock</span><span>Recorded examiner</span><span>Not an official IELTS test</span></p>
        {label && <p className="sm-part">{label}</p>}
      </header>
      <section className="sm-card">{body}</section>
      {pending > 0 && screen === "test" && <p className="sm-sync" role="status">Saving {pending} {pending === 1 ? "answer" : "answers"}…</p>}
    </main>
  );

  if (screen === "loading") return shell(<><h1 id="sm-title">Opening your mock…</h1><p className="sm-wait" role="status">Please wait.</p></>);
  if (screen === "error") return shell(<><h1 id="sm-title">We could not continue</h1><IeltsNotice error>{message}</IeltsNotice>
    <IeltsButton variant="primary" className="sm-main" onClick={() => window.location.reload()}>Try again</IeltsButton></>);

  if (screen === "list") {
    const mocks = home?.mocks ?? [];
    return shell(<>
      <h1 id="sm-title">Speaking practice mocks</h1>
      {mocks.length === 0 ? <p>Your teacher has not given you a Speaking practice mock yet.</p> :
        <ul className="sm-list">{mocks.map((m) => (
          <li key={m.assignment_id}>
            <span><strong>{m.title}</strong><br /><span className="sm-meta">{m.state === "ready" ? "Ready to start" : m.state === "in_progress" ? "Started — you can continue" : m.state === "finished" ? "Finished — your teacher will check it" : "Checked by your teacher"}</span></span>
            {(m.state === "ready" || m.state === "in_progress") && <IeltsButton variant="primary" onClick={() => navigate(`/ielts/speaking-mock/${m.assignment_id}`)}>{m.state === "ready" ? "Start" : "Continue"}</IeltsButton>}
            {m.state === "reviewed" && m.session_id && <IeltsButton onClick={() => navigate(`/ielts/speaking-pilot/${m.session_id}`)}>See feedback</IeltsButton>}
          </li>))}</ul>}
    </>);
  }

  if (screen === "intro") return shell(<>
    <h1 id="sm-title">Before you start</h1>
    <ul className="sm-steps">
      <li>It takes about <strong>15 minutes</strong>.</li>
      <li>Find a <strong>quiet place</strong> where nobody will talk to you.</li>
      <li>Use <strong>headphones</strong> if you can.</li>
      <li>A recorded examiner asks the questions. Each question plays <strong>once</strong>.</li>
      <li>Your answers are recorded. Your teacher will listen and give you feedback later.</li>
    </ul>
    <IeltsButton variant="primary" className="sm-main" onClick={() => setScreen("consent")}>Next</IeltsButton>
  </>);

  if (screen === "consent") return shell(<>
    <h1 id="sm-title">About the recording</h1>
    <p className="sm-big">{home?.recording_wording?.body}</p>
    {message && <IeltsNotice error>{message}</IeltsNotice>}
    <IeltsButton variant="primary" className="sm-main" disabled={busy} onClick={() => (home?.voice_wording ? setScreen("voice") : void start())}>
      {busy ? "Starting…" : "I agree, continue"}</IeltsButton>
  </>);

  if (screen === "voice") return shell(<>
    <h1 id="sm-title">One more question</h1>
    <p className="sm-big">{home?.voice_wording?.body}</p>
    {message && <IeltsNotice error>{message}</IeltsNotice>}
    <div className="sm-pair">
      <IeltsButton variant="primary" disabled={busy} onClick={() => { voiceAnswer.current = true; void start(); }}>Yes</IeltsButton>
      <IeltsButton variant="primary" disabled={busy} onClick={() => { voiceAnswer.current = false; void start(); }}>No</IeltsButton>
    </div>
  </>);

  if (screen === "audio") return shell(<><h1 id="sm-title">Getting the test ready…</h1><p className="sm-wait" role="status">{message || "Loading the examiner's voice."}</p></>);

  if (screen === "sound") return shell(<>
    <h1 id="sm-title">Sound check</h1>
    <p className="sm-big">Press the button and listen to the examiner.</p>
    <div className="sm-pair">
      <IeltsButton onClick={() => void play(lines[0].key)}>Play the sound</IeltsButton>
      <IeltsButton variant="primary" onClick={() => setScreen("room")}>I can hear it</IeltsButton>
    </div>
    <p className="sm-meta">Can't hear anything? Turn up the volume or plug in your headphones, then play it again.</p>
  </>, PART_NAMES[0]);

  if (screen === "room") return shell(<>
    <h1 id="sm-title">Is your room quiet?</h1>
    <p className="sm-big">Stay silent for 5 seconds while we listen.</p>
    {roomResult === "noisy" && <IeltsNotice error>Too noisy. Find a quieter place, then check again.</IeltsNotice>}
    {roomResult === "quiet" && <IeltsNotice>Your room is quiet enough.</IeltsNotice>}
    {message && <IeltsNotice error>{message}</IeltsNotice>}
    {roomResult === "quiet"
      ? <IeltsButton variant="primary" className="sm-main" onClick={() => { setMessage(""); setScreen("mic"); }}>Next</IeltsButton>
      : <IeltsButton variant="primary" className="sm-main" disabled={roomResult === "checking"} onClick={() => { setMessage(""); void checkRoom(); }}>
          {roomResult === "checking" ? "Listening… stay silent" : roomResult === "noisy" ? "Check again" : "Start the check"}</IeltsButton>}
  </>, PART_NAMES[0]);

  if (screen === "mic") return shell(<>
    <h1 id="sm-title">Microphone check</h1>
    <p className="sm-big">Press the button and say: <q>Hello, my name is … and I am ready.</q></p>
    {micResult === "recording" && <p className="sm-rec" role="status"><span className="sm-dot" aria-hidden="true" />Recording…</p>}
    {micResult === "too_quiet" && <IeltsNotice error>We could not hear you. Move closer to the microphone and try again.</IeltsNotice>}
    {micResult === "ok" && micUrl && <><p>Listen to yourself:</p><audio className="sm-audio" controls src={micUrl} /></>}
    {message && <IeltsNotice error>{message}</IeltsNotice>}
    {micResult === "ok"
      ? <div className="sm-pair"><IeltsButton onClick={() => void checkMic()}>Try again</IeltsButton>
          <IeltsButton variant="primary" disabled={busy} onClick={() => void checksPassed()}>Sounds good — start the test</IeltsButton></div>
      : <IeltsButton variant="primary" className="sm-main" disabled={micResult === "recording"} onClick={() => void checkMic()}>
          {micResult === "recording" ? "Speak now…" : micResult === "too_quiet" ? "Try again" : "Record my voice"}</IeltsButton>}
  </>, PART_NAMES[0]);

  if (screen === "saving") return shell(<><h1 id="sm-title">Saving your answers…</h1>
    <p className="sm-wait" role="status">{message || (pending > 0 ? `${pending} still to send. Keep this page open.` : "Almost done. Keep this page open.")}</p></>);

  if (screen === "done") return shell(<>
    <h1 id="sm-title">Done</h1>
    <p className="sm-big">Your answers are saved. Your teacher will check them and share feedback with you.</p>
    <IeltsButton variant="primary" className="sm-main" onClick={() => navigate("/ielts/journey")}>Back to my journey</IeltsButton>
  </>);

  // screen === "test"
  if (!line) return shell(<p className="sm-wait" role="status">Please wait.</p>);
  const isAnswer = line.kind === "question" || line.kind === "long_turn";
  const canReplay = line.replay_allowed && !line.replayed;
  return shell(<>
    {phase === "waiting" && <><h1 id="sm-title">Waiting for connection…</h1>
      <p className="sm-wait" role="status">The next question will start when you are back online. Your answers are safe.</p></>}
    {phase === "listen" && <><h1 id="sm-title">Listen</h1>
      <p className="sm-listen" role="status"><span className="sm-speaker" aria-hidden="true">🔊</span> The examiner is speaking…</p></>}
    {phase === "prepare" && <>
      <h1 id="sm-title">Prepare your talk</h1>
      <div className="sm-cue" aria-label="Your topic">
        <p className="sm-cue-topic">{sitting?.cue_card.topic}</p>
        <p>You should say:</p>
        <ul>{sitting?.cue_card.points.map((p) => <li key={p}>{p}</li>)}</ul>
        {sitting?.cue_card.closing && <p>{sitting.cue_card.closing}</p>}
      </div>
      <p className="sm-timer" role="timer" aria-live="off">{clock(left)}</p>
      <p className="sm-meta" aria-live="polite">{left > 0 ? "Think about what you will say. You can make notes." : "Time is up."}</p>
      <label className="sm-notes">Notes (not saved)<textarea rows={4} /></label>
    </>}
    {phase === "record" && isAnswer && <>
      {line.kind === "long_turn" && <div className="sm-cue sm-cue--small"><p className="sm-cue-topic">{sitting?.cue_card.topic}</p></div>}
      <p className="sm-rec" role="status"><span className="sm-dot" aria-hidden="true" />Recording</p>
      <h1 id="sm-title" className="sm-timer">{clock(left)}</h1>
      <p className="sm-meta">{line.kind === "long_turn" ? "Talk for up to 2 minutes. The recording stops by itself." : "Answer the question. Press the button when you have finished."}</p>
      <div className="sm-pair">
        {canReplay && <IeltsButton onClick={() => replayRef.current()}>Hear the question again (once)</IeltsButton>}
        <IeltsButton variant="primary" disabled={!canFinish} onClick={() => finishRef.current()}>I've finished</IeltsButton>
      </div>
    </>}
    {message && <IeltsNotice error>{message}</IeltsNotice>}
  </>, PART_NAMES[line.part]);
}
