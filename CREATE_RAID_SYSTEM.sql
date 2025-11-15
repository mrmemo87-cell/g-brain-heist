-- Raid system schema and RPCs
CREATE TABLE IF NOT EXISTS raids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    boss_id TEXT NOT NULL,
    created_by UUID DEFAULT auth.uid(),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed')),
    wave_config JSONB NOT NULL DEFAULT jsonb_build_object('waves', '[]'::jsonb),
    reward_pool JSONB NOT NULL DEFAULT jsonb_build_object('xp', 500, 'coins', 800, 'badge', 'Neural Siege Victor'),
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raid_waves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raid_id UUID REFERENCES raids(id) ON DELETE CASCADE,
    wave_number SMALLINT NOT NULL CHECK (wave_number BETWEEN 1 AND 3),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    score_threshold INTEGER NOT NULL,
    boss_hp INTEGER NOT NULL,
    spike_questions SMALLINT NOT NULL DEFAULT 2,
    damage INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raid_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raid_id UUID REFERENCES raids(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    username TEXT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    damage INTEGER NOT NULL DEFAULT 0,
    answers_submitted INTEGER NOT NULL DEFAULT 0,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    is_mvp BOOLEAN DEFAULT FALSE,
    UNIQUE (raid_id, user_id)
);

CREATE TABLE IF NOT EXISTS raid_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raid_id UUID REFERENCES raids(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES raid_participants(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION create_raid(p_boss_id TEXT, p_wave_info JSONB)
RETURNS TABLE(raid_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_raid_id UUID;
    creator UUID := auth.uid();
    wave JSONB;
BEGIN
    INSERT INTO raids (boss_id, created_by, status, wave_config)
    VALUES (p_boss_id, creator, 'scheduled', p_wave_info)
    RETURNING id INTO new_raid_id;

    IF p_wave_info ? 'waves' THEN
        FOR wave IN SELECT * FROM jsonb_array_elements(p_wave_info->'waves') LOOP
            INSERT INTO raid_waves (raid_id, wave_number, difficulty, score_threshold, boss_hp, spike_questions)
            VALUES (
                new_raid_id,
                COALESCE((wave->>'waveNumber')::INT, 1),
                COALESCE(wave->>'difficulty', 'easy'),
                COALESCE((wave->>'scoreThreshold')::INT, 5),
                COALESCE((wave->>'bossHp')::INT, 300),
                COALESCE((wave->>'spikeQuestions')::INT, 2)
            );
        END LOOP;
    END IF;

    raid_id := new_raid_id;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION join_raid(p_raid_id UUID)
RETURNS TABLE(participant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid UUID := auth.uid();
BEGIN
    INSERT INTO raid_participants (raid_id, user_id, username)
    VALUES (
        p_raid_id,
        uid,
        COALESCE(
            (SELECT username FROM users WHERE id = uid),
            'Anonymous Agent'
        )
    )
    ON CONFLICT (raid_id, user_id)
    DO UPDATE SET last_active = NOW()
    RETURNING id INTO participant_id;

    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION submit_raid_answer(p_raid_id UUID, p_question_id TEXT, p_answer TEXT, p_time NUMERIC)
RETURNS TABLE(event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid UUID := auth.uid();
    participant UUID;
    payload JSONB := COALESCE(p_answer::jsonb, jsonb_build_object('answer', p_answer));
    damage_delta INTEGER := COALESCE((payload->>'damage')::INT, 0);
    penalty_seconds INTEGER := COALESCE((payload->>'penaltySeconds')::INT, 0);
    current_wave UUID;
BEGIN
    SELECT id INTO participant FROM raid_participants WHERE raid_id = p_raid_id AND user_id = uid;

    INSERT INTO raid_events (raid_id, participant_id, event_type, payload)
    VALUES (
        p_raid_id,
        participant,
        'answer_submitted',
        jsonb_build_object(
            'question_id', p_question_id,
            'time_spent', p_time + penalty_seconds,
            'details', payload
        )
    ) RETURNING id INTO event_id;

    SELECT id INTO current_wave
    FROM raid_waves
    WHERE raid_id = p_raid_id AND completed = FALSE
    ORDER BY wave_number
    LIMIT 1;

    IF current_wave IS NOT NULL AND damage_delta > 0 THEN
        UPDATE raid_waves
        SET damage = LEAST(boss_hp, damage + damage_delta),
            completed = damage + damage_delta >= boss_hp
        WHERE id = current_wave;
    END IF;

    IF participant IS NOT NULL THEN
        UPDATE raid_participants
        SET damage = damage + damage_delta,
            answers_submitted = answers_submitted + 1,
            last_active = NOW()
        WHERE id = participant;
    END IF;

    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_raid(p_raid_id UUID)
RETURNS TABLE(raid_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE raids
    SET status = 'completed',
        ends_at = NOW(),
        updated_at = NOW()
    WHERE id = p_raid_id;

    INSERT INTO raid_events (raid_id, event_type, payload)
    VALUES (p_raid_id, 'raid_finalized', jsonb_build_object('ended_at', NOW()));

    raid_id := p_raid_id;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION get_raid_status(p_raid_id UUID)
RETURNS TABLE (
    id UUID,
    boss_id TEXT,
    status TEXT,
    wave_config JSONB,
    reward_pool JSONB,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, boss_id, status, wave_config, reward_pool, starts_at, ends_at, created_at
    FROM raids
    WHERE id = p_raid_id;
$$;
