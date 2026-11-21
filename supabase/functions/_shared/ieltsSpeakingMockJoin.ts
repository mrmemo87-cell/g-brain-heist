// Diagnostic Bible 2.7.0 section 10.12: the server joins a recorded-examiner mock's answers,
// one part at a time, into the same 16 kHz mono WAV an interview clip uses. The joined clip
// then goes through the existing interview pipeline unchanged.
import { inspectSpeakingWav } from "./ieltsSpeakingAudio.ts";

export const MOCK_RATE = 16000;
export const MOCK_BYTES_PER_SECOND = 32000;
/** Silence between two answers in a joined part, so answers never run together. */
export const MOCK_GAP_SECONDS = 0.8;
/** The interview clip limit (ielts_speaking_clips.duration_seconds). */
export const MOCK_PART_MAX_SECONDS = 360;

export type MockLine = { key: string; position: number; part: number; kind: string; answer_seconds: number | null };
export type MockAnswer = {
  id: string;
  line_key: string;
  part: number;
  uploaded: boolean;
  missing: boolean;
  verified: boolean;
  file_deleted: boolean;
};
export type MockSegment = { line_key: string; start: number; end: number };

const answerable = (l: MockLine) => l.kind === "question" || l.kind === "long_turn";

/**
 * What a part needs before it can be joined. `ready` only when every answer line in the part
 * has an answer that is uploaded or marked missing, and at least one has audio.
 */
export function partPlan(lines: MockLine[], answers: MockAnswer[], part: number) {
  const partLines = lines.filter((l) => l.part === part && answerable(l)).sort((a, b) => a.position - b.position);
  const byKey = new Map(answers.map((a) => [a.line_key, a]));
  const waiting = partLines.filter((l) => {
    const a = byKey.get(l.key);
    return !a || (!a.uploaded && !a.missing);
  });
  const withAudio = partLines
    .map((l) => ({ line: l, answer: byKey.get(l.key) }))
    .filter((x): x is { line: MockLine; answer: MockAnswer } => !!x.answer && x.answer.uploaded && !x.answer.missing);
  return {
    ready: partLines.length > 0 && waiting.length === 0 && withAudio.length > 0,
    noAudio: partLines.length > 0 && waiting.length === 0 && withAudio.length === 0,
    waiting: waiting.map((l) => l.key),
    withAudio,
  };
}

/** Reads one answer file. Over-long audio is cut at the line's time limit, never stretched. */
export function answerPcm(bytes: ArrayBuffer, limitSeconds: number) {
  const { duration } = inspectSpeakingWav(bytes);
  const keep = Math.min(duration, limitSeconds);
  const samples = Math.floor(keep * MOCK_RATE);
  if (samples <= 0) throw new Error("invalid_recording");
  return { pcm: new Uint8Array(bytes, 44, samples * 2), duration: samples / MOCK_RATE, original: duration };
}

function header(dataBytes: number) {
  const b = new ArrayBuffer(44);
  const v = new DataView(b);
  const w = (p: number, s: string) => [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, MOCK_RATE, true);
  v.setUint32(28, MOCK_BYTES_PER_SECOND, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, dataBytes, true);
  return new Uint8Array(b);
}

/** Joins answers in line order with a short silence between them and records where each starts. */
export function joinAnswers(parts: { line_key: string; pcm: Uint8Array }[]) {
  if (parts.length === 0) throw new Error("no_audio");
  const gap = Math.round(MOCK_GAP_SECONDS * MOCK_RATE) * 2;
  const dataBytes = parts.reduce((n, p) => n + p.pcm.byteLength, 0) + gap * (parts.length - 1);
  if (dataBytes / MOCK_BYTES_PER_SECOND > MOCK_PART_MAX_SECONDS) throw new Error("part_too_long");
  const out = new Uint8Array(44 + dataBytes);
  out.set(header(dataBytes), 0);
  const segments: MockSegment[] = [];
  let at = 44;
  parts.forEach((p, i) => {
    if (i > 0) at += gap; // silence is already zero
    const start = (at - 44) / MOCK_BYTES_PER_SECOND;
    out.set(p.pcm, at);
    at += p.pcm.byteLength;
    segments.push({ line_key: p.line_key, start: round(start), end: round((at - 44) / MOCK_BYTES_PER_SECOND) });
  });
  const bytes = out.buffer as ArrayBuffer;
  return { bytes, segments, duration: inspectSpeakingWav(bytes).duration };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** A stable clip id per sitting and part, so a retried join writes the same file and row. */
export async function partClipId(sessionId: string, part: number) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bh-speaking-mock-part:${sessionId}:${part}`)));
  d[6] = (d[6] & 0x0f) | 0x50;
  d[8] = (d[8] & 0x3f) | 0x80;
  const h = [...d.slice(0, 16)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function sha256Hex(b: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
