-- Additive companion/crew pilot: gated RPCs only, no triggers or realtime.
create table private.retention_companions (
 user_id uuid primary key references public.users(id) on delete cascade,
 name text not null default 'Echo' check(char_length(name) between 1 and 24),
 palette text not null default 'cyan' check(palette in('cyan','pink','violet')),
 updated_at timestamptz not null default now()
);
create table private.retention_crew_signals (
 assignment_id uuid not null references public.assignments(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 signal_day date not null default (now() at time zone 'Asia/Bishkek')::date,
 kind text not null check(kind in('cheer','together','nice_work','keep_going','proud','curiosity')),
 created_at timestamptz not null default now(),
 primary key(assignment_id,user_id,signal_day)
);
create index retention_crew_signals_assignment_date on private.retention_crew_signals(assignment_id,created_at desc);
alter table private.retention_companions enable row level security;
alter table private.retention_crew_signals enable row level security;
revoke all on private.retention_companions,private.retention_crew_signals from public,anon,authenticated;

-- Internal access helper: assignment recipients and its actual teacher only.
create function private.retention_crew_access(p_user uuid,p_assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assignments a join public.users u on u.id=p_user
 where a.id=p_assignment and a.school_id=u.school_id and a.publish_status='published'
 and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now())
 and ((u.role='student' and exists(select 1 from public.student_assignments sa where sa.assignment_id=a.id and sa.student_id=u.id)
 and not exists(select 1 from public.legacy_quarantined_assignment_students q where q.assignment_id=a.id and q.student_id=u.id))
 or(u.role='teacher' and exists(select 1 from public.teachers t where t.id=a.teacher_id and t.user_id=u.id))));
$$;
revoke all on function private.retention_crew_access(uuid,uuid) from public,anon,authenticated;

create function public.rpc_retention_companion_save(p_name text,p_palette text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); clean text:=btrim(p_name); saved private.retention_companions;
begin
 if uid is null or not private.retention_trial_allowed(uid) then raise exception 'TRIAL_PAUSED';end if;
 if not exists(select 1 from public.users where id=uid and role='student') then raise exception 'NOT_AUTHORIZED';end if;
 if clean is null or char_length(clean) not between 1 and 24 or clean ~ '[[:cntrl:]]' or p_palette is null or p_palette not in('cyan','pink','violet') then raise exception 'INVALID_COMPANION';end if;
 perform pg_advisory_xact_lock(hashtextextended('retention-companion:'||uid::text,0));
 select * into saved from private.retention_companions where user_id=uid;
 if saved.user_id is not null and saved.name=clean and saved.palette=p_palette then return jsonb_build_object('name',clean,'palette',p_palette);end if;
 if saved.user_id is not null and saved.updated_at>now()-interval '10 seconds' then raise exception 'SAVE_COOLDOWN';end if;
 insert into private.retention_companions(user_id,name,palette) values(uid,clean,p_palette)
 on conflict(user_id) do update set name=excluded.name,palette=excluded.palette,updated_at=now();
 return jsonb_build_object('name',clean,'palette',p_palette);
end $$;
revoke all on function public.rpc_retention_companion_save(text,text) from public,anon;
grant execute on function public.rpc_retention_companion_save(text,text) to authenticated;

