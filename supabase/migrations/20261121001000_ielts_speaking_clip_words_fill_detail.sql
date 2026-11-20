-- IELTS Speaking: keep Scribe's words for recordings that already had word times (fix for 20261120230000).
--
-- Recordings transcribed before Scribe already have a word-times row (whisper-1) without detail. The insert-once
-- save ignored Scribe's words for them, so neither interview step could reuse the other's transcription and both
-- transcribed every recording again (seen on 2026-11-21 when an older interview was re-analysed).
-- Now a row without detail is completed once with Scribe's words, times and confidences. A row that already has
-- detail is never changed. The public word times are replaced in the same step, so they match the transcript shown.
create or replace function public.rpc_ielts_save_speaking_clip_transcript_words(
  p_session_id uuid,
  p_clip_id uuid,
  p_words jsonb,
  p_detail jsonb,
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
  if jsonb_typeof(p_detail)<>'array' or jsonb_array_length(p_detail)<>jsonb_array_length(p_words) then
    raise exception 'speaking_clip_words_invalid';
  end if;
  insert into private.ielts_speaking_clip_words as w(clip_id,session_id,words,detail,model)
  values (p_clip_id,p_session_id,p_words,p_detail,left(coalesce(p_model,'unknown'),200))
  on conflict (clip_id) do update set words=excluded.words, detail=excluded.detail, model=excluded.model, created_at=now()
    where w.detail is null;
end $function$;

revoke all on function public.rpc_ielts_save_speaking_clip_transcript_words(uuid,uuid,jsonb,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.rpc_ielts_save_speaking_clip_transcript_words(uuid,uuid,jsonb,jsonb,text)
  to service_role;
