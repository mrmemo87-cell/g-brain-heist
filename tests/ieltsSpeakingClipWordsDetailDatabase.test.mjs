import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.5.1 section 10.7: each interview recording is transcribed once; the kept detail is service-only.
const db = new PGlite(),
  session = "00000000-0000-0000-0000-000000000010",
  clip1 = "00000000-0000-0000-0000-000000000021",
  clip2 = "00000000-0000-0000-0000-000000000022";
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;
create table private.ielts_speaking_clips(id uuid primary key,session_id uuid not null);
create function public.rpc_ielts_speaking_session_extras(p_session_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('analysis',jsonb_build_array(jsonb_build_object('clip_id','${clip1}')))$$;`);
await db.exec(readFileSync("supabase/migrations/20261118190000_ielts_speaking_clip_word_times.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261120230000_ielts_speaking_clip_words_detail.sql", "utf8"));
await db.query(`insert into private.ielts_speaking_clips values ($1,$3),($2,$3)`, [clip1, clip2, session]);

const words = JSON.stringify([["first", 31.2], ["at", 31.8]]);
const detail = JSON.stringify([["first", 31.2, 31.6, -0.001], ["at", 31.8, 31.9, -0.576]]);
const save = (clip, w = words, d = detail) =>
  db.query(`select public.rpc_ielts_save_speaking_clip_transcript_words($1,$2,$3::jsonb,$4::jsonb,'elevenlabs/scribe_v2')`, [session, clip, w, d]);

test("the first transcription is kept once with its detail; a second save never overwrites it", async () => {
  await save(clip1);
  await save(clip1, JSON.stringify([["other", 1]]), JSON.stringify([["other", 1, 2, 0]]));
  const kept = (await db.query(`select public.rpc_ielts_speaking_clip_words_detail($1) r`, [session])).rows[0].r;
  assert.deepEqual(kept, [{ clip_id: clip1, model: "elevenlabs/scribe_v2", detail: JSON.parse(detail) }]);
});

test("detail must match the word times and belong to the session's recording", async () => {
  await assert.rejects(save(clip2, words, JSON.stringify([["first", 31.2, 31.6, null]])), /speaking_clip_words_invalid/);
  await assert.rejects(save(clip2, words, '{"a":1}'), /speaking_clip_words_invalid/);
  await assert.rejects(save("00000000-0000-0000-0000-000000000099"), /speaking_clip_mismatch/);
});

test("browsers get the same [word, seconds] word times as before and never the confidences", async () => {
  const pub = (await db.query(`select public.rpc_ielts_speaking_clip_words($1) r`, [session])).rows[0].r;
  assert.deepEqual(pub, [{ clip_id: clip1, words: JSON.parse(words) }]);
  assert.doesNotMatch(JSON.stringify(pub), /-0\.576|detail/);
  for (const fn of ["rpc_ielts_save_speaking_clip_transcript_words(uuid,uuid,jsonb,jsonb,text)", "rpc_ielts_speaking_clip_words_detail(uuid)"]) {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query(`select has_function_privilege($1, $2, 'execute') ok`, [role, `public.${fn}`]);
      assert.equal(rows[0].ok, false, `${role} cannot run ${fn}`);
    }
    const { rows } = await db.query(`select has_function_privilege('service_role', $1, 'execute') ok`, [`public.${fn}`]);
    assert.equal(rows[0].ok, true);
  }
});

test("older word times saved without detail are not offered for reuse", async () => {
  await db.query(`select public.rpc_ielts_save_speaking_clip_words($1,$2,$3::jsonb,'whisper-1')`, [session, clip2, words]);
  const kept = (await db.query(`select public.rpc_ielts_speaking_clip_words_detail($1) r`, [session])).rows[0].r;
  assert.deepEqual(kept.map((k) => k.clip_id), [clip1]);
});

test("a recording timed before Scribe gets Scribe's words once; kept detail is never overwritten", async () => {
  await db.exec(readFileSync("supabase/migrations/20261121001000_ielts_speaking_clip_words_fill_detail.sql", "utf8"));
  // clip2 holds only whisper-1 word times (saved in the previous test).
  const scribeWords = JSON.stringify([["Scribe", 0.5]]), scribeDetail = JSON.stringify([["Scribe", 0.5, 0.9, -0.02]]);
  await db.query(`select public.rpc_ielts_save_speaking_clip_transcript_words($1,$2,$3::jsonb,$4::jsonb,'elevenlabs/scribe_v2')`, [session, clip2, scribeWords, scribeDetail]);
  let row = (await db.query(`select words, detail, model from private.ielts_speaking_clip_words where clip_id=$1`, [clip2])).rows[0];
  assert.deepEqual(row, { words: JSON.parse(scribeWords), detail: JSON.parse(scribeDetail), model: "elevenlabs/scribe_v2" });
  await db.query(`select public.rpc_ielts_save_speaking_clip_transcript_words($1,$2,'[["later",1]]'::jsonb,'[["later",1,2,0]]'::jsonb,'elevenlabs/scribe_v2')`, [session, clip2]);
  row = (await db.query(`select words from private.ielts_speaking_clip_words where clip_id=$1`, [clip2])).rows[0];
  assert.deepEqual(row.words, JSON.parse(scribeWords), "once detail is kept it never changes");
  const kept = (await db.query(`select public.rpc_ielts_speaking_clip_words_detail($1) r`, [session])).rows[0].r;
  assert.deepEqual(kept.map((k) => k.clip_id).sort(), [clip1, clip2].sort());
  const { rows } = await db.query(`select has_function_privilege('authenticated','public.rpc_ielts_save_speaking_clip_transcript_words(uuid,uuid,jsonb,jsonb,text)','execute') ok`);
  assert.equal(rows[0].ok, false);
});
