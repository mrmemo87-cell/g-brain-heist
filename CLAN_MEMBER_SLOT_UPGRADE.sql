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
        ALTER TABLE clans ADD COLUMN member_limit INTEGER NOT NULL DEFAULT 5;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clans' AND column_name = 'extra_member_slots_purchased'
    ) THEN
        ALTER TABLE clans ADD COLUMN extra_member_slots_purchased INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 2) Backfill nulls defensively for pre-existing data
UPDATE clans
SET
    member_limit = COALESCE(member_limit, 5),
    extra_member_slots_purchased = COALESCE(extra_member_slots_purchased, 0)
WHERE member_limit IS NULL
   OR extra_member_slots_purchased IS NULL;

-- 3) Update join RPC to respect dynamic member_limit
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

    IF NOT EXISTS (SELECT 1 FROM clans WHERE id = p_clan_id) THEN
        RETURN QUERY SELECT FALSE, 'Clan not found'::TEXT, 0;
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User already in a clan'::TEXT, 0;
        RETURN;
    END IF;

    SELECT COUNT(*), COALESCE(MAX(c.member_limit), 5)
    INTO v_member_count, v_member_limit
    FROM clan_members cm
    JOIN clans c ON c.id = cm.clan_id
    WHERE cm.clan_id = p_clan_id;

    IF v_member_count >= v_member_limit THEN
        RETURN QUERY SELECT FALSE, 'Clan is full. Ask leader/officer/moderator to buy another slot from clan vault.'::TEXT, v_member_count;
        RETURN;
    END IF;

    INSERT INTO clan_members (clan_id, user_id, role)
    VALUES (p_clan_id, v_user_id, 'member');

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_member_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Add RPC to purchase one additional clan member slot
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
