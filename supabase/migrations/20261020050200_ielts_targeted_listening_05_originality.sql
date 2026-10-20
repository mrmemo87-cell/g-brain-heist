-- Targeted Listening 05 install, part 3 of 3: originality review per task (see 20261020050000 for provenance).
do $originality$
declare x record; p jsonb; m jsonb;
begin
 for x in select * from (values ('bh-ielts-targeted-listening-l5-v1','ec4c5c4a7defa4d5453fb7e0c01563725c76b53f4890a154905ee2c665de3163'),('bh-ielts-targeted-listening-l6-v1','1e11e857cc02cc2b38b80817fa98424d0a4b8d15566f15882a3b3059d5b55e22'),('bh-ielts-targeted-listening-l7-v1','c44d519aa0594aeda8caa9481781a29073ae9e454aa948423d153630590df9f9'),('bh-ielts-targeted-listening-l8-v1','98e524765c5306d8ddcf9aa53a743a4c7806cd14f1cc7117affd807d8a1fd1bb'),('bh-ielts-targeted-listening-l9-v1','41d04757a0a6d7edceccce078fe314f4a22a4b77f8b2c0a2e77ad69a7a264738'),('bh-ielts-targeted-listening-l10-v1','e1f5229c07fb5171374efe5a1e491b9bea725c2a7b773ad6c7e2091149d19c12'),('bh-ielts-targeted-listening-l11-v1','897e6d1edb1f48a4ea3b15e8899df8a9062c7b30f2cb2ae9f928ca03260aaead'),('bh-ielts-targeted-listening-l12-v1','635e8519063d9736fbfd1b87f24812645b146634f9fd5ef7b3896578080e82c3'),('bh-ielts-targeted-listening-l13-v1','5a21de843fac7b2f5e0ec13687bffe5f17bc6f07c9e67cd5c66a6d4d0d6c58f5'),('bh-ielts-targeted-listening-l14-v1','2e78905d8d1fc7774c245686f36259dd1f18e3a4a43bcdb213c209f984b5629e')) v(code, sha) loop
  if (select content_sha256 from private.ielts_learning_tasks where code = x.code) is distinct from x.sha then raise exception 'installed_version_changed: %', x.code; end if;
  p := private.ielts_originality_payload('targeted', x.code);
  m := private.ielts_originality_matches('targeted', x.code, p);
  if jsonb_array_length(m) > 0 then raise exception 'originality_matches_found: %', x.code; end if;
  insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
  values ('targeted', x.code, p->>'content_hash', private.ielts_originality_hash(m::text), 'fresh',
   'Original Brains Heist script, questions and synthetic recording. Automated comparison against the full material inventory found no shared text, questions, recording or script. Owner listened to this exact recording with its transcript in the IELTS Approval Queue and approved it on 2026-10-20.',
   true, true, '1d4f3b8d-f24f-4651-ad33-85165359cf88');
  perform private.ielts_originality_store('targeted', x.code);
  if private.ielts_originality_label('targeted', x.code) is null then raise exception 'originality_label_missing: %', x.code; end if;
  if private.ielts_learning_publicly_released(x.code) then raise exception 'unexpected_release: %', x.code; end if;
 end loop;
end;$originality$;
