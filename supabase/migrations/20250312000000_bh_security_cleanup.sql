-- BH membership table
create table if not exists public.brains_heist_memberships (
    user_id uuid primary key references auth.users (id) on delete cascade,
    role text not null default 'student',
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table if exists public.brains_heist_memberships enable row level security;

drop policy if exists bh_memberships_self_select on public.brains_heist_memberships;
create policy bh_memberships_self_select
    on public.brains_heist_memberships
    for select
    using (auth.uid() = user_id);

drop policy if exists bh_memberships_self_insert on public.brains_heist_memberships;
create policy bh_memberships_self_insert
    on public.brains_heist_memberships
    for insert
    with check (auth.uid() = user_id);

drop policy if exists bh_memberships_self_update on public.brains_heist_memberships;
create policy bh_memberships_self_update
    on public.brains_heist_memberships
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create or replace function public.is_bh_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.brains_heist_memberships
        where user_id = auth.uid()
          and status = 'active'
    );
$$;

create or replace function public.bh_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select role from public.brains_heist_memberships where user_id = auth.uid()),
        'none'
    );
$$;

create or replace function public.is_bh_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.brains_heist_memberships
        where user_id = auth.uid()
          and status = 'active'
          and role in ('teacher', 'admin')
    );
$$;

create or replace function public.is_bh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.brains_heist_memberships
        where user_id = auth.uid()
          and status = 'active'
          and role = 'admin'
    );
$$;

create or replace function public.bh_teacher_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id
    from public.teachers
    where user_id = auth.uid();
$$;

create or replace function public.bh_enroll_self()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'BH access denied';
    end if;

    insert into public.brains_heist_memberships (user_id, role, status, created_at, updated_at)
    values (auth.uid(), 'student', 'active', now(), now())
    on conflict (user_id)
    do update set
        status = 'active',
        updated_at = now(),
        role = case
            when public.brains_heist_memberships.role in ('teacher', 'admin') then public.brains_heist_memberships.role
            else excluded.role
        end;
end;
$$;

insert into public.brains_heist_memberships (user_id, role, status, created_at, updated_at)
select user_id, 'teacher', 'active', now(), now()
from public.teachers
where user_id is not null
on conflict (user_id)
do update set
    status = 'active',
    updated_at = now(),
    role = case
        when public.brains_heist_memberships.role = 'admin' then public.brains_heist_memberships.role
        else excluded.role
    end;

create or replace function public.brains_heist_create_question(
    p_task_group_id uuid,
    p_prompt text,
    p_question_type text,
    p_difficulty integer,
    p_metadata jsonb,
    p_choices jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_question_id uuid;
    v_teacher_id uuid;
    v_choice jsonb;
    v_index integer := 0;
begin
    if auth.uid() is null then
        raise exception 'BH access denied';
    end if;

    if not public.is_bh_teacher() then
        raise exception 'BH teacher/admin only';
    end if;

    v_teacher_id := public.bh_teacher_profile_id();
    if v_teacher_id is null then
        raise exception 'BH teacher profile not found';
    end if;

    insert into public.brains_heist_questions (
        task_group_id, teacher_id, prompt, question_type, difficulty, metadata
    ) values (
        p_task_group_id, v_teacher_id, p_prompt, p_question_type, p_difficulty, coalesce(p_metadata,'{}'::jsonb)
    ) returning id into v_question_id;

    if p_choices is not null then
        for v_choice in select * from jsonb_array_elements(p_choices)
        loop
            insert into public.brains_heist_choices (question_id, choice_text, is_correct, order_index)
            values (
                v_question_id,
                v_choice->>'choice_text',
                coalesce((v_choice->>'is_correct')::boolean, false),
                v_index
            );
            v_index := v_index + 1;
        end loop;
    end if;

    return v_question_id;
end;
$$;

create or replace function public.brains_heist_log_attempt(
    p_question_id uuid,
    p_variant_id uuid,
    p_task_group_id uuid,
    p_topic_id uuid,
    p_is_correct boolean,
    p_time_taken_ms integer,
    p_answer_payload jsonb,
    p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_attempt_id uuid;
    v_student_id uuid := auth.uid();
    v_task_topic_id uuid;
begin
    if v_student_id is null or not public.is_bh_member() then
        raise exception 'BH access denied';
    end if;

    select topic_id into v_task_topic_id
    from public.brains_heist_task_groups
    where id = p_task_group_id;

    if v_task_topic_id is null then
        raise exception 'Task group not found';
    end if;

    if v_task_topic_id <> p_topic_id then
        raise exception 'Task group not in topic';
    end if;

    if not exists (
        select 1
        from public.brains_heist_questions
        where id = p_question_id
          and task_group_id = p_task_group_id
    ) then
        raise exception 'Question not valid for this task group';
    end if;

    if p_variant_id is not null and not exists (
        select 1
        from public.brains_heist_question_variants
        where id = p_variant_id
          and question_id = p_question_id
    ) then
        raise exception 'Variant not valid for this question';
    end if;

    insert into public.brains_heist_student_attempts (
        student_id, question_id, variant_id, task_group_id, topic_id, is_correct,
        time_taken_ms, answer_payload, source
    ) values (
        v_student_id, p_question_id, p_variant_id, p_task_group_id, p_topic_id, p_is_correct,
        p_time_taken_ms, coalesce(p_answer_payload,'{}'::jsonb), p_source
    ) returning id into v_attempt_id;

    insert into public.brains_heist_topic_stats (student_id, topic_id, attempts, correct, mastery_score)
    values (v_student_id, p_topic_id, 1, case when p_is_correct then 1 else 0 end, case when p_is_correct then 1 else 0 end)
    on conflict (student_id, topic_id)
    do update set
        attempts = public.brains_heist_topic_stats.attempts + 1,
        correct = public.brains_heist_topic_stats.correct + (case when excluded.correct > 0 then 1 else 0 end),
        mastery_score = greatest(0, least(100,
            (public.brains_heist_topic_stats.correct + (case when p_is_correct then 1 else 0 end))::numeric
            / (public.brains_heist_topic_stats.attempts + 1) * 100
        )),
        last_updated = now();

    insert into public.brains_heist_task_group_stats (student_id, task_group_id, attempts, correct, mastery_score)
    values (v_student_id, p_task_group_id, 1, case when p_is_correct then 1 else 0 end, case when p_is_correct then 1 else 0 end)
    on conflict (student_id, task_group_id)
    do update set
        attempts = public.brains_heist_task_group_stats.attempts + 1,
        correct = public.brains_heist_task_group_stats.correct + (case when excluded.correct > 0 then 1 else 0 end),
        mastery_score = greatest(0, least(100,
            (public.brains_heist_task_group_stats.correct + (case when p_is_correct then 1 else 0 end))::numeric
            / (public.brains_heist_task_group_stats.attempts + 1) * 100
        )),
        last_updated = now();

    return v_attempt_id;
end;
$$;

create or replace function public.brains_heist_create_battle(
    p_opponent_id uuid,
    p_task_group_id uuid,
    p_question_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_battle_id uuid;
    v_challenger_id uuid := auth.uid();
    v_question_count integer;
    v_valid_count integer;
begin
    if v_challenger_id is null or not public.is_bh_member() then
        raise exception 'BH access denied';
    end if;

    if p_opponent_id = v_challenger_id then
        raise exception 'Cannot battle yourself';
    end if;

    if not exists (
        select 1
        from public.brains_heist_memberships
        where user_id = p_opponent_id
          and status = 'active'
    ) then
        raise exception 'Opponent is not a BH member';
    end if;

    v_question_count := coalesce(array_length(p_question_ids, 1), 0);
    if v_question_count = 0 then
        raise exception 'No questions provided';
    end if;

    select count(*) into v_valid_count
    from public.brains_heist_questions
    where id = any(p_question_ids)
      and task_group_id = p_task_group_id;

    if v_valid_count <> v_question_count then
        raise exception 'Question not part of task group';
    end if;

    insert into public.brains_heist_battles (
        challenger_id, opponent_id, status, task_group_id, question_ids, start_time
    ) values (
        v_challenger_id, p_opponent_id, 'active', p_task_group_id, p_question_ids, now()
    ) returning id into v_battle_id;

    return v_battle_id;
end;
$$;

create or replace function public.brains_heist_submit_battle_answer(
    p_battle_id uuid,
    p_question_id uuid,
    p_is_correct boolean,
    p_time_taken_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid := auth.uid();
    v_score integer := case when p_is_correct then 1 else 0 end;
    v_battle public.brains_heist_battles%rowtype;
begin
    if v_student_id is null or not public.is_bh_member() then
        raise exception 'BH access denied';
    end if;

    select * into v_battle from public.brains_heist_battles where id = p_battle_id for update;
    if not found then
        raise exception 'Battle not found';
    end if;

    if v_battle.status <> 'active' then
        raise exception 'Battle not active';
    end if;

    if v_student_id <> v_battle.challenger_id and v_student_id <> v_battle.opponent_id then
        raise exception 'Not a participant';
    end if;

    if not (p_question_id = any(v_battle.question_ids)) then
        raise exception 'Question not part of battle';
    end if;

    begin
        insert into public.brains_heist_battle_events (battle_id, student_id, question_id, is_correct, time_taken_ms)
        values (p_battle_id, v_student_id, p_question_id, p_is_correct, p_time_taken_ms);
    exception
        when unique_violation then
            raise exception 'Answer already submitted';
    end;

    if v_student_id = v_battle.challenger_id then
        update public.brains_heist_battles
        set challenger_score = challenger_score + v_score
        where id = p_battle_id;
    else
        update public.brains_heist_battles
        set opponent_score = opponent_score + v_score
        where id = p_battle_id;
    end if;
end;
$$;

create or replace function public.brains_heist_finalize_battle(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_battle public.brains_heist_battles%rowtype;
    v_actor uuid := auth.uid();
begin
    if v_actor is null or not public.is_bh_member() then
        raise exception 'BH access denied';
    end if;

    select * into v_battle from public.brains_heist_battles where id = p_battle_id for update;
    if not found then
        raise exception 'Battle not found';
    end if;

    if v_battle.status <> 'active' then
        raise exception 'Battle not active';
    end if;

    if v_actor <> v_battle.challenger_id and v_actor <> v_battle.opponent_id and not public.is_bh_teacher() then
        raise exception 'BH access denied';
    end if;

    update public.brains_heist_battles
    set status = 'completed',
        end_time = now(),
        winner_id = case
            when challenger_score > opponent_score then challenger_id
            when opponent_score > challenger_score then opponent_id
            else null
        end
    where id = p_battle_id;
end;
$$;

create or replace function public.brains_heist_attack_raid(
    p_raid_id uuid,
    p_question_id uuid,
    p_is_correct boolean,
    p_time_taken_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid := auth.uid();
    v_participant_id uuid;
    v_damage integer := case when p_is_correct then 5 else 0 end;
    v_task_group_id uuid;
begin
    if v_student_id is null or not public.is_bh_member() then
        raise exception 'BH access denied';
    end if;

    select task_group_id into v_task_group_id
    from public.brains_heist_raids
    where id = p_raid_id
    for update;

    if not found then
        raise exception 'Raid not found';
    end if;

    if not exists (
        select 1
        from public.brains_heist_questions
        where id = p_question_id
          and task_group_id = v_task_group_id
    ) then
        raise exception 'Question not valid for this raid';
    end if;

    select id into v_participant_id
    from public.brains_heist_raid_participants
    where raid_id = p_raid_id
      and student_id = v_student_id
    for update;

    if not found then
        insert into public.brains_heist_raid_participants (raid_id, student_id, total_damage)
        values (p_raid_id, v_student_id, 0)
        returning id into v_participant_id;
    end if;

    begin
        insert into public.brains_heist_raid_attacks (raid_id, participant_id, question_id, is_correct, damage)
        values (p_raid_id, v_participant_id, p_question_id, p_is_correct, v_damage);
    exception
        when unique_violation then
            raise exception 'Answer already submitted';
    end;

    update public.brains_heist_raid_participants
    set total_damage = total_damage + v_damage,
        last_attack_at = now()
    where id = v_participant_id;
end;
$$;

create or replace function public.join_raid(p_raid_id uuid)
returns table(participant_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null or not public.is_bh_member() then
        raise exception 'BH access denied';
    end if;

    if not exists (select 1 from public.raids where id = p_raid_id) then
        raise exception 'Raid not found';
    end if;

    insert into public.raid_participants (raid_id, user_id, username)
    values (
        p_raid_id,
        uid,
        coalesce(
            (select username from public.users where id = uid),
            'Anonymous Agent'
        )
    )
    on conflict (raid_id, user_id)
    do update set last_active = now()
    returning id into participant_id;

    return next;
end;
$$;

do $$
begin
    if to_regclass('public.brains_heist_battle_events') is not null then
        execute $$
            delete from public.brains_heist_battle_events a
            using public.brains_heist_battle_events b
            where a.ctid < b.ctid
              and a.battle_id = b.battle_id
              and a.student_id = b.student_id
              and a.question_id = b.question_id;
        $$;
        execute $$
            create unique index if not exists brains_heist_battle_events_unique_answer
            on public.brains_heist_battle_events (battle_id, student_id, question_id);
        $$;
    end if;

    if to_regclass('public.brains_heist_raid_attacks') is not null then
        execute $$
            delete from public.brains_heist_raid_attacks a
            using public.brains_heist_raid_attacks b
            where a.ctid < b.ctid
              and a.raid_id = b.raid_id
              and a.participant_id = b.participant_id
              and a.question_id = b.question_id;
        $$;
        execute $$
            create unique index if not exists brains_heist_raid_attacks_unique_answer
            on public.brains_heist_raid_attacks (raid_id, participant_id, question_id);
        $$;
    end if;
end $$;

do $$
declare
    tbl text;
begin
    foreach tbl in array[
        'public.brains_heist_subjects',
        'public.brains_heist_topics',
        'public.brains_heist_task_groups',
        'public.brains_heist_questions',
        'public.brains_heist_question_variants',
        'public.brains_heist_choices',
        'public.brains_heist_classes',
        'public.brains_heist_class_memberships',
        'public.brains_heist_assignments',
        'public.brains_heist_student_attempts',
        'public.brains_heist_topic_stats',
        'public.brains_heist_task_group_stats',
        'public.brains_heist_progress_map',
        'public.brains_heist_milestones',
        'public.brains_heist_gates',
        'public.brains_heist_adaptive_snapshots',
        'public.brains_heist_battles',
        'public.brains_heist_battle_events',
        'public.brains_heist_raids',
        'public.brains_heist_raid_participants',
        'public.brains_heist_raid_attacks',
        'public.brains_heist_homework_schedule'
    ] loop
        if to_regclass(tbl) is not null then
            execute format('alter table %s enable row level security', tbl);
            execute format('drop policy if exists bh_member_select on %s', tbl);
            execute format('create policy bh_member_select on %s for select using (public.is_bh_member())', tbl);
        end if;
    end loop;
end $$;

do $$
declare
    tbl text;
begin
    foreach tbl in array[
        'public.raids',
        'public.raid_participants',
        'public.raid_events',
        'public.raid_waves'
    ] loop
        if to_regclass(tbl) is not null then
            execute format('alter table %s enable row level security', tbl);
            execute format('drop policy if exists bh_member_select on %s', tbl);
            execute format('create policy bh_member_select on %s for select using (public.is_bh_member())', tbl);
        end if;
    end loop;
end $$;

alter table if exists public.superadmins enable row level security;

do $$
begin
    if to_regclass('public.raid_participants') is not null then
        execute 'drop policy if exists raid_participants_self_insert on public.raid_participants';
        execute $$
            create policy raid_participants_self_insert
                on public.raid_participants
                for insert
                with check (auth.uid() = user_id)
        $$;

        execute 'drop policy if exists raid_participants_self_update on public.raid_participants';
        execute $$
            create policy raid_participants_self_update
                on public.raid_participants
                for update
                using (auth.uid() = user_id)
                with check (auth.uid() = user_id)
        $$;
    end if;
end $$;
