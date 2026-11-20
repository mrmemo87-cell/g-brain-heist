import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
// Diagnostic Bible 2.5.1 section 10.7: one transcription per recording when both interview steps start together.
const db = new PGlite(),
  session = "00000000-0000-0000-0000-000000000010",
  clip1 = "00000000-0000-0000-0000-000000000021",
  clip2 = "00000000-0000-0000-0000-000000000022";
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;
create table private.ielts_speaking_clips(id uuid primary key,session_id uuid not null);
create function public.rpc_ielts_speaking_session_extras(p_session_id uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;`);
for (const m of ["20261118190000_ielts_speaking_clip_word_times", "20261120230000_ielts_speaking_clip_words_detail", "20261120233000_ielts_speaking_clip_transcription_claim"])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
await db.query(`insert into private.ielts_speaking_clips values ($1,$3),($2,$3)`, [clip1, clip2, session]);

const claim = async (clip) => (await db.query(`select public.rpc_ielts_claim_speaking_clip_transcription($1,$2) s`, [session, clip])).rows[0].s;
const release = (clip) => db.query(`select public.rpc_ielts_release_speaking_clip_transcription($1,$2)`, [session, clip]);

test("the first step claims a recording; the second is told it is busy", async () => {
  assert.equal(await claim(clip1), "claimed");
  assert.equal(await claim(clip1), "busy");
  assert.equal(await claim(clip2), "claimed", "each recording is claimed separately");
});

test("once the words are kept, every step is told it is done", async () => {
  await db.query(`select public.rpc_ielts_save_speaking_clip_transcript_words($1,$2,'[["ok",1]]'::jsonb,'[["ok",1,1.2,-0.01]]'::jsonb,'elevenlabs/scribe_v2')`, [session, clip1]);
  await release(clip1);
  assert.equal(await claim(clip1), "done");
});

test("release frees a recording; a claim older than three minutes counts as abandoned", async () => {
  await release(clip2);
  assert.equal(await claim(clip2), "claimed");
  await db.query(`update private.ielts_speaking_clip_transcribing set claimed_at=now()-interval '4 minutes' where clip_id=$1`, [clip2]);
  assert.equal(await claim(clip2), "claimed", "a crashed step never blocks the recording");
  assert.equal(await claim(clip2), "busy");
});

test("claims check the recording and are server-only", async () => {
  await assert.rejects(claim("00000000-0000-0000-0000-000000000099"), /speaking_clip_mismatch/);
  for (const fn of ["rpc_ielts_claim_speaking_clip_transcription(uuid,uuid)", "rpc_ielts_release_speaking_clip_transcription(uuid,uuid)"]) {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query(`select has_function_privilege($1,$2,'execute') ok`, [role, `public.${fn}`]);
      assert.equal(rows[0].ok, false, `${role} cannot run ${fn}`);
    }
    const { rows } = await db.query(`select has_function_privilege('service_role',$1,'execute') ok`, [`public.${fn}`]);
    assert.equal(rows[0].ok, true);
  }
  const { rows } = await db.query(`select has_table_privilege('authenticated','private.ielts_speaking_clip_transcribing','select') ok`);
  assert.equal(rows[0].ok, false);
});
