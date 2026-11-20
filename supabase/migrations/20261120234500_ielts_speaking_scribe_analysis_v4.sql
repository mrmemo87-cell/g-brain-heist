-- IELTS Speaking: Scribe transcripts for interviews not yet shared (Diagnostic Bible 2.5.1 sections 10.7, 10.10).
--
-- Interview transcripts now come from ElevenLabs Scribe, which keeps the student's real mistakes. Interviews analysed
-- earlier hold OpenAI transcripts that sometimes corrected the student's English, and the teacher-only AI estimates
-- were made from those transcripts. Both are append-only, so they are superseded by new versions, never edited:
--   analysis bh-ielts-speaking-interview-analysis-v4 (Scribe) and estimate bh-ielts-speaking-estimate-v2.
-- Owner decision (2026-11-20): only interviews NOT yet shared with the student are re-analysed, when a teacher opens
-- them. A shared interview keeps exactly the transcript, highlights and AI estimates its teacher reviewed and the
-- student received. Every earlier version stays as history.
create or replace function private.ielts_speaking_analysis_version() returns text language sql immutable set search_path = '' as $$
  select 'bh-ielts-speaking-interview-analysis-v4'::text $$;
create or replace function private.ielts_speaking_estimate_version() returns text language sql immutable set search_path = '' as $$
  select 'bh-ielts-speaking-estimate-v2'::text $$;
revoke all on function private.ielts_speaking_analysis_version() from public, anon, authenticated;
revoke all on function private.ielts_speaking_estimate_version() from public, anon, authenticated, service_role;

-- Same as the live definition (20261114150000), with two changes:
--   missing_clips: a shared interview counts only recordings with no analysis at all, so it is never re-run;
--   ai_estimates: a shared interview falls back to its latest estimate for the same recordings, of any version.
create or replace function public.rpc_ielts_speaking_session_extras(p_session_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
  if e.id is null and reviewed then
   select * into e from private.ielts_speaking_ai_estimates where session_id = s.id
    and source_hash = private.ielts_speaking_source_hash(s.id) order by created_at desc, id desc limit 1;
  end if;
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
       and (reviewed or a.prompt_version = private.ielts_speaking_analysis_version()))) else 0 end,
  'part_bands', case when b.id is null then null else jsonb_build_object('part_1', b.part_1, 'part_2', b.part_2, 'part_3', b.part_3,
     'fluency_coherence', b.fluency_coherence, 'lexical_resource', b.lexical_resource,
     'grammar_range_accuracy', b.grammar_range_accuracy, 'pronunciation', b.pronunciation, 'overall', b.overall,
     'created_at', b.created_at, 'teacher_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = b.reviewer_id)) end,
  'can_set_bands', teacher and s.status = 'submitted',
  -- Section 10.9: AI estimates are for the reviewing teacher only.
  'ai_estimates', case when teacher and e.id is not null then e.estimates || jsonb_build_object('created_at', e.created_at) else null end);
end $function$;

revoke all on function public.rpc_ielts_speaking_session_extras(uuid) from public, anon, service_role;
grant execute on function public.rpc_ielts_speaking_session_extras(uuid) to authenticated;
