-- Bible 1.8.0: human-readable identity only; no scoring, content or completion changes.
-- Codes identify materials, never assignments or attempts. Retired codes stay reserved.
create table private.ielts_material_code_counters (
  prefix text primary key check(prefix in ('L','R','W','S')),
  last_number bigint not null check(last_number > 0)
);
create table private.ielts_material_codes (
  material_type text not null check(material_type in ('targeted','ielts_listening_set','ielts_reading_set','ielts_writing_task','ielts_speaking_task')),
  material_id text not null,
  skill text not null check(skill in ('listening','reading','writing','speaking')),
  display_code text not null unique check(display_code ~ '^[LRWS]-[0-9]{3,}$'),
  created_at timestamptz not null default now(),
  primary key(material_type,material_id)
);
alter table private.ielts_material_code_counters enable row level security;
alter table private.ielts_material_codes enable row level security;
revoke all on private.ielts_material_code_counters,private.ielts_material_codes from public,anon,authenticated,service_role;

create function private.ielts_material_code(p_type text,p_id text) returns text
language sql stable security definer set search_path='' as $$
 select display_code from private.ielts_material_codes where material_type=p_type and material_id=p_id;
$$;
revoke all on function private.ielts_material_code(text,text) from public,anon,authenticated,service_role;

create function private.register_ielts_material_code(p_type text,p_id text,p_skill text) returns text
language plpgsql security definer set search_path='' as $$
declare prefix text; number bigint; result text; existing_skill text;
begin
 prefix:=case p_skill when 'listening' then 'L' when 'reading' then 'R' when 'writing' then 'W' when 'speaking' then 'S' end;
 if prefix is null or p_type not in ('targeted','ielts_listening_set','ielts_reading_set','ielts_writing_task','ielts_speaking_task') or p_id is null or length(p_id)=0 then raise exception 'invalid_material_identity'; end if;
 -- Atomic counter row lock serializes new identifiers for each skill, including parallel inserts.
 -- Fast path for all ordinary source updates: do not lock or advance the counter.
 select display_code,skill into result,existing_skill from private.ielts_material_codes where material_type=p_type and material_id=p_id;
 if result is not null then
  if existing_skill<>p_skill then raise exception 'material_skill_is_immutable'; end if;
  return result;
 end if;
 insert into private.ielts_material_code_counters as c(prefix,last_number) values(prefix,1)
 on conflict on constraint ielts_material_code_counters_pkey do update set last_number=c.last_number+1 returning last_number into number;
 -- Recheck after the counter lock in case the same identity was concurrently registered.
 select display_code,skill into result,existing_skill from private.ielts_material_codes where material_type=p_type and material_id=p_id;
 if result is not null then
  if existing_skill<>p_skill then raise exception 'material_skill_is_immutable'; end if;
  return result;
 end if;
 result:=prefix||'-'||lpad(number::text,greatest(3,length(number::text)),'0');
 insert into private.ielts_material_codes(material_type,material_id,skill,display_code) values(p_type,p_id,p_skill,result);
 return result;
end; $$;
revoke all on function private.register_ielts_material_code(text,text,text) from public,anon,authenticated,service_role;

create function private.keep_ielts_material_code() returns trigger
language plpgsql security definer set search_path='' as $$
declare material_id text; skill text; registered text;
begin
 material_id:=to_jsonb(new)->>case when tg_argv[0]='targeted' then 'code' else 'id' end;
 skill:=case when tg_argv[0]='targeted' then to_jsonb(new)->>'skill' else tg_argv[1] end;
 if tg_op='UPDATE' and old.display_code is not null then
  if new.display_code is distinct from old.display_code or
   (to_jsonb(new)->>case when tg_argv[0]='targeted' then 'code' else 'id' end) is distinct from (to_jsonb(old)->>case when tg_argv[0]='targeted' then 'code' else 'id' end) or
   (tg_argv[0]='targeted' and to_jsonb(new)->>'skill' is distinct from to_jsonb(old)->>'skill') then raise exception 'material_code_is_immutable'; end if;
 end if;
 registered:=private.register_ielts_material_code(tg_argv[0],material_id,skill);
 if new.display_code is not null and new.display_code<>registered then raise exception 'material_code_is_server_assigned'; end if;
 new.display_code:=registered;
 return new;
end; $$;
revoke all on function private.keep_ielts_material_code() from public,anon,authenticated,service_role;

create function private.prevent_ielts_code_reuse() returns trigger
language plpgsql security definer set search_path='' as $$
begin raise exception 'material_code_registry_is_immutable'; end; $$;
revoke all on function private.prevent_ielts_code_reuse() from public,anon,authenticated,service_role;
create trigger preserve_ielts_material_codes before update or delete on private.ielts_material_codes for each row execute function private.prevent_ielts_code_reuse();

-- Targeted source rows are immutable. Register externally without updating them.
create function private.register_targeted_ielts_material_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.register_ielts_material_code('targeted',new.code,new.skill); return new; end; $$;
revoke all on function private.register_targeted_ielts_material_code() from public,anon,authenticated,service_role;
create trigger register_targeted_ielts_material_code after insert on private.ielts_learning_tasks for each row execute function private.register_targeted_ielts_material_code();
alter table public.ielts_listening_sets add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_listening_sets for each row execute function private.keep_ielts_material_code('ielts_listening_set','listening');
alter table public.ielts_reading_sets add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_reading_sets for each row execute function private.keep_ielts_material_code('ielts_reading_set','reading');
alter table public.ielts_writing_tasks add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_writing_tasks for each row execute function private.keep_ielts_material_code('ielts_writing_task','writing');
alter table public.ielts_speaking_tasks add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_speaking_tasks for each row execute function private.keep_ielts_material_code('ielts_speaking_task','speaking');

do $$ declare r record; begin
 for r in select code,skill from private.ielts_learning_tasks order by skill,coalesce(substring(code from '-[lrws]([0-9]+)-')::integer,2147483647),code loop
 perform private.register_ielts_material_code('targeted',r.code,r.skill);
 end loop;
 for r in select id from public.ielts_listening_sets order by id loop
 update public.ielts_listening_sets set display_code=null where id=r.id;
 end loop;
 for r in select id from public.ielts_reading_sets order by id loop
 update public.ielts_reading_sets set display_code=null where id=r.id;
 end loop;
 for r in select id from public.ielts_writing_tasks order by id loop
 update public.ielts_writing_tasks set display_code=null where id=r.id;
 end loop;
 for r in select id from public.ielts_speaking_tasks order by id loop
 update public.ielts_speaking_tasks set display_code=null where id=r.id;
 end loop;
end; $$;
alter table public.ielts_listening_sets alter column display_code set not null;
alter table public.ielts_reading_sets alter column display_code set not null;
alter table public.ielts_writing_tasks alter column display_code set not null;
alter table public.ielts_speaking_tasks alter column display_code set not null;

