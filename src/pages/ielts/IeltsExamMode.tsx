import { IeltsWritingEditor } from '../../components/ielts/IeltsWritingEditor';
import { IeltsWritingResult } from '../../components/ielts/IeltsWritingResult';
import { fetchWritingScreenerResult } from '../../../services/ieltsWritingScreenerService';
import { loadIeltsSavedScreenerResult } from '../../../services/ieltsScreenerResultLoader';
import type { WritingScreenerResult } from '../../../services/ieltsWritingScreener';
import { getIeltsReadingPassages, restoreReadingPassage, saveReadingPassage } from '../../../services/ieltsReadingDelivery';
import { makeIeltsAudioCheckpointKey, saveIeltsAudioCheckpoint, restoreIeltsAudioCheckpoint } from '../../../services/ieltsAudioCheckpoint';
import { fetchIeltsDiagnosticResult, getIeltsScreenerAudio, type IeltsDiagnosticResult } from '../../../services/ieltsDiagnosticEvidenceService';
import { ieltsRequestDelay } from '../../../services/ieltsDeliveryRequestPolicy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/ielts-exam.css';
import { useParams } from 'react-router-dom';
import {
  createExamIdempotencyKey,
  rpcIeltsAutosaveAttempt,
  rpcIeltsExamWhoami,
  rpcIeltsExamStatus,
  rpcIeltsLogIncident,
  rpcIeltsStartAttempt,
  rpcIeltsSubmitAttempt,
  type IeltsExamPublicFormPayload,
  type IeltsExamSection,
  type IeltsExamWhoamiResponse,
  type IeltsStartAttemptResponse,
  type IeltsSubmitResponse,
} from '../../../services/ieltsExamModeService';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import {
  extractIeltsQuestions,
  getIeltsSectionInstructions,
  getIeltsSectionTitle,
  type RenderableExamQuestion,
} from '../../../services/ieltsExamPayloadParser';
import {
  canStartIeltsExamAttempt,
  getIeltsAttemptTimeMessage,
  formatIeltsCountdown,
  getIeltsStudentExamSyncMessage,
  isIeltsSubmittedAttemptStatus,
  isIeltsVoidedAttemptStatus,
  resolveIeltsExamLifecycleMeta,
  resolveIeltsStudentExamSyncState,
  shouldIeltsAutosaveRun,
  type IeltsStudentExamSyncState,
} from '../../../services/ieltsExamModeUx';

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type AnswersBySection = Record<string, Record<string, string>>;

type RenderableQuestion = RenderableExamQuestion;

const SECTIONS: Array<{ id: IeltsExamSection; label: string }> = [
  { id: 'reading', label: 'Reading' },
  { id: 'listening', label: 'Listening' },
  { id: 'writing', label: 'Writing' },
  { id: 'speaking', label: 'Speaking' },
];

const emptyAnswers = (): AnswersBySection => ({
  reading: {},
  listening: {},
  writing: {},
  speaking: {},
});

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getPayloadForSection = (form: IeltsExamPublicFormPayload | null | undefined, section: string): unknown => {
  if (!form) return null;
  return form[`${section}_payload`];
};

const toMillis = (iso?: string | null): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatRemaining = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatLocalDateTime = (value?: string | null): string => {
  if (!value) return 'not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not set';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const availabilityMessage = (whoami: IeltsExamWhoamiResponse | null): string => {
  if (whoami?.reason === 'form_unavailable') return 'No active exam form is available yet. Please wait for your teacher to finish setup.';
  if (whoami?.reason === 'not_assigned') return 'You are not assigned to this exam. Ask your teacher to check the assignment list.';
  if (whoami?.reason === 'exam_not_available') return 'Exam not live yet or temporarily unavailable. Please wait for your teacher.';
  return `Reason: ${whoami?.reason ?? 'unknown'}. Please contact your teacher if this looks wrong.`;
};

const makeLocalDraftKey = (attemptId: string) => `ielts_exam_local_draft_${attemptId}`;

const readLocalDraft = (attemptId: string): AnswersBySection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(makeLocalDraftKey(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isObject(parsed) ? (parsed as AnswersBySection) : null;
  } catch {
    return null;
  }
};

const writeLocalDraft = (attemptId: string | null, answers: AnswersBySection) => {
  if (!attemptId || typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(makeLocalDraftKey(attemptId), JSON.stringify(answers));
    return true;
  } catch { return false; }
};

const stateTitleFor = (whoami: IeltsExamWhoamiResponse | null): string => {
  if (!whoami) return 'Checking exam access…';
  if (whoami.reason === 'not_assigned') return 'You are not assigned to this IELTS exam.';
  if (whoami.reason === 'exam_not_available') return 'This IELTS exam is not currently available.';
  if (whoami.reason === 'exam_not_found') return 'IELTS exam not found.';
  if (whoami.status === 'submitted' || whoami.status === 'auto_submitted') return 'Your exam has already been submitted.';
  if (whoami.status === 'in_progress') return 'Resume your IELTS exam.';
  return 'You are allowed to start this IELTS exam.';
};

const IeltsExamMode: React.FC = () => {
  const { examEventId } = useParams<{ examEventId: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [writingResult, setWritingResult] = useState<WritingScreenerResult | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<IeltsDiagnosticResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [resultRetry, setResultRetry] = useState(0);
  const [whoami, setWhoami] = useState<IeltsExamWhoamiResponse | null>(null);
  const [attempt, setAttempt] = useState<IeltsStartAttemptResponse | null>(null);
  const [lockToken, setLockToken] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<IeltsExamSection>('reading');
  const [answers, setAnswers] = useState<AnswersBySection>(() => emptyAnswers());
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('No changes yet');
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [localDraftSaved, setLocalDraftSaved] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<IeltsSubmitResponse | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [syncState, setSyncState] = useState<IeltsStudentExamSyncState>('active');
  const [teacherActionMessage, setTeacherActionMessage] = useState<string | null>(null);

  const screenerAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCheckpointRestoredRef = useRef(false);
  const [audioResumePosition, setAudioResumePosition] = useState(0);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [audioCheckpointUnavailable, setAudioCheckpointUnavailable] = useState(false);
  const audioSource = getIeltsScreenerAudio(getPayloadForSection(whoami?.form_public_payload, activeSection));
  const audioAttemptId = attempt?.attempt_id ?? whoami?.attempt_id;
  const audioCheckpointKey = audioAttemptId && audioSource ? makeIeltsAudioCheckpointKey(audioAttemptId, audioSource) : null;

  const checkpointAudio = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio || !audioCheckpointKey || !audioCheckpointRestoredRef.current) return;
    const saved = saveIeltsAudioCheckpoint(audioCheckpointKey, audio.currentTime);
    if (!saved) setAudioCheckpointUnavailable(true);
  }, [audioCheckpointKey]);

  const attachScreenerAudio = useCallback((audio: HTMLAudioElement | null) => {
    const previous = screenerAudioRef.current;
    if (previous && previous !== audio) {
      checkpointAudio(previous);
      previous.pause();
    }
    screenerAudioRef.current = audio;
    audioCheckpointRestoredRef.current = false;
  }, [checkpointAudio]);

  const restoreAudioPosition = useCallback((audio: HTMLAudioElement) => {
    if (!audioCheckpointKey || audioCheckpointRestoredRef.current) return;
    if (restoreIeltsAudioCheckpoint(audio, audioCheckpointKey)) {
      audioCheckpointRestoredRef.current = true;
      setAudioResumePosition(audio.currentTime);
    }
  }, [audioCheckpointKey]);

  const pauseScreenerAudio = useCallback(() => {
    const audio = screenerAudioRef.current;
    checkpointAudio(audio);
    if (audio) {
      audio.pause();
      setAudioResumePosition(audio.currentTime);
    }
  }, [checkpointAudio]);
  const audioBufferTimerRef = useRef<number | null>(null);
  const audioBufferStartedAtRef = useRef<number | null>(null);
  const recentIncidentRef = useRef<Record<string, number>>({});
  useEffect(() => { if (submission || syncState !== 'active') screenerAudioRef.current?.pause(); }, [submission, syncState]);
  useEffect(() => () => {
    if (audioBufferTimerRef.current !== null) window.clearTimeout(audioBufferTimerRef.current);
  }, []);
  const answersRef = useRef(answers);
  const activeSectionRef = useRef<IeltsExamSection>(activeSection);
  const attemptRef = useRef<IeltsStartAttemptResponse | null>(attempt);
  const lockTokenRef = useRef<string | null>(lockToken);
  const saveInFlightRef = useRef(false);
  const serverOffsetRef = useRef(serverOffsetMs);
  serverOffsetRef.current = serverOffsetMs;
  const statusInFlightRef = useRef(false);
  const statusFailuresRef = useRef(0);
  const statusRetryAtRef = useRef(0);
  const saveFailuresRef = useRef(0);
  const saveRetryAtRef = useRef(0);
  const whoamiRef = useRef<IeltsExamWhoamiResponse | null>(null);
  const eventRef = useRef(examEventId);
  eventRef.current = examEventId;
  const dirtySectionsRef = useRef(new Set<string>());
  const draftVersionsRef = useRef<Record<string, number>>({});
  const incidentInFlightRef = useRef(false);
  const syncStateRef = useRef<IeltsStudentExamSyncState>('active');

  useEffect(() => {
    stopBackgroundMusic();
    return () => resumeBackgroundMusic();
  }, []);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
  useEffect(() => { attemptRef.current = attempt; }, [attempt]);
  useEffect(() => { lockTokenRef.current = lockToken; }, [lockToken]);
  useEffect(() => { syncStateRef.current = syncState; }, [syncState]);

  const syncServerClock = useCallback((serverNow?: string) => {
    const serverMs = toMillis(serverNow);
    if (serverMs !== null) {
      setServerOffsetMs(serverMs - Date.now());
    }
  }, []);

  const hydrateAnswers = useCallback((response: IeltsExamWhoamiResponse) => {
    const nextAnswers = emptyAnswers();
    if (Array.isArray(response.drafts)) {
      for (const draft of response.drafts) {
        if (isObject(draft.payload)) {
          nextAnswers[draft.section] = draft.payload as Record<string, string>;
        }
      }
    }

    const serverAnswers = JSON.parse(JSON.stringify(nextAnswers)) as typeof nextAnswers;
    if (response.attempt_id) {
      const localDraft = readLocalDraft(response.attempt_id);
      if (localDraft) {
        for (const section of Object.keys(localDraft)) {
          nextAnswers[section] = { ...nextAnswers[section], ...localDraft[section] };
        }
      }
    }
    answersRef.current = nextAnswers;
    dirtySectionsRef.current = new Set(Object.keys(nextAnswers).filter(section =>
      JSON.stringify(nextAnswers[section]) !== JSON.stringify(serverAnswers[section])));
    setAnswers(nextAnswers);
    draftVersionsRef.current = Object.fromEntries((response.drafts ?? []).map((draft) => [draft.section, draft.draft_version ?? 0]));
  }, []);

  const applyWhoamiState = useCallback((response: IeltsExamWhoamiResponse, options: { hydrateDrafts: boolean } = { hydrateDrafts: false }) => {
    whoamiRef.current = response;
    setWhoami(response);
    syncServerClock(response.server_now);
    setRemainingSeconds(response.remaining_seconds ?? 0);
    if (options.hydrateDrafts) {
      hydrateAnswers(response);
    }

    const attemptStatus = response.attempt_status ?? response.status;
    const eventStatus = response.event_status ?? (!response.attempt_id ? response.status : null);
    const previousSyncState = syncStateRef.current;
    const resolvedState = resolveIeltsStudentExamSyncState(attemptStatus, eventStatus, response.reason);
    const nextSyncState = !response.allowed && resolvedState === 'active' ? 'not_in_progress' : resolvedState;
    const syncMessage = getIeltsStudentExamSyncMessage(nextSyncState);
    syncStateRef.current = nextSyncState;
    setSyncState(nextSyncState);
    setTeacherActionMessage(syncMessage);

    if (nextSyncState !== 'active') {
      setSaveState('saved');
      setSaveMessage(syncMessage ?? 'Exam state updated by teacher.');
    } else if (previousSyncState === 'paused') {
      setSaveState('idle');
      setSaveMessage('Exam resumed by teacher. Autosave is active.');
    }

    if (isIeltsSubmittedAttemptStatus(attemptStatus)) {
      setSubmission((current) => current?.attempt_id === response.attempt_id ? current : {
        submission_id: 'server-sync',
        attempt_id: response.attempt_id ?? 'unknown',
        status: attemptStatus ?? 'submitted',
        submitted_at: response.server_now ?? response.ends_at ?? '',
        idempotent_replay: true,
      });
      setAttempt((current) => (current ? { ...current, status: attemptStatus ?? current.status } : current));
      setLockToken(null);
      if (typeof window !== 'undefined' && response.attempt_id) {
        window.sessionStorage.removeItem(`ielts_exam_lock_${response.attempt_id}`);
      }
    } else if (isIeltsVoidedAttemptStatus(attemptStatus, response.reason)) {
      setAttempt((current) => (current ? { ...current, status: attemptStatus ?? 'void' } : current));
      setLockToken(null);
      if (typeof window !== 'undefined' && response.attempt_id) {
        window.sessionStorage.removeItem(`ielts_exam_lock_${response.attempt_id}`);
      }
    }
  }, [hydrateAnswers, syncServerClock]);

  const refreshLiveState = useCallback(async () => {
    if (!examEventId || !navigator.onLine || !whoamiRef.current || statusInFlightRef.current
      || Date.now() < statusRetryAtRef.current) return;
    statusInFlightRef.current = true;
    const eventId = examEventId;
    try {
      const response = await rpcIeltsExamStatus(eventId);
      if (eventRef.current !== eventId) return;
      statusFailuresRef.current = 0;
      statusRetryAtRef.current = 0;
      const previous = whoamiRef.current;
      // Another tab starting a different attempt must never attach our edits to it.
      if (previous?.assignment_id && response.assignment_id && previous.assignment_id !== response.assignment_id) {
        applyWhoamiState({ ...previous, allowed: false, reason: 'not_assigned', server_now: response.server_now });
      } else if (response.allowed && !previous?.form_public_payload) {
        // Content is fetched once when a previously unavailable event becomes live.
        const full = await rpcIeltsExamWhoami(eventId);
        if (eventRef.current === eventId) applyWhoamiState(full, { hydrateDrafts: true });
      } else {
        applyWhoamiState({ ...response, form_public_payload: previous?.form_public_payload });
      }
    } catch (refreshError) {
      if (eventRef.current !== eventId) return;
      statusRetryAtRef.current = Date.now() + ieltsRequestDelay('status', ++statusFailuresRef.current);
      // Autosave owns connectivity feedback, avoiding a second interruption banner.
      setSaveState('error');
      setSaveMessage('Connection interrupted. Keep this page open; saving will retry automatically.');
    } finally {
      statusInFlightRef.current = false;
    }
  }, [applyWhoamiState, examEventId]);

  const loadWhoami = useCallback(async () => {
    if (!examEventId) return;
    setLoadState('loading');
    setError(null);
    try {
      const response = await rpcIeltsExamWhoami(examEventId);
      if (eventRef.current !== examEventId) return;
      if (whoamiRef.current?.assignment_id && whoamiRef.current.assignment_id !== response.assignment_id) {
        setAttempt(null);
        setLockToken(null);
      }
      applyWhoamiState(response, { hydrateDrafts: true });
      setLoadState('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load IELTS exam.');
      setLoadState('error');
    }
  }, [applyWhoamiState, examEventId]);

  useEffect(() => {
    void loadWhoami();
  }, [loadWhoami]);

  useEffect(() => {
    if (loadState !== 'ready' || syncState === 'submitted' || syncState === 'voided') return undefined;
    let timer: number;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== 'hidden') await refreshLiveState();
      if (!stopped) timer = window.setTimeout(poll, ieltsRequestDelay('status', statusFailuresRef.current));
    };
    timer = window.setTimeout(poll, ieltsRequestDelay('status'));
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [loadState, refreshLiveState, syncState]);

  useEffect(() => {
    let timer: number | undefined;
    const onFocusOrVisible = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== 'hidden') {
        timer = window.setTimeout(() => void refreshLiveState(), ieltsRequestDelay('recovery'));
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [refreshLiveState]);

  const writingPayload = getPayloadForSection(whoami?.form_public_payload, 'writing');
  const isWritingScreener = isObject(writingPayload) && writingPayload.task_type === 'academic_task2' && writingPayload.assessment_mode === 'screener';
  const resultAttemptId = submission?.attempt_id ?? whoami?.attempt_id ?? attempt?.attempt_id;
  const resultSubmitted = Boolean(submission) || ['submitted', 'auto_submitted'].includes(whoami?.status ?? '');
  useEffect(() => {
    if (!resultAttemptId || !resultSubmitted) return;
    let active = true;
    setDiagnosticError('');
    setDiagnosticResult(null);
    setWritingResult(null);
    loadIeltsSavedScreenerResult(resultAttemptId, fetchWritingScreenerResult, fetchIeltsDiagnosticResult).then((value) => {
      if (!active) return;
      if (value?.kind === 'writing') setWritingResult(value.result);
      else if (value?.kind === 'objective') setDiagnosticResult(value.result);
    })
      .catch((reason) => { if (active) setDiagnosticError(reason instanceof Error ? reason.message : 'Your answers are saved. Please retry loading the result.'); });
    return () => { active = false; };
  }, [resultAttemptId, resultSubmitted, resultRetry]);

  const formPayload = whoami?.form_public_payload ?? null;
  const availableSections = useMemo(() => (
    SECTIONS.filter((section) => {
      const payload = getPayloadForSection(formPayload, section.id);
      return payload !== null && payload !== undefined && (!isObject(payload) || Object.keys(payload).length > 0);
    })
  ), [formPayload]);

  useEffect(() => {
    if (availableSections.length > 0 && !availableSections.some((section) => section.id === activeSection)) {
      setActiveSection(availableSections[0].id);
    }
  }, [activeSection, availableSections]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
      if (syncStateRef.current === 'paused') return;
      const endMs = toMillis(attemptRef.current?.ends_at ?? whoami?.ends_at);
      if (endMs === null) return;
      const serverNowMs = Date.now() + serverOffsetMs;
      setRemainingSeconds(Math.max(0, Math.floor((endMs - serverNowMs) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [serverOffsetMs, whoami?.ends_at]);

  useEffect(() => {
    setLocalDraftSaved(writeLocalDraft(attempt?.attempt_id ?? whoami?.attempt_id ?? null, answers));
  }, [answers, attempt?.attempt_id, whoami?.attempt_id]);

  const startOrResume = useCallback(async () => {
    if (isStarting || !whoami?.assignment_id) return;
    setIsStarting(true);
    setError(null);
    try {
      const response = await rpcIeltsStartAttempt(whoami.assignment_id);
      setAttempt(response);
      setLockToken(response.lock_token);
      syncServerClock(response.server_now);
      setRemainingSeconds(response.remaining_seconds);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(`ielts_exam_lock_${response.attempt_id}`, response.lock_token);
      }
      setSaveMessage(whoami.attempt_id ? 'Resumed from server attempt.' : 'Exam started.');
    } catch (startError) {
      const backendReason = startError instanceof Error ? startError.message : 'Failed to start IELTS exam.';
      setError(/expired/i.test(backendReason) ? 'Your time has ended. Check again to load your saved result.' : 'Your assessment could not open. Check your connection and try again.');
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, syncServerClock, whoami]);

  useEffect(() => {
    if (!whoami?.attempt_id || lockToken) return;
    const cached = typeof window !== 'undefined' ? window.sessionStorage.getItem(`ielts_exam_lock_${whoami.attempt_id}`) : null;
    if (cached) {
      setLockToken(cached);
    }
  }, [lockToken, whoami?.attempt_id]);

  const autosaveSection = useCallback(async (section: string, reason: string): Promise<boolean> => {
    const currentAttempt = attemptRef.current;
    const currentLockToken = lockTokenRef.current;
    if (!currentAttempt?.attempt_id || !currentLockToken || submission) return false;
    if (!shouldIeltsAutosaveRun(syncStateRef.current)) {
      const syncMessage = getIeltsStudentExamSyncMessage(syncStateRef.current);
      setSaveState('saved');
      setSaveMessage(syncMessage ?? 'Autosave paused because the exam is not active.');
      return false;
    }
    if (!dirtySectionsRef.current.has(section)) return true;
    if (reason === 'auto' && Date.now() < saveRetryAtRef.current) return false;
    if (saveInFlightRef.current || !navigator.onLine) return false;

    const payload = answersRef.current[section] ?? {};
    const nextVersion = (draftVersionsRef.current[section] ?? 0) + 1;
    saveInFlightRef.current = true;
    setSaveState('saving');
    setSaveMessage(`Saving ${section}…`);
    try {
      const response = await rpcIeltsAutosaveAttempt({
        attemptId: currentAttempt.attempt_id,
        lockToken: currentLockToken,
        section,
        payload,
        draftVersion: nextVersion,
        clientSavedAt: new Date(Date.now() + serverOffsetRef.current).toISOString(),
      });
      saveFailuresRef.current = 0;
      saveRetryAtRef.current = 0;
      syncServerClock(response.server_now);
      draftVersionsRef.current[section] = Math.max(draftVersionsRef.current[section] ?? 0, response.draft_version ?? nextVersion);
      if (answersRef.current[section] === payload) dirtySectionsRef.current.delete(section);
      const pending = dirtySectionsRef.current.size > 0;
      setSaveState(pending ? 'idle' : 'saved');
      setSaveMessage(pending ? 'Saving your latest changes…' : 'All answers saved.');
      return true;
    } catch (saveError) {
      saveRetryAtRef.current = Date.now() + ieltsRequestDelay('save', ++saveFailuresRef.current);
      const message = saveError instanceof Error ? saveError.message : 'Autosave failed.';
      if (/attempt_not_in_progress|assignment_void|exam_paused/i.test(message)) {
        await refreshLiveState();
        setSaveState('saved');
        setSaveMessage(getIeltsStudentExamSyncMessage(syncStateRef.current) ?? 'Autosave stopped because the exam state changed.');
      } else {
        setSaveState('error');
        setSaveMessage('Your latest changes could not save. Keep this page open; we will retry.');
      }
      return false;
    } finally {
      saveInFlightRef.current = false;
    }
  }, [refreshLiveState, submission, syncServerClock]);

  const savePendingSections = useCallback(async () => {
    const sections = [...dirtySectionsRef.current];
    for (const section of sections) {
      if (!await autosaveSection(section, 'auto')) break;
    }
  }, [autosaveSection]);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      setWarning(null);
      setLocalDraftSaved(writeLocalDraft(attemptRef.current?.attempt_id ?? null, answersRef.current));
    };
    let recoveryTimer: number | undefined;
    const onOnline = () => {
      setOffline(false);
      setSaveMessage('Back online. Checking your saved answers…');
      window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(() => {
        void savePendingSections();
        void refreshLiveState();
      }, ieltsRequestDelay('recovery'));
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    let timer: number;
    let stopped = false;
    const save = async () => {
      await savePendingSections();
      if (!stopped) timer = window.setTimeout(save, ieltsRequestDelay('save', saveFailuresRef.current));
    };
    timer = window.setTimeout(save, ieltsRequestDelay('save'));

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(recoveryTimer);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshLiveState, savePendingSections]);

  const logIncident = useCallback(async (incidentType: string, severity: 'info' | 'warning', payload: Record<string, unknown>) => {
    const currentAttempt = attemptRef.current;
    const currentLockToken = lockTokenRef.current;
    if (!currentAttempt?.attempt_id || !currentLockToken) return;
    const now = Date.now();
    const dedupeKey = incidentType === 'window_blur' || incidentType === 'tab_hidden' ? 'backgrounding' : incidentType;
    if (now - (recentIncidentRef.current[dedupeKey] ?? 0) < 2000 || incidentInFlightRef.current) return;
    recentIncidentRef.current[dedupeKey] = now;
    incidentInFlightRef.current = true;
    // Record interruptions for audit without adding redundant student alerts.
    try {
      await rpcIeltsLogIncident({
        attemptId: currentAttempt.attempt_id,
        lockToken: currentLockToken,
        incidentType,
        severity,
        payload: {
          ...payload,
          active_section: activeSectionRef.current,
          client_logged_at: new Date(Date.now() + serverOffsetRef.current).toISOString(),
        },
      });
    } catch {
      // Incident logging should never block the exam; the reconnect banner/autosave will surface connectivity trouble.
    } finally {
      window.setTimeout(() => { incidentInFlightRef.current = false; }, 750);
    }
  }, [serverOffsetMs]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseScreenerAudio();
        void autosaveSection(activeSectionRef.current, 'tab hidden');
        void logIncident('tab_hidden', 'info', { visibility_state: document.visibilityState, audio_paused: true });
      }
    };
    const onWindowBlur = () => {
      pauseScreenerAudio();
      void autosaveSection(activeSectionRef.current, 'window blur');
      void logIncident('window_blur', 'info', { audio_paused: true });
    };
    const onPaste = (event: ClipboardEvent) => {
      void logIncident('paste_attempt', 'warning', { target: (event.target as HTMLElement | null)?.tagName ?? 'unknown' });
    };
    const onCopy = (event: ClipboardEvent) => {
      void logIncident('copy_attempt', 'warning', { target: (event.target as HTMLElement | null)?.tagName ?? 'unknown' });
    };
    const onContextMenu = (event: MouseEvent) => {
      void logIncident('context_menu', 'info', { x: event.clientX, y: event.clientY });
    };
    const onBeforeUnload = () => {
      pauseScreenerAudio();
      void logIncident('navigation_away', 'warning', {});
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('paste', onPaste);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', pauseScreenerAudio);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', pauseScreenerAudio);
    };
  }, [autosaveSection, logIncident, pauseScreenerAudio]);

  const handleSectionChange = async (section: IeltsExamSection) => {
    if (section === activeSection || !shouldIeltsAutosaveRun(syncStateRef.current)) return;
    pauseScreenerAudio();
    await autosaveSection(activeSection, 'section change');
    setActiveSection(section);
  };

  const handleAnswerChange = (section: string, questionId: string, value: string) => {
    if (!shouldIeltsAutosaveRun(syncStateRef.current)) return;
    const next = { ...answersRef.current, [section]: { ...answersRef.current[section], [questionId]: value } };
    answersRef.current = next;
    dirtySectionsRef.current.add(section);
    setLocalDraftSaved(writeLocalDraft(attemptRef.current?.attempt_id ?? whoami?.attempt_id ?? null, next));
    setAnswers(next);
    setSaveState('idle');
    setSaveMessage('Unsaved changes');
  };

  const handleSubmit = async () => {
    const currentAttempt = attemptRef.current;
    const currentLockToken = lockTokenRef.current;
    if (!currentAttempt?.attempt_id || !currentLockToken || isSubmitting || submission || !shouldIeltsAutosaveRun(syncStateRef.current)) return;
    pauseScreenerAudio();
    setIsSubmitting(true);
    setError(null);
    try {
      await autosaveSection(activeSectionRef.current, 'before submit');
      const response = await rpcIeltsSubmitAttempt({
        attemptId: currentAttempt.attempt_id,
        lockToken: currentLockToken,
        payload: answersRef.current,
        idempotencyKey: createExamIdempotencyKey(currentAttempt.attempt_id),
      });
      setSubmission(response);
      setSaveState('saved');
      setSaveMessage('Final submission received.');
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(`ielts_exam_lock_${currentAttempt.attempt_id}`);
      }
    } catch (submitError) {
      setError('Your submission could not be confirmed. Keep this page open, check your connection and submit again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activePayload = getPayloadForSection(formPayload, activeSection);
  const isScreener = availableSections.some((section) => {
    const payload = getPayloadForSection(formPayload, section.id);
    return isObject(payload) && payload.assessment_mode === 'screener';
  });
  const activeQuestions = useMemo(() => extractIeltsQuestions(activePayload, activeSection), [activePayload, activeSection]);
  const readingPassages = useMemo(() => activeSection === 'reading' ? getIeltsReadingPassages(activePayload) : [], [activePayload, activeSection]);
  const [selectedPassage, setSelectedPassage] = useState('');
  const readingAttemptId = attempt?.attempt_id ?? whoami?.attempt_id;
  useEffect(() => {
    if (readingAttemptId && readingPassages.length) {
      setSelectedPassage(restoreReadingPassage(readingAttemptId, readingPassages.map((passage) => passage.id)));
    }
  }, [readingAttemptId, readingPassages]);
  const currentReadingPassage = readingPassages.find((passage) => passage.id === selectedPassage) ?? readingPassages[0];
  const displayedQuestions = currentReadingPassage ? activeQuestions.filter((question) => question.passageId === currentReadingPassage.id) : activeQuestions;

  const status = submission?.status ?? whoami?.attempt_status ?? attempt?.status ?? whoami?.status;
  const eventStatus = whoami?.event_status ?? (!whoami?.attempt_id ? whoami?.status : null);
  const isSubmitted = Boolean(submission) || isIeltsSubmittedAttemptStatus(status);
  const serverNowMs = nowTick + serverOffsetMs;
  const startsAtMs = toMillis(whoami?.starts_at);
  const endsAtMs = toMillis(whoami?.ends_at);
  const isBeforeStart = Boolean(startsAtMs !== null && serverNowMs < startsAtMs);
  const isAfterExamWindow = Boolean(endsAtMs !== null && serverNowMs >= endsAtMs && !attempt);
  const isPaused = syncState === 'paused';
  const startCountdownSeconds = startsAtMs === null ? 0 : Math.max(0, Math.floor((startsAtMs - serverNowMs) / 1000));
  const lifecycleMeta = resolveIeltsExamLifecycleMeta(eventStatus ?? whoami?.status, whoami?.starts_at, whoami?.ends_at, serverNowMs);
  const canStart = canStartIeltsExamAttempt({
    allowed: whoami?.allowed,
    assignmentId: whoami?.assignment_id,
    eventStatus,
    hasAttempt: Boolean(attempt),
    isSubmitted,
    isBeforeStart,
    isAfterExamWindow,
    isPaused,
  });
  const inProgress = Boolean(attempt && !isSubmitted);

  if (loadState === 'loading') {
    return <ExamFrame><StateCard title="Loading controlled IELTS exam…" body="Checking your assignment and exam window." /></ExamFrame>;
  }

  if (loadState === 'error') {
    return <ExamFrame><StateCard title="Could not load exam" body={error ?? 'Please reconnect and try again.'} actionLabel="Retry" onAction={() => void loadWhoami()} /></ExamFrame>;
  }

  if (isBeforeStart && !isSubmitted) {
    return (
      <ExamFrame>
        <StateCard
          eyebrow={lifecycleMeta.label}
          title={eventStatus === 'scheduled' ? 'Scheduled start in' : 'Starts in'}
          body={eventStatus === 'scheduled'
            ? `${formatIeltsCountdown(startCountdownSeconds)} until the scheduled start. Your invigilator must also launch the exam before you can begin.`
            : `${formatIeltsCountdown(startCountdownSeconds)} until the exam opens in your local time.`}
          secondaryText={`Local start: ${formatLocalDateTime(whoami?.starts_at)} · Local end: ${formatLocalDateTime(whoami?.ends_at)}`}
          actionLabel="Check again"
          onAction={() => void loadWhoami()}
        />
      </ExamFrame>
    );
  }

  if (syncState === 'voided') {
    return (
      <ExamFrame>
        <StateCard
          eyebrow="Voided"
          title="Attempt voided"
          body="This attempt was voided by the teacher."
          secondaryText="Answer inputs and the submit button are locked. Please wait for your teacher's instructions."
        />
      </ExamFrame>
    );
  }

  if (isPaused && !isSubmitted) {
    return (
      <ExamFrame>
        <StateCard
          eyebrow="Paused"
          title="Paused by teacher"
          body="This exam is paused by the teacher. Keep this page open and wait for instructions."
          secondaryText={`Exam window: ${formatLocalDateTime(whoami?.starts_at)} to ${formatLocalDateTime(whoami?.ends_at)} · Remaining time is held at ${formatRemaining(remainingSeconds)}.`}
          actionLabel="Check again"
          onAction={() => void refreshLiveState()}
        />
      </ExamFrame>
    );
  }

  if (isAfterExamWindow && !isSubmitted) {
    return (
      <ExamFrame>
        <StateCard
          title="This IELTS exam is closed."
          body={`Expired exam. The local end time was ${formatLocalDateTime(whoami?.ends_at)}. Please contact your teacher if this is unexpected.`}
          actionLabel="Check again"
          onAction={() => void loadWhoami()}
        />
      </ExamFrame>
    );
  }

  if (!whoami?.allowed && !isSubmitted) {
    return (
      <ExamFrame>
        <StateCard
          title={stateTitleFor(whoami)}
          body={availabilityMessage(whoami)}
          actionLabel="Check again"
          onAction={() => void loadWhoami()}
        />
      </ExamFrame>
    );
  }

  if (isSubmitted) {
    return (
      <ExamFrame>
        {writingResult && <IeltsWritingResult result={writingResult} onRefresh={() => setResultRetry(n => n + 1)} />}
        {!diagnosticResult && !writingResult && <StateCard
          title="IELTS assessment submitted"
          body="Your answers have been received and locked for review."
          secondaryText="Your answers are saved. Your teacher can help you with the next step."
        />}
        {diagnosticError && <div className="mx-auto max-w-2xl p-5" role="alert"><p>{diagnosticError}</p><button type="button" className="mt-3 rounded-xl bg-slate-900 px-5 py-3 text-white" onClick={() => setResultRetry((n) => n + 1)}>Load result again</button></div>}
        {diagnosticResult && <section aria-label="Screener result" className="mx-auto my-8 max-w-2xl rounded-2xl border border-cyan-200 bg-white p-6 text-slate-900 shadow-sm">
          <h2 className="text-xl font-bold">Your starting point</h2>
          <p className="mt-3 text-3xl font-bold">{diagnosticResult.raw_score} / {diagnosticResult.marks_possible}</p>
          <p className="mt-2 text-sm text-slate-600">Screener score · Confidence: low</p>
          <p className="mt-3 text-sm">This short check samples part of your learning. It does not give an IELTS band.</p>
          <p className="mt-3 text-sm">{diagnosticResult.confidence.items_answered} of {diagnosticResult.confidence.items_possible} items answered · {diagnosticResult.confidence.constructs_with_responses} of {diagnosticResult.confidence.constructs_sampled} sampled skills have responses.</p>
          {diagnosticResult.integrity_state === 'review_required' && <p className="mt-3 text-sm text-amber-800">Your teacher should review the assessment conditions before interpreting this result.</p>}
          <p className="mt-4 font-medium">{diagnosticResult.next_step}</p>
          <a href="/ielts" className="mt-5 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Back to IELTS</a>
          <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">What this result can tell us</summary><ul className="mt-2 list-disc space-y-2 pl-5">{diagnosticResult.warnings.map((message) => <li key={message}>{message}</li>)}</ul></details>
        </section>}
      </ExamFrame>
    );
  }

  if (canStart && !inProgress) {
    return (
      <ExamFrame>
        <StateCard
          eyebrow={isScreener ? `${availableSections[0]?.label ?? 'IELTS'} screener` : 'IELTS Exam Mode'}
          title={isScreener ? (whoami.attempt_id ? `Continue your ${availableSections[0]?.label ?? 'IELTS'} screener.` : `Your ${availableSections[0]?.label ?? 'IELTS'} screener is ready.`) : stateTitleFor(whoami)}
          body={getIeltsAttemptTimeMessage(Boolean(whoami.attempt_id), remainingSeconds)}
          secondaryText={whoami.attempt_id ? 'Your saved answers will reopen. The timer continues from your existing attempt.' : 'The timer starts when you begin. Your answers save automatically.'}
          alert={error}
          actionLabel={isScreener ? (whoami.attempt_id ? 'Resume screener' : 'Start screener') : (whoami.attempt_id ? 'Resume exam' : 'Start exam')}
          onAction={() => void startOrResume()}
          busy={isStarting}
        />
      </ExamFrame>
    );
  }

  if (!attempt) {
    return (
      <ExamFrame>
        <StateCard
          title="Resume token required"
          body="This attempt exists, but this browser needs to reopen it securely. Press Resume to continue without restarting the timer."
          alert={error}
          actionLabel="Resume exam"
          onAction={() => void startOrResume()}
          busy={isStarting}
        />
      </ExamFrame>
    );
  }

  return (
    <ExamFrame>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{isScreener ? `${SECTIONS.find(section => section.id === activeSection)?.label ?? 'IELTS'} screener` : 'Controlled IELTS Exam Mode'} · {isPaused ? 'Paused by teacher' : 'Exam is live'}</p>
              <h1 className="text-2xl font-semibold text-slate-950">{isScreener ? `${SECTIONS.find(section => section.id === activeSection)?.label ?? 'IELTS'} starting-point check` : 'IELTS Exam'}</h1>
              <p className="text-sm text-slate-500">{isPaused ? 'Editing is disabled while the teacher has paused the exam.' : 'Use only this exam window. Your work autosaves every 8 seconds.'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-right">
              <p className="text-xs font-semibold uppercase text-slate-500">Remaining time</p>
              <p className={`font-mono text-3xl font-bold ${remainingSeconds <= 300 ? 'text-red-600' : 'text-slate-950'}`}>{formatRemaining(remainingSeconds)}</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {error && <Banner tone="error" message={error} />}
          {offline && <Banner tone="warning" message={localDraftSaved ? "You’re offline. Answers are saved on this device. Keep this page open; we’ll send them when you reconnect." : "You’re offline and this browser could not save your latest answers. Keep this page open and reconnect to save."} />}
          {!offline && warning && <Banner tone="warning" message={warning} onDismiss={() => setWarning(null)} />}
          {!offline && saveState === 'error' && shouldIeltsAutosaveRun(syncState) && <Banner tone="warning" message={saveMessage} />}
          {syncState !== 'active' && teacherActionMessage && <Banner tone="warning" message={teacherActionMessage} />}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {!isWritingScreener && availableSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  disabled={!shouldIeltsAutosaveRun(syncState)}
                  onClick={() => void handleSectionChange(section.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeSection === section.id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {section.label}
                </button>
              ))}
            </div>
            <div className="text-sm text-slate-600" role="status" aria-live="polite">
              <span className={`mr-2 inline-flex h-2 w-2 rounded-full ${offline || saveState === 'idle' || saveState === 'saving' ? 'bg-amber-500' : saveState === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
              {offline ? (localDraftSaved ? 'Saved on this device · waiting for connection' : 'Waiting for connection · keep this page open') : saveMessage}
            </div>
          </div>

          <section
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            onBlur={(event) => {
              const relatedTarget = event.relatedTarget;
              if (!relatedTarget || !event.currentTarget.contains(relatedTarget as Node)) {
                void autosaveSection(activeSectionRef.current, 'blur');
              }
            }}
          >
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-xl font-semibold text-slate-950">{getIeltsSectionTitle(activePayload, activeSection, SECTIONS.find((section) => section.id === activeSection)?.label ?? activeSection)}</h2>
              {getIeltsSectionInstructions(activePayload, activeSection) && <p className="mt-2 text-sm leading-6 text-slate-600">{getIeltsSectionInstructions(activePayload, activeSection)}</p>}
            </div>

            {getIeltsScreenerAudio(activePayload) && <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="screener-audio" className="mb-2 block text-sm font-semibold">Listening audio</label>
              <audio ref={attachScreenerAudio} id="screener-audio" key={audioCheckpointKey ?? audioSource} controls={syncState === 'active'} preload="metadata" className="w-full" src={getIeltsScreenerAudio(activePayload)!}
                onLoadedMetadata={(event) => restoreAudioPosition(event.currentTarget)}
                onTimeUpdate={(event) => checkpointAudio(event.currentTarget)}
                onSeeked={(event) => checkpointAudio(event.currentTarget)}
                onPause={(event) => {
                  checkpointAudio(event.currentTarget);
                  setAudioResumePosition(event.currentTarget.currentTime);
                  setAudioIsPlaying(false);
                }}
                onEnded={(event) => checkpointAudio(event.currentTarget)}
                onPlay={(event) => { if (syncStateRef.current !== 'active' || document.hidden) event.currentTarget.pause(); }}
                onError={() => {
                  if (audioBufferTimerRef.current !== null) window.clearTimeout(audioBufferTimerRef.current);
                  audioBufferTimerRef.current = null;
                  audioBufferStartedAtRef.current = null;
                  setWarning('The audio could not load. Your answers are safe. Tell your teacher before continuing.');
                  void logIncident('screener_audio_load_failure', 'warning', { section: activeSection });
                }}
                onWaiting={(event) => {
                  if (event.currentTarget.paused || event.currentTarget.ended || event.currentTarget.currentTime <= 0) return;
                  if (audioBufferTimerRef.current !== null) return;
                  audioBufferStartedAtRef.current = Date.now();
                  audioBufferTimerRef.current = window.setTimeout(() => {
                    audioBufferTimerRef.current = null;
                    const audio = screenerAudioRef.current;
                    if (!audio || audio.paused || audio.ended || audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
                      audioBufferStartedAtRef.current = null;
                      return;
                    }
                    const interruptedMs = Math.max(1500, Date.now() - (audioBufferStartedAtRef.current ?? Date.now()));
                    setWarning('The audio was interrupted by buffering. Your answers are safe. Tell your teacher if listening was affected.');
                    void logIncident('screener_audio_interruption', 'warning', { section: activeSection, interrupted_ms: interruptedMs });
                    audioBufferStartedAtRef.current = null;
                  }, 1500);
                }}
                onPlaying={(event) => {
                  if (syncStateRef.current !== 'active' || document.hidden) event.currentTarget.pause();
                  else setAudioIsPlaying(true);
                }}
                onCanPlay={(event) => {
                  restoreAudioPosition(event.currentTarget);
                  if (audioBufferTimerRef.current !== null) window.clearTimeout(audioBufferTimerRef.current);
                  audioBufferTimerRef.current = null;
                  audioBufferStartedAtRef.current = null;
                }}
              >Your browser cannot play this audio. Please ask your teacher for help.</audio>
              <p className="mt-2 text-sm text-slate-600" role="status">
                {audioCheckpointUnavailable
                  ? 'This browser could not save your audio position. Before refreshing, note the playback time and use the audio controls to return to it.'
                  : audioIsPlaying
                    ? 'Listening audio is playing. Your position is saved in this browser.'
                    : audioResumePosition > 0
                    ? `Audio paused at ${formatRemaining(audioResumePosition)}. Press Play to continue. The assessment timer keeps running.`
                    : 'Audio pauses when you leave this window. Press Play to listen; the assessment timer keeps running.'}
              </p>
            </div>}
            {currentReadingPassage && <div className="mb-6">
              <nav aria-label="Reading passages" className="mb-5 flex flex-wrap gap-3">
                {readingPassages.map((passage, index) => <button type="button" key={passage.id}
                  aria-pressed={currentReadingPassage.id === passage.id}
                  onClick={() => {
                    setSelectedPassage(passage.id);
                    if (readingAttemptId) saveReadingPassage(readingAttemptId, passage.id);
                  }}
                  className={`min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${currentReadingPassage.id === passage.id ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
                  Passage {index + 1} · {activeQuestions.filter((question) => question.passageId === passage.id && Boolean(answers.reading?.[question.id])).length}/{activeQuestions.filter((question) => question.passageId === passage.id).length} answered
                </button>)}
              </nav>
              <article aria-labelledby="reading-passage-title" className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5 sm:p-7">
                <h3 id="reading-passage-title" className="mb-5 text-xl font-bold text-slate-950">{currentReadingPassage.title}</h3>
                <div className="max-w-3xl space-y-5">
                  {currentReadingPassage.paragraphs.map((paragraph) => <p key={paragraph.label} className="text-base leading-8 text-slate-900"><span className="mr-3 font-bold text-teal-800">{paragraph.label}</span>{paragraph.text}</p>)}
                </div>
              </article>
            </div>}
            {isWritingScreener && activeSection === 'writing' && activeQuestions[0] && <IeltsWritingEditor
              prompt={activeQuestions[0].prompt} value={answers.writing?.[activeQuestions[0].id] ?? ''}
              disabled={!shouldIeltsAutosaveRun(syncState)} onChange={value => handleAnswerChange('writing', activeQuestions[0].id, value)} />}
            {!(isWritingScreener && activeSection === 'writing') && <div id="reading-questions" className="space-y-5">
              {activeQuestions.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No active questions are available for this section yet. Please wait while your teacher checks the form setup.
                </div>
              )}
              {displayedQuestions.map((question) => (
                <article key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label htmlFor={`${activeSection}-${question.id}`} className="block text-sm font-semibold text-slate-900">
                    {activeQuestions.findIndex((item) => item.id === question.id) + 1}. {question.prompt}
                  </label>
                  {question.options && question.options.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <label key={option} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="radio"
                            name={`${activeSection}-${question.id}`}
                            value={option}
                            checked={(answers[activeSection]?.[question.id] ?? '') === option}
                            disabled={!shouldIeltsAutosaveRun(syncState)}
                            onChange={(event) => handleAnswerChange(activeSection, question.id, event.target.value)}
                          />
                          <span>{question.options?.length === 4 && <span className="mr-2 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>}{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : question.type === 'essay' || activeSection === 'writing' ? (
                    <textarea
                      id={`${activeSection}-${question.id}`}
                      className="mt-3 min-h-48 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      value={answers[activeSection]?.[question.id] ?? ''}
                      disabled={!shouldIeltsAutosaveRun(syncState)}
                      onChange={(event) => handleAnswerChange(activeSection, question.id, event.target.value)}
                      placeholder="Type your answer here…"
                    />
                  ) : (
                    <input
                      id={`${activeSection}-${question.id}`}
                      className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      value={answers[activeSection]?.[question.id] ?? ''}
                      disabled={!shouldIeltsAutosaveRun(syncState)}
                      onChange={(event) => handleAnswerChange(activeSection, question.id, event.target.value)}
                      placeholder="Your answer"
                    />
                  )}
                </article>
              ))}
            </div>}
          </section>

          <footer className="sticky bottom-0 mt-6 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-600">Check your answers before submitting. If the connection drops, keep this page open and retry.</p>
              <button
                type="button"
                disabled={isSubmitting || saveState === 'saving' || !shouldIeltsAutosaveRun(syncState)}
                onClick={() => void handleSubmit()}
                className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? 'Submitting…' : isScreener ? 'Submit screener' : 'Submit IELTS Exam'}
              </button>
            </div>
          </footer>
        </main>
      </div>
    </ExamFrame>
  );
};

const ExamFrame: React.FC<React.PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    document.body.classList.add('ielts-exam-mode');
    return () => document.body.classList.remove('ielts-exam-mode');
  }, []);
  return <div className="ielts-exam-frame min-h-screen bg-slate-50 font-sans text-slate-900">{children}</div>;
};

const StateCard: React.FC<{
  title: string;
  body: string;
  eyebrow?: string;
  secondaryText?: string;
  alert?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}> = ({ title, body, eyebrow = 'IELTS Exam Mode', secondaryText, alert, actionLabel, onAction, busy }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
      <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
      <p className="mt-3 text-lg font-semibold leading-7 text-slate-800">{body}</p>
      {secondaryText && <p className="mt-3 text-xs leading-5 text-slate-500">{secondaryText}</p>}
      {alert && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800">{alert}</div>}
      {actionLabel && onAction && (
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="mt-6 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? 'Please wait…' : actionLabel}
        </button>
      )}
    </div>
  </div>
);

const Banner: React.FC<{ tone: 'warning' | 'error'; message: string; onDismiss?: () => void }> = ({ tone, message, onDismiss }) => (
  <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
    <div className="flex items-start justify-between gap-3">
      <span>{message}</span>
      {onDismiss && <button type="button" className="font-semibold" onClick={onDismiss}>Dismiss</button>}
    </div>
  </div>
);

export default IeltsExamMode;
