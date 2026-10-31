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
