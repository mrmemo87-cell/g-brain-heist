-- IELTS Speaking interview: Teacher Speaking band, criterion bands and Part bands shared together with the feedback
-- (Diagnostic Bible 2.3.0 section 10.8; Visual & UX Bible 1.9.0 section 13.9).
-- 1. private.ielts_speaking_part_bands gains the four criterion bands, the Teacher Speaking band and the review they
--    were shared with. Older rows (Part bands only) stay valid; the table stays append-only.
-- 2. rpc_ielts_share_speaking_result shares the written feedback and every band in one transaction, so the student
--    never sees a half-finished result and the teacher never has to share before grading.
-- 3. rpc_ielts_speaking_session_extras returns the new bands; teachers may set bands before the first share.

alter table private.ielts_speaking_part_bands
  add column if not exists fluency_coherence numeric check (fluency_coherence between 0 and 9 and fluency_coherence * 2 = floor(fluency_coherence * 2)),
  add column if not exists lexical_resource numeric check (lexical_resource between 0 and 9 and lexical_resource * 2 = floor(lexical_resource * 2)),
  add column if not exists grammar_range_accuracy numeric check (grammar_range_accuracy between 0 and 9 and grammar_range_accuracy * 2 = floor(grammar_range_accuracy * 2)),
  add column if not exists pronunciation numeric check (pronunciation between 0 and 9 and pronunciation * 2 = floor(pronunciation * 2)),
  add column if not exists overall numeric check (overall between 0 and 9 and overall * 2 = floor(overall * 2)),
  add column if not exists review_id uuid references private.ielts_speaking_reviews(id);
create unique index if not exists ielts_speaking_part_bands_review on private.ielts_speaking_part_bands(review_id) where review_id is not null;

create or replace function private.ielts_speaking_band_ok(p jsonb, k text) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p->k) = 'number' and (p->>k)::numeric between 0 and 9 and (p->>k)::numeric * 2 = floor((p->>k)::numeric * 2) $$;

create or replace function public.rpc_ielts_share_speaking_result(p_session_id uuid, p_review_id uuid, p_expected_review_id uuid,
 p_source_hash text, p_fields jsonb, p_confirmed boolean, p_ai_draft_id uuid, p_bands jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; b private.ielts_speaking_part_bands; parts integer; begin
 if jsonb_typeof(p_bands) <> 'object' or (select count(*) from jsonb_object_keys(p_bands)) <> 8 then raise exception 'speaking_bands_required'; end if;
 foreach k in array array['fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation','part_1','part_2','part_3','overall'] loop
  if not private.ielts_speaking_band_ok(p_bands, k) then raise exception 'speaking_bands_required'; end if;
 end loop;
 -- Authorization, confirmation, source hash, conflict checks and feedback validation live in the share RPC.
 perform public.rpc_ielts_share_speaking_review(p_session_id, p_review_id, p_expected_review_id, p_source_hash, p_fields, p_confirmed, p_ai_draft_id);
 -- Section 10.8: only a complete interview (Parts 1-3 recorded) can carry a Teacher Speaking band. Same transaction.
 select count(distinct part) into parts from private.ielts_speaking_clips where session_id = p_session_id;
 if parts < 3 then raise exception 'speaking_all_parts_required'; end if;
 select * into b from private.ielts_speaking_part_bands where review_id = p_review_id;
 if found then
  if b.part_1 <> (p_bands->>'part_1')::numeric or b.part_2 <> (p_bands->>'part_2')::numeric or b.part_3 <> (p_bands->>'part_3')::numeric
   or b.fluency_coherence is distinct from (p_bands->>'fluency_coherence')::numeric or b.lexical_resource is distinct from (p_bands->>'lexical_resource')::numeric
   or b.grammar_range_accuracy is distinct from (p_bands->>'grammar_range_accuracy')::numeric or b.pronunciation is distinct from (p_bands->>'pronunciation')::numeric
   or b.overall is distinct from (p_bands->>'overall')::numeric then raise exception 'speaking_review_conflict'; end if;
 else
  insert into private.ielts_speaking_part_bands(session_id, reviewer_id, part_1, part_2, part_3, fluency_coherence, lexical_resource,
    grammar_range_accuracy, pronunciation, overall, review_id)
  values (p_session_id, auth.uid(), (p_bands->>'part_1')::numeric, (p_bands->>'part_2')::numeric, (p_bands->>'part_3')::numeric,
    (p_bands->>'fluency_coherence')::numeric, (p_bands->>'lexical_resource')::numeric, (p_bands->>'grammar_range_accuracy')::numeric,
    (p_bands->>'pronunciation')::numeric, (p_bands->>'overall')::numeric, p_review_id);
 end if;
 return public.rpc_ielts_speaking_session(p_session_id);
end $$;

create or replace function public.rpc_ielts_speaking_session_extras(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s private.ielts_speaking_sessions; teacher boolean; reviewed boolean; b private.ielts_speaking_part_bands; begin
 if not private.can_access_ielts_speaking(p_session_id) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id = p_session_id;
 teacher := private.can_review_ielts_speaking_student(s.student_id);
 reviewed := exists(select 1 from private.ielts_speaking_reviews where session_id = s.id);
 if not teacher and not reviewed then
  return jsonb_build_object('analysis', '[]'::jsonb, 'part_bands', null, 'can_set_bands', false);
 end if;
 select * into b from private.ielts_speaking_part_bands where session_id = s.id order by created_at desc, id desc limit 1;
 return jsonb_build_object(
  'analysis', coalesce((select jsonb_agg(jsonb_build_object('clip_id', a.clip_id, 'part', c.part, 'transcript', a.transcript,
     'highlights', a.highlights, 'pronunciation', a.pronunciation, 'speaker_turns', a.speaker_turns,
     'prompt_version', a.prompt_version, 'created_at', a.created_at) order by c.part, c.created_at, c.id)
   from (select distinct on (x.clip_id) x.* from private.ielts_speaking_clip_analysis x where x.session_id = s.id
         order by x.clip_id, x.created_at desc, x.id desc) a
   join private.ielts_speaking_clips c on c.id = a.clip_id), '[]'::jsonb),
  'missing_clips', case when teacher then (select count(*) from private.ielts_speaking_clips c where c.session_id = s.id
     and not exists(select 1 from private.ielts_speaking_clip_analysis a where a.clip_id = c.id
       and a.prompt_version = private.ielts_speaking_analysis_version())) else 0 end,
  'part_bands', case when b.id is null then null else jsonb_build_object('part_1', b.part_1, 'part_2', b.part_2, 'part_3', b.part_3,
     'fluency_coherence', b.fluency_coherence, 'lexical_resource', b.lexical_resource,
     'grammar_range_accuracy', b.grammar_range_accuracy, 'pronunciation', b.pronunciation, 'overall', b.overall,
     'created_at', b.created_at, 'teacher_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = b.reviewer_id)) end,
  'can_set_bands', teacher and s.status = 'submitted');
end $$;

revoke all on function private.ielts_speaking_band_ok(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.rpc_ielts_share_speaking_result(uuid,uuid,uuid,text,jsonb,boolean,uuid,jsonb) from public, anon, service_role;
revoke all on function public.rpc_ielts_speaking_session_extras(uuid) from public, anon, service_role;
grant execute on function public.rpc_ielts_share_speaking_result(uuid,uuid,uuid,text,jsonb,boolean,uuid,jsonb) to authenticated;
grant execute on function public.rpc_ielts_speaking_session_extras(uuid) to authenticated;
