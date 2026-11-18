-- IELTS Speaking: word times for saved interview recordings (Visual & UX Bible 1.14.0, section 13.9).
--
-- The interview review shows the word being spoken while a recording plays and lets the reader start playback
-- from any word. That needs the time of each word, which speech-to-text returns with the transcription the
-- teacher draft already makes. The words kept here are used only to place times on the transcript that is
-- already shown: they are never displayed as text, never scored and never evidence (Diagnostic Bible 10.7:
-- the transcript carries no score). One row per recording; a recording is immutable, so its times do not change.
create table if not exists private.ielts_speaking_clip_words (
  clip_id uuid primary key references private.ielts_speaking_clips(id) on delete cascade,
  session_id uuid not null,
  -- [[word, start_seconds], ...] in spoken order.
  words jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index if not exists ielts_speaking_clip_words_session_idx
  on private.ielts_speaking_clip_words(session_id);
alter table private.ielts_speaking_clip_words enable row level security;
revoke all on table private.ielts_speaking_clip_words from public,anon,authenticated;

-- Written only by the speaking function with the service role, after it has verified the recording.
create or replace function public.rpc_ielts_save_speaking_clip_words(
  p_session_id uuid,
  p_clip_id uuid,
  p_words jsonb,
  p_model text
)
returns void
language plpgsql security definer set search_path=''
as $function$
begin
  if not exists(select 1 from private.ielts_speaking_clips where id=p_clip_id and session_id=p_session_id) then
    raise exception 'speaking_clip_mismatch';
  end if;
  if jsonb_typeof(p_words)<>'array' or jsonb_array_length(p_words)=0 or jsonb_array_length(p_words)>8000 then
    raise exception 'speaking_clip_words_invalid';
  end if;
  insert into private.ielts_speaking_clip_words(clip_id,session_id,words,model)
  values (p_clip_id,p_session_id,p_words,left(coalesce(p_model,'unknown'),200))
  on conflict (clip_id) do nothing;
end $function$;

revoke all on function public.rpc_ielts_save_speaking_clip_words(uuid,uuid,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.rpc_ielts_save_speaking_clip_words(uuid,uuid,jsonb,text)
  to service_role;

-- Read access follows the transcripts exactly: word times are returned only for recordings whose transcript the
-- caller may already see (the reviewing teacher, or the student once feedback has been shared).
create or replace function public.rpc_ielts_speaking_clip_words(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_visible uuid[];
begin
  select coalesce(array_agg((a->>'clip_id')::uuid),'{}'::uuid[]) into v_visible
  from jsonb_array_elements(public.rpc_ielts_speaking_session_extras(p_session_id)->'analysis') a;

  return coalesce((
    select jsonb_agg(jsonb_build_object('clip_id',w.clip_id,'words',w.words) order by w.clip_id)
    from private.ielts_speaking_clip_words w
    where w.session_id=p_session_id and w.clip_id=any(v_visible)
  ),'[]'::jsonb);
end $function$;

revoke all on function public.rpc_ielts_speaking_clip_words(uuid)
  from public,anon;
grant execute on function public.rpc_ielts_speaking_clip_words(uuid)
  to authenticated;
