-- Owner approval and release of the Listening Lessons 10 and 14 step-by-step tasks, 2026-10-28.
-- Authority: owner instruction 2026-10-28 16:06 Asia/Bishkek ("approve"), after reviewing every step, question and
-- answer key and the six audio files for PR #1741 (IELTS_Listening_10_14_steps_review.pdf).
-- 1. Store each task's originality fingerprint.
-- 2. Record originality honestly under the shared-recording rule: steps that play the same approved recording are one
--    family. The first step on each recording is recorded as fresh; the later steps on that recording are variants of it
--    (repeat practice). Any match outside these planned families aborts the whole migration.
-- 3. Release the ten guided steps (L-030 to L-034, L-036 to L-040). The two step-6 mixed checks (L-035, L-041) replay
--    a recording the student has already heard in steps 4 and 5, so they are recorded as variants and NOT released:
--    the platform correctly refuses a variant as an independent check. They need a genuinely unheard recording.
-- Append-only: nothing is updated or deleted. Practice only; no bands or calibration.
do $release$
declare owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88'; x record; p jsonb; m jsonb; stray text; ph text;
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required'; end if;
 create temp table listening06(n int, display_code text, code text, sha text, audio text, parent text, release boolean) on commit drop;
 insert into listening06 values
  (15,'L-030','bh-ielts-targeted-listening-l15-v1','99743981a63cb6092c4c01ec87d439c0155cad7ea443321b6f3ddd5837d89202','aea7a4367bfc74202825f682ccd28f1a2d07e403f2dc0a602800c4e650cde237',null,true),
  (16,'L-031','bh-ielts-targeted-listening-l16-v1','cd1c39996a0c993165461d1eef8aa3d6a6cba369ed83bd0e4b99e915bfac147c','aea7a4367bfc74202825f682ccd28f1a2d07e403f2dc0a602800c4e650cde237','bh-ielts-targeted-listening-l15-v1',true),
  (17,'L-032','bh-ielts-targeted-listening-l17-v1','9fc2f73e234078f8c49b660009d7b21330616c371695a17c50e97f39f907ea68','3e515f0aadea922305f57a1a18d7b48112dc885a16fa489535fdf43415f2d77e',null,true),
  (18,'L-033','bh-ielts-targeted-listening-l18-v1','51e9174319025c82ad370fc2252578fae4587a45f08d76d73ddc6346ccd4f409','a5331a1cfeeb7128eaf2f600bda7931adff4215cec9e47098dd9eef11ce6d5dd',null,true),
  (19,'L-034','bh-ielts-targeted-listening-l19-v1','e9ff64ec002f02c1e06c9d36c4bac58fa061aece24c4272596288756c534ae85','a5331a1cfeeb7128eaf2f600bda7931adff4215cec9e47098dd9eef11ce6d5dd','bh-ielts-targeted-listening-l18-v1',true),
  (20,'L-035','bh-ielts-targeted-listening-l20-v1','23be649448c777b9ace5222f3248145f681afe5a162ec112d0eeeffc8d861c91','a5331a1cfeeb7128eaf2f600bda7931adff4215cec9e47098dd9eef11ce6d5dd','bh-ielts-targeted-listening-l18-v1',false),
  (21,'L-036','bh-ielts-targeted-listening-l21-v1','468acad445fbcbbd66d86bc6007e772f059788c7860229b7f1daff7e66bbb00d','43c73cde98d80f72fd170bea406d070152a8ebecedb73ec6c0730c363758adc4',null,true),
  (22,'L-037','bh-ielts-targeted-listening-l22-v1','9a3df979506807776a0bf06e1280af4cf2fc915ed25d258a6fd54c71d3dddf4d','43c73cde98d80f72fd170bea406d070152a8ebecedb73ec6c0730c363758adc4','bh-ielts-targeted-listening-l21-v1',true),
  (23,'L-038','bh-ielts-targeted-listening-l23-v1','05008dee7d0a89decd86a9c4a07d15f6211ca081a89d8cf1cbe90dd08f375bb6','c7a4334f8d7742e73d5cb87985269032b65ab95e22fb2e3920815641d8334572',null,true),
  (24,'L-039','bh-ielts-targeted-listening-l24-v1','915cae315af7d8acd4396c36b9ca32da06c892f394f19f1620f36fb39cbfacb9','6c9f96f11978a10f69917b35371920151ed996204ae76a75fcc26747aeb8682b',null,true),
  (25,'L-040','bh-ielts-targeted-listening-l25-v1','ce5964e7f483b6876311e2cf53d2545a08622ce45cc215e9a802340c7d84773d','6c9f96f11978a10f69917b35371920151ed996204ae76a75fcc26747aeb8682b','bh-ielts-targeted-listening-l24-v1',true),
  (26,'L-041','bh-ielts-targeted-listening-l26-v1','ab04e2a1c9e3eb3d1ea3e39325b4f500a5c2fbd2a666362061ae405ac3725fb4','6c9f96f11978a10f69917b35371920151ed996204ae76a75fcc26747aeb8682b','bh-ielts-targeted-listening-l24-v1',false);
 -- 1. Exact approved versions and audio, then fingerprints for all twelve.
 for x in select * from listening06 order by n loop
  if not exists(select 1 from private.ielts_learning_tasks where code = x.code and content_sha256 = x.sha and audio_sha256 = x.audio and requires_review) then raise exception 'approved_version_changed: %', x.code; end if;
  if not exists(select 1 from storage.objects o join private.ielts_learning_tasks t on t.audio_path = o.name where o.bucket_id = 'ielts-targeted-listening' and t.code = x.code) then raise exception 'audio_missing: %', x.code; end if;
  if private.ielts_material_code('targeted', x.code) is distinct from x.display_code then raise exception 'display_code_changed: %', x.code; end if;
  if private.ielts_learning_publicly_released(x.code) then raise exception 'already_released: %', x.code; end if;
  perform private.ielts_originality_store('targeted', x.code);
 end loop;
 -- 2a. Later steps on a shared recording: variants of the first step on that recording.
 for x in select * from listening06 where parent is not null order by n loop
  p := private.ielts_originality_payload('targeted', x.code);
  m := private.ielts_originality_matches('targeted', x.code, p);
  select string_agg(coalesce(e->>'material_id','?') || ' (' || coalesce(e->>'reason','?') || ')', ', ') into stray
  from jsonb_array_elements(m) e
  where e->>'reason' <> 'shared_recording' or e->>'material_type' <> 'targeted' or not exists(select 1 from listening06 s where s.code = e->>'material_id' and s.audio = x.audio and s.code <> x.code);
  if stray is not null then raise exception 'unexpected_originality_match: % -> %', x.code, stray; end if;
  select e->>'content_hash' into ph from jsonb_array_elements(m) e where e->>'material_id' = x.parent;
  if ph is null then raise exception 'parent_not_matched: % -> %', x.code, x.parent; end if;
  insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, parent_type, parent_id, parent_hash, rationale, content_checked, recording_checked, reviewed_by)
  values ('targeted', x.code, p->>'content_hash', private.ielts_originality_hash(m::text), 'variant', 'targeted', x.parent, ph,
   'Step-by-step listening task that replays the same owner-approved recording as ' || x.parent || ' (cut from the lesson recording, identical file by SHA-256). Recorded as repeat practice under the shared-recording rule; its questions are new. Owner approval 2026-10-28 16:06 (Asia/Bishkek).',
   true, true, owner);
 end loop;
 -- 2b. The first step on each recording: fresh, with no remaining matches once its repeat steps are declared.
 for x in select * from listening06 where parent is null order by n loop
  p := private.ielts_originality_payload('targeted', x.code);
  m := private.ielts_originality_matches('targeted', x.code, p);
  if jsonb_array_length(m) > 0 then raise exception 'unexpected_originality_match: % -> %', x.code, m; end if;
  insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
  values ('targeted', x.code, p->>'content_hash', private.ielts_originality_hash(m::text), 'fresh',
   'Original Brains Heist step-by-step listening task. Its recording is cut from the owner-approved lesson recording with no new speech; the full-inventory comparison finds no shared text, questions, recording or script outside its own repeat steps. Owner approval 2026-10-28 16:06 (Asia/Bishkek).',
   true, true, owner);
 end loop;
 -- 3. Release the ten guided steps; the two step-6 checks stay unreleased.
 for x in select * from listening06 order by n loop
  if private.ielts_originality_label('targeted', x.code) is distinct from (case when x.parent is null then 'Originality reviewed' else 'Variant of ' || private.ielts_material_code('targeted', x.parent) || ' · repeat practice' end) then raise exception 'originality_label_unexpected: % (%)', x.code, private.ielts_originality_label('targeted', x.code); end if;
  continue when not x.release;
  p := private.ielts_originality_payload('targeted', x.code);
  insert into private.ielts_learning_releases(task_code, exact_content_hash, version, audio_sha256, authorized_by, authorized_at, acceptance)
  select code, p->>'content_hash', version, audio_sha256, owner, '2026-10-28T16:06:00+06',
   jsonb_build_object('bible', '2.0.0', 'reviewer', 'Sobbi — Brains Heist owner', 'display_code', x.display_code,
    'source', 'Owner approval 2026-10-28 16:06 (Asia/Bishkek) in the review conversation, after reviewing every step, question and answer key and the six audio files for Listening Lessons 10 and 14 (PR #1741)',
    'content_and_answers', 'Approved', 'audio', 'Approved: exact file pinned by SHA-256, cut from the owner-approved lesson recording',
    'authorization', 'Release this exact version to all eligible students',
    'provenance', 'Original Brains Heist AI-assisted questions and explanations on Brains Heist recordings; no third-party passages, questions or audio copied',
    'limits', 'Targeted practice only. No calibrated equivalence, band or semantic originality certification. School, entitlement, source-evidence and repeat-exposure checks remain.')
  from private.ielts_learning_tasks where code = x.code;
  if not private.ielts_learning_publicly_released(x.code) then raise exception 'release_not_effective: %', x.code; end if;
  if not private.ielts_practice_material_allowed('targeted', x.code) then raise exception 'practice_material_not_allowed: %', x.code; end if;
 end loop;
 if (select count(*) from listening06 where not release and private.ielts_learning_publicly_released(code)) > 0 then raise exception 'mixed_check_released'; end if;
end;$release$;
