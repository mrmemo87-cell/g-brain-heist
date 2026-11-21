// Diagnostic Bible 2.7.0 section 10.12: the student's side of the recorded-examiner Speaking mock.
// Every answer is kept on the device (IndexedDB) until the server has it, so a closed tab or a lost
// connection never loses a recording.
import { supabase } from "./supabaseClient";
import { encodeSpeakingWav } from "./ieltsSpeakingPilot";

export type MockState = "ready" | "in_progress" | "finished" | "reviewed";
export interface MockHome {
  available: boolean;
  recording_wording?: { version: string; body: string };
  voice_wording?: { version: string; body: string } | null;
  mocks?: { assignment_id: string; title: string; assigned_at: string; session_id: string | null; state: MockState }[];
}
export interface MockLine {
  key: string;
  position: number;
  part: number;
  kind: "sound_check" | "say" | "question" | "prepare" | "long_turn";
  answer_seconds: number | null;
  replay_allowed: boolean;
  replayed: boolean;
  audio_path: string | null;
  audio_seconds: number | null;
}
export interface MockAnswer {
  id: string;
  line_key: string;
  part: number;
  started_at: string;
  uploaded: boolean;
  missing: boolean;
  interrupted: boolean;
}
export interface MockSitting {
  session_id: string;
  status: "in_progress" | "submitted";
  server_now: string;
  title: string;
  checks_passed: boolean;
  finished: boolean;
  preparation_started_at: string | null;
  cue_card: { topic: string; points: string[]; closing?: string };
  lines: MockLine[];
  answers: MockAnswer[];
}

/** Server error codes the screens react to; anything else is shown as a connection problem. */
const KNOWN = [
  "speaking_preparation_required",
  "speaking_mock_already_started",
  "speaking_mock_assignment_cancelled",
  "speaking_mock_answer_already_started",
  "speaking_mock_replay_used",
  "speaking_mock_closed",
  "not_authorized",
] as const;
export class MockError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const code = KNOWN.find((k) => error.message?.includes(k)) ?? "offline";
    throw new MockError(code, "We could not reach Brains Heist. Your answers are safe on this device.");
  }
  return data as T;
}

export const mockHome = () => rpc<MockHome>("rpc_ielts_speaking_mock_home");
export const mockSitting = (sessionId: string) => rpc<MockSitting>("rpc_ielts_speaking_mock_sitting", { p_session_id: sessionId });
export const startMock = (
  assignmentId: string,
  sessionId: string,
  recordingWording: string,
  voice: { answer: boolean; wording: string } | null,
) =>
  rpc<MockSitting>("rpc_ielts_start_speaking_mock", {
    p_assignment_id: assignmentId,
    p_session_id: sessionId,
    p_recording_consent: true,
    p_recording_wording: recordingWording,
    p_voice_consent: voice ? voice.answer : null,
    p_voice_wording: voice ? voice.wording : null,
  });
export const saveChecks = (sessionId: string, checks: Record<string, unknown>) =>
  rpc<MockSitting>("rpc_ielts_speaking_mock_checks", { p_session_id: sessionId, p_checks: checks });
export const requestReplay = (sessionId: string, lineKey: string) =>
  rpc<MockSitting>("rpc_ielts_speaking_mock_replay", { p_session_id: sessionId, p_line_key: lineKey });
export const startPreparation = (sessionId: string) => rpc<MockSitting>("rpc_ielts_speaking_mock_prepare", { p_session_id: sessionId });
export const beginAnswer = (sessionId: string, lineKey: string, answerId: string) =>
  rpc<MockSitting>("rpc_ielts_speaking_mock_begin_answer", { p_session_id: sessionId, p_line_key: lineKey, p_answer_id: answerId });
export const finishMock = (sessionId: string) => rpc<MockSitting>("rpc_ielts_speaking_mock_finish", { p_session_id: sessionId });

/** Asks the server to join any finished parts. Safe to call often; failures are retried later. */
export async function requestJoin(sessionId: string) {
  const { data, error } = await supabase.functions.invoke("ielts_speaking_mock_join", { body: { sessionId } });
  if (error) return null;
  return data as { parts: number[]; submitted: boolean; blocked: string | null };
}

/** Downloads every examiner line before the test starts, so playback never waits on the network. */
export async function loadExaminerAudio(lines: MockLine[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const l of lines) {
    if (!l.audio_path) throw new MockError("audio_missing", "This mock is not ready yet. Please tell your teacher.");
    const { data, error } = await supabase.storage.from("ielts-speaking-examiner").download(l.audio_path);
    if (error || !data) throw new MockError("offline", "We could not load the examiner's voice. Check your connection and try again.");
    out[l.key] = URL.createObjectURL(data);
  }
  return out;
}

// ---- On-device answer store -----------------------------------------------------------------
export interface LocalMockAnswer {
  id: string;
  sessionId: string;
  ownerId: string;
  lineKey: string;
  chunks: Blob[];
  wav?: Blob;
  complete: boolean;
  interrupted: boolean;
  /** The line's answer limit in seconds, so a recovered answer is cut the same way. */
  maxSeconds?: number;
}
const DB = "bh-speaking-mock-v1";
const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("answers", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error("local_storage_unavailable"));
    r.onblocked = () => reject(new Error("local_storage_unavailable"));
  });
export async function localAnswers(action: "put" | "delete" | "list", input?: LocalMockAnswer | string): Promise<LocalMockAnswer[]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("answers", action === "list" ? "readonly" : "readwrite");
      const store = tx.objectStore("answers");
      const req = action === "put" ? store.put(input) : action === "delete" ? store.delete(input as string) : store.getAll();
      tx.oncomplete = () => resolve(action === "list" ? (req.result as LocalMockAnswer[]) : []);
      tx.onerror = tx.onabort = () => reject(new Error("local_storage_unavailable"));
    });
  } finally {
    db.close();
  }
}

/** Converts the browser's recording into the 16 kHz mono WAV the Speaking pipeline accepts. */
export async function toMockWav(native: Blob, maxSeconds: number): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await native.arrayBuffer());
    const seconds = Math.min(decoded.duration, maxSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("empty_recording");
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * 16000)), 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeSpeakingWav(rendered.getChannelData(0))], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}

/**
 * Sends one saved answer: upload the file, then tell the server. A lost response may leave the
 * file already uploaded; the server's check is the authority. Removes the device copy only after.
 */
export async function sendAnswer(a: LocalMockAnswer, maxSeconds: number): Promise<MockSitting> {
  let wav = a.wav;
  if (!wav && a.chunks.length > 0) {
    try {
      wav = await toMockWav(new Blob(a.chunks, { type: a.chunks[0]?.type || "audio/webm" }), maxSeconds + 2);
      await localAnswers("put", { ...a, wav, complete: true });
    } catch {
      wav = undefined;
    }
  }
  if (!wav) {
    const sitting = await rpc<MockSitting>("rpc_ielts_speaking_mock_answer_saved", {
      p_session_id: a.sessionId,
      p_answer_id: a.id,
      p_interrupted: true,
      p_missing: true,
    });
    await localAnswers("delete", a.id);
    return sitting;
  }
  const { error } = await supabase.storage
    .from("ielts-speaking-mock-answers")
    .upload(`${a.sessionId}/${a.id}.wav`, wav, { contentType: "audio/wav", upsert: false });
  if (error && !["409", "400", "403"].includes(String((error as { statusCode?: string }).statusCode)))
    throw new MockError("offline", "Your answer is safe on this device. We will send it when the connection is back.");
  const sitting = await rpc<MockSitting>("rpc_ielts_speaking_mock_answer_saved", {
    p_session_id: a.sessionId,
    p_answer_id: a.id,
    p_interrupted: a.interrupted,
    p_missing: false,
  });
  await localAnswers("delete", a.id);
  return sitting;
}

// ---- Teachers ------------------------------------------------------------------------------
export interface MockCatalogItem { code: string; title: string; published: boolean; pilot_student: string; script_version: number }
export interface MockAssignmentRow {
  assignment_id: string; package_code: string; title: string; assigned_at: string; assigned_by: string | null;
  cancelled_at: string | null; session_id: string | null; started_at: string | null; finished_at: string | null;
  status: "in_progress" | "submitted" | null; reviewed: boolean; interrupted_answers: number;
}
export interface MockSegments {
  mock: boolean;
  parts?: { part: number; clip_id: string; answers: { line_key: string; start: number; end: number; question: string | null; interrupted: boolean }[]; lost: string[] }[];
  checks?: Record<string, unknown> | null;
  replays?: number | null;
}
export const mockCatalog = () => rpc<MockCatalogItem[]>("rpc_ielts_speaking_mock_catalog");
export const mockTeacherList = (studentId: string) => rpc<MockAssignmentRow[]>("rpc_ielts_speaking_mock_teacher_list", { p_student_id: studentId });
export const assignMock = (code: string, studentIds: string[]) =>
  rpc<{ assigned: number; script_version: number }>("rpc_ielts_assign_speaking_mock", {
    p_package_code: code,
    p_assignments: studentIds.map((student_id) => ({ student_id, assignment_id: crypto.randomUUID() })),
  });
export const cancelMockAssignment = (assignmentId: string) => rpc<{ cancelled: boolean }>("rpc_ielts_cancel_speaking_mock_assignment", { p_assignment_id: assignmentId });
export const mockSegments = (sessionId: string) => rpc<MockSegments>("rpc_ielts_speaking_mock_segments", { p_session_id: sessionId });

// ---- Owner: examiner script and audio --------------------------------------------------------
export interface MockOwnerPackage {
  code: string; title: string; content_hash: string; approved: boolean; published: boolean;
  scripts: { id: string; version: number; released_at: string | null; created_at: string }[];
}
export interface MockScriptLine {
  position: number; key: string; part: number; kind: string; body: string; answer_seconds: number | null; replay_allowed: boolean; audio_key: string;
  approved_audio: { id: string; sha256: string; duration_seconds: number; approved_at: string } | null;
  candidates: { id: string; path: string; sha256: string; duration_seconds: number; rejected: boolean }[];
}
export interface MockScript {
  id: string; package_code: string; content_hash: string; version: number; voice: Record<string, unknown>;
  cue_card: { topic: string; points: string[]; closing?: string }; released_at: string | null;
  lines: MockScriptLine[]; needs_audio: { lines: number; characters: number };
}
export const ownerOverview = () => rpc<MockOwnerPackage[]>("rpc_ielts_speaking_mock_owner_overview");
export const ownerScript = (scriptId: string) => rpc<MockScript>("rpc_ielts_speaking_mock_script", { p_script_id: scriptId });
export const reviewAudio = (audioId: string, sha256: string, approve: boolean, note: string) =>
  rpc<MockScript>("rpc_ielts_review_speaking_mock_audio", { p_audio_id: audioId, p_sha256: sha256, p_approve: approve, p_note: note || null });
export const releaseScript = (scriptId: string) => rpc<MockScript>("rpc_ielts_release_speaking_mock_script", { p_script_id: scriptId });
export const approveMockPackage = (code: string, hash: string, review: Record<string, unknown>) =>
  rpc<unknown>("rpc_ielts_approve_speaking_mock_package", { p_code: code, p_content_hash: hash, p_review_record: review });
export const publishMock = (code: string, hash: string, note: string) =>
  rpc<unknown>("rpc_ielts_publish_speaking_mock", { p_code: code, p_content_hash: hash, p_note: note });
export async function examinerAudioUrl(path: string) {
  const { data, error } = await supabase.storage.from("ielts-speaking-examiner").createSignedUrl(path, 900);
  if (error || !data?.signedUrl) throw new MockError("offline", "We could not open this audio. Try again.");
  return data.signedUrl;
}
