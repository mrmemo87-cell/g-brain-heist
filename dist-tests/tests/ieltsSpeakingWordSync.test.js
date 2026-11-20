import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { alignWordTimes, tokenAtTime, transcriptTokens } from '../src/lib/speakingWordAlignment.js';
const fn = readFileSync('supabase/functions/ielts_speaking_pilot/index.ts', 'utf8');
const wordFn = readFileSync('supabase/functions/ielts_speaking_word_times/index.ts', 'utf8');
const config = readFileSync('supabase/config.toml', 'utf8');
const service = readFileSync('services/ieltsSpeakingPilotService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261118190000_ielts_speaking_clip_word_times.sql', 'utf8');
const transcriptView = readFileSync('src/components/ielts/SpeakingTranscript.tsx', 'utf8');
const insights = readFileSync('src/components/ielts/SpeakingInterviewInsights.tsx', 'utf8');
const dock = readFileSync('src/components/ielts/SpeakingAudioDock.tsx', 'utf8');
const visualBible = readFileSync('docs/ielts/IELTS_VISUAL_UX_BIBLE.md', 'utf8');
const timed = (text, step = 0.5, from = 0) => text.split(/\s+/).map((w, i) => [w, from + i * step]);
test('tokens keep their character positions', () => {
    assert.deepEqual(transcriptTokens('Hello,  my name\nis Aisha.'), [
        { text: 'Hello,', start: 0, end: 6 }, { text: 'my', start: 8, end: 10 }, { text: 'name', start: 11, end: 15 },
        { text: 'is', start: 16, end: 18 }, { text: 'Aisha.', start: 19, end: 25 },
    ]);
});
test('identical wording maps word for word, ignoring case and punctuation', () => {
    const tokens = transcriptTokens('Well, I live in Bishkek. It is a big city.');
    const times = alignWordTimes(tokens, timed('well I live in bishkek it is a big city'));
    assert.deepEqual(times, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
});
test('different wording between the two transcripts is bridged by interpolation', () => {
    // Shown transcript says "gonna" and has an extra word; the timed pass heard "going to".
    const tokens = transcriptTokens('I am gonna really study medicine in the future');
    const times = alignWordTimes(tokens, [['I', 0], ['am', 1], ['going', 2], ['to', 3], ['study', 4], ['medicine', 5], ['in', 6], ['the', 7], ['future', 8]]);
    assert.equal(times[0], 0);
    assert.equal(times[1], 1);
    assert.equal(times[4], 4); // study
    assert.equal(times[8], 8); // future
    // "gonna" and "really" sit evenly between "am" (1s) and "study" (4s).
    assert.equal(times[2], 2);
    assert.equal(times[3], 3);
    for (let i = 1; i < times.length; i++)
        assert.ok(times[i] >= times[i - 1]);
});
test('a repeated word does not drag the timing forward', () => {
    const tokens = transcriptTokens('I like tea and I like coffee');
    const times = alignWordTimes(tokens, timed('I like tea and I like coffee', 1));
    assert.deepEqual(times, [0, 1, 2, 3, 4, 5, 6]);
});
test('too little agreement gives no times instead of wrong ones', () => {
    const tokens = transcriptTokens('completely different words appear in this shown transcript today');
    assert.ok(alignWordTimes(tokens, timed('nothing here matches any of that other sentence at all')).every((t) => t === null));
    assert.ok(alignWordTimes(tokens, []).every((t) => t === null));
    assert.deepEqual(alignWordTimes([], timed('a b c')), []);
});
test('the spoken word is the last one that has started', () => {
    const times = [0, 0.5, null, 1.5, 2];
    assert.equal(tokenAtTime(times, -1), -1);
    assert.equal(tokenAtTime(times, 0), 0);
    assert.equal(tokenAtTime(times, 0.7), 1);
    assert.equal(tokenAtTime(times, 1.6), 3);
    assert.equal(tokenAtTime(times, 99), 4);
});
test('word times ride on the existing transcription and cost nothing extra for new drafts', () => {
    assert.match(fn, /form\.append\("timestamp_granularities\[\]", "segment"\);[\s\S]{0,200}form\.append\("timestamp_granularities\[\]", "word"\);/);
    // Scribe's words carry their times; the OpenAI segment request (with word times) stays as the fallback.
    assert.match(fn, /segments: await transcribeDraftSegments\(clip\.bytes, key, Number\(clip\.duration_seconds\) \|\| 0, admin, body\.sessionId, clip\.id\)/);
    assert.match(fn, /keep: \(heard\) => keepScribeWords\(admin, sessionId, clipId, heard\),/);
    assert.match(fn, /p_words: timedWords\(heard\.words\), p_detail: wordDetail\(heard\.words\)/);
    assert.match(fn, /return transcribeInterview\(bytes, key, keepWords\(admin, sessionId, clipId\)\);/);
    // Saving times can never fail a draft or transcript.
    assert.match(fn, /try \{ onWords\(words\); \} catch \{/);
});
test('older recordings are timed only when the reviewing teacher asks, after the recording is verified', () => {
    assert.match(wordFn, /rpc_ielts_speaking_session", \{ p_session_id: body\.sessionId \}\);\s+if \(sessionError \|\| !session\?\.can_review\) return reply\(\{ error: "not_authorized" \}, 403\);/);
    assert.match(wordFn, /if \(\(await sha\(bytes\)\) !== clip\.sha256\) throw new Error\("source_mismatch"\);\s+const \{ words, model \} = await timeWordsAnyModel\(bytes, key\);/);
    assert.match(wordFn, /return \{ words: await timeWords\(bytes, key\), model: MODEL \};/, 'whisper-1 remains the fallback');
    assert.match(wordFn, /\.filter\(\(c\) => !have\.has\(c\.id\)\)/);
    assert.match(wordFn, /MAX_SECONDS = 1800/);
    // The questions are never sent as a hint, and nothing about the speech is logged.
    assert.doesNotMatch(wordFn, /package|questions\b.*prompt/);
    assert.match(config, /\[functions\.ielts_speaking_word_times\]\nverify_jwt = true/);
    assert.match(service, /functions\.invoke\("ielts_speaking_word_times", \{ body: \{ sessionId \} \}\)/);
});
test('word times are private, service-written and readable only with the transcript', () => {
    assert.match(migration, /alter table private\.ielts_speaking_clip_words enable row level security/i);
    assert.match(migration, /revoke all on table private\.ielts_speaking_clip_words from public,anon,authenticated/i);
    assert.match(migration, /revoke all on function public\.rpc_ielts_save_speaking_clip_words\(uuid,uuid,jsonb,text\)\s+from public,anon,authenticated/i);
    assert.match(migration, /grant execute on function public\.rpc_ielts_save_speaking_clip_words\(uuid,uuid,jsonb,text\)\s+to service_role/i);
    assert.match(migration, /public\.rpc_ielts_speaking_session_extras\(p_session_id\)->'analysis'/i);
    assert.match(migration, /w\.clip_id=any\(v_visible\)/i);
    assert.match(migration, /on conflict \(clip_id\) do nothing/i);
});
test('transcript marks the spoken word and asks before playing from a word', () => {
    assert.match(transcriptView, /Play from here\? <b>\{clock\(times\[ask\.index\] as number\)\}<\/b>/);
    assert.match(transcriptView, /playSpeakingClipFrom\(clipId, Math\.max\(0, \(times\[ask\.index\] as number\) - 0\.2\)\)/);
    assert.match(transcriptView, /index === nowIndex \? ' is-now' : ''/);
    assert.match(transcriptView, /wordTimes\.length === tokens\.length && wordTimes\.some/);
    assert.doesNotMatch(transcriptView, /scrollIntoView/);
    assert.match(insights, /alignWordTimes\(transcriptTokens\(a\.transcript\), words\)/);
    assert.match(insights, /It runs one extra transcription for each recording\./);
    assert.match(dock, /export function playSpeakingClipFrom/);
    assert.match(visualBible, /\*\*Version:\*\* 1\.14\.0/);
    assert.match(visualBible, /Words in time with the audio \(1\.14\.0/);
});
