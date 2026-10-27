-- Owner release: teacher-library templates for Lessons 10 and 14 v0.3.0 with their v2 recordings, 2026-10-27.
-- Content approved by the owner on 2026-10-27 17:50 Asia/Bishkek ("Approve") after the external review and revisions
-- (PR #1732); recordings IELTS-10-L1 v2 and IELTS-14-L1 v2 approved after listening at 18:09 ("Audio approved").
-- The unchanged fresh-check recordings IELTS-10-C1 v1 and IELTS-14-C1 v1 were taken from the released v0.2.0 templates
-- and matched their recorded SHA-256. Each template was built with --template --audio-dir, validated (zero errors),
-- branded with the production code (no placeholders), uploaded through a one-time capability endpoint limited to exact
-- paths, sizes and SHA-256, and re-downloaded and verified. Each row changes only if it still holds the exact v0.2.0
-- template; anything else aborts the whole change.
do $swap$
declare x record; n int;
begin
 for x in select * from (values
  ('IELTS-10','f4b179f1434ec41dffaf6318f7e55e4963cfedcf57affe5300cda6cb9ccac2f1','3e51cab3f73e322deaaaba0c1616972f1b3d5a744e58e65a1955b7d6b3571517',17796016,
   'Owner approval on 2026-10-27 17:50 Asia/Bishkek (''Approve'') after the v0.3.0 review copy with answer keys, an external content and level review and the revisions in PR #1732; IELTS-10-L1 v2 recording approved after listening at 18:09 (''Audio approved''). Released as 0.3.0; previous approved v0.2.0 template f4b179f1434ec41dffaf6318f7e55e4963cfedcf57affe5300cda6cb9ccac2f1 superseded.'),
  ('IELTS-14','b63f02b364b95a6deec9b4baea1db890feb6101b979ff641efd997b55420210f','048911a020c6c52d9b20641e671ff37e4af50a314f3030dcff50b25119b21ff2',15817791,
   'Owner approval on 2026-10-27 17:50 Asia/Bishkek (''Approve'') after the v0.3.0 review copy with answer keys, an external content and level review and the revisions in PR #1732; IELTS-14-L1 v2 recording approved after listening at 18:09 (''Audio approved''). Released as 0.3.0; previous approved v0.2.0 template b63f02b364b95a6deec9b4baea1db890feb6101b979ff641efd997b55420210f superseded.')
 ) v(code, old_sha, new_sha, size, basis) loop
  if not exists (select 1 from storage.objects where bucket_id = 'ielts-teacher-course-packs'
     and name = 'templates/' || x.code || '/0.3.0/' || x.new_sha || '.zip' and (metadata->>'size')::int = x.size) then
   raise exception 'template_object_missing: %', x.code; end if;
  update private.ielts_teacher_pack_templates
     set version = '0.3.0', object_path = 'templates/' || x.code || '/0.3.0/' || x.new_sha || '.zip', sha256 = x.new_sha,
         size_bytes = x.size, released_at = now(), authorization_basis = x.basis
   where lesson_code = x.code and version = '0.2.0' and sha256 = x.old_sha;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected_one_template_row: %', x.code; end if;
 end loop;
end;$swap$;
