-- Owner release of Targeted Listening L-020 to L-029 (codes l5–l14) to all eligible students in any school, 2026-10-20.
-- Source: owner instruction 2026-10-20 09:53 (Asia/Bishkek): "release to all eligible students in any school", following his
-- exact-file listening approval of the ten recordings at 07:14. Each release is pinned to the exact content hash and the
-- exact audio SHA-256 he approved; any change aborts the whole migration. Append-only; nothing is updated or deleted.
-- Releases are not school-scoped: school membership, entitlement, source-evidence and repeat-exposure checks still apply
-- at assignment. Diagnostic Bible 2.0.0: practice only, no bands or calibration.
do $release$
declare x record;
 owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88';
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required'; end if;
 for x in select * from (values
  ('L-020','bh-ielts-targeted-listening-l5-v1','568c529dbedc7a7b2289bb24e97bea54af716800b755942fc6887d58c74e65f8','a45632cd2e752097f850cb53febe2c207a7324e97438c38aa910ecf17feaf96a'),
  ('L-021','bh-ielts-targeted-listening-l6-v1','0935db51a9b24df8ac3286010cccc86d0ed5e864c101cff6209de6d005650f84','7e494ee370337c64a6135a10d5c7e5e0b4af2d8144e5d25e4391f16f89448d63'),
  ('L-022','bh-ielts-targeted-listening-l7-v1','38eccc0e08ffc163092cfffa336ff49e9b6678272d23a1726aeb5878bde44f8a','9d054b008c567a96137785041d2c42b19a0ffb8570681b3ec24eda443880e2d9'),
  ('L-023','bh-ielts-targeted-listening-l8-v1','c4bc91314e16bdeac3c22cf759d86797644504c186cfdf04c4d8cb601a4ed58e','70bbb88ce8e9b81c3dd7ecc445bb69d0fe436c33047fc8e24382a0b344a0b5c4'),
  ('L-024','bh-ielts-targeted-listening-l9-v1','4e6c84abf72337c780a9a2f7e1b3f74ba653a9df457f0ed0e02eded8801a649e','b84254c2ef86d13039cbacd60d93c4e6ba5255672bf632088ee139bd68b49021'),
  ('L-025','bh-ielts-targeted-listening-l10-v1','832442ce20f20300a7106e573c13666e7827b17484c4b06f8830f7c713e95392','d2d37340e0427722a7946a7dbe83815d2bf5ab90410ef7229cf8156dfbdce75e'),
  ('L-026','bh-ielts-targeted-listening-l11-v1','6b38ac6202d0ae0e08efb6ecf3aa455b1c6d51c7b0aa7760c97386ea45089cd1','73d108de1bd1053b87890c4ec31607bdfc3bf97f539562d91a22833dcf6868fe'),
  ('L-027','bh-ielts-targeted-listening-l12-v1','e575bc9570272886fbb2a9a396798677800ad52a25c77f5aa55b5be7b8709b23','a3fdf6d974ac5281f449b4fa15e1f5e3f3d771281e60da3b5cf4c60e0dfaf2f0'),
  ('L-028','bh-ielts-targeted-listening-l13-v1','4441cd252a532e586e5c6b5d9fcbe7245de1dbec8a24efd49a54f3aed9a8be53','fd0b1c23512a453050f30e412756a7efcb2aab58fe4dce23131b8180ddec3197'),
  ('L-029','bh-ielts-targeted-listening-l14-v1','3f50f3d554dc888d4503847fde036bc5a672df8d470c9344569285baee49441b','a312eaa1e1829c539c7da116796228835a38ead93193b9e89fc28c3c5b7dcac3')
 ) approved(display_code, code, hash, audio) loop
  if private.ielts_material_code('targeted', x.code) is distinct from x.display_code then raise exception 'display_code_changed: %', x.code; end if;
  if private.ielts_originality_payload('targeted', x.code)->>'content_hash' is distinct from x.hash
     or (select audio_sha256 from private.ielts_learning_tasks where code = x.code) is distinct from x.audio then raise exception 'reviewed_release_version_changed: %', x.code; end if;
  if private.ielts_originality_label('targeted', x.code) is null then raise exception 'originality_label_missing: %', x.code; end if;
  insert into private.ielts_learning_releases(task_code, exact_content_hash, version, audio_sha256, authorized_by, authorized_at, acceptance)
  select code, x.hash, version, audio_sha256, owner, '2026-10-20T09:53:00+06',
   jsonb_build_object('bible', '2.0.0', 'reviewer', 'Sobbi — Brains Heist owner', 'display_code', x.display_code,
    'source', 'Owner instruction 2026-10-20 09:53 (Asia/Bishkek): release to all eligible students in any school',
    'audio', 'Owner listened to and approved this exact recording, 2026-10-20 07:14 (IELTS Approval Queue)',
    'authorization', 'Release this exact version to all eligible students in any school',
    'provenance', 'Original Brains Heist scripts and questions; owner-approved synthetic recording',
    'limits', 'Targeted practice only. No calibrated equivalence, band or semantic originality certification. Released before the named-student pilot was completed, on the owner''s instruction. School, entitlement, source-evidence and repeat-exposure checks remain.')
  from private.ielts_learning_tasks where code = x.code;
  if not private.ielts_learning_publicly_released(x.code) then raise exception 'release_not_effective: %', x.code; end if;
 end loop;
end;$release$;
