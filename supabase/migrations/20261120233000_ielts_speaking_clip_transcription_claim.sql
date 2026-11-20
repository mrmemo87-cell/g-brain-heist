-- IELTS Speaking: one transcription per recording, even when both interview steps start together.
--
-- Opening a review starts the teacher's AI draft and the transcript analysis at the same moment, and both need the
-- same Scribe transcription. Before transcribing a recording, a step now claims it here. The step that gets the
-- claim transcribes and keeps the words (rpc_ielts_save_speaking_clip_transcript_words); the other waits, showing
-- the teacher that the recording is being transcribed, and then reuses those words. A claim older than three
-- minutes is treated as abandoned (a crashed step never blocks a recording), and a waiting step that gives up
-- transcribes the recording itself, so nothing ever waits forever.
create table if not exists private.ielts_speaking_clip_transcribing (
  clip_id uuid primary key references private.ielts_speaking_clips(id) on delete cascade,
  session_id uuid not null,
  claimed_at timestamptz not null default now()
);
alter table private.ielts_speaking_clip_transcribing enable row level security;
revoke all on table private.ielts_speaking_clip_transcribing from public,anon,authenticated;

-- 'done'    : the words are already kept; reuse them.
-- 'claimed' : the caller must transcribe now and then release.
-- 'busy'    : another step is transcribing; wait and ask again.
create or replace function public.rpc_ielts_claim_speaking_clip_transcription(p_session_id uuid, p_clip_id uuid)
returns text
language plpgsql security definer set search_path=''
as $function$
declare
  v_claimed uuid;
begin
  if not exists(select 1 from private.ielts_speaking_clips where id=p_clip_id and session_id=p_session_id) then
    raise exception 'speaking_clip_mismatch';
  end if;
  if exists(select 1 from private.ielts_speaking_clip_words where clip_id=p_clip_id and detail is not null) then
    return 'done';
  end if;
  insert into private.ielts_speaking_clip_transcribing as t(clip_id,session_id,claimed_at)
  values (p_clip_id,p_session_id,now())
  on conflict (clip_id) do update set claimed_at=now()
    where t.claimed_at < now() - interval '3 minutes'
  returning t.clip_id into v_claimed;
  return case when v_claimed is null then 'busy' else 'claimed' end;
end $function$;

create or replace function public.rpc_ielts_release_speaking_clip_transcription(p_session_id uuid, p_clip_id uuid)
returns void
language sql security definer set search_path=''
as $function$
  delete from private.ielts_speaking_clip_transcribing where clip_id=p_clip_id and session_id=p_session_id
$function$;

revoke all on function public.rpc_ielts_claim_speaking_clip_transcription(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rpc_ielts_claim_speaking_clip_transcription(uuid,uuid) to service_role;
revoke all on function public.rpc_ielts_release_speaking_clip_transcription(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rpc_ielts_release_speaking_clip_transcription(uuid,uuid) to service_role;
