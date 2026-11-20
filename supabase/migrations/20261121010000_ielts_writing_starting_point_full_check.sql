-- Diagnostic Bible 2.6.0 sections 10.9 and 10.11 (owner request 2026-11-21).
-- 1. Screener teacher draft prompt v4: a band range per criterion and a server-checked AI starting band, and up to 60
--    highlights (first pass, proofreading pass and deterministic checks) with notes up to 500 characters.
-- 2. Writing starting point: the teacher confirms or changes the AI starting band (or sets one without AI) after
--    sharing the review; the student then sees it with "Not an official IELTS result". Append-only history.

create or replace function public.rpc_ielts_claim_writing_ai_draft(p_attempt_id uuid, p_prompt_version text, p_model text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s private.ielts_writing_screener_submissions%rowtype; e private.ielts_diagnostic_attempt_evidence%rowtype;
 d private.ielts_writing_ai_drafts%rowtype; context jsonb;
begin
 if not private.can_review_ielts_writing_screener(p_attempt_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_prompt_version not in ('bh-ielts-task2-simple-feedback-v1', 'bh-ielts-task2-simple-feedback-v2', 'bh-ielts-task2-simple-feedback-v3', 'bh-ielts-task2-simple-feedback-v4') or length(coalesce(p_model,'')) not between 3 and 100
 then raise exception 'ai_configuration_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-writing-ai:'||auth.uid()::text,0));
 select * into s from private.ielts_writing_screener_submissions where attempt_id=p_attempt_id;
 select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id;
 if s.attempt_id is null or s.rubric_snapshot->>'version' is distinct from 'bh-ielts-task2-observations-v1'
   or e.form_snapshot#>>'{version,scoring_policy_version}' is distinct from 'ielts-writing-task2-snapshot-v1'
 then raise exception 'ai_task_not_supported'; end if;
 select * into d from private.ielts_writing_ai_drafts where attempt_id=p_attempt_id and requested_by=auth.uid()
   and response_sha256=s.response_sha256 and prompt_version=p_prompt_version and model=p_model and state='ready'
   order by created_at desc limit 1;
 if d.id is not null then return jsonb_build_object('claimed',false,'draft_id',d.id,'fields',d.fields,'response_sha256',d.response_sha256); end if;
 if exists(select 1 from private.ielts_writing_ai_drafts where requested_by=auth.uid() and attempt_id=p_attempt_id and state='pending' and created_at>now()-interval '90 seconds')
 then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_writing_ai_drafts where requested_by=auth.uid() and created_at>now()-interval '10 minutes')>=6
   or (select count(*) from private.ielts_writing_ai_drafts where requested_by=auth.uid() and created_at>now()-interval '1 day')>=40
 then raise exception 'ai_rate_limit'; end if;
 context:=jsonb_build_object('response_text',s.response_text,'response_state',s.response_state,'word_count',s.word_count,
   'prompt',e.form_snapshot#>>'{items,0,prompt}','rubric_snapshot',s.rubric_snapshot,
   'incident_count',(select count(*) from public.ielts_exam_incidents where attempt_id=p_attempt_id));
 insert into private.ielts_writing_ai_drafts(attempt_id,requested_by,response_sha256,prompt_version,model,source_context)
 values(p_attempt_id,auth.uid(),s.response_sha256,p_prompt_version,p_model,context) returning * into d;
 return jsonb_build_object('claimed',true,'draft_id',d.id,'context',context,'response_sha256',s.response_sha256);
end; $function$;

create or replace function public.rpc_ielts_finish_writing_ai_draft(p_draft_id uuid, p_fields jsonb, p_provider_response_id text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare d private.ielts_writing_ai_drafts%rowtype; k text; o jsonb; ev jsonb; txt text; nkeys int; v4 boolean; b jsonb; mids numeric[] := '{}'; mean numeric; band numeric; has_all boolean := true;
begin
 select * into d from private.ielts_writing_ai_drafts where id=p_draft_id for update;
 if d.id is null or d.state<>'pending' then raise exception 'ai_draft_not_pending'; end if;
 if p_fields is null then
   update private.ielts_writing_ai_drafts set state='failed',completed_at=now() where id=d.id; return;
 end if;
 txt:=d.source_context->>'response_text';
 v4:=d.prompt_version='bh-ielts-task2-simple-feedback-v4';
 nkeys:=(select count(*) from jsonb_object_keys(p_fields));
 if jsonb_typeof(p_fields) is distinct from 'object'
   or not ((not v4 and (nkeys=3 or (nkeys=4 and d.prompt_version in ('bh-ielts-task2-simple-feedback-v2','bh-ielts-task2-simple-feedback-v3') and jsonb_typeof(p_fields->'highlights')='array' and jsonb_array_length(p_fields->'highlights')<=16)))
     or (v4 and nkeys=6 and jsonb_typeof(p_fields->'highlights')='array' and jsonb_array_length(p_fields->'highlights')<=60
       and jsonb_typeof(p_fields->'criterion_bands')='object' and (select count(*) from jsonb_object_keys(p_fields->'criterion_bands'))=4
       and jsonb_typeof(p_fields->'estimate') in ('object','null')))
   or jsonb_typeof(p_fields->'next_step') is distinct from 'string' or length(trim(coalesce(p_fields->>'next_step',''))) not between 10 and 900
   or jsonb_typeof(p_fields->'delivery_comment') is distinct from 'string' or length(p_fields->>'delivery_comment')>900
   or ((d.source_context->>'incident_count')::int>0 and length(trim(p_fields->>'delivery_comment'))<10)
   or jsonb_typeof(p_fields->'observations') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_fields->'observations'))<>4
 then raise exception 'ai_draft_invalid'; end if;
 foreach k in array array['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'] loop
   o:=p_fields->'observations'->k;
   if jsonb_typeof(o) is distinct from 'object' or (select count(*) from jsonb_object_keys(o))<>3
     or coalesce(o->>'status','') not in ('observed','developing','insufficient_evidence')
     or jsonb_typeof(o->'comment') is distinct from 'string' or length(trim(coalesce(o->>'comment',''))) not between 20 and 900
     or jsonb_typeof(o->'evidence') is distinct from 'array' or jsonb_array_length(o->'evidence')>2
     or (o->>'status'<>'insufficient_evidence' and (jsonb_array_length(o->'evidence')=0 or d.source_context->>'response_state'<>'answered'))
   then raise exception 'ai_observation_invalid'; end if;
   if v4 then
     b:=p_fields->'criterion_bands'->k;
     if jsonb_typeof(b)='null' then
       if o->>'status'<>'insufficient_evidence' then raise exception 'ai_band_invalid'; end if;
       has_all:=false;
     elsif jsonb_typeof(b) is distinct from 'object' or (select count(*) from jsonb_object_keys(b))<>2
       or jsonb_typeof(b->'low') is distinct from 'number' or jsonb_typeof(b->'high') is distinct from 'number'
       or (b->>'low')::numeric not between 0 and 8 or (b->>'high')::numeric-(b->>'low')::numeric<>1 or ((b->>'low')::numeric*2)%1<>0
       or d.source_context->>'response_state'<>'answered'
     then raise exception 'ai_band_invalid';
     else mids:=mids||(((b->>'low')::numeric+(b->>'high')::numeric)/2); end if;
   end if;
   for ev in select value from jsonb_array_elements(o->'evidence') loop
     if jsonb_typeof(ev) is distinct from 'object' or (select count(*) from jsonb_object_keys(ev))<>3
       or jsonb_typeof(ev->'quote') is distinct from 'string'
       or coalesce(ev->>'start_char','') !~ '^[0-9]{1,6}$' or coalesce(ev->>'end_char','') !~ '^[0-9]{1,6}$'
       or length(coalesce(ev->>'quote','')) not between 1 and 600
       or (ev->>'end_char')::int<=(ev->>'start_char')::int or (ev->>'end_char')::int>length(txt)
       or substring(txt from (ev->>'start_char')::int+1 for (ev->>'end_char')::int-(ev->>'start_char')::int) is distinct from ev->>'quote'
     then raise exception 'ai_quote_invalid'; end if;
   end loop;
 end loop;
 for ev in select value from jsonb_array_elements(coalesce(p_fields->'highlights','[]'::jsonb)) loop
   if jsonb_typeof(ev) is distinct from 'object'
     or coalesce(ev->>'criterion','') not in ('task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy')
     or coalesce(ev->>'kind','') not in ('strength','fix')
     or jsonb_typeof(ev->'quote') is distinct from 'string' or length(coalesce(ev->>'quote','')) not between 1 and 260
     or jsonb_typeof(ev->'note') is distinct from 'string' or length(coalesce(ev->>'note','')) not between 3 and (case when v4 then 500 else 260 end)
     or (ev->'correction' is not null and jsonb_typeof(ev->'correction') not in ('string','null'))
     or coalesce(ev->>'start_char','') !~ '^[0-9]{1,6}$' or coalesce(ev->>'end_char','') !~ '^[0-9]{1,6}$'
     or (ev->>'end_char')::int<=(ev->>'start_char')::int or (ev->>'end_char')::int>length(txt)
     or substring(txt from (ev->>'start_char')::int+1 for (ev->>'end_char')::int-(ev->>'start_char')::int) is distinct from ev->>'quote'
   then raise exception 'ai_highlight_invalid'; end if;
 end loop;
 -- v4: the starting band must be exactly the server rule (mean of the range midpoints, nearest half band, halves up, +/- 0.5).
 if v4 then
   if has_all then
     mean:=(select avg(x) from unnest(mids) x); band:=least(9,greatest(0,floor(mean*2+0.5)/2));
     if jsonb_typeof(p_fields->'estimate') is distinct from 'object' or (p_fields#>>'{estimate,band}')::numeric is distinct from band
       or (p_fields#>>'{estimate,low}')::numeric is distinct from greatest(0,band-0.5) or (p_fields#>>'{estimate,high}')::numeric is distinct from least(9,band+0.5)
     then raise exception 'ai_estimate_invalid'; end if;
   elsif jsonb_typeof(p_fields->'estimate') is distinct from 'null' then raise exception 'ai_estimate_invalid'; end if;
 end if;
 update private.ielts_writing_ai_drafts set state='ready',fields=p_fields,provider_response_id=left(p_provider_response_id,200),completed_at=now() where id=d.id;
end; $function$;

revoke all on function public.rpc_ielts_claim_writing_ai_draft(uuid,text,text) from public, anon, service_role;
grant execute on function public.rpc_ielts_claim_writing_ai_draft(uuid,text,text) to authenticated;
revoke all on function public.rpc_ielts_finish_writing_ai_draft(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.rpc_ielts_finish_writing_ai_draft(uuid,jsonb,text) to service_role;

-- Writing starting point (section 10.11): one row per decision, newest wins; never edited or deleted.
create table if not exists private.ielts_writing_starting_points (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references private.ielts_writing_screener_submissions(attempt_id) on delete restrict,
 review_id uuid not null references private.ielts_writing_screener_reviews(id) on delete restrict,
 band numeric(2,1) not null check (band between 0 and 9 and band*2=floor(band*2)),
 ai_draft_id uuid references private.ielts_writing_ai_drafts(id) on delete restrict,
 ai_band numeric(2,1) check (ai_band is null or (ai_band between 0 and 9 and ai_band*2=floor(ai_band*2))),
 source text not null check (source in ('teacher_confirmed_ai','teacher_changed_ai','teacher_set')),
 policy_version text not null default 'bh-writing-starting-point-v1',
 set_by uuid not null references public.users(id) on delete restrict,
 set_at timestamptz not null default now()
);
alter table private.ielts_writing_starting_points enable row level security;
create index if not exists ielts_writing_starting_points_attempt on private.ielts_writing_starting_points(attempt_id, set_at desc);
create index if not exists ielts_writing_starting_points_review on private.ielts_writing_starting_points(review_id);
create index if not exists ielts_writing_starting_points_draft on private.ielts_writing_starting_points(ai_draft_id);
create index if not exists ielts_writing_starting_points_setter on private.ielts_writing_starting_points(set_by);
revoke all on private.ielts_writing_starting_points from public, anon, authenticated;

create or replace function public.rpc_ielts_set_writing_starting_point(p_attempt_id uuid, p_band numeric, p_ai_draft_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s private.ielts_writing_screener_submissions%rowtype; r private.ielts_writing_screener_reviews%rowtype;
 d private.ielts_writing_ai_drafts%rowtype; ai numeric; src text;
begin
 if auth.uid() is null or not private.can_review_ielts_writing_screener(p_attempt_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_writing_screener_submissions where attempt_id=p_attempt_id;
 if s.attempt_id is null or s.response_state<>'answered' then raise exception 'starting_point_not_available'; end if;
 select * into r from private.ielts_writing_screener_reviews where attempt_id=p_attempt_id order by run_version desc limit 1;
 if r.id is null then raise exception 'review_required'; end if;
 if p_band is null or p_band not between 1 and 9 or p_band*2<>floor(p_band*2) then raise exception 'band_invalid'; end if;
 if p_ai_draft_id is not null then
   select * into d from private.ielts_writing_ai_drafts where id=p_ai_draft_id and attempt_id=p_attempt_id and state='ready'
     and response_sha256=s.response_sha256 and prompt_version='bh-ielts-task2-simple-feedback-v4';
   if d.id is null or jsonb_typeof(d.fields->'estimate') is distinct from 'object' then raise exception 'ai_draft_invalid'; end if;
   ai:=(d.fields#>>'{estimate,band}')::numeric;
 end if;
 src:=case when ai is null then 'teacher_set' when ai=p_band then 'teacher_confirmed_ai' else 'teacher_changed_ai' end;
 insert into private.ielts_writing_starting_points(attempt_id,review_id,band,ai_draft_id,ai_band,source,set_by)
 values(p_attempt_id,r.id,p_band,d.id,ai,src,auth.uid());
 return public.rpc_ielts_writing_screener_result(p_attempt_id);
end; $function$;
revoke all on function public.rpc_ielts_set_writing_starting_point(uuid,numeric,uuid) from public, anon, service_role;
grant execute on function public.rpc_ielts_set_writing_starting_point(uuid,numeric,uuid) to authenticated;

create or replace function public.rpc_ielts_writing_screener_result(p_attempt_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare e private.ielts_diagnostic_attempt_evidence%rowtype; s private.ielts_writing_screener_submissions%rowtype; r private.ielts_writing_screener_reviews%rowtype; incidents int;
 sp private.ielts_writing_starting_points%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
 select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id;
 if e.attempt_id is null then return null; end if;
 if not exists(select 1 from public.users where id=auth.uid() and not coalesce(is_banned,false))
   or (e.student_id<>auth.uid() and not private.can_review_ielts_writing_screener(p_attempt_id)) then
   raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_writing_screener_submissions where attempt_id=p_attempt_id;
 if s.attempt_id is null then return null; end if;
 select * into r from private.ielts_writing_screener_reviews where attempt_id=p_attempt_id order by run_version desc limit 1;
 select count(*) into incidents from public.ielts_exam_incidents where attempt_id=p_attempt_id;
 -- Section 10.11: only a teacher-set starting band on a shared review is shown, to the student and the teacher.
 if r.id is not null then
   select * into sp from private.ielts_writing_starting_points where attempt_id=p_attempt_id order by set_at desc, id desc limit 1;
 end if;
 return jsonb_build_object('attempt_id',p_attempt_id,'student_id',e.student_id,'submitted_at',s.submitted_at,
   'prompt',e.form_snapshot#>>'{items,0,prompt}','response_text',s.response_text,'response_sha256',s.response_sha256,
   'response_state',s.response_state,'word_count',s.word_count,'evidence_kind',s.evidence_kind,
   'review_status',case when r.id is null then 'pending' else 'teacher_reviewed' end,'review_id',r.id,
   'criterion_observations',coalesce(r.criterion_observations,'{}'),'next_step',r.next_step,'delivery_comment',r.delivery_comment,
   'reviewed_at',r.reviewed_at,'confidence','low','incident_count',incidents,
   'practice_revision',(select jsonb_build_object('id',rev.id,'response_text',rev.response_text,'created_at',rev.created_at,'source_review_id',rev.source_review_id)
     from private.ielts_writing_screener_revisions rev where rev.attempt_id=p_attempt_id order by rev.created_at desc,rev.id limit 1),
   'starting_point',case when sp.id is null then null else jsonb_build_object('band',sp.band,'low',greatest(0,sp.band-0.5),'high',least(9,sp.band+0.5),
     'ai_band',sp.ai_band,'source',sp.source,'set_at',sp.set_at,'policy_version',sp.policy_version) end,
   'can_review',private.can_review_ielts_writing_screener(p_attempt_id),'readiness_available',false,'persistent_weakness_available',false);
end; $function$;
revoke all on function public.rpc_ielts_writing_screener_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_writing_screener_result(uuid) to authenticated;
