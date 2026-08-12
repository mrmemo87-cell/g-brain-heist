-- Canonical programme enforcement and fixed 30-day pilot behaviour.
--
-- This migration is deliberately fail closed for school programme data while
-- preserving the independent IELTS/Writing products. It also removes the two
-- legacy plan shortcuts which could bypass a verified billing agreement.

create or replace function private.actor_can_access_school_programme(
  p_school_id uuid,
  p_module_key text,
  p_allow_anonymous boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_school_id is not null
    and public.school_has_module_access(p_school_id,p_module_key)
    and (
      (select auth.uid()) is null and p_allow_anonymous
      or public.is_superadmin((select auth.uid()))
      or exists(
        select 1 from public.school_members sm
        where sm.school_id=p_school_id and sm.user_id=(select auth.uid()) and sm.status='active'
      )
    );
$$;

revoke all on function private.actor_can_access_school_programme(uuid,text,boolean)
  from public,anon,authenticated,service_role;

create or replace function private.actor_has_programme_access(
  p_module_key text,
  p_allow_individual boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_profile_school_id uuid;
  v_profile_role text;
begin
  if v_actor is null then return false; end if;
  if public.is_superadmin(v_actor) then return true; end if;

  select u.school_id,u.role into v_profile_school_id,v_profile_role
  from public.users u where u.id=v_actor;
  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
    and (v_profile_school_id is null or sm.school_id=v_profile_school_id)
  order by sm.is_owner desc,sm.joined_at nulls last,sm.id
  limit 1;

  if v_school_id is null then
    return p_allow_individual and v_profile_school_id is null
      and coalesce(v_profile_role,'') not in ('admin','superadmin','super_admin','school_admin');
  end if;
  return private.actor_can_access_school_programme(v_school_id,p_module_key,false);
end;
$$;

revoke all on function private.actor_has_programme_access(text,boolean) from public,anon,authenticated,service_role;

-- A pilot includes every product capability for the complete 30-day period.
-- Usage counters remain useful telemetry but are not authorization limits.
insert into public.billing_entitlements(plan,feature_key,enabled,limit_value)
select 'pilot',be.feature_key,true,null
from public.billing_entitlements be
where be.plan='core'
on conflict(plan,feature_key) do update set enabled=true,limit_value=null;

create or replace function public.check_pilot_quota(p_feature_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_school_id uuid; v_plan text; v_end timestamptz;
  v_limit integer; v_used integer:=0;
begin
  if v_actor is null then return jsonb_build_object('allowed',false,'reason','not_authenticated'); end if;
  if public.is_superadmin(v_actor) then return jsonb_build_object('allowed',true,'reason','superadmin'); end if;
  select u.school_id into v_school_id from public.users u where u.id=v_actor;
  if v_school_id is null then return jsonb_build_object('allowed',true,'reason','not_school_pilot'); end if;
  select s.school_plan,s.trial_ends_at into v_plan,v_end from public.schools s where s.id=v_school_id;
  if v_plan is distinct from 'pilot' then return jsonb_build_object('allowed',true,'reason','not_school_pilot'); end if;
  if v_end is null or v_end<=now() then return jsonb_build_object('allowed',false,'reason','pilot_expired'); end if;
  v_limit:=(public.get_pilot_quota_limits()->>p_feature_id)::integer;
  select coalesce(spu.used_count,0) into v_used from public.school_pilot_usage spu
  where spu.school_id=v_school_id and spu.feature_id=p_feature_id;
  return jsonb_build_object('allowed',true,'reason','pilot_usage_only','used',coalesce(v_used,0),
    'limit',v_limit,'remaining',case when v_limit is null then null else greatest(v_limit-coalesce(v_used,0),0) end);
end;
$$;

create or replace function public.consume_pilot_quota(p_feature_id text,p_amount integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_school_id uuid; v_plan text; v_end timestamptz;
  v_limit integer; v_used integer;
begin
  if v_actor is null then return jsonb_build_object('success',false,'error','not_authenticated'); end if;
  if p_amount<1 then return jsonb_build_object('success',false,'error','amount_must_be_positive'); end if;
  if public.is_superadmin(v_actor) then return jsonb_build_object('success',true,'consumed',false,'reason','superadmin'); end if;
  select u.school_id into v_school_id from public.users u where u.id=v_actor;
  if v_school_id is null then return jsonb_build_object('success',true,'consumed',false,'reason','not_school_pilot'); end if;
  select s.school_plan,s.trial_ends_at into v_plan,v_end from public.schools s where s.id=v_school_id;
  if v_plan is distinct from 'pilot' then return jsonb_build_object('success',true,'consumed',false,'reason','not_school_pilot'); end if;
  if v_end is null or v_end<=now() then return jsonb_build_object('success',false,'error','pilot_expired'); end if;
  v_limit:=(public.get_pilot_quota_limits()->>p_feature_id)::integer;
  if v_limit is null then return jsonb_build_object('success',true,'consumed',false,'reason','untracked_feature'); end if;
  insert into public.school_pilot_usage(school_id,feature_id,used_count,updated_at)
  values(v_school_id,p_feature_id,p_amount,now())
  on conflict(school_id,feature_id) do update
    set used_count=public.school_pilot_usage.used_count+p_amount,updated_at=now()
  returning used_count into v_used;
  return jsonb_build_object('success',true,'consumed',true,'used',v_used,'limit',v_limit,
    'remaining',greatest(v_limit-v_used,0),'usage_only',true);
end;
$$;

create or replace function public.get_school_pilot_quotas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_school_id uuid; v_plan text; v_end timestamptz;
  v_limits jsonb; v_result jsonb:='{}'::jsonb; v_key text; v_limit integer; v_used integer;
begin
  if v_actor is null then return jsonb_build_object('success',false,'error','not_authenticated'); end if;
  select u.school_id into v_school_id from public.users u where u.id=v_actor;
  if v_school_id is null then return jsonb_build_object('success',true,'is_pilot',false); end if;
  select s.school_plan,s.trial_ends_at into v_plan,v_end from public.schools s where s.id=v_school_id;
  if v_plan is distinct from 'pilot' then return jsonb_build_object('success',true,'is_pilot',false); end if;
  if v_end is null or v_end<=now() then
    return jsonb_build_object('success',true,'is_pilot',true,'expired',true,'trial_ends_at',v_end);
  end if;
  v_limits:=public.get_pilot_quota_limits();
  for v_key in select jsonb_object_keys(v_limits) loop
    v_limit:=(v_limits->>v_key)::integer;
    select coalesce(spu.used_count,0) into v_used from public.school_pilot_usage spu
    where spu.school_id=v_school_id and spu.feature_id=v_key;
    v_result:=v_result||jsonb_build_object(v_key,jsonb_build_object(
      'used',coalesce(v_used,0),'limit',v_limit,'remaining',greatest(v_limit-coalesce(v_used,0),0),
      'exhausted',false,'usage_only',true));
  end loop;
  return jsonb_build_object('success',true,'is_pilot',true,'expired',false,'trial_ends_at',v_end,
    'usage_only',true,'quotas',v_result);
end;
$$;

create or replace function public.rpc_adm_check_entitlement(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not private.actor_can_access_school_programme(p_school_id,'admissions',false) then
    return jsonb_build_object('allowed',false,'reason','Admission Hub is not included in this school agreement');
  end if;
  v_plan:=private.professional_onboarding_active_plan(p_school_id);
  return jsonb_build_object('allowed',true,'reason',case when v_plan='pilot' then 'pilot' else 'active_agreement' end,
    'remaining',-1,'usage_only',v_plan='pilot');
end;
$$;

-- Keep lifecycle state synchronized whenever a user resolves entitlements.
create or replace function private.sync_school_pilot_lifecycle(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_school public.schools%rowtype; v_paid boolean;
begin
  if p_school_id is null then return; end if;
  select * into v_school from public.schools s where s.id=p_school_id;
  if not found then return; end if;
  insert into public.school_pilot_lifecycle(school_id) values(p_school_id) on conflict(school_id) do nothing;
  select exists(
    select 1 from public.billing_subscriptions bs
    where bs.school_id=p_school_id and bs.plan in ('core','standard','pro','enterprise')
      and bs.status in ('active','trialing','past_due')
      and (bs.current_period_end is null or bs.current_period_end>now())
      and (not bs.is_comp or bs.comp_expires_at is null or bs.comp_expires_at>now())
  ) into v_paid;
  if v_paid or v_school.school_plan in ('core','standard','pro','enterprise') then
    update public.school_pilot_lifecycle set state='converted',converted_at=coalesce(converted_at,now()),updated_at=now()
    where school_id=p_school_id and state<>'cancelled';
  elsif v_school.school_plan='pilot' and v_school.trial_ends_at>now() then
    update public.school_pilot_lifecycle set state='active',ends_at=v_school.trial_ends_at,
      started_at=coalesce(started_at,v_school.trial_ends_at-interval '30 days'),updated_at=now()
    where school_id=p_school_id and state<>'cancelled';
  elsif v_school.trial_ends_at is not null then
    update public.school_pilot_lifecycle set state='expired',ends_at=v_school.trial_ends_at,
      started_at=coalesce(started_at,v_school.trial_ends_at-interval '30 days'),updated_at=now()
    where school_id=p_school_id and state not in ('converted','cancelled');
  else
    update public.school_pilot_lifecycle set state='not_started',started_at=null,ends_at=null,updated_at=now()
    where school_id=p_school_id and state not in ('converted','cancelled','expired');
  end if;
end;
$$;

revoke all on function private.sync_school_pilot_lifecycle(uuid) from public,anon,authenticated,service_role;

create or replace function private.trigger_sync_school_pilot_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform private.sync_school_pilot_lifecycle(old.school_id);
    return old;
  end if;
  perform private.sync_school_pilot_lifecycle(new.school_id);
  return new;
end;
$$;
revoke all on function private.trigger_sync_school_pilot_lifecycle() from public,anon,authenticated,service_role;

drop trigger if exists billing_subscription_syncs_pilot_lifecycle on public.billing_subscriptions;
create trigger billing_subscription_syncs_pilot_lifecycle
after insert or update or delete on public.billing_subscriptions
for each row execute function private.trigger_sync_school_pilot_lifecycle();

create or replace function private.trigger_sync_school_row_pilot_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.sync_school_pilot_lifecycle(new.id);
  return new;
end;
$$;
revoke all on function private.trigger_sync_school_row_pilot_lifecycle()
  from public,anon,authenticated,service_role;

drop trigger if exists school_row_syncs_pilot_lifecycle on public.schools;
create trigger school_row_syncs_pilot_lifecycle
after insert or update of school_plan,trial_ends_at on public.schools
for each row execute function private.trigger_sync_school_row_pilot_lifecycle();

create or replace function public.get_school_plan_details(p_school_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_school_id uuid; v_plan text; v_effective_plan text;
  v_trial_end timestamptz; v_active boolean; v_limits jsonb; v_members integer; v_pilot_state text;
begin
  if v_actor is null then return jsonb_build_object('success',false,'error','Not authenticated'); end if;
  v_school_id:=coalesce(p_school_id,(select u.school_id from public.users u where u.id=v_actor));
  if v_school_id is null then return jsonb_build_object('success',true,'plan','none','is_active',false,'pilot_state','not_started'); end if;
  if not (public.is_superadmin(v_actor) or exists(
    select 1 from public.school_members sm where sm.school_id=v_school_id and sm.user_id=v_actor and sm.status='active'
  )) then return jsonb_build_object('success',false,'error','Not a member of this school'); end if;
  perform private.sync_school_pilot_lifecycle(v_school_id);
  select s.school_plan,s.trial_ends_at into v_plan,v_trial_end from public.schools s where s.id=v_school_id;
  v_effective_plan:=private.professional_onboarding_active_plan(v_school_id);
  v_active:=v_effective_plan in ('pilot','core','standard','pro','enterprise');
  v_limits:=public.get_plan_seat_limits(case when v_effective_plan='free' then coalesce(v_plan,'none') else v_effective_plan end);
  select count(*)::integer into v_members from public.school_members sm where sm.school_id=v_school_id and sm.status='active';
  select spl.state into v_pilot_state from public.school_pilot_lifecycle spl where spl.school_id=v_school_id;
  return jsonb_build_object('success',true,'school_id',v_school_id,
    'plan',case when v_effective_plan='free' then coalesce(v_plan,'none') else v_effective_plan end,
    'effective_plan',v_effective_plan,'is_active',v_active,'trial_ends_at',v_trial_end,
    'pilot_state',coalesce(v_pilot_state,'not_started'),'seats',v_limits,'current_members',v_members,
    'trial_expired',coalesce(v_plan='pilot' and (v_trial_end is null or v_trial_end<=now()),false));
end;
$$;

do $$ declare v_school_id uuid; begin
  for v_school_id in select s.id from public.schools s loop
    perform private.sync_school_pilot_lifecycle(v_school_id);
  end loop;
end $$;

-- Cambridge reads must verify both the actor's class scope and the school module.
create or replace function public.get_school_cambridge_scores(p_limit integer default 100)
returns table(id uuid,student_id uuid,student_name text,student_class text,quiz_name text,test_id text,
  quiz_version text,attempt_number integer,attempt_status text,score integer,total_questions integer,
  percentage integer,answers jsonb,time_taken_seconds integer,submitted_at timestamptz,
  scores_released boolean,released_at timestamptz,school_id uuid,test_subject text)
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_school_id uuid; v_role text;
begin
  select u.school_id,u.role into v_school_id,v_role from public.users u where u.id=v_actor;
  if v_actor is null or v_school_id is null or v_role not in ('teacher','admin','school_admin') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if not public.school_has_module_access(v_school_id,'cambridge') then
    raise exception 'Cambridge is not included in this school agreement' using errcode='42501';
  end if;
  return query
  select qs.id,qs.student_id,coalesce(nullif(trim(su.full_name),''),qs.student_name),
    coalesce(cc.class_code,qs.student_class),qs.quiz_name,qs.test_id,qs.quiz_version,qs.attempt_number,
    qs.attempt_status,qs.score,qs.total_questions,qs.percentage,qs.answers,qs.time_taken_seconds,
    qs.submitted_at,coalesce(qs.scores_released,false),qs.released_at,qs.school_id,
    coalesce(ct.curriculum_subject,ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct on ct.id=qs.test_id or lower(trim(ct.name))=lower(trim(qs.quiz_name))
  left join public.users su on su.id=qs.student_id and su.school_id=qs.school_id
  left join lateral(
    select c.class_code from public.class_students cs join public.classes c on c.id=cs.class_id and c.school_id=qs.school_id
    where cs.student_id=qs.student_id and (v_role in ('admin','school_admin') or exists(
      select 1 from public.class_teacher_assignments x where x.class_id=c.id and x.teacher_user_id=v_actor
        and x.school_id=qs.school_id and x.active and x.can_grade
        and public.cambridge_assignment_matches_test(x.subject,qs.test_id,qs.quiz_name)))
    order by c.class_code limit 1
  ) cc on true
  where qs.school_id=v_school_id and qs.attempt_status in ('submitted','released') and (
    v_role in ('admin','school_admin') or exists(
      select 1 from public.class_teacher_assignments cta join public.classes c on c.id=cta.class_id and c.school_id=qs.school_id
      where cta.teacher_user_id=v_actor and cta.school_id=qs.school_id and cta.active and cta.can_grade
        and (exists(select 1 from public.class_students cs where cs.class_id=cta.class_id and cs.student_id=qs.student_id)
          or (qs.student_id is null and (c.class_code=qs.student_class or c.class_name=qs.student_class)))
        and public.cambridge_assignment_matches_test(cta.subject,qs.test_id,qs.quiz_name)))
  order by qs.submitted_at desc limit greatest(1,least(coalesce(p_limit,100),1000));
end;
$$;

create or replace function public.get_school_cambridge_stats()
returns jsonb language sql security definer set search_path='' as $$
  with scores as (select * from public.get_school_cambridge_scores(1000)),
  class_rows as (select student_class,count(*) cnt,round(avg(percentage)) avg_pct from scores group by student_class)
  select jsonb_build_object(
    'totalSubmissions',(select count(*) from scores),
    'avgPercentage',coalesce((select round(avg(percentage)) from scores),0),
    'highestScore',(select jsonb_build_object('name',student_name,'percentage',percentage) from scores order by percentage desc limit 1),
    'lowestScore',(select jsonb_build_object('name',student_name,'percentage',percentage) from scores order by percentage asc limit 1),
    'classStats',coalesce((select jsonb_object_agg(coalesce(student_class,'Unknown'),jsonb_build_object('count',cnt,'avg',avg_pct)) from class_rows),'{}'::jsonb)
  );
$$;

create or replace function public.get_my_cambridge_exam_identity()
returns jsonb language sql stable security definer set search_path='' as $$
  select case
    when u.id is null then jsonb_build_object('success',false,'error','Not authenticated')
    when u.role<>'student' then jsonb_build_object('success',false,'error','Cambridge tests are for students')
    when u.school_id is null or not public.school_has_module_access(u.school_id,'cambridge')
      then jsonb_build_object('success',false,'error','Cambridge is not included in this school agreement')
    when u.full_name_status<>'verified' or nullif(trim(u.full_name),'') is null
      then jsonb_build_object('success',false,'error','Your real name must be confirmed by your school administrator before starting a Cambridge test','status',u.full_name_status)
    else jsonb_build_object('success',true,'name',u.full_name,'class',coalesce(u.batch,'N/A'),'grade',u.grade,'schoolId',u.school_id,'userId',u.id)
  end from (select auth.uid() id) a left join public.users u on u.id=a.id;
$$;

create or replace function public.get_visible_cambridge_tests_for_student(p_student_grade integer,p_school_id uuid)
returns table(test_id text,subject text)
language plpgsql security definer set search_path='' as $$
declare v_student uuid:=auth.uid(); v_school uuid;
begin
  select u.school_id into v_school from public.users u where u.id=v_student and u.role='student';
  if v_student is null or v_school is null or p_school_id is distinct from v_school then return; end if;
  if not public.school_has_module_access(v_school,'cambridge') then return; end if;
  return query select distinct ct.id,ct.subject
  from public.class_students cs
  join public.classes c on c.id=cs.class_id and c.school_id=v_school and c.is_active
  join public.teacher_cambridge_class_visibility t on t.class_id=cs.class_id and t.is_visible
  join public.cambridge_tests ct on ct.id=t.test_id and (ct.mapped_grade_level is null or
    nullif(regexp_replace(c.grade_level,'[^0-9]','','g'),'')::integer=ct.mapped_grade_level)
  left join public.school_cambridge_test_visibility s on s.school_id=v_school and s.test_id=ct.id
  where cs.student_id=v_student and coalesce(s.is_visible,true);
end;
$$;

create or replace function public.get_teacher_cambridge_test_catalog()
returns table(class_id uuid,class_code text,class_name text,grade_level integer,test_id text,test_name text,
  description text,duration text,total_questions integer,difficulty text,category text,subject text,
  curriculum_subject text,curriculum_stage integer,test_url text,requires_marking boolean,
  school_available boolean,teacher_released boolean)
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_school uuid;
begin
  select u.school_id into v_school from public.users u where u.id=v_actor and u.role in ('teacher','school_admin','admin');
  if v_actor is null or v_school is null then raise exception 'Teacher school membership required' using errcode='42501'; end if;
  if not public.school_has_module_access(v_school,'cambridge') then
    raise exception 'Cambridge is not included in this school agreement' using errcode='42501';
  end if;
  return query select c.id,c.class_code,c.class_name,nullif(regexp_replace(c.grade_level,'[^0-9]','','g'),'')::integer,
    ct.id,ct.name,ct.description,ct.duration,ct.total_questions,ct.difficulty,ct.category,ct.subject,
    ct.curriculum_subject,ct.curriculum_stage,ct.test_url,ct.requires_marking,coalesce(s.is_visible,true),coalesce(t.is_visible,false)
  from public.class_teacher_assignments cta
  join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id and c.is_active
  join public.cambridge_tests ct on lower(btrim(ct.curriculum_subject))=lower(btrim(cta.subject)) and
    (ct.mapped_grade_level is null or nullif(regexp_replace(c.grade_level,'[^0-9]','','g'),'')::integer=ct.mapped_grade_level)
  left join public.school_cambridge_test_visibility s on s.school_id=cta.school_id and s.test_id=ct.id
  left join public.teacher_cambridge_class_visibility t on t.class_id=cta.class_id and t.test_id=ct.id
  where cta.teacher_user_id=v_actor and cta.school_id=v_school and cta.active
  order by c.class_code,ct.curriculum_subject,ct.curriculum_stage nulls last,ct.name;
end;
$$;

-- The submission RPC is SECURITY DEFINER, so RLS alone cannot protect it.
-- Preserve the battle-tested implementation behind a non-browser-callable
-- name and put the entitlement check at its public boundary.
do $$
begin
  if to_regprocedure('public.submit_cambridge_attempt_entitlement_internal(text,text,text,jsonb,integer,integer,integer,integer,text)') is null
     and to_regprocedure('public.submit_cambridge_attempt(text,text,text,jsonb,integer,integer,integer,integer,text)') is not null then
    alter function public.submit_cambridge_attempt(text,text,text,jsonb,integer,integer,integer,integer,text)
      rename to submit_cambridge_attempt_entitlement_internal;
  end if;
end $$;

revoke all on function public.submit_cambridge_attempt_entitlement_internal(text,text,text,jsonb,integer,integer,integer,integer,text)
  from public,anon,authenticated,service_role;

create or replace function public.submit_cambridge_attempt(
  p_quiz_name text,
  p_test_id text,
  p_quiz_version text,
  p_answers jsonb,
  p_score integer,
  p_total_questions integer,
  p_percentage integer,
  p_time_taken_seconds integer,
  p_submission_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_school_id uuid;
begin
  select u.school_id into v_school_id from public.users u
  where u.id=auth.uid() and u.role='student';
  if not private.actor_can_access_school_programme(v_school_id,'cambridge',false) then
    return jsonb_build_object('success',false,'error','Cambridge is not included in this school agreement');
  end if;
  return public.submit_cambridge_attempt_entitlement_internal(
    p_quiz_name,p_test_id,p_quiz_version,p_answers,p_score,p_total_questions,
    p_percentage,p_time_taken_seconds,p_submission_key
  );
end;
$$;
revoke all on function public.submit_cambridge_attempt(text,text,text,jsonb,integer,integer,integer,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_cambridge_attempt(text,text,text,jsonb,integer,integer,integer,integer,text)
  to authenticated;

create or replace function public.get_my_cambridge_attempt_state(
  p_test_id text,p_quiz_version text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_school_id uuid; v_submission public.quiz_scores%rowtype;
begin
  select u.school_id into v_school_id from public.users u where u.id=v_actor and u.role='student';
  if not private.actor_can_access_school_programme(v_school_id,'cambridge',false) then
    return jsonb_build_object('success',false,'error','Cambridge is not included in this school agreement');
  end if;
  select * into v_submission from public.quiz_scores qs
  where qs.student_id=v_actor and qs.school_id=v_school_id and qs.test_id=p_test_id
    and (p_quiz_version is null or qs.quiz_version=p_quiz_version)
    and qs.attempt_status in ('submitted','released')
  order by qs.submitted_at desc limit 1;
  return jsonb_build_object('success',true,'has_submission',found,
    'submission',case when found then to_jsonb(v_submission) else null end);
end;
$$;

create or replace function public.is_cambridge_test_visible_to_student(
  p_test_id text,p_student_grade integer,p_school_id uuid,p_subject text
)
returns boolean language sql stable security definer set search_path='' as $$
  select private.actor_can_access_school_programme(u.school_id,'cambridge',false)
    and (p_school_id is null or p_school_id=u.school_id)
    and exists(
      select 1 from public.get_visible_cambridge_tests_for_student(p_student_grade,u.school_id) visible
      where visible.test_id=p_test_id and (p_subject is null or visible.subject=p_subject)
    )
  from public.users u where u.id=(select auth.uid()) and u.role='student';
$$;

do $$
begin
  if to_regprocedure('public.get_school_cambridge_test_visibility_settings_entitlement_internal(uuid)') is null
     and to_regprocedure('public.get_school_cambridge_test_visibility_settings(uuid)') is not null then
    alter function public.get_school_cambridge_test_visibility_settings(uuid)
      rename to get_school_cambridge_test_visibility_settings_entitlement_internal;
  end if;
  if to_regprocedure('public.get_teacher_test_visibility_settings_entitlement_internal()') is null
     and to_regprocedure('public.get_teacher_test_visibility_settings()') is not null then
    alter function public.get_teacher_test_visibility_settings()
      rename to get_teacher_test_visibility_settings_entitlement_internal;
  end if;
  if to_regprocedure('public.get_all_cambridge_tests_entitlement_internal(integer,text)') is null
     and to_regprocedure('public.get_all_cambridge_tests(integer,text)') is not null then
    alter function public.get_all_cambridge_tests(integer,text)
      rename to get_all_cambridge_tests_entitlement_internal;
  end if;
end $$;

revoke all on function public.get_school_cambridge_test_visibility_settings_entitlement_internal(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.get_teacher_test_visibility_settings_entitlement_internal()
  from public,anon,authenticated,service_role;
revoke all on function public.get_all_cambridge_tests_entitlement_internal(integer,text)
  from public,anon,authenticated,service_role;

create or replace function public.get_school_cambridge_test_visibility_settings(p_school_id uuid default null)
returns table(test_id text,test_name text,subject text,category text,is_visible boolean,
  updated_by uuid,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_school_id uuid;
begin
  v_school_id:=coalesce(p_school_id,(select u.school_id from public.users u where u.id=auth.uid()));
  if not private.actor_can_access_school_programme(v_school_id,'cambridge',false) then return; end if;
  return query select * from public.get_school_cambridge_test_visibility_settings_entitlement_internal(v_school_id);
end;
$$;

create or replace function public.get_teacher_test_visibility_settings()
returns table(test_id text,subject text,grade_level integer,is_visible boolean,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_has_programme_access('cambridge',false) then return; end if;
  return query select * from public.get_teacher_test_visibility_settings_entitlement_internal();
end;
$$;

create or replace function public.get_all_cambridge_tests(p_grade_level integer,p_subject text)
returns table(test_id text,test_name text,description text,duration text,total_questions integer,
  difficulty text,category text,subject text,test_url text,requires_marking boolean,is_visible boolean)
language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_has_programme_access('cambridge',false) then return; end if;
  return query select * from public.get_all_cambridge_tests_entitlement_internal(p_grade_level,p_subject);
end;
$$;

revoke all on function public.get_school_cambridge_test_visibility_settings(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_school_cambridge_test_visibility_settings(uuid) to authenticated;
revoke all on function public.get_teacher_test_visibility_settings()
  from public,anon,authenticated,service_role;
grant execute on function public.get_teacher_test_visibility_settings() to authenticated;
revoke all on function public.get_all_cambridge_tests(integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_all_cambridge_tests(integer,text) to authenticated;

create or replace function private.enforce_cambridge_module_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_school_id uuid; v_test_id text; v_class_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'anon' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_school_id:=nullif(v_row->>'school_id','')::uuid;
  v_test_id:=v_row->>'test_id';
  if tg_table_name='teacher_cambridge_class_visibility' then
    v_class_id:=nullif(v_row->>'class_id','')::uuid;
    select c.school_id into v_school_id from public.classes c where c.id=v_class_id;
  end if;
  if tg_table_name='quiz_scores' and not exists(
    select 1 from public.cambridge_tests ct where ct.id=v_test_id
  ) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if v_school_id is null or not public.school_has_module_access(v_school_id,'cambridge') then
    raise exception 'Cambridge is not included in this school agreement' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_cambridge_module_row()
  from public,anon,authenticated,service_role;

drop trigger if exists enforce_cambridge_module_on_scores on public.quiz_scores;
create trigger enforce_cambridge_module_on_scores before insert or update or delete on public.quiz_scores
for each row execute function private.enforce_cambridge_module_row();

drop trigger if exists enforce_cambridge_module_on_school_visibility on public.school_cambridge_test_visibility;
create trigger enforce_cambridge_module_on_school_visibility before insert or update or delete on public.school_cambridge_test_visibility
for each row execute function private.enforce_cambridge_module_row();

drop trigger if exists enforce_cambridge_module_on_teacher_visibility on public.teacher_cambridge_class_visibility;
create trigger enforce_cambridge_module_on_teacher_visibility before insert or update or delete on public.teacher_cambridge_class_visibility
for each row execute function private.enforce_cambridge_module_row();

drop policy if exists school_module_cambridge_quiz_scores on public.quiz_scores;
create policy school_module_cambridge_quiz_scores on public.quiz_scores as restrictive for all to authenticated
using (
  public.is_superadmin(auth.uid())
  or not exists(select 1 from public.cambridge_tests ct where ct.id=quiz_scores.test_id)
  or public.school_has_module_access(quiz_scores.school_id,'cambridge')
)
with check (
  public.is_superadmin(auth.uid())
  or not exists(select 1 from public.cambridge_tests ct where ct.id=quiz_scores.test_id)
  or public.school_has_module_access(quiz_scores.school_id,'cambridge')
);

-- Writing remains available to true individual accounts, but school-linked
-- actors must have the Writing Hub module in their agreement.
create or replace function public.bh_writing_allowed_students()
returns table(student_id uuid)
language sql stable security definer set search_path='' as $$
  with me as (
    select u.id,u.role,coalesce(u.is_admin,false) is_admin,u.school_id from public.users u where u.id=auth.uid()
  )
  select distinct u.id from public.users u join me on true
  where private.actor_has_programme_access('writing',true)
    and (me.is_admin or me.role='admin') and u.role='student'
  union
  select distinct u.id from public.users u join me on u.school_id=me.school_id
  where me.role='school_admin' and u.role='student' and private.actor_has_programme_access('writing',true)
  union
  select distinct cs.student_id from me
  join public.teachers t on t.user_id=me.id
  join public.class_teacher_assignments cta on cta.teacher_user_id=me.id and coalesce(cta.active,true)
  join public.classes c on c.id=cta.class_id and c.school_id=me.school_id
  join public.class_students cs on cs.class_id=cta.class_id
  where me.role='teacher' and private.actor_has_programme_access('writing',true);
$$;

create or replace function public.bh_writing_authorized_english_classes()
returns table(class_id uuid,class_name text,current_grade integer,school_id uuid)
language sql stable security definer set search_path='' as $$
  with actor as (
    select u.id,u.role,coalesce(u.is_admin,false) is_admin,u.school_id
    from public.users u where u.id=(select auth.uid())
  )
  select distinct c.id,
    coalesce(nullif(trim(c.class_name),''),nullif(trim(c.class_code),''),'Class'),
    case when c.grade_level::text~'^[0-9]+$' then c.grade_level::text::integer else null end,
    c.school_id
  from public.classes c join actor a on true
  where private.actor_has_programme_access('writing',true)
    and coalesce(c.is_active,true)
    and (lower(trim(coalesce(c.subject,''))) like 'english%' or exists(
      select 1 from public.class_teacher_assignments x where x.class_id=c.id and coalesce(x.active,true)
        and lower(trim(coalesce(x.subject,''))) like 'english%'))
    and (
      (a.is_admin or a.role in ('admin','super_admin')) and public.is_superadmin(a.id)
      or (a.role='school_admin' and a.school_id=c.school_id)
      or (a.role='teacher' and exists(
        select 1 from public.class_teacher_assignments cta
        where cta.class_id=c.id and cta.teacher_user_id=a.id and coalesce(cta.active,true)
          and lower(trim(coalesce(cta.subject,c.subject,''))) like 'english%'))
    )
  order by 2,1;
$$;

create or replace function public.can_access_bh_writing_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.actor_has_programme_access('writing',true) and (
    public.is_superadmin(auth.uid())
    or exists(select 1 from public.users me where me.id=auth.uid() and (coalesce(me.is_admin,false) or me.role='admin'))
    or exists(select 1 from public.users me join public.users target on target.id=p_student_id and target.school_id=me.school_id
      where me.id=auth.uid() and me.role='school_admin')
    or exists(select 1 from public.users me join public.users target on target.id=p_student_id and target.school_id=me.school_id
      join public.class_teacher_assignments cta on cta.teacher_user_id=me.id and coalesce(cta.active,true)
      join public.class_students cs on cs.class_id=cta.class_id and cs.student_id=target.id
      where me.id=auth.uid() and me.role='teacher')
  );
$$;

do $$
begin
  if to_regprocedure('public.rpc_bh_writing_canonical_assessment_entitlement_internal(text)') is null
     and to_regprocedure('public.rpc_bh_writing_canonical_assessment(text)') is not null then
    alter function public.rpc_bh_writing_canonical_assessment(text)
      rename to rpc_bh_writing_canonical_assessment_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_bh_writing_submit_assessment_review_entitlement_internal(uuid,jsonb,text,boolean)') is null
     and to_regprocedure('public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)') is not null then
    alter function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)
      rename to rpc_bh_writing_submit_assessment_review_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_bh_writing_calibration_queue_v2_entitlement_internal(uuid,integer)') is null
     and to_regprocedure('public.rpc_bh_writing_calibration_queue_v2(uuid,integer)') is not null then
    alter function public.rpc_bh_writing_calibration_queue_v2(uuid,integer)
      rename to rpc_bh_writing_calibration_queue_v2_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_bh_writing_calibration_metrics_v2_entitlement_internal(uuid)') is null
     and to_regprocedure('public.rpc_bh_writing_calibration_metrics_v2(uuid)') is not null then
    alter function public.rpc_bh_writing_calibration_metrics_v2(uuid)
      rename to rpc_bh_writing_calibration_metrics_v2_entitlement_internal;
  end if;
end $$;

revoke all on function public.rpc_bh_writing_canonical_assessment_entitlement_internal(text)
  from public,anon,authenticated,service_role;
revoke all on function public.rpc_bh_writing_submit_assessment_review_entitlement_internal(uuid,jsonb,text,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.rpc_bh_writing_calibration_queue_v2_entitlement_internal(uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.rpc_bh_writing_calibration_metrics_v2_entitlement_internal(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.rpc_bh_writing_canonical_assessment(p_attempt_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_has_programme_access('writing',true) then
    raise exception 'Writing Hub is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_bh_writing_canonical_assessment_entitlement_internal(p_attempt_key);
end;
$$;

create or replace function public.rpc_bh_writing_submit_assessment_review(
  p_assessment_id uuid,p_criterion_scores jsonb,p_rationale text default null,p_is_final boolean default true
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_has_programme_access('writing',true) then
    raise exception 'Writing Hub is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_bh_writing_submit_assessment_review_entitlement_internal(
    p_assessment_id,p_criterion_scores,p_rationale,p_is_final);
end;
$$;

create or replace function public.rpc_bh_writing_calibration_queue_v2(p_school_id uuid,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(p_school_id,'writing',false) then
    raise exception 'Writing Hub is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_bh_writing_calibration_queue_v2_entitlement_internal(p_school_id,p_limit);
end;
$$;

create or replace function public.rpc_bh_writing_calibration_metrics_v2(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(p_school_id,'writing',false) then
    raise exception 'Writing Hub is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_bh_writing_calibration_metrics_v2_entitlement_internal(p_school_id);
end;
$$;

revoke all on function public.rpc_bh_writing_canonical_assessment(text)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_canonical_assessment(text) to authenticated;
revoke all on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_submit_assessment_review(uuid,jsonb,text,boolean) to authenticated;
revoke all on function public.rpc_bh_writing_calibration_queue_v2(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_calibration_queue_v2(uuid,integer) to authenticated;
revoke all on function public.rpc_bh_writing_calibration_metrics_v2(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_bh_writing_calibration_metrics_v2(uuid) to authenticated;

create or replace function private.enforce_writing_module_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_school_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'anon' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_school_id:=nullif(v_row->>'school_id','')::uuid;
  if v_school_id is null then
    if not private.actor_has_programme_access('writing',true) then
      raise exception 'Writing Hub is not included in this school agreement' using errcode='42501';
    end if;
  elsif not private.actor_can_access_school_programme(v_school_id,'writing',false) then
    raise exception 'Writing Hub is not included in this school agreement' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_writing_module_row()
  from public,anon,authenticated,service_role;

do $$
declare v_table text;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='school_id' and not a.attisdropped
    where n.nspname='public' and c.relkind='r' and c.relname like 'bh_writing_%'
  loop
    execute format('drop trigger if exists enforce_writing_module_row on public.%I',v_table);
    execute format('create trigger enforce_writing_module_row before insert or update or delete on public.%I for each row execute function private.enforce_writing_module_row()',v_table);
  end loop;
end $$;

do $$
declare v_table text;
begin
  for v_table in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname like 'bh_writing_%'
  loop
    execute format('drop policy if exists school_writing_module_required on public.%I',v_table);
    execute format('create policy school_writing_module_required on public.%I as restrictive for all to authenticated using (private.actor_has_programme_access(''writing'',true)) with check (private.actor_has_programme_access(''writing'',true))',v_table);
  end loop;
end $$;

-- School IELTS operations require the school module; individual IELTS Prime
-- and the independent funnel remain separate products.
create or replace function public.can_manage_ielts_practice_school(p_school_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.school_has_module_access(p_school_id,'ielts') and (
    public.is_superadmin(auth.uid())
    or exists(select 1 from public.users u where u.id=auth.uid() and
      (coalesce(u.is_admin,false) or u.role in ('admin','superadmin') or (u.role='school_admin' and u.school_id=p_school_id)))
    or exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.status='active' and sm.role_in_school in ('school_admin','admin','superadmin'))
  );
$$;

create or replace function public.can_manage_ielts_practice_class(p_school_id uuid,p_class_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.school_has_module_access(p_school_id,'ielts') and (
    public.can_manage_ielts_practice_school(p_school_id)
    or (p_class_id is not null and exists(
      select 1 from public.classes c join public.class_teacher_assignments cta on cta.class_id=c.id
      where c.id=p_class_id and c.school_id=p_school_id and coalesce(c.is_active,true)
        and cta.teacher_user_id=auth.uid() and coalesce(cta.active,true)))
  );
$$;

create or replace function public.can_view_ielts_practice_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.ielts_practice_assignments a
    where a.id=p_assignment_id and public.school_has_module_access(a.school_id,'ielts') and (
      public.can_manage_ielts_practice_assignment(a.id)
      or exists(select 1 from public.ielts_practice_assignment_students s where s.assignment_id=a.id and s.student_id=auth.uid())
    )
  );
$$;

create or replace function public.can_monitor_ielts_exam(p_exam_event_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.ielts_exam_events e
    where e.id=p_exam_event_id and public.school_has_module_access(e.school_id,'ielts') and (
      public.can_manage_ielts_exam(e.id)
      or exists(
        select 1 from public.ielts_exam_assignments a
        join public.class_teacher_assignments cta on cta.class_id=a.class_id
        where a.exam_event_id=e.id and a.school_id=e.school_id and a.class_id is not null
          and cta.teacher_user_id=auth.uid() and coalesce(cta.active,true)))
  );
$$;

create or replace function public.ielts_exam_actor_can_control(p_exam_event_id uuid,p_school_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_school_id is not null and public.school_has_module_access(p_school_id,'ielts') and (
    public.can_manage_ielts_exam(p_exam_event_id)
    or exists(
      select 1 from public.ielts_exam_assignments a
      join public.classes c on c.id=a.class_id and c.school_id=p_school_id and coalesce(c.is_active,true)
      join public.class_teacher_assignments cta on cta.class_id=c.id and cta.school_id=p_school_id
        and cta.teacher_user_id=auth.uid() and coalesce(cta.active,true)
      join public.school_members sm on sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active'
        and sm.role_in_school='teacher'
      where a.exam_event_id=p_exam_event_id and a.school_id=p_school_id and a.status<>'void')
  );
$$;

create or replace function private.ielts_can_access_practice_content(
  p_content_type text,p_content_id text,p_is_active boolean,p_required_tier text,p_access_context jsonb
)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id bigint; v_context jsonb; v_school_id uuid;
begin
  if v_actor is null or p_content_id is null or p_content_id!~'^[0-9]+$' then return false; end if;
  begin v_id:=p_content_id::bigint; exception when numeric_value_out_of_range then return false; end;
  if p_content_type not in ('ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') then return false; end if;
  v_context:=coalesce(p_access_context,private.ielts_extra_practice_access_context());
  v_school_id:=nullif(v_context->>'school_id','')::uuid;
  if v_school_id is not null and not public.school_has_module_access(v_school_id,'ielts')
     and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  if coalesce((v_context->>'is_staff')::boolean,false) then return true; end if;
  if p_is_active is not true then return false; end if;
  if private.ielts_content_is_assigned_to_current_user(p_content_type,p_content_id) then return true; end if;
  if not coalesce((v_context->>'resolved')::boolean,false) or not coalesce((v_context->>'enabled')::boolean,false) then return false; end if;
  if coalesce(p_required_tier,'free')<>'free' and not public.ielts_user_has_prime_access(v_actor) then return false; end if;
  return true;
end;
$$;

create or replace function private.ielts_exam_event_school(p_exam_event_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select e.school_id from public.ielts_exam_events e where e.id=p_exam_event_id limit 1;
$$;
create or replace function private.ielts_exam_assignment_school(p_assignment_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select a.school_id from public.ielts_exam_assignments a where a.id=p_assignment_id limit 1;
$$;
create or replace function private.ielts_exam_attempt_school(p_attempt_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select e.school_id from public.ielts_exam_attempts a
  join public.ielts_exam_events e on e.id=a.exam_event_id where a.id=p_attempt_id limit 1;
$$;
create or replace function private.ielts_practice_assignment_school(p_assignment_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select a.school_id from public.ielts_practice_assignments a where a.id=p_assignment_id limit 1;
$$;
revoke all on function private.ielts_exam_event_school(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ielts_exam_assignment_school(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ielts_exam_attempt_school(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ielts_practice_assignment_school(uuid) from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.rpc_ielts_exam_whoami_entitlement_internal(uuid)') is null then
    alter function public.rpc_ielts_exam_whoami(uuid) rename to rpc_ielts_exam_whoami_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_start_attempt_entitlement_internal(uuid)') is null then
    alter function public.rpc_ielts_start_attempt(uuid) rename to rpc_ielts_start_attempt_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_autosave_attempt_entitlement_internal(uuid,text,text,jsonb,integer,timestamptz)') is null then
    alter function public.rpc_ielts_autosave_attempt(uuid,text,text,jsonb,integer,timestamptz)
      rename to rpc_ielts_autosave_attempt_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_submit_attempt_entitlement_internal(uuid,text,jsonb,text)') is null then
    alter function public.rpc_ielts_submit_attempt(uuid,text,jsonb,text)
      rename to rpc_ielts_submit_attempt_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_log_incident_entitlement_internal(uuid,text,text,text,jsonb)') is null then
    alter function public.rpc_ielts_log_incident(uuid,text,text,text,jsonb)
      rename to rpc_ielts_log_incident_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_practice_student_assignments_entitlement_internal()') is null then
    alter function public.rpc_ielts_practice_student_assignments()
      rename to rpc_ielts_practice_student_assignments_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_practice_assignment_progress_entitlement_internal(uuid,uuid)') is null then
    alter function public.rpc_ielts_practice_assignment_progress(uuid,uuid)
      rename to rpc_ielts_practice_assignment_progress_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_school_results_entitlement_internal(uuid,uuid,uuid,integer)') is null then
    alter function public.rpc_ielts_school_results(uuid,uuid,uuid,integer)
      rename to rpc_ielts_school_results_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_school_student_snapshot_entitlement_internal(uuid)') is null then
    alter function public.rpc_ielts_school_student_snapshot(uuid)
      rename to rpc_ielts_school_student_snapshot_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_ielts_student_journey_entitlement_internal(uuid)') is null then
    alter function public.rpc_ielts_student_journey(uuid)
      rename to rpc_ielts_student_journey_entitlement_internal;
  end if;
end $$;

revoke all on function public.rpc_ielts_exam_whoami_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_start_attempt_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_autosave_attempt_entitlement_internal(uuid,text,text,jsonb,integer,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_submit_attempt_entitlement_internal(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_log_incident_entitlement_internal(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_practice_student_assignments_entitlement_internal() from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_practice_assignment_progress_entitlement_internal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_school_results_entitlement_internal(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_school_student_snapshot_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_student_journey_entitlement_internal(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_ielts_exam_whoami(p_exam_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.ielts_exam_event_school(p_exam_event_id),'ielts',false) then
    return jsonb_build_object('allowed',false,'reason','ielts_not_in_school_agreement','server_now',now());
  end if;
  return public.rpc_ielts_exam_whoami_entitlement_internal(p_exam_event_id);
end; $$;

create or replace function public.rpc_ielts_start_attempt(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.ielts_exam_assignment_school(p_assignment_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_start_attempt_entitlement_internal(p_assignment_id);
end; $$;

create or replace function public.rpc_ielts_autosave_attempt(
  p_attempt_id uuid,p_lock_token text,p_section text,p_payload jsonb,
  p_draft_version integer,p_client_saved_at timestamptz
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.ielts_exam_attempt_school(p_attempt_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_autosave_attempt_entitlement_internal(
    p_attempt_id,p_lock_token,p_section,p_payload,p_draft_version,p_client_saved_at);
end; $$;

create or replace function public.rpc_ielts_submit_attempt(
  p_attempt_id uuid,p_lock_token text,p_payload jsonb,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.ielts_exam_attempt_school(p_attempt_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_submit_attempt_entitlement_internal(
    p_attempt_id,p_lock_token,p_payload,p_idempotency_key);
end; $$;

create or replace function public.rpc_ielts_log_incident(
  p_attempt_id uuid,p_lock_token text,p_incident_type text,p_severity text,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.ielts_exam_attempt_school(p_attempt_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_log_incident_entitlement_internal(
    p_attempt_id,p_lock_token,p_incident_type,p_severity,p_payload);
end; $$;

create or replace function public.rpc_ielts_practice_student_assignments()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_has_programme_access('ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_practice_student_assignments_entitlement_internal();
end; $$;

create or replace function public.rpc_ielts_practice_assignment_progress(p_assignment_id uuid,p_student_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.ielts_practice_assignment_school(p_assignment_id),'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_practice_assignment_progress_entitlement_internal(p_assignment_id,p_student_id);
end; $$;

create or replace function public.rpc_ielts_school_results(
  p_school_id uuid default null,p_class_id uuid default null,p_student_id uuid default null,p_limit integer default 100
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=coalesce(p_school_id,(select u.school_id from public.users u where u.id=auth.uid()),
  (select u.school_id from public.users u where u.id=p_student_id));
begin
  if not private.actor_can_access_school_programme(v_school_id,'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_school_results_entitlement_internal(v_school_id,p_class_id,p_student_id,p_limit);
end; $$;

create or replace function public.rpc_ielts_school_student_snapshot(p_student_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=(select u.school_id from public.users u where u.id=p_student_id);
begin
  if not private.actor_can_access_school_programme(v_school_id,'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_school_student_snapshot_entitlement_internal(p_student_id);
end; $$;

create or replace function public.rpc_ielts_student_journey(p_student_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=(select u.school_id from public.users u where u.id=p_student_id);
begin
  if not private.actor_can_access_school_programme(v_school_id,'ielts',false) then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  return public.rpc_ielts_student_journey_entitlement_internal(p_student_id);
end; $$;

revoke all on function public.rpc_ielts_exam_whoami(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_start_attempt(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_autosave_attempt(uuid,text,text,jsonb,integer,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_submit_attempt(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_log_incident(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_practice_student_assignments() from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_practice_assignment_progress(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_school_results(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_school_student_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_student_journey(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_exam_whoami(uuid) to authenticated;
grant execute on function public.rpc_ielts_start_attempt(uuid) to authenticated;
grant execute on function public.rpc_ielts_autosave_attempt(uuid,text,text,jsonb,integer,timestamptz) to authenticated;
grant execute on function public.rpc_ielts_submit_attempt(uuid,text,jsonb,text) to authenticated;
grant execute on function public.rpc_ielts_log_incident(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.rpc_ielts_practice_student_assignments() to authenticated;
grant execute on function public.rpc_ielts_practice_assignment_progress(uuid,uuid) to authenticated;
grant execute on function public.rpc_ielts_school_results(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.rpc_ielts_school_student_snapshot(uuid) to authenticated;
grant execute on function public.rpc_ielts_student_journey(uuid) to authenticated;

create or replace function private.enforce_ielts_module_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_school_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'anon' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_school_id:=nullif(v_row->>'school_id','')::uuid;
  if v_school_id is not null and not public.school_has_module_access(v_school_id,'ielts') then
    raise exception 'IELTS is not included in this school agreement' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_ielts_module_row() from public,anon,authenticated,service_role;

do $$
declare v_table text;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='school_id' and not a.attisdropped
    where n.nspname='public' and c.relkind='r' and c.relname like 'ielts_%'
  loop
    execute format('drop trigger if exists enforce_ielts_module_row on public.%I',v_table);
    execute format('create trigger enforce_ielts_module_row before insert or update or delete on public.%I for each row execute function private.enforce_ielts_module_row()',v_table);
  end loop;
end $$;

do $$
declare v_table text;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='school_id' and not a.attisdropped
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname like 'ielts_%'
  loop
    execute format('drop policy if exists school_ielts_module_required on public.%I',v_table);
    execute format('create policy school_ielts_module_required on public.%I as restrictive for all to anon,authenticated using (public.is_superadmin(auth.uid()) or school_id is null or public.school_has_module_access(school_id,''ielts'')) with check (public.is_superadmin(auth.uid()) or school_id is null or public.school_has_module_access(school_id,''ielts''))',v_table);
  end loop;
end $$;

-- Admission tables carrying a school_id must fail closed. Candidate token RPCs
-- still work during an active entitlement because school_has_module_access is
-- deliberately able to evaluate the row's school for anonymous candidates.
create or replace function private.admission_candidate_school(p_token text)
returns uuid language sql stable security definer set search_path='' as $$
  select c.school_id from public.adm_candidates c where c.token=p_token limit 1;
$$;
create or replace function private.admission_attempt_school(p_attempt_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select a.school_id from public.adm_attempts a where a.id=p_attempt_id limit 1;
$$;
create or replace function private.admission_form_school(p_form_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select f.school_id from public.adm_test_forms f where f.id=p_form_id limit 1;
$$;
create or replace function private.admission_blueprint_school(p_blueprint_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select b.school_id from public.adm_blueprints b where b.id=p_blueprint_id limit 1;
$$;
revoke all on function private.admission_candidate_school(text) from public,anon,authenticated,service_role;
revoke all on function private.admission_attempt_school(uuid) from public,anon,authenticated,service_role;
revoke all on function private.admission_form_school(uuid) from public,anon,authenticated,service_role;
revoke all on function private.admission_blueprint_school(uuid) from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.rpc_adm_start_attempt_entitlement_internal(text,text)') is null then
    alter function public.rpc_adm_start_attempt(text,text) rename to rpc_adm_start_attempt_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_save_answer_entitlement_internal(text,uuid,uuid,jsonb)') is null then
    alter function public.rpc_adm_save_answer(text,uuid,uuid,jsonb) rename to rpc_adm_save_answer_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_submit_attempt_entitlement_internal_v1(text,uuid)') is null then
    alter function public.rpc_adm_submit_attempt(text,uuid) rename to rpc_adm_submit_attempt_entitlement_internal_v1;
  end if;
  if to_regprocedure('public.rpc_adm_submit_attempt_entitlement_internal_v2(text,uuid,text)') is null then
    alter function public.rpc_adm_submit_attempt(text,uuid,text) rename to rpc_adm_submit_attempt_entitlement_internal_v2;
  end if;
  if to_regprocedure('public.rpc_adm_log_attempt_event_entitlement_internal(text,text,uuid,text,jsonb)') is null then
    alter function public.rpc_adm_log_attempt_event(text,text,uuid,text,jsonb) rename to rpc_adm_log_attempt_event_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_generate_test_form_entitlement_internal(uuid,text)') is null then
    alter function public.rpc_adm_generate_test_form(uuid,text) rename to rpc_adm_generate_test_form_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_close_form_entitlement_internal(uuid)') is null then
    alter function public.rpc_adm_close_form(uuid) rename to rpc_adm_close_form_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_publish_form_entitlement_internal(uuid)') is null then
    alter function public.rpc_adm_publish_form(uuid) rename to rpc_adm_publish_form_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_get_attempt_activity_entitlement_internal(uuid)') is null then
    alter function public.rpc_adm_get_attempt_activity(uuid) rename to rpc_adm_get_attempt_activity_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_get_candidate_report_entitlement_internal(uuid)') is null then
    alter function public.rpc_adm_get_candidate_report(uuid) rename to rpc_adm_get_candidate_report_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_reset_attempt_for_retake_entitlement_internal(uuid,text)') is null then
    alter function public.rpc_adm_reset_attempt_for_retake(uuid,text) rename to rpc_adm_reset_attempt_for_retake_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_record_placement_entitlement_internal(uuid,text,smallint,smallint,text)') is null then
    alter function public.rpc_adm_record_placement(uuid,text,smallint,smallint,text) rename to rpc_adm_record_placement_entitlement_internal;
  end if;
  if to_regprocedure('public.rpc_adm_consume_quota_entitlement_internal(uuid)') is null then
    alter function public.rpc_adm_consume_quota(uuid) rename to rpc_adm_consume_quota_entitlement_internal;
  end if;
end $$;

revoke all on function public.rpc_adm_start_attempt_entitlement_internal(text,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_save_answer_entitlement_internal(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_submit_attempt_entitlement_internal_v1(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_submit_attempt_entitlement_internal_v2(text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_log_attempt_event_entitlement_internal(text,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_generate_test_form_entitlement_internal(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_close_form_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_publish_form_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_get_attempt_activity_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_get_candidate_report_entitlement_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_reset_attempt_for_retake_entitlement_internal(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_record_placement_entitlement_internal(uuid,text,smallint,smallint,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_consume_quota_entitlement_internal(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_adm_start_attempt(p_token text,p_form_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=private.admission_candidate_school(p_token);
begin
  if v_school_id is null then return jsonb_build_object('success',false,'error','Invalid access token'); end if;
  if not public.school_has_module_access(v_school_id,'admissions') then
    return jsonb_build_object('success',false,'error','Admission Hub is not active for this school');
  end if;
  return public.rpc_adm_start_attempt_entitlement_internal(p_token,p_form_code);
end; $$;

create or replace function public.rpc_adm_save_answer(p_token text,p_attempt_id uuid,p_question_id uuid,p_response jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=private.admission_candidate_school(p_token);
begin
  if v_school_id is null then return jsonb_build_object('success',false,'error','Invalid token'); end if;
  if not public.school_has_module_access(v_school_id,'admissions') then
    return jsonb_build_object('success',false,'error','Admission Hub is not active for this school');
  end if;
  return public.rpc_adm_save_answer_entitlement_internal(p_token,p_attempt_id,p_question_id,p_response);
end; $$;

create or replace function public.rpc_adm_submit_attempt(p_token text,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=private.admission_candidate_school(p_token);
begin
  if v_school_id is null then return jsonb_build_object('success',false,'error','Invalid token'); end if;
  if not public.school_has_module_access(v_school_id,'admissions') then
    return jsonb_build_object('success',false,'error','Admission Hub is not active for this school');
  end if;
  return public.rpc_adm_submit_attempt_entitlement_internal_v1(p_token,p_attempt_id);
end; $$;

create or replace function public.rpc_adm_submit_attempt(p_token text,p_attempt_id uuid,p_auto_submit_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=private.admission_candidate_school(p_token);
begin
  if v_school_id is null then return jsonb_build_object('success',false,'error','Invalid token'); end if;
  if not public.school_has_module_access(v_school_id,'admissions') then
    return jsonb_build_object('success',false,'error','Admission Hub is not active for this school');
  end if;
  return public.rpc_adm_submit_attempt_entitlement_internal_v2(p_token,p_attempt_id,p_auto_submit_reason);
end; $$;

create or replace function public.rpc_adm_log_attempt_event(
  p_token text,p_form_code text,p_attempt_id uuid,p_event_type text,p_event_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=private.admission_candidate_school(p_token);
begin
  if v_school_id is null then return jsonb_build_object('success',false,'error','Invalid token'); end if;
  if not public.school_has_module_access(v_school_id,'admissions') then
    return jsonb_build_object('success',false,'error','Admission Hub is not active for this school');
  end if;
  return public.rpc_adm_log_attempt_event_entitlement_internal(p_token,p_form_code,p_attempt_id,p_event_type,p_event_payload);
end; $$;

create or replace function public.rpc_adm_generate_test_form(p_blueprint_id uuid,p_form_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=private.admission_blueprint_school(p_blueprint_id);
begin
  if not private.actor_can_access_school_programme(v_school_id,'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_generate_test_form_entitlement_internal(p_blueprint_id,p_form_code);
end; $$;

create or replace function public.rpc_adm_close_form(p_form_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.admission_form_school(p_form_id),'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_close_form_entitlement_internal(p_form_id);
end; $$;

create or replace function public.rpc_adm_publish_form(p_form_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.admission_form_school(p_form_id),'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_publish_form_entitlement_internal(p_form_id);
end; $$;

create or replace function public.rpc_adm_get_attempt_activity(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.admission_attempt_school(p_attempt_id),'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_get_attempt_activity_entitlement_internal(p_attempt_id);
end; $$;

create or replace function public.rpc_adm_get_candidate_report(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.admission_attempt_school(p_attempt_id),'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_get_candidate_report_entitlement_internal(p_attempt_id);
end; $$;

create or replace function public.rpc_adm_reset_attempt_for_retake(p_attempt_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.admission_attempt_school(p_attempt_id),'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_reset_attempt_for_retake_entitlement_internal(p_attempt_id,p_reason);
end; $$;

create or replace function public.rpc_adm_record_placement(
  p_attempt_id uuid,p_band text,p_recommended_grade smallint default null,
  p_recommended_stage smallint default null,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.actor_can_access_school_programme(private.admission_attempt_school(p_attempt_id),'admissions',false) then
    return jsonb_build_object('success',false,'error','Admission Hub is not included in this school agreement');
  end if;
  return public.rpc_adm_record_placement_entitlement_internal(
    p_attempt_id,p_band,p_recommended_grade,p_recommended_stage,p_notes);
end; $$;

create or replace function public.rpc_adm_consume_quota(p_school_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_school_id uuid:=coalesce(p_school_id,(select u.school_id from public.users u where u.id=auth.uid()));
begin
  if not private.actor_can_access_school_programme(v_school_id,'admissions',false) then
    raise exception 'Admission Hub is not included in this school agreement' using errcode='42501';
  end if;
  perform public.rpc_adm_consume_quota_entitlement_internal(v_school_id);
end; $$;

revoke all on function public.rpc_adm_start_attempt(text,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_save_answer(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_submit_attempt(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_submit_attempt(text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_log_attempt_event(text,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_adm_start_attempt(text,text) to anon,authenticated;
grant execute on function public.rpc_adm_save_answer(text,uuid,uuid,jsonb) to anon,authenticated;
grant execute on function public.rpc_adm_submit_attempt(text,uuid) to anon,authenticated;
grant execute on function public.rpc_adm_submit_attempt(text,uuid,text) to anon,authenticated;
grant execute on function public.rpc_adm_log_attempt_event(text,text,uuid,text,jsonb) to anon,authenticated;

revoke all on function public.rpc_adm_generate_test_form(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_close_form(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_publish_form(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_get_attempt_activity(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_get_candidate_report(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_reset_attempt_for_retake(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_record_placement(uuid,text,smallint,smallint,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_consume_quota(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_adm_generate_test_form(uuid,text) to authenticated;
grant execute on function public.rpc_adm_close_form(uuid) to authenticated;
grant execute on function public.rpc_adm_publish_form(uuid) to authenticated;
grant execute on function public.rpc_adm_get_attempt_activity(uuid) to authenticated;
grant execute on function public.rpc_adm_get_candidate_report(uuid) to authenticated;
grant execute on function public.rpc_adm_reset_attempt_for_retake(uuid,text) to authenticated;
grant execute on function public.rpc_adm_record_placement(uuid,text,smallint,smallint,text) to authenticated;
grant execute on function public.rpc_adm_consume_quota(uuid) to authenticated;

do $$
declare v_table text;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='school_id' and not a.attisdropped
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname like 'adm_%'
  loop
    execute format('drop policy if exists school_admissions_module_required on public.%I',v_table);
    execute format('create policy school_admissions_module_required on public.%I as restrictive for all to anon,authenticated using (public.is_superadmin(auth.uid()) or public.school_has_module_access(school_id,''admissions'')) with check (public.is_superadmin(auth.uid()) or public.school_has_module_access(school_id,''admissions''))',v_table);
  end loop;
end $$;

-- Legacy shortcuts are no longer browser-callable. Verified activation is only
-- admin_record_manual_school_subscription (or the payment-provider workflow),
-- both of which record exact module entitlements.
revoke all on function public.check_pilot_quota(text) from public,anon,authenticated,service_role;
revoke all on function public.consume_pilot_quota(text,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_school_pilot_quotas() from public,anon,authenticated,service_role;
revoke all on function public.rpc_adm_check_entitlement(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_school_plan_details(uuid) from public,anon,authenticated,service_role;
grant execute on function public.check_pilot_quota(text) to authenticated;
grant execute on function public.consume_pilot_quota(text,integer) to authenticated;
grant execute on function public.get_school_pilot_quotas() to authenticated;
grant execute on function public.rpc_adm_check_entitlement(uuid) to authenticated;
grant execute on function public.get_school_plan_details(uuid) to authenticated;

revoke all on function public.get_school_cambridge_scores(integer) from public,anon,authenticated,service_role;
revoke all on function public.get_school_cambridge_stats() from public,anon,authenticated,service_role;
revoke all on function public.get_my_cambridge_exam_identity() from public,anon,authenticated,service_role;
revoke all on function public.get_visible_cambridge_tests_for_student(integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_teacher_cambridge_test_catalog() from public,anon,authenticated,service_role;
revoke all on function public.get_my_cambridge_attempt_state(text,text) from public,anon,authenticated,service_role;
revoke all on function public.is_cambridge_test_visible_to_student(text,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_school_cambridge_scores(integer) to authenticated;
grant execute on function public.get_school_cambridge_stats() to authenticated;
grant execute on function public.get_my_cambridge_exam_identity() to authenticated;
grant execute on function public.get_visible_cambridge_tests_for_student(integer,uuid) to authenticated;
grant execute on function public.get_teacher_cambridge_test_catalog() to authenticated;
grant execute on function public.get_my_cambridge_attempt_state(text,text) to authenticated;
grant execute on function public.is_cambridge_test_visible_to_student(text,integer,uuid,text) to authenticated;

revoke all on function public.bh_writing_allowed_students() from public,anon,authenticated,service_role;
revoke all on function public.bh_writing_authorized_english_classes() from public,anon,authenticated,service_role;
revoke all on function public.can_access_bh_writing_student(uuid) from public,anon,authenticated,service_role;
grant execute on function public.bh_writing_allowed_students() to authenticated;
grant execute on function public.bh_writing_authorized_english_classes() to authenticated;
grant execute on function public.can_access_bh_writing_student(uuid) to authenticated;

revoke all on function public.can_manage_ielts_practice_school(uuid) from public,anon,authenticated,service_role;
revoke all on function public.can_manage_ielts_practice_class(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.can_view_ielts_practice_assignment(uuid) from public,anon,authenticated,service_role;
revoke all on function public.can_monitor_ielts_exam(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ielts_exam_actor_can_control(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_manage_ielts_practice_school(uuid) to authenticated;
grant execute on function public.can_manage_ielts_practice_class(uuid,uuid) to authenticated;
grant execute on function public.can_view_ielts_practice_assignment(uuid) to authenticated;
grant execute on function public.can_monitor_ielts_exam(uuid) to authenticated;
grant execute on function public.ielts_exam_actor_can_control(uuid,uuid) to authenticated;

revoke all on function public.admin_set_school_plan(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.admin_extend_pilot_trial(uuid,integer) from public,anon,authenticated,service_role;

comment on function public.consume_pilot_quota(text,integer) is
  'Records pilot usage without limiting access. Programme access remains active until the exact 30-day pilot end timestamp.';
comment on function private.actor_has_programme_access(text,boolean) is
  'Canonical actor-level school programme gate. Independent product access is allowed only when explicitly requested by the caller.';
