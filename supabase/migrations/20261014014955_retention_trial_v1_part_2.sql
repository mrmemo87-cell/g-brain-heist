create function public.rpc_retention_trial_start(p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users;r private.retention_trial_runs;prev private.retention_trial_runs;focus uuid;focus_label text;grade_no integer;diff text;subj text;qs jsonb;
begin
 if auth.uid() is null or not private.retention_trial_allowed(auth.uid()) then raise exception 'TRIAL_PAUSED';end if;
 select * into u from public.users where id=auth.uid();
 if u.role<>'student' or p_kind is null or p_kind not in('drop','rescue','comeback') then raise exception 'NOT_AUTHORIZED';end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id::text,706));
 select * into r from private.retention_trial_runs where user_id=u.id and kind=p_kind and completed_at is null and started_at>now()-interval '24 hours' order by started_at desc limit 1;
 if r.id is null then
  if(select count(*) from private.retention_trial_runs where user_id=u.id and started_at>=(date_trunc('day',now() at time zone 'Asia/Bishkek') at time zone 'Asia/Bishkek'))>=3 then raise exception 'DAILY_LIMIT';end if;
  if coalesce(u.grade,'') !~ '^([1-9]|1[012])$' then raise exception 'GRADE_REQUIRED';end if;grade_no:=u.grade::integer;
  if p_kind='comeback' then
   select * into prev from private.retention_trial_runs where user_id=u.id and completed_at is not null order by completed_at desc limit 1;
   if prev.id is null then raise exception 'BASELINE_REQUIRED';end if;
   if prev.focus_id is null then raise exception 'POOL_NOT_READY';end if;
   focus:=prev.focus_id;focus_label:=prev.focus_name;diff:=prev.difficulty;select q->>'subject' into subj from jsonb_array_elements(prev.questions) q limit 1;
  elsif p_kind='rescue' then
   select e.atomic_subskill_node_id,n.name into focus,focus_label from public.student_learning_registry_item_evidence e join public.academic_skill_registry_nodes n on n.id=e.atomic_subskill_node_id and n.status='active' join public.school_academic_years y on y.id=e.academic_year_id and y.status='current' where e.student_id=u.id and e.school_id=u.school_id and e.answered_at>=now()-interval '90 days' group by e.atomic_subskill_node_id,n.name having count(*)>=3 and count(*) filter(where not e.is_correct)>=2 order by count(*) filter(where not e.is_correct) desc,max(e.answered_at) desc limit 1;
   if focus is null then raise exception 'FOCUS_NOT_READY';end if;
  else
   select tx.atomic_subskill_node_id,n.name,q.difficulty,q.subject into focus,focus_label,diff,subj from private.retention_trial_candidates(grade_no,null) q join public.verified_question_registry_taxonomy tx on tx.question_id=q.id and tx.question_content_hash=q.current_content_hash and tx.review_status='approved' join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id and n.status='active' group by tx.atomic_subskill_node_id,n.name,q.difficulty,q.subject having count(distinct q.id)>=10 order by case when lower(q.subject)='english' then 0 else 1 end,md5(tx.atomic_subskill_node_id::text||date_trunc('week',now() at time zone 'Asia/Bishkek')::text) limit 1;
  end if;
  if diff is null then select q.difficulty,q.subject into diff,subj from private.retention_trial_candidates(grade_no,focus) q group by q.difficulty,q.subject having count(*)>=5 order by case when lower(q.subject)='english' then 0 else 1 end,q.difficulty limit 1;end if;
  select jsonb_agg(to_jsonb(c)) into qs from(select q.id,q.question_text,q.options,q.correct_answer,q.explanation,q.subject,q.difficulty from private.retention_trial_candidates(grade_no,focus) q where q.subject=subj and q.difficulty=diff and (prev.id is null or not exists(select 1 from jsonb_array_elements(prev.questions) pq where pq->>'id'=q.id::text)) order by md5(q.id::text||u.id::text||date_trunc('week',now() at time zone 'Asia/Bishkek')::text||coalesce(prev.id::text,p_kind)) limit 5)c;
  if coalesce(jsonb_array_length(qs),0)<>5 then raise exception 'POOL_NOT_READY';end if;
  insert into private.retention_trial_runs(user_id,kind,focus_id,focus_name,difficulty,questions) values(u.id,p_kind,focus,coalesce(focus_label,subj||' · '||diff||' practice'),diff,qs) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'kind',r.kind,'focus_name',r.focus_name,'questions',(select jsonb_agg(q-'correct_answer'-'explanation') from jsonb_array_elements(r.questions) q));
end $$;
revoke all on function public.rpc_retention_trial_start(text) from public,anon;
grant execute on function public.rpc_retention_trial_start(text) to authenticated;
create function public.rpc_retention_trial_finish(p_run_id uuid,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.retention_trial_runs;prev_score integer;score integer;
begin
 if auth.uid() is null or not private.retention_trial_allowed(auth.uid()) then raise exception 'TRIAL_PAUSED';end if;
 select * into r from private.retention_trial_runs where id=p_run_id and user_id=auth.uid() for update;
 if r.id is null then raise exception 'NOT_AUTHORIZED';end if;
 if r.completed_at is null then
  if r.started_at<now()-interval '24 hours' then raise exception 'RUN_EXPIRED';end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>5 then raise exception 'INVALID_ANSWERS';end if;
  if exists(select 1 from jsonb_array_elements(r.questions) with ordinality q(value,idx) where p_answers->(idx::integer-1) is null or jsonb_typeof(p_answers->(idx::integer-1))<>'string' or not(p_answers->>(idx::integer-1) in(select jsonb_array_elements_text(value->'options')))) then raise exception 'INVALID_ANSWERS';end if;
  select count(*) into score from jsonb_array_elements(r.questions) with ordinality q(value,idx) where value->>'correct_answer'=p_answers->>(idx::integer-1);
  update private.retention_trial_runs set correct=score,answers=p_answers,completed_at=now() where id=r.id returning * into r;
  delete from private.retention_trial_cache where user_id=auth.uid();
 end if;
 select p.correct into prev_score from private.retention_trial_runs p where p.user_id=auth.uid() and p.completed_at<r.started_at and r.focus_id is not null and p.focus_id=r.focus_id and p.difficulty=r.difficulty and not exists(select 1 from jsonb_array_elements(p.questions) a join jsonb_array_elements(r.questions) b on a->>'id'=b->>'id') order by p.completed_at desc limit 1;
 return jsonb_build_object('id',r.id,'correct',r.correct,'total',5,'previous_correct',prev_score,'questions',r.questions,'answers',r.answers);
end $$;
revoke all on function public.rpc_retention_trial_finish(uuid,jsonb) from public,anon;
grant execute on function public.rpc_retention_trial_finish(uuid,jsonb) to authenticated;
