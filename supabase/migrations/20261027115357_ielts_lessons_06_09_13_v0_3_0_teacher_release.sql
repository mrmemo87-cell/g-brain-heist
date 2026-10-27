-- Owner release: teacher-library templates for Lessons 06, 09 and 13 v0.3.0, 2026-10-27.
-- Lesson 06: owner instruction 15:03 Asia/Bishkek ("make lesson 6 and its lessons approved and live"), confirmed 17:50.
-- Lessons 09 and 13: owner approval 17:50 ("Approve") after the external review and revisions in PR #1732.
-- Each template was built with --template, validated (zero errors), branded with the production code (no placeholders),
-- uploaded through a one-time capability endpoint limited to exact paths, sizes and SHA-256, and re-downloaded and
-- verified. Each row changes only if it still holds the exact v0.2.0 template; anything else aborts the whole change.
do $swap$
declare x record; n int;
begin
 for x in select * from (values
  ('IELTS-06','ed10921067780dbfa916ea60b64039e7d220b885be2e14834105c4e9a474ccdb','07f63b961f1907e35332c462bec2f258165367ef90adda3b77de56b260cf4c5d',1291686,
   'Owner instruction on 2026-10-27 15:03 Asia/Bishkek after review of PR #1725 and the student pilot of the Lesson 6 step-by-step practice: ''make lesson 6 and its lessons approved and live to be used normally''; confirmed 17:50. Released as 0.3.0; previous approved v0.2.0 template ed10921067780dbfa916ea60b64039e7d220b885be2e14834105c4e9a474ccdb superseded.'),
  ('IELTS-09','dfa251fe755c0bc6fc05d71a4f0f491c509c80d8487dc090195444522baf9e6e','0b4dcbc414192a1f40c48813eff8dd2a379b066e84c203e6206c3c1dca66ee58',1242251,
   'Owner approval on 2026-10-27 17:50 Asia/Bishkek (''Approve'') after the v0.3.0 review copy with answer keys, an external content and level review and the revisions in PR #1732. Released as 0.3.0; previous approved v0.2.0 template dfa251fe755c0bc6fc05d71a4f0f491c509c80d8487dc090195444522baf9e6e superseded.'),
  ('IELTS-13','10170a84b5e02b06a21df8a34468c67863a60899703b069d6c9eb45f1a005b62','236c7321a2e85505cad673b442712a83c3389b3e22796dd302998ba2209d9be9',1229348,
   'Owner approval on 2026-10-27 17:50 Asia/Bishkek (''Approve'') after the v0.3.0 review copy with answer keys, an external content and level review and the revisions in PR #1732. Released as 0.3.0; previous approved v0.2.0 template 10170a84b5e02b06a21df8a34468c67863a60899703b069d6c9eb45f1a005b62 superseded.')
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
