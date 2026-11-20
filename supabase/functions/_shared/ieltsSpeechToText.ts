/**
 * Speech-to-text for IELTS Speaking (Diagnostic Bible 2.5.1 section 10.7).
 *
 * ElevenLabs Scribe is the first choice because it writes what the learner actually said: fillers, repeats,
 * self-corrections and grammar mistakes stay in the transcript instead of being tidied into correct English.
 * The OpenAI models remain the fallback (callers keep their existing code for that).
 *
 * Bible rules applied here:
 * - The transcript records words, never sounds or pauses, so audio-event tags are switched off and removed.
 * - No hint is sent, so the questions can never be copied into the transcript.
 * - Each word keeps Scribe's confidence (log probability). Words below UNSURE_WORD_LOGPROB are "unsure": they are
 *   never highlighted or listed as a pronunciation word, because they may be speech-to-text errors.
 *
 * This module has no Deno globals so the tests can bundle it for Node.
 */
import type { SpeakingSegment } from './ieltsSpeakingAudio.ts';
import type { SpeakingHighlight } from './ieltsSpeakingAnnotations.ts';

export const SCRIBE_DEFAULT_MODEL = 'scribe_v2';
const SCRIBE_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

/**
 * Words less sure than this are treated as possible speech-to-text errors.
 * -0.1 is roughly "less than 90% sure". Set on 2026-11-20 from a real interview recording: the five words Scribe
 * scored below it ("swimming" twice, "swim", "at" in "first at all", "remembered") were exactly the words that
 * other models heard differently; every other real word scored above it. Review it with more recordings.
 */
export const UNSURE_WORD_LOGPROB = -0.1;

export type SpokenWord = { text: string; start: number; end: number; logprob: number | null; speaker: string | null };
export type SpeechToTextResult = { text: string; words: SpokenWord[]; model: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ScribeOptions = {
  apiKey: string;
  model?: string;
  /** Interviews: label the two speakers so the teacher's questions can be told apart from the student. */
  diarize?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

/** "[laughs]", "(clears throat)" and similar sound tags are not words (Bible 10.7). */
export function removeSoundTags(text: string): string {
  return text.replace(/\[[^\]]{0,40}\]|\((?:[a-z ]{0,30})\)/gi, ' ').replace(/\s+([,.?!])/g, '$1').replace(/\s+/g, ' ').trim();
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads Scribe's response into plain text and words. Throws when there is no usable text. */
export function readScribeResponse(value: unknown, model: string): SpeechToTextResult {
  const out = value as { text?: unknown; words?: unknown } | null;
  if (!out || typeof out.text !== 'string') throw new Error('scribe_invalid');
  const words: SpokenWord[] = [];
  for (const raw of Array.isArray(out.words) ? out.words : []) {
    const w = raw as { text?: unknown; type?: unknown; start?: unknown; end?: unknown; logprob?: unknown; speaker_id?: unknown };
    if (w?.type !== 'word' || typeof w.text !== 'string' || !w.text.trim()) continue;
    const start = num(w.start); const end = num(w.end);
    if (start === null || end === null || end < start) continue;
    words.push({
      text: w.text.trim().slice(0, 60),
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      logprob: num(w.logprob),
      speaker: typeof w.speaker_id === 'string' ? w.speaker_id.slice(0, 40) : null,
    });
    if (words.length >= 8000) break;
  }
  const text = removeSoundTags(out.text).slice(0, 20000);
  if (!text) throw new Error('scribe_empty');
  return { text, words, model };
}

/** One Scribe request. Errors carry short codes only (never audio, text or provider bodies). */
export async function scribeTranscribe(bytes: ArrayBuffer, options: ScribeOptions): Promise<SpeechToTextResult> {
  const model = options.model?.trim() || SCRIBE_DEFAULT_MODEL;
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'clip.wav');
  form.append('model_id', model);
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');
  form.append('timestamps_granularity', 'word');
  form.append('no_verbatim', 'false');
  if (options.diarize) {
    form.append('diarize', 'true');
    form.append('num_speakers', '2');
  }
  const signal = options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 90000);
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const response = await doFetch(SCRIBE_URL, { method: 'POST', signal, headers: { 'xi-api-key': options.apiKey }, body: form });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: { code?: unknown; status?: unknown } } | null;
    const code = String(detail?.detail?.code ?? detail?.detail?.status ?? 'unknown').replace(/[^a-z_]/gi, '').slice(0, 40);
    throw new Error(`scribe_${response.status}:${code}`);
  }
  return readScribeResponse(await response.json().catch(() => null), model);
}

/** [word, start_seconds] pairs in the format already stored for synchronised playback. */
export function timedWords(words: SpokenWord[]): Array<[string, number]> {
  return words.map((w): [string, number] => [w.text, w.start]).slice(0, 8000);
}

/**
 * Service-only copy of a transcription, so a recording is transcribed once and the later review step reuses it:
 * [word, start, end, log_probability|null] in spoken order (same length as timedWords).
 */
export type WordDetail = [string, number, number, number | null];
export function wordDetail(words: SpokenWord[]): WordDetail[] {
  return words.map((w): WordDetail => [w.text, w.start, w.end, w.logprob]).slice(0, 8000);
}

/** Rebuilds the words kept by wordDetail. Malformed entries are dropped; an empty result means "transcribe again". */
export function wordsFromDetail(value: unknown): SpokenWord[] {
  if (!Array.isArray(value)) return [];
  const words: SpokenWord[] = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || typeof raw[0] !== 'string' || !raw[0].trim()) continue;
    const start = num(raw[1]); const end = num(raw[2]);
    if (start === null || end === null || end < start) continue;
    words.push({ text: raw[0].trim().slice(0, 60), start, end, logprob: num(raw[3]), speaker: null });
    if (words.length >= 8000) break;
  }
  return words;
}

/** The transcript text rebuilt from kept words (each Scribe word already carries its punctuation). */
export function textFromWords(words: SpokenWord[]): string {
  return words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 20000);
}

/**
 * Timestamped segments for the teacher draft: a new segment after a sentence end, a pause over 1.2 seconds, a
 * change of speaker or 30 seconds of speech.
 */
export function segmentsFromWords(words: SpokenWord[]): SpeakingSegment[] {
  const segments: SpeakingSegment[] = [];
  let current: SpokenWord[] = [];
  const flush = () => {
    if (!current.length) return;
    const start = Math.round(current[0].start * 10) / 10;
    const end = Math.round(current[current.length - 1].end * 10) / 10;
    const text = current.map((w) => w.text).join(' ').slice(0, 600);
    if (text && end > start) segments.push({ start, end, text });
    current = [];
  };
  for (const word of words) {
    const last = current[current.length - 1];
    if (last && (word.start - last.end > 1.2 || word.speaker !== last.speaker || word.end - current[0].start > 30)) flush();
    current.push(word);
    if (/[.?!]$/.test(word.text)) flush();
  }
  flush();
  return segments.slice(0, 400);
}

const normal = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');

/**
 * The transcript's words in spoken order, each marked sure or unsure. Checks are made at the actual position of a
 * quote, so an unsure "on" in one sentence does not block a clearly heard "on" in another.
 * Words without a confidence are trusted. An empty index (OpenAI fallback) blocks nothing.
 */
export type WordConfidence = { tokens: string[]; unsure: boolean[] };
export const NO_CONFIDENCE: WordConfidence = { tokens: [], unsure: [] };

export function wordConfidence(words: SpokenWord[], threshold = UNSURE_WORD_LOGPROB): WordConfidence {
  const tokens: string[] = []; const unsure: boolean[] = [];
  for (const w of words) {
    for (const part of w.text.split(/\s+/)) {
      const n = normal(part);
      if (!n) continue;
      tokens.push(n);
      unsure.push(w.logprob !== null && w.logprob < threshold);
    }
  }
  return { tokens, unsure };
}

/** Lower-case words Scribe was unsure of at least once (for logs and tests). */
export function unsureWords(confidence: WordConfidence): string[] {
  return [...new Set(confidence.tokens.filter((_, i) => confidence.unsure[i]))].sort();
}

/**
 * True when every place the phrase appears contains an unsure word. When the exact word sequence cannot be found
 * (punctuation or word splitting can differ), it falls back to single words: blocked if any quoted word was
 * unsure every time it was heard.
 */
function onlyHeardUnsure(phrase: string, confidence: WordConfidence): boolean {
  const quote = phrase.split(/\s+/).map(normal).filter(Boolean);
  if (!quote.length || !confidence.unsure.includes(true)) return false;
  let found = false;
  for (let i = 0; i + quote.length <= confidence.tokens.length; i++) {
    if (!quote.every((q, j) => confidence.tokens[i + j] === q)) continue;
    found = true;
    if (!confidence.unsure.slice(i, i + quote.length).includes(true)) return false;
  }
  if (found) return true;
  return quote.some((q) => {
    const at = confidence.tokens.flatMap((t, i) => (t === q ? [i] : []));
    return at.length > 0 && at.every((i) => confidence.unsure[i]);
  });
}

/** Drops highlights whose quoted words were unsure: a possible speech-to-text error is never praised or corrected. */
export function withoutUnsureHighlights<T extends Pick<SpeakingHighlight, 'quote'>>(highlights: T[], confidence: WordConfidence): T[] {
  return highlights.filter((h) => !onlyHeardUnsure(h.quote, confidence));
}

/** Drops pronunciation words that speech-to-text was unsure of everywhere they were heard. */
export function withoutUnsureWords<T extends { word: string }>(items: T[], confidence: WordConfidence): T[] {
  return items.filter((item) => !onlyHeardUnsure(item.word, confidence));
}

/** Words of one recording, ready for the transcript, highlights and draft segments. */
export type ScribeWords = { text: string; words: SpokenWord[]; model: string };

/** What transcribeOnce needs from the database and from Scribe (injected so the race can be tested). */
export type TranscribeOnceSteps = {
  /** Words already kept for this recording, if any. */
  kept: () => Promise<{ words: SpokenWord[]; model: string } | undefined>;
  /** 'done' (words kept), 'claimed' (transcribe now) or 'busy' (another step is transcribing). Throws on failure. */
  claim: () => Promise<string>;
  release: () => Promise<void>;
  /** A complete Scribe transcription, or null when it failed or looked incomplete. */
  transcribe: () => Promise<SpeechToTextResult | null>;
  keep: (heard: SpeechToTextResult) => Promise<void>;
  /** The same completeness check used for fresh transcripts (no lost speech, no loops). */
  complete: (text: string) => boolean;
  log?: (stage: string, detail: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  waitMs?: number;
  pollMs?: number;
};

/**
 * One Scribe transcription per recording, even when the teacher's AI draft and the transcript analysis start at
 * the same moment (they both start when a review is opened). The step that claims the recording transcribes it and
 * keeps the words; the other waits (its screen keeps showing that the recording is being transcribed) and reuses
 * them. A step that waits longer than waitMs transcribes the recording itself, so nothing waits forever.
 * Returns null when OpenAI should be used instead.
 */
export async function transcribeOnce(steps: TranscribeOnceSteps): Promise<ScribeWords | null> {
  const sleep = steps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = steps.now ?? (() => Date.now());
  const waitMs = steps.waitMs ?? 45000;
  const pollMs = steps.pollMs ?? 2500;
  const reuse = async (): Promise<ScribeWords | null> => {
    const kept = await steps.kept();
    if (!kept?.words.length) return null;
    const text = textFromWords(kept.words);
    return steps.complete(text) ? { text, words: kept.words, model: kept.model } : null;
  };
  const started = now();
  for (;;) {
    const ready = await reuse();
    if (ready) return ready;
    let status = 'claimed';
    try {
      status = await steps.claim();
    } catch (e) {
      // Without the claim, transcribe anyway: a lock problem must never stop a transcript.
      steps.log?.('transcription_claim', e instanceof Error ? e.message : e);
    }
    // The other step finished between our check and our claim. If its words fail the completeness check, Scribe
    // has already tried this recording, so OpenAI is used instead.
    if (status === 'done') return reuse();
    if (status === 'busy' && now() - started < waitMs) {
      await sleep(pollMs);
      continue;
    }
    if (status === 'busy') steps.log?.('transcription_wait', 'gave_up_waiting');
    try {
      const heard = await steps.transcribe();
      if (!heard) return null;
      await steps.keep(heard);
      return { text: heard.text, words: heard.words, model: `elevenlabs/${heard.model}` };
    } finally {
      if (status === 'claimed') await steps.release();
    }
  }
}
