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
    focus:
      "Choose clear, suitable words and explain an idea another way when needed.",
  },
  {
    key: "grammar_range_accuracy",
    label: "Grammatical Range and Accuracy",
    focus: "Use different sentence patterns and control grammar.",
  },
  {
    key: "pronunciation",
    label: "Pronunciation",
    focus:
      "Make your meaning clear through sounds, stress, rhythm and intonation.",
  },
] as const;
export type SpeakingKey = (typeof SPEAKING_CRITERIA)[number]["key"];
export interface SpeakingClip {
  id: string;
  part: number;
  path: string;
  sha256: string;
  duration_seconds: number;
  interrupted: boolean;
  mime_type: string;
}
export interface SpeakingObservation {
  status: "observed" | "developing" | "insufficient_evidence";
  comment: string;
  evidence: { clip_id: string; start_seconds: number; end_seconds: number }[];
}
export interface SpeakingFeedback {
  observations: Record<SpeakingKey, SpeakingObservation>;
  next_step: string;
  delivery_comment: string;
}
export interface SpeakingPackage {
  code: string;
  version: string;
  title: string;
  rights: string;
  delivery_mode: string;
  taxonomy_version: string;
  scoring_policy: string;
  instructions: string;
  teacher_instructions: string[];
  parts: {
    part: number;
    title: string;
    min_seconds: number;
    max_seconds: number;
    questions: string[];
    constructs: string[];
    cue_card?: { topic: string; points: string[]; explain: string };
    preparation_seconds?: number;
    long_turn_seconds?: number;
    follow_ups?: string[];
  }[];
  criteria: typeof SPEAKING_CRITERIA;
}
export interface SpeakingSession {
  id: string;
  student_id: string;
  teacher_id: string;
  student_name: string;
  status: "in_progress" | "submitted";
  created_at: string;
  content_hash: string;
  package: SpeakingPackage;
  clips: SpeakingClip[];
  can_review: boolean;
  evidence_kind: "first_sitting" | "same_form_practice";
  incidents: number;
  preparation_started_at: string | null;
  review: { id: string; fields: SpeakingFeedback; reviewed_at: string } | null;
  confidence: "low";
  readiness_available: false;
}
export const emptySpeakingFeedback = (): SpeakingFeedback => ({
  observations: Object.fromEntries(
    SPEAKING_CRITERIA.map((c) => [
      c.key,
      { status: "insufficient_evidence", comment: "", evidence: [] },
    ]),
  ) as unknown as SpeakingFeedback["observations"],
  next_step: "",
  delivery_comment: "",
});
export function validateSpeakingFeedback(
  value: unknown,
  clips: SpeakingClip[],
): SpeakingFeedback {
  const f = value as SpeakingFeedback;
  if (
    !f ||
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
        .join()
  )
    throw new Error("Incomplete feedback");
  for (const { key } of SPEAKING_CRITERIA) {
    const o = f.observations[key];
    if (
      !o ||
      Object.keys(o).sort().join() !== "comment,evidence,status" ||
      !["observed", "developing", "insufficient_evidence"].includes(o.status) ||
      typeof o.comment !== "string" ||
      o.comment.trim().length < 20 ||
      o.comment.length > 900 ||
      !Array.isArray(o.evidence) ||
      o.evidence.length > 3 ||
      (o.status !== "insufficient_evidence" && !o.evidence.length)
    )
      throw new Error("Incomplete observation");
    for (const span of o.evidence) {
      const clip = clips.find((c) => c.id === span.clip_id);
      if (
        !clip ||
        !Number.isFinite(span.start_seconds) ||
        !Number.isFinite(span.end_seconds) ||
        span.start_seconds < 0 ||
        span.end_seconds <= span.start_seconds ||
        span.end_seconds > clip.duration_seconds
      )
        throw new Error("Invalid audio evidence");
    }
  }
  return f;
}
export function speakingTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function encodeSpeakingWav(
  samples: Float32Array,
  rate = 16000,
): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const word = (offset: number, text: string) =>
    [...text].forEach((char, i) => v.setUint8(offset + i, char.charCodeAt(0)));
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
  samples.forEach((s, i) =>
    v.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767)),
      true,
    ),
  );
  return buffer;
}
