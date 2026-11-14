-- Diagnostic Bible 2.2.1 section 10.7: better Speaking analyses can replace older ones without losing history.
--
-- 1. Interview clip analyses become versioned: one row per (clip, analysis version). The latest row is shown; older
--    rows stay as history (still no updates or deletes). A speaker_turns column records which stretches of the
--    transcript the teacher spoke, so the transcript can show teacher and student speech differently.
-- 2. Practice feedback made before highlights existed can be upgraded by a school IELTS teacher. A failed upgrade
--    keeps the earlier feedback instead of erasing it.
-- 3. The review detail names the student and class.

-- 1. Versioned interview analyses ------------------------------------------------------------------------------------
alter table private.ielts_speaking_clip_analysis add column if not exists id uuid not null default gen_random_uuid();
alter table private.ielts_speaking_clip_analysis add column if not exists speaker_turns jsonb not null default '{}'::jsonb
  check (jsonb_typeof(speaker_turns) = 'object');
alter table private.ielts_speaking_clip_analysis drop constraint if exists ielts_speaking_clip_analysis_pkey;
alter table private.ielts_speaking_clip_analysis add constraint ielts_speaking_clip_analysis_pkey primary key (id);
create unique index if not exists ielts_speaking_clip_analysis_version on private.ielts_speaking_clip_analysis(clip_id, prompt_version);
alter table private.ielts_speaking_clip_analysis drop constraint if exists ielts_speaking_clip_analysis_highlights_check;
alter table private.ielts_speaking_clip_analysis add constraint ielts_speaking_clip_analysis_highlights_check
  check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 12);

create or replace function private.ielts_speaking_analysis_version() returns text language sql immutable set search_path = '' as $$
  select 'bh-ielts-speaking-interview-analysis-v2'::text $$;

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
     'created_at', b.created_at, 'teacher_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = b.reviewer_id)) end,
  'can_set_bands', teacher and s.status = 'submitted' and reviewed);
end $$;

drop function if exists public.rpc_ielts_save_speaking_clip_analysis(uuid,uuid,text,jsonb,jsonb,text,text);
create or replace function public.rpc_ielts_save_speaking_clip_analysis(p_session_id uuid, p_clip_id uuid, p_transcript text,
 p_highlights jsonb, p_pronunciation jsonb, p_prompt_version text, p_provider text, p_speaker_turns jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.ielts_speaking_clips where id = p_clip_id and session_id = p_session_id) then raise exception 'speaking_clip_mismatch'; end if;
 insert into private.ielts_speaking_clip_analysis(clip_id, session_id, transcript, highlights, pronunciation, prompt_version, provider, speaker_turns)
 values (p_clip_id, p_session_id, coalesce(p_transcript, ''), coalesce(p_highlights, '[]'::jsonb), coalesce(p_pronunciation, '{}'::jsonb),
  left(coalesce(p_prompt_version, 'unknown'), 200), left(p_provider, 200), coalesce(p_speaker_turns, '{}'::jsonb))
 on conflict (clip_id, prompt_version) do nothing;
end $$;
revoke all on function public.rpc_ielts_save_speaking_clip_analysis(uuid,uuid,text,jsonb,jsonb,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ielts_save_speaking_clip_analysis(uuid,uuid,text,jsonb,jsonb,text,text,jsonb) to service_role;
revoke all on function private.ielts_speaking_analysis_version() from public, anon, authenticated;

revoke all on function public.rpc_ielts_speaking_session_extras(uuid) from public, anon, service_role;
grant execute on function public.rpc_ielts_speaking_session_extras(uuid) to authenticated;
