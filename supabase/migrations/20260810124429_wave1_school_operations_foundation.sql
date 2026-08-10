create table if not exists public.school_ops_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  preset text not null default 'custom',
  timezone text not null default 'UTC',
  week_start smallint not null default 1 check (week_start between 0 and 6),
  cycle_type text not null default 'weekly' check (cycle_type in ('weekly','ab','rotating','custom')),
  cycle_length smallint not null default 5 check (cycle_length between 1 and 20),
  terminology jsonb not null default '{"grade":"Grade","class":"Class","homeroom":"Homeroom","period":"Period"}'::jsonb,
  attendance_mode jsonb not null default '{"daily":false,"am_pm":true,"lesson":false}'::jsonb,
  modules jsonb not null default '{"attendance":true,"timetable":true,"student360":true}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_ops_schedule_templates (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, cycle_type text not null default 'weekly' check (cycle_type in ('weekly','ab','rotating','custom')),
  cycle_length smallint not null default 5 check (cycle_length between 1 and 20),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  valid_from date, valid_to date, is_default boolean not null default false, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists school_ops_one_default_template on public.school_ops_schedule_templates(school_id) where is_default;
create index if not exists school_ops_templates_school_idx on public.school_ops_schedule_templates(school_id,status);

create table if not exists public.school_ops_periods (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  template_id uuid not null references public.school_ops_schedule_templates(id) on delete cascade,
  day_key text not null, position smallint not null check (position between 1 and 40), label text not null,
  block_type text not null default 'lesson' check (block_type in ('lesson','registration','break','lunch','assembly','prayer','advisory','study','club','intervention','meeting','exam','free','custom')),
  starts_at time not null, ends_at time not null, attendance_required boolean not null default false,
  created_at timestamptz not null default now(), unique(template_id,day_key,position), check (ends_at > starts_at)
);
create index if not exists school_ops_periods_template_idx on public.school_ops_periods(template_id,day_key,position);

create table if not exists public.school_ops_rooms (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  campus text, code text not null, name text not null, room_type text not null default 'classroom',
  capacity integer check (capacity is null or capacity > 0), active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(school_id,code)
);

create table if not exists public.school_ops_teaching_groups (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null, code text not null, name text not null,
  group_type text not null default 'class' check (group_type in ('class','subject','set','stream','elective','mixed_grade','language','intervention','club','one_to_one','custom')),
  subject text, grade_label text, active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(school_id,code)
);
create index if not exists school_ops_groups_school_idx on public.school_ops_teaching_groups(school_id,active);

create table if not exists public.school_ops_group_students (
  group_id uuid not null references public.school_ops_teaching_groups(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  valid_from date not null default current_date, valid_to date, created_at timestamptz not null default now(),
  primary key(group_id,student_id,valid_from), check (valid_to is null or valid_to >= valid_from)
);
create index if not exists school_ops_group_students_student_idx on public.school_ops_group_students(student_id,valid_to);

create table if not exists public.school_ops_group_staff (
  group_id uuid not null references public.school_ops_teaching_groups(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'teacher' check (role in ('teacher','lead_teacher','co_teacher','assistant','cover','instructor','custom')),
  valid_from date not null default current_date, valid_to date, created_at timestamptz not null default now(),
  primary key(group_id,staff_id,role,valid_from), check (valid_to is null or valid_to >= valid_from)
);

create table if not exists public.school_ops_lessons (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  template_id uuid not null references public.school_ops_schedule_templates(id) on delete cascade,
  day_key text not null, period_id uuid references public.school_ops_periods(id) on delete set null,
  group_id uuid not null references public.school_ops_teaching_groups(id) on delete cascade,
  room_id uuid references public.school_ops_rooms(id) on delete set null, subject text, starts_at time, ends_at time,
  attendance_required boolean not null default true, active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists school_ops_lessons_template_idx on public.school_ops_lessons(template_id,day_key);
create index if not exists school_ops_lessons_group_idx on public.school_ops_lessons(group_id);

create table if not exists public.school_ops_schedule_overrides (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  lesson_id uuid references public.school_ops_lessons(id) on delete cascade, event_date date not null,
  override_type text not null check (override_type in ('cancelled','room','staff','time','special','remote','custom')),
  replacement_room_id uuid references public.school_ops_rooms(id) on delete set null,
  replacement_staff_id uuid references auth.users(id) on delete set null,
  starts_at time, ends_at time, note text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists school_ops_overrides_date_idx on public.school_ops_schedule_overrides(school_id,event_date);

create table if not exists public.school_ops_attendance_codes (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  code text not null, label text not null,
  category text not null check (category in ('present','late','absent','excused','school_activity','remote','suspended','custom')),
  counts_as_present boolean not null default false, authorized boolean not null default false,
  requires_reason boolean not null default false, active boolean not null default true,
  sort_order smallint not null default 0, created_at timestamptz not null default now(), unique(school_id,code)
);

create table if not exists public.school_ops_attendance_sessions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  session_date date not null, session_type text not null check (session_type in ('daily','am','pm','lesson','activity','boarding','online','custom')),
  group_id uuid references public.school_ops_teaching_groups(id) on delete set null,
  lesson_id uuid references public.school_ops_lessons(id) on delete set null, label text,
  starts_at timestamptz, ends_at timestamptz,
  status text not null default 'open' check (status in ('open','submitted','locked','cancelled')),
  opened_by uuid references auth.users(id), submitted_by uuid references auth.users(id), submitted_at timestamptz, locked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists school_ops_attendance_sessions_date_idx on public.school_ops_attendance_sessions(school_id,session_date,status);

create table if not exists public.school_ops_attendance_records (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  session_id uuid not null references public.school_ops_attendance_sessions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade, code_id uuid not null references public.school_ops_attendance_codes(id),
  minutes_late integer check (minutes_late is null or minutes_late >= 0), reason text, note text,
  source text not null default 'manual' check (source in ('manual','import','parent_request','system','sync')),
  version integer not null default 1, marked_by uuid references auth.users(id), marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(session_id,student_id)
);
create index if not exists school_ops_attendance_records_student_idx on public.school_ops_attendance_records(school_id,student_id,marked_at desc);

create table if not exists public.school_ops_attendance_history (
  id bigint generated always as identity primary key, attendance_record_id uuid not null, school_id uuid not null,
  session_id uuid not null, student_id uuid not null, old_code_id uuid, new_code_id uuid,
  old_payload jsonb, new_payload jsonb, changed_by uuid, changed_at timestamptz not null default now()
);
create index if not exists school_ops_attendance_history_student_idx on public.school_ops_attendance_history(school_id,student_id,changed_at desc);

create table if not exists public.school_ops_student_field_definitions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  field_key text not null, label text not null,
  field_type text not null default 'text' check (field_type in ('text','number','date','boolean','select','multi_select','url')),
  options jsonb not null default '[]'::jsonb,
  visibility text not null default 'admin' check (visibility in ('admin','staff','teacher_team','guardian','student')),
  required boolean not null default false, active boolean not null default true, sort_order integer not null default 0,
  unique(school_id,field_key)
);

create table if not exists public.school_ops_student_field_values (
  definition_id uuid not null references public.school_ops_student_field_definitions(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade, value jsonb,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), primary key(definition_id,student_id)
);

create table if not exists public.school_ops_audit_log (
  id bigint generated always as identity primary key, school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id text,
  before_data jsonb, after_data jsonb, reason text, created_at timestamptz not null default now()
);
create index if not exists school_ops_audit_school_idx on public.school_ops_audit_log(school_id,created_at desc);

create or replace function public.school_ops_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_school_ops_settings_updated on public.school_ops_settings;
create trigger trg_school_ops_settings_updated before update on public.school_ops_settings for each row execute function public.school_ops_touch_updated_at();
drop trigger if exists trg_school_ops_template_updated on public.school_ops_schedule_templates;
create trigger trg_school_ops_template_updated before update on public.school_ops_schedule_templates for each row execute function public.school_ops_touch_updated_at();
drop trigger if exists trg_school_ops_attendance_updated on public.school_ops_attendance_records;
create trigger trg_school_ops_attendance_updated before update on public.school_ops_attendance_records for each row execute function public.school_ops_touch_updated_at();

create or replace function public.school_ops_capture_attendance_history() returns trigger language plpgsql security invoker as $$
begin
  if row(new.code_id,new.minutes_late,new.reason,new.note) is distinct from row(old.code_id,old.minutes_late,old.reason,old.note) then
    insert into public.school_ops_attendance_history(attendance_record_id,school_id,session_id,student_id,old_code_id,new_code_id,old_payload,new_payload,changed_by)
    values(old.id,old.school_id,old.session_id,old.student_id,old.code_id,new.code_id,to_jsonb(old),to_jsonb(new),(select auth.uid()));
    new.version = old.version + 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_school_ops_attendance_history on public.school_ops_attendance_records;
create trigger trg_school_ops_attendance_history before update on public.school_ops_attendance_records for each row execute function public.school_ops_capture_attendance_history();

create or replace function public.school_ops_bootstrap(p_school_id uuid, p_preset text default 'custom') returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_template uuid;
begin
  if not public.is_school_admin_of(p_school_id) then raise exception 'not authorized'; end if;
  insert into public.school_ops_settings(school_id,preset,timezone,week_start,cycle_type,cycle_length,terminology,attendance_mode)
  values(p_school_id,coalesce(nullif(p_preset,''),'custom'),'UTC',1,'weekly',5,
    case when p_preset='british' then '{"grade":"Year","class":"Form","homeroom":"Form","period":"Period"}'::jsonb
         when p_preset='ib' then '{"grade":"Grade","class":"Class","homeroom":"Advisory","period":"Block"}'::jsonb
         else '{"grade":"Grade","class":"Class","homeroom":"Homeroom","period":"Period"}'::jsonb end,
    case when p_preset='british' then '{"daily":false,"am_pm":true,"lesson":false}'::jsonb
         else '{"daily":false,"am_pm":true,"lesson":true}'::jsonb end)
  on conflict(school_id) do nothing;

  insert into public.school_ops_attendance_codes(school_id,code,label,category,counts_as_present,authorized,requires_reason,sort_order)
  values
   (p_school_id,'P','Present','present',true,true,false,10),
   (p_school_id,'L','Late','late',true,true,false,20),
   (p_school_id,'A','Absent','absent',false,false,true,30),
   (p_school_id,'E','Excused','excused',false,true,true,40),
   (p_school_id,'M','Medical','excused',false,true,true,50),
   (p_school_id,'S','School activity','school_activity',true,true,false,60)
  on conflict(school_id,code) do nothing;

  select id into v_template from public.school_ops_schedule_templates where school_id=p_school_id and is_default limit 1;
  if v_template is null then
    insert into public.school_ops_schedule_templates(school_id,name,cycle_type,cycle_length,status,is_default,created_by)
    values(p_school_id,'Main timetable','weekly',5,'draft',true,(select auth.uid())) returning id into v_template;
  end if;
  return jsonb_build_object('success',true,'template_id',v_template);
end $$;

create or replace function public.school_ops_student_360(p_school_id uuid,p_student_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if not public.is_school_admin_of(p_school_id) then raise exception 'not authorized'; end if;
 if not public.is_same_school_member(p_student_id,p_school_id) then raise exception 'student is not in this school'; end if;
 select jsonb_build_object(
  'student',jsonb_build_object('id',u.id,'username',u.username,'full_name',u.full_name,'email',u.email,'avatar_url',u.avatar_url,'grade',u.grade,'batch',u.batch,'level',u.level,'xp',u.xp,'last_seen',u.last_seen),
  'placement',(select to_jsonb(x) from (select c.id,c.class_code,c.class_name,c.grade_level from public.class_students cs join public.classes c on c.id=cs.class_id where cs.student_id=p_student_id and c.school_id=p_school_id order by cs.joined_at desc nulls last limit 1) x),
  'attendance',jsonb_build_object(
    'recorded',(select count(*) from public.school_ops_attendance_records r where r.school_id=p_school_id and r.student_id=p_student_id),
    'present',(select count(*) from public.school_ops_attendance_records r join public.school_ops_attendance_codes c on c.id=r.code_id where r.school_id=p_school_id and r.student_id=p_student_id and c.counts_as_present),
    'late',(select count(*) from public.school_ops_attendance_records r join public.school_ops_attendance_codes c on c.id=r.code_id where r.school_id=p_school_id and r.student_id=p_student_id and c.category='late')
  ),
  'focus',(select coalesce(jsonb_agg(to_jsonb(o) order by o.observed_at desc),'[]'::jsonb) from (select subject,topic,skill,subskill,observation_type,observed_at,evidence_percentage,evidence_quality from public.student_learning_observations where school_id=p_school_id and student_id=p_student_id order by observed_at desc limit 20) o),
  'guardians',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from (select relationship_label,status,guardian_user_id from public.student_guardian_relationships where school_id=p_school_id and student_id=p_student_id and status='active') g),
  'custom_fields',(select coalesce(jsonb_object_agg(d.field_key,jsonb_build_object('label',d.label,'value',v.value)),'{}'::jsonb) from public.school_ops_student_field_definitions d left join public.school_ops_student_field_values v on v.definition_id=d.id and v.student_id=p_student_id where d.school_id=p_school_id and d.active)
 ) into result from public.users u where u.id=p_student_id;
 return coalesce(result,'{}'::jsonb);
end $$;

revoke all on function public.school_ops_bootstrap(uuid,text) from public,anon;
revoke all on function public.school_ops_student_360(uuid,uuid) from public,anon;
grant execute on function public.school_ops_bootstrap(uuid,text) to authenticated;
grant execute on function public.school_ops_student_360(uuid,uuid) to authenticated;

alter table public.school_ops_settings enable row level security;
alter table public.school_ops_schedule_templates enable row level security;
alter table public.school_ops_periods enable row level security;
alter table public.school_ops_rooms enable row level security;
alter table public.school_ops_teaching_groups enable row level security;
alter table public.school_ops_group_students enable row level security;
alter table public.school_ops_group_staff enable row level security;
alter table public.school_ops_lessons enable row level security;
alter table public.school_ops_schedule_overrides enable row level security;
alter table public.school_ops_attendance_codes enable row level security;
alter table public.school_ops_attendance_sessions enable row level security;
alter table public.school_ops_attendance_records enable row level security;
alter table public.school_ops_attendance_history enable row level security;
alter table public.school_ops_student_field_definitions enable row level security;
alter table public.school_ops_student_field_values enable row level security;
alter table public.school_ops_audit_log enable row level security;

do $$ declare t text; begin
 foreach t in array array['school_ops_settings','school_ops_schedule_templates','school_ops_periods','school_ops_rooms','school_ops_teaching_groups','school_ops_group_students','school_ops_group_staff','school_ops_lessons','school_ops_schedule_overrides','school_ops_attendance_codes','school_ops_attendance_sessions','school_ops_attendance_records','school_ops_attendance_history','school_ops_student_field_definitions','school_ops_student_field_values','school_ops_audit_log'] loop
   execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
grant usage,select on sequence public.school_ops_attendance_history_id_seq to authenticated;
grant usage,select on sequence public.school_ops_audit_log_id_seq to authenticated;

create policy school_ops_settings_admin_all on public.school_ops_settings for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_templates_admin_all on public.school_ops_schedule_templates for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_periods_admin_all on public.school_ops_periods for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_rooms_admin_all on public.school_ops_rooms for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_groups_admin_all on public.school_ops_teaching_groups for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_group_students_admin_all on public.school_ops_group_students for all to authenticated using (exists(select 1 from public.school_ops_teaching_groups g where g.id=group_id and public.is_school_admin_of(g.school_id))) with check (exists(select 1 from public.school_ops_teaching_groups g where g.id=group_id and public.is_school_admin_of(g.school_id)));
create policy school_ops_group_staff_admin_all on public.school_ops_group_staff for all to authenticated using (exists(select 1 from public.school_ops_teaching_groups g where g.id=group_id and public.is_school_admin_of(g.school_id))) with check (exists(select 1 from public.school_ops_teaching_groups g where g.id=group_id and public.is_school_admin_of(g.school_id)));
create policy school_ops_lessons_admin_all on public.school_ops_lessons for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_overrides_admin_all on public.school_ops_schedule_overrides for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_codes_admin_all on public.school_ops_attendance_codes for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_sessions_admin_all on public.school_ops_attendance_sessions for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_records_admin_all on public.school_ops_attendance_records for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_history_admin_read on public.school_ops_attendance_history for select to authenticated using (public.is_school_admin_of(school_id));
create policy school_ops_fields_admin_all on public.school_ops_student_field_definitions for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_values_admin_all on public.school_ops_student_field_values for all to authenticated using (public.is_school_admin_of(school_id)) with check (public.is_school_admin_of(school_id));
create policy school_ops_audit_admin_read on public.school_ops_audit_log for select to authenticated using (public.is_school_admin_of(school_id));
