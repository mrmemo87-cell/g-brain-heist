-- Phase 7: intervention intelligence driven by trusted longitudinal learning history.

create table if not exists public.student_learning_interventions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  skill_key text not null,
  skill text not null,
  topic text,
  intervention_type text not null check (intervention_type in ('targeted_question_practice','writing_practice','reassessment','teacher_support','custom')),
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  rationale text not null,
  goal text not null,
  baseline_status text not null,
  baseline_evidence_items integer not null default 0,
  baseline_last_observed_at timestamptz,
  target_date date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  outcome_status text check (outcome_status is null or outcome_status in ('improved','resolved','no_change','needs_more_support')),
  outcome_note text,
  updated_at timestamptz not null default now()
);

create unique index if not exists student_learning_interventions_open_skill_uidx
  on public.student_learning_interventions(student_id,skill_key)
  where status in ('planned','active');
create index if not exists student_learning_interventions_school_status_idx on public.student_learning_interventions(school_id,status,created_at desc);
create index if not exists student_learning_interventions_student_idx on public.student_learning_interventions(student_id,created_at desc);

create table if not exists public.student_learning_intervention_events (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.student_learning_interventions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created','started','note','completed','cancelled')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists student_learning_intervention_events_intervention_idx on public.student_learning_intervention_events(intervention_id,created_at desc);

alter table public.student_learning_interventions enable row level security;
alter table public.student_learning_intervention_events enable row level security;
revoke all on table public.student_learning_interventions from public, anon, authenticated;
revoke all on table public.student_learning_intervention_events from public, anon, authenticated;
grant select,insert,update,delete on table public.student_learning_interventions to service_role;
grant select,insert,update,delete on table public.student_learning_intervention_events to service_role;

create or replace function public.student_learning_can_manage_intervention(p_student_id uuid,p_subject text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.users u
    join public.school_members sm on sm.school_id=u.school_id and sm.user_id=(select auth.uid()) and sm.status='active' and sm.role_in_school='school_admin'
    where u.id=p_student_id
  ) or exists(
    select 1
    from public.class_students cs
    join public.classes c on c.id=cs.class_id
    join public.class_teacher_assignments cta on cta.class_id=cs.class_id and cta.school_id=c.school_id and cta.teacher_user_id=(select auth.uid()) and cta.active is true
    where cs.student_id=p_student_id and lower(trim(cta.subject))=lower(trim(p_subject))
  );
$$;
revoke all on function public.student_learning_can_manage_intervention(uuid,text) from public, anon, authenticated;
grant execute on function public.student_learning_can_manage_intervention(uuid,text) to authenticated,service_role;

create or replace function public.rpc_teacher_student_intervention_intelligence(p_student_id uuid,p_subject text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_teacher_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select school_id into v_school_id from public.users where id=p_student_id;
  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  if p_subject is not null then
    if not public.student_learning_can_manage_intervention(p_student_id,p_subject) then raise exception 'Not authorised for this student and subject'; end if;
  elsif not exists(
    select 1 from public.school_members sm where sm.school_id=v_school_id and sm.user_id=v_caller and sm.status='active' and sm.role_in_school='school_admin'
  ) and not exists(
    select 1 from public.class_students cs join public.class_teacher_assignments cta on cta.class_id=cs.class_id and cta.school_id=v_school_id and cta.teacher_user_id=v_caller and cta.active is true where cs.student_id=p_student_id
  ) then raise exception 'Not authorised for this student'; end if;

  select id into v_teacher_id from public.teachers where user_id=v_caller limit 1;

  with allowed_subjects as (
    select distinct lower(trim(cta.subject)) subject
    from public.class_students cs join public.class_teacher_assignments cta on cta.class_id=cs.class_id and cta.school_id=v_school_id and cta.teacher_user_id=v_caller and cta.active is true
    where cs.student_id=p_student_id
  ),
  focus as (
    select f.*,
      greatest(0,(current_date-f.last_observed_at::date))::integer as days_since_evidence,
      (
        select count(*)::integer from public.questions q
        where coalesce(q.is_active,true)=true
          and (coalesce(q.is_public,false)=true or q.teacher_id=v_teacher_id)
          and lower(trim(coalesce(q.subject,q.subject_id,'')))=lower(trim(f.subject))
          and (
            lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(coalesce(f.topic,f.skill)))
            or lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(f.skill))
            or exists(select 1 from unnest(coalesce(q.tags,array[]::text[])) tag where lower(tag)=lower('skill:'||f.skill) or lower(tag)=lower('subskill:'||coalesce(f.subskill,'')))
          )
      ) available_questions
    from public.student_learning_focus_states f
    where f.school_id=v_school_id and f.student_id=p_student_id
      and f.current_status in('new_focus','recurring','persistent','improving')
      and (p_subject is null or lower(trim(f.subject))=lower(trim(p_subject)))
      and (
        exists(select 1 from public.school_members sm where sm.school_id=v_school_id and sm.user_id=v_caller and sm.status='active' and sm.role_in_school='school_admin')
        or lower(trim(f.subject)) in(select subject from allowed_subjects)
      )
  ),
  recommendations as (
    select f.*,
      case
        when f.days_since_evidence>=60 then 'reassessment'
        when lower(f.subject)='english' and lower(coalesce(f.topic,'')) like 'writing%' then 'writing_practice'
        when f.available_questions>=5 then 'targeted_question_practice'
        else 'teacher_support'
      end recommended_type,
      case
        when f.days_since_evidence>=60 then format('%s was previously identified as %s, but the latest qualifying evidence is %s days old. Reassess before assuming the difficulty is still current.',f.skill,replace(f.current_status,'_',' '),f.days_since_evidence)
        when f.current_status='persistent' then format('%s remains a persistent focus area across %s qualifying evidence items. The latest evidence was recorded on %s.',f.skill,f.evidence_items,to_char(f.last_observed_at,'DD Mon YYYY'))
        when f.current_status='recurring' then format('%s has recurred across %s qualifying evidence items and should be reinforced before it becomes persistent.',f.skill,f.evidence_items)
        when f.current_status='improving' then format('%s is improving. Reinforce the successful approach and continue monitoring before closing the focus area.',f.skill)
        else format('%s is a newly detected focus area. Use targeted practice and gather more evidence before labelling it persistent.',f.skill)
      end rationale,
      case
        when f.days_since_evidence>=60 then format('Collect fresh evidence for %s and confirm whether targeted support is still required.',f.skill)
        when f.current_status='persistent' then format('Move %s from persistent to improving through repeated successful evidence.',f.skill)
        when f.current_status='recurring' then format('Achieve consistent successful evidence in %s across the next assessed tasks.',f.skill)
        else format('Strengthen %s while monitoring the next assessed tasks.',f.skill)
      end suggested_goal
    from focus f
  )
  select jsonb_build_object(
    'student',jsonb_build_object(
      'id',u.id,'name',coalesce(nullif(trim(u.full_name),''),u.username),'grade',u.grade,'class_name',u.batch,'school_id',u.school_id
    ),
    'recommendations',coalesce((select jsonb_agg(jsonb_build_object(
      'subject',r.subject,'topic',r.topic,'skill',r.skill,'skill_key',r.skill_key,'status',r.current_status,'trend',r.trend,'priority',r.priority,
      'evidence_items',r.evidence_items,'focus_occurrences',r.focus_occurrences,'last_observed_at',r.last_observed_at,'days_since_evidence',r.days_since_evidence,
      'available_questions',r.available_questions,'recommended_type',r.recommended_type,'rationale',r.rationale,'suggested_goal',r.suggested_goal,
      'has_open_intervention',exists(select 1 from public.student_learning_interventions i where i.student_id=p_student_id and i.skill_key=r.skill_key and i.status in('planned','active'))
    ) order by case r.priority when 'high' then 1 when 'medium' then 2 else 3 end,r.days_since_evidence desc,r.skill) from recommendations r),'[]'::jsonb),
    'interventions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'subject',i.subject,'skill',i.skill,'skill_key',i.skill_key,'topic',i.topic,'intervention_type',i.intervention_type,'status',i.status,
      'rationale',i.rationale,'goal',i.goal,'baseline_status',i.baseline_status,'baseline_evidence_items',i.baseline_evidence_items,
      'baseline_last_observed_at',i.baseline_last_observed_at,'target_date',i.target_date,'created_at',i.created_at,'started_at',i.started_at,
      'completed_at',i.completed_at,'outcome_status',i.outcome_status,'outcome_note',i.outcome_note
    ) order by case i.status when 'active' then 1 when 'planned' then 2 else 3 end,i.created_at desc)
      from public.student_learning_interventions i where i.school_id=v_school_id and i.student_id=p_student_id and (p_subject is null or lower(i.subject)=lower(p_subject))),'[]'::jsonb)
  ) into v_result
  from public.users u where u.id=p_student_id;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.rpc_teacher_student_intervention_intelligence(uuid,text) from public, anon, authenticated;
grant execute on function public.rpc_teacher_student_intervention_intelligence(uuid,text) to authenticated,service_role;

create or replace function public.rpc_teacher_create_learning_intervention(
  p_student_id uuid,
  p_skill_key text,
  p_intervention_type text,
  p_goal text default null,
  p_target_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_focus public.student_learning_focus_states%rowtype;
  v_id uuid;
  v_rationale text;
  v_goal text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_focus from public.student_learning_focus_states where student_id=p_student_id and skill_key=p_skill_key;
  if v_focus.student_id is null then raise exception 'Learning focus area not found'; end if;
  if not public.student_learning_can_manage_intervention(p_student_id,v_focus.subject) then raise exception 'Not authorised for this student and subject'; end if;
  if p_intervention_type not in('targeted_question_practice','writing_practice','reassessment','teacher_support','custom') then raise exception 'Invalid intervention type'; end if;

  v_rationale := case
    when (current_date-v_focus.last_observed_at::date)>=60 then format('%s needs fresh evidence before its previous %s status is treated as current.',v_focus.skill,replace(v_focus.current_status,'_',' '))
    when v_focus.current_status='persistent' then format('%s remains persistent across %s qualifying evidence items.',v_focus.skill,v_focus.evidence_items)
    else format('%s is currently classified as %s across %s qualifying evidence items.',v_focus.skill,replace(v_focus.current_status,'_',' '),v_focus.evidence_items)
  end;
  v_goal := coalesce(nullif(trim(p_goal),''),format('Generate repeated successful evidence in %s and move the focus area toward improvement or resolution.',v_focus.skill));

  insert into public.student_learning_interventions(
    school_id,student_id,subject,skill_key,skill,topic,intervention_type,status,rationale,goal,
    baseline_status,baseline_evidence_items,baseline_last_observed_at,target_date,created_by
  ) values(
    v_focus.school_id,p_student_id,v_focus.subject,v_focus.skill_key,v_focus.skill,v_focus.topic,p_intervention_type,'planned',v_rationale,v_goal,
    v_focus.current_status,v_focus.evidence_items,v_focus.last_observed_at,p_target_date,v_caller
  ) returning id into v_id;

  insert into public.student_learning_intervention_events(intervention_id,actor_user_id,event_type,note)
  values(v_id,v_caller,'created',v_rationale);
  return v_id;
exception when unique_violation then
  raise exception 'An open intervention already exists for this student and focus area';
end;
$$;
revoke all on function public.rpc_teacher_create_learning_intervention(uuid,text,text,text,date) from public, anon, authenticated;
grant execute on function public.rpc_teacher_create_learning_intervention(uuid,text,text,text,date) to authenticated,service_role;

create or replace function public.rpc_teacher_update_learning_intervention(
  p_intervention_id uuid,
  p_action text,
  p_note text default null,
  p_outcome_status text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_i public.student_learning_interventions%rowtype;
  v_event text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_i from public.student_learning_interventions where id=p_intervention_id for update;
  if v_i.id is null then return false; end if;
  if not public.student_learning_can_manage_intervention(v_i.student_id,v_i.subject) then raise exception 'Not authorised for this intervention'; end if;

  if p_action='start' then
    if v_i.status<>'planned' then raise exception 'Only planned interventions can be started'; end if;
    update public.student_learning_interventions set status='active',started_at=now(),updated_at=now() where id=v_i.id; v_event:='started';
  elsif p_action='complete' then
    if v_i.status not in('planned','active') then raise exception 'Intervention is not open'; end if;
    if p_outcome_status not in('improved','resolved','no_change','needs_more_support') then raise exception 'Outcome status is required'; end if;
    update public.student_learning_interventions set status='completed',completed_at=now(),outcome_status=p_outcome_status,outcome_note=nullif(trim(p_note),''),updated_at=now() where id=v_i.id; v_event:='completed';
  elsif p_action='cancel' then
    if v_i.status not in('planned','active') then raise exception 'Intervention is not open'; end if;
    update public.student_learning_interventions set status='cancelled',cancelled_at=now(),outcome_note=nullif(trim(p_note),''),updated_at=now() where id=v_i.id; v_event:='cancelled';
  elsif p_action='note' then
    if nullif(trim(p_note),'') is null then raise exception 'Note is required'; end if;
    update public.student_learning_interventions set updated_at=now() where id=v_i.id; v_event:='note';
  else raise exception 'Invalid intervention action'; end if;

  insert into public.student_learning_intervention_events(intervention_id,actor_user_id,event_type,note)
  values(v_i.id,v_caller,v_event,nullif(trim(p_note),''));
  return true;
end;
$$;
revoke all on function public.rpc_teacher_update_learning_intervention(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.rpc_teacher_update_learning_intervention(uuid,text,text,text) to authenticated,service_role;
