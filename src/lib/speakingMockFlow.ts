// Diagnostic Bible 2.7.0 section 10.12: where a recorded-examiner mock continues, worked out only
// from what the server has recorded. Nothing here decides timing or scores; the server does.
import type { MockLine, MockSitting } from "../../services/ieltsSpeakingMockService";

export type MockResume =
  | { kind: "done" }
  | { kind: "saving" }
  | { kind: "checks" }
  | { kind: "play"; index: number }
  | { kind: "preparing"; index: number }
  | { kind: "closing"; index: number };

export const answerable = (l: MockLine) => l.kind === "question" || l.kind === "long_turn";

export function sortedLines(s: MockSitting) {
  return [...s.lines].sort((a, b) => a.position - b.position);
}

export function resumePoint(s: MockSitting): MockResume {
  if (s.status === "submitted") return { kind: "done" };
  if (s.finished) return { kind: "saving" };
  if (!s.checks_passed) return { kind: "checks" };
  const lines = sortedLines(s);
  const answered = new Set(s.answers.map((a) => a.line_key));
  const nextIdx = lines.findIndex((l) => answerable(l) && !answered.has(l.key));
  if (nextIdx < 0) {
    const lastAnswer = lines.reduce((m, l, i) => (answerable(l) ? i : m), -1);
    return { kind: "closing", index: lastAnswer + 1 };
  }
  const next = lines[nextIdx];
  if (next.kind === "long_turn") {
    const prepIdx = lines.findIndex((l) => l.kind === "prepare");
    // Once the minute has started on the server, the student goes straight back to the cue card.
    return s.preparation_started_at ? { kind: "preparing", index: prepIdx } : { kind: "play", index: firstAfterAnswered(lines, answered, prepIdx) };
  }
  return { kind: "play", index: firstAfterAnswered(lines, answered, nextIdx) };
}

/** Starts from the first line after the last answered one, so part introductions are heard again. */
function firstAfterAnswered(lines: MockLine[], answered: Set<string>, upTo: number) {
  let start = 0;
  for (let i = 0; i < upTo; i++) if (answerable(lines[i]) && answered.has(lines[i].key)) start = i + 1;
  // The sound check is its own screen before the test.
  if (start === 0 && lines[0]?.kind === "sound_check") start = 1;
  return start;
}

/** The part that has just ended when the student moves past line `index`, if any. */
export function partEndingAt(lines: MockLine[], index: number): number | null {
  const here = lines[index], next = lines[index + 1];
  if (!here || here.part < 1 || here.part > 3) return null;
  if (!next || next.part !== here.part) return here.part;
  return null;
}

/** Seconds of Part 2 preparation left, from the server's start time and the server clock. */
export function preparationLeft(startedAt: string | null, serverOffsetMs: number, nowMs = Date.now()) {
  if (!startedAt) return 60;
  const elapsed = (nowMs + serverOffsetMs - Date.parse(startedAt)) / 1000;
  return Math.max(0, Math.ceil(60 - elapsed));
}

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Device checks. Thresholds are practice settings, not scores. Levels are dBFS (0 = loudest). */
export const ROOM_NOISE_LIMIT_DB = -38;
export const VOICE_MIN_PEAK_DB = -30;
export const roomVerdict = (averageDb: number) => (averageDb > ROOM_NOISE_LIMIT_DB ? "noisy" : "quiet");
export const voiceVerdict = (peakDb: number) => (peakDb < VOICE_MIN_PEAK_DB ? "too_quiet" : "ok");
export function levelDb(samples: Float32Array) {
  let sum = 0, peak = 0;
  for (const v of samples) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  const db = (x: number) => (x <= 0 ? -100 : Math.max(-100, 20 * Math.log10(x)));
  return { average: db(rms), peak: db(peak) };
}

export const PART_NAMES: Record<number, string> = { 0: "Introduction", 1: "Part 1", 2: "Part 2", 3: "Part 3", 4: "End" };
