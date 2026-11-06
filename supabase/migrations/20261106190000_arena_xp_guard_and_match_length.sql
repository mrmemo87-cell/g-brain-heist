-- Proving Grounds arena: pay rewards through the XP guard, and allow longer matches.
--
-- users has a trigger (block_direct_xp_level_updates) that rejects XP changes unless the calling
-- RPC sets app.allow_xp_level_write for its transaction, like every other reward RPC does. The
-- arena finish and respawn-answer RPCs did not, so paid matches and correct answers failed with
-- "Direct XP/level updates are not allowed" and students saw "The result could not be saved".
--
-- The match now pauses while a respawn question is open, and a student may switch tabs, so the
-- upper bound on a believable match grows from 4 to 15 minutes. The 40-second lower bound stays.

create or replace function public.rpc_arena_answer_respawn(p_match_id uuid, p_prompt_id uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); p record; v_correct boolean; v_xp integer := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select pr.* into p from private.arena_respawn_prompts pr
  join public.arena_matches m on m.id = pr.match_id
  where pr.id = p_prompt_id and pr.match_id = p_match_id and m.user_id = v_uid and m.finished_at is null
  for update of pr;
  if not found then raise exception 'PROMPT_NOT_FOUND'; end if;
  if p.answered_at is not null then return jsonb_build_object('correct', p.is_correct, 'repeated', true); end if;
  v_correct := (p_answer is not null and p_answer = p.correct_answer);
  update private.arena_respawn_prompts set answered_at = now(), answer_given = p_answer, is_correct = v_correct where id = p_prompt_id;
  if v_correct then
    update public.arena_matches set respawn_correct = respawn_correct + 1 where id = p_match_id;
    v_xp := 2;
    perform set_config('app.allow_xp_level_write', '1', true);
    update public.users set xp = greatest(0, coalesce(xp, 0) + v_xp) where id = v_uid;
  end if;
  if to_regclass('public.question_attempts') is not null then
    insert into public.question_attempts (student_id, question_id, answer_given, is_correct, points_earned)
    values (v_uid, p.question_id, coalesce(p_answer, ''), v_correct, 0);
  end if;
  return jsonb_build_object('correct', v_correct, 'xp', v_xp);
end $$;
revoke all on function public.rpc_arena_answer_respawn(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_arena_answer_respawn(uuid, uuid, text) to authenticated;

create or replace function public.rpc_arena_finish_match(p_match_id uuid, p_score_mine integer, p_score_theirs integer, p_mvp boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); m public.arena_matches%rowtype; r record; v_secs numeric; v_result text;
  v_trophies integer := 0; v_xp integer := 0; v_gems integer := 0; v_paid boolean := false; v_before integer; v_after integer; v_unlocked jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('arena'));
  select * into m from public.arena_matches where id = p_match_id and user_id = v_uid for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.finished_at is not null then
    return jsonb_build_object('result', m.result, 'paid', m.paid, 'trophies_delta', m.trophies_delta, 'xp', m.xp_awarded, 'gems', m.gems_awarded, 'repeated', true);
  end if;
  if p_score_mine is null or p_score_theirs is null or p_score_mine not between 0 and 100 or p_score_theirs not between 0 and 100 then
    raise exception 'INVALID_SCORE';
  end if;
  v_secs := extract(epoch from (now() - m.started_at));
  v_result := case when p_score_mine > p_score_theirs then 'win' when p_score_mine < p_score_theirs then 'loss' else 'draw' end;
  select * into r from private.arena_rules(v_uid);
  -- Pay only for believable matches, inside the rules, within the daily cap.
  if v_secs between 40 and 900 and r.enabled and private.arena_played_today(v_uid) < r.daily_cap then
    v_paid := true;
    v_trophies := case v_result when 'win' then 8 + case when p_mvp then 2 else 0 end when 'loss' then -3 else 0 end;
    v_xp := case v_result when 'win' then 15 when 'loss' then 5 else 8 end;
    v_gems := case v_result when 'win' then 2 when 'draw' then 1 else 0 end;
  end if;
  select coalesce(u.arena_trophies, 0) into v_before from public.users u where u.id = v_uid;
  v_after := greatest(0, v_before + v_trophies);
  v_trophies := v_after - v_before;
  perform set_config('app.allow_xp_level_write', '1', true);
  update public.users
  set arena_trophies = v_after, xp = greatest(0, coalesce(xp, 0) + v_xp), gemstones = greatest(0, coalesce(gemstones, 0) + v_gems)
  where id = v_uid;
  update public.arena_matches
  set finished_at = now(), result = v_result, score_mine = p_score_mine, score_theirs = p_score_theirs, mvp = coalesce(p_mvp, false),
      trophies_delta = v_trophies, xp_awarded = v_xp, gems_awarded = v_gems, paid = v_paid
  where id = p_match_id;
  if v_before < 40 and v_after >= 40 then v_unlocked := v_unlocked || '"vex"'::jsonb; end if;
  if v_before < 100 and v_after >= 100 then v_unlocked := v_unlocked || '"boulder"'::jsonb; end if;
  return jsonb_build_object('result', v_result, 'paid', v_paid, 'trophies_delta', v_trophies, 'trophies', v_after,
    'xp', v_xp, 'gems', v_gems, 'unlocked', v_unlocked, 'played_today', private.arena_played_today(v_uid), 'daily_cap', r.daily_cap);
end $$;
revoke all on function public.rpc_arena_finish_match(uuid, integer, integer, boolean) from public, anon;
grant execute on function public.rpc_arena_finish_match(uuid, integer, integer, boolean) to authenticated;
