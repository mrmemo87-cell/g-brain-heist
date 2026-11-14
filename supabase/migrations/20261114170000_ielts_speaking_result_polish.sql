-- IELTS Speaking result polish (Diagnostic Bible 2.5.0; Visual & UX Bible 1.12.0), after the owner reviewed what two
-- students saw on 2026-11-14:
-- 1. Students and teachers are shown by full name when one is stored (usernames read badly in results).
-- 2. A cached AI feedback draft is reused only if it was written with the current draft instructions; drafts from
--    before the "name real mistakes" instructions (deployed 2026-11-14 09:06 UTC) are written again.
-- 3. A comment that still holds the AI's "Pronunciation was not assessed" placeholder can never be shared with bands.

create or replace function private.ielts_speaking_draft_current_since() returns timestamptz language sql immutable set search_path = '' as $$
  -- Move this forward whenever the interview draft instructions change, so older cached drafts are not reused.
  select '2026-11-14 09:10:00+00'::timestamptz $$;
revoke all on function private.ielts_speaking_draft_current_since() from public, anon, authenticated, service_role;

create or replace function public.rpc_ielts_speaking_session(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; r private.ielts_speaking_reviews; teacher boolean; begin
 if not private.can_access_ielts_speaking(p_session_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 teacher:=private.can_review_ielts_speaking_student(s.student_id);
 select * into r from private.ielts_speaking_reviews where session_id=s.id order by reviewed_at desc,id desc limit 1;
 return jsonb_build_object('id',s.id,'student_id',s.student_id,'teacher_id',s.teacher_id,'student_name',(select coalesce(nullif(trim(full_name),''),username) from public.users where id=s.student_id),'status',s.status,'created_at',s.created_at,
 'content_hash',s.content_hash,'package',case when teacher or s.status='submitted' then s.package_snapshot else jsonb_build_object('title',s.package_snapshot->>'title','instructions',s.package_snapshot->>'instructions','parts',case when s.preparation_started_at is null then '[]'::jsonb else jsonb_build_array(s.package_snapshot->'parts'->1) end) end,
 'clips',coalesce((select jsonb_agg(to_jsonb(c)-'session_id' order by part,created_at,id) from private.ielts_speaking_clips c where c.session_id=s.id),'[]'::jsonb),'source_hash',private.ielts_speaking_source_hash(s.id),
 'can_review',teacher,'can_record',teacher and s.teacher_id=auth.uid(),'evidence_kind',s.evidence_kind,'preparation_started_at',s.preparation_started_at,
 'incidents',(select count(*) from private.ielts_speaking_incidents where session_id=s.id),
 'review',case when r.id is null then null else jsonb_build_object('id',r.id,'fields',r.fields,'reviewed_at',r.reviewed_at,'teacher_name',(select coalesce(nullif(trim(full_name),''),username) from public.users where id=r.reviewer_id)) end,'confidence','low','readiness_available',false);
end; $$;

create or replace function public.rpc_ielts_claim_speaking_ai(p_session_id uuid,p_model text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; d private.ielts_speaking_ai_drafts; h text; begin
 if not private.can_access_ielts_speaking(p_session_id) or not exists(select 1 from private.ielts_speaking_sessions where id=p_session_id and private.can_review_ielts_speaking_student(student_id)) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if s.status<>'submitted' or length(p_model) not between 3 and 100 then raise exception 'speaking_ai_source_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0)); h:=private.ielts_speaking_source_hash(s.id);
 select * into d from private.ielts_speaking_ai_drafts where session_id=s.id and requested_by=auth.uid() and source_hash=h and model=p_model and prompt_version='bh-speaking-audio-simple-v1' and state='ready' and completed_at>=private.ielts_speaking_draft_current_since() order by created_at desc limit 1;
 if found then return jsonb_build_object('id',d.id,'source_hash',h,'fields',d.fields); end if;
 if exists(select 1 from private.ielts_speaking_ai_drafts where session_id=s.id and requested_by=auth.uid() and state='pending' and created_at>now()-interval '2 minutes') then raise exception 'speaking_ai_working'; end if;
 if (select count(*) from private.ielts_speaking_ai_drafts where requested_by=auth.uid() and created_at>now()-interval '10 minutes')>=3 or (select count(*) from private.ielts_speaking_ai_drafts where requested_by=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'speaking_ai_rate_limit'; end if;
 insert into private.ielts_speaking_ai_drafts(session_id,requested_by,source_hash,prompt_version,model) values(s.id,auth.uid(),h,'bh-speaking-audio-simple-v1',p_model) returning * into d;
 return jsonb_build_object('id',d.id,'source_hash',h,'context',public.rpc_ielts_speaking_session(s.id));
end; $$;

create or replace function public.rpc_ielts_share_speaking_result(p_session_id uuid, p_review_id uuid, p_expected_review_id uuid,
 p_source_hash text, p_fields jsonb, p_confirmed boolean, p_ai_draft_id uuid, p_bands jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; b private.ielts_speaking_part_bands; parts integer; begin
 if jsonb_typeof(p_bands) <> 'object' or (select count(*) from jsonb_object_keys(p_bands)) <> 8 then raise exception 'speaking_bands_required'; end if;
 foreach k in array array['fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation','part_1','part_2','part_3','overall'] loop
  if not private.ielts_speaking_band_ok(p_bands, k) then raise exception 'speaking_bands_required'; end if;
 end loop;
 -- Visual & UX Bible 1.12.0: an AI placeholder ("not assessed") is never shared next to a teacher's band.
 if exists(select 1 from jsonb_each(p_fields->'observations') o where o.value->>'comment' ilike '%was not assessed in this draft%') then raise exception 'speaking_placeholder_comment'; end if;
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

revoke all on function public.rpc_ielts_speaking_session(uuid) from public, anon, service_role;
revoke all on function public.rpc_ielts_claim_speaking_ai(uuid,text) from public, anon, service_role;
revoke all on function public.rpc_ielts_share_speaking_result(uuid,uuid,uuid,text,jsonb,boolean,uuid,jsonb) from public, anon, service_role;
grant execute on function public.rpc_ielts_speaking_session(uuid) to authenticated;
grant execute on function public.rpc_ielts_claim_speaking_ai(uuid,text) to authenticated;
grant execute on function public.rpc_ielts_share_speaking_result(uuid,uuid,uuid,text,jsonb,boolean,uuid,jsonb) to authenticated;
