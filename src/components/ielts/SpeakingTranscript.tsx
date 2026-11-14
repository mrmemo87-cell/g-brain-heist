import React, { useMemo, useState } from 'react';
import type { PronunciationWord, SpeakingHighlight } from '../../../services/ieltsPracticeFeedback';
import '../../styles/ielts-speaking-transcript.css';

/**
 * Colour-coded Speaking transcript (Diagnostic Bible 2.2.0 section 10.7; Visual & UX Bible 13.3, 13.9).
 * Each assessment criterion has its own colour AND a text tag, so meaning never depends on colour alone.
 * Pronunciation marks come only from the audio pass; the IPA comes from a pronouncing dictionary.
 */
export const SPEAKING_CRITERIA_LEGEND = [
  { key: 'fluency_coherence', short: 'FC', label: 'Fluency & Coherence' },
  { key: 'lexical_resource', short: 'LR', label: 'Vocabulary (Lexical Resource)' },
  { key: 'grammar_range_accuracy', short: 'GR', label: 'Grammar (Range & Accuracy)' },
  { key: 'pronunciation', short: 'P', label: 'Pronunciation' },
] as const;
const shortOf = Object.fromEntries(SPEAKING_CRITERIA_LEGEND.map(c => [c.key, c.short])) as Record<string, string>;
const labelOf = Object.fromEntries(SPEAKING_CRITERIA_LEGEND.map(c => [c.key, c.label])) as Record<string, string>;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Span = { start: number; end: number };
/** Finds a quote in the transcript, tolerant of case and spacing. */
export function findQuote(transcript: string, quote: string, from = 0): Span | null {
  const words = quote.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
  if (!words.length) return null;
  const re = new RegExp(words.join('\\s+'), 'giu');
  re.lastIndex = from;
  const m = re.exec(transcript);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/** Every whole-word occurrence of a word (letters/apostrophes boundaries). */
export function findWord(transcript: string, word: string): Span[] {
  const re = new RegExp(`(?<![\\p{L}'])${escapeRegex(word)}(?![\\p{L}'])`, 'giu');
  const out: Span[] = [];
  for (let m = re.exec(transcript); m; m = re.exec(transcript)) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

type Piece = { text: string; h: number; p: number; t: boolean };
/**
 * Splits the transcript into runs labelled with at most one highlight and one pronunciation word, and whether the
 * teacher spoke it. Teacher stretches are placed first; highlights and pronunciation marks never land on them.
 */
export function annotate(transcript: string, highlights: SpeakingHighlight[], words: PronunciationWord[], teacherLines: string[] = []): { pieces: Piece[]; placed: number[] } {
  const h = new Array<number>(transcript.length).fill(-1);
  const p = new Array<number>(transcript.length).fill(-1);
  const t = new Array<boolean>(transcript.length).fill(false);
  const placed: number[] = [];
  teacherLines.forEach(line => {
    let from = 0;
    for (;;) {
      const span = findQuote(transcript, line, from);
      if (!span) return;
      if (t.slice(span.start, span.end).every(v => !v)) { for (let k = span.start; k < span.end; k++) t[k] = true; return; }
      from = span.start + 1;
    }
  });
  highlights.forEach((hl, i) => {
    let from = 0;
    for (;;) {
      const span = findQuote(transcript, hl.quote, from);
      if (!span) return;
      if (h.slice(span.start, span.end).every(v => v === -1) && t.slice(span.start, span.end).every(v => !v)) {
        for (let k = span.start; k < span.end; k++) h[k] = i;
        placed.push(i);
        return;
      }
      from = span.start + 1;
    }
  });
  words.forEach((w, i) => findWord(transcript, w.word).forEach(span => {
    if (t[span.start]) return; // never mark the teacher's words
    for (let k = span.start; k < span.end; k++) p[k] = i;
  }));
  const pieces: Piece[] = [];
  for (let k = 0; k < transcript.length; k++) {
    const last = pieces[pieces.length - 1];
    if (last && last.h === h[k] && last.p === p[k] && last.t === t[k]) last.text += transcript[k];
    else pieces.push({ text: transcript[k], h: h[k], p: p[k], t: t[k] });
  }
  return { pieces, placed };
}

/** Plays a word with the device's own voice (free). Hidden when the browser has no speech voices. */
function speak(word: string) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.8;
    const voice = synth.getVoices().find(v => v.lang?.toLowerCase().startsWith('en-us')) ?? synth.getVoices().find(v => v.lang?.toLowerCase().startsWith('en'));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch { /* speech is optional */ }
}
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

type Props = {
  transcript: string;
  /** Undefined when the feedback was made before highlights existed (the colour key is then hidden). */
  highlights?: SpeakingHighlight[];
  /** Undefined when no listening pass ran for this recording. */
  pronunciationWords?: PronunciationWord[];
  /** Interview only: exact stretches the teacher spoke, shown in grey and never marked. */
  teacherLines?: string[];
  /** False when the audio pass did not run or could not hear the learner. */
  pronunciationAssessed?: boolean;
  /** "teacher" adds the short criterion codes to each note; "student" uses friendlier headings. */
  audience?: 'teacher' | 'student';
  title?: string;
};

export default function SpeakingTranscript({ transcript, highlights: rawHighlights, pronunciationWords: rawWords, teacherLines = [], pronunciationAssessed = true, audience = 'student', title }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const annotated = rawHighlights !== undefined;
  const wordsChecked = rawWords !== undefined;
  const highlights = useMemo(() => rawHighlights ?? [], [rawHighlights]);
  const pronunciationWords = useMemo(() => rawWords ?? [], [rawWords]);
  const { pieces, placed } = useMemo(() => annotate(transcript, highlights, pronunciationWords, teacherLines), [transcript, highlights, pronunciationWords, teacherLines]);
  // Tags are numbered in reading order, so FC1, GR2, LR3… follow the transcript from top to bottom.
  const order = useMemo(() => {
    const first = new Map<number, number>();
    let at = 0;
    for (const piece of pieces) { if (piece.h >= 0 && !first.has(piece.h)) first.set(piece.h, at); at += piece.text.length; }
    return placed.slice().sort((a, b) => (first.get(a) ?? 0) - (first.get(b) ?? 0));
  }, [pieces, placed]);
  const number = useMemo(() => new Map(order.map((i, n) => [i, n + 1])), [order]);
  const speechOk = canSpeak();
  const counts = SPEAKING_CRITERIA_LEGEND.map(c => ({
    ...c,
    n: c.key === 'pronunciation' ? pronunciationWords.length : placed.filter(i => highlights[i].criterion === c.key).length,
  }));

  // Group consecutive pieces sharing a highlight so one <mark> wraps the whole phrase.
  const groups: Array<{ h: number; t: boolean; parts: Piece[] }> = [];
  for (const piece of pieces) {
    const g = groups[groups.length - 1];
    if (g && g.h === piece.h && g.t === piece.t) g.parts.push(piece); else groups.push({ h: piece.h, t: piece.t, parts: [piece] });
  }
  const renderParts = (parts: Piece[]) => parts.map((part, k) => part.p >= 0
    ? <mark key={k} className="st-pron" title={`Pronunciation: ${pronunciationWords[part.p].tip}`}>{part.text}<span className="st-sr"> (pronunciation word)</span></mark>
    : <React.Fragment key={k}>{part.text}</React.Fragment>);
  const hasTeacher = groups.some(g => g.t);

  const activeNote = active !== null ? highlights[active] : null;

  return (
    <section className="st-panel" aria-label={title ?? 'Transcript with feedback highlights'}>
      {title ? <h3 className="st-title">{title}</h3> : null}
      {annotated ? (
        <ul className="st-legend" aria-label="Colour key">
          {counts.filter(c => c.key !== 'pronunciation' || wordsChecked).map(c => (
            <li key={c.key} className={`st-key st-c-${c.key}`}>
              <span className="st-swatch" aria-hidden="true">{c.short}</span>{c.label}
              <span className="st-count">{c.n}</span>
            </li>
          ))}
          {hasTeacher ? <li className="st-key st-key--teacher"><span className="st-swatch" aria-hidden="true">T</span>Teacher's questions</li> : null}
        </ul>
      ) : (
        <p className="st-legacy">This feedback was made before colour highlights were added, so the transcript is shown without them.</p>
      )}

      <p className="st-text">
        {transcript.trim() ? groups.map((g, gi) => g.t ? (
          <span key={gi} className="st-teacher"><span className="st-teacher-tag" aria-hidden="true">T</span><span className="st-sr">Teacher: </span>{g.parts.map(p => p.text).join('')}</span>
        ) : g.h >= 0 ? (
          <mark
            key={gi}
            className={`st-hl st-c-${highlights[g.h].criterion} st-${highlights[g.h].kind}${active === g.h ? ' is-active' : ''}`}
            tabIndex={0}
            role="button"
            aria-pressed={active === g.h}
            aria-label={`${labelOf[highlights[g.h].criterion]}, ${highlights[g.h].kind === 'fix' ? 'to improve' : 'done well'}: ${g.parts.map(p => p.text).join('')}`}
            onClick={() => setActive(active === g.h ? null : g.h)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(active === g.h ? null : g.h); } }}
          >
            {renderParts(g.parts)}
            <sup className="st-tag" aria-hidden="true">{shortOf[highlights[g.h].criterion]}{number.get(g.h)}</sup>
          </mark>
        ) : <React.Fragment key={gi}>{renderParts(g.parts)}</React.Fragment>) : <span className="st-empty">No words were heard in this recording.</span>}
      </p>

      {activeNote ? (
        <div className={`st-callout st-c-${activeNote.criterion}`} role="status">
          <strong>{activeNote.kind === 'fix' ? 'To improve' : 'Done well'} · {labelOf[activeNote.criterion]}</strong>
          <span>“{activeNote.quote}” — {activeNote.note}</span>
        </div>
      ) : placed.length ? <p className="st-hint">Tap a highlighted phrase to see the note.</p> : null}

      {placed.length ? (
        <ol className="st-notes" aria-label="Highlight notes">
          {order.map(i => {
            const hl = highlights[i];
            return (
              <li key={i} className={`st-note st-c-${hl.criterion}`}>
                <span className="st-note-tag">{shortOf[hl.criterion]}{number.get(i)}</span>
                <span className={`st-kind st-kind--${hl.kind}`}>{hl.kind === 'fix' ? '✎ To improve' : '✓ Done well'}</span>
                {audience === 'teacher' ? <span className="st-note-crit">{labelOf[hl.criterion]}</span> : null}
                <q>{hl.quote}</q>
                <span className="st-note-text">{hl.note}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="st-pron-block">
        <h4>Pronunciation corrections</h4>
        {!wordsChecked ? (
          <p className="st-muted">Word-by-word pronunciation was not checked for this recording.</p>
        ) : !pronunciationAssessed ? (
          <p className="st-muted">Pronunciation was not assessed for this recording, so no word corrections are shown.</p>
        ) : pronunciationWords.length === 0 ? (
          <p className="st-muted st-good">No individual words were clearly mispronounced in this recording.</p>
        ) : (
          <>
            <ul className="st-words">
              {pronunciationWords.map(w => (
                <li key={w.word} className="st-word">
                  <div className="st-word-head">
                    <b>{w.word}</b>
                    {w.ipa ? <span className="st-ipa" lang="en-fonipa" aria-label={`Phonetic transcription ${w.ipa}`}>/{w.ipa}/</span> : <span className="st-ipa st-muted">no dictionary entry</span>}
                    {speechOk ? (
                      <button type="button" className="st-play" onClick={() => speak(w.word)} aria-label={`Play the word ${w.word}`}>
                        <span aria-hidden="true">▶</span> Play
                      </button>
                    ) : null}
                  </div>
                  <p>{w.tip}</p>
                </li>
              ))}
            </ul>
            <p className="st-fine">Phonetic spelling from the CMU Pronouncing Dictionary (American English). ▶ uses your device's voice.</p>
          </>
        )}
      </div>
    </section>
  );
}
