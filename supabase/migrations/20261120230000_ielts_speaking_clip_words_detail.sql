-- IELTS Speaking: transcribe each interview recording once (Diagnostic Bible 2.5.1 section 10.7).
--
-- An interview was transcribed twice: when it is submitted (the teacher's AI draft) and when the teacher opens the
-- review (transcript, highlights and AI estimates). With ElevenLabs Scribe that doubled the cost for the same words.
-- The first transcription now keeps Scribe's full word detail here, and the second step rebuilds the transcript from
-- it instead of calling Scribe again. When the detail is missing or incomplete, the function transcribes as before.
--
-- detail = [[word, start_seconds, end_seconds, log_probability|null], ...] in spoken order. It is service-only:
-- the confidence values are never sent to browsers, never displayed and never scored. The public word times
-- (words column, read by rpc_ielts_speaking_clip_words) keep their [word, start_seconds] format.
alter table private.ielts_speaking_clip_words add column if not exists detail jsonb;

-- Written only by the speaking function with the service role, after it has verified the recording.
-- Insert-once like the word times: a recording is immutable, so its words do not change.
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
  insert into private.ielts_speaking_clip_words(clip_id,session_id,words,detail,model)
  values (p_clip_id,p_session_id,p_words,p_detail,left(coalesce(p_model,'unknown'),200))
  on conflict (clip_id) do nothing;
end $function$;

revoke all on function public.rpc_ielts_save_speaking_clip_transcript_words(uuid,uuid,jsonb,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.rpc_ielts_save_speaking_clip_transcript_words(uuid,uuid,jsonb,jsonb,text)
  to service_role;

-- Service-only read of the kept detail, so the review step can reuse the first transcription before any teacher
-- has seen the transcript. Never granted to browsers.
create or replace function public.rpc_ielts_speaking_clip_words_detail(p_session_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('clip_id',w.clip_id,'model',w.model,'detail',w.detail) order by w.clip_id),'[]'::jsonb)
  from private.ielts_speaking_clip_words w
  where w.session_id=p_session_id and w.detail is not null
$function$;

revoke all on function public.rpc_ielts_speaking_clip_words_detail(uuid) from public,anon,authenticated;
grant execute on function public.rpc_ielts_speaking_clip_words_detail(uuid) to service_role;
