-- Teacher announcements as push notifications — v1.
-- A teacher sends a short message to students they teach; it goes through the existing push
-- outbox/dispatcher (20261028170000_student_push_notifications). Recipients are limited to the
-- teacher's canonical roster (public.rpc_get_my_teacher_class_roster), the same list the teacher
-- portal shows, so a teacher can never reach students outside their classes or school.
-- Rollback: supabase/rollbacks/20261029090000_teacher_push_announcements.rollback.sql

-- ───────────────────────────── audit log ─────────────────────────────
create table if not exists public.push_announcements (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid,
  title text not null,
  body text not null,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  reachable_count integer not null default 0 check (reachable_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists push_announcements_teacher_created_idx
  on public.push_announcements(teacher_user_id, created_at desc);
alter table public.push_announcements enable row level security;
revoke all on table public.push_announcements from public, anon, authenticated;
grant select on table public.push_announcements to authenticated;
grant select, insert, update, delete on table public.push_announcements to service_role;

drop policy if exists push_announcements_own_rows on public.push_announcements;
create policy push_announcements_own_rows on public.push_announcements
  for select to authenticated
  using (teacher_user_id = (select auth.uid()));

comment on table public.push_announcements is
  'Teacher push announcements (who sent what to how many). Teachers read their own; written only by rpc_teacher_send_push_announcement.';

-- ───────────────────────────── send RPC ─────────────────────────────
create or replace function public.rpc_teacher_send_push_announcement(
  p_student_ids uuid[], p_title text, p_body text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_title text := left(coalesce(nullif(trim(p_title), ''), 'Message from your teacher'), 60);
  v_body text := trim(coalesce(p_body, ''));
  v_requested uuid[];
  v_allowed uuid[];
  v_school uuid;
  v_id uuid;
  v_reachable integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if v_body = '' then raise exception 'message_required'; end if;
  if length(v_body) > 200 then raise exception 'message_too_long'; end if;

  select coalesce(array_agg(distinct s), '{}') into v_requested from unnest(coalesce(p_student_ids, '{}')) s where s is not null;
  if cardinality(v_requested) = 0 then raise exception 'recipients_required'; end if;
  if cardinality(v_requested) > 500 then raise exception 'too_many_recipients'; end if;

  -- Rate limit: 20 announcements per teacher per rolling 24 hours.
  if (select count(*) from public.push_announcements a
      where a.teacher_user_id = v_actor and a.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'announcement_limit_reached';
  end if;

  -- Every recipient must be an active student on this teacher's own roster.
  select coalesce(array_agg(distinct r.student_id), '{}'), max(r.school_id::text)::uuid
    into v_allowed, v_school
  from public.rpc_get_my_teacher_class_roster() r
  where r.student_id = any(v_requested) and r.access_status = 'active';
  if cardinality(v_allowed) <> cardinality(v_requested) then
    raise exception 'student_not_in_your_classes';
  end if;

  select count(distinct s.user_id) into v_reachable
  from public.push_subscriptions s
  where s.user_id = any(v_allowed) and s.disabled_at is null;

  insert into public.push_announcements(teacher_user_id, school_id, title, body, recipient_count, reachable_count)
  values (v_actor, v_school, v_title, v_body, cardinality(v_allowed), v_reachable)
  returning id into v_id;

  perform private.enqueue_push(
    s, 'teacher_announcement', v_title, v_body, '/',
    'announcement-' || v_id::text || '-' || s::text,
    jsonb_build_object('announcement_id', v_id),
    now())
  from unnest(v_allowed) s;

  return jsonb_build_object('announcement_id', v_id, 'recipients', cardinality(v_allowed), 'reachable', v_reachable);
end $$;
revoke all on function public.rpc_teacher_send_push_announcement(uuid[], text, text) from public, anon;
grant execute on function public.rpc_teacher_send_push_announcement(uuid[], text, text) to authenticated;

-- Lets the teacher screen say "N of these students have notifications on" before sending.
-- Counts only students on the caller's own roster; returns nothing about anyone else.
create or replace function public.rpc_teacher_push_reachable_students(p_student_ids uuid[])
returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct s.user_id), '{}')
  from public.push_subscriptions s
  where s.disabled_at is null
    and s.user_id = any(coalesce(p_student_ids, '{}'))
    and s.user_id in (select r.student_id from public.rpc_get_my_teacher_class_roster() r);
$$;
revoke all on function public.rpc_teacher_push_reachable_students(uuid[]) from public, anon;
grant execute on function public.rpc_teacher_push_reachable_students(uuid[]) to authenticated;
