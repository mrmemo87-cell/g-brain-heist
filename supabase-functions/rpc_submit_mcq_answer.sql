-- Atomic MCQ answer submission (server-authoritative rewards)
-- Handles attempt recording, reward eligibility, and XP/coins updates in one transaction.

create or replace function public.rpc_submit_mcq_answer(
  p_question_id uuid,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_question record;
  v_is_correct boolean := false;
  v_reward_xp int := 0;
  v_reward_coins int := 0;
  v_xp_delta int := 0;
  v_coins_delta int := 0;
  v_duplicate boolean := false;
  v_profile record;
  v_previous_level int := 1;
  v_xp_status jsonb := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

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
  v_reward_xp := coalesce(v_question.points, 20);
  v_reward_coins := floor(v_reward_xp * 1.5);

  if v_is_correct then
    v_xp_delta := v_reward_xp;
    v_coins_delta := v_reward_coins;
  else
    v_xp_delta := -5;
    v_coins_delta := 0;
  end if;

  begin
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
      case when v_is_correct then v_reward_xp else 0 end
    );
  exception when unique_violation then
    if v_is_correct then
      v_duplicate := true;
      v_xp_delta := 0;
      v_coins_delta := 0;
    end if;
  end;

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
$$;

grant execute on function public.rpc_submit_mcq_answer(uuid, text) to authenticated;
