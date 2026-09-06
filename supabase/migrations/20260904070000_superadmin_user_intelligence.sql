-- On-demand deep user snapshot for the Superadmin Users drawer.
-- Keeps the paginated list RPC lightweight while giving support/admins a governed,
-- cross-product view of one selected account. Auth/session data never leaves this
-- SECURITY DEFINER boundary and the function is superadmin-only.

create or replace function public.rpc_superadmin_user_intelligence(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_auth auth.users%rowtype;
  v_linked_school_name text;
  v_last_active timestamptz;
  v_warnings jsonb := '[]'::jsonb;
  v_payload jsonb;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception 'platform_administrator_access_required' using errcode = '42501';
  end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  select * into v_auth from auth.users where id = p_user_id;
  select s.name into v_linked_school_name from public.schools s where s.id = v_user.school_id;
  select greatest(up.last_active_at, v_user.last_seen, v_auth.last_sign_in_at)
    into v_last_active
  from (select 1) seed
  left join public.user_presence up on up.user_id = p_user_id;

  if coalesce(v_user.needs_setup, false) then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'setup_incomplete', 'severity', 'warning',
      'title', 'Account setup incomplete',
      'message', 'The account still has needs_setup enabled.'
    ));
  end if;

  if not coalesce(v_user.tutorial_completed, false) then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'tutorial_incomplete', 'severity', 'info',
      'title', 'Tutorial not completed',
      'message', 'The Brains Heist tutorial has not been completed.'
    ));
  end if;

  if v_user.school_id is null and nullif(trim(coalesce(v_user.school, '')), '') is not null then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'school_claim_without_link', 'severity', 'warning',
      'title', 'School linkage mismatch',
      'message', 'The profile contains a school name but there is no relational school_id assignment.',
      'claimed_school', v_user.school
    ));
  elsif v_user.school_id is not null
    and nullif(trim(coalesce(v_user.school, '')), '') is not null
    and lower(trim(v_user.school)) is distinct from lower(trim(coalesce(v_linked_school_name, ''))) then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'school_name_mismatch', 'severity', 'warning',
      'title', 'School fields disagree',
      'message', 'The legacy school text does not match the linked school record.',
      'claimed_school', v_user.school,
      'linked_school', v_linked_school_name
    ));
  end if;

  if v_user.school_id is not null and not exists (
    select 1 from public.school_members sm where sm.user_id = p_user_id and sm.school_id = v_user.school_id and sm.status = 'active'
  ) then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'school_id_without_membership', 'severity', 'warning',
      'title', 'Missing school membership',
      'message', 'users.school_id is set but no active matching school_members row exists.'
    ));
  end if;

  if v_user.full_name is null
    and nullif(trim(coalesce(v_auth.raw_user_meta_data->>'full_name', v_auth.raw_user_meta_data->>'name', '')), '') is not null then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'auth_name_not_synced', 'severity', 'info',
      'title', 'Google name not synced',
      'message', 'Authentication metadata has a display name while public.users.full_name is empty.'
    ));
  end if;

  select jsonb_build_object(
    'identity', jsonb_build_object(
      'user_id', v_user.id,
      'username', v_user.username,
      'email', coalesce(v_auth.email::text, v_user.email),
      'public_email', v_user.email,
      'full_name', v_user.full_name,
      'auth_display_name', coalesce(v_auth.raw_user_meta_data->>'full_name', v_auth.raw_user_meta_data->>'name'),
      'provider', coalesce(v_auth.raw_app_meta_data->>'provider', v_auth.raw_user_meta_data->>'provider'),
      'providers', coalesce(v_auth.raw_app_meta_data->'providers', '[]'::jsonb),
      'email_verified', v_auth.email_confirmed_at is not null,
      'email_confirmed_at', v_auth.email_confirmed_at,
      'created_at', coalesce(v_auth.created_at, v_user.created_at),
      'last_sign_in_at', v_auth.last_sign_in_at,
      'last_active_at', v_last_active,
      'is_sso_user', coalesce(v_auth.is_sso_user, false),
      'is_anonymous', coalesce(v_auth.is_anonymous, false),
      'latest_session', coalesce((
        select jsonb_build_object(
          'created_at', s.created_at,
          'updated_at', s.updated_at,
          'aal', s.aal,
          'user_agent', s.user_agent,
          'ip', s.ip::text
        )
        from auth.sessions s
        where s.user_id = p_user_id
        order by coalesce(s.updated_at, s.created_at) desc
        limit 1
      ), 'null'::jsonb)
    ),
    'account', jsonb_build_object(
      'role', coalesce(v_user.role, 'student'),
      'is_admin', coalesce(v_user.is_admin, false),
      'is_superadmin', public.is_superadmin(p_user_id),
      'is_banned', coalesce(v_user.is_banned, false),
      'banned_until', v_user.banned_until,
      'admin_visible', coalesce(v_user.admin_visible, true),
      'account_tier', coalesce(v_user.account_tier, 'free'),
      'needs_setup', coalesce(v_user.needs_setup, false),
      'tutorial_completed', coalesce(v_user.tutorial_completed, false),
      'profile_locked', coalesce(v_user.profile_locked, false),
      'full_name_status', v_user.full_name_status,
      'brains_master_until', v_user.brains_master_until,
      'brains_master_show_badge', coalesce(v_user.brains_master_show_badge, false),
      'admin_roles', coalesce((
        select jsonb_agg(jsonb_build_object('scope', ar.scope, 'role', ar.role, 'created_at', ar.created_at) order by ar.created_at desc)
        from public.admin_roles ar where ar.user_id = p_user_id
      ), '[]'::jsonb)
    ),
    'placement', jsonb_build_object(
      'grade', v_user.grade,
      'class_code', v_user.batch,
      'school_id', v_user.school_id,
      'linked_school_name', v_linked_school_name,
      'claimed_school_name', v_user.school,
      'school_memberships', coalesce((
        select jsonb_agg(jsonb_build_object(
          'school_id', sm.school_id,
          'school_name', sch.name,
          'role', sm.role_in_school,
          'status', sm.status,
          'is_owner', sm.is_owner,
          'can_teach', sm.can_teach,
          'joined_at', sm.joined_at
        ) order by sm.joined_at desc nulls last)
        from public.school_members sm
        left join public.schools sch on sch.id = sm.school_id
        where sm.user_id = p_user_id
      ), '[]'::jsonb),
      'class_memberships', coalesce((
        select jsonb_agg(jsonb_build_object(
          'class_id', c.id,
          'class_code', c.class_code,
          'class_name', c.class_name,
          'grade_level', c.grade_level,
          'subject', c.subject,
          'school_id', c.school_id,
          'joined_at', cs.joined_at
        ) order by cs.joined_at desc nulls last)
        from public.class_students cs
        join public.classes c on c.id = cs.class_id
        where cs.student_id = p_user_id
      ), '[]'::jsonb),
      'academic_enrolments', coalesce((
        select jsonb_agg(x.row_data order by x.created_at desc)
        from (
          select jsonb_build_object(
            'school_id', sae.school_id,
            'class_id', sae.class_id,
            'grade_level', sae.grade_level,
            'class_code', sae.class_code,
            'academic_year_id', sae.academic_year_id,
            'starts_on', sae.starts_on,
            'ends_on', sae.ends_on,
            'context_quality', sae.context_quality,
            'source', sae.source
          ) as row_data, sae.created_at
          from public.student_academic_enrolments sae
          where sae.student_id = p_user_id
          order by sae.created_at desc
          limit 5
        ) x
      ), '[]'::jsonb),
      'subject_enrolment_count', (select count(*) from public.student_subject_enrolments sse where sse.student_id = p_user_id),
      'guardian_relationship_count', (select count(*) from public.student_guardian_relationships sgr where sgr.student_id = p_user_id and sgr.status = 'active')
    ),
    'game', jsonb_build_object(
      'level', coalesce(v_user.level, 1),
      'xp', coalesce(v_user.xp, 0),
      'coins', coalesce(v_user.coins, 0),
      'gemstones', coalesce(v_user.gemstones, 0),
      'streak', coalesce(v_user.streak, 0),
      'ap_now', coalesce(v_user.ap_now, 0),
      'ap_max', coalesce(v_user.ap_max, 0),
      'attack_power', coalesce(v_user.attack_power, 0),
      'defense_power', coalesce(v_user.defense_power, 0),
      'pvp_score', coalesce(v_user.pvp_score, 0),
      'pvp_wins', coalesce(v_user.pvp_wins, 0),
      'total_questions_answered', coalesce(v_user.total_questions_answered, 0),
      'achievement_points', coalesce(v_user.achievement_points, 0),
      'reward_sources', jsonb_build_object(
        'xp_achievements', coalesce(v_user.xp_from_achievements, 0),
        'xp_pvp', coalesce(v_user.xp_from_pvp, 0),
        'xp_assignments', coalesce(v_user.xp_from_assignments, 0),
        'xp_quests', coalesce(v_user.xp_from_quests, 0),
        'coins_achievements', coalesce(v_user.coins_from_achievements, 0),
        'coins_pvp', coalesce(v_user.coins_from_pvp, 0),
        'coins_assignments', coalesce(v_user.coins_from_assignments, 0),
        'coins_quests', coalesce(v_user.coins_from_quests, 0)
      )
    ),
    'activity', jsonb_build_object(
      'question_attempts', jsonb_build_object(
        'total', (select count(*) from public.question_attempts qa where qa.student_id = p_user_id),
        'correct', (select count(*) from public.question_attempts qa where qa.student_id = p_user_id and qa.is_correct),
        'latest_at', (select max(coalesce(qa.attempted_at, qa.created_at)) from public.question_attempts qa where qa.student_id = p_user_id)
      ),
      'brains_heist_attempts', jsonb_build_object(
        'total', (select count(*) from public.brains_heist_student_attempts ba where ba.student_id = p_user_id),
        'correct', (select count(*) from public.brains_heist_student_attempts ba where ba.student_id = p_user_id and ba.is_correct),
        'latest_at', (select max(ba.submitted_at) from public.brains_heist_student_attempts ba where ba.student_id = p_user_id)
      ),
      'assignments', jsonb_build_object(
        'assigned', (select count(*) from public.student_assignments sa where sa.student_id = p_user_id),
        'completed', (select count(*) from public.student_assignments sa where sa.student_id = p_user_id and (sa.completed_at is not null or lower(coalesce(sa.status, '')) = 'completed')),
        'average_accuracy', (select round(avg(sar.accuracy)::numeric, 1) from public.student_assignment_results sar where sar.student_id = p_user_id),
        'latest_completed_at', (select max(sar.completed_at) from public.student_assignment_results sar where sar.student_id = p_user_id)
      ),
      'cambridge_quizzes', jsonb_build_object(
        'attempts', (select count(*) from public.quiz_scores qs where qs.student_id = p_user_id),
        'average_percentage', (select round(avg(qs.percentage)::numeric, 1) from public.quiz_scores qs where qs.student_id = p_user_id),
        'latest_at', (select max(qs.submitted_at) from public.quiz_scores qs where qs.student_id = p_user_id)
      ),
      'quests', jsonb_build_object(
        'runs', (select count(*) from public.quest_runs qr where qr.user_id = p_user_id),
        'completed', (select count(*) from public.quest_runs qr where qr.user_id = p_user_id and qr.completed_at is not null),
        'latest_at', (select max(coalesce(qr.completed_at, qr.started_at)) from public.quest_runs qr where qr.user_id = p_user_id)
      ),
      'raids', jsonb_build_object(
        'participations', (select count(*) from public.raid_participants rp where rp.user_id = p_user_id),
        'total_damage', coalesce((select sum(rp.damage) from public.raid_participants rp where rp.user_id = p_user_id), 0),
        'latest_at', (select max(rp.last_active) from public.raid_participants rp where rp.user_id = p_user_id)
      ),
      'clan', coalesce((
        select jsonb_build_object(
          'clan_id', cm.clan_id,
          'name', c.name,
          'role', cm.role,
          'custom_title', cm.custom_title,
          'joined_at', cm.joined_at
        )
        from public.clan_members cm
        join public.clans c on c.id = cm.clan_id
        where cm.user_id = p_user_id
        order by cm.joined_at desc
        limit 1
      ), 'null'::jsonb),
      'commerce', jsonb_build_object(
        'shop_purchases', (select count(*) from public.shop_purchases sp where sp.user_id = p_user_id),
        'shop_spend', coalesce((select sum(sp.total_cost) from public.shop_purchases sp where sp.user_id = p_user_id), 0),
        'inventory_items', (select count(*) from public.inventory i where i.user_id = p_user_id),
        'brains_master_purchases', (select count(*) from public.brains_master_purchases bmp where bmp.user_id = p_user_id)
      ),
      'achievements', jsonb_build_object(
        'records', (select count(*) from public.user_achievements ua where ua.user_id = p_user_id),
        'unlocked', (select count(*) from public.user_achievements ua where ua.user_id = p_user_id and coalesce(ua.unlocked_at, ua.earned_at) is not null)
      ),
      'notifications', jsonb_build_object(
        'total', (select count(*) from public.notifications n where n.user_id = p_user_id),
        'unread', (select count(*) from public.notifications n where n.user_id = p_user_id and not coalesce(n.read, false))
      ),
      'onboarding_events', jsonb_build_object(
        'total', (select count(*) from public.onboarding_events oe where oe.user_id = p_user_id),
        'latest_at', (select max(oe.created_at) from public.onboarding_events oe where oe.user_id = p_user_id)
      )
    ),
    'onboarding', coalesce((
      select jsonb_build_object(
        'segment', uo.segment,
        'context_type', uo.context_type,
        'context_id', uo.context_id,
        'current_step', uo.current_step,
        'completed_steps', uo.completed_steps,
        'core_completed_at', uo.core_completed_at,
        'first_value_started_at', uo.first_value_started_at,
        'first_value_completed_at', uo.first_value_completed_at,
        'created_at', uo.created_at,
        'updated_at', uo.updated_at
      ) from public.user_onboarding uo where uo.user_id = p_user_id
    ), 'null'::jsonb),
    'ielts', jsonb_build_object(
      'profile', coalesce((
        select jsonb_build_object(
          'username', iu.username,
          'full_name', iu.full_name,
          'email', iu.email,
          'tier', iu.tier,
          'phone', iu.phone,
          'target_band', iu.target_band,
          'test_date', iu.test_date,
          'created_at', iu.created_at,
          'updated_at', iu.updated_at
        ) from public.ielts_users iu where iu.id = p_user_id
      ), 'null'::jsonb),
      'membership', coalesce((
        select jsonb_build_object('plan', im.plan, 'status', im.status, 'starts_at', im.starts_at, 'expires_at', im.expires_at, 'created_at', im.created_at)
        from public.ielts_memberships im where im.user_id = p_user_id order by im.created_at desc limit 1
      ), 'null'::jsonb),
      'prime_subscription', coalesce((
        select jsonb_build_object('plan', ips.plan, 'status', ips.status, 'current_period_start', ips.current_period_start, 'current_period_end', ips.current_period_end, 'cancel_at_period_end', ips.cancel_at_period_end, 'created_at', ips.created_at)
        from public.ielts_prime_subscriptions ips where ips.user_id = p_user_id order by ips.created_at desc limit 1
      ), 'null'::jsonb),
      'attempts', jsonb_build_object(
        'reading', (select count(*) from public.ielts_reading_attempts ira where ira.user_id = p_user_id),
        'listening', (select count(*) from public.ielts_listening_attempts ila where ila.user_id = p_user_id),
        'writing', (select count(*) from public.ielts_writing_attempts iwa where iwa.user_id = p_user_id),
        'speaking', (select count(*) from public.ielts_speaking_attempts isa where isa.user_id = p_user_id),
        'mock_tests', (select count(*) from public.ielts_mock_test_attempts imta where imta.user_id = p_user_id),
        'exam_attempts', (select count(*) from public.ielts_exam_attempts iea where iea.student_id = p_user_id)
      )
    ),
    'writing_hub', jsonb_build_object(
      'profile', coalesce((
        select jsonb_build_object('grade', wsp.grade, 'genre', wsp.genre, 'created_at', wsp.created_at, 'updated_at', wsp.updated_at)
        from public.bh_writing_student_profiles wsp where wsp.student_id = p_user_id
        order by wsp.updated_at desc limit 1
      ), 'null'::jsonb),
      'assessments', (select count(*) from public.bh_writing_assessments wa where wa.student_id = p_user_id),
      'average_score', (select round(avg(wa.total_score)::numeric, 1) from public.bh_writing_assessments wa where wa.student_id = p_user_id and wa.total_score is not null),
      'latest_assessment', coalesce((
        select jsonb_build_object('total_score', wa.total_score, 'status', wa.assessment_status, 'created_at', wa.created_at)
        from public.bh_writing_assessments wa where wa.student_id = p_user_id order by wa.created_at desc limit 1
      ), 'null'::jsonb),
      'monthly_reports', (select count(*) from public.bh_writing_monthly_reports wr where wr.student_id = p_user_id)
    ),
    'warnings', v_warnings
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.rpc_superadmin_user_intelligence(uuid) from public, anon;
grant execute on function public.rpc_superadmin_user_intelligence(uuid) to authenticated;
