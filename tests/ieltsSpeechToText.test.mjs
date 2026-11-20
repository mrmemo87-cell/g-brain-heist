import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const load = async (entry) => {
  const out = (await build({ entryPoints: [entry], bundle: true, format: 'esm', write: false, logLevel: 'silent' })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
};
const stt = await load('supabase/functions/_shared/ieltsSpeechToText.ts');
const { transcriptLooksComplete } = await load('supabase/functions/_shared/ieltsSpeakingAnnotations.ts');

// Diagnostic Bible 2.5.1 section 10.7. Confidences are the real Scribe values for one interview answer (2026-11-20).
const scribe = {
  text: 'Uh, as I remembered, my parents really wanted me to learn swimming. [clears throat] Um, first at all, I can\'t swim very well, but he was very pa-pa-patient. And then, uh, it\'s make my life.',
  words: [
    { text: 'Uh,', type: 'word', start: 0.4, end: 0.6, logprob: -0.0001 },
    { text: ' ', type: 'spacing', start: 0.6, end: 0.62 },
    { text: 'as', type: 'word', start: 2.7, end: 2.8, logprob: -0.0002 },
    { text: 'remembered,', type: 'word', start: 3.06, end: 3.5, logprob: -0.115 },
    { text: 'swimming.', type: 'word', start: 6.96, end: 7.4, logprob: -0.25 },
    { text: '(clears throat)', type: 'audio_event', start: 7.5, end: 8 },
    { text: 'first', type: 'word', start: 31.2, end: 31.6, logprob: -0.001 },
    { text: 'at', type: 'word', start: 31.8, end: 31.9, logprob: -0.576 },
    { text: 'all,', type: 'word', start: 31.9, end: 32.2, logprob: -0.0003 },
    { text: 'pa-pa-patient.', type: 'word', start: 38.62, end: 39.8, logprob: -0.026 },
    { text: "it's", type: 'word', start: 66, end: 66.3, logprob: -0.0004 },
    { text: 'make', type: 'word', start: 68.9, end: 69.2, logprob: -0.0002 },
    { text: 'life.', type: 'word', start: 69.86, end: 70.2, logprob: -0.0001 },
  ],
};

test('Scribe output becomes words only: sound tags and spacing never enter the transcript', () => {
  const heard = stt.readScribeResponse(scribe, 'scribe_v2');
  assert.equal(heard.model, 'scribe_v2');
  assert.doesNotMatch(heard.text, /clears throat|\[|\]/);
  assert.match(heard.text, /first at all/, 'the student\'s own words, mistakes included, are kept');
  assert.equal(heard.words.length, 11, 'spacing and audio events are not words');
  assert.deepEqual(heard.words[3], { text: 'swimming.', start: 6.96, end: 7.4, logprob: -0.25, speaker: null });
  assert.equal(stt.removeSoundTags('I think, [laughs] it is (laughs) good .'), 'I think, it is good.');
  assert.throws(() => stt.readScribeResponse({ words: [] }, 'scribe_v2'), /scribe_invalid/);
  assert.throws(() => stt.readScribeResponse({ text: '[laughs]' }, 'scribe_v2'), /scribe_empty/);
});

test('words below the confidence threshold are unsure; the threshold catches exactly the disputed words', () => {
  const heard = stt.readScribeResponse(scribe, 'scribe_v2');
  assert.equal(stt.UNSURE_WORD_LOGPROB, -0.1);
  assert.deepEqual(stt.unsureWords(stt.wordConfidence(heard.words)), ['at', 'remembered', 'swimming']);
  assert.deepEqual(stt.unsureWords(stt.wordConfidence([{ text: 'odd', start: 0, end: 1, logprob: null, speaker: null }])), [], 'no confidence means trusted');
});

test('an unsure word is never highlighted or listed as mispronounced', () => {
  const confidence = stt.wordConfidence(stt.readScribeResponse(scribe, 'scribe_v2').words);
  const highlights = [
    { criterion: 'grammar_range_accuracy', kind: 'fix', quote: 'it\'s make my life', note: 'Say: it makes my life better.' },
    { criterion: 'lexical_resource', kind: 'fix', quote: 'first at all', note: 'Say: first of all.' },
    { criterion: 'lexical_resource', kind: 'strength', quote: 'learn Swimming.', note: 'Good.' },
    { criterion: 'lexical_resource', kind: 'fix', quote: 'not in the word list', note: 'Left to the transcript quote check.' },
  ];
  assert.deepEqual(stt.withoutUnsureHighlights(highlights, confidence).map((h) => h.quote), ['it\'s make my life', 'not in the word list']);
  assert.deepEqual(stt.withoutUnsureHighlights(highlights, stt.NO_CONFIDENCE), highlights, 'the OpenAI fallback has no confidences and blocks nothing');
  assert.deepEqual(stt.withoutUnsureWords([{ word: 'Swimming' }, { word: 'patient' }], confidence), [{ word: 'patient' }]);
});

test('the check is made where the quote was heard: an unsure "on" elsewhere does not block a clear one', () => {
  // Real case (2026-11-20): Scribe was unsure of "on" and "themselves" in the last sentence only.
  const w = (text, logprob) => ({ text, start: 0, end: 0.1, logprob, speaker: null });
  const confidence = stt.wordConfidence([
    w('they', -0.001), w('can', -0.001), w('depend,', -0.002), w('depend', -0.001), w('on', -0.001), w('theirself.', -0.03),
    w('it', -0.001), w('depends', -0.002), w('on,', -0.3), w('mm,', -0.001), w('by', -0.001), w('themselves.', -0.2),
  ]);
  const kept = stt.withoutUnsureHighlights([
    { quote: 'depend on theirself' },
    { quote: 'depends on, mm, by themselves' },
  ], confidence);
  assert.deepEqual(kept.map((h) => h.quote), ['depend on theirself']);
  assert.deepEqual(stt.withoutUnsureWords([{ word: 'on' }, { word: 'themselves' }], confidence), [{ word: 'on' }], 'a word heard clearly once is kept');
});

test('word times keep the stored [word, seconds] format; draft segments split at sentences, pauses and speakers', () => {
  const heard = stt.readScribeResponse(scribe, 'scribe_v2');
  assert.deepEqual(stt.timedWords(heard.words).slice(0, 2), [['Uh,', 0.4], ['as', 2.7]]);
  const segments = stt.segmentsFromWords(heard.words);
  assert.ok(segments.every((s) => s.end > s.start && s.text));
  assert.deepEqual(segments.map((s) => s.text),
    ['Uh,', 'as remembered,', 'swimming.', 'first at all,', 'pa-pa-patient.', "it's", 'make life.'],
    'a sentence end or a pause over 1.2 seconds starts a new segment');
  const two = stt.segmentsFromWords([
    { text: 'Where', start: 0, end: 0.3, logprob: 0, speaker: 'speaker_0' },
    { text: 'do', start: 0.3, end: 0.4, logprob: 0, speaker: 'speaker_0' },
    { text: 'I', start: 0.5, end: 0.6, logprob: 0, speaker: 'speaker_1' },
  ]);
  assert.deepEqual(two.map((s) => s.text), ['Where do', 'I']);
});

test('the request asks for verbatim words with confidences, no hint and no sound tags; errors carry short codes only', async () => {
  let sent;
  const ok = async (_url, init) => { sent = init; return new Response(JSON.stringify(scribe), { status: 200 }); };
  const heard = await stt.scribeTranscribe(new ArrayBuffer(8), { apiKey: 'k', fetchImpl: ok });
  assert.equal(heard.model, 'scribe_v2');
  assert.equal(sent.headers['xi-api-key'], 'k');
  assert.equal(sent.body.get('model_id'), 'scribe_v2');
  assert.equal(sent.body.get('tag_audio_events'), 'false');
  assert.equal(sent.body.get('no_verbatim'), 'false');
  assert.equal(sent.body.get('timestamps_granularity'), 'word');
  assert.equal(sent.body.get('prompt'), null, 'no hint, so questions can never be echoed (Bible 10.7)');
  assert.equal(sent.body.get('diarize'), null);
  const quota = async () => new Response(JSON.stringify({ detail: { code: 'quota_exceeded', message: 'secret text' } }), { status: 401 });
  await assert.rejects(stt.scribeTranscribe(new ArrayBuffer(8), { apiKey: 'k', fetchImpl: quota }), (e) => e.message === 'scribe_401:quota_exceeded');
});

test('a looping Scribe transcript fails the completeness check, so the OpenAI fallback runs', () => {
  const loop = 'I think that is the way it is. '.repeat(20);
  assert.equal(transcriptLooksComplete(loop, 60), false);
  assert.equal(transcriptLooksComplete(stt.readScribeResponse(scribe, 'scribe_v2').text, 10), true);
});

test('all three Speaking functions use Scribe first and keep their OpenAI fallback', () => {
  for (const fn of ['ielts_practice_speaking_feedback', 'ielts_speaking_pilot', 'ielts_speaking_word_times']) {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
    assert.match(src, /ELEVENLABS_API_KEY/, fn);
    assert.match(src, /scribeTranscribe/, fn);
    assert.match(src, /api\.openai\.com\/v1\/audio\/transcriptions/, `${fn} keeps the OpenAI fallback`);
  }
  const practice = readFileSync('supabase/functions/ielts_practice_speaking_feedback/index.ts', 'utf8');
  assert.match(practice, /withoutUnsureHighlights/);
  const pilot = readFileSync('supabase/functions/ielts_speaking_pilot/index.ts', 'utf8');
  assert.match(pilot, /withoutUnsureHighlights/);
  assert.match(pilot, /clip\.heardBy/, 'the speech-to-text model is recorded with each analysis');
});

test('a transcription is kept once and rebuilt exactly, so the review step does not pay for it again', () => {
  const heard = stt.readScribeResponse(scribe, 'scribe_v2');
  const detail = stt.wordDetail(heard.words);
  assert.equal(detail.length, stt.timedWords(heard.words).length, 'detail and public word times have the same length');
  assert.deepEqual(detail[3], ['swimming.', 6.96, 7.4, -0.25]);
  const back = stt.wordsFromDetail(JSON.parse(JSON.stringify(detail)));
  assert.deepEqual(back.map(({ speaker, ...w }) => w), heard.words.map(({ speaker, ...w }) => w));
  assert.deepEqual(stt.unsureWords(stt.wordConfidence(back)), ['at', 'remembered', 'swimming'], 'confidences survive storage');
  assert.equal(stt.textFromWords(back), "Uh, as remembered, swimming. first at all, pa-pa-patient. it's make life.");
  assert.deepEqual(stt.segmentsFromWords(back).map((s) => s.text), stt.segmentsFromWords(heard.words).map((s) => s.text));
  assert.deepEqual(stt.wordsFromDetail([['ok', 1, 0.5, null], ['', 1, 2, null], 'x', ['fine', 2, 3, 'bad']]),
    [{ text: 'fine', start: 2, end: 3, logprob: null, speaker: null }], 'malformed entries are dropped');
  assert.deepEqual(stt.wordsFromDetail(null), []);
});

test('the interview reuses kept words in both steps and only transcribes when they are missing or incomplete', () => {
  const pilot = readFileSync('supabase/functions/ielts_speaking_pilot/index.ts', 'utf8');
  assert.match(pilot, /const kept = await keptScribeWords\(admin, sessionId\);/, 'review step reads kept words');
  assert.match(pilot, /const kept = await keptScribeWords\(admin, body\.sessionId\);/, 'draft step reads kept words');
  assert.match(pilot, /transcribeForAnalysis\(bytes, key, Number\(clip\.duration_seconds\) \|\| 0, kept\.get\(clip\.id\)\)/);
  assert.match(pilot, /transcriptLooksComplete\(textFromWords\(kept\.words\), seconds\)/, 'kept words pass the same completeness check');
  assert.match(pilot, /if \(heard\.scribe\) await keepScribeWords\(admin, sessionId, clip\.id, heard\.scribe\);/);
});

test('the kept detail is service-only: browsers never receive confidences', () => {
  const sql = readFileSync('supabase/migrations/20261120230000_ielts_speaking_clip_words_detail.sql', 'utf8');
  assert.match(sql, /alter table private\.ielts_speaking_clip_words add column if not exists detail jsonb;/);
  for (const fn of ['rpc_ielts_save_speaking_clip_transcript_words\\(uuid,uuid,jsonb,jsonb,text\\)', 'rpc_ielts_speaking_clip_words_detail\\(uuid\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\s+from public,anon,authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\s+to service_role`));
  }
  assert.doesNotMatch(sql, /to authenticated|to anon/);
  assert.match(sql, /on conflict \(clip_id\) do nothing/, 'insert-once, like the word times');
  assert.match(sql, /jsonb_array_length\(p_detail\)<>jsonb_array_length\(p_words\)/);
  assert.doesNotMatch(sql, /create or replace function public\.rpc_ielts_speaking_clip_words\(/, 'the public word-time read is unchanged');
});
