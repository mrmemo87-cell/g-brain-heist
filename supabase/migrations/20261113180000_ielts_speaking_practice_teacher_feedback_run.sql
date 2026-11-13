-- Diagnostic Bible 2.2.0 section 10.7: every Speaking practice recording a teacher reviews must have a transcript.
-- A school IELTS teacher can now run the same practice feedback (transcript, coloured highlights, pronunciation
-- words) for a student's attempt the student never sent for feedback. The teacher's browser converts the
-- student's recording to 16 kHz mono WAV and stores it in the TEACHER's own folder; the edge function reads it
-- from there. Same authorization as confirming feedback; one feedback row per attempt; 60 teacher runs per day.
-- Feedback stays practice feedback: never evidence, never a band, never in the learning record.

alter table private.ielts_practice_speaking_feedback add column if not exists requested_by uuid references auth.users(id);
create index if not exists ielts_practice_speaking_feedback_requested_by
  on private.ielts_practice_speaking_feedback(requested_by, created_at) where requested_by is not null;

create or replace function public.rpc_ielts_practice_speaking_feedback_claim_review(p_attempt uuid, p_model text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare a public.ielts_speaking_attempts; t public.ielts_speaking_tasks; f private.ielts_practice_speaking_feedback; st public.users;
begin
 select * into a from public.ielts_speaking_attempts where id = p_attempt;
 if a.id is null or auth.uid() is null or a.user_id = auth.uid() then raise exception 'not_available'; end if;
 select * into st from public.users where id = a.user_id;
 if st.id is null or not public.can_manage_ielts_practice_school(st.school_id) then raise exception 'not_authorized'; end if;
 select * into t from public.ielts_speaking_tasks where id = a.task_id;
 if t.id is null then raise exception 'not_available'; end if;
 if coalesce(a.duration_seconds, a.duration, 0) < 15 then raise exception 'too_short'; end if;
 select * into f from private.ielts_practice_speaking_feedback where attempt_id = a.id for update;
 if f.status = 'ready' then return jsonb_build_object('id', f.id, 'ready', true, 'feedback', private.ielts_practice_speaking_feedback_json(f)); end if;
 if f.status = 'working' and f.updated_at > now() - interval '2 minutes' then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_practice_speaking_feedback where requested_by = auth.uid() and created_at > now() - interval '1 day') >= 60 and f.id is null
 then raise exception 'ai_rate_limit'; end if;
 if f.id is null then
  insert into private.ielts_practice_speaking_feedback(attempt_id, student_id, model, requested_by)
  values (a.id, a.user_id, left(coalesce(p_model,''),80), auth.uid()) returning * into f;
 else
  update private.ielts_practice_speaking_feedback set status = 'working', model = left(coalesce(p_model,''),80), updated_at = now()
  where id = f.id returning * into f;
 end if;
 return jsonb_build_object('id', f.id, 'ready', false, 'context', jsonb_build_object(
   'part', t.part, 'prompt', t.prompt, 'follow_ups', coalesce(t.follow_ups, '{}'::jsonb),
   'audio_path', 'speaking/' || auth.uid()::text || '/feedback/' || a.id::text || '.wav'));
end $$;

revoke all on function public.rpc_ielts_practice_speaking_feedback_claim_review(uuid,text) from public, anon, service_role;
grant execute on function public.rpc_ielts_practice_speaking_feedback_claim_review(uuid,text) to authenticated;
