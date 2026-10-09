-- Bible 1.6.0: teacher-only evidence and editable AI drafts. No scoring/content release changes.
create function public.rpc_ielts_learning_review_context(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; t private.ielts_learning_tasks%rowtype;
 e private.ielts_diagnostic_attempt_evidence%rowtype; r private.ielts_diagnostic_scoring_runs%rowtype; source jsonb;
begin
 if not private.can_access_ielts_learning(p_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id;
 select * into t from private.ielts_learning_tasks where code=a.task_code;
 if t.skill in ('listening','reading') then
  select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=a.source_attempt_id and student_id=a.student_id and school_id=a.school_id;
  if e.attempt_id is not null and exists(select 1 from public.ielts_exam_attempts where id=e.attempt_id and status='submitted') then
   select * into r from private.ielts_diagnostic_scoring_runs where attempt_id=e.attempt_id and server_verified order by run_version desc limit 1;
   if r.id is not null then
    select jsonb_build_object('score',r.raw_score,'total',r.marks_possible,'confidence','low','integrity_state',r.integrity_state,
     'items',coalesce((select jsonb_agg(jsonb_build_object('id',i->>'item_key','prompt',i->>'prompt','skill',i->>'skill',
      'construct',i#>>'{taxonomy,name}','response',s.payload#>>array[i->>'skill',i->>'item_key'],
      'accepted_answers',i->'accepted_answers','correct',o->>'marks_awarded'='1','response_state',o->>'response_state') order by (i->>'order_index')::int)
      from jsonb_array_elements(e.form_snapshot->'items') i
      left join lateral (select x as o from jsonb_array_elements(r.outcomes) x where x->>'item_key'=i->>'item_key' and x->>'skill'=i->>'skill') outcomes on true),'[]'))
    into source from public.ielts_exam_submissions s where s.id=r.submission_id and s.student_id=a.student_id;
   end if;
  end if;
 end if;
 return jsonb_build_object('school_id',a.school_id,'student_name',(select username from public.users where id=a.student_id),
  'questions',t.questions,'teacher_notes',t.content->>'teacher_notes','source',source);
end; $$;
revoke all on function public.rpc_ielts_learning_review_context(uuid) from public,anon,service_role;
grant execute on function public.rpc_ielts_learning_review_context(uuid) to authenticated;

create table private.ielts_learning_ai_drafts (
 id uuid primary key default gen_random_uuid(), allocation_id uuid not null references private.ielts_learning_submissions(allocation_id),
 reviewer_id uuid not null references public.users(id), prompt_version text not null, model text not null,
 context jsonb not null, state text not null default 'working' check(state in ('working','ready','failed')),
 fields jsonb, provider_response_id text, created_at timestamptz not null default now(), finished_at timestamptz
);
create index ielts_learning_ai_reviewer_rate on private.ielts_learning_ai_drafts(reviewer_id,created_at desc);
create index ielts_learning_ai_allocation on private.ielts_learning_ai_drafts(allocation_id,reviewer_id,created_at desc);
alter table private.ielts_learning_ai_drafts enable row level security;
revoke all on private.ielts_learning_ai_drafts from public,anon,authenticated,service_role;
create table private.ielts_learning_ai_review_links (
 review_id uuid primary key references private.ielts_learning_reviews(id), draft_id uuid not null references private.ielts_learning_ai_drafts(id)
);
create index ielts_learning_ai_review_draft on private.ielts_learning_ai_review_links(draft_id);
alter table private.ielts_learning_ai_review_links enable row level security;
revoke all on private.ielts_learning_ai_review_links from public,anon,authenticated,service_role;
create trigger ielts_learning_ai_links_immutable before update or delete on private.ielts_learning_ai_review_links for each row execute function private.ielts_learning_immutable();

create function public.rpc_ielts_claim_learning_ai(p_id uuid,p_model text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; c jsonb; prior private.ielts_learning_ai_drafts%rowtype; draft_id uuid;
begin
 c:=public.rpc_ielts_learning_review_context(p_id); d:=public.rpc_ielts_learning_detail(p_id);
 if d->'result'='null'::jsonb or d->>'status'<>'submitted' or d->>'skill' not in ('listening','reading') then raise exception 'submitted_objective_task_required'; end if;
 if length(coalesce(p_model,'')) not between 1 and 100 then raise exception 'invalid_model'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,317));
 select * into prior from private.ielts_learning_ai_drafts where allocation_id=p_id and reviewer_id=auth.uid() and prompt_version='bh-targeted-objective-feedback-v1' and model=p_model order by created_at desc limit 1;
 if prior.state='ready' then return jsonb_build_object('id',prior.id,'fields',prior.fields); end if;
 if prior.state='working' and prior.created_at>now()-interval '2 minutes' then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_learning_ai_drafts where reviewer_id=auth.uid() and created_at>now()-interval '1 hour')>=6 then raise exception 'ai_rate_limit'; end if;
 -- Snapshot authoritative work and key, without student names, identifiers or original screener answers.
 c:=jsonb_build_object('skill',d->'skill','title',d->'title','instructions',d->'instructions','goal',d->'success_description',
  'purpose',d->'purpose','content',d->'content','answers',d->'answers','result',d->'result','questions',c->'questions',
  'conditions_need_review',d->'conditions_need_review','play_count',d->'play_count');
 insert into private.ielts_learning_ai_drafts(allocation_id,reviewer_id,prompt_version,model,context)
 values(p_id,auth.uid(),'bh-targeted-objective-feedback-v1',p_model,c) returning id into draft_id;
 return jsonb_build_object('id',draft_id,'context',c);
end; $$;
revoke all on function public.rpc_ielts_claim_learning_ai(uuid,text) from public,anon,service_role;
grant execute on function public.rpc_ielts_claim_learning_ai(uuid,text) to authenticated;

create function public.rpc_ielts_finish_learning_ai(p_id uuid,p_fields jsonb,p_provider text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.ielts_learning_ai_drafts set state=case when p_fields is null then 'failed' else 'ready' end,
 fields=p_fields,provider_response_id=p_provider,finished_at=now() where id=p_id and state='working';
end; $$;
revoke all on function public.rpc_ielts_finish_learning_ai(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.rpc_ielts_finish_learning_ai(uuid,jsonb,text) to service_role;

create function public.rpc_ielts_learning_review_with_draft(p_id uuid,p_feedback jsonb,p_request uuid,p_draft uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; v_review uuid;
begin
 if not private.can_access_ielts_learning(p_id,true) or not exists(select 1 from private.ielts_learning_ai_drafts where id=p_draft and allocation_id=p_id and reviewer_id=auth.uid() and state='ready') then raise exception using errcode='42501',message='not_authorized'; end if;
 result:=public.rpc_ielts_learning_review(p_id,p_feedback,p_request);
 select id into v_review from private.ielts_learning_reviews where request_id=p_request;
 if exists(select 1 from private.ielts_learning_ai_review_links where ielts_learning_ai_review_links.review_id=v_review and draft_id<>p_draft) then raise exception 'request_conflict'; end if;
 insert into private.ielts_learning_ai_review_links values(v_review,p_draft) on conflict do nothing;
 return result;
end; $$;
revoke all on function public.rpc_ielts_learning_review_with_draft(uuid,jsonb,uuid,uuid) from public,anon,service_role;
grant execute on function public.rpc_ielts_learning_review_with_draft(uuid,jsonb,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
