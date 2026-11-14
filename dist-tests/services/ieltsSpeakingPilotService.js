import { supabase } from "./supabaseClient.js";
import { encodeSpeakingWav, } from "./ieltsSpeakingPilot.js";
export async function speakingRpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error)
        throw new Error("We could not confirm that step. Your saved recordings are safe. Check your connection and access, then try again.");
    return data;
}
export const speakingHome = (studentId, search = "") => speakingRpc("rpc_ielts_speaking_workspace", {
    p_student_id: studentId ?? null,
    p_search: search,
});
export const speakingSession = (id) => speakingRpc("rpc_ielts_speaking_session", { p_session_id: id });
export async function speakingAudio(path) {
    const { data, error } = await supabase.storage
        .from("ielts-speaking-pilot")
        .createSignedUrl(path, 900);
    if (error || !data?.signedUrl)
        throw new Error("We could not open the recording. Check your connection and try again.");
    return data.signedUrl;
}
const openLocal = () => new Promise((resolve, reject) => {
    const r = indexedDB.open("bh-speaking-recovery-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("recordings", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error("Local recording storage is unavailable."));
    r.onblocked = () => reject(new Error("Close the other interview tab and try again."));
});
export async function localSpeaking(action, input) {
    const db = await openLocal();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction("recordings", action === "list" ? "readonly" : "readwrite");
            const store = tx.objectStore("recordings");
            const request = action === "put"
                ? store.put(input)
                : action === "delete"
                    ? store.delete(input)
                    : store.getAll();
            tx.oncomplete = () => resolve(action === "list" ? request.result : []);
            tx.onerror = () => reject(new Error("Your device could not protect this recording. Keep this page open."));
            tx.onabort = () => reject(new Error("Your device could not protect this recording. Keep this page open."));
        });
    }
    finally {
        db.close();
    }
}
export async function prepareSpeakingWav(native) {
    const context = new AudioContext();
    try {
        const decoded = await context.decodeAudioData(await native.arrayBuffer());
        if (!Number.isFinite(decoded.duration) ||
            decoded.duration <= 0 ||
            decoded.duration > 360)
            throw new Error("Recording length needs checking.");
        const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const rendered = await offline.startRendering();
        return new Blob([encodeSpeakingWav(rendered.getChannelData(0))], {
            type: "audio/wav",
        });
    }
    finally {
        await context.close();
    }
}
export async function uploadSpeakingAudio(audio) {
    const blob = audio.blob ??
        (await prepareSpeakingWav(new Blob(audio.chunks, { type: audio.chunks[0]?.type || "audio/webm" })));
    const saved = { ...audio, blob, complete: true };
    await localSpeaking("put", saved);
    const path = `${audio.sessionId}/${audio.part}/${audio.id}.wav`;
    const { error } = await supabase.storage
        .from("ielts-speaking-pilot")
        .upload(path, blob, { contentType: "audio/wav", upsert: false });
    // A lost response may leave the immutable object already uploaded. Verification below is authoritative.
    if (error &&
        !["409", "400"].includes(String(error.statusCode)))
        throw new Error("The recording is protected on this device. Keep this page open and retry the upload.");
    const { data, error: verifyError } = await supabase.functions.invoke("ielts_speaking_pilot", {
        body: {
            action: "attach",
            sessionId: audio.sessionId,
            clipId: audio.id,
            part: audio.part,
            interrupted: audio.interrupted,
        },
    });
    if (verifyError || !data?.session)
        throw new Error("Your recording is protected on this device. We could not confirm the upload. Please retry.");
    await localSpeaking("delete", audio.id);
    return data.session;
}
export async function speakingAi(id, signal) {
    const { data, error } = await supabase.functions.invoke("ielts_speaking_pilot", { body: { action: "draft", sessionId: id }, signal });
    if (error || !data?.fields)
        throw new Error("AI could not prepare a complete draft. Your notes are unchanged. Try again, or continue your review.");
    return data;
}
export const SPEAKING_BAND_KEYS = [
    "fluency_coherence", "lexical_resource", "grammar_range_accuracy", "pronunciation", "part_1", "part_2", "part_3", "overall",
];
export const emptySpeakingBands = () => Object.fromEntries(SPEAKING_BAND_KEYS.map((k) => [k, null]));
export const speakingBandsFrom = (b) => {
    const out = emptySpeakingBands();
    if (b)
        for (const k of SPEAKING_BAND_KEYS) {
            const v = b[k];
            out[k] = v === null || v === undefined ? null : Number(v);
        }
    return out;
};
const SHARE_ERRORS = [
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
export async function shareSpeakingResult(args) {
    const { data, error } = await supabase.rpc("rpc_ielts_share_speaking_result", {
        p_session_id: args.sessionId, p_review_id: args.reviewId, p_expected_review_id: args.expectedReviewId,
        p_source_hash: args.sourceHash, p_fields: args.fields, p_confirmed: args.confirmed, p_ai_draft_id: args.aiDraftId,
        p_bands: args.bands,
    });
    if (error) {
        const hit = SHARE_ERRORS.find(([code]) => error.message?.includes(code));
        throw new Error(hit ? hit[1] : "The result could not be shared. Nothing was sent. Check your connection and try again.");
    }
    return data;
}
export const speakingExtras = (sessionId) => speakingRpc("rpc_ielts_speaking_session_extras", { p_session_id: sessionId });
export async function analyseSpeakingSession(sessionId) {
    const { data, error } = await supabase.functions.invoke("ielts_speaking_pilot", { body: { action: "analyse", sessionId } });
    if (error || !data || data.error)
        throw new Error("The transcript could not be prepared right now. The recordings are safe; try again in a minute.");
    return data;
}
export const setSpeakingPartBands = (sessionId, bands) => speakingRpc("rpc_ielts_set_speaking_part_bands", {
    p_session_id: sessionId, p_part_1: bands[0], p_part_2: bands[1], p_part_3: bands[2],
});
