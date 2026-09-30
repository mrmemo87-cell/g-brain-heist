-- Presentation-only grouping for historical/workaround assignments.
-- This does not alter assignment subject identity, recipient evidence, class provenance,
-- submissions, scores, or reporting history.

alter table public.assignments
  add column if not exists display_group_label text;

comment on column public.assignments.display_group_label is
  'Optional teacher-facing assignment folder/group label. Presentation only; does not change canonical subject/class/group provenance.';

create or replace function public.rpc_teacher_assignment_group_context(p_teacher_id uuid)
returns table(
  assignment_id uuid,
  school_id uuid,
  school_subject_id uuid,
  subject_group_id uuid,
  subject_group_name text
)
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(
    select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=v_actor
  ) then
    raise exception using errcode='42501',message='teacher_assignment_access_denied';
  end if;

  return query
  select
    a.id,
    a.school_id,
    a.school_subject_id,
    a.subject_group_id,
    coalesce(nullif(trim(a.display_group_label),''),a.subject_group_name_snapshot,g.name)::text
  from public.assignments a
  left join public.school_subject_groups g on g.id=a.subject_group_id
  where a.teacher_id=p_teacher_id;
end;
$function$;

revoke all on function public.rpc_teacher_assignment_group_context(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_assignment_group_context(uuid)
  to authenticated,service_role;

update public.assignments
set display_group_label='Grade 7 ESL',
    updated_at=now()
where id in (
  '45181713-11bc-49a4-8d58-bdbac91f62d6',
  '062cddc7-6d48-412c-a2e2-992503c0a9f9',
  'd81ca5f4-fc84-446e-9af7-751374fdd8c4'
);
