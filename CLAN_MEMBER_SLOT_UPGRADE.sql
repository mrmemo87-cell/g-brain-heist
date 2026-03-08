-- ============================================================
-- CLAN MEMBER SLOT UPGRADE MIGRATION
-- ============================================================
-- Adds scalable clan member capacity with vault-funded slot purchases.
-- Base limit = 5 members; each purchased slot adds +1 to member_limit.
-- Slot cost progression: 10,000 * (extra_member_slots_purchased + 1).
-- ============================================================

-- 1) Ensure clans has capacity columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clans' AND column_name = 'member_limit'
    ) THEN
        ALTER TABLE clans ADD COLUMN member_limit INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clans' AND column_name = 'extra_member_slots_purchased'
    ) THEN
        ALTER TABLE clans ADD COLUMN extra_member_slots_purchased INTEGER;
    END IF;
END $$;

-- 2) Backfill nulls defensively for pre-existing data
UPDATE clans
SET
    member_limit = COALESCE(member_limit, 5),
    extra_member_slots_purchased = COALESCE(extra_member_slots_purchased, 0)
WHERE member_limit IS NULL
   OR extra_member_slots_purchased IS NULL;

-- 3) Repair defaults/nullability for partially-migrated installs
ALTER TABLE clans ALTER COLUMN member_limit SET DEFAULT 5;
ALTER TABLE clans ALTER COLUMN member_limit SET NOT NULL;
ALTER TABLE clans ALTER COLUMN extra_member_slots_purchased SET DEFAULT 0;
ALTER TABLE clans ALTER COLUMN extra_member_slots_purchased SET NOT NULL;

-- 4) Enforce schema invariants
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clans_member_limit_nonnegative_check'
    ) THEN
        ALTER TABLE clans
        ADD CONSTRAINT clans_member_limit_nonnegative_check CHECK (member_limit >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clans_extra_slots_nonnegative_check'
    ) THEN
        ALTER TABLE clans
        ADD CONSTRAINT clans_extra_slots_nonnegative_check CHECK (extra_member_slots_purchased >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clans_member_limit_consistency_check'
    ) THEN
        ALTER TABLE clans
        ADD CONSTRAINT clans_member_limit_consistency_check CHECK (member_limit >= 5 + extra_member_slots_purchased);
    END IF;
END $$;

-- 5) Update join RPC to respect dynamic member_limit and serialize concurrent joins
CREATE OR REPLACE FUNCTION rpc_join_clan(p_clan_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT,
    member_count INTEGER
) AS $$
DECLARE
    v_user_id UUID;
    v_member_count INTEGER;
    v_member_limit INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT, 0;
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User already in a clan'::TEXT, 0;
        RETURN;
    END IF;

    SELECT c.member_limit
    INTO v_member_limit
    FROM clans c
    WHERE c.id = p_clan_id
    FOR UPDATE;

    IF v_member_limit IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Clan not found'::TEXT, 0;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_member_count FROM clan_members WHERE clan_id = p_clan_id;

    IF v_member_count >= v_member_limit THEN
        RETURN QUERY SELECT FALSE, 'Clan is full. Ask leader/officer/moderator to buy another slot from clan vault.'::TEXT, v_member_count;
        RETURN;
    END IF;

    INSERT INTO clan_members (clan_id, user_id, role)
    VALUES (p_clan_id, v_user_id, 'member');

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_member_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Add RPC to approve/reject join requests with role + member-limit checks
CREATE OR REPLACE FUNCTION rpc_clan_join_request_decide(
    p_request_id UUID,
    p_action TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT,
    request_status TEXT,
    clan_id UUID,
    member_count INTEGER
) AS $$
DECLARE
    v_user_id UUID;
    v_request RECORD;
    v_action TEXT;
    v_approver_clan_id UUID;
    v_approver_role TEXT;
    v_member_limit INTEGER;
    v_member_count INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT, NULL::TEXT, NULL::UUID, 0;
        RETURN;
    END IF;

    v_action := lower(trim(p_action));
    IF v_action = 'approve' THEN
        v_action := 'approved';
    ELSIF v_action = 'reject' THEN
        v_action := 'rejected';
    END IF;

    IF v_action NOT IN ('approved', 'rejected') THEN
        RETURN QUERY SELECT FALSE, 'Invalid action. Use approve/reject.'::TEXT, NULL::TEXT, NULL::UUID, 0;
        RETURN;
    END IF;

    SELECT cjr.id, cjr.clan_id, cjr.user_id, cjr.status
    INTO v_request
    FROM clan_join_requests cjr
    WHERE cjr.id = p_request_id
    FOR UPDATE;

    IF v_request.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Join request not found'::TEXT, NULL::TEXT, NULL::UUID, 0;
        RETURN;
    END IF;

    IF v_request.status <> 'pending' THEN
        RETURN QUERY SELECT FALSE, 'Join request already processed'::TEXT, v_request.status, v_request.clan_id, 0;
        RETURN;
    END IF;

    SELECT cm.clan_id, cm.role
    INTO v_approver_clan_id, v_approver_role
    FROM clan_members cm
    WHERE cm.user_id = v_user_id;

    IF v_approver_clan_id IS NULL OR v_approver_clan_id <> v_request.clan_id THEN
        RETURN QUERY SELECT FALSE, 'Not authorized for this clan request'::TEXT, NULL::TEXT, v_request.clan_id, 0;
        RETURN;
    END IF;

    IF v_approver_role NOT IN ('leader', 'moderator') THEN
        RETURN QUERY SELECT FALSE, 'Only leader/moderator can decide join requests'::TEXT, NULL::TEXT, v_request.clan_id, 0;
        RETURN;
    END IF;

    IF v_action = 'approved' THEN
        IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_request.user_id) THEN
            UPDATE clan_join_requests
            SET status = 'rejected', approved_by = v_user_id, approved_at = NOW()
            WHERE id = v_request.id;
            RETURN QUERY SELECT FALSE, 'User is already in a clan'::TEXT, 'rejected'::TEXT, v_request.clan_id, 0;
            RETURN;
        END IF;

        SELECT c.member_limit
        INTO v_member_limit
        FROM clans c
        WHERE c.id = v_request.clan_id
        FOR UPDATE;

        IF v_member_limit IS NULL THEN
            RETURN QUERY SELECT FALSE, 'Clan not found'::TEXT, NULL::TEXT, v_request.clan_id, 0;
            RETURN;
        END IF;

        SELECT COUNT(*) INTO v_member_count FROM clan_members WHERE clan_id = v_request.clan_id;

        IF v_member_count >= v_member_limit THEN
            RETURN QUERY SELECT FALSE, 'Clan is full. Buy another member slot before approving.'::TEXT, NULL::TEXT, v_request.clan_id, v_member_count;
            RETURN;
        END IF;

        INSERT INTO clan_members (clan_id, user_id, role)
        VALUES (v_request.clan_id, v_request.user_id, 'member');

        UPDATE clan_join_requests
        SET status = 'approved', approved_by = v_user_id, approved_at = NOW()
        WHERE id = v_request.id;

        RETURN QUERY SELECT TRUE, NULL::TEXT, 'approved'::TEXT, v_request.clan_id, v_member_count + 1;
        RETURN;
    END IF;

    UPDATE clan_join_requests
    SET status = 'rejected', approved_by = v_user_id, approved_at = NOW()
    WHERE id = v_request.id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, 'rejected'::TEXT, v_request.clan_id, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7) Add RPC to purchase one additional clan member slot
CREATE OR REPLACE FUNCTION rpc_purchase_clan_member_slot()
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT,
    new_member_limit INTEGER,
    slot_cost INTEGER,
    vault_coins_remaining INTEGER
) AS $$
DECLARE
    v_user_id UUID;
    v_clan_id UUID;
    v_user_role TEXT;
    v_extra_slots INTEGER;
    v_slot_cost INTEGER;
    v_vault_coins INTEGER;
    v_new_member_limit INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT, 0, 0, 0;
        RETURN;
    END IF;

    SELECT clan_id, role
    INTO v_clan_id, v_user_role
    FROM clan_members
    WHERE user_id = v_user_id;

    IF v_clan_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'You are not in a clan'::TEXT, 0, 0, 0;
        RETURN;
    END IF;

    IF v_user_role NOT IN ('leader', 'officer', 'moderator') THEN
        RETURN QUERY SELECT FALSE, 'Only leader/officer/moderator can buy clan slots'::TEXT, 0, 0, 0;
        RETURN;
    END IF;

    SELECT extra_member_slots_purchased, vault_coins
    INTO v_extra_slots, v_vault_coins
    FROM clans
    WHERE id = v_clan_id
    FOR UPDATE;

    IF v_extra_slots IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Clan not found'::TEXT, 0, 0, 0;
        RETURN;
    END IF;

    v_slot_cost := 10000 * (v_extra_slots + 1);

    IF v_vault_coins < v_slot_cost THEN
        RETURN QUERY SELECT FALSE, 'Not enough coins in clan vault to buy next member slot'::TEXT, 0, v_slot_cost, v_vault_coins;
        RETURN;
    END IF;

    UPDATE clans
    SET
        vault_coins = vault_coins - v_slot_cost,
        extra_member_slots_purchased = extra_member_slots_purchased + 1,
        member_limit = member_limit + 1
    WHERE id = v_clan_id
    RETURNING member_limit, vault_coins
    INTO v_new_member_limit, v_vault_coins;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_member_limit, v_slot_cost, v_vault_coins;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
