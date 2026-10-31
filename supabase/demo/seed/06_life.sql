-- Demo seed 06: student life. Daily missions, streaks, XP and levels, Class Conquest,
-- clans, battles, shop purchases and achievements, all through the real game RPCs
-- (missions and rewards use the same code students trigger from the app), then moved
-- to their day in the story.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

-- How often a student plays (share of days with a completed mission), by story profile.
create or replace function private.demo_play_rate(p_key text, p_day date) returns numeric
language plpgsql stable as $$
declare
  v_story text := (select story from private.demo_people where key = p_key);
  v_class text := (select class_code from private.demo_people where key = p_key);
  v_seed numeric := (('x' || substr(md5(p_key || 'rate'), 1, 2))::bit(8)::integer) / 255.0;
  v_rate numeric;
begin
  v_rate := case v_story
    when 'strong' then 0.85
    when 'perfect_recovered' then 0.70
    when 'perfect_still_measuring' then 0.55
    when 'perfect_no_change' then 0.35
    when 'slipping_agreement' then 0.45
    when 'low_data' then 0.15
    else 0.45 + 0.30 * v_seed end;
  -- Class Conquest week of 26 Oct: 7A pushed hard and won; 7B is coming back this week.
  if p_day between date '2026-10-26' and date '2026-10-30' then
    v_rate := case when v_class = '7A' then least(0.97, v_rate + 0.25) else v_rate end;
  end if;
  if p_day >= date '2026-11-02' and v_class = '7B' then v_rate := least(0.97, v_rate + 0.25); end if;
  return v_rate;
end $$;

create or replace function private.demo_accuracy(p_key text) returns numeric
language sql stable as $$
  select case story when 'strong' then 0.92 when 'perfect_recovered' then 0.80 when 'low_data' then 0.60 else 0.72 end
  from private.demo_people where key = p_key
$$;

-- Deterministic pseudo-random number in [0,1) from a label.
create or replace function private.demo_rand(p_label text) returns numeric
language sql immutable as $$
  select (('x' || substr(md5(p_label), 1, 6))::bit(24)::integer) / 16777216.0
$$;

-- Move everything created in the current step to p_at, so the story has believable
-- timestamps. The whole seed runs in one transaction, so now() is the transaction start
-- and every row created in this transaction and not yet moved still carries created_at
-- = now(); rows moved by earlier steps are already in the past and are left alone.
create or replace procedure private.demo_backdate(p_since timestamptz, p_at timestamptz)
language plpgsql as $$
declare v_from timestamptz := least(p_since, now());
begin
  set local session_replication_role = replica;
  update public.activities set created_at = p_at where created_at >= v_from;
  update public.question_attempts set attempted_at = p_at where attempted_at >= v_from;
  update public.notifications set created_at = p_at where created_at >= v_from;
  update public.user_achievements set unlocked_at = p_at, earned_at = p_at, created_at = p_at, updated_at = p_at where created_at >= v_from;
  update public.pvp_attack_attempts set created_at = p_at where created_at >= v_from;
  update public.shop_purchases set created_at = p_at where created_at >= v_from;
  update public.inventory set created_at = p_at where created_at >= v_from;
  update public.clan_chat set created_at = p_at where created_at >= v_from;
  update public.clans set created_at = p_at, updated_at = p_at where created_at >= v_from;
  update public.clan_members set joined_at = p_at where joined_at >= v_from;
  update public.reward_event_receipts set created_at = p_at where created_at >= v_from;
  update public.daily_streak_rewards set created_at = p_at where created_at >= v_from;
  set local session_replication_role = origin;
end $$;

-- ---------------------------------------------------------------------------
-- A. Daily missions and streaks for the last 4 weeks (up to yesterday).
-- ---------------------------------------------------------------------------
create or replace procedure private.demo_play_day(p_key text, p_day date)
language plpgsql as $$
declare
  v_uid uuid := (select user_id from private.demo_people where key = p_key);
  v_mission public.daily_missions;
  v_q record; v_answer text; v_correct integer := 0;
  v_since timestamptz := clock_timestamp();
  v_at timestamptz := (p_day + time '16:30') at time zone 'Europe/London'
    + make_interval(mins => floor(private.demo_rand(p_key || p_day || 'time') * 300)::int);
  v_i integer := 0;
begin
  perform private.demo_as(p_key);
  v_mission := private.ensure_daily_mission(v_uid, p_day);
  if v_mission.user_id is null or v_mission.completed_at is not null then return; end if;

  for v_q in select q.id, q.correct_answer, q.options
             from unnest(v_mission.question_ids) with ordinality u(qid, ord)
             join public.questions q on q.id = u.qid order by u.ord loop
    v_i := v_i + 1;
    if private.demo_rand(p_key || p_day || v_i) < private.demo_accuracy(p_key) then
      v_answer := v_q.correct_answer; v_correct := v_correct + 1;
    else
      select o into v_answer from jsonb_array_elements_text(v_q.options) o
      where o <> v_q.correct_answer order by md5(o) limit 1;
      v_answer := coalesce(v_answer, 'skip');
    end if;
    perform public.rpc_submit_mcq_answer(v_q.id, v_answer);
  end loop;

  set local session_replication_role = replica;
  update public.daily_missions set answered_ids = question_ids, correct_count = v_correct,
    completed_at = v_at, created_at = v_at - interval '12 minutes'
  where user_id = v_uid and mission_date = p_day;
  -- a new day: the reward caps roll over
  update public.caps set xp_daily_earned = 0, coins_daily_earned = 0, xp_weekly_earned = 0, coins_weekly_earned = 0
  where user_id = v_uid;
  set local session_replication_role = origin;

  perform private.award_daily_streak(v_uid, p_day);
  call private.demo_backdate(v_since, v_at);
  set local session_replication_role = replica;
  update public.users set last_seen = v_at where id = v_uid;
  set local session_replication_role = origin;
end $$;

do $$
declare p record; d date; v_today date := (private.demo_today() at time zone 'Europe/London')::date;
begin
  for d in select generate_series(v_today - 27, v_today - 1, interval '1 day')::date loop
    for p in select key from private.demo_people where role = 'student' order by key loop
      if private.demo_rand(p.key || d || 'play') < private.demo_play_rate(p.key, d) then
        call private.demo_play_day(p.key, d);
      end if;
    end loop;
  end loop;
  -- Today: the keenest students have already done this morning's mission.
  for p in select key from private.demo_people where role = 'student' and story in ('strong','perfect_recovered') order by key loop
    if private.demo_rand(p.key || v_today || 'play') < 0.6 then call private.demo_play_day(p.key, v_today); end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- B. Class Conquest: last week's result (7A vs 7B) plus weekend predictions and cheers.
-- ---------------------------------------------------------------------------
do $$
declare v_school uuid := private.demo_state_uuid('school_id'); p record; r jsonb;
  v_a uuid := private.demo_state_uuid('class_id'); v_b uuid := private.demo_state_uuid('class_b_id');
  v_week date := date_trunc('week', (private.demo_today() at time zone 'Europe/London'))::date;
begin
  -- Freeze every finished week since the season start (the app does this lazily).
  perform private.class_conquest_finalize_week(v_school, '7', w::date)
  from generate_series(date '2026-10-26', v_week - 7, interval '7 days') w;
  perform private.class_conquest_finalize_week(v_school, '7', v_week);

  for p in select key, class_code from private.demo_people where role = 'student' order by key loop
    if private.demo_rand(p.key || 'predict') < 0.45 then
      perform private.demo_as(p.key);
      r := public.rpc_class_conquest_predict(case when private.demo_rand(p.key || 'pick') < 0.7
        then (case when p.class_code = '7A' then v_a else v_b end) else (case when p.class_code = '7A' then v_b else v_a end) end);
      begin
        r := public.rpc_class_conquest_cheer(case when p.class_code = '7A' then v_a else v_b end,
          (array['all_the_way','unstoppable','gg','next_map','respect','comeback','sweating'])[1 + floor(private.demo_rand(p.key || 'cheer') * 7)::int]);
      exception when others then null; end;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- C. Clans: four clans, chat, vault deposits.
-- ---------------------------------------------------------------------------
do $$
declare
  v_since timestamptz; v_at timestamptz; r record; j record; k text; v_clan uuid; m text; v_i integer;
  v_today date := (private.demo_today() at time zone 'Europe/London')::date;
  clans text[][] := array[
    array['Night Owls',     's08', 'Late-night grammar raids. Bring snacks.'],
    array['Byte Bandits',   's25', '7B represent. We take the map this week.'],
    array['Quantum Foxes',  's01', 'Clever, curious, quick. Missions every day.'],
    array['Arctic Wolves',  's30', 'Pack hunts at 5pm. No mission left behind.']
  ];
  members text[][] := array[
    array['s09','s10','s02','s11','s12','s13'],
    array['s26','s27','s28','s29','s31','s32'],
    array['s03','s04','s14','s15','s16','s06'],
    array['s33','s34','s35','s36','s37','s38']
  ];
  chat text[] := array[
    'Who finished today''s mission already?', 'Me! 5/5 😎', 'Present perfect is finally making sense',
    'We need 3 more missions to beat 7B', 'On it after football', 'Deposited 200 coins to the vault 💰',
    'Ms. Mitchell said the next map is the UK!', 'Everyone do the mission before dinner', 'gg last week',
    'Shield up, someone keeps hacking me', 'That was me 😂', 'Clan buff tomorrow?'
  ];
begin
  for v_i in 1..4 loop
    v_since := clock_timestamp();
    v_at := ((v_today - 18 + v_i) + time '17:00') at time zone 'Europe/London';
    perform private.demo_as(clans[v_i][2]);
    select * into r from public.rpc_create_clan(clans[v_i][1], clans[v_i][3]);
    if not r.success then raise notice 'clan % skipped: %', clans[v_i][1], r.error_message; continue; end if;
    v_clan := r.clan_id;
    foreach m in array members[v_i:v_i] loop
      perform private.demo_as(m);
      select * into j from public.rpc_join_clan(v_clan);
    end loop;
    perform private.demo_as(clans[v_i][2]);
    begin perform public.rpc_clan_deposit_coins(300); exception when others then null; end;
    call private.demo_backdate(v_since, v_at);
    -- chat over the following days
    for k in select unnest(array[clans[v_i][2]] || array(select unnest(members[v_i:v_i][1:3]))) loop
      v_since := clock_timestamp();
      perform private.demo_as(k);
      begin
        perform public.rpc_clan_chat_post(chat[1 + floor(private.demo_rand(k || v_i || 'chat') * array_length(chat, 1))::int]);
      exception when others then null; end;
      call private.demo_backdate(v_since, v_at + make_interval(days => 1 + floor(private.demo_rand(k || 'cd') * 10)::int, mins => floor(private.demo_rand(k || 'cm') * 600)::int));
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- D. Battles: hack attempts over the last two weeks between classmates.
-- ---------------------------------------------------------------------------
do $$
declare
  v_today date := (private.demo_today() at time zone 'Europe/London')::date;
  v_since timestamptz; v_at timestamptz; d date; a record; v_def uuid; n integer; r json;
begin
  for d in select generate_series(v_today - 13, v_today, interval '1 day')::date loop
    n := 0;
    for a in select key, user_id, class_code from private.demo_people where role = 'student' order by md5(key || d) loop
      exit when n >= 7;
      if private.demo_rand(a.key || d || 'hack') > 0.22 then continue; end if;
      select user_id into v_def from private.demo_people
      where role = 'student' and key <> a.key and class_code = a.class_code
      order by md5(key || a.key || d) limit 1;
      v_since := clock_timestamp();
      v_at := (d + time '18:00') at time zone 'Europe/London' + make_interval(mins => floor(private.demo_rand(a.key || d || 'hm') * 240)::int);
      set local session_replication_role = replica;
      update public.users set ap_now = greatest(coalesce(ap_now, 0), 6), ap_max = greatest(coalesce(ap_max, 0), 10), last_ap_update = now() where id = a.user_id;
      update public.users set last_attacked_at = null where id = v_def;
      set local session_replication_role = origin;
      perform private.demo_as(a.key);
      begin
        r := public.rpc_hack_attempt(v_def, gen_random_uuid());
        n := n + 1;
      exception when others then
        raise notice 'hack % -> % skipped: %', a.key, v_def, sqlerrm;
      end;
      call private.demo_backdate(v_since, v_at);
      set local session_replication_role = replica;
      update public.users set last_attacked_at = v_at where id = v_def;
      set local session_replication_role = origin;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- E. Shop: shields for the cautious, attack boosts for the bold.
-- ---------------------------------------------------------------------------
do $$
declare p record; v_since timestamptz; v_today date := (private.demo_today() at time zone 'Europe/London')::date;
begin
  for p in select key from private.demo_people where role = 'student' order by key loop
    if private.demo_rand(p.key || 'shop') > 0.5 then continue; end if;
    v_since := clock_timestamp();
    perform private.demo_as(p.key);
    begin
      perform public.rpc_shop_buy(case when private.demo_rand(p.key || 'item') < 0.6 then 'item_shield' else 'item_encryption_key' end, 1);
    exception when others then null; end;
    call private.demo_backdate(v_since, ((v_today - 1 - floor(private.demo_rand(p.key || 'sd') * 12)::int) + time '19:10') at time zone 'Europe/London');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- F. Achievements earned along the way.
-- ---------------------------------------------------------------------------
do $$
declare p record; v_since timestamptz; v_at timestamptz;
begin
  for p in select key, user_id from private.demo_people where role = 'student' order by key loop
    v_since := clock_timestamp();
    select coalesce(last_seen, now()) into v_at from public.users where id = p.user_id;
    perform private.demo_as(p.key);
    perform public.rpc_check_achievements(p.user_id);
    call private.demo_backdate(v_since, v_at);
  end loop;
end $$;
