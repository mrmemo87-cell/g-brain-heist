
create table if not exists private.assignment_logical_groups (
  id uuid primary key default extensions.gen_random_uuid(),
  group_key text not null unique,
  canonical_assignment_id uuid not null unique references public.assignments(id) on delete restrict,
  target_subject_group_id uuid references public.school_subject_groups(id) on delete restrict,
  display_subject_name text,
  display_group_name text,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists private.assignment_logical_group_members (
  logical_group_id uuid not null references private.assignment_logical_groups(id) on delete cascade,
  assignment_id uuid not null unique references public.assignments(id) on delete restrict,
  primary key (logical_group_id, assignment_id)
);

create index if not exists assignment_logical_group_members_group_idx
  on private.assignment_logical_group_members(logical_group_id);

create or replace function private.assignment_logical_canonical_id(p_assignment_id uuid)
returns uuid
language sql stable security definer set search_path=''
as $function$
  select coalesce((
    select g.canonical_assignment_id
    from private.assignment_logical_group_members m
    join private.assignment_logical_groups g on g.id=m.logical_group_id
    where m.assignment_id=p_assignment_id limit 1
  ),p_assignment_id);
$function$;

create or replace function private.assignment_logical_member_ids(p_assignment_id uuid)
returns uuid[]
language sql stable security definer set search_path=''
as $function$
  select coalesce((
    select array_agg(m2.assignment_id order by (m2.assignment_id=g.canonical_assignment_id) desc,m2.assignment_id)
    from private.assignment_logical_group_members m
    join private.assignment_logical_groups g on g.id=m.logical_group_id
    join private.assignment_logical_group_members m2 on m2.logical_group_id=g.id
    where m.assignment_id=p_assignment_id
    group by g.id,g.canonical_assignment_id
  ),array[p_assignment_id]);
$function$;

revoke all on function private.assignment_logical_canonical_id(uuid) from public,anon,authenticated;
revoke all on function private.assignment_logical_member_ids(uuid) from public,anon,authenticated;

insert into private.assignment_logical_groups(
  group_key,canonical_assignment_id,target_subject_group_id,display_subject_name,display_group_name,reason
)
values(
  'repair:stars:grade7-esl:quick-diagnostic:2026-09-29',
  'd81ca5f4-fc84-446e-9af7-751374fdd8c4',
  '4fd55ce0-8b26-40b5-a7bc-59892cd6adca',
  'ESL','Grade 7 ESL',
  'Consolidate three same-session class workaround assignments into one logical Grade 7 ESL assignment without rewriting completed evidence.'
)
on conflict(group_key) do update
set canonical_assignment_id=excluded.canonical_assignment_id,
    target_subject_group_id=excluded.target_subject_group_id,
    display_subject_name=excluded.display_subject_name,
    display_group_name=excluded.display_group_name,
    reason=excluded.reason;

insert into private.assignment_logical_group_members(logical_group_id,assignment_id)
select g.id,x.assignment_id
from private.assignment_logical_groups g
cross join unnest(array[
  'd81ca5f4-fc84-446e-9af7-751374fdd8c4'::uuid,
  '062cddc7-6d48-412c-a2e2-992503c0a9f9'::uuid,
  '45181713-11bc-49a4-8d58-bdbac91f62d6'::uuid
]) x(assignment_id)
where g.group_key='repair:stars:grade7-esl:quick-diagnostic:2026-09-29'
on conflict(assignment_id) do update set logical_group_id=excluded.logical_group_id;

update public.assignments
set display_group_label=null
where id in (
  'd81ca5f4-fc84-446e-9af7-751374fdd8c4',
  '062cddc7-6d48-412c-a2e2-992503c0a9f9',
  '45181713-11bc-49a4-8d58-bdbac91f62d6'
);

create or replace function private.guard_logical_assignment_mutation()
returns trigger
language plpgsql security definer set search_path=''
as $function$
declare
  v_assignment_id uuid:=case when tg_op='DELETE' then old.id else new.id end;
begin
  if current_setting('app.logical_assignment_maintenance',true)='1' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if exists(select 1 from private.assignment_logical_group_members m where m.assignment_id=v_assignment_id) then
    raise exception using errcode='55000',
      message='This historical assignment is part of a consolidated logical assignment and is read-only.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

drop trigger if exists zz_guard_logical_assignment_mutation on public.assignments;
create trigger zz_guard_logical_assignment_mutation
before update or delete on public.assignments
for each row execute function private.guard_logical_assignment_mutation();

create or replace function public.rpc_get_assignments_for_teacher(p_teacher_id uuid)
returns table(
  id uuid,teacher_id uuid,subject_id text,subject_name text,topic_name text,batch text,
  difficulty text,title text,instructions text,assigned_at timestamptz,due_at timestamptz,
  created_at timestamptz,updated_at timestamptz,question_count integer,completed_count integer,
  student_count integer,assignment_mode text,description text,publish_status text,
  close_submissions_after_due boolean,notify_students_by_email boolean,published_at timestamptz,
  question_ids uuid[],student_ids uuid[]
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_teacher_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select t.user_id into v_teacher_user_id
  from public.teachers t where t.id=p_teacher_id and t.user_id=auth.uid();
  if v_teacher_user_id is null then raise exception 'Not authorized'; end if;

  return query
  select
    a.id,a.teacher_id,
    case when lg.id is not null then lower(coalesce(lg.display_subject_name,a.subject_name)) else a.subject_id end,
    coalesce(lg.display_subject_name,a.subject_name),a.topic_name,
    case when lg.id is not null then null else a.batch end,
    a.difficulty,a.title,a.instructions,
    case when lg.id is not null then
      (select min(x.assigned_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.assigned_at end,
    a.due_at,
    case when lg.id is not null then
      (select min(x.created_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.created_at end,
    case when lg.id is not null then
      (select max(x.updated_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.updated_at end,
    (select count(*)::int from public.assignment_questions aq where aq.assignment_id=a.id),
    (select count(*)::int from public.student_assignments sa
      where sa.assignment_id=any(private.assignment_logical_member_ids(a.id)) and sa.status='completed'),
    (select count(distinct sa.student_id)::int from public.student_assignments sa
      where sa.assignment_id=any(private.assignment_logical_member_ids(a.id))),
    case when lg.id is not null then 'custom' else coalesce(a.assignment_mode,'batch') end,
    a.description,a.publish_status,a.close_submissions_after_due,a.notify_students_by_email,a.published_at,
    (select coalesce(array_agg(aq.question_id order by aq.order_index),'{}'::uuid[])
       from public.assignment_questions aq where aq.assignment_id=a.id),
    (select coalesce(array_agg(distinct sa.student_id),'{}'::uuid[])
       from public.student_assignments sa where sa.assignment_id=any(private.assignment_logical_member_ids(a.id)))
  from public.assignments a
  join public.school_academic_years y on y.id=a.academic_year_id and y.school_id=a.school_id and y.status='current'
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  where a.teacher_id=p_teacher_id
    and not exists(
      select 1 from private.assignment_logical_group_members lm
      join private.assignment_logical_groups lgg on lgg.id=lm.logical_group_id
      where lm.assignment_id=a.id and lgg.canonical_assignment_id<>a.id
    )
    and (
      (
        lg.id is not null
        and exists(
          select 1 from public.school_subject_group_teachers gt
          join public.school_subject_groups g on g.id=gt.group_id and g.school_id=gt.school_id
          where gt.group_id=lg.target_subject_group_id and gt.teacher_user_id=v_teacher_user_id
            and gt.school_id=a.school_id and gt.active and g.status='active'
        )
      )
      or
      (
        lg.id is null and (
          (
            a.subject_group_id is not null
            and exists(
              select 1 from public.school_subject_group_teachers gt
              join public.school_subject_groups g on g.id=gt.group_id and g.school_id=gt.school_id
              where gt.group_id=a.subject_group_id and gt.teacher_user_id=v_teacher_user_id
                and gt.school_id=a.school_id and gt.active and g.status='active'
            )
          )
          or
          (
            a.subject_group_id is null and (
              (
                coalesce(a.assignment_mode,'batch')='batch' and a.class_id is not null
                and exists(
                  select 1 from public.class_teacher_assignments cta
                  join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
                  where cta.teacher_user_id=v_teacher_user_id and cta.school_id=a.school_id
                    and cta.class_id=a.class_id and cta.active
                    and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.subject_name)
                )
              )
              or
              (
                (coalesce(a.assignment_mode,'batch')='custom' or a.class_id is null or upper(trim(coalesce(a.batch,'')))='ALL')
                and exists(
                  select 1 from public.student_assignments sa
                  join public.class_students cs on cs.student_id=sa.student_id
                  join public.class_teacher_assignments cta
                    on cta.class_id=cs.class_id and cta.teacher_user_id=v_teacher_user_id
                   and cta.school_id=a.school_id and cta.active
                  join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
                  where sa.assignment_id=a.id
                    and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.subject_name)
                )
              )
            )
          )
        )
      )
    )
  order by 10 desc;
end;
$function$;

create or replace function public.rpc_get_assignments_for_teacher_for_year(p_teacher_id uuid,p_academic_year_id uuid)
returns table(
  id uuid,teacher_id uuid,subject_id text,subject_name text,topic_name text,batch text,
  difficulty text,title text,instructions text,assigned_at timestamptz,due_at timestamptz,
  created_at timestamptz,updated_at timestamptz,question_count integer,completed_count integer,
  student_count integer,assignment_mode text,description text,publish_status text,
  close_submissions_after_due boolean,notify_students_by_email boolean,published_at timestamptz,
  question_ids uuid[],student_ids uuid[]
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_teacher_user_id uuid;
  v_teacher_school_id uuid;
  v_year_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select t.user_id,u.school_id into v_teacher_user_id,v_teacher_school_id
  from public.teachers t join public.users u on u.id=t.user_id where t.id=p_teacher_id;
  if v_teacher_user_id is null or v_teacher_user_id<>auth.uid() then raise exception 'Not authorized'; end if;
  select y.school_id into v_year_school_id from public.school_academic_years y where y.id=p_academic_year_id;
  if v_year_school_id is null or v_year_school_id is distinct from v_teacher_school_id then
    raise exception 'Academic year is not available for this teacher';
  end if;

  return query
  select
    a.id,a.teacher_id,
    case when lg.id is not null then lower(coalesce(lg.display_subject_name,a.subject_name)) else a.subject_id end,
    coalesce(lg.display_subject_name,a.subject_name),a.topic_name,
    case when lg.id is not null then null else a.batch end,
    a.difficulty,a.title,a.instructions,
    case when lg.id is not null then
      (select min(x.assigned_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.assigned_at end,
    a.due_at,
    case when lg.id is not null then
      (select min(x.created_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.created_at end,
    case when lg.id is not null then
      (select max(x.updated_at) from public.assignments x where x.id=any(private.assignment_logical_member_ids(a.id)))
      else a.updated_at end,
    (select count(*)::int from public.assignment_questions aq where aq.assignment_id=a.id),
    (select count(*)::int from public.student_assignments sa
      where sa.assignment_id=any(private.assignment_logical_member_ids(a.id)) and sa.status='completed'),
    (select count(distinct sa.student_id)::int from public.student_assignments sa
      where sa.assignment_id=any(private.assignment_logical_member_ids(a.id))),
    case when lg.id is not null then 'custom' else coalesce(a.assignment_mode,'batch') end,
    a.description,a.publish_status,a.close_submissions_after_due,a.notify_students_by_email,a.published_at,
    (select coalesce(array_agg(aq.question_id order by aq.order_index),'{}'::uuid[])
       from public.assignment_questions aq where aq.assignment_id=a.id),
    (select coalesce(array_agg(distinct sa.student_id),'{}'::uuid[])
       from public.student_assignments sa where sa.assignment_id=any(private.assignment_logical_member_ids(a.id)))
  from public.assignments a
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  where a.teacher_id=p_teacher_id and a.academic_year_id=p_academic_year_id
    and not exists(
      select 1 from private.assignment_logical_group_members lm
      join private.assignment_logical_groups lgg on lgg.id=lm.logical_group_id
      where lm.assignment_id=a.id and lgg.canonical_assignment_id<>a.id
    )
  order by 10 desc;
end;
$function$;

create or replace function public.rpc_teacher_assignment_category_context(p_teacher_id uuid)
returns table(assignment_id uuid,assignment_category text,academic_year_id uuid,academic_term_id uuid,class_id uuid)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher_user_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select t.user_id into v_teacher_user_id from public.teachers t where t.id=p_teacher_id;
  if v_teacher_user_id is null or v_teacher_user_id<>v_actor then
    raise exception 'Teacher assignment context is not available';
  end if;
  return query
  select a.id,a.assignment_category,a.academic_year_id,a.academic_term_id,
         case when lg.id is not null then null::uuid else a.class_id end
  from public.assignments a
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  where a.teacher_id=p_teacher_id;
end;
$function$;

create or replace function public.rpc_teacher_assignment_group_context(p_teacher_id uuid)
returns table(assignment_id uuid,school_id uuid,school_subject_id uuid,subject_group_id uuid,subject_group_name text)
language plpgsql stable security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=v_actor) then
    raise exception using errcode='42501',message='teacher_assignment_access_denied';
  end if;
  return query
  select a.id,a.school_id,coalesce(target_o.school_subject_id,a.school_subject_id),
         coalesce(lg.target_subject_group_id,a.subject_group_id),
         coalesce(lg.display_group_name,a.subject_group_name_snapshot,g.name)::text
  from public.assignments a
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  left join public.school_subject_groups target_g on target_g.id=lg.target_subject_group_id
  left join public.school_subject_offerings target_o on target_o.id=target_g.school_subject_offering_id
  left join public.school_subject_groups g on g.id=a.subject_group_id
  where a.teacher_id=p_teacher_id;
end;
$function$;

create or replace function public.rpc_teacher_assignment_report(p_assignment_id uuid,p_teacher_id uuid)
returns table(
  student_id uuid,student_name text,batch text,historical_batch text,current_batch text,
  current_class_id uuid,current_placement_ambiguous boolean,score integer,correct integer,
  incorrect integer,accuracy integer,completed_at timestamptz
)
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher_user uuid;
  v_member_ids uuid[];
begin
  select t.user_id into v_teacher_user from public.teachers t where t.id=p_teacher_id;
  if v_actor is null or v_teacher_user is distinct from v_actor then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;
  if not exists(select 1 from public.assignments a where a.id=p_assignment_id and a.teacher_id=p_teacher_id) then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;
  v_member_ids:=private.assignment_logical_member_ids(p_assignment_id);

  return query
  select r.student_id,
    coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student')::text,
    coalesce(sa.batch,a.class_code_snapshot,a.batch)::text,
    coalesce(sa.batch,a.class_code_snapshot,a.batch)::text,
    case when cp.placement_count=1 then cp.class_code end::text,
    case when cp.placement_count=1 then cp.class_id end,
    coalesce(cp.placement_count,0)>1,r.score,r.correct,r.incorrect,r.accuracy,r.completed_at
  from public.student_assignment_results r
  join public.assignments a on a.id=r.assignment_id
  join public.users u on u.id=r.student_id
  left join public.student_assignments sa on sa.assignment_id=r.assignment_id and sa.student_id=r.student_id
  left join lateral(
    select count(*)::integer placement_count,(array_agg(c.id order by c.id))[1] class_id,
           (array_agg(c.class_code order by c.id))[1] class_code
    from public.class_students cs join public.classes c on c.id=cs.class_id
    where cs.student_id=r.student_id and c.school_id=a.school_id
  ) cp on true
  where r.assignment_id=any(v_member_ids)
    and not exists(
      select 1 from public.legacy_quarantined_assignment_students q
      where q.assignment_id=r.assignment_id and q.student_id=r.student_id
    )
  order by r.completed_at desc;
end;
$function$;

create or replace function public.rpc_get_assignment_student_answers(p_assignment_id uuid,p_teacher_id uuid,p_student_id uuid default null)
returns table(
  student_id uuid,student_name text,student_batch text,question_id uuid,question_text text,
  correct_answer text,student_answer text,is_correct boolean,time_taken_ms integer,
  answered_at timestamptz,explanation text
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_member_ids uuid[];
  v_canonical_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists(
    select 1 from public.assignments a join public.teachers t on t.id=a.teacher_id
    where a.id=p_assignment_id and a.teacher_id=p_teacher_id and t.user_id=auth.uid()
  ) then raise exception 'NOT_AUTHORIZED'; end if;
  v_member_ids:=private.assignment_logical_member_ids(p_assignment_id);
  v_canonical_id:=private.assignment_logical_canonical_id(p_assignment_id);

  return query
  select saa.student_id,u.username::text,u.batch::text,saa.question_id,saa.question_text,
         saa.correct_answer,saa.student_answer,saa.is_correct,saa.time_taken_ms,saa.answered_at,
         aq.question_snapshot->>'explanation'
  from public.student_assignment_answers saa
  join public.users u on u.id=saa.student_id
  join public.assignment_questions aq on aq.assignment_id=v_canonical_id and aq.question_id=saa.question_id
  where saa.assignment_id=any(v_member_ids) and (p_student_id is null or saa.student_id=p_student_id)
  order by u.username,aq.order_index;
end;
$function$;

create or replace function public.rpc_get_assignment_question_analysis(p_assignment_id uuid,p_teacher_id uuid)
returns table(
  question_id uuid,order_index integer,question_text text,correct_answer text,total_attempts integer,
  correct_count integer,incorrect_count integer,accuracy_percent integer,avg_time_ms integer,
  common_wrong_answers jsonb
)
language plpgsql security definer set search_path=''
as $function$
declare
  v_member_ids uuid[];
  v_canonical_id uuid;
begin
  perform public.ensure_teacher(p_teacher_id);
  if not exists(select 1 from public.assignments where id=p_assignment_id and teacher_id=p_teacher_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  v_member_ids:=private.assignment_logical_member_ids(p_assignment_id);
  v_canonical_id:=private.assignment_logical_canonical_id(p_assignment_id);

  return query
  select aq.question_id,aq.order_index,max(saa.question_text),max(saa.correct_answer),
    count(saa.*)::int,count(saa.*) filter(where saa.is_correct)::int,
    count(saa.*) filter(where not saa.is_correct)::int,
    case when count(saa.*)>0 then (count(saa.*) filter(where saa.is_correct)*100/count(saa.*))::int else 0 end,
    coalesce(avg(saa.time_taken_ms)::int,0),
    (
      select jsonb_agg(jsonb_build_object('answer',wrong_answer,'count',cnt))
      from (
        select saa2.student_answer wrong_answer,count(*) cnt
        from public.student_assignment_answers saa2
        where saa2.assignment_id=any(v_member_ids) and saa2.question_id=aq.question_id and not saa2.is_correct
        group by saa2.student_answer order by count(*) desc limit 3
      ) wrong
    )
  from public.assignment_questions aq
  left join public.student_assignment_answers saa
    on saa.assignment_id=any(v_member_ids) and saa.question_id=aq.question_id
  where aq.assignment_id=v_canonical_id
  group by aq.question_id,aq.order_index
  order by aq.order_index;
end;
$function$;

create or replace function public.rpc_teacher_assignment_diagnostic_intelligence(p_assignment_id uuid,p_teacher_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher_user_id uuid;
  v_assignment public.assignments;
  v_member_ids uuid[];
  v_canonical_id uuid;
  v_display_subject text;
begin
  if v_actor is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select t.user_id into v_teacher_user_id from public.teachers t where t.id=p_teacher_id;
  if v_teacher_user_id is null or v_teacher_user_id is distinct from v_actor then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;
  if not exists(select 1 from public.assignments a where a.id=p_assignment_id and a.teacher_id=p_teacher_id) then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;

  v_member_ids:=private.assignment_logical_member_ids(p_assignment_id);
  v_canonical_id:=private.assignment_logical_canonical_id(p_assignment_id);
  select a.* into v_assignment from public.assignments a where a.id=v_canonical_id;
  select coalesce(g.display_subject_name,v_assignment.subject_name) into v_display_subject
  from (select 1) seed left join private.assignment_logical_groups g on g.canonical_assignment_id=v_canonical_id;

  return (
    with focus_questions as (
      select aq.question_id,aq.order_index,dt.evidence_focus_code,dt.evidence_focus_name,
             dt.atomic_subskill_code skill_key,dt.atomic_subskill_name subskill_name,
             dt.primary_skill_code,dt.primary_skill_name
      from public.assignment_questions aq
      join public.verified_question_diagnostic_taxonomy dt
        on dt.id=aq.diagnostic_taxonomy_id and dt.taxonomy_hash=aq.diagnostic_taxonomy_hash
       and dt.question_content_hash=aq.question_content_hash
      where aq.assignment_id=v_canonical_id and aq.analytics_eligible_snapshot
        and aq.verification_status_snapshot='verified' and aq.pool_scope_snapshot in ('global','school')
        and dt.review_status='approved' and not dt.human_review_required
        and nullif(trim(dt.evidence_focus_code),'') is not null
        and nullif(trim(dt.evidence_focus_name),'') is not null
    ),
    focus_catalog as (
      select evidence_focus_code,max(evidence_focus_name) evidence_focus_name,max(skill_key) skill_key,
             max(subskill_name) subskill_name,max(primary_skill_code) primary_skill_code,
             max(primary_skill_name) primary_skill_name,min(order_index) first_order_index,
             count(distinct question_id)::integer question_count
      from focus_questions group by evidence_focus_code
    ),
    completed_answers as (
      select saa.student_id,saa.question_id,saa.is_correct,saa.time_taken_ms
      from public.student_assignment_answers saa
      join public.student_assignment_results sr
        on sr.assignment_id=saa.assignment_id and sr.student_id=saa.student_id
      where saa.assignment_id=any(v_member_ids) and saa.is_correct is not null
    ),
    class_focus as (
      select fc.evidence_focus_code,fc.evidence_focus_name,fc.skill_key,fc.subskill_name,
             fc.primary_skill_code,fc.primary_skill_name,fc.first_order_index,fc.question_count,
             count(ca.question_id)::integer attempts,
             count(ca.question_id) filter(where ca.is_correct)::integer correct_count,
             count(ca.question_id) filter(where not ca.is_correct)::integer incorrect_count,
             count(distinct ca.student_id)::integer students_answered,
             case when count(ca.question_id)>0
               then round((count(ca.question_id) filter(where ca.is_correct))::numeric*100/count(ca.question_id))::integer
               else null end accuracy_percent,
             case when count(ca.question_id)>0 then round(avg(coalesce(ca.time_taken_ms,0))/1000.0,1)
               else null end avg_time_seconds
      from focus_catalog fc
      left join focus_questions fq on fq.evidence_focus_code=fc.evidence_focus_code
      left join completed_answers ca on ca.question_id=fq.question_id
      group by fc.evidence_focus_code,fc.evidence_focus_name,fc.skill_key,fc.subskill_name,
               fc.primary_skill_code,fc.primary_skill_name,fc.first_order_index,fc.question_count
    ),
    audience as (
      select sa.student_id,
             coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student')::text student_name,
             max(sa.batch)::text batch,max(sr.completed_at) completed_at,max(sr.accuracy) assignment_accuracy
      from public.student_assignments sa
      join public.users u on u.id=sa.student_id
      left join public.student_assignment_results sr on sr.assignment_id=sa.assignment_id and sr.student_id=sa.student_id
      where sa.assignment_id=any(v_member_ids)
        and not exists(
          select 1 from public.legacy_quarantined_assignment_students q
          where q.assignment_id=sa.assignment_id and q.student_id=sa.student_id
        )
      group by sa.student_id,u.full_name,u.username
    ),
    student_focus as (
      select a.student_id,fc.evidence_focus_code,fc.evidence_focus_name,fc.skill_key,fc.subskill_name,
             fc.primary_skill_name,fc.first_order_index,fc.question_count,
             count(ca.question_id)::integer answered_questions,
             count(ca.question_id) filter(where ca.is_correct)::integer correct_count,
             count(ca.question_id) filter(where not ca.is_correct)::integer incorrect_count,
             case when count(ca.question_id)>0
               then round((count(ca.question_id) filter(where ca.is_correct))::numeric*100/count(ca.question_id))::integer
               else null end accuracy_percent
      from audience a cross join focus_catalog fc
      left join focus_questions fq on fq.evidence_focus_code=fc.evidence_focus_code
      left join completed_answers ca on ca.student_id=a.student_id and ca.question_id=fq.question_id
      group by a.student_id,fc.evidence_focus_code,fc.evidence_focus_name,fc.skill_key,
               fc.subskill_name,fc.primary_skill_name,fc.first_order_index,fc.question_count
    ),
    student_payload as (
      select a.student_id,a.student_name,a.batch,a.completed_at,a.assignment_accuracy,
             count(sf.evidence_focus_code) filter(where sf.answered_questions>0)::integer focus_signals_answered,
             count(sf.evidence_focus_code) filter(where sf.incorrect_count>0)::integer needs_check_count,
             count(sf.evidence_focus_code) filter(where sf.answered_questions>0 and sf.incorrect_count=0)::integer correct_signal_count,
             coalesce(jsonb_agg(jsonb_build_object(
               'evidenceFocusCode',sf.evidence_focus_code,'evidenceFocusName',sf.evidence_focus_name,
               'skillKey',sf.skill_key,'subskillName',sf.subskill_name,'primarySkillName',sf.primary_skill_name,
               'orderIndex',sf.first_order_index,'questionCount',sf.question_count,'answeredQuestions',sf.answered_questions,
               'correctCount',sf.correct_count,'incorrectCount',sf.incorrect_count,'accuracyPercent',sf.accuracy_percent,
               'signal',case when a.completed_at is null then 'not_completed'
                             when sf.answered_questions=0 then 'not_answered'
                             when sf.incorrect_count>0 then 'needs_check' else 'correct' end
             ) order by sf.first_order_index,sf.evidence_focus_name),'[]'::jsonb) focuses
      from audience a left join student_focus sf on sf.student_id=a.student_id
      group by a.student_id,a.student_name,a.batch,a.completed_at,a.assignment_accuracy
    )
    select jsonb_build_object(
      'success',true,
      'assignment',jsonb_build_object(
        'id',v_canonical_id,'title',coalesce(v_assignment.title,v_assignment.topic_name),
        'topicName',v_assignment.topic_name,'subjectName',v_display_subject,
        'studentCount',(select count(*) from audience),
        'completedStudents',(select count(*) from audience where completed_at is not null),
        'questionCount',(select count(*) from public.assignment_questions aq where aq.assignment_id=v_canonical_id),
        'focusQuestionCount',(select count(*) from focus_questions),'focusCount',(select count(*) from focus_catalog)
      ),
      'focuses',coalesce((
        select jsonb_agg(jsonb_build_object(
          'evidenceFocusCode',cf.evidence_focus_code,'evidenceFocusName',cf.evidence_focus_name,
          'skillKey',cf.skill_key,'subskillName',cf.subskill_name,'primarySkillCode',cf.primary_skill_code,
          'primarySkillName',cf.primary_skill_name,'orderIndex',cf.first_order_index,'questionCount',cf.question_count,
          'attempts',cf.attempts,'correctCount',cf.correct_count,'incorrectCount',cf.incorrect_count,
          'studentsAnswered',cf.students_answered,'accuracyPercent',cf.accuracy_percent,'avgTimeSeconds',cf.avg_time_seconds
        ) order by cf.first_order_index,cf.evidence_focus_name) from class_focus cf
      ),'[]'::jsonb),
      'students',coalesce((
        select jsonb_agg(jsonb_build_object(
          'studentId',sp.student_id,'studentName',sp.student_name,'batch',sp.batch,
          'completedAt',sp.completed_at,'assignmentAccuracy',sp.assignment_accuracy,
          'focusSignalsAnswered',sp.focus_signals_answered,'needsCheckCount',sp.needs_check_count,
          'correctSignalCount',sp.correct_signal_count,'focuses',sp.focuses
        ) order by lower(sp.student_name),sp.student_id) from student_payload sp
      ),'[]'::jsonb),
      'disclosure',jsonb_build_object(
        'screeningOnly',true,
        'message','A single diagnostic item is a screening signal, not proof of mastery. Use later independent assessed evidence to confirm improvement or mastery.'
      )
    )
  );
end;
$function$;

create or replace function public.rpc_teacher_assignment_print_packet(p_assignment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_assignment record;
  v_canonical_id uuid;
begin
  if v_actor is null then raise exception using errcode='42501',message='Authentication required'; end if;
  v_canonical_id:=private.assignment_logical_canonical_id(p_assignment_id);
  select a.id,a.title,coalesce(lg.display_subject_name,a.subject_name) subject_name,a.topic_name,
         a.description,a.instructions,a.assigned_at,a.due_at,
         coalesce(lg.display_group_name,a.subject_group_name_snapshot,a.class_code_snapshot,a.batch) class_name,
         ay.name academic_year,term.name term_name
    into v_assignment
  from public.assignments a
  join public.teachers t on t.id=a.teacher_id and t.user_id=v_actor
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  left join public.school_academic_years ay on ay.id=a.academic_year_id
  left join public.school_academic_terms term on term.id=a.academic_term_id
  where a.id=v_canonical_id;
  if not found then raise exception using errcode='42501',message='NOT_AUTHORIZED'; end if;

  return jsonb_build_object(
    'assignment',jsonb_build_object(
      'id',v_assignment.id,'title',coalesce(nullif(trim(v_assignment.title),''),v_assignment.topic_name),
      'subjectName',v_assignment.subject_name,'topicName',v_assignment.topic_name,
      'description',v_assignment.description,'instructions',v_assignment.instructions,
      'assignedAt',v_assignment.assigned_at,'dueAt',v_assignment.due_at,'className',v_assignment.class_name,
      'academicYear',v_assignment.academic_year,'term',v_assignment.term_name
    ),
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'questionId',aq.question_id,'orderIndex',aq.order_index,
        'questionText',aq.question_snapshot->>'question_text',
        'questionType',coalesce(aq.question_snapshot->>'question_type','multiple_choice'),
        'options',coalesce((
          select jsonb_agg(
            case when jsonb_typeof(option_value)='string'
              then jsonb_build_object('text',(option_value#>>'{}'),'imageUrl',null)
              when jsonb_typeof(option_value)='object'
              then jsonb_build_object('text',coalesce(option_value->>'text',''),'imageUrl',option_value->>'image_url')
              else jsonb_build_object('text',option_value::text,'imageUrl',null) end
          )
          from jsonb_array_elements(
            case when jsonb_typeof(aq.question_snapshot->'options')='array'
              then aq.question_snapshot->'options' else '[]'::jsonb end
          ) option_value
        ),'[]'::jsonb),
        'imageUrl',aq.question_snapshot->>'image_url','imageAltText',aq.question_snapshot->>'image_alt_text',
        'timeLimit',case when coalesce(aq.question_snapshot->>'time_limit','')~'^[0-9]+$'
          then (aq.question_snapshot->>'time_limit')::integer else null end,
        'points',case when coalesce(aq.question_snapshot->>'points','')~'^[0-9]+$'
          then (aq.question_snapshot->>'points')::integer else null end
      ) order by aq.order_index)
      from public.assignment_questions aq where aq.assignment_id=v_canonical_id
    ),'[]'::jsonb)
  );
end;
$function$;
