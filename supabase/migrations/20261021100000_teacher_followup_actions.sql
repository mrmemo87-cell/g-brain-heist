-- Weekly teacher follow-up screen (actions).
-- log_teacher_followups() records a teacher's follow-up for the selected students
-- and, for reminders, sends each student an in-app notification.
-- Fail-closed: a teacher can only act on students that get_teacher_followups()
-- currently flags for them. Direct inserts into teacher_followups are removed so
-- every follow-up goes through this check.

drop policy if exists teacher_followups_insert_own on public.teacher_followups;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'attack_incoming', 'attack_defended', 'attack_success', 'attack_failed', 'level_up',
  'achievement_earned', 'coins_earned', 'coins_lost', 'quest_completed', 'gemstone_earned',
  'low_ap', 'ap_full', 'challenge_received', 'clan_invite', 'revenge_available',
  'streak_danger', 'new_rival', 'leaderboard_change', 'assignment_completed',
  'cambridge_test_taken', 'student_improvement', 'new_submission', 'class_milestone',
  'school_head_decision', 'teacher_reminder'
]::text[]));

create or replace function public.log_teacher_followups(
  p_student_ids uuid[],
  p_action text,
  p_reason text,
  p_topics jsonb default '{}'::jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_teacher_name text;
  v_count integer := 0;
  v_student uuid;
  v_topic text;
  v_message text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select u.school_id, coalesce(nullif(u.full_name, ''), u.username)
    into v_school, v_teacher_name
  from public.users u
  join public.teachers t on t.user_id = u.id
  where u.id = v_uid and u.role in ('teacher', 'school_admin');

  if not found then
    raise exception 'Only teachers can log follow-ups' using errcode = '42501';
  end if;

  if p_action not in ('reminder', 'practice') then
    raise exception 'Unknown follow-up action' using errcode = '22023';
  end if;

  if p_reason not in ('late', 'low', 'quiet') then
    raise exception 'Unknown follow-up reason' using errcode = '22023';
  end if;

  if p_student_ids is null or cardinality(p_student_ids) = 0 then
    return 0;
  end if;

  if cardinality(p_student_ids) > 100 then
    raise exception 'Too many students in one follow-up' using errcode = '22023';
  end if;

  for v_student in
    select distinct f.student_id
    from public.get_teacher_followups() f
    where f.student_id = any (p_student_ids)
      and f.tab = p_reason
  loop
    v_topic := nullif(left(coalesce(p_topics ->> v_student::text, ''), 120), '');

    insert into public.teacher_followups (school_id, teacher_user_id, student_id, action, reason, topic)
    values (v_school, v_uid, v_student, p_action, p_reason, v_topic);

    if p_action = 'reminder' then
      v_message := case p_reason
        when 'late' then 'You have unfinished assignments. Please open Brains Heist and finish them this week.'
        when 'low' then 'Let''s practise ' || coalesce(v_topic, 'your weak topic') || ' together. Try a few questions today.'
        else 'We have not seen you practise for a while. Do a few questions today to keep your progress going.'
      end;

      insert into public.notifications (user_id, type, title, message, data, priority, read)
      values (
        v_student,
        'teacher_reminder',
        'A message from ' || coalesce(v_teacher_name, 'your teacher'),
        v_message,
        jsonb_build_object('reason', p_reason, 'topic', v_topic, 'teacher_user_id', v_uid),
        'high',
        false
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.log_teacher_followups(uuid[], text, text, jsonb) from public, anon;
grant execute on function public.log_teacher_followups(uuid[], text, text, jsonb) to authenticated;
