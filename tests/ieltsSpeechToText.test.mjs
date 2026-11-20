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

test('the interview transcribes through transcribeOnce in both steps', () => {
  const pilot = readFileSync('supabase/functions/ielts_speaking_pilot/index.ts', 'utf8');
  assert.match(pilot, /const heard = await scribeOnce\(admin, sessionId, clipId, bytes, seconds\);/, 'draft step');
  assert.match(pilot, /transcribeForAnalysis\(bytes, key, Number\(clip\.duration_seconds\) \|\| 0, admin, sessionId, clip\.id\)/, 'review step');
  assert.match(pilot, /rpc_ielts_claim_speaking_clip_transcription/);
  assert.match(pilot, /if \(!extras\?\.missing_clips\) return extras;/, 'a shared interview is never re-analysed');
  assert.match(pilot, /rpc_ielts_release_speaking_clip_transcription/);
  assert.match(pilot, /complete: \(text\) => transcriptLooksComplete\(text, seconds\)/, 'kept words pass the same completeness check');
});

// A shared fake database with the same claim rules as the migration, and a fake clock.
function world({ scribeSeconds = 20, scribeResult = 'ok' } = {}) {
  const db = { kept: undefined, claim: null };
  let clock = 0; let calls = 0;
  const heard = stt.readScribeResponse(scribe, 'scribe_v2');
  const step = (name, overrides = {}) => ({
    kept: async () => db.kept,
    claim: async () => {
      if (db.kept) return 'done';
      if (db.claim && clock - db.claim.at < 180000) return 'busy';
      db.claim = { by: name, at: clock }; return 'claimed';
    },
    release: async () => { if (db.claim?.by === name) db.claim = null; },
    transcribe: async () => { calls += 1; clock += scribeSeconds * 1000; return scribeResult === 'ok' ? heard : null; },
    keep: async (h) => { db.kept ??= { words: h.words, model: `elevenlabs/${h.model}` }; },
    complete: () => true,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    ...overrides,
  });
  return { db, step, calls: () => calls };
}

test('two steps starting together: one transcribes, the other waits and reuses the same words', async () => {
  const w = world();
  // The analysis claims first and transcribes; the draft finds the recording busy, waits, then reuses.
  const first = w.step('analysis');
  const second = w.step('draft');
  let releaseFirst;
  const gate = new Promise((r) => { releaseFirst = r; });
  const slowFirst = { ...first, transcribe: async () => { await gate; return first.transcribe(); } };
  const a = stt.transcribeOnce(slowFirst);
  await new Promise((r) => setImmediate(r));
  assert.equal(w.db.claim?.by, 'analysis');
  let waits = 0;
  const b = stt.transcribeOnce({ ...second, sleep: async (ms) => { waits += 1; if (waits === 2) releaseFirst(); await second.sleep(ms); await new Promise((r) => setImmediate(r)); } });
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(w.calls(), 1, 'Scribe is paid once');
  assert.ok(waits >= 2, 'the second step waited');
  assert.equal(rb.text, stt.textFromWords(ra.words));
  assert.equal(rb.model, 'elevenlabs/scribe_v2');
  assert.equal(w.db.claim, null, 'the claim is released');
});

test('a step that waits too long transcribes the recording itself, so nothing waits forever', async () => {
  const w = world();
  w.db.claim = { by: 'crashed', at: 0 };
  const logs = [];
  const result = await stt.transcribeOnce({ ...w.step('draft'), log: (stage, detail) => logs.push(`${stage}:${detail}`) });
  assert.equal(w.calls(), 1);
  assert.ok(result.words.length);
  assert.deepEqual(logs, ['transcription_wait:gave_up_waiting']);
  assert.equal(w.db.claim.by, 'crashed', 'it never releases a claim it does not hold');
});

test('a claim older than three minutes is treated as abandoned', async () => {
  const w = world();
  w.db.claim = { by: 'crashed', at: -200000 };
  const result = await stt.transcribeOnce(w.step('analysis'));
  assert.ok(result);
  assert.equal(w.calls(), 1);
  assert.equal(w.db.claim, null);
});

test('words already kept are reused without a claim or a charge', async () => {
  const w = world();
  w.db.kept = { words: stt.readScribeResponse(scribe, 'scribe_v2').words, model: 'elevenlabs/scribe_v2' };
  let claimed = false;
  const result = await stt.transcribeOnce({ ...w.step('draft'), claim: async () => { claimed = true; return 'done'; } });
  assert.equal(w.calls(), 0);
  assert.equal(claimed, false);
  assert.equal(result.model, 'elevenlabs/scribe_v2');
});

test('failures fall back to OpenAI and never block: failed Scribe, broken lock, incomplete kept words', async () => {
  const failed = world({ scribeResult: 'fail' });
  assert.equal(await stt.transcribeOnce(failed.step('draft')), null);
  assert.equal(failed.db.claim, null, 'released after a failed transcription');

  const broken = world();
  const logs = [];
  const result = await stt.transcribeOnce({ ...broken.step('draft'), claim: async () => { throw new Error('lock_down'); }, log: (s, d) => logs.push(`${s}:${d}`) });
  assert.ok(result, 'a lock problem still produces a transcript');
  assert.deepEqual(logs, ['transcription_claim:lock_down']);

  const incomplete = world();
  incomplete.db.kept = { words: stt.readScribeResponse(scribe, 'scribe_v2').words, model: 'elevenlabs/scribe_v2' };
  assert.equal(await stt.transcribeOnce({ ...incomplete.step('draft'), complete: () => false }), null, 'Scribe already tried: use OpenAI');
  assert.equal(incomplete.calls(), 0);
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
