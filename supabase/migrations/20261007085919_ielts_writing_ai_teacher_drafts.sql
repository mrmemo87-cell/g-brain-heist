-- Bible v1.2.0: AI drafts are private suggestions, never scores or published reviews.
set lock_timeout='5s';
create table private.ielts_writing_ai_drafts (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references private.ielts_writing_screener_submissions(attempt_id) on delete restrict,
 requested_by uuid not null references public.users(id) on delete restrict,
 response_sha256 text not null,
 prompt_version text not null,
 model text not null,
 source_context jsonb not null,
 state text not null default 'pending' check(state in ('pending','ready','failed')),
 fields jsonb,
 provider_response_id text,
 created_at timestamptz not null default now(), completed_at timestamptz,
 check ((state='ready')=(fields is not null))
);
alter table private.ielts_writing_ai_drafts enable row level security;
revoke all on private.ielts_writing_ai_drafts from public,anon,authenticated,service_role;
create index ielts_writing_ai_request_time on private.ielts_writing_ai_drafts(requested_by,created_at desc);
create index ielts_writing_ai_source on private.ielts_writing_ai_drafts(attempt_id,requested_by,prompt_version,model);
create function private.guard_ielts_writing_ai_draft() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' or old.state<>'pending' then raise exception 'ai_draft_history_immutable'; end if;
 if (to_jsonb(new)-array['state','fields','provider_response_id','completed_at']) is distinct from
    (to_jsonb(old)-array['state','fields','provider_response_id','completed_at']) or new.state='pending' or new.completed_at is null
 then raise exception 'ai_draft_identity_immutable'; end if;
 return new;
end; $$;
revoke all on function private.guard_ielts_writing_ai_draft() from public,anon,authenticated,service_role;
create trigger guard_ielts_writing_ai_draft before update or delete on private.ielts_writing_ai_drafts for each row execute function private.guard_ielts_writing_ai_draft();

-- Caller JWT supplies identity and existing canonical teacher scope. No browser essay/context accepted.
create function public.rpc_ielts_claim_writing_ai_draft(p_attempt_id uuid,p_prompt_version text,p_model text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.ielts_writing_screener_submissions%rowtype; e private.ielts_diagnostic_attempt_evidence%rowtype;
 d private.ielts_writing_ai_drafts%rowtype; context jsonb;
begin
 if not private.can_review_ielts_writing_screener(p_attempt_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_prompt_version is distinct from 'bh-ielts-task2-simple-feedback-v1' or length(coalesce(p_model,'')) not between 3 and 100
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
end; $$;
revoke all on function public.rpc_ielts_claim_writing_ai_draft(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_claim_writing_ai_draft(uuid,text,text) to authenticated;

-- Only the trusted Edge Function may complete a draft. Independently validate every quote.
create function public.rpc_ielts_finish_writing_ai_draft(p_draft_id uuid,p_fields jsonb,p_provider_response_id text) returns void
language plpgsql security definer set search_path='' as $$
declare d private.ielts_writing_ai_drafts%rowtype; k text; o jsonb; ev jsonb; txt text;
begin
 select * into d from private.ielts_writing_ai_drafts where id=p_draft_id for update;
 if d.id is null or d.state<>'pending' then raise exception 'ai_draft_not_pending'; end if;
 if p_fields is null then
   update private.ielts_writing_ai_drafts set state='failed',completed_at=now() where id=d.id; return;
 end if;
 txt:=d.source_context->>'response_text';
 if jsonb_typeof(p_fields) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_fields))<>3
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
 update private.ielts_writing_ai_drafts set state='ready',fields=p_fields,provider_response_id=left(p_provider_response_id,200),completed_at=now() where id=d.id;
end; $$;
revoke all on function public.rpc_ielts_finish_writing_ai_draft(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_finish_writing_ai_draft(uuid,jsonb,text) to service_role;

create table private.ielts_writing_ai_review_links (
 review_id uuid primary key references private.ielts_writing_screener_reviews(id) on delete restrict,
 draft_id uuid not null references private.ielts_writing_ai_drafts(id) on delete restrict,
 confirmed_by uuid not null references public.users(id) on delete restrict,
 confirmed_at timestamptz not null default now()
);
alter table private.ielts_writing_ai_review_links enable row level security;
revoke all on private.ielts_writing_ai_review_links from public,anon,authenticated,service_role;
create index ielts_writing_ai_link_draft on private.ielts_writing_ai_review_links(draft_id);
create index ielts_writing_ai_link_reviewer on private.ielts_writing_ai_review_links(confirmed_by);
create trigger immutable_ielts_writing_ai_review_links before update or delete on private.ielts_writing_ai_review_links for each row execute function private.ielts_diagnostic_immutable();
create function public.rpc_ielts_submit_ai_assisted_writing_review(p_attempt_id uuid,p_review_id uuid,p_expected_review_id uuid,
 p_response_sha256 text,p_criterion_observations jsonb,p_next_step text,p_delivery_comment text,p_ai_draft_id uuid,p_teacher_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare value jsonb; prior uuid;
begin
 if not private.can_review_ielts_writing_screener(p_attempt_id) or p_teacher_confirmed is distinct from true
   or not exists(select 1 from private.ielts_writing_ai_drafts where id=p_ai_draft_id and attempt_id=p_attempt_id
     and requested_by=auth.uid() and response_sha256=p_response_sha256 and state='ready')
 then raise exception using errcode='42501',message='ai_teacher_confirmation_required'; end if;
 value:=public.rpc_ielts_submit_writing_screener_review(p_attempt_id,p_review_id,p_expected_review_id,p_response_sha256,p_criterion_observations,p_next_step,p_delivery_comment);
 select draft_id into prior from private.ielts_writing_ai_review_links where review_id=p_review_id;
 if prior is not null and prior<>p_ai_draft_id then raise exception 'ai_review_idempotency_conflict'; end if;
 insert into private.ielts_writing_ai_review_links(review_id,draft_id,confirmed_by) values(p_review_id,p_ai_draft_id,auth.uid()) on conflict(review_id) do nothing;
 return value;
end; $$;
revoke all on function public.rpc_ielts_submit_ai_assisted_writing_review(uuid,uuid,uuid,text,jsonb,text,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_submit_ai_assisted_writing_review(uuid,uuid,uuid,text,jsonb,text,text,uuid,boolean) to authenticated;
