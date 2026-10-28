-- Owner approval and release of the Lessons 2, 9, 13 and 18 step-by-step targeted reading tasks (R-056 to R-079),
-- 2026-10-28. Authority: owner instruction 2026-10-28 09:38 Asia/Bishkek ("Approved"), after reviewing every step,
-- question and answer key in the review file for PR #1736 (IELTS_Lessons_2_9_13_18_steps_review.pdf).
-- 1. Store each task's originality fingerprint.
-- 2. Record the originality review. Automated comparison against the whole material inventory finds no shared text or
--    questions outside each lesson's own six steps; the only matches are the sibling steps on the same lesson passage,
--    which is by design (each step asks different questions about the passage). Each task is recorded as fresh and pinned
--    to its exact content and match set; any other match aborts the whole migration. No variant links are created, so a
--    lesson's mixed check stays assignable after its guided steps.
-- 3. Release each exact version to all eligible students (as for Lesson 6's R-050 to R-055).
-- Append-only: nothing is updated or deleted. Practice only; no bands or calibration.
do $release$
declare owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88'; x record; p jsonb; m jsonb; stray text;
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required'; end if;
 create temp table reading07(n int, display_code text, code text, sha text, lesson text) on commit drop;
 insert into reading07 values
  (34,'R-056','bh-ielts-targeted-reading-r34-v1','e79317b99b1d56285a8aa177865a843b606bd12e49ce3a66e46bf47a360c7771','02'),
  (35,'R-057','bh-ielts-targeted-reading-r35-v1','cad5b338e901eca240dc04ea196c4db6251a9186f4992b1999a92a635361fb5c','02'),
  (36,'R-058','bh-ielts-targeted-reading-r36-v1','3720bbf3dabfbf87daa46e2f70dd848091160e3b81c05ac3f11b17ae8f70c24d','02'),
  (37,'R-059','bh-ielts-targeted-reading-r37-v1','bf843e86f55edc98362316623a574121037b295949f5cd2555dd070a3c6d9747','02'),
  (38,'R-060','bh-ielts-targeted-reading-r38-v1','827fb7dde023a290855b5ae17eba4ca83fa9ebdef0528ca0991dd94b45642feb','02'),
  (39,'R-061','bh-ielts-targeted-reading-r39-v1','7b27ccf5a42c1fdeea93e7e8d5f873626e000ae936cb2eea9165acd93af32675','02'),
  (40,'R-062','bh-ielts-targeted-reading-r40-v1','67bd369b805c0f85373c227e18e06bf3aa84a97ecb72889fe3f792b2a4657d13','09'),
  (41,'R-063','bh-ielts-targeted-reading-r41-v1','2beb1cd43e91b214c12c6ebdcb19bbcab996d25a15aadce986320fc329ab3a31','09'),
  (42,'R-064','bh-ielts-targeted-reading-r42-v1','453826f668ec6f34dca9c7f2ff460cdb2e89dc4e9ed343e0ec308a7b95299117','09'),
  (43,'R-065','bh-ielts-targeted-reading-r43-v1','bc1a1df08479e032a0381442fd3090a94cc720835ee41ca8084e07dd89652587','09'),
  (44,'R-066','bh-ielts-targeted-reading-r44-v1','9a20b7d54167b3f1205716c3ae00e3f806d7a5a5f7b0cd11b79770a3c0965ca3','09'),
  (45,'R-067','bh-ielts-targeted-reading-r45-v1','bd075e1feb9b4c424263fc5e1354dc7bf8836f0fa1826bbdb1f7867d25f38d3c','09'),
  (46,'R-068','bh-ielts-targeted-reading-r46-v1','768830118b14ca4e85b9386b424b66fd4dc641ac7860a11d64813b1ed024de98','13'),
  (47,'R-069','bh-ielts-targeted-reading-r47-v1','016fe8671cc34cf4767b9fe7c2776a72e160c860f8833b1b9c714219eb247021','13'),
  (48,'R-070','bh-ielts-targeted-reading-r48-v1','edafd3be903d1d49f4162d09c69f09b4198768a004ae86e0c067594c26c22ee1','13'),
  (49,'R-071','bh-ielts-targeted-reading-r49-v1','8e4dbd4dfe13318af25572fd01ca7c0ce660b504c3ab0ee8a950ccbbf430e8b5','13'),
  (50,'R-072','bh-ielts-targeted-reading-r50-v1','c7ecd6725dfdf7e17cd5febed6238c1865c251430b9429e6114cd6aa67cfee8e','13'),
  (51,'R-073','bh-ielts-targeted-reading-r51-v1','995f816da73a1dae5c5f1d6910267669f60534cbd7d05309684f8df3e1cf469e','13'),
  (52,'R-074','bh-ielts-targeted-reading-r52-v1','0d1c15722318fd56ce6586ea4120c21670e4260aeab424d38577fd42246c9330','18'),
  (53,'R-075','bh-ielts-targeted-reading-r53-v1','a10099755b34a8c69b5131a64e550e5bc368e7b56060653d7a8f982020d66f4f','18'),
  (54,'R-076','bh-ielts-targeted-reading-r54-v1','23d3bdca7ad26c1749843c525babc89126dfd303447cc59ca8932c94541e7936','18'),
  (55,'R-077','bh-ielts-targeted-reading-r55-v1','16801f22e456b9b29aa04c44cb41cd69680c0eea2b100c11bb2899076ce608ef','18'),
  (56,'R-078','bh-ielts-targeted-reading-r56-v1','85050af87e9993ace5756479750c33e16a478bce6971c36ac14edc0ad1e75a3e','18'),
  (57,'R-079','bh-ielts-targeted-reading-r57-v1','18124280e3a9c4dc1742bc6c1798ed5a5a3e8fe500a2851253671436b7c50132','18');
 -- 1. Exact approved versions, then fingerprints for all 24 before any match set is pinned.
 for x in select * from reading07 order by n loop
  if not exists(select 1 from private.ielts_learning_tasks where code = x.code and content_sha256 = x.sha) then raise exception 'approved_version_changed: %', x.code; end if;
  if private.ielts_material_code('targeted', x.code) is distinct from x.display_code then raise exception 'display_code_changed: %', x.code; end if;
  if private.ielts_learning_publicly_released(x.code) then raise exception 'already_released: %', x.code; end if;
  perform private.ielts_originality_store('targeted', x.code);
 end loop;
 -- 2. Originality: only sibling steps of the same lesson may match.
 for x in select * from reading07 order by n loop
  p := private.ielts_originality_payload('targeted', x.code);
  m := private.ielts_originality_matches('targeted', x.code, p);
  select string_agg(coalesce(e->>'material_type','?') || ':' || coalesce(e->>'material_id','?') || ' (' || coalesce(e->>'reason','?') || ')', ', ') into stray
  from jsonb_array_elements(m) e
  where e->>'reason' = 'exact_copy' or e->>'material_type' <> 'targeted' or not exists(select 1 from reading07 s where s.code = e->>'material_id' and s.lesson = x.lesson and s.code <> x.code);
  if stray is not null then raise exception 'unexpected_originality_match: % -> %', x.code, stray; end if;
  insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
  values ('targeted', x.code, p->>'content_hash', private.ielts_originality_hash(m::text), 'fresh',
   'Original Brains Heist step-by-step task on the Lesson ' || ltrim(x.lesson,'0') || ' passage. Automated comparison against the full material inventory found no shared text or questions outside this lesson''s own six steps; the matches are its sibling steps on the same lesson passage, by design, each with different questions. Owner approval 2026-10-28 09:38 (Asia/Bishkek).',
   true, false, owner);
 end loop;
 -- 3. Release the exact versions.
 for x in select * from reading07 order by n loop
  p := private.ielts_originality_payload('targeted', x.code);
  if private.ielts_originality_label('targeted', x.code) is distinct from 'Originality reviewed' then raise exception 'originality_label_missing: %', x.code; end if;
  insert into private.ielts_learning_releases(task_code, exact_content_hash, version, audio_sha256, authorized_by, authorized_at, acceptance)
  select code, p->>'content_hash', version, audio_sha256, owner, '2026-10-28T09:38:00+06',
   jsonb_build_object('bible', '2.0.0', 'reviewer', 'Sobbi — Brains Heist owner', 'display_code', x.display_code,
    'source', 'Owner approval 2026-10-28 09:38 (Asia/Bishkek) in the review conversation, after reviewing every step, question and answer key for Lessons 2, 9, 13 and 18 (PR #1736)',
    'content_and_answers', 'Approved',
    'authorization', 'Release this exact version to all eligible students',
    'provenance', 'Original Brains Heist AI-assisted questions and explanations built on the lesson passages; no third-party passages or questions copied',
    'limits', 'Targeted practice only. No calibrated equivalence, band or semantic originality certification. School, entitlement, source-evidence and repeat-exposure checks remain.')
  from private.ielts_learning_tasks where code = x.code;
  if not private.ielts_learning_publicly_released(x.code) then raise exception 'release_not_effective: %', x.code; end if;
  if not private.ielts_practice_material_allowed('targeted', x.code) then raise exception 'practice_material_not_allowed: %', x.code; end if;
 end loop;
end;$release$;
