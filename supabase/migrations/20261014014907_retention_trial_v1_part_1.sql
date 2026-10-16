create function private.retention_trial_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u cross join private.retention_trial_config c where u.id=p_user and c.enabled and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now()) and (c.audience='all' or (c.audience='school' and u.school_id=c.school_id) or (c.audience='pilot' and u.id=any(c.pilot_user_ids))));
$$;
revoke all on function private.retention_trial_allowed(uuid) from public,anon,authenticated;
create function public.rpc_retention_trial_status() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('enabled',auth.uid() is not null and private.retention_trial_allowed(auth.uid()),'version',1)$$;
revoke all on function public.rpc_retention_trial_status() from public,anon;
grant execute on function public.rpc_retention_trial_status() to authenticated;
create function public.rpc_retention_trial_control(p_enabled boolean default null,p_audience text default null,p_pilot_user_ids uuid[] default null,p_school_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.retention_trial_config;
begin
 if auth.uid() is null or not public.rpc_is_superadmin() then raise exception 'NOT_AUTHORIZED';end if;
 if p_enabled is not null then
  if p_audience is null or p_audience not in('pilot','school','all') then raise exception 'INVALID_AUDIENCE';end if;
  if p_audience='pilot' and (coalesce(cardinality(p_pilot_user_ids),0)=0 or cardinality(p_pilot_user_ids)>100) then raise exception 'PILOT_REQUIRED';end if;
  if p_audience='pilot' and exists(select 1 from unnest(p_pilot_user_ids) id where not exists(select 1 from public.users u where u.id=id)) then raise exception 'INVALID_PILOT';end if;
  if p_audience='school' and not exists(select 1 from public.schools s where s.id=p_school_id) then raise exception 'SCHOOL_REQUIRED';end if;
  update private.retention_trial_config set enabled=p_enabled,audience=p_audience,pilot_user_ids=coalesce(p_pilot_user_ids,'{}'),school_id=p_school_id,updated_at=now(),updated_by=auth.uid() where singleton;
 end if;
 select * into c from private.retention_trial_config;return to_jsonb(c)-'singleton';
end $$;
revoke all on function public.rpc_retention_trial_control(boolean,text,uuid[],uuid) from public,anon;
grant execute on function public.rpc_retention_trial_control(boolean,text,uuid[],uuid) to authenticated;
-- Internal candidate helper is never a public answer-key API.
create function private.retention_trial_candidates(p_grade integer,p_focus uuid) returns setof public.questions language sql stable security definer set search_path='' as $$
 select q.* from public.questions q where q.is_active and q.analytics_eligible and q.verification_status='verified' and q.pool_scope='global' and q.question_type='multiple_choice' and q.verified_content_hash=q.current_content_hash and q.verified_content_hash is not null and p_grade=any(q.eligible_grade_levels) and lower(q.subject) not like '%ielts%' and q.image_url is null and jsonb_typeof(q.options)='array' and jsonb_array_length(q.options)=4 and not exists(select 1 from jsonb_array_elements(q.options) o where jsonb_typeof(o)<>'string') and q.correct_answer in(select jsonb_array_elements_text(q.options)) and (select count(distinct o) from jsonb_array_elements_text(q.options) o)=4 and (p_focus is null or exists(select 1 from public.verified_question_registry_taxonomy tx where tx.question_id=q.id and tx.atomic_subskill_node_id=p_focus and tx.question_content_hash=q.current_content_hash and tx.review_status='approved'));
$$;
revoke all on function private.retention_trial_candidates(integer,uuid) from public,anon,authenticated;
