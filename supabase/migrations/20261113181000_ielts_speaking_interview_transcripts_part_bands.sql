-- Diagnostic Bible 2.2.0 section 10.7: Speaking interview transcripts, colour highlights, pronunciation words and
-- teacher Part 1-3 bands.
--
-- 1. private.ielts_speaking_clip_analysis: one row per saved interview clip, written once by the ielts_speaking_pilot
--    edge function (service role). Transcript from speech-to-text, highlights (criterion-tagged phrases copied from
--    the transcript), and pronunciation words heard by an audio model, with dictionary IPA. Practice feedback only:
--    never evidence, never a band, never in the learning record.
-- 2. private.ielts_speaking_part_bands: append-only teacher bands for Part 1, Part 2 and Part 3 of one sitting. Only
--    an authorized reviewer can record them, only after feedback has been shared. The latest row is current; history
--    is kept. These are teacher judgments for each part; nothing averages them into an overall Speaking band.
-- 3. Students read both only after their teacher has shared a review.

create table if not exists private.ielts_speaking_clip_analysis (
 clip_id uuid primary key references private.ielts_speaking_clips(id),
 session_id uuid not null references private.ielts_speaking_sessions(id),
 transcript text not null check (length(transcript) <= 20000),
 highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 12),
 pronunciation jsonb not null check (jsonb_typeof(pronunciation) = 'object'),
 prompt_version text not null check (length(prompt_version) between 3 and 200),
 provider text check (length(provider) <= 200),
 created_at timestamptz not null default now()
);
alter table private.ielts_speaking_clip_analysis enable row level security;
revoke all on private.ielts_speaking_clip_analysis from public, anon, authenticated, service_role;
create index if not exists ielts_speaking_clip_analysis_session on private.ielts_speaking_clip_analysis(session_id);

create table if not exists private.ielts_speaking_part_bands (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references private.ielts_speaking_sessions(id),
 reviewer_id uuid not null references public.users(id),
 part_1 numeric not null check (part_1 between 0 and 9 and part_1 * 2 = floor(part_1 * 2)),
 part_2 numeric not null check (part_2 between 0 and 9 and part_2 * 2 = floor(part_2 * 2)),
 part_3 numeric not null check (part_3 between 0 and 9 and part_3 * 2 = floor(part_3 * 2)),
 created_at timestamptz not null default now()
);
alter table private.ielts_speaking_part_bands enable row level security;
revoke all on private.ielts_speaking_part_bands from public, anon, authenticated, service_role;
create index if not exists ielts_speaking_part_bands_session on private.ielts_speaking_part_bands(session_id, created_at desc);

-- Both tables are history: no updates or deletes.
create or replace function private.guard_ielts_speaking_extras_history() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'speaking_history_immutable'; end; $$;
drop trigger if exists speaking_clip_analysis_history on private.ielts_speaking_clip_analysis;
create trigger speaking_clip_analysis_history before update or delete on private.ielts_speaking_clip_analysis
 for each row execute function private.guard_ielts_speaking_extras_history();
drop trigger if exists speaking_part_bands_history on private.ielts_speaking_part_bands;
create trigger speaking_part_bands_history before update or delete on private.ielts_speaking_part_bands
 for each row execute function private.guard_ielts_speaking_extras_history();

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
     'highlights', a.highlights, 'pronunciation', a.pronunciation, 'created_at', a.created_at) order by c.part, c.created_at, c.id)
   from private.ielts_speaking_clip_analysis a join private.ielts_speaking_clips c on c.id = a.clip_id where a.session_id = s.id), '[]'::jsonb),
  'missing_clips', case when teacher then (select count(*) from private.ielts_speaking_clips c where c.session_id = s.id
     and not exists(select 1 from private.ielts_speaking_clip_analysis a where a.clip_id = c.id)) else 0 end,
  'part_bands', case when b.id is null then null else jsonb_build_object('part_1', b.part_1, 'part_2', b.part_2, 'part_3', b.part_3,
     'created_at', b.created_at, 'teacher_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = b.reviewer_id)) end,
  'can_set_bands', teacher and s.status = 'submitted' and reviewed);
end $$;

create or replace function public.rpc_ielts_set_speaking_part_bands(p_session_id uuid, p_part_1 numeric, p_part_2 numeric, p_part_3 numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s private.ielts_speaking_sessions; begin
 if not private.can_access_ielts_speaking(p_session_id) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id = p_session_id for update;
 if not private.can_review_ielts_speaking_student(s.student_id) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
 if s.status <> 'submitted' or not exists(select 1 from private.ielts_speaking_reviews where session_id = s.id) then raise exception 'speaking_review_required'; end if;
 if p_part_1 is null or p_part_2 is null or p_part_3 is null then raise exception 'speaking_part_bands_required'; end if;
 insert into private.ielts_speaking_part_bands(session_id, reviewer_id, part_1, part_2, part_3) values (s.id, auth.uid(), p_part_1, p_part_2, p_part_3);
 return public.rpc_ielts_speaking_session_extras(s.id);
end $$;

create or replace function public.rpc_ielts_save_speaking_clip_analysis(p_session_id uuid, p_clip_id uuid, p_transcript text,
 p_highlights jsonb, p_pronunciation jsonb, p_prompt_version text, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.ielts_speaking_clips where id = p_clip_id and session_id = p_session_id) then raise exception 'speaking_clip_mismatch'; end if;
 insert into private.ielts_speaking_clip_analysis(clip_id, session_id, transcript, highlights, pronunciation, prompt_version, provider)
 values (p_clip_id, p_session_id, coalesce(p_transcript, ''), coalesce(p_highlights, '[]'::jsonb), coalesce(p_pronunciation, '{}'::jsonb),
  left(coalesce(p_prompt_version, 'unknown'), 200), left(p_provider, 200))
 on conflict (clip_id) do nothing;
end $$;

revoke all on function private.guard_ielts_speaking_extras_history() from public, anon, authenticated, service_role;
revoke all on function public.rpc_ielts_speaking_session_extras(uuid) from public, anon, service_role;
revoke all on function public.rpc_ielts_set_speaking_part_bands(uuid,numeric,numeric,numeric) from public, anon, service_role;
revoke all on function public.rpc_ielts_save_speaking_clip_analysis(uuid,uuid,text,jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.rpc_ielts_speaking_session_extras(uuid) to authenticated;
grant execute on function public.rpc_ielts_set_speaking_part_bands(uuid,numeric,numeric,numeric) to authenticated;
grant execute on function public.rpc_ielts_save_speaking_clip_analysis(uuid,uuid,text,jsonb,jsonb,text,text) to service_role;
