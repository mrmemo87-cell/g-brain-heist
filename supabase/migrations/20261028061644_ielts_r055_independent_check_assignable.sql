-- Make R-055 (Lesson 6 step 6 of 6, Mixed check; bh-ielts-targeted-reading-r33-v2) assignable. Owner instruction
-- 2026-10-28 12:15 Asia/Bishkek ("Do that professionally").
-- Problem: R-055 is an independent check, but its originality review (2026-10-26) recorded it as a variant of R-049
-- (r33-v1, its v0.1.0 draft). The allocation gate never allows a variant to be an independent check, so every attempt
-- to assign R-055 (to one student or a whole batch) fails.
-- Fix: append a new owner originality review recording R-055 as fresh. This is accurate for exposure: the only version
-- it shares questions with, R-049, was never released and never allocated, so no student can have seen them; the other
-- matches are its sibling Lesson 6 steps on the same passage, by design. The 2026-10-26 review is kept (append-only);
-- the label reads the latest review for the exact content and match set.
-- Guards: exact content hash as released; every match must be a Lesson 6 step (r28-r33, v1 or v2); R-049 must still be
-- unreleased and unallocated; afterwards R-055 must be labelled fresh, released and allowed as practice.
do $fix$
declare owner constant uuid := '1d4f3b8d-f24f-4651-ad33-85165359cf88';
 v_code constant text := 'bh-ielts-targeted-reading-r33-v2';
 hash constant text := '6afaa70484ceed081e8dede868a07798360edab71ba50fb92c9b276daadfaf5a';
 p jsonb; m jsonb; stray text;
begin
 if not exists(select 1 from public.users where id = owner and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'originality_owner_required'; end if;
 if private.ielts_material_code('targeted', v_code) is distinct from 'R-055' then raise exception 'display_code_changed'; end if;
 if not exists(select 1 from private.ielts_learning_tasks where code = 'bh-ielts-targeted-reading-r33-v2' and purpose = 'independent_check') then raise exception 'not_an_independent_check'; end if;
 p := private.ielts_originality_payload('targeted', v_code);
 if p->>'content_hash' is distinct from hash then raise exception 'reviewed_version_changed'; end if;
 if private.ielts_originality_label('targeted', v_code) is distinct from 'Variant of R-049 · repeat practice' then raise exception 'unexpected_current_label: %', private.ielts_originality_label('targeted', v_code); end if;
 if private.ielts_learning_publicly_released('bh-ielts-targeted-reading-r33-v1')
    or exists(select 1 from private.ielts_learning_allocations where task_code = 'bh-ielts-targeted-reading-r33-v1')
    or exists(select 1 from private.ielts_learning_deferred_allocations where task_code = 'bh-ielts-targeted-reading-r33-v1')
 then raise exception 'r049_was_exposed'; end if;
 m := private.ielts_originality_matches('targeted', v_code, p);
 select string_agg((e->>'material_type') || ':' || (e->>'material_id') || ' (' || (e->>'reason') || ')', ', ') into stray
 from jsonb_array_elements(m) e
 where e->>'reason' = 'exact_copy' or e->>'material_type' <> 'targeted' or e->>'material_id' !~ '^bh-ielts-targeted-reading-r(2[89]|3[0-3])-v[12]$';
 if stray is not null then raise exception 'unexpected_originality_match: %', stray; end if;
 insert into private.ielts_material_originality_reviews(material_type, material_id, content_hash, match_hash, decision, rationale, content_checked, recording_checked, reviewed_by)
 values ('targeted', v_code, hash, private.ielts_originality_hash(m::text), 'fresh',
  'Corrected review: R-055 is the released Lesson 6 mixed check. It shares questions only with its own v0.1.0 draft R-049, which was never released or allocated, so no student can have seen them; the other matches are the sibling Lesson 6 steps on the same passage, by design. Recorded as fresh so the check can be assigned after the guided steps; supersedes the 2026-10-26 variant record. Owner instruction 2026-10-28 12:15 (Asia/Bishkek).',
  true, false, owner);
 if private.ielts_originality_label('targeted', v_code) is distinct from 'Originality reviewed' then raise exception 'label_not_corrected'; end if;
 if not private.ielts_learning_publicly_released(v_code) then raise exception 'release_lost'; end if;
 if not private.ielts_practice_material_allowed('targeted', v_code) then raise exception 'practice_not_allowed'; end if;
end;$fix$;
