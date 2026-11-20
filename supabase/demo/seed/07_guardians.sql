-- Demo seed 07: families. Most parents accepted their guardian invitation in the first
-- weeks of term, through the real flow: the Deputy Head invites a parent's email
-- (rpc_school_create_guardian_invitation) and the parent claims it with their own
-- verified account (rpc_guardian_claim_invitation). Six families have not joined yet,
-- which is what the School Head's Decision Center shows.
-- DEMO PROJECT ONLY. Parent emails use the reserved example.com domain and are removed
-- by 00_reset with the other demo.*@example.com accounts. No email leaves the demo:
-- outbound HTTP is blocked (post-restore.sql) and the queued invitation emails are
-- marked skipped below.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

do $$
declare
  v_school uuid := private.demo_state_uuid('school_id');
  v_term timestamptz := timestamptz '2026-09-01 08:30 Europe/London';
  -- Families that have not joined yet (the Decision Center's open item).
  v_not_joined constant text[] := array['s07', 's22', 's29', 's36', 's41', 's46'];
  p record;
  v_guardian uuid;
  v_email text;
  v_label text;
  v_invited_at timestamptz;
  v_claimed_at timestamptz;
  r jsonb;
  c jsonb;
  v_parent_name text;
begin
  if v_school is null then raise exception 'demo seed 07: school missing (run 02 first)'; end if;

  for p in
    select key, user_id, full_name from private.demo_people
    where role = 'student' and not (key = any (v_not_joined))
    order by key
  loop
    v_guardian := ('d0000000-0000-4000-8000-0000000002' || right(p.key, 2))::uuid;
    v_email := 'demo.parent.' || p.key || '@example.com';
    v_label := case when private.demo_rand(p.key || 'guardian') < 0.55 then 'Mother' else 'Father' end;
    -- A believable parent name: a first name plus the child's family name.
    v_parent_name := case when v_label = 'Mother'
        then (array['Maria','Anna','Sara','Elena','Laura','Nadia','Julia','Amina','Claire','Yasmin','Hannah','Ines'])[1 + floor(private.demo_rand(p.key || 'pfn') * 12)::int]
        else (array['David','Michael','Ahmed','Paul','Daniel','Omar','Peter','James','Marco','Samuel','Thomas','Karim'])[1 + floor(private.demo_rand(p.key || 'pfn') * 12)::int]
      end || ' ' || regexp_replace(p.full_name, '^\S+\s+', '');
    v_invited_at := v_term + make_interval(days => 2 + floor(private.demo_rand(p.key || 'ginv') * 10)::int, hours => 1);
    v_claimed_at := v_invited_at + make_interval(hours => 3 + floor(private.demo_rand(p.key || 'gclaim') * 60)::int);

    -- The parent's own account (email already verified, as after a normal sign-up).
    perform private.demo_create_auth_user(
      v_guardian, v_email, encode(extensions.gen_random_bytes(24), 'base64'),
      jsonb_build_object('username', 'parent_' || p.key, 'full_name', v_parent_name),
      v_invited_at);
    update public.users set full_name = v_parent_name, needs_setup = false, avatar_url = null
    where id = v_guardian;

    -- Deputy Head invites the parent.
    perform private.demo_as('deputy');
    r := private.demo_ok('guardian invite ' || p.key,
      public.rpc_school_create_guardian_invitation(p.user_id, v_email, v_label, 30));

    -- The parent signs in and accepts.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_guardian, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_guardian::text, true);
    c := private.demo_ok('guardian claim ' || p.key, public.rpc_guardian_claim_invitation(r->>'token'));

    -- Move this family to its story time; the invitation email was never sent (demo).
    set local session_replication_role = replica;
    update public.guardian_invitations
      set created_at = v_invited_at, expires_at = v_invited_at + interval '30 days', claimed_at = v_claimed_at
      where id = (r->>'invitation_id')::uuid;
    update public.guardian_invitation_email_notifications
      set status = 'skipped', raw_token = null, last_error = 'Demo school: email delivery is off',
          available_at = v_invited_at, next_attempt_at = v_invited_at, created_at = v_invited_at, updated_at = v_invited_at
      where invitation_id = (r->>'invitation_id')::uuid;
    update public.student_guardian_relationships
      set created_at = v_claimed_at, verified_at = v_claimed_at
      where id = (c->>'relationship_id')::uuid;
    update public.guardian_accounts set created_at = v_claimed_at, updated_at = v_claimed_at where user_id = v_guardian;
    set local session_replication_role = origin;
  end loop;
end $$;
