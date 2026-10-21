-- Weekly teacher follow-up screen (data layer).
-- Applied to production on 2026-10-21 as migration version 20261021033730.
-- get_teacher_followups() lists the teacher's students who did not finish work,
-- scored under 50% this week, or went quiet. teacher_followups logs each action.

create table if not exists public.teacher_followups (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid references public.schools(id),
  teacher_user_id uuid not null references public.users(id),
  student_id      uuid not null references public.users(id),
  action          text not null check (action in ('reminder', 'practice')),
  reason          text not null check (reason in ('late', 'low', 'quiet')),
  topic           text,
  assignment_id   uuid references public.assignments(id),  -- set when practice is assigned
  created_at      timestamptz not null default now()
);

create index if not exists teacher_followups_teacher_week_idx
  on public.teacher_followups (teacher_user_id, created_at desc);

alter table public.teacher_followups enable row level security;

create policy teacher_followups_select_own on public.teacher_followups
  for select using (teacher_user_id = auth.uid());

create policy teacher_followups_insert_own on public.teacher_followups
  for insert with check (teacher_user_id = auth.uid());

------------------------------------------------------------------------------
-- 2. The list for the screen: one row per flagged student per tab
------------------------------------------------------------------------------

create or replace function public.get_teacher_followups()
returns table (
  student_id   uuid,
  display_name text,
  tab          text,     -- 'late' | 'low' | 'quiet'
  reason       text,     -- plain-language line shown on the card
  weak_topic   text,
  sort_key     numeric   -- higher = more urgent
)
language sql
stable
security definer
set search_path = public
as $$
with me as (
  select t.id as teacher_id, u.id as user_id
  from public.teachers t
  join public.users u on u.id = t.user_id
  where u.id = auth.uid() and u.role in ('teacher', 'school_admin')
),
my_classes as (
  select c.id from public.classes c join me on c.teacher_id = me.teacher_id
  union
  select cta.class_id from public.class_teacher_assignments cta
  join me on cta.teacher_user_id = me.user_id
  where cta.active
),
my_students as (
  select distinct cs.student_id from public.class_students cs
  where cs.class_id in (select id from my_classes)
),
my_assignments as (
  select a.* from public.assignments a join me on a.teacher_id = me.teacher_id
),

-- Tab 1: didn't finish (overdue in the last 14 days)
late as (
  select sa.student_id,
         count(*)::int as n_overdue,
         (array_agg(a.topic_name order by a.due_at desc))[1] as assignment_topic,
         min(a.due_at) as oldest_due
  from public.student_assignments sa
  join my_assignments a on a.id = sa.assignment_id
  where sa.status <> 'completed'
    and a.due_at < now()
    and a.due_at > now() - interval '14 days'
  group by sa.student_id
),

-- Tab 2: low scores (average under 50% this week)
low as (
  select r.student_id,
         round(avg(r.accuracy))::int as avg_acc,
         count(*)::int as n_done,
         (array_agg(a.topic_name order by r.accuracy asc))[1] as worst_topic
  from public.student_assignment_results r
  join my_assignments a on a.id = r.assignment_id
  where r.completed_at > now() - interval '7 days'
  group by r.student_id
  having avg(r.accuracy) < 50
),

-- Real learning activity (not just opening the app)
activity as (
  select student_id, max(attempted_at) as t from public.question_attempts group by 1
  union all
  select student_id, max(completed_at) from public.student_assignment_results group by 1
),
last_activity as (
  select student_id, max(t) as last_t from activity group by 1
),

-- Tab 3: went quiet (practised in the last month, nothing for 7+ days),
-- or only claims the daily reward without practising for 14+ days
quiet as (
  select s.student_id, la.last_t,
         exists (
           select 1 from public.daily_streak_rewards d
           where d.user_id = s.student_id and d.created_at > now() - interval '7 days'
         ) as claims_reward
  from my_students s
  left join last_activity la on la.student_id = s.student_id
  where (la.last_t < now() - interval '7 days' and la.last_t > now() - interval '30 days')
     or ((la.last_t is null or la.last_t < now() - interval '14 days')
         and exists (
           select 1 from public.daily_streak_rewards d
           where d.user_id = s.student_id and d.created_at > now() - interval '7 days'
         ))
),

-- Weak topic: the app's own focus tracking first, assignment topic as fallback
weak as (
  select distinct on (f.student_id) f.student_id, f.topic
  from public.student_learning_focus_states f
  where f.current_status in ('persistent', 'recurring', 'new_focus')
  order by f.student_id,
           (f.priority = 'high') desc, (f.priority = 'medium') desc,
           f.last_observed_at desc
),

flagged as (
  select l.student_id, 'late' as tab,
         l.n_overdue || case when l.n_overdue = 1 then ' assignment' else ' assignments' end
           || ' overdue · oldest due ' || to_char(l.oldest_due, 'Mon DD') as reason,
         l.assignment_topic as fallback_topic,
         (l.n_overdue * 10 + extract(day from now() - l.oldest_due))::numeric as sort_key
  from late l
  union all
  select lo.student_id, 'low',
         lo.avg_acc || '% average across ' || lo.n_done
           || case when lo.n_done = 1 then ' assignment' else ' assignments' end || ' this week',
         lo.worst_topic,
         (100 - lo.avg_acc)::numeric
  from low lo
  union all
  select q.student_id, 'quiet',
         case
           when q.claims_reward and (q.last_t is null or q.last_t < now() - interval '14 days')
             then 'Claims the daily reward but no practice in 2+ weeks'
           else 'No practice for ' || extract(day from now() - q.last_t)::int || ' days'
         end,
         null,
         coalesce(extract(day from now() - q.last_t), 30)::numeric
  from quiet q
)

select f.student_id,
       coalesce(nullif(u.full_name, ''), u.username) as display_name,
       f.tab,
       f.reason,
       coalesce(w.topic, nullif(f.fallback_topic, '')) as weak_topic,
       f.sort_key
from flagged f
join public.users u on u.id = f.student_id
left join weak w on w.student_id = f.student_id
where f.student_id in (select student_id from my_students)
   or f.tab in ('late', 'low')  -- late/low are already scoped by the teacher's own assignments
order by f.tab, f.sort_key desc;
$$;

revoke all on function public.get_teacher_followups() from public, anon;
grant execute on function public.get_teacher_followups() to authenticated;
