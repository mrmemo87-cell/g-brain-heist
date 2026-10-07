import { supabase } from "./supabaseClient";
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
export const speakingHome = () =>
  speakingRpc<SpeakingHome>("rpc_ielts_speaking_home");
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
