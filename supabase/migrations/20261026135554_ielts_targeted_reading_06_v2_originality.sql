-- Owner originality review of Targeted Reading 06 v0.2.0 (R-050 to R-055), 2026-10-26.
-- Source: the owner's instruction in the review session, 2026-10-26 19:54 (Asia/Bishkek), after being told R-050 to R-055
-- would be recorded as variants of R-044 to R-049: "Yeah do it".
-- R-050 (step 1) has no automated matches, so it is recorded as fresh. R-051 to R-055 share the Lesson 6 passage and
-- questions with their v0.1.0 versions, so each is recorded as a variant of its own predecessor (R-045 to R-049).
-- Each row is pinned to the exact content hash and match set the owner was shown; any change aborts the whole migration.
-- This records originality only: nothing is released. The teacher still confirms the material and assigns it to the
-- named pilot student. Append-only; nothing is updated or deleted.
do $originality$
declare x record; p jsonb; m jsonb; parent_p jsonb;
 owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88';
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'originality_owner_required'; end if;
 for x in select * from (values
  ('R-050','bh-ielts-targeted-reading-r28-v2','315f01a822b0ead0bf8c9724c3a904f1bfdf337a151f371dcaf16b416897f3c3',null::text,null::text),
  ('R-051','bh-ielts-targeted-reading-r29-v2','45d6d69939a0bbf6f28f9da60fde2ccabc61d1cfc4ee60af405b9d3612762dd3','bh-ielts-targeted-reading-r29-v1','R-045'),
  ('R-052','bh-ielts-targeted-reading-r30-v2','f7a55837b86f911e7c0294327c43dfbb3ceabbf464def6575e4289fdc43b76f0','bh-ielts-targeted-reading-r30-v1','R-046'),
  ('R-053','bh-ielts-targeted-reading-r31-v2','c20e1e225e43bdd94fe9129a8c28dc33e73a80c54fb585c3ed677107fd7457c1','bh-ielts-targeted-reading-r31-v1','R-047'),
  ('R-054','bh-ielts-targeted-reading-r32-v2','934cae95deabddb40c45158b78710535805596fb7623aaa24841cd64d8009ec3','bh-ielts-targeted-reading-r32-v1','R-048'),
  ('R-055','bh-ielts-targeted-reading-r33-v2','6afaa70484ceed081e8dede868a07798360edab71ba50fb92c9b276daadfaf5a','bh-ielts-targeted-reading-r33-v1','R-049')
 ) reviewed(display_code, code, hash, parent_code, parent_display) loop
  if private.ielts_material_code('targeted', x.code) is distinct from x.display_code then raise exception 'display_code_changed: %', x.code; end if;
  p := private.ielts_originality_payload('targeted', x.code);
  if p->>'content_hash' is distinct from x.hash then raise exception 'reviewed_version_changed: %', x.code; end if;
  m := private.ielts_originality_matches('targeted', x.code, p);
  if x.parent_code is null then
   if jsonb_array_length(m) > 0 then raise exception 'originality_matches_found: %', x.code; end if;
   insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
   values ('targeted', x.code, x.hash, private.ielts_originality_hash(m::text), 'fresh',
    'Original Brains Heist learn-first step (question types, no passage). Automated comparison against the full material inventory found no shared text or questions. Owner instruction 2026-10-26 19:54 (Asia/Bishkek).',
    true, false, owner);
  else
   if private.ielts_material_code('targeted', x.parent_code) is distinct from x.parent_display then raise exception 'parent_code_changed: %', x.code; end if;
   if not exists(select 1 from jsonb_array_elements(m) e where e->>'material_id' = x.parent_code) then raise exception 'parent_not_matched: %', x.code; end if;
   parent_p := private.ielts_originality_payload('targeted', x.parent_code);
   insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, parent_type, parent_id, parent_hash, rationale, content_checked, recording_checked, reviewed_by)
   values ('targeted', x.code, x.hash, private.ielts_originality_hash(m::text), 'variant', 'targeted', x.parent_code, parent_p->>'content_hash',
    'Learn-first version (v0.2.0) of ' || x.parent_display || ': same Lesson 6 passage and questions, with a worked example and an explanation for every answer. The other matches are the sibling steps on the same passage. Owner instruction 2026-10-26 19:54 (Asia/Bishkek).',
    true, false, owner);
  end if;
  perform private.ielts_originality_store('targeted', x.code);
  if private.ielts_originality_label('targeted', x.code) is null then raise exception 'originality_label_missing: %', x.code; end if;
  if private.ielts_learning_publicly_released(x.code) then raise exception 'unexpected_release: %', x.code; end if;
 end loop;
end;$originality$;
