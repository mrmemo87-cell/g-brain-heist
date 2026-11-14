-- IELTS Speaking interview: teacher-only AI band estimates (Diagnostic Bible 2.5.0 section 10.10).
-- 1. private.ielts_speaking_ai_estimates: append-only, one row per session, recording set (source hash) and version.
--    Written only by the edge function (service_role) after the server's cautious rules.
-- 2. rpc_ielts_speaking_session_extras returns ai_estimates to teachers only. Students never receive them.
-- Teacher bands are stored separately (ielts_speaking_part_bands); comparing the two later supports calibration
-- (section 18A).

create table if not exists private.ielts_speaking_ai_estimates (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references private.ielts_speaking_sessions(id),
 requested_by uuid not null references public.users(id),
 source_hash text not null,
 version text not null check (length(version) between 3 and 100),
 estimates jsonb not null,
 provider text check (length(provider) <= 200),
 created_at timestamptz not null default now(),
 unique (session_id, source_hash, version)
);
alter table private.ielts_speaking_ai_estimates enable row level security;
revoke all on private.ielts_speaking_ai_estimates from public, anon, authenticated, service_role;
drop trigger if exists speaking_ai_estimates_history on private.ielts_speaking_ai_estimates;
create trigger speaking_ai_estimates_history before update or delete on private.ielts_speaking_ai_estimates
 for each row execute function private.guard_ielts_speaking_extras_history();

create or replace function private.ielts_speaking_estimate_version() returns text language sql immutable set search_path = '' as $$
  select 'bh-ielts-speaking-estimate-v1'::text $$;

create or replace function private.validate_ielts_speaking_estimates(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; begin
 if jsonb_typeof(p) <> 'object' or p->>'version' is distinct from private.ielts_speaking_estimate_version()
  or jsonb_typeof(p->'bands') <> 'object' or (select count(*) from jsonb_object_keys(p->'bands')) <> 8
  or jsonb_typeof(p->'reasons') <> 'object' or jsonb_typeof(p->'basis') <> 'string' or length(p->>'basis') > 400 then return false; end if;
 foreach k in array array['fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation','part_1','part_2','part_3','overall'] loop
  v := p->'bands'->k;
  if v is null then return false; end if;
  if jsonb_typeof(v) = 'null' then continue; end if;
  if jsonb_typeof(v) <> 'number' or (v::text)::numeric not between 0 and 9 or (v::text)::numeric * 2 <> floor((v::text)::numeric * 2) then return false; end if;
 end loop;
 for k, v in select key, value from jsonb_each(p->'reasons') loop
  if k not in ('fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation') or jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 300 then return false; end if;
 end loop;
 return true;
end $$;

create or replace function public.rpc_ielts_save_speaking_ai_estimates(p_session_id uuid, p_requested_by uuid, p_estimates jsonb, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare s private.ielts_speaking_sessions; begin
 select * into s from private.ielts_speaking_sessions where id = p_session_id;
 if s.id is null or s.status <> 'submitted' then raise exception 'speaking_estimate_session'; end if;
 if not exists(select 1 from public.users where id = p_requested_by) then raise exception 'speaking_estimate_requester'; end if;
 if not private.validate_ielts_speaking_estimates(p_estimates) then raise exception 'speaking_estimate_invalid'; end if;
 insert into private.ielts_speaking_ai_estimates(session_id, requested_by, source_hash, version, estimates, provider)
 values (s.id, p_requested_by, private.ielts_speaking_source_hash(s.id), p_estimates->>'version', p_estimates, left(p_provider, 200))
 on conflict (session_id, source_hash, version) do nothing;
end $$;

create or replace function public.rpc_ielts_speaking_session_extras(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s private.ielts_speaking_sessions; teacher boolean; reviewed boolean; b private.ielts_speaking_part_bands; e private.ielts_speaking_ai_estimates; begin
 if not private.can_access_ielts_speaking(p_session_id) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id = p_session_id;
 teacher := private.can_review_ielts_speaking_student(s.student_id);
 reviewed := exists(select 1 from private.ielts_speaking_reviews where session_id = s.id);
 if not teacher and not reviewed then
  return jsonb_build_object('analysis', '[]'::jsonb, 'part_bands', null, 'can_set_bands', false, 'ai_estimates', null);
 end if;
 select * into b from private.ielts_speaking_part_bands where session_id = s.id order by created_at desc, id desc limit 1;
 if teacher then
  select * into e from private.ielts_speaking_ai_estimates where session_id = s.id and version = private.ielts_speaking_estimate_version()
   and source_hash = private.ielts_speaking_source_hash(s.id) order by created_at desc, id desc limit 1;
 end if;
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
  'can_set_bands', teacher and s.status = 'submitted',
  -- Section 10.10: AI estimates are for the reviewing teacher only.
  'ai_estimates', case when teacher and e.id is not null then e.estimates || jsonb_build_object('created_at', e.created_at) else null end);
end $$;

revoke all on function private.ielts_speaking_estimate_version() from public, anon, authenticated, service_role;
revoke all on function private.validate_ielts_speaking_estimates(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.rpc_ielts_save_speaking_ai_estimates(uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.rpc_ielts_speaking_session_extras(uuid) from public, anon, service_role;
grant execute on function public.rpc_ielts_save_speaking_ai_estimates(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.rpc_ielts_speaking_session_extras(uuid) to authenticated;
