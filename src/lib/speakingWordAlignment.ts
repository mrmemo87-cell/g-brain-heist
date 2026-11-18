// Places speech-to-text word times on the transcript that is shown on screen.
//
// The displayed transcript and the timed words can come from two different speech-to-text passes, so their words
// do not match one for one. This walks both in order, matches equal words within a small look-ahead window, and
// spreads the time between matched neighbours over the words in between. The timed words are never shown; they
// only say when each displayed word was spoken.

/** [word, start_seconds] in spoken order. */
export type TimedWord = [string, number];

export type TranscriptToken = { text: string; start: number; end: number };

const normal = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Whitespace-separated tokens of the transcript with their character positions. */
export function transcriptTokens(transcript: string): TranscriptToken[] {
  const tokens: TranscriptToken[] = [];
  const re = /\S+/gu;
  for (let m = re.exec(transcript); m; m = re.exec(transcript)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

const WINDOW = 14;

/**
 * Start time in seconds for every transcript token, or null where it cannot be placed. Returns all nulls when
 * too little of the transcript matches the timed words to trust the result.
 */
export function alignWordTimes(tokens: TranscriptToken[], timed: TimedWord[]): Array<number | null> {
  const times = new Array<number | null>(tokens.length).fill(null);
  const words = timed
    .filter((w) => Array.isArray(w) && typeof w[0] === 'string' && Number.isFinite(Number(w[1])))
    .map((w) => ({ key: normal(w[0]), time: Number(w[1]) }))
    .filter((w) => w.key);
  if (!tokens.length || !words.length) return times;

  const keys = tokens.map((token) => normal(token.text));
  let j = 0;
  let matched = 0;
  for (let i = 0; i < keys.length && j < words.length; i++) {
    if (!keys[i]) continue;
    // Nearest equal word ahead in the timed list…
    let hit = -1;
    for (let k = j; k < Math.min(words.length, j + WINDOW); k++) {
      if (words[k].key === keys[i]) { hit = k; break; }
    }
    if (hit < 0) continue;
    // …unless a later transcript word matches the timed word we are standing on sooner (the transcript has
    // extra words here, so do not jump the timed list forward for a chance repeat).
    if (hit > j) {
      let sooner = false;
      for (let k = i + 1; k < Math.min(keys.length, i + 1 + (hit - j)); k++) {
        if (keys[k] && keys[k] === words[j].key) { sooner = true; break; }
      }
      if (sooner) continue;
    }
    times[i] = words[hit].time;
    matched += 1;
    j = hit + 1;
  }

  const spoken = keys.filter(Boolean).length;
  if (matched < 3 || matched / Math.max(1, spoken) < 0.4) return times.fill(null);

  // Keep times non-decreasing, then spread unmatched words evenly between their matched neighbours.
  let last = -Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t === null) continue;
    if (t < last) times[i] = null; else last = t;
  }
  let prev = -1;
  for (let i = 0; i <= times.length; i++) {
    if (i < times.length && times[i] === null) continue;
    if (prev >= 0 && i < times.length && i - prev > 1) {
      const from = times[prev] as number;
      const to = times[i] as number;
      for (let k = prev + 1; k < i; k++) times[k] = Math.round((from + ((to - from) * (k - prev)) / (i - prev)) * 100) / 100;
    }
    prev = i;
  }
  return times;
}

/** Index of the token being spoken at `seconds`: the last token whose time is not after it. */
export function tokenAtTime(times: Array<number | null>, seconds: number): number {
  let found = -1;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t === null) continue;
    if (t <= seconds + 0.05) found = i; else break;
  }
  return found;
}
