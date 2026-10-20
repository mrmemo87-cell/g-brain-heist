-- Owner release of Targeted Reading R-019 to R-043 (25 tasks) to all eligible students, 2026-10-20.
-- Source: the owner's own decision message in the release session, 2026-10-20 07:14 (Asia/Bishkek), pasted from the
-- IELTS Approval Queue after reviewing each task's text, questions and highlighted answers:
--   "Reading tasks I approve for release to all students: R-019, R-020, ... R-043".
-- For each task this records (1) an originality review: the automated comparison against the whole material inventory
-- found no shared text, questions, recording or script (zero matches), so the decision is "fresh"; and (2) the exact-
-- version release. Each row is pinned to the exact content hash the owner saw; any change aborts the whole migration.
-- Append-only tables; nothing is updated or deleted. Diagnostic Bible 2.0.0: practice only, no bands or calibration.
do $release$
declare x record; p jsonb; m jsonb;
 owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88';
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required'; end if;
 for x in select * from (values
  ('R-019','bh-ielts-targeted-reading-r3-v1','72a9b4c914ddd057adc512ef4504490ed5050401168a3aff52e2adfb08cd5b81'),
  ('R-020','bh-ielts-targeted-reading-r4-v1','fa0bd9d08722685a22f02e30264db34bb187ff2e10d716bd19d673a6f18eece4'),
  ('R-021','bh-ielts-targeted-reading-r5-v1','1dc90cd636108e3fb1c8504f26a0bb05e0c2e0eee7b7f40a230c48d34c8ff610'),
  ('R-022','bh-ielts-targeted-reading-r6-v1','b7d44d6e5d44946ebf982f93abba2750d36579d62323781b69deba0245fb16a5'),
  ('R-023','bh-ielts-targeted-reading-r7-v1','3cc871c75fd8053b5fdc0a60c8592295a128d6efc308b070952c2ab81a790cc4'),
  ('R-024','bh-ielts-targeted-reading-r8-v1','dfc78cbc57c912e762bba0ceeeca7858e078608a5e3831ae6b734ebb41115a8b'),
  ('R-025','bh-ielts-targeted-reading-r9-v1','fd3a67cdbb0bcaf15a23f1f58e489d7d62048d011ea45924e8801a0ce4c9ec3e'),
  ('R-026','bh-ielts-targeted-reading-r10-v1','0f851702421f385321191d1462a6530ee4b73de3cdfc8966bcc77abd9ec71ac8'),
  ('R-027','bh-ielts-targeted-reading-r11-v1','334eeb259fc96dbf28815421a1b26b2a24f1ed54c3b020ace8377c6d03b93abb'),
  ('R-028','bh-ielts-targeted-reading-r12-v1','3ffd2aeca278080a2d4cb4ef93e5d978dfa3d5e381b81be5467272c4b5fdb6d1'),
  ('R-029','bh-ielts-targeted-reading-r13-v1','6c6fb9bcd58add1d2b3da6b73f36df75e82d4fc34227680a148b4083bc2a0ce1'),
  ('R-030','bh-ielts-targeted-reading-r14-v1','e29fb80caddc2817d2d1ec4d72801c0ba7115f50ade8224cabb2b8a61e0c71c0'),
  ('R-031','bh-ielts-targeted-reading-r15-v1','057e67db2b830e44b46631cf3e1d40bd0d93b19f5bb1380375d77f8ddca6458c'),
  ('R-032','bh-ielts-targeted-reading-r16-v1','527b7644ec95a796409b29727a4e1a8f20b3958f7e4f91618f073df6723c7941'),
  ('R-033','bh-ielts-targeted-reading-r17-v1','c82a0c5a0256631568e2c70094cbed9e76584944313957d817c55755eb6aea27'),
  ('R-034','bh-ielts-targeted-reading-r18-v1','d9a829bed7c8a3a8d10ac7d1d50df78796ab9e241d063a53b4d515caf78ade4c'),
  ('R-035','bh-ielts-targeted-reading-r19-v1','00ee6c6df974ff1dcfa01fdfb3aace606aaf1b57aa53d1fb4a6b991471dd1f9c'),
  ('R-036','bh-ielts-targeted-reading-r20-v1','81a2ccb9957157bf6ca91f1b62416f6cee12d8f35c680318e807cbc5637c9264'),
  ('R-037','bh-ielts-targeted-reading-r21-v1','ce915f1fb84ab73342e7906d8117ea046e78653da43a3d53a5bec186e5b8fa5b'),
  ('R-038','bh-ielts-targeted-reading-r22-v1','c1ebc1e8a54eb273f1f98aa03abcd2691b92fb9503a4418cbfa7b7e4ba40f1c9'),
  ('R-039','bh-ielts-targeted-reading-r23-v1','88910d842077733eca3947c619d5b2c3d8c82bf96c9ba47802a583c8e9784e44'),
  ('R-040','bh-ielts-targeted-reading-r24-v1','05e34e6f13ad9d76bb63bc10097074e27f9a9a56c3d26b3bedd933721263f5ff'),
  ('R-041','bh-ielts-targeted-reading-r25-v1','3ab146bffb077d25486cc967166723b7bf5268998196c992abc492308e5b5d18'),
  ('R-042','bh-ielts-targeted-reading-r26-v1','f77c7c52732359eb8c6607b4e9be5b2d432b2da8ea0e89c8fedbebf41a25fe33'),
  ('R-043','bh-ielts-targeted-reading-r27-v1','fca42c9891b369cc40d07751fc1518f6541b1293451ee17bc6a28193be969daf')
 ) approved(display_code, code, hash) loop
  if private.ielts_material_code('targeted', x.code) is distinct from x.display_code then raise exception 'display_code_changed: %', x.code; end if;
  p := private.ielts_originality_payload('targeted', x.code);
  if p->>'content_hash' is distinct from x.hash then raise exception 'reviewed_release_version_changed: %', x.code; end if;
  m := private.ielts_originality_matches('targeted', x.code, p);
  if jsonb_array_length(m) > 0 then raise exception 'originality_matches_found: %', x.code; end if;
  insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
  values ('targeted', x.code, x.hash, private.ielts_originality_hash(m::text), 'fresh',
   'Original Brains Heist text and questions. Automated comparison against the full material inventory found no shared text, questions, recording or script. Owner reviewed the task content and answers in the IELTS Approval Queue and approved release on 2026-10-20.',
   true, false, owner);
  perform private.ielts_originality_store('targeted', x.code);
  if private.ielts_originality_label('targeted', x.code) is null then raise exception 'originality_label_missing: %', x.code; end if;
  insert into private.ielts_learning_releases(task_code, exact_content_hash, version, audio_sha256, authorized_by, authorized_at, acceptance)
  select code, x.hash, version, audio_sha256, owner, '2026-10-20T07:14:00+06',
   jsonb_build_object('bible', '2.0.0', 'reviewer', 'Sobbi — Brains Heist owner', 'display_code', x.display_code,
    'source', 'Owner decision message 2026-10-20 07:14 (Asia/Bishkek) from the IELTS Approval Queue',
    'content_and_answers', 'Reading tasks I approve for release to all students: R-019 … R-043',
    'authorization', 'Release this exact version to all eligible students',
    'provenance', 'Original Brains Heist AI-assisted text and questions; no third-party passages or questions copied',
    'limits', 'Targeted practice only. No calibrated equivalence, band or semantic originality certification. School, entitlement, source-evidence and repeat-exposure checks remain.')
  from private.ielts_learning_tasks where code = x.code;
  if not private.ielts_learning_publicly_released(x.code) then raise exception 'release_not_effective: %', x.code; end if;
 end loop;
end;$release$;
