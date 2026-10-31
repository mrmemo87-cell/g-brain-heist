/** Original draft. Content approval is server recorded against its exact hash. */
export const SPEAKING_CRITERIA = [
    {
        key: "fluency_coherence",
        label: "Fluency and Coherence",
        focus: "Keep speaking, develop ideas and make your answer easy to follow.",
    },
    {
        key: "lexical_resource",
        label: "Lexical Resource",
        focus: "Choose clear, suitable words and explain an idea another way when needed.",
    },
    {
        key: "grammar_range_accuracy",
        label: "Grammatical Range and Accuracy",
        focus: "Use different sentence patterns and control grammar.",
    },
    {
        key: "pronunciation",
        label: "Pronunciation",
        focus: "Make your meaning clear through sounds, stress, rhythm and intonation.",
    },
];
export const emptySpeakingFeedback = () => ({
    observations: Object.fromEntries(SPEAKING_CRITERIA.map((c) => [
        c.key,
        { status: "insufficient_evidence", comment: "", evidence: [] },
    ])),
    next_step: "",
    delivery_comment: "",
});
export function validateSpeakingFeedback(value, clips) {
    const f = value;
    if (!f ||
        Object.keys(f).sort().join() !==
            "delivery_comment,next_step,observations" ||
        typeof f.next_step !== "string" ||
        f.next_step.trim().length < 10 ||
        f.next_step.length > 900 ||
        typeof f.delivery_comment !== "string" ||
        f.delivery_comment.length > 900 ||
        !f.observations ||
        Object.keys(f.observations).sort().join() !==
            SPEAKING_CRITERIA.map((c) => c.key)
                .sort()
                .join())
        throw new Error("Incomplete feedback");
    for (const { key } of SPEAKING_CRITERIA) {
        const o = f.observations[key];
        if (!o ||
            Object.keys(o).sort().join() !== "comment,evidence,status" ||
            !["observed", "developing", "insufficient_evidence"].includes(o.status) ||
            typeof o.comment !== "string" ||
            o.comment.trim().length < 20 ||
            o.comment.length > 900 ||
            !Array.isArray(o.evidence) ||
            o.evidence.length > 3 ||
            (o.status !== "insufficient_evidence" && !o.evidence.length))
            throw new Error("Incomplete observation");
        for (const span of o.evidence) {
            const clip = clips.find((c) => c.id === span.clip_id);
            if (!clip ||
                !Number.isFinite(span.start_seconds) ||
                !Number.isFinite(span.end_seconds) ||
                span.start_seconds < 0 ||
                span.end_seconds <= span.start_seconds ||
                span.end_seconds > clip.duration_seconds)
                throw new Error("Invalid audio evidence");
        }
    }
    return f;
}
export function speakingTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function encodeSpeakingWav(samples, rate = 16000) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buffer);
    const word = (offset, text) => [...text].forEach((char, i) => v.setUint8(offset + i, char.charCodeAt(0)));
    word(0, "RIFF");
    v.setUint32(4, 36 + samples.length * 2, true);
    word(8, "WAVE");
    word(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    word(36, "data");
    v.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767)), true));
    return buffer;
}
