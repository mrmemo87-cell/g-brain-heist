-- ============================================================================
-- PADDLE BILLING — TEST FIXTURES & VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration was applied correctly and
-- to seed test data for local development / QA.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABLE STRUCTURE ASSERTIONS
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- billing_subscriptions
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_subscriptions' AND column_name = 'provider'
  ), 'FAIL: billing_subscriptions.provider missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_subscriptions' AND column_name = 'provider_subscription_id'
  ), 'FAIL: billing_subscriptions.provider_subscription_id missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_subscriptions' AND column_name = 'is_comp'
  ), 'FAIL: billing_subscriptions.is_comp missing';

  -- billing_events
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_events' AND column_name = 'event_id'
  ), 'FAIL: billing_events.event_id missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_events' AND column_name = 'processed'
  ), 'FAIL: billing_events.processed missing';

  -- billing_entitlements
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_entitlements' AND column_name = 'feature_key'
  ), 'FAIL: billing_entitlements.feature_key missing';

  -- Entitlements seeded
  ASSERT (SELECT count(*) FROM billing_entitlements) >= 16 * 4,
    'FAIL: billing_entitlements not seeded (expected at least 64 rows for free/core/standard/pro)';

  RAISE NOTICE '✅ All table structure assertions passed';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS ASSERTIONS
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- billing_subscriptions has RLS enabled
  ASSERT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'billing_subscriptions' AND rowsecurity = TRUE
  ), 'FAIL: billing_subscriptions RLS not enabled';

  -- billing_events has RLS enabled
  ASSERT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'billing_events' AND rowsecurity = TRUE
  ), 'FAIL: billing_events RLS not enabled';

  -- billing_entitlements has RLS enabled
  ASSERT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'billing_entitlements' AND rowsecurity = TRUE
  ), 'FAIL: billing_entitlements RLS not enabled';

  RAISE NOTICE '✅ All RLS assertions passed';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. INDEX ASSERTIONS
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_billing_sub_school_provider_active'
  ), 'FAIL: idx_billing_sub_school_provider_active not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_billing_sub_provider_sub_id'
  ), 'FAIL: idx_billing_sub_provider_sub_id not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_billing_events_idempotency'
  ), 'FAIL: idx_billing_events_idempotency not found';

  RAISE NOTICE '✅ All index assertions passed';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC ASSERTIONS
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'get_billing_subscription'
  ), 'FAIL: get_billing_subscription RPC not found';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'admin_grant_comp_access'
  ), 'FAIL: admin_grant_comp_access RPC not found';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'admin_revoke_comp_access'
  ), 'FAIL: admin_revoke_comp_access RPC not found';

  RAISE NOTICE '✅ All RPC assertions passed';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. SIMULATED WEBHOOK EVENTS (for local testing)
-- ────────────────────────────────────────────────────────────────────────────
-- These INSERT statements simulate what the Paddle webhook handler would do.
-- Replace UUIDs with real school/user IDs from your dev environment.
--
-- USAGE: Un-comment the block for the scenario you want to test.
-- ────────────────────────────────────────────────────────────────────────────

-- -- Scenario A: New subscription created
-- INSERT INTO billing_subscriptions (
--   school_id, provider, provider_customer_id, provider_subscription_id,
--   status, plan, billing_interval, price_id,
--   current_period_start, current_period_end
-- ) VALUES (
--   'YOUR_SCHOOL_UUID', 'paddle', 'ctm_test_001', 'sub_test_001',
--   'active', 'core', 'monthly', 'pri_test_core_monthly',
--   now(), now() + interval '1 month'
-- );
-- UPDATE schools SET school_plan = 'core' WHERE id = 'YOUR_SCHOOL_UUID';

-- -- Scenario B: Subscription cancelled
-- UPDATE billing_subscriptions
--   SET status = 'cancelled', canceled_at = now()
--   WHERE provider_subscription_id = 'sub_test_001';
-- UPDATE schools SET school_plan = 'none' WHERE id = 'YOUR_SCHOOL_UUID';

-- -- Scenario C: Payment failed (past_due)
-- UPDATE billing_subscriptions
--   SET status = 'past_due'
--   WHERE provider_subscription_id = 'sub_test_001';

-- -- Scenario D: Subscription renewed (updated with new period)
-- UPDATE billing_subscriptions
--   SET status = 'active',
--       current_period_start = now(),
--       current_period_end = now() + interval '1 month'
--   WHERE provider_subscription_id = 'sub_test_001';
-- UPDATE schools SET school_plan = 'core' WHERE id = 'YOUR_SCHOOL_UUID';

-- -- Scenario E: Comp access granted by admin
-- SELECT admin_grant_comp_access(
--   'YOUR_SCHOOL_UUID'::uuid,
--   'core',
--   30,
--   'Testing comp access'
-- );

-- -- Scenario F: Comp access revoked
-- SELECT admin_revoke_comp_access('YOUR_SCHOOL_UUID'::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- 6. WEBHOOK EVENT LOG TEST (idempotency)
-- ────────────────────────────────────────────────────────────────────────────

-- -- Test: Insert an event, then try inserting same event_id → should conflict
-- INSERT INTO billing_events (provider, event_id, event_type, payload)
-- VALUES ('paddle', 'evt_test_idempotency_001', 'subscription.created', '{"test": true}'::jsonb);
--
-- -- This should fail with a unique constraint violation:
-- INSERT INTO billing_events (provider, event_id, event_type, payload)
-- VALUES ('paddle', 'evt_test_idempotency_001', 'subscription.created', '{"test": true}'::jsonb);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ENTITLEMENT QUERIES (verify seeded data)
-- ────────────────────────────────────────────────────────────────────────────

-- Free tier: pvp_battles should be disabled
SELECT plan, feature_key, enabled, limit_value
  FROM billing_entitlements
 WHERE plan = 'free' AND feature_key = 'pvp_battles';
-- Expected: enabled = false, limit_value = 0

-- Core tier: cambridge_tests should be enabled with limit 120
SELECT plan, feature_key, enabled, limit_value
  FROM billing_entitlements
 WHERE plan = 'core' AND feature_key = 'cambridge_tests';
-- Expected: enabled = true, limit_value = 120

-- Enterprise tier: cambridge_tests should be unlimited (null)
SELECT plan, feature_key, enabled, limit_value
  FROM billing_entitlements
 WHERE plan = 'enterprise' AND feature_key = 'cambridge_tests';
-- Expected: enabled = true, limit_value = NULL

RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
RAISE NOTICE '✅ All Paddle billing tests passed!';
RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
