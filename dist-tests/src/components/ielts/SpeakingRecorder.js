import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../services/supabaseClient.js";
import { localSpeaking, speakingRpc, uploadSpeakingAudio, } from "../../../services/ieltsSpeakingPilotService.js";
import { speakingTime, } from "../../../services/ieltsSpeakingPilot.js";
import { stopBackgroundMusic } from "../../../services/audioService.js";
export function SpeakingRecorder({ session, part, onSaved, enabled, onActiveChange, workflow, }) {
    const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [elapsed, setElapsed] = useState(0), [error, setError] = useState("");
    const [pending, setPending] = useState([]), [tested, setTested] = useState(false), [testUrl, setTestUrl] = useState("");
    const recorder = useRef(null), stream = useRef(null), current = useRef(null);
    const writes = useRef(Promise.resolve()), mounted = useRef(true), started = useRef(0), timer = useRef(null), lock = useRef(false);
    const latest = useRef({ session, onSaved, workflow });
    latest.current = { session, onSaved, workflow };
    const testUrlRef = useRef("");
    useEffect(() => {
        onActiveChange(recording || busy || pending.some((a) => !a.archived));
    }, [recording, busy, pending, onActiveChange]);
    const stop = (interrupted = false) => {
        if (current.current && interrupted)
            current.current.interrupted = true;
        if (recorder.current?.state === "recording")
            recorder.current.stop();
        if (timer.current)
            clearInterval(timer.current);
        timer.current = null;
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
    };
    useEffect(() => {
        mounted.current = true;
        stopBackgroundMusic();
        const recover = async () => {
            try {
                const { data } = await supabase.auth.getUser();
                if (!data.user)
                    return;
                const rows = (await localSpeaking("list")).filter((a) => a.ownerId === data.user.id && a.sessionId === session.id);
                if (mounted.current) {
                    setPending(rows);
                    if (rows.some((a) => !a.complete))
                        setError("An interrupted recording was recovered. Save it as an interrupted clip before continuing.");
                }
            }
            catch {
                if (mounted.current)
                    setError("Recording recovery is unavailable on this device. Check browser storage settings before starting.");
            }
        };
        void recover();
        const background = () => {
            if (document.hidden && recorder.current?.state === "recording") {
                stop(true);
                if (mounted.current)
                    setError("Recording stopped when the page was hidden. Keep this tab open. Save the interrupted clip, then continue in a new clip.");
            }
        };
        const offline = () => {
            if (recorder.current?.state === "recording") {
                if (current.current)
                    current.current.interrupted = true;
                void Promise.resolve(latest.current.workflow
                    ? latest.current.workflow.incident(session.id)
                    : supabase.rpc("rpc_ielts_speaking_incident", {
                        p_session_id: session.id,
                        p_incident_id: crypto.randomUUID(),
                        p_reason: "connection",
                    })).catch(() => { });
            }
        };
        const unload = (e) => {
            if (recorder.current?.state === "recording" || lock.current) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        document.addEventListener("visibilitychange", background);
        window.addEventListener("offline", offline);
        window.addEventListener("beforeunload", unload);
        return () => {
            mounted.current = false;
            stop(true);
            document.removeEventListener("visibilitychange", background);
            window.removeEventListener("offline", offline);
            window.removeEventListener("beforeunload", unload);
            if (testUrlRef.current)
                URL.revokeObjectURL(testUrlRef.current);
        };
    }, [session.id]);
    const checkMic = async () => {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            if (!navigator.mediaDevices?.getUserMedia ||
                typeof MediaRecorder === "undefined")
                throw new Error("This browser cannot record audio. Use a supported browser with microphone access.");
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.current = s;
            const r = new MediaRecorder(s);
            const chunks = [];
            recorder.current = r;
            r.ondataavailable = (e) => {
                if (e.data.size)
                    chunks.push(e.data);
            };
            await new Promise((resolve, reject) => {
                r.onstop = () => {
                    if (testUrlRef.current)
                        URL.revokeObjectURL(testUrlRef.current);
                    const url = URL.createObjectURL(new Blob(chunks, { type: r.mimeType }));
                    testUrlRef.current = url;
                    if (mounted.current) {
                        setTestUrl(url);
                        setTested(false);
                    }
                    resolve();
                };
                r.onerror = () => reject(new Error("Microphone check failed."));
                r.start();
                setTimeout(() => {
                    if (r.state === "recording")
                        r.stop();
                    s.getTracks().forEach((t) => t.stop());
                }, 3000);
            });
        }
        catch (reason) {
            if (mounted.current)
                setError(reason instanceof Error
                    ? reason.message
                    : "Allow microphone access, then try again.");
        }
        finally {
            stream.current?.getTracks().forEach((t) => t.stop());
            stream.current = null;
            recorder.current = null;
            lock.current = false;
            if (mounted.current)
                setBusy(false);
        }
    };
    const start = async () => {
        if (lock.current || !enabled || pending.some((a) => !a.archived))
            return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            const { data } = await supabase.auth.getUser();
            if (!data.user)
                throw new Error("Sign in again before recording.");
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.current = s;
            const preferred = [
                "audio/webm;codecs=opus",
                "audio/mp4",
                "audio/webm",
            ].find((t) => MediaRecorder.isTypeSupported(t));
            const r = new MediaRecorder(s, preferred ? { mimeType: preferred } : undefined);
            recorder.current = r;
            const audio = {
                id: crypto.randomUUID(),
                ownerId: data.user.id,
                sessionId: session.id,
                part,
                chunks: [],
                interrupted: false,
                complete: false,
            };
            current.current = audio;
            await localSpeaking("put", audio);
            await (workflow
                ? workflow.begin(session.id, audio.id, part)
                : speakingRpc("rpc_ielts_begin_speaking_capture", {
                    p_session_id: session.id,
                    p_clip_id: audio.id,
                    p_part: part,
                }));
            writes.current = Promise.resolve();
            r.ondataavailable = (e) => {
                if (e.data.size) {
                    audio.chunks.push(e.data);
                    const snapshot = { ...audio, chunks: [...audio.chunks] };
                    writes.current = writes.current
                        .then(() => localSpeaking("put", snapshot))
                        .catch(() => {
                        audio.interrupted = true;
                        stop(true);
                        if (mounted.current)
                            setError("Your device could not protect the recording. Keep this page open and save the clip now.");
                    });
                }
            };
            r.onstop = () => {
                stop();
                audio.complete = true;
                writes.current = writes.current
                    .then(() => localSpeaking("put", { ...audio }))
                    .catch(() => { })
                    .then(() => {
                    if (mounted.current) {
                        setPending((old) => [
                            ...old.filter((a) => a.id !== audio.id),
                            audio,
                        ]);
                        setRecording(false);
                        setBusy(false);
                    }
                    lock.current = false;
                    recorder.current = null;
                    current.current = null;
                });
            };
            r.onerror = () => {
                audio.interrupted = true;
                stop(true);
                if (mounted.current)
                    setError("The microphone stopped. Save the interrupted clip, then check the microphone before continuing.");
            };
            s.getAudioTracks().forEach((t) => (t.onended = () => {
                if (r.state === "recording")
                    stop(true);
            }));
            r.start(1000);
            started.current = Date.now();
            setElapsed(0);
            setRecording(true);
            setBusy(false);
            timer.current = setInterval(() => {
                const seconds = (Date.now() - started.current) / 1000;
                if (mounted.current)
                    setElapsed(seconds);
                const cap = workflow ? 120 : part === 2 ? 120 : 300;
                if (seconds >= cap)
                    stop();
            }, 250);
        }
        catch (reason) {
            stop(true);
            if (current.current && current.current.chunks.length === 0) {
                if (workflow)
                    await workflow
                        .abandon(session.id, current.current.id)
                        .catch(() => { });
                await localSpeaking("delete", current.current.id).catch(() => { });
                current.current = null;
            }
            recorder.current = null;
            lock.current = false;
            setBusy(false);
            setError(reason instanceof Error
                ? reason.message
                : "We could not start recording. Check microphone permission.");
        }
    };
    const save = async (audio) => {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            const recovered = {
                ...audio,
                interrupted: audio.interrupted || !audio.complete,
                complete: true,
            };
            const value = workflow
                ? await workflow.upload(recovered)
                : (await uploadSpeakingAudio(recovered));
            if (mounted.current) {
                setPending((old) => old.filter((a) => a.id !== audio.id));
                latest.current.onSaved(value);
            }
        }
        catch (reason) {
            if (mounted.current)
                setError(reason instanceof Error
                    ? reason.message
                    : "Upload could not finish. Keep this page open and retry.");
        }
        finally {
            lock.current = false;
            if (mounted.current)
                setBusy(false);
        }
    };
    return (_jsxs("section", { className: "sp-recorder", "aria-label": workflow ? "Practice recording" : "Interview recording", "aria-busy": busy, children: [error && (_jsx("p", { role: "alert", className: "sp-alert", children: error })), !recording && !pending.some((a) => !a.archived) && (_jsxs(_Fragment, { children: [_jsx("button", { className: "sp-secondary", type: "button", disabled: busy, onClick: () => void checkMic(), children: busy ? "Checking microphone…" : "Check microphone · 3 seconds" }), testUrl && (_jsxs("div", { children: [_jsx("audio", { src: testUrl, controls: true, "aria-label": "Microphone test" }), _jsxs("label", { className: "sp-check", children: [_jsx("input", { type: "checkbox", checked: tested, onChange: (e) => setTested(e.target.checked) }), workflow
                                        ? "I listened: my voice can be heard clearly."
                                        : "I listened: both voices can be heard clearly."] })] })), _jsx("button", { className: "sp-primary", type: "button", disabled: !tested || busy || !enabled, onClick: () => void start(), children: workflow ? "Record my response" : `Record Part ${part}` })] })), recording && (_jsxs("div", { className: "sp-recording", children: [_jsx("span", { className: "sp-record-dot", "aria-hidden": "true" }), _jsxs("strong", { children: ["Recording \u00B7 ", speakingTime(elapsed)] }), _jsx("button", { className: "sp-secondary", type: "button", onClick: () => stop(), children: "Stop and protect clip" }), _jsxs("p", { children: ["Keep this tab open.", " ", workflow
                                ? "Aim for 45–90 seconds. Recording stops at 2:00."
                                : part === 2
                                    ? "The long turn stops at 2:00."
                                    : "Aim for 4–5 minutes. Recording stops at 5:00."] })] })), pending.map((a) => (_jsxs("div", { className: "sp-local", children: [_jsxs("strong", { children: [workflow ? "Your response" : `Part ${a.part}`, " \u00B7", " ", a.interrupted || !a.complete
                                ? "Interrupted clip"
                                : "Clip ready to save"] }), _jsx("p", { children: a.archived
                            ? "Kept as a device backup after an interruption. It has not been submitted as assessment evidence."
                            : "Upload this clip before continuing. Keep this page open if a device-saving warning appears." }), _jsx("button", { className: "sp-primary", type: "button", disabled: busy || !!a.archived, onClick: () => void save(a), children: busy ? "Checking and uploading…" : "Save recording" }), _jsx("button", { className: "sp-secondary", type: "button", disabled: busy, onClick: () => {
                            const blob = a.blob ??
                                new Blob(a.chunks, { type: a.chunks[0]?.type || "audio/webm" });
                            const url = URL.createObjectURL(blob), link = document.createElement("a");
                            link.href = url;
                            link.download = `speaking-part-${a.part}-backup.${blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") ? "m4a" : "webm"}`;
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }, children: "Download device backup" }), error && !a.archived && (_jsx("button", { className: "sp-secondary", type: "button", disabled: busy, onClick: async () => {
                            if (lock.current)
                                return;
                            lock.current = true;
                            setBusy(true);
                            try {
                                await (workflow
                                    ? workflow.abandon(session.id, a.id)
                                    : speakingRpc("rpc_ielts_speaking_incident", {
                                        p_session_id: session.id,
                                        p_incident_id: crypto.randomUUID(),
                                        p_reason: "microphone",
                                    }));
                                const backup = { ...a, archived: true, interrupted: true };
                                await localSpeaking("put", backup);
                                setPending((old) => old.map((row) => (row.id === a.id ? backup : row)));
                                setError("The interrupted backup is kept. Record a new clip to continue; your teacher must note the interruption.");
                            }
                            catch {
                                setError("We could not record the interruption. Keep the backup and try again when connected.");
                            }
                            finally {
                                lock.current = false;
                                setBusy(false);
                            }
                        }, children: "Keep interrupted backup and record a new clip" }))] }, a.id))), busy && (_jsx("p", { role: "status", children: "Please keep this page open while this step finishes." }))] }));
}
