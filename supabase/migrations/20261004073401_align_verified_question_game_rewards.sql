-- Academic marks stay unchanged; verified one-mark items use existing game difficulty rates.
create or replace function private.question_game_reward_xp(p_question_id uuid,p_legacy_xp integer)
returns integer language sql stable set search_path to '' as $function$
 select case when q.points=1 and q.verification_status='verified' and q.analytics_eligible
   then case q.difficulty when 'easy' then 15 when 'hard' then 30 else 20 end
   else p_legacy_xp end from public.questions q where q.id=p_question_id;
$function$;
create or replace function private.question_game_reward_coins(p_question_id uuid,p_xp integer,p_legacy_multiplier numeric)
returns integer language sql stable set search_path to '' as $function$
 select floor(p_xp * case when q.points=1 and q.verification_status='verified' and q.analytics_eligible
   then 1.5 else p_legacy_multiplier end)::integer from public.questions q where q.id=p_question_id;
$function$;
revoke all on function private.question_game_reward_xp(uuid,integer),private.question_game_reward_coins(uuid,integer,numeric) from public,anon,authenticated;
grant execute on function private.question_game_reward_xp(uuid,integer),private.question_game_reward_coins(uuid,integer,numeric) to service_role;
CREATE OR REPLACE FUNCTION public.rpc_submit_mcq_answer(p_question_id uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_question record;
  v_is_correct boolean := false;
  v_recent_correct_reward boolean := false;
  v_reward_xp int := 0;
  v_reward_coins int := 0;
  v_xp_delta int := 0;
  v_coins_delta int := 0;
  v_duplicate boolean := false;
  v_profile record;
  v_previous_level int := 1;
  v_xp_status jsonb := null;
  v_cap_result jsonb;
BEGIN
  PERFORM set_config('app.allow_xp_level_write', '1', true);
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;


  perform 1 from public.users where id=v_user_id and role='student'
    and not coalesce(is_admin,false) and not coalesce(is_banned,false);
  if not found then raise exception 'student_gameplay_only'; end if;

  if p_question_id is null then
    raise exception 'Missing question id';
  end if;

  select id, correct_answer, points, is_active, is_public
  into v_question
  from public.questions
  where id = p_question_id;

  if not found then
    raise exception 'Question not found';
  end if;

  if v_question.is_active is false then
    raise exception 'Question is inactive';
  end if;

  if v_question.is_public is false then
    raise exception 'Question is not public';
  end if;

  v_is_correct := (p_answer = v_question.correct_answer);
  v_reward_xp := private.question_game_reward_xp(p_question_id,coalesce(v_question.points,20));
  v_reward_coins := floor(v_reward_xp * 1.5);

  if v_is_correct then
    perform pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(p_question_id::text)
    );

    select exists (
      select 1
      from public.question_attempts qa
      where qa.student_id = v_user_id
        and qa.question_id = p_question_id
        and qa.is_correct = true
        and qa.attempted_at > now() - interval '24 hours'
    )
    into v_recent_correct_reward;
  end if;

  if v_is_correct and not v_recent_correct_reward then
    v_xp_delta := v_reward_xp;
    v_coins_delta := v_reward_coins;
  elsif v_is_correct and v_recent_correct_reward then
    v_duplicate := true;
    v_xp_delta := 0;
    v_coins_delta := 0;
  else
    v_xp_delta := -5;
    v_coins_delta := 0;
  end if;

  if v_xp_delta>0 or v_coins_delta>0 then
    v_cap_result:=public.consume_student_reward_caps(v_user_id,greatest(v_xp_delta,0),greatest(v_coins_delta,0));
    v_xp_delta:=(v_cap_result->>'granted_xp')::integer;
    v_coins_delta:=(v_cap_result->>'granted_coins')::integer;
  end if;

  insert into public.question_attempts (
    student_id,
    question_id,
    answer_given,
    is_correct,
    points_earned
  ) values (
    v_user_id,
    p_question_id,
    p_answer,
    v_is_correct,
    case when v_is_correct and not v_recent_correct_reward then v_xp_delta else 0 end
  );

  update public.questions
  set times_answered = coalesce(times_answered, 0) + 1,
      times_correct = coalesce(times_correct, 0) + case when v_is_correct then 1 else 0 end
  where id = p_question_id;

  select xp, coins, level, gemstones
  into v_profile
  from public.users
  where id = v_user_id
  for update;

  v_previous_level := coalesce(v_profile.level, 1);

  if v_xp_delta <> 0 or v_coins_delta <> 0 then
    update public.users
    set xp = greatest(0, xp + v_xp_delta),
        coins = greatest(0, coins + v_coins_delta)
    where id = v_user_id
    returning xp, coins, level, gemstones
    into v_profile;
  end if;

  select to_jsonb(xp_status(p_xp => v_profile.xp)) into v_xp_status;

  return jsonb_build_object(
    'correct', v_is_correct,
    'duplicate_reward', v_duplicate,
    'reward_capped',coalesce((v_cap_result->>'blocked_xp')::integer,0)>0 or coalesce((v_cap_result->>'blocked_coins')::integer,0)>0,
    'deltas', jsonb_build_object(
      'xp', v_xp_delta,
      'coins', v_coins_delta,
      'gemstones', 0
    ),
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones,
      'xp_status', v_xp_status
    ),
    'previous_level', v_previous_level
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_quest_answer_node(p_run_id uuid, p_node_index integer, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
  v_node JSONB;
  v_question_id UUID;
  v_correct_answer TEXT;
  v_is_correct BOOLEAN;
  v_reward_xp INTEGER;
  v_reward_coins INTEGER;
  v_xp_delta INTEGER := 0;
  v_coins_delta INTEGER := 0;
  v_new_streak INTEGER;
  v_next_node INTEGER;
  v_new_status TEXT := 'active';
  v_route JSONB;
  v_profile RECORD;
  v_duplicate BOOLEAN := false;
  v_node_count INTEGER;
  v_explanation TEXT;
  v_time_taken_ms INTEGER;
  v_cap_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;


  perform 1 from public.users where id=v_user_id and role='student'
    and not coalesce(is_admin,false) and not coalesce(is_banned,false);
  if not found then raise exception 'student_gameplay_only'; end if;

  -- Allow guarded XP/coins profile writes inside this server-authoritative RPC.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  -- Lock the run row to prevent concurrent modifications
  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest run not found or already completed';
  END IF;

  IF v_run.current_node <> p_node_index THEN
    RAISE EXCEPTION 'Node index mismatch. Expected %, got %', v_run.current_node, p_node_index;
  END IF;

  v_route := v_run.route;
  v_node := v_route->p_node_index;
  v_node_count := jsonb_array_length(v_route);

  IF v_node->>'type' NOT IN ('question', 'elite_question') THEN
    RAISE EXCEPTION 'Node % is not a question node', p_node_index;
  END IF;

  IF v_node->>'state' <> 'active' THEN
    RAISE EXCEPTION 'Node % is not active', p_node_index;
  END IF;

  v_question_id := (v_node->>'question_id')::uuid;
  v_correct_answer := v_node->>'correct_option';
  v_explanation := v_node->>'explanation';

  -- Validate answer
  v_is_correct := (p_answer = v_correct_answer);

  -- Calculate rewards (mirrors rpc_submit_mcq_answer logic)
  IF v_is_correct THEN
    -- Advisory lock per user+question to prevent double-dipping
    PERFORM pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(COALESCE(v_question_id::text, p_run_id::text))
    );

    -- Check for recent duplicate
    SELECT EXISTS (
      SELECT 1
      FROM question_attempts
      WHERE student_id = v_user_id
        AND question_id = v_question_id
        AND is_correct = true
        AND attempted_at > now() - interval '24 hours'
    ) INTO v_duplicate;

    IF NOT v_duplicate THEN
      v_reward_xp := COALESCE((v_node->'points')::int,
        CASE (v_node->>'difficulty')
          WHEN 'easy' THEN 15
          WHEN 'hard' THEN 30
          ELSE 20
        END);
      v_reward_xp := coalesce(private.question_game_reward_xp(v_question_id,v_reward_xp),v_reward_xp);
      v_reward_coins := floor(v_reward_xp * 1.5);
      v_xp_delta := v_reward_xp;
      v_coins_delta := v_reward_coins;
    END IF;
  ELSE
    -- Wrong answer: small XP penalty (matches existing behavior)
    v_xp_delta := -5;
    v_coins_delta := 0;
  END IF;

  -- Consume shared reward caps before balances and run totals are updated.
  IF v_xp_delta > 0 OR v_coins_delta > 0 THEN
    v_cap_result := public.consume_student_reward_caps(
      v_user_id,
      GREATEST(v_xp_delta, 0),
      GREATEST(v_coins_delta, 0)
    );
    IF v_xp_delta > 0 THEN
      v_xp_delta := COALESCE((v_cap_result->>'granted_xp')::int, 0);
    END IF;
    IF v_coins_delta > 0 THEN
      v_coins_delta := COALESCE((v_cap_result->>'granted_coins')::int, 0);
    END IF;
  END IF;

  -- Record the attempt in question_attempts (same as MCQ flow)
  IF v_question_id IS NOT NULL THEN
    INSERT INTO question_attempts (student_id, question_id, answer_given, is_correct, points_earned)
    VALUES (v_user_id, v_question_id, p_answer, v_is_correct,
      CASE WHEN v_is_correct AND NOT v_duplicate THEN v_xp_delta ELSE 0 END);

    -- Update question stats
    UPDATE questions
    SET times_answered = COALESCE(times_answered, 0) + 1,
        times_correct  = COALESCE(times_correct, 0) + CASE WHEN v_is_correct THEN 1 ELSE 0 END
    WHERE id = v_question_id;
  END IF;

  -- Update user profile
  IF v_xp_delta <> 0 OR v_coins_delta <> 0 THEN
    UPDATE users
    SET xp = GREATEST(0, xp + v_xp_delta),
        coins = GREATEST(0, coins + v_coins_delta),
        xp_from_quests = COALESCE(xp_from_quests, 0) + GREATEST(0, v_xp_delta),
        coins_from_quests = COALESCE(coins_from_quests, 0) + GREATEST(0, v_coins_delta)
    WHERE id = v_user_id;
  END IF;

  -- Update streak
  v_new_streak := CASE WHEN v_is_correct THEN v_run.streak + 1 ELSE 0 END;

  -- Advance route state
  v_next_node := p_node_index + 1;

  -- Mark current node as cleared, next as active
  v_route := (
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'index')::int = p_node_index THEN
          elem || '{"state":"cleared"}'::jsonb
        WHEN (elem->>'index')::int = v_next_node THEN
          elem || '{"state":"active"}'::jsonb
        ELSE elem
      END
      ORDER BY (elem->>'index')::int
    )
    FROM jsonb_array_elements(v_route) AS elem
  );

  -- Check if we've reached the end
  IF v_next_node >= v_node_count THEN
    v_new_status := 'completed';
  END IF;

  -- Update the run
  UPDATE quest_runs
  SET current_node = v_next_node,
      streak = v_new_streak,
      rewards_xp = rewards_xp + GREATEST(0, v_xp_delta),
      rewards_coins = rewards_coins + GREATEST(0, v_coins_delta),
      route = v_route,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_run_id;

  -- Log node attempt
  INSERT INTO quest_run_nodes (run_id, node_index, node_type, question_id, answer_given, is_correct, xp_delta, coins_delta)
  VALUES (p_run_id, p_node_index, v_node->>'type', v_question_id, p_answer, v_is_correct, v_xp_delta, v_coins_delta);

  -- Get updated profile
  SELECT xp, coins, level, gemstones INTO v_profile
  FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'duplicate_reward', v_duplicate,
    'deltas', jsonb_build_object('xp', v_xp_delta, 'coins', v_coins_delta),
    'streak', v_new_streak,
    'next_node_index', v_next_node,
    'run_status', v_new_status,
    'explanation', CASE
      WHEN v_is_correct THEN COALESCE(v_explanation, 'Well done, agent!')
      ELSE 'Incorrect. ' || COALESCE(v_explanation, 'The correct answer was: ' || v_correct_answer)
    END,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_question_attempt(p_question_id uuid, p_answer_given text, p_time_taken integer DEFAULT NULL::integer, p_quest_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_question RECORD;
  v_is_correct BOOLEAN;
  v_recent_correct_reward BOOLEAN := FALSE;
  v_points_earned INTEGER := 0;
  v_coins_earned INTEGER := 0;
  v_duplicate_reward BOOLEAN := FALSE;
  v_profile RECORD;
  v_xp_status JSONB := NULL;
  v_cap_result jsonb;
BEGIN
  PERFORM set_config('app.allow_xp_level_write', '1', true);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;


  perform 1 from public.users where id=v_user_id and role='student'
    and not coalesce(is_admin,false) and not coalesce(is_banned,false);
  if not found then raise exception 'student_gameplay_only'; end if;

  -- Get question details
  SELECT * INTO v_question FROM questions WHERE id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  if not coalesce(v_question.is_active,false) then
    raise exception 'Question is inactive';
  end if;

  -- Check if answer is correct (case-insensitive comparison)
  v_is_correct := LOWER(TRIM(p_answer_given)) = LOWER(TRIM(v_question.correct_answer));

  -- Calculate rewards atomically under per-user/question lock
  IF v_is_correct THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(p_question_id::text)
    );

    SELECT EXISTS (
      SELECT 1
      FROM question_attempts qa
      WHERE qa.student_id = v_user_id
        AND qa.question_id = p_question_id
        AND qa.is_correct = true
        AND qa.attempted_at > NOW() - INTERVAL '24 hours'
    ) INTO v_recent_correct_reward;

    IF NOT v_recent_correct_reward THEN
      v_points_earned := private.question_game_reward_xp(p_question_id,coalesce(v_question.points,0));
      v_coins_earned := greatest(0,private.question_game_reward_coins(p_question_id,v_points_earned,0.5));
    ELSE
      v_duplicate_reward := TRUE;
    END IF;
  END IF;

  if v_points_earned>0 or v_coins_earned>0 then
    v_cap_result:=public.consume_student_reward_caps(v_user_id,greatest(v_points_earned,0),greatest(v_coins_earned,0));
    v_points_earned:=(v_cap_result->>'granted_xp')::integer;
    v_coins_earned:=(v_cap_result->>'granted_coins')::integer;
  end if;

  -- Record the attempt
  INSERT INTO question_attempts (
    student_id, question_id, quest_session_id,
    answer_given, is_correct, time_taken, points_earned
  ) VALUES (
    v_user_id, p_question_id, p_quest_session_id,
    p_answer_given, v_is_correct, p_time_taken, v_points_earned
  );

  -- Update rewards in same transaction to avoid race with client-side reward application
  SELECT xp, coins, level, gemstones
  INTO v_profile
  FROM users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_points_earned <> 0 OR v_coins_earned <> 0 THEN
    UPDATE users
    SET xp = GREATEST(0, xp + v_points_earned),
        coins = GREATEST(0, coins + v_coins_earned),
        updated_at = NOW()
    WHERE id = v_user_id
    RETURNING xp, coins, level, gemstones
    INTO v_profile;
  END IF;

  -- Update question stats
  UPDATE questions
  SET times_answered = times_answered + 1,
      times_correct = times_correct + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
  WHERE id = p_question_id;

  SELECT to_jsonb(xp_status(p_xp => v_profile.xp)) INTO v_xp_status;

  -- Return result
  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'points_earned', v_points_earned,
    'coins_earned',v_coins_earned,
    'reward_capped',coalesce((v_cap_result->>'blocked_xp')::integer,0)>0 or coalesce((v_cap_result->>'blocked_coins')::integer,0)>0,
    'correct_answer', v_question.correct_answer,
    'duplicate_reward', v_duplicate_reward,
    'explanation', v_question.explanation,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones,
      'xp_status', v_xp_status
    )
  );
END;
$function$;


revoke all on function public.rpc_submit_mcq_answer(uuid,text) from public,anon;
grant execute on function public.rpc_submit_mcq_answer(uuid,text) to authenticated,service_role;

revoke all on function public.rpc_quest_answer_node(uuid,integer,text) from public,anon;
grant execute on function public.rpc_quest_answer_node(uuid,integer,text) to authenticated,service_role;

revoke all on function public.record_question_attempt(uuid,text,integer,uuid) from public,anon;
grant execute on function public.record_question_attempt(uuid,text,integer,uuid) to authenticated,service_role;
