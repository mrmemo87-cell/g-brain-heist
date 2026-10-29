-- Owner release: workbook fix for Lessons 01, 03, 06, V1 and X3, 2026-10-29. Owner question 15:19 Asia/Bishkek about a
-- completion question printed with a separate answer box; owner instruction 15:23 ("go"). Every completion question now
-- gets the same write-on line (PR #1760). Same lesson content and recordings (audio bytes identical to the templates
-- released earlier today); validated with zero errors, no slide overflow, branded with the production code, uploaded
-- through a one-time endpoint limited to exact paths, sizes and SHA-256 (retired) and re-downloaded and verified.
-- Each row changes only if it still holds the exact template released earlier today; anything else aborts the change.
do $swap$
declare x record; n int;
begin
 for x in select * from (values
  ('IELTS-01','1.2.0','1f7e31cec692c759a9a256006a4170330db4205c9a17ab99a96d2fcfe54997b5','fde53b2ec34b9846d9299eea3ec99e5ee6ac88bc86a5e423bb27c0d73b760441',7231483),
  ('IELTS-03','1.1.0','ad83fd22cddafbc3e43f8d488b281c9c4463dd286560432d3e6dbabb7d140ca3','eb75a0a8080ac60e3f7232eacf59b0ccb123103cccc0a53f96dd25bca6c6ec99',5970641),
  ('IELTS-06','0.3.0','379c0ca544b7b600b4ae396725d0678e3d44e9496a4022febdabafd239df0e51','72a8beedcc77e35f792a808fa0006ca58ae3bd62e330959a634050f5962506a4',1217474),
  ('IELTS-V1','1.1.0','8cdef1b749abe1ab38726a72f4ad522cb77ec6623150143f7a235a6f8575469a','0c72ad42cc270db91b30931ea93d602e67f48027dfc02643b2cc49986f5275ae',1254195),
  ('IELTS-X3','1.1.1','9dfdb8c0ae66b0e75ecc6fcac95554477a5648cdafe626dc7d05c3b00fa6fbd4','9a9b7b6ebed80bc5276ff2a43d3dfe070ae7905c6e93131ce3945683653d4d9f',1504235)
 ) v(code, ver, old_sha, new_sha, size) loop
  if not exists (select 1 from storage.objects where bucket_id = 'ielts-teacher-course-packs'
     and name = 'templates/' || x.code || '/' || x.ver || '/' || x.new_sha || '.zip' and (metadata->>'size')::int = x.size) then
   raise exception 'template_object_missing: %', x.code; end if;
  update private.ielts_teacher_pack_templates
     set object_path = 'templates/' || x.code || '/' || x.ver || '/' || x.new_sha || '.zip', sha256 = x.new_sha,
         size_bytes = x.size, released_at = now(),
         authorization_basis = authorization_basis || ' Workbook fix on 2026-10-29 15:23 Asia/Bishkek (''go''): the same write-on line for every completion question; previous template ' || x.old_sha || ' superseded.'
   where lesson_code = x.code and version = x.ver and sha256 = x.old_sha;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected_one_template_row: %', x.code; end if;
 end loop;
end;$swap$;
