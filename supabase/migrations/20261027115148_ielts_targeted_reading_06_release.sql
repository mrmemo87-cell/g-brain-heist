-- Owner release of the Lesson 6 step-by-step targeted reading tasks R-050..R-055 to all eligible students, 2026-10-27.
-- Authority: owner instruction 2026-10-27 15:03 Asia/Bishkek ("make lesson 6 and its lessons approved and live to be
-- used normally"), confirmed 17:50 ("Please do it"). Exact-version releases pinned to the piloted content hashes; any
-- change aborts. Originality reviews recorded 2026-10-26. Append-only. Practice only; no bands or calibration.
do $release$
declare owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88'; x record; pl jsonb;
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required'; end if;
 for x in select * from (values
  ('R-050','bh-ielts-targeted-reading-r28-v2','315f01a822b0ead0bf8c9724c3a904f1bfdf337a151f371dcaf16b416897f3c3'),
  ('R-051','bh-ielts-targeted-reading-r29-v2','45d6d69939a0bbf6f28f9da60fde2ccabc61d1cfc4ee60af405b9d3612762dd3'),
  ('R-052','bh-ielts-targeted-reading-r30-v2','f7a55837b86f911e7c0294327c43dfbb3ceabbf464def6575e4289fdc43b76f0'),
  ('R-053','bh-ielts-targeted-reading-r31-v2','c20e1e225e43bdd94fe9129a8c28dc33e73a80c54fb585c3ed677107fd7457c1'),
  ('R-054','bh-ielts-targeted-reading-r32-v2','934cae95deabddb40c45158b78710535805596fb7623aaa24841cd64d8009ec3'),
  ('R-055','bh-ielts-targeted-reading-r33-v2','6afaa70484ceed081e8dede868a07798360edab71ba50fb92c9b276daadfaf5a')
 ) v(display_code, code, hash) loop
  pl := private.ielts_originality_payload('targeted', x.code);
  if pl->>'content_hash' is distinct from x.hash then raise exception 'reviewed_release_version_changed: %', x.code; end if;
  if private.ielts_originality_label('targeted', x.code) is null then raise exception 'originality_label_missing: %', x.code; end if;
  insert into private.ielts_learning_releases(task_code, exact_content_hash, version, audio_sha256, authorized_by, authorized_at, acceptance)
  select code, x.hash, version, audio_sha256, owner, '2026-10-27T15:03:00+06',
   jsonb_build_object('bible', '2.0.0', 'reviewer', 'Sobbi — Brains Heist owner', 'display_code', x.display_code,
    'source', 'Owner instruction 2026-10-27 15:03 (Asia/Bishkek) in the review conversation, after reviewing PR #1725 and piloting the tasks with a student; confirmed 17:50',
    'content_and_answers', 'make lesson 6 and its lessons approved and live to be used normally',
    'authorization', 'Release this exact version to all eligible students',
    'provenance', 'Original Brains Heist AI-assisted text and questions built on the Lesson 6 passage; no third-party passages or questions copied',
    'limits', 'Targeted practice only. No calibrated equivalence, band or semantic originality certification. School, entitlement, source-evidence and repeat-exposure checks remain.')
  from private.ielts_learning_tasks where code = x.code;
  if not private.ielts_learning_publicly_released(x.code) then raise exception 'release_not_effective: %', x.code; end if;
 end loop;
end;$release$;
