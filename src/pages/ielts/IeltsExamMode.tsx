import { fetchIeltsDiagnosticResult, getIeltsScreenerAudio, type IeltsDiagnosticResult } from '../../../services/ieltsDiagnosticEvidenceService';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/ielts-exam.css';
import { useParams } from 'react-router-dom';
import {
  createExamIdempotencyKey,
  rpcIeltsAutosaveAttempt,
  rpcIeltsExamWhoami,
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
  isIeltsTeacherSubmittedStatus,
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
  if (!attemptId || typeof window === 'undefined') return;
  window.localStorage.setItem(makeLocalDraftKey(attemptId), JSON.stringify(answers));
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
  const [diagnosticResult, setDiagnosticResult] = useState<IeltsDiagnosticResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [resultRetry, setResultRetry] = useState(0);
  const [whoami, setWhoami] = useState<IeltsExamWhoamiResponse | null>(null);
  const [attempt, setAttempt] = useState<IeltsStartAttemptResponse | null>(null);
  const [lockToken, setLockToken] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<IeltsExamSection>('reading');
  const [answers, setAnswers] = useState<AnswersBySection>(() => emptyAnswers());
  const [draftVersions, setDraftVersions] = useState<Record<string, number>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('No changes yet');
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

    if (response.attempt_id) {
      const localDraft = readLocalDraft(response.attempt_id);
      if (localDraft) {
        for (const section of Object.keys(localDraft)) {
          nextAnswers[section] = { ...nextAnswers[section], ...localDraft[section] };
        }
      }
    }
    setAnswers(nextAnswers);
    setDraftVersions(Object.fromEntries((response.drafts ?? []).map((draft) => [draft.section, draft.draft_version ?? 0])));
  }, []);

  const applyWhoamiState = useCallback((response: IeltsExamWhoamiResponse, options: { hydrateDrafts: boolean } = { hydrateDrafts: false }) => {
    setWhoami(response);
    syncServerClock(response.server_now);
    setRemainingSeconds(response.remaining_seconds ?? 0);
    if (options.hydrateDrafts) {
      hydrateAnswers(response);
    }

    const attemptStatus = response.attempt_status ?? response.status;
    const eventStatus = response.event_status ?? (!response.attempt_id ? response.status : null);
    const previousSyncState = syncStateRef.current;
    const nextSyncState = resolveIeltsStudentExamSyncState(attemptStatus, eventStatus, response.reason);
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

    if (isIeltsTeacherSubmittedStatus(attemptStatus)) {
      setSubmission({
        submission_id: 'teacher-action',
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
    if (!examEventId) return;
    try {
      const response = await rpcIeltsExamWhoami(examEventId);
      applyWhoamiState(response);
    } catch (refreshError) {
      setWarning(refreshError instanceof Error ? `Could not refresh exam status: ${refreshError.message}` : 'Could not refresh exam status.');
    }
  }, [applyWhoamiState, examEventId]);

  const loadWhoami = useCallback(async () => {
    if (!examEventId) return;
    setLoadState('loading');
    setError(null);
    try {
      const response = await rpcIeltsExamWhoami(examEventId);
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
    if (loadState !== 'ready' || syncState === 'teacher_submitted' || syncState === 'voided') return undefined;
    const timer = window.setInterval(() => {
      void refreshLiveState();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadState, refreshLiveState, syncState]);

  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState !== 'hidden') {
        void refreshLiveState();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [refreshLiveState]);

  const resultAttemptId = submission?.attempt_id ?? whoami?.attempt_id ?? attempt?.attempt_id;
  const resultSubmitted = Boolean(submission) || ['submitted', 'auto_submitted'].includes(whoami?.status ?? '');
  useEffect(() => {
    if (!resultAttemptId || !resultSubmitted) return;
    let active = true;
    setDiagnosticError('');
    setDiagnosticResult(null);
    fetchIeltsDiagnosticResult(resultAttemptId).then((value) => { if (active) setDiagnosticResult(value); })
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
    writeLocalDraft(attempt?.attempt_id ?? whoami?.attempt_id ?? null, answers);
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
    if (saveInFlightRef.current) return false;

    const nextVersion = (draftVersions[section] ?? 0) + 1;
    saveInFlightRef.current = true;
    setSaveState('saving');
    setSaveMessage(`Saving ${section}…`);
    try {
      const response = await rpcIeltsAutosaveAttempt({
        attemptId: currentAttempt.attempt_id,
        lockToken: currentLockToken,
        section,
        payload: answersRef.current[section] ?? {},
        draftVersion: nextVersion,
        clientSavedAt: new Date(Date.now() + serverOffsetMs).toISOString(),
      });
      syncServerClock(response.server_now);
      setDraftVersions((prev) => ({ ...prev, [section]: Math.max(prev[section] ?? 0, response.draft_version ?? nextVersion) }));
      setSaveState('saved');
      setSaveMessage(`Saved ${section} (${reason})`);
      return true;
    } catch (saveError) {
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
  }, [draftVersions, refreshLiveState, serverOffsetMs, submission, syncServerClock]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
      void autosaveSection(activeSectionRef.current, 'auto');
    }, 8000);
    return () => window.clearInterval(timer);
  }, [autosaveSection]);

  const logIncident = useCallback(async (incidentType: string, severity: 'info' | 'warning', payload: Record<string, unknown>) => {
    const currentAttempt = attemptRef.current;
    const currentLockToken = lockTokenRef.current;
    if (!currentAttempt?.attempt_id || !currentLockToken) return;
    const now = Date.now();
    const dedupeKey = incidentType === 'window_blur' || incidentType === 'tab_hidden' ? 'backgrounding' : incidentType;
    if (now - (recentIncidentRef.current[dedupeKey] ?? 0) < 2000 || incidentInFlightRef.current) return;
    recentIncidentRef.current[dedupeKey] = now;
    incidentInFlightRef.current = true;
    if (severity === 'warning') setWarning('A delivery interruption was recorded. Your answers are safe.');
    try {
      await rpcIeltsLogIncident({
        attemptId: currentAttempt.attempt_id,
        lockToken: currentLockToken,
        incidentType,
        severity,
        payload: {
          ...payload,
          active_section: activeSectionRef.current,
          client_logged_at: new Date(Date.now() + serverOffsetMs).toISOString(),
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
        screenerAudioRef.current?.pause();
        void autosaveSection(activeSectionRef.current, 'tab hidden');
        void logIncident('tab_hidden', 'warning', { visibility_state: document.visibilityState });
      }
    };
    const onWindowBlur = () => {
      screenerAudioRef.current?.pause();
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
      void logIncident('navigation_away', 'warning', {});
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('paste', onPaste);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [autosaveSection, logIncident]);

  const handleSectionChange = async (section: IeltsExamSection) => {
    if (section === activeSection || !shouldIeltsAutosaveRun(syncStateRef.current)) return;
    await autosaveSection(activeSection, 'section change');
    setActiveSection(section);
  };

  const handleAnswerChange = (section: string, questionId: string, value: string) => {
    if (!shouldIeltsAutosaveRun(syncStateRef.current)) return;
    setAnswers((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] ?? {}),
        [questionId]: value,
      },
    }));
    setSaveState('idle');
    setSaveMessage('Unsaved changes');
  };

  const handleSubmit = async () => {
    const currentAttempt = attemptRef.current;
    const currentLockToken = lockTokenRef.current;
    if (!currentAttempt?.attempt_id || !currentLockToken || isSubmitting || submission || !shouldIeltsAutosaveRun(syncStateRef.current)) return;
    screenerAudioRef.current?.pause();
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
  const status = submission?.status ?? whoami?.attempt_status ?? attempt?.status ?? whoami?.status;
  const eventStatus = whoami?.event_status ?? (!whoami?.attempt_id ? whoami?.status : null);
  const isSubmitted = Boolean(submission) || isIeltsTeacherSubmittedStatus(status);
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
        {!diagnosticResult && <StateCard
          title="IELTS assessment submitted"
          body={submission?.submission_id === 'teacher-action' || teacherActionMessage === 'Your exam has been submitted by your teacher.' ? 'Your exam has been submitted by your teacher.' : 'Your answers have been received and locked for grading.'}
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
          <a href="/ielts/listening-screener" className="mt-5 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Back to Listening screener</a>
          <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">What this result can tell us</summary><ul className="mt-2 list-disc space-y-2 pl-5">{diagnosticResult.warnings.map((message) => <li key={message}>{message}</li>)}</ul></details>
        </section>}
      </ExamFrame>
    );
  }

  if (canStart && !inProgress) {
    return (
      <ExamFrame>
        <StateCard
          eyebrow={isScreener ? 'Listening readiness screener' : 'IELTS Exam Mode'}
          title={isScreener ? (whoami.attempt_id ? 'Continue your Listening screener.' : 'Your Listening screener is ready.') : stateTitleFor(whoami)}
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{isScreener ? `${activeSection === 'listening' ? 'Listening' : 'Reading'} screener` : 'Controlled IELTS Exam Mode'} · {isPaused ? 'Paused by teacher' : 'Exam is live'}</p>
              <h1 className="text-2xl font-semibold text-slate-950">{isScreener ? `${activeSection === 'listening' ? 'Listening' : 'Reading'} starting-point check` : 'IELTS Exam'}</h1>
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
          {warning && <Banner tone="warning" message={warning} onDismiss={() => setWarning(null)} />}
          {saveState === 'error' && shouldIeltsAutosaveRun(syncState) && <Banner tone="error" message="Autosave failed. Keep this page open; we will retry on the next autosave." />}
          {syncState !== 'active' && teacherActionMessage && <Banner tone="warning" message={teacherActionMessage} />}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {availableSections.map((section) => (
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
            <div className="text-sm text-slate-600">
              <span className={`mr-2 inline-flex h-2 w-2 rounded-full ${saveState === 'saving' ? 'bg-amber-500' : saveState === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
              {saveMessage}
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
              <audio ref={screenerAudioRef} id="screener-audio" key={getIeltsScreenerAudio(activePayload)} controls={syncState === 'active'} preload="metadata" className="w-full" src={getIeltsScreenerAudio(activePayload)!}
                onPlay={(event) => { if (syncStateRef.current !== 'active') event.currentTarget.pause(); }}
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
                onPlaying={() => {
                  if (audioBufferTimerRef.current !== null) window.clearTimeout(audioBufferTimerRef.current);
                  audioBufferTimerRef.current = null;
                  audioBufferStartedAtRef.current = null;
                  if (syncStateRef.current !== 'active') screenerAudioRef.current?.pause();
                }}
                onCanPlay={() => {
                  if (audioBufferTimerRef.current !== null) window.clearTimeout(audioBufferTimerRef.current);
                  audioBufferTimerRef.current = null;
                  audioBufferStartedAtRef.current = null;
                }}
              >Your browser cannot play this audio. Please ask your teacher for help.</audio>
            </div>}
            <div className="space-y-5">
              {activeQuestions.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No active questions are available for this section yet. Please wait while your teacher checks the form setup.
                </div>
              )}
              {activeQuestions.map((question, index) => (
                <article key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label htmlFor={`${activeSection}-${question.id}`} className="block text-sm font-semibold text-slate-900">
                    {index + 1}. {question.prompt}
                  </label>
                  {question.options && question.options.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {question.options.map((option) => (
                        <label key={option} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="radio"
                            name={`${activeSection}-${question.id}`}
                            value={option}
                            checked={(answers[activeSection]?.[question.id] ?? '') === option}
                            disabled={!shouldIeltsAutosaveRun(syncState)}
                            onChange={(event) => handleAnswerChange(activeSection, question.id, event.target.value)}
                          />
                          <span>{option}</span>
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
            </div>
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
  <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
    <div className="flex items-start justify-between gap-3">
      <span>{message}</span>
      {onDismiss && <button type="button" className="font-semibold" onClick={onDismiss}>Dismiss</button>}
    </div>
  </div>
);

export default IeltsExamMode;
