-- Add attempt_id to IELTS Exam Mode monitoring so teacher emergency controls
-- can target the correct attempt without exposing answer keys or submissions.

drop function if exists public.rpc_ielts_exam_monitoring(uuid);

create or replace function public.rpc_ielts_exam_monitoring(p_exam_event_id uuid)
returns table (
  student_id uuid,
  attempt_id uuid,
  name text,
  username text,
  class_id uuid,
  class_name text,
  status text,
  started_at timestamptz,
  ends_at timestamptz,
  remaining_seconds int,
  last_heartbeat_at timestamptz,
  last_save_age_seconds int,
  incident_count bigint,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;

  return query
  select
    u.id as student_id,
    a.id as attempt_id,
    u.username::text as name,
    u.username::text as username,
    c.id as class_id,
    c.class_name::text as class_name,
    coalesce(a.status, ass.status)::text as status,
    a.started_at,
    a.ends_at,
    case when a.ends_at is null then null else greatest(0, floor(extract(epoch from (a.ends_at - now())))::int) end as remaining_seconds,
    a.last_heartbeat_at,
    case when d.last_save_at is null then null else greatest(0, floor(extract(epoch from (now() - d.last_save_at)))::int) end as last_save_age_seconds,
    coalesce(i.incident_count, 0)::bigint as incident_count,
    coalesce(a.submitted_at, s.submitted_at) as submitted_at
  from public.ielts_exam_assignments ass
  join public.users u on u.id = ass.student_id
  left join public.classes c on c.id = ass.class_id
  left join public.ielts_exam_attempts a on a.assignment_id = ass.id
  left join public.ielts_exam_submissions s on s.attempt_id = a.id
  left join lateral (
    select max(server_saved_at) as last_save_at
    from public.ielts_exam_drafts d
    where d.attempt_id = a.id
  ) d on true
  left join lateral (
    select count(*) as incident_count
    from public.ielts_exam_incidents inc
    where inc.attempt_id = a.id
  ) i on true
  where ass.exam_event_id = p_exam_event_id
  order by c.class_name nulls last, u.username;
end;
$$;

comment on function public.rpc_ielts_exam_monitoring(uuid) is 'Teacher/admin monitoring view scoped by school or class assignment; includes attempt_id for emergency controls but never exposes answer_key.';

grant execute on function public.rpc_ielts_exam_monitoring(uuid) to authenticated;
