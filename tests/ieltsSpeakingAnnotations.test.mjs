import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const load = async (entry) => {
  const out = (await build({ entryPoints: [entry], bundle: true, format: 'esm', write: false, logLevel: 'silent' })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
};
const {
  arpabetToIpa, cleanHighlights, cleanInterviewHighlights, validatePronunciationPass, withIpa,
  PRONUNCIATION_PASS_INSTRUCTIONS, INTERVIEW_HIGHLIGHT_INSTRUCTIONS, pronunciationInstructions,
} = await load('supabase/functions/_shared/ieltsSpeakingAnnotations.ts');
const ann = await load('supabase/functions/_shared/ieltsSpeakingAnnotations.ts');
const { validateSpeakingPracticeFeedback, withPronunciationNotAssessed, withPronunciationPass, speakingKeys } = await load('supabase/functions/_shared/ieltsPracticeSpeakingFeedback.ts');
// Diagnostic Bible 2.2.0 section 10.7.
const transcript = 'I have live here since two years and I really enjoy the quiet streets near the vegetable market.';

test('IPA comes from the dictionary entry, with stress marks on the right syllable', () => {
  assert.equal(arpabetToIpa('V EH1 JH T AH0 B AH0 L'), 'ˈvɛdʒtəbəl');
  assert.equal(arpabetToIpa('B IH0 K AO1 Z'), 'bɪˈkɔz');
  assert.equal(arpabetToIpa('IH2 M P AO1 R T AH0 N T'), 'ˌɪmˈpɔrtənt');
  assert.equal(arpabetToIpa('TH R UW1'), 'θru', 'one syllable needs no stress mark');
  assert.equal(arpabetToIpa('Y UW2 N AH0 V ER1 S AH0 T IY0'), 'ˌjunəˈvɝsəti');
  assert.equal(arpabetToIpa('XX1'), null);
  assert.deepEqual(withIpa([{ word: 'vegetable', tip: 'Three syllables.' }, { word: 'zzqx', tip: 'Unknown.' }], { vegetable: 'V EH1 JH T AH0 B AH0 L' }),
    [{ word: 'vegetable', tip: 'Three syllables.', ipa: 'ˈvɛdʒtəbəl' }, { word: 'zzqx', tip: 'Unknown.', ipa: null }]);
});

test('highlights must quote the transcript, use a text criterion and carry a note; pronunciation is never highlighted from text', () => {
  const kept = cleanHighlights([
    { criterion: 'grammar_range_accuracy', kind: 'fix', quote: 'have live here since two years', note: 'Say: I have lived here for two years.' },
    { criterion: 'lexical_resource', kind: 'strength', quote: 'QUIET   streets', note: 'Precise, natural words.' },
    { criterion: 'pronunciation', kind: 'fix', quote: 'vegetable', note: 'Stress the first part.' },
    { criterion: 'lexical_resource', kind: 'fix', quote: 'I love travelling', note: 'Not in the transcript.' },
    { criterion: 'fluency_coherence', kind: 'fix', quote: 'really enjoy', note: 'Your overall band is 6.' },
    { criterion: 'lexical_resource', kind: 'strength', quote: 'quiet streets', note: 'Duplicate.' },
  ], transcript);
  assert.deepEqual(kept.map((h) => h.criterion), ['grammar_range_accuracy', 'lexical_resource']);
  assert.equal(kept[1].quote, 'QUIET streets');
});

test('the pronunciation pass lists only heard transcript words, drops names/acronyms and keeps the range rules', () => {
  const pass = validatePronunciationPass({
    assessed: true, comment: 'You are easy to understand. Some word endings are dropped.', action: 'Say word endings clearly.',
    quotes: ['quiet streets', 'not there'], low: 5.5, high: 6.5,
    words: [{ word: 'Vegetable,', tip: 'Stress the first part: VEJ-tuh-bul.' }, { word: 'IELTS', tip: 'Acronym.' }, { word: 'banana', tip: 'Not said.' }, { word: 'vegetable', tip: 'Duplicate word.' }],
  }, transcript);
  assert.deepEqual(pass.words.map((w) => w.word), ['vegetable']);
  assert.deepEqual(pass.evidence, [{ quote: 'quiet streets' }]);
  assert.deepEqual(pass.indication, { low: 5.5, high: 6.5 });
  assert.throws(() => validatePronunciationPass({ assessed: true, comment: 'Clear speech overall today.', action: 'Keep practising.', quotes: [], low: 6, high: 6, words: [] }, transcript), 'single numbers are rejected');
  assert.throws(() => validatePronunciationPass({ assessed: false, comment: 'Could not hear the learner.', action: 'Record again closer.', quotes: [], low: 5, high: 6, words: [] }, transcript), 'no range without hearing');
  const silent = validatePronunciationPass({ assessed: false, comment: 'The audio was too quiet to judge.', action: 'Record again closer to the microphone.', quotes: [], low: null, high: null, words: [{ word: 'quiet', tip: 'Ignored when not assessed.' }] }, transcript);
  assert.deepEqual(silent.words, []);
});

test('the audio pass replaces the transcript-only "not assessed" pronunciation; a failed pass keeps it', () => {
  const judged = {
    pronunciation_assessed: false, next_step: 'Record three answers and add a reason to each one.', highlights: [{ criterion: 'grammar_range_accuracy', kind: 'fix', quote: 'have live here', note: 'Say: I have lived here.' }],
    criteria: Object.fromEntries(speakingKeys.map((k) => [k, k === 'pronunciation'
      ? { comment: 'Pronunciation was not assessed from the text only.', action: 'Listen to your recording again.', quotes: [], low: null, high: null }
      : { comment: 'You answer the question and give a reason. Add more detail.', action: 'Give an example in every answer.', quotes: ['really enjoy'], low: 6, high: 7 }])),
  };
  const base = withPronunciationNotAssessed(validateSpeakingPracticeFeedback(judged, { part: 1, transcript }));
  assert.equal(base.highlights.length, 1);
  assert.equal(base.pronunciation_assessed, false);
  const pass = validatePronunciationPass({ assessed: true, comment: 'Mostly clear. Some endings drop.', action: 'Say the last sound of each word.', quotes: [], low: 6, high: 7, words: [{ word: 'streets', tip: 'Say the final s.' }] }, transcript);
  const merged = withPronunciationPass(base, pass, withIpa(pass.words, { streets: 'S T R IY1 T S' }));
  assert.equal(merged.pronunciation_assessed, true);
  assert.deepEqual(merged.criteria.pronunciation.indication, { low: 6, high: 7 });
  assert.deepEqual(merged.pronunciation_words, [{ word: 'streets', tip: 'Say the final s.', ipa: 'strits' }]);
  const unheard = withPronunciationPass(base, { ...pass, assessed: false, indication: null, words: [] }, []);
  assert.equal(unheard.pronunciation_assessed, false, 'not heard stays not assessed');
});

test('interview highlights are split per clip and the prompts keep the safeguards', () => {
  const byClip = cleanInterviewHighlights({ highlights: [
    { clip_id: 'a', criterion: 'lexical_resource', kind: 'strength', quote: 'quiet streets', note: 'Good words.' },
    { clip_id: 'b', criterion: 'lexical_resource', kind: 'strength', quote: 'quiet streets', note: 'Wrong clip.' },
  ] }, [{ id: 'a', transcript }, { id: 'b', transcript: 'Something else entirely.' }]);
  assert.equal(byClip['a'].length, 1);
  assert.equal(byClip['b'].length, 0);
  assert.match(INTERVIEW_HIGHLIGHT_INSTRUCTIONS, /ONLY the student's words/);
  assert.match(INTERVIEW_HIGHLIGHT_INSTRUCTIONS, /never pronunciation/);
  assert.match(PRONUNCIATION_PASS_INSTRUCTIONS, /Judge from the AUDIO/);
  assert.match(PRONUNCIATION_PASS_INSTRUCTIONS, /Do not write phonetic symbols/);
  assert.match(PRONUNCIATION_PASS_INSTRUCTIONS, /Do NOT give an overall Speaking score/);
  assert.match(pronunciationInstructions(true), /Judge ONLY the student/);
});

test('speech-to-text echoes of the hint or JSON question lists are removed, real speech is kept', () => {
  const hint = ann.INTERVIEW_TRANSCRIPTION_HINT;
  const segs = ann.dropPromptEcho([
    { text: 'ou want to work?","What do you want to do when you grow up?" I was listening to my father' },
    { text: 'your parents help you?","Who should be responsible for helping adults learn new skills?"' },
    { text: 'at Silk Road International School. Write exactly what is said' },
    { text: 'I started to analyse his speech.' },
  ], hint);
  assert.deepEqual(segs.map((s) => s.text), ['I was listening to my father', 'I started to analyse his speech.']);
  assert.doesNotMatch(hint, /\?/, 'the hint never contains questions');
  assert.equal(ann.stripLeadingEcho("Let's talk about your daily routine. What time do you usually get up on weekdays? I get up at seven.", "Let's talk about your daily routine. What time do you usually get up on weekdays?"), 'I get up at seven.');
  assert.equal(ann.stripLeadingEcho('I get up at seven.', 'What time do you usually get up on weekdays?'), 'I get up at seven.');
});

test('teacher lines are separated: highlights and pronunciation words use only the student\'s words', () => {
  const t = 'Do you work or are you a student? I am a student. I am educating in a school. Perfect. What do you enjoy most? I enjoy science.';
  const teacher = ann.cleanTeacherLines({ teacher_lines: [
    { clip_id: 'c', quote: 'Do you work or are you a student?' }, { clip_id: 'c', quote: 'Perfect. What do you enjoy most?' }, { clip_id: 'c', quote: 'Not said at all' },
  ] }, [{ id: 'c', transcript: t }]);
  assert.deepEqual(teacher.c, ['Do you work or are you a student?', 'Perfect. What do you enjoy most?']);
  const student = ann.studentOnlyText(t, teacher.c);
  assert.doesNotMatch(student, /What do you enjoy/);
  const hl = ann.cleanInterviewHighlights({ highlights: [
    { clip_id: 'c', criterion: 'lexical_resource', kind: 'fix', quote: 'educating in a school', note: 'Say: studying at a school.' },
    { clip_id: 'c', criterion: 'fluency_coherence', kind: 'strength', quote: 'What do you enjoy most', note: 'Teacher words are never highlighted.' },
  ] }, [{ id: 'c', transcript: t, teacherLines: teacher.c }]);
  assert.deepEqual(hl.c.map((h) => h.quote), ['educating in a school']);
  const pass = ann.validatePronunciationPass({ assessed: true, comment: 'Clear speech overall in this answer.', action: 'Keep word endings clear.', quotes: [], low: 6, high: 7,
    words: [{ word: 'enjoy', tip: 'Stress the second part.', confidence: 'high' }, { word: 'student', tip: 'Clear t at the end.', confidence: 'low' }, { word: 'work', tip: 'Teacher word.', confidence: 'high' }] }, student);
  assert.deepEqual(pass.words.map((w) => w.word), ['enjoy'], 'only sure words from the student');
});

test('production IPA keeps only dictionary words (non-words are vocabulary problems)', () => {
  const dict = { flexible: 'F L EH1 K S AH0 B AH0 L' };
  assert.deepEqual(ann.withIpa([{ word: 'flexible', tip: 'x' }, { word: 'conversate', tip: 'y' }], dict, true).map((w) => w.word), ['flexible']);
  assert.equal(ann.INTERVIEW_ANALYSIS_VERSION, 'bh-ielts-speaking-interview-analysis-v3');
  assert.match(readFileSync('supabase/migrations/20261114110000_ielts_speaking_analysis_v3.sql', 'utf8'), /'bh-ielts-speaking-interview-analysis-v3'/, 'SQL and edge function agree on the current version');
  assert.match(ann.HIGHLIGHT_INSTRUCTIONS, /never praise a phrase that is awkward or wrong/);
  assert.match(ann.INTERVIEW_HIGHLIGHT_INSTRUCTIONS, /teacher_lines/);
});

test('looping or speech-dropping transcripts are rejected; normal answers pass', () => {
  const loop = 'Should schools give more time to practical skills? Why or why not? '.repeat(6) + 'How might technology change learning?';
  assert.equal(ann.transcriptLooksComplete(loop, 295), false, 'too few words for five minutes and repeated');
  const answer = Array.from({ length: 30 }, (_, i) => `I think answer number ${i} has its own reason and example.`).join(' ');
  assert.equal(ann.transcriptLooksComplete(answer, 200), true);
  assert.equal(ann.transcriptLooksComplete('Thank you.', 3), true, 'very short clips are not judged by speed');
});
