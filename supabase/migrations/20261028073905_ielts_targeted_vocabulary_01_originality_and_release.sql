-- Owner approval and release of the Vocabulary V1-V6 step-by-step tasks (R-080 to R-115), 2026-10-28.
-- Authority: owner instruction 2026-10-28 13:25 Asia/Bishkek ("Approved"), after reviewing every step, question and
-- answer key in the review file for PR #1739 (IELTS_Vocabulary_V1_V6_steps_review.pdf).
-- 1. Store each task's originality fingerprint.
-- 2. Record the originality review. Only sibling steps of the same vocabulary lesson may match (they share the lesson's
--    passage or data, by design); any other match aborts the whole migration. Each task is recorded as fresh and pinned to
--    its exact content and match set. No variant links, so each lesson's mixed check stays assignable.
-- 3. Release each exact version to all eligible students (as for R-056 to R-079).
-- Append-only: nothing is updated or deleted. Practice only; no bands or calibration.
do $release$
declare owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88'; x record; p jsonb; m jsonb; stray text;
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required'; end if;
 create temp table vocab01(n int, display_code text, code text, sha text, lesson text) on commit drop;
 insert into vocab01 values
  (58,'R-080','bh-ielts-targeted-reading-r58-v1','2b10be6b3b8373a92ed82304a69dd19d56b4598614815adab3bb83c7ec1dfd67','V1'),
  (59,'R-081','bh-ielts-targeted-reading-r59-v1','d21e7219218121de67f58fe1ca1d89c93c105b74f074dcf7e2ff09db277e59e0','V1'),
  (60,'R-082','bh-ielts-targeted-reading-r60-v1','5dab8492a5f5dd3dab2e722759e66d77d359b88de83d27d26c480a1c91a1382b','V1'),
  (61,'R-083','bh-ielts-targeted-reading-r61-v1','819374c8f6833e65b6ce1812aed469f8cfae2dd32cc35b87ab473cc069adcafb','V1'),
  (62,'R-084','bh-ielts-targeted-reading-r62-v1','a2eaf221e01a1bcb6f8cce98e4627572f6a01b88954d3ba7e914c5018a668d3b','V1'),
  (63,'R-085','bh-ielts-targeted-reading-r63-v1','63d85e157ded00f7db50f407210c3c1b61b8a7be446ffab0ae2ab304372df8e2','V1'),
  (64,'R-086','bh-ielts-targeted-reading-r64-v1','804e4e7b2ae236c8dd35cee8b55d75851055dd21b80335348968ae9f600fb5ce','V2'),
  (65,'R-087','bh-ielts-targeted-reading-r65-v1','3592e7afc9f187e57f1c6b61fad924d706d8acb16b25a42aeb6ddf82c946e770','V2'),
  (66,'R-088','bh-ielts-targeted-reading-r66-v1','0991c49c813e1602f5d6313a06942615e9863b18b4fd1b8831b2d6b7291883b6','V2'),
  (67,'R-089','bh-ielts-targeted-reading-r67-v1','d5ad4825bb1d3df20f570649c3a8f8041f5500e2f5cd12eb7ec0478e18e0d655','V2'),
  (68,'R-090','bh-ielts-targeted-reading-r68-v1','2094692cb19aefa6cb2812cb1f659603421cc0ef16317af909ca20bb8e21916a','V2'),
  (69,'R-091','bh-ielts-targeted-reading-r69-v1','ecabc23f8f5064aae973cacefe95181d16ca77f4f1a380f767325de38de9e8a9','V2'),
  (70,'R-092','bh-ielts-targeted-reading-r70-v1','20ee5e7d9718b8291d4ac19eaa0a4863ec1743e44741618904da915962a2494f','V3'),
  (71,'R-093','bh-ielts-targeted-reading-r71-v1','f7633a63d8b7d190b67009ce8c0db90115eb62c821eff57fa0673d8c30f23207','V3'),
  (72,'R-094','bh-ielts-targeted-reading-r72-v1','831c86712131c6a61bced633e7cdcdabb60b16fb7f6eb34b77154bcda1ab465a','V3'),
  (73,'R-095','bh-ielts-targeted-reading-r73-v1','02c9c8a2050cce4663c216b475ebdd913efff8ce137b8667f36e3f7dc8cfa970','V3'),
  (74,'R-096','bh-ielts-targeted-reading-r74-v1','437d1d0da7eb125039101d87a4e8c9c7ca970194706d25667040f82dcfdaa7a2','V3'),
  (75,'R-097','bh-ielts-targeted-reading-r75-v1','9a0de414f1428fcc98e91abbb505d2591f2eba90c8b77e9718edb66f3325c194','V3'),
  (76,'R-098','bh-ielts-targeted-reading-r76-v1','15a6222c91ecfc0dcf85a2a66bc3a00d97ff2c154e481c8be6e981abb58a2b83','V4'),
  (77,'R-099','bh-ielts-targeted-reading-r77-v1','82b289d5413d4f93c472a7d459ba14e6eaa60604d8591f26c660de491ef41ec7','V4'),
  (78,'R-100','bh-ielts-targeted-reading-r78-v1','91ff74fd598cef483dd972af3e54bf5178c3f18ebbc1adb3307d51a4a7ea94bc','V4'),
  (79,'R-101','bh-ielts-targeted-reading-r79-v1','6ef7c099e3026c59eff7dd1548dc4b59209d9e48d047a3a28a7a3e69ee2746ed','V4'),
  (80,'R-102','bh-ielts-targeted-reading-r80-v1','9b85d22ec1d922d9ed151872e5b3ae85ccfe439250a918cae3185d93d5bd8560','V4'),
  (81,'R-103','bh-ielts-targeted-reading-r81-v1','32ac97be9bbc6338aec779135eaa8b0462f2419ce283f7cf10781699aba79b56','V4'),
  (82,'R-104','bh-ielts-targeted-reading-r82-v1','4e2551f13e2f519d4be3cf353dffd1aba3a8eefbcc2e3aaa0ed0ed3a30ae3ec1','V5'),
  (83,'R-105','bh-ielts-targeted-reading-r83-v1','871fdae6fef75d5100dd18bb885993b28d0fc2eaf4f77b529395e021118fe4f9','V5'),
  (84,'R-106','bh-ielts-targeted-reading-r84-v1','aa61eee953c71711a278a77438fb6e3ee2b955dadaf75ba4db5110f209ae7353','V5'),
  (85,'R-107','bh-ielts-targeted-reading-r85-v1','b2818b2ed680ff42895ad55f3fc6be6c063cd8e1d041030123cc0c8d1bc8be9c','V5'),
  (86,'R-108','bh-ielts-targeted-reading-r86-v1','2c23ea7a41ecb472cc32d608c7c48ab243224f31fad3c0e9f425558351998c2e','V5'),
  (87,'R-109','bh-ielts-targeted-reading-r87-v1','57f1af81fe4686f43222cb3acaed701dc97fc9a2dc485dec551e56f8349e5bbb','V5'),
  (88,'R-110','bh-ielts-targeted-reading-r88-v1','68b99919e64be63ee879eef7f67d1930efd04915b551230799714b4ed427f454','V6'),
  (89,'R-111','bh-ielts-targeted-reading-r89-v1','fa0b0ba88f322e04b18b83376cd58969e9ef3435bab803c9a936905ae8a2dd63','V6'),
  (90,'R-112','bh-ielts-targeted-reading-r90-v1','afc95ec49011ef71423b2422f440e2c60bdab63443b3f0ddcd6567fe2e3ad5db','V6'),
  (91,'R-113','bh-ielts-targeted-reading-r91-v1','59a09a718f34e24b27322080c9d19a430811903a2550242730b57609a936e43a','V6'),
  (92,'R-114','bh-ielts-targeted-reading-r92-v1','0dd03fe428b61e691f54b9dc695ca8f9f9f799a09b73fe8493b2fd4b0f3c5740','V6'),
  (93,'R-115','bh-ielts-targeted-reading-r93-v1','9dfc05a5ad67abc3cf49c52d3b693d1ef4887f977160d92c6963a9b5d7961701','V6');
 -- 1. Exact approved versions, then fingerprints for all 36 before any match set is pinned.
 for x in select * from vocab01 order by n loop
  if not exists(select 1 from private.ielts_learning_tasks where code = x.code and content_sha256 = x.sha) then raise exception 'approved_version_changed: %', x.code; end if;
  if private.ielts_material_code('targeted', x.code) is distinct from x.display_code then raise exception 'display_code_changed: %', x.code; end if;
  if private.ielts_learning_publicly_released(x.code) then raise exception 'already_released: %', x.code; end if;
  perform private.ielts_originality_store('targeted', x.code);
 end loop;
 -- 2. Originality: only sibling steps of the same lesson may match.
 for x in select * from vocab01 order by n loop
  p := private.ielts_originality_payload('targeted', x.code);
  m := private.ielts_originality_matches('targeted', x.code, p);
  select string_agg(coalesce(e->>'material_type','?') || ':' || coalesce(e->>'material_id','?') || ' (' || coalesce(e->>'reason','?') || ')', ', ') into stray
  from jsonb_array_elements(m) e
  where e->>'reason' = 'exact_copy' or e->>'material_type' <> 'targeted' or not exists(select 1 from vocab01 s where s.code = e->>'material_id' and s.lesson = x.lesson and s.code <> x.code);
  if stray is not null then raise exception 'unexpected_originality_match: % -> %', x.code, stray; end if;
  insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
  values ('targeted', x.code, p->>'content_hash', private.ielts_originality_hash(m::text), 'fresh',
   'Original Brains Heist step-by-step vocabulary task for lesson ' || x.lesson || '. Automated comparison against the full material inventory found no shared text or questions outside this lesson''s own six steps; any matches are its sibling steps on the same lesson material, by design, each with different questions. Owner approval 2026-10-28 13:25 (Asia/Bishkek).',
   true, false, owner);
 end loop;
 -- 3. Release the exact versions.
 for x in select * from vocab01 order by n loop
  p := private.ielts_originality_payload('targeted', x.code);
  if private.ielts_originality_label('targeted', x.code) is distinct from 'Originality reviewed' then raise exception 'originality_label_missing: %', x.code; end if;
  insert into private.ielts_learning_releases(task_code, exact_content_hash, version, audio_sha256, authorized_by, authorized_at, acceptance)
  select code, p->>'content_hash', version, audio_sha256, owner, '2026-10-28T13:25:00+06',
   jsonb_build_object('bible', '2.0.0', 'reviewer', 'Sobbi — Brains Heist owner', 'display_code', x.display_code,
    'source', 'Owner approval 2026-10-28 13:25 (Asia/Bishkek) in the review conversation, after reviewing every step, question and answer key for Vocabulary V1-V6 (PR #1739, IELTS_Vocabulary_V1_V6_steps_review.pdf)',
    'content_and_answers', 'Approved',
    'authorization', 'Release this exact version to all eligible students',
    'provenance', 'Original Brains Heist AI-assisted questions and explanations built on the vocabulary lessons; no third-party passages or questions copied',
    'limits', 'Targeted practice only. No calibrated equivalence, band or semantic originality certification. School, entitlement, source-evidence and repeat-exposure checks remain.')
  from private.ielts_learning_tasks where code = x.code;
  if not private.ielts_learning_publicly_released(x.code) then raise exception 'release_not_effective: %', x.code; end if;
  if not private.ielts_practice_material_allowed('targeted', x.code) then raise exception 'practice_material_not_allowed: %', x.code; end if;
 end loop;
end;$release$;
