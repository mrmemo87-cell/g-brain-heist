import { supabase } from "./supabaseClient";
import type { PronunciationWord, SpeakingHighlight } from "./ieltsPracticeFeedback";
import {
  encodeSpeakingWav,
  type SpeakingPackage,
  type SpeakingSession,
  type SpeakingFeedback,
} from "./ieltsSpeakingPilot";
export interface SpeakingHome {
  available: boolean;
  can_teacher?: boolean;
  can_approve?: boolean;
  approved?: boolean;
  published?: boolean;
  students?: { id: string; name: string }[];
  content_hash?: string;
  package?: SpeakingPackage;
  student_name?: string;
  student_id?: string;
  sessions?: {
    id: string;
    status: string;
    reviewed: boolean;
    created_at: string;
    evidence_kind: string;
  }[];
}
export async function speakingRpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      "We could not confirm that step. Your saved recordings are safe. Check your connection and access, then try again.",
    );
  return data as T;
}
export const speakingHome = (studentId?: string, search = "") =>
  speakingRpc<SpeakingHome>("rpc_ielts_speaking_workspace", {
    p_student_id: studentId ?? null,
    p_search: search,
  });
export const speakingSession = (id: string) =>
  speakingRpc<SpeakingSession & { source_hash: string; can_record: boolean }>(
    "rpc_ielts_speaking_session",
    { p_session_id: id },
  );
export async function speakingAudio(path: string) {
  const { data, error } = await supabase.storage
    .from("ielts-speaking-pilot")
    .createSignedUrl(path, 900);
  if (error || !data?.signedUrl)
    throw new Error(
      "We could not open the recording. Check your connection and try again.",
    );
  return data.signedUrl;
}
export interface LocalSpeakingAudio {
  id: string;
  sessionId: string;
  ownerId: string;
  part: number;
  chunks: Blob[];
  interrupted: boolean;
  complete: boolean;
  archived?: boolean;
  blob?: Blob;
}
const openLocal = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open("bh-speaking-recovery-v1", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("recordings", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(new Error("Local recording storage is unavailable."));
    r.onblocked = () =>
      reject(new Error("Close the other interview tab and try again."));
  });
export async function localSpeaking(
  action: "put" | "delete" | "list",
  input?: LocalSpeakingAudio | string,
): Promise<LocalSpeakingAudio[]> {
  const db = await openLocal();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "recordings",
        action === "list" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("recordings");
      const request =
        action === "put"
          ? store.put(input)
          : action === "delete"
            ? store.delete(input as string)
            : store.getAll();
      tx.oncomplete = () =>
        resolve(
          action === "list" ? (request.result as LocalSpeakingAudio[]) : [],
        );
      tx.onerror = () =>
        reject(
          new Error(
            "Your device could not protect this recording. Keep this page open.",
          ),
        );
      tx.onabort = () =>
        reject(
          new Error(
            "Your device could not protect this recording. Keep this page open.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function prepareSpeakingWav(native: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await native.arrayBuffer());
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration <= 0 ||
      decoded.duration > 360
    )
      throw new Error("Recording length needs checking.");
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeSpeakingWav(rendered.getChannelData(0))], {
      type: "audio/wav",
    });
  } finally {
    await context.close();
  }
}
export async function uploadSpeakingAudio(
  audio: LocalSpeakingAudio,
): Promise<SpeakingSession & { source_hash: string; can_record: boolean }> {
  const blob =
    audio.blob ??
    (await prepareSpeakingWav(
      new Blob(audio.chunks, { type: audio.chunks[0]?.type || "audio/webm" }),
    ));
  const saved = { ...audio, blob, complete: true };
  await localSpeaking("put", saved);
  const path = `${audio.sessionId}/${audio.part}/${audio.id}.wav`;
  const { error } = await supabase.storage
    .from("ielts-speaking-pilot")
    .upload(path, blob, { contentType: "audio/wav", upsert: false });
  // A lost response may leave the immutable object already uploaded. Verification below is authoritative.
  if (
    error &&
    !["409", "400"].includes(
      String((error as { statusCode?: string }).statusCode),
    )
  )
    throw new Error(
      "The recording is protected on this device. Keep this page open and retry the upload.",
    );
  const { data, error: verifyError } = await supabase.functions.invoke(
    "ielts_speaking_pilot",
    {
      body: {
        action: "attach",
        sessionId: audio.sessionId,
        clipId: audio.id,
        part: audio.part,
        interrupted: audio.interrupted,
      },
    },
  );
  if (verifyError || !data?.session)
    throw new Error(
      "Your recording is protected on this device. We could not confirm the upload. Please retry.",
    );
  await localSpeaking("delete", audio.id);
  return data.session;
}
export async function speakingAi(
  id: string,
  signal: AbortSignal,
): Promise<{ id: string; source_hash: string; fields: SpeakingFeedback }> {
  const { data, error } = await supabase.functions.invoke(
    "ielts_speaking_pilot",
    { body: { action: "draft", sessionId: id }, signal },
  );
  if (error || !data?.fields)
    throw new Error(
      "AI could not prepare a complete draft. Your notes are unchanged. Try again, or continue your review.",
    );
  return data;
}

/**
 * Diagnostic Bible 2.2.0 section 10.7: interview transcripts, colour highlights, pronunciation words and the teacher's
 * Part 1-3 bands. Students receive these only after their teacher has shared a review.
 */
export type SpeakingClipAnalysis = {
  clip_id: string;
  part: number;
  transcript: string;
  highlights: SpeakingHighlight[];
  pronunciation: { assessed: boolean; words: PronunciationWord[] };
  /** Exact stretches spoken by the teacher, shown in grey (Bible 2.2.1 section 10.7). */
  speaker_turns?: { teacher?: string[] };
  prompt_version?: string;
  created_at: string;
};
export type SpeakingPartBands = {
  part_1: number; part_2: number; part_3: number;
  // Diagnostic Bible 2.3.0 section 10.8: null on rows saved before the Teacher Speaking band existed.
  fluency_coherence: number | null; lexical_resource: number | null; grammar_range_accuracy: number | null; pronunciation: number | null;
  overall: number | null;
  created_at: string; teacher_name: string | null;
};
export const SPEAKING_BAND_KEYS = [
  "fluency_coherence", "lexical_resource", "grammar_range_accuracy", "pronunciation", "part_1", "part_2", "part_3", "overall",
] as const;
export type SpeakingBandKey = (typeof SPEAKING_BAND_KEYS)[number];
export type SpeakingBands = Record<SpeakingBandKey, number | null>;
export const emptySpeakingBands = (): SpeakingBands =>
  Object.fromEntries(SPEAKING_BAND_KEYS.map((k) => [k, null])) as SpeakingBands;
export const speakingBandsFrom = (b: SpeakingPartBands | null | undefined): SpeakingBands => {
  const out = emptySpeakingBands();
  if (b) for (const k of SPEAKING_BAND_KEYS) { const v = b[k]; out[k] = v === null || v === undefined ? null : Number(v); }
  return out;
};
const SHARE_ERRORS: Array<[string, string]> = [
  ["speaking_bands_required", "Choose every band in step 3 before sharing."],
  ["speaking_all_parts_required", "A Speaking band needs recordings for Part 1, Part 2 and Part 3."],
  ["speaking_review_changed", "Someone shared a newer review of this interview. Reload the page to see it before sharing again."],
  ["speaking_review_conflict", "This share was already sent with different details. Reload the page and share again."],
  ["speaking_review_confirmation_required", "Tick the box to confirm you listened, then share. If the recordings changed, reload the page."],
  ["speaking_conditions_note_required", "Add a short note about the interruption in step 2."],
  ["speaking_audio_evidence_invalid", "One audio time span is outside its recording. Fix it in step 2."],
  ["speaking_feedback_incomplete", "Finish every comment in step 2 (at least 20 characters each)."],
  ["speaking_ai_draft_mismatch", "The AI draft is out of date. Reload the page and share again."],
];
/** Shares the written feedback and every band together (Diagnostic Bible 2.3.0 section 10.8). */
export async function shareSpeakingResult<T>(args: {
  sessionId: string; reviewId: string; expectedReviewId: string | null; sourceHash: string;
  fields: unknown; confirmed: boolean; aiDraftId: string | null; bands: SpeakingBands;
}): Promise<T> {
  const { data, error } = await supabase.rpc("rpc_ielts_share_speaking_result", {
    p_session_id: args.sessionId, p_review_id: args.reviewId, p_expected_review_id: args.expectedReviewId,
    p_source_hash: args.sourceHash, p_fields: args.fields, p_confirmed: args.confirmed, p_ai_draft_id: args.aiDraftId,
    p_bands: args.bands,
  });
  if (error) {
    const hit = SHARE_ERRORS.find(([code]) => error.message?.includes(code));
    throw new Error(hit ? hit[1] : "The result could not be shared. Nothing was sent. Check your connection and try again.");
  }
  return data as T;
}
/** Teacher-only AI band estimates (Diagnostic Bible 2.5.0 section 10.10). Never shown to students. */
export type SpeakingAiEstimates = {
  version: string;
  bands: Record<"fluency_coherence" | "lexical_resource" | "grammar_range_accuracy" | "pronunciation" | "part_1" | "part_2" | "part_3" | "overall", number | null>;
  reasons: Partial<Record<"fluency_coherence" | "lexical_resource" | "grammar_range_accuracy" | "pronunciation", string>>;
  basis: string;
  created_at?: string;
};
export type SpeakingSessionExtras = {
  analysis: SpeakingClipAnalysis[];
  missing_clips?: number;
  part_bands: SpeakingPartBands | null;
  can_set_bands: boolean;
  ai_estimates?: SpeakingAiEstimates | null;
};
export async function estimateSpeakingBands(sessionId: string): Promise<SpeakingAiEstimates | null> {
  const { data, error } = await supabase.functions.invoke("ielts_speaking_pilot", { body: { action: "estimate", sessionId } });
  if (error || !data || (data as { error?: string }).error)
    throw new Error("AI band estimates are not available right now. You can still choose every band yourself.");
  return (data as { ai_estimates?: SpeakingAiEstimates | null }).ai_estimates ?? null;
}
export const speakingExtras = (sessionId: string) =>
  speakingRpc<SpeakingSessionExtras>("rpc_ielts_speaking_session_extras", { p_session_id: sessionId });
export async function analyseSpeakingSession(sessionId: string): Promise<SpeakingSessionExtras> {
  const { data, error } = await supabase.functions.invoke("ielts_speaking_pilot", { body: { action: "analyse", sessionId } });
  if (error || !data || (data as { error?: string }).error)
    throw new Error("The transcript could not be prepared right now. The recordings are safe; try again in a minute.");
  return data as SpeakingSessionExtras;
}
export const setSpeakingPartBands = (sessionId: string, bands: [number, number, number]) =>
  speakingRpc<SpeakingSessionExtras>("rpc_ielts_set_speaking_part_bands", {
    p_session_id: sessionId, p_part_1: bands[0], p_part_2: bands[1], p_part_3: bands[2],
  });
