-- =========================================
-- Brains Heist Supabase Schema + RPC Layer
-- =========================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ========= Core Reference Tables =========
create table if not exists brains_heist_subjects (
    id uuid primary key default uuid_generate_v4(),
    name text not null unique,
    description text,
    created_at timestamptz not null default now(),
    created_by uuid not null references auth.users (id),
    updated_at timestamptz not null default now(),
    updated_by uuid not null references auth.users (id)
);

create table if not exists brains_heist_topics (
    id uuid primary key default uuid_generate_v4(),
    subject_id uuid not null references brains_heist_subjects (id) on delete cascade,
    name text not null,
    description text,
    difficulty integer not null check (difficulty between 1 and 5),
    order_index integer not null default 0,
    created_at timestamptz not null default now(),
    created_by uuid not null references auth.users (id),
    updated_at timestamptz not null default now(),
    updated_by uuid not null references auth.users (id),
    unique (subject_id, name)
);

create table if not exists brains_heist_task_groups (
    id uuid primary key default uuid_generate_v4(),
    topic_id uuid not null references brains_heist_topics (id) on delete cascade,
    teacher_id uuid not null references auth.users (id),
    name text not null,
    description text,
    icon text,
    difficulty integer check (difficulty between 1 and 5),
    order_index integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (topic_id, name)
);

create table if not exists brains_heist_questions (
    id uuid primary key default uuid_generate_v4(),
    task_group_id uuid not null references brains_heist_task_groups (id) on delete cascade,
    teacher_id uuid not null references auth.users (id),
    prompt text not null,
    explanation text,
    question_type text not null check (question_type in ('multiple_choice','short_answer','true_false','numeric','ordering')),
    difficulty integer check (difficulty between 1 and 5),
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists brains_heist_question_variants (
    id uuid primary key default uuid_generate_v4(),
    question_id uuid not null references brains_heist_questions (id) on delete cascade,
    variant_label text not null,
    prompt_override text,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (question_id, variant_label)
);

create table if not exists brains_heist_choices (
    id uuid primary key default uuid_generate_v4(),
    question_id uuid not null references brains_heist_questions (id) on delete cascade,
    choice_text text not null,
    is_correct boolean not null default false,
    order_index integer not null default 0
);

-- ========= Teacher + Class Management =========
create table if not exists brains_heist_classes (
    id uuid primary key default uuid_generate_v4(),
    teacher_id uuid not null references auth.users (id),
    name text not null,
    description text,
    grade_level text,
    created_at timestamptz not null default now(),
    unique (teacher_id, name)
);

create table if not exists brains_heist_class_memberships (
    id uuid primary key default uuid_generate_v4(),
    class_id uuid not null references brains_heist_classes (id) on delete cascade,
    student_id uuid not null references auth.users (id),
    role text not null default 'student' check (role in ('student','assistant')),
    created_at timestamptz not null default now(),
    unique (class_id, student_id)
);

create table if not exists brains_heist_assignments (
    id uuid primary key default uuid_generate_v4(),
    class_id uuid not null references brains_heist_classes (id) on delete cascade,
    task_group_id uuid not null references brains_heist_task_groups (id),
    teacher_id uuid not null references auth.users (id),
    title text not null,
    instructions text,
    start_at timestamptz not null,
    due_at timestamptz,
    created_at timestamptz not null default now(),
    unique (class_id, task_group_id, start_at)
);

-- ========= Student Progress Tracking =========
create table if not exists brains_heist_student_attempts (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references auth.users (id),
    question_id uuid not null references brains_heist_questions (id),
    variant_id uuid references brains_heist_question_variants (id),
    task_group_id uuid not null references brains_heist_task_groups (id),
    topic_id uuid not null references brains_heist_topics (id),
    submitted_at timestamptz not null default now(),
    is_correct boolean not null,
    time_taken_ms integer check (time_taken_ms >= 0),
    answer_payload jsonb default '{}'::jsonb,
    source text not null default 'mission' check (source in ('mission','battle','raid','homework','practice')),
    unique (student_id, question_id, submitted_at)
);

create table if not exists brains_heist_topic_stats (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references auth.users (id),
    topic_id uuid not null references brains_heist_topics (id),
    attempts integer not null default 0,
    correct integer not null default 0,
    mastery_score numeric(5,2) not null default 0,
    last_updated timestamptz not null default now(),
    unique (student_id, topic_id)
);

create table if not exists brains_heist_task_group_stats (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references auth.users (id),
    task_group_id uuid not null references brains_heist_task_groups (id),
    attempts integer not null default 0,
    correct integer not null default 0,
    mastery_score numeric(5,2) not null default 0,
    last_updated timestamptz not null default now(),
    unique (student_id, task_group_id)
);

create table if not exists brains_heist_progress_map (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references auth.users (id),
    topic_id uuid not null references brains_heist_topics (id),
    status text not null check (status in ('locked','struggled','average','crushed','mastered')),
    gate_id uuid,
    milestone_id uuid,
    updated_at timestamptz not null default now(),
    unique (student_id, topic_id)
);

create table if not exists brains_heist_milestones (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    description text,
    topic_id uuid references brains_heist_topics (id),
    order_index integer not null default 0,
    reward jsonb default '{}'::jsonb
);

create table if not exists brains_heist_gates (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    description text,
    requirement jsonb not null,
    unlocks_topic_id uuid not null references brains_heist_topics (id),
    order_index integer not null default 0
);

create table if not exists brains_heist_adaptive_snapshots (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references auth.users (id),
    weak_topics uuid[] not null,
    recommended_task_group_ids uuid[] not null,
    mastery_level numeric(5,2) not null,
    generated_at timestamptz not null default now()
);

-- ========= PvP Battles =========
create table if not exists brains_heist_battles (
    id uuid primary key default uuid_generate_v4(),
    challenger_id uuid not null references auth.users (id),
    opponent_id uuid not null references auth.users (id),
    status text not null default 'pending' check (status in ('pending','active','completed','canceled')),
    task_group_id uuid references brains_heist_task_groups (id),
    question_ids uuid[] not null,
    start_time timestamptz,
    end_time timestamptz,
    challenger_score integer not null default 0,
    opponent_score integer not null default 0,
    winner_id uuid references auth.users (id),
    created_at timestamptz not null default now()
);

create table if not exists brains_heist_battle_events (
    id uuid primary key default uuid_generate_v4(),
    battle_id uuid not null references brains_heist_battles (id) on delete cascade,
    student_id uuid not null references auth.users (id),
    question_id uuid not null references brains_heist_questions (id),
    is_correct boolean not null,
    time_taken_ms integer check (time_taken_ms >= 0),
    submitted_at timestamptz not null default now()
);

-- ========= PvE Raids/Bosses =========
create table if not exists brains_heist_raids (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    description text,
    boss_hp integer not null,
    topic_id uuid not null references brains_heist_topics (id),
    task_group_id uuid references brains_heist_task_groups (id),
    start_at timestamptz not null,
    end_at timestamptz,
    created_by uuid not null references auth.users (id),
    created_at timestamptz not null default now()
);

create table if not exists brains_heist_raid_participants (
    id uuid primary key default uuid_generate_v4(),
    raid_id uuid not null references brains_heist_raids (id) on delete cascade,
    student_id uuid not null references auth.users (id),
    team text not null default 'alpha',
    total_damage integer not null default 0,
    last_attack_at timestamptz,
    unique (raid_id, student_id)
);

create table if not exists brains_heist_raid_attacks (
    id uuid primary key default uuid_generate_v4(),
    raid_id uuid not null references brains_heist_raids (id) on delete cascade,
    participant_id uuid not null references brains_heist_raid_participants (id) on delete cascade,
    question_id uuid not null references brains_heist_questions (id),
    is_correct boolean not null,
    damage integer not null default 0,
    submitted_at timestamptz not null default now()
);

-- ========= Mission Scheduling =========
create table if not exists brains_heist_homework_schedule (
    id uuid primary key default uuid_generate_v4(),
    task_group_id uuid not null references brains_heist_task_groups (id),
    teacher_id uuid not null references auth.users (id),
    title text not null,
    details text,
    start_at timestamptz not null,
    end_at timestamptz,
    target_class_ids uuid[] not null,
    created_at timestamptz not null default now()
);

-- ========= RLS Policy Sketch (Comments) =========
-- enable row level security on tables and define policies:
-- e.g., alter table brains_heist_student_attempts enable row level security;
-- create policy "Students read own attempts" on brains_heist_student_attempts
--     for select using (auth.uid() = student_id);
-- create policy "Students insert own attempts" on brains_heist_student_attempts
--     for insert with check (auth.uid() = student_id);
-- Teachers filtered by their classes etc.
-- Optional role column to allow admin bypass.

-- ========= RPC Functions =========

-- 1. Teacher Content Management
create or replace function brains_heist_create_question(
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
    v_teacher_id uuid := auth.uid();
    v_choice jsonb;
    v_index integer := 0;
begin
    insert into brains_heist_questions (
        task_group_id, teacher_id, prompt, question_type, difficulty, metadata
    ) values (
        p_task_group_id, v_teacher_id, p_prompt, p_question_type, p_difficulty, coalesce(p_metadata,'{}'::jsonb)
    ) returning id into v_question_id;

    if p_choices is not null then
        for v_choice in select * from jsonb_array_elements(p_choices)
        loop
            insert into brains_heist_choices (question_id, choice_text, is_correct, order_index)
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

create or replace function brains_heist_update_question(
    p_question_id uuid,
    p_prompt text,
    p_question_type text,
    p_difficulty integer,
    p_metadata jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
    update brains_heist_questions
    set prompt = coalesce(p_prompt, prompt),
        question_type = coalesce(p_question_type, question_type),
        difficulty = coalesce(p_difficulty, difficulty),
        metadata = coalesce(p_metadata, metadata),
        updated_at = now()
    where id = p_question_id
      and teacher_id = auth.uid();
$$;

create or replace function brains_heist_delete_question(p_question_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
    delete from brains_heist_questions
    where id = p_question_id
      and teacher_id = auth.uid();
$$;

-- 2. Logging Student Answers
create or replace function brains_heist_log_attempt(
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
begin
    insert into brains_heist_student_attempts (
        student_id, question_id, variant_id, task_group_id, topic_id, is_correct,
        time_taken_ms, answer_payload, source
    ) values (
        v_student_id, p_question_id, p_variant_id, p_task_group_id, p_topic_id, p_is_correct,
        p_time_taken_ms, coalesce(p_answer_payload,'{}'::jsonb), p_source
    ) returning id into v_attempt_id;

    -- upsert topic stats
    insert into brains_heist_topic_stats (student_id, topic_id, attempts, correct, mastery_score)
    values (v_student_id, p_topic_id, 1, case when p_is_correct then 1 else 0 end, case when p_is_correct then 1 else 0 end)
    on conflict (student_id, topic_id)
    do update set
        attempts = brains_heist_topic_stats.attempts + 1,
        correct = brains_heist_topic_stats.correct + (case when excluded.correct > 0 then 1 else 0 end),
        mastery_score = greatest(0, least(100,
            (brains_heist_topic_stats.correct + (case when p_is_correct then 1 else 0 end))::numeric
            / (brains_heist_topic_stats.attempts + 1) * 100
        )),
        last_updated = now();

    -- upsert task group stats
    insert into brains_heist_task_group_stats (student_id, task_group_id, attempts, correct, mastery_score)
    values (v_student_id, p_task_group_id, 1, case when p_is_correct then 1 else 0 end, case when p_is_correct then 1 else 0 end)
    on conflict (student_id, task_group_id)
    do update set
        attempts = brains_heist_task_group_stats.attempts + 1,
        correct = brains_heist_task_group_stats.correct + (case when excluded.correct > 0 then 1 else 0 end),
        mastery_score = greatest(0, least(100,
            (brains_heist_task_group_stats.correct + (case when p_is_correct then 1 else 0 end))::numeric
            / (brains_heist_task_group_stats.attempts + 1) * 100
        )),
        last_updated = now();

    return v_attempt_id;
end;
$$;

-- 3. Performance Summary
create or replace function brains_heist_get_performance_summary(p_student_id uuid)
returns table (
    topic_id uuid,
    attempts integer,
    correct integer,
    mastery_score numeric
)
language sql
security definer
set search_path = public
as $$
    select topic_id, attempts, correct, mastery_score
    from brains_heist_topic_stats
    where student_id = coalesce(p_student_id, auth.uid());
$$;

-- 4. PvP Battle Lifecycle
create or replace function brains_heist_create_battle(
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
begin
    insert into brains_heist_battles (
        challenger_id, opponent_id, status, task_group_id, question_ids, start_time
    ) values (
        v_challenger_id, p_opponent_id, 'active', p_task_group_id, p_question_ids, now()
    ) returning id into v_battle_id;

    return v_battle_id;
end;
$$;

create or replace function brains_heist_submit_battle_answer(
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
    v_damage integer := case when p_is_correct then 10 else 0 end;
    v_score integer := case when p_is_correct then 1 else 0 end;
    v_battle brains_heist_battles%rowtype;
begin
    select * into v_battle from brains_heist_battles where id = p_battle_id for update;

    if v_battle.status <> 'active' then
        raise exception 'Battle not active';
    end if;

    insert into brains_heist_battle_events (battle_id, student_id, question_id, is_correct, time_taken_ms)
    values (p_battle_id, v_student_id, p_question_id, p_is_correct, p_time_taken_ms);

    if v_student_id = v_battle.challenger_id then
        update brains_heist_battles
        set challenger_score = challenger_score + v_score
        where id = p_battle_id;
    elsif v_student_id = v_battle.opponent_id then
        update brains_heist_battles
        set opponent_score = opponent_score + v_score
        where id = p_battle_id;
    else
        raise exception 'Not a participant';
    end if;
end;
$$;

create or replace function brains_heist_finalize_battle(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_battle brains_heist_battles%rowtype;
begin
    select * into v_battle from brains_heist_battles where id = p_battle_id for update;

    if v_battle.status <> 'active' then
        raise exception 'Battle not active';
    end if;

    update brains_heist_battles
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

-- 5. Progress Map Data
create or replace function brains_heist_get_progress_map(p_student_id uuid)
returns table (
    topic_id uuid,
    status text,
    gate_id uuid,
    milestone_id uuid,
    mastery_score numeric
)
language sql
security definer
set search_path = public
as $$
    select pm.topic_id,
           pm.status,
           pm.gate_id,
           pm.milestone_id,
           ts.mastery_score
    from brains_heist_progress_map pm
    left join brains_heist_topic_stats ts
      on ts.topic_id = pm.topic_id
     and ts.student_id = pm.student_id
    where pm.student_id = coalesce(p_student_id, auth.uid());
$$;

-- 6. Adaptive Snapshot Generator
create or replace function brains_heist_generate_adaptive_snapshot(p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_snapshot_id uuid;
    v_weak_topics uuid[];
    v_recommended uuid[];
begin
    select array_agg(topic_id order by mastery_score asc)
    into v_weak_topics
    from (
        select topic_id, mastery_score
        from brains_heist_topic_stats
        where student_id = p_student_id
        order by mastery_score asc
        limit 3
    ) t;

    select array_agg(task_group_id)
    into v_recommended
    from (
        select tgs.task_group_id
        from brains_heist_task_group_stats tgs
        where tgs.student_id = p_student_id
        order by mastery_score asc
        limit 3
    ) t;

    insert into brains_heist_adaptive_snapshots (
        student_id, weak_topics, recommended_task_group_ids, mastery_level
    ) values (
        p_student_id,
        coalesce(v_weak_topics, '{}'::uuid[]),
        coalesce(v_recommended, '{}'::uuid[]),
        coalesce((
            select avg(mastery_score)
            from brains_heist_topic_stats
            where student_id = p_student_id
        ), 0)
    ) returning id into v_snapshot_id;

    return v_snapshot_id;
end;
$$;

-- 7. Raid Damage Logging
create or replace function brains_heist_attack_raid(
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
begin
    select id into v_participant_id
    from brains_heist_raid_participants
    where raid_id = p_raid_id
      and student_id = v_student_id
    for update;

    if not found then
        insert into brains_heist_raid_participants (raid_id, student_id, total_damage)
        values (p_raid_id, v_student_id, 0)
        returning id into v_participant_id;
    end if;

    insert into brains_heist_raid_attacks (raid_id, participant_id, question_id, is_correct, damage)
    values (p_raid_id, v_participant_id, p_question_id, p_is_correct, v_damage);

    update brains_heist_raid_participants
    set total_damage = total_damage + v_damage,
        last_attack_at = now()
    where id = v_participant_id;
end;
$$;
