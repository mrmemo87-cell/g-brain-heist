-- Enhanced Kyrgyz Bot System for G-Brains Heist
-- This creates realistic bot players that appear in leaderboards, attacks, and activities

-- ============================================
-- 1. ENHANCED KYRGYZ BOT PERSONAS
-- ============================================

-- Create bot users table for persistent bot data
CREATE TABLE IF NOT EXISTS bot_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_persona_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    batch TEXT NOT NULL CHECK (batch IN ('8A', '8B', '8C')),
    avatar_url TEXT,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100,
    gemstones INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    ap_now INTEGER DEFAULT 20,
    ap_max INTEGER DEFAULT 20,
    last_ap_update TIMESTAMPTZ DEFAULT NOW(),
    attack_power INTEGER DEFAULT 10,
    defense_power INTEGER DEFAULT 10,
    role TEXT DEFAULT 'student',
    tutorial_completed BOOLEAN DEFAULT true,
    total_questions_answered INTEGER DEFAULT 0,
    achievement_points INTEGER DEFAULT 0,
    last_attacked_at TIMESTAMPTZ,
    
    -- Bot-specific fields
    bot_personality TEXT NOT NULL CHECK (bot_personality IN ('aggressive', 'defensive', 'balanced')),
    clan_affiliation TEXT,
    activity_pattern TEXT DEFAULT 'regular',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for bot users
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;

-- Allow everyone to select bot users (they appear in leaderboards and PvP)
DROP POLICY IF EXISTS "bot_users_select_all" ON bot_users;
CREATE POLICY "bot_users_select_all" ON bot_users FOR SELECT USING (true);

-- Only system can insert/update bot users
DROP POLICY IF EXISTS "bot_users_system_only" ON bot_users;
CREATE POLICY "bot_users_system_only" ON bot_users FOR ALL USING (false);

-- Create indexes for bot users
CREATE INDEX IF NOT EXISTS idx_bot_users_level ON bot_users(level DESC);
CREATE INDEX IF NOT EXISTS idx_bot_users_coins ON bot_users(coins DESC);
CREATE INDEX IF NOT EXISTS idx_bot_users_xp ON bot_users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_bot_users_last_seen ON bot_users(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_bot_users_batch ON bot_users(batch);
CREATE INDEX IF NOT EXISTS idx_bot_users_clan ON bot_users(clan_affiliation);

-- ============================================
-- 2. INSERT ENHANCED KYRGYZ BOT PERSONAS
-- ============================================

-- Delete existing bot users to refresh
DELETE FROM bot_users;

-- Insert enhanced Kyrgyz bot personas
INSERT INTO bot_users (
    bot_persona_id, username, email, batch, avatar_url, level, xp, coins, gemstones, streak,
    attack_power, defense_power, bot_personality, clan_affiliation, total_questions_answered, achievement_points
) VALUES 
-- Aggressive Attackers
('aida_bekova', 'Aida Bekova', 'aida.bekova@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=aida_bekova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 18, 1650, 4200, 12, 8, 28, 15, 'aggressive', 'Kyrgyz Cyber Eagles', 145, 85),
('elnur_sydykov', 'Elnur Sydykov', 'elnur.sydykov@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=elnur_sydykov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 16, 1420, 3800, 8, 6, 25, 18, 'aggressive', 'Bishkek Hackers', 128, 72),
('gulnaz_asanova', 'Gulnaz Asanova', 'gulnaz.asanova@student.kg', '8C', 'https://api.dicebear.com/7.x/adventurer/svg?seed=gulnaz_asanova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 20, 1890, 5100, 15, 11, 30, 20, 'aggressive', 'Tian Shan Warriors', 167, 95),
('bektur_mamytov', 'Bektur Mamytov', 'bektur.mamytov@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=bektur_mamytov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 17, 1520, 4300, 10, 7, 27, 16, 'aggressive', 'Kyrgyz Cyber Eagles', 139, 78),
('nargiza_toktosunova', 'Nargiza Toktosunova', 'nargiza.toktosunova@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=nargiza_toktosunova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 19, 1750, 4800, 13, 9, 29, 19, 'aggressive', 'Issyk-Kul Guardians', 156, 89),

-- Defensive Players
('aigerim_sultanova', 'Aigerim Sultanova', 'aigerim.sultanova@student.kg', '8C', 'https://api.dicebear.com/7.x/adventurer/svg?seed=aigerim_sultanova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 15, 1280, 3200, 7, 5, 18, 28, 'defensive', 'Ala-Too Defenders', 134, 68),
('azat_nazarov', 'Azat Nazarov', 'azat.nazarov@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=azat_nazarov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 14, 1150, 2900, 6, 4, 16, 26, 'defensive', 'Kyrgyz Cyber Eagles', 118, 62),
('jyldyz_osmonova', 'Jyldyz Osmonova', 'jyldyz.osmonova@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=jyldyz_osmonova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 16, 1380, 3500, 8, 6, 19, 29, 'defensive', 'Bishkek Hackers', 142, 71),
('ulan_kasybekov', 'Ulan Kasybekov', 'ulan.kasybekov@student.kg', '8C', 'https://api.dicebear.com/7.x/adventurer/svg?seed=ulan_kasybekov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 13, 1020, 2700, 5, 3, 15, 25, 'defensive', 'Tian Shan Warriors', 109, 58),
('bermet_toktogulova', 'Bermet Toktogulova', 'bermet.toktogulova@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=bermet_toktogulova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 17, 1480, 3900, 9, 7, 20, 30, 'defensive', 'Issyk-Kul Guardians', 148, 76),

-- Balanced Players
('nursultan_abdykalykov', 'Nursultan Abdykalykov', 'nursultan.abdykalykov@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=nursultan_abdykalykov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 18, 1620, 4100, 11, 8, 24, 24, 'balanced', 'Bishkek Hackers', 152, 82),
('kanykei_sultanova', 'Kanykei Sultanova', 'kanykei.sultanova@student.kg', '8C', 'https://api.dicebear.com/7.x/adventurer/svg?seed=kanykei_sultanova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 16, 1400, 3700, 9, 6, 22, 22, 'balanced', 'Tian Shan Warriors', 136, 74),
('temirlan_askarov', 'Temirlan Askarov', 'temirlan.askarov@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=temirlan_askarov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 15, 1320, 3400, 8, 5, 21, 21, 'balanced', 'Kyrgyz Cyber Eagles', 127, 69),
('asel_turgunbaeva', 'Asel Turgunbaeva', 'asel.turgunbaeva@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=asel_turgunbaeva&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 19, 1720, 4600, 12, 9, 26, 26, 'balanced', 'Issyk-Kul Guardians', 161, 87),
('erkin_madaminov', 'Erkin Madaminov', 'erkin.madaminov@student.kg', '8C', 'https://api.dicebear.com/7.x/adventurer/svg?seed=erkin_madaminov&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 17, 1540, 4000, 10, 7, 23, 23, 'balanced', 'Ala-Too Defenders', 144, 79),

-- Additional Diverse Bots
('dinara_abdrazakova', 'Dinara Abdrazakova', 'dinara.abdrazakova@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=dinara_abdrazakova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 21, 2050, 5800, 18, 12, 32, 25, 'aggressive', 'Kyrgyz Cyber Eagles', 178, 102),
('manas_koichuev', 'Manas Koichuev', 'manas.koichuev@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=manas_koichuev&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 12, 980, 2500, 4, 2, 14, 24, 'defensive', 'Bishkek Hackers', 95, 52),
('altynai_zakirova', 'Altynai Zakirova', 'altynai.zakirova@student.kg', '8C', 'https://api.dicebear.com/7.x/adventurer/svg?seed=altynai_zakirova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 22, 2180, 6200, 20, 14, 34, 28, 'balanced', 'Tian Shan Warriors', 189, 108),
('tilek_nazaraliev', 'Tilek Nazaraliev', 'tilek.nazaraliev@student.kg', '8A', 'https://api.dicebear.com/7.x/adventurer/svg?seed=tilek_nazaraliev&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 11, 850, 2200, 3, 1, 13, 22, 'defensive', 'Issyk-Kul Guardians', 87, 48),
('zhyldyz_bakirova', 'Zhyldyz Bakirova', 'zhyldyz.bakirova@student.kg', '8B', 'https://api.dicebear.com/7.x/adventurer/svg?seed=zhyldyz_bakirova&backgroundColor=c0aede,ffd5dc,ffdfbf&radius=50', 23, 2320, 6800, 22, 15, 36, 30, 'aggressive', 'Ala-Too Defenders', 203, 115);

-- ============================================
-- 3. BOT ACTIVITY SIMULATION FUNCTIONS
-- ============================================

-- Function to simulate bot activity and update their stats
CREATE OR REPLACE FUNCTION simulate_bot_activity()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    bot_record RECORD;
    activity_chance NUMERIC;
    xp_gain INTEGER;
    coins_gain INTEGER;
    new_level INTEGER;
    minutes_since_update NUMERIC;
BEGIN
    -- Loop through all bot users
    FOR bot_record IN 
        SELECT * FROM bot_users 
        WHERE updated_at < NOW() - INTERVAL '10 minutes'
    LOOP
        -- Calculate minutes since last update
        minutes_since_update := EXTRACT(EPOCH FROM (NOW() - bot_record.updated_at)) / 60.0;
        
        -- Different personalities have different activity patterns
        activity_chance := CASE 
            WHEN bot_record.bot_personality = 'aggressive' THEN 0.7
            WHEN bot_record.bot_personality = 'defensive' THEN 0.4
            ELSE 0.55 -- balanced
        END;
        
        -- Only simulate activity if enough time has passed and random chance
        IF minutes_since_update > 10 AND random() < activity_chance THEN
            -- Generate XP and coins based on personality
            xp_gain := CASE 
                WHEN bot_record.bot_personality = 'aggressive' THEN 15 + floor(random() * 25)::INTEGER
                WHEN bot_record.bot_personality = 'defensive' THEN 8 + floor(random() * 15)::INTEGER  
                ELSE 12 + floor(random() * 20)::INTEGER -- balanced
            END;
            
            coins_gain := CASE 
                WHEN bot_record.bot_personality = 'aggressive' THEN 20 + floor(random() * 40)::INTEGER
                WHEN bot_record.bot_personality = 'defensive' THEN 10 + floor(random() * 25)::INTEGER
                ELSE 15 + floor(random() * 30)::INTEGER -- balanced
            END;
            
            -- Calculate new level
            new_level := GREATEST(1, FLOOR((bot_record.xp + xp_gain) / 100.0) + 1);
            
            -- Update bot stats
            UPDATE bot_users 
            SET 
                xp = xp + xp_gain,
                coins = coins + coins_gain,
                level = new_level,
                last_seen = NOW(),
                updated_at = NOW(),
                -- Regenerate AP
                ap_now = LEAST(ap_max, ap_now + FLOOR(minutes_since_update / 10.0)::INTEGER),
                last_ap_update = NOW()
            WHERE id = bot_record.id;
            
            -- Create activity entry for news feed
            INSERT INTO activities (kind, actor_id, actor_username, data)
            VALUES (
                CASE 
                    WHEN random() < 0.6 THEN 'quest_complete'
                    WHEN random() < 0.8 THEN 'level_up'
                    ELSE 'shop_purchase'
                END,
                bot_record.id,
                bot_record.username,
                jsonb_build_object('xp_gained', xp_gain, 'coins_gained', coins_gain, 'bot_activity', true)
            );
        END IF;
    END LOOP;
    
    RETURN 'Bot activity simulation completed';
END;
$$;

-- Function to create bot vs bot PvP activities
CREATE OR REPLACE FUNCTION simulate_bot_pvp_activity()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    attacker_bot RECORD;
    defender_bot RECORD;
    attack_success BOOLEAN;
    coins_stolen INTEGER;
BEGIN
    -- Get random aggressive bot as attacker
    SELECT * INTO attacker_bot 
    FROM bot_users 
    WHERE bot_personality = 'aggressive' 
    AND ap_now >= 5
    ORDER BY random() 
    LIMIT 1;
    
    -- Get random different bot as defender
    SELECT * INTO defender_bot 
    FROM bot_users 
    WHERE id != attacker_bot.id
    AND last_attacked_at < NOW() - INTERVAL '1 hour' OR last_attacked_at IS NULL
    ORDER BY random() 
    LIMIT 1;
    
    IF attacker_bot.id IS NOT NULL AND defender_bot.id IS NOT NULL THEN
        -- Calculate attack success based on stats
        attack_success := (attacker_bot.attack_power::NUMERIC / (attacker_bot.attack_power + defender_bot.defense_power)) > random();
        
        IF attack_success THEN
            -- Successful attack
            coins_stolen := LEAST(defender_bot.coins, 50 + floor(random() * 100)::INTEGER);
            
            -- Update attacker (winner)
            UPDATE bot_users 
            SET 
                coins = coins + coins_stolen,
                xp = xp + 25,
                ap_now = ap_now - 5,
                updated_at = NOW()
            WHERE id = attacker_bot.id;
            
            -- Update defender (loser)  
            UPDATE bot_users
            SET 
                coins = GREATEST(0, coins - coins_stolen),
                last_attacked_at = NOW(),
                updated_at = NOW()
            WHERE id = defender_bot.id;
            
            -- Create PvP win activity
            INSERT INTO activities (kind, actor_id, actor_username, target_id, target_username, data)
            VALUES (
                'pvp_win',
                attacker_bot.id,
                attacker_bot.username,
                defender_bot.id,
                defender_bot.username,
                jsonb_build_object('coins_stolen', coins_stolen, 'bot_pvp', true, 'details', 'Stole ' || coins_stolen || ' coins')
            );
        ELSE
            -- Failed attack
            UPDATE bot_users 
            SET 
                ap_now = ap_now - 5,
                updated_at = NOW()
            WHERE id = attacker_bot.id;
            
            -- Create PvP loss activity
            INSERT INTO activities (kind, actor_id, actor_username, target_id, target_username, data)
            VALUES (
                'pvp_loss',
                attacker_bot.id,
                attacker_bot.username,
                defender_bot.id,
                defender_bot.username,
                jsonb_build_object('bot_pvp', true, 'details', 'Attack was defended')
            );
        END IF;
    END IF;
    
    RETURN 'Bot PvP simulation completed';
END;
$$;

-- ============================================
-- 4. BOT MANAGEMENT FUNCTIONS
-- ============================================

-- Function to get all bot users for leaderboards
CREATE OR REPLACE FUNCTION get_bot_leaderboard_data()
RETURNS TABLE (
    id UUID,
    username TEXT,
    avatar_url TEXT,
    level INTEGER,
    xp INTEGER,
    coins INTEGER,
    batch TEXT,
    last_seen TIMESTAMPTZ,
    role TEXT,
    attack_power INTEGER,
    defense_power INTEGER,
    clan_affiliation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- First simulate some bot activity
    PERFORM simulate_bot_activity();
    
    -- Occasionally simulate bot PvP
    IF random() < 0.3 THEN
        PERFORM simulate_bot_pvp_activity();
    END IF;
    
    -- Return bot data for leaderboards
    RETURN QUERY 
    SELECT 
        b.id,
        b.username,
        b.avatar_url,
        b.level,
        b.xp,
        b.coins,
        b.batch,
        b.last_seen,
        b.role,
        b.attack_power,
        b.defense_power,
        b.clan_affiliation
    FROM bot_users b
    ORDER BY b.level DESC, b.xp DESC;
END;
$$;

-- Function to get bot users as PvP targets
CREATE OR REPLACE FUNCTION get_bot_pvp_targets(p_user_id UUID)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    level INTEGER,
    coins INTEGER,
    batch TEXT,
    has_shield BOOLEAN,
    est_win_rate NUMERIC,
    avatar_url TEXT,
    last_seen TIMESTAMPTZ,
    clan_name TEXT,
    attack_power INTEGER,
    defense_power INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Simulate bot activity before returning targets
    PERFORM simulate_bot_activity();
    
    -- Return eligible bot targets (not recently attacked, have coins)
    RETURN QUERY 
    SELECT 
        b.id,
        b.username,
        b.level,
        b.coins,
        b.batch,
        (b.bot_personality = 'defensive' AND random() < 0.6)::BOOLEAN as has_shield,
        CASE 
            WHEN b.bot_personality = 'aggressive' THEN 0.3 + (random() * 0.3)
            WHEN b.bot_personality = 'defensive' THEN 0.6 + (random() * 0.3)  
            ELSE 0.45 + (random() * 0.3) -- balanced
        END as est_win_rate,
        b.avatar_url,
        b.last_seen,
        b.clan_affiliation,
        b.attack_power,
        b.defense_power
    FROM bot_users b
    WHERE b.coins > 50
    AND (b.last_attacked_at IS NULL OR b.last_attacked_at < NOW() - INTERVAL '30 minutes')
    ORDER BY random()
    LIMIT 15;
END;
$$;

-- ============================================
-- 5. PERIODIC BOT ACTIVITY TRIGGER
-- ============================================

-- Create a function that can be called periodically to keep bots active
CREATE OR REPLACE FUNCTION maintain_bot_ecosystem()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_msg TEXT := '';
BEGIN
    -- Simulate general bot activity
    PERFORM simulate_bot_activity();
    result_msg := result_msg || 'Bot activity updated. ';
    
    -- Simulate bot vs bot PvP (30% chance)
    IF random() < 0.3 THEN
        PERFORM simulate_bot_pvp_activity();
        result_msg := result_msg || 'Bot PvP simulated. ';
    END IF;
    
    -- Clean up old activities (keep last 100 bot activities)
    DELETE FROM activities 
    WHERE data->>'bot_activity' = 'true' 
    AND id NOT IN (
        SELECT id FROM activities 
        WHERE data->>'bot_activity' = 'true'
        ORDER BY created_at DESC 
        LIMIT 100
    );
    result_msg := result_msg || 'Bot activities cleaned up.';
    
    RETURN result_msg;
END;
$$;

-- ============================================
-- 6. VERIFICATION AND TESTING
-- ============================================

-- Test bot system
SELECT 'BOT SYSTEM VERIFICATION' as check_type;

-- Check bot users were created
SELECT 
    COUNT(*) as total_bots,
    COUNT(CASE WHEN bot_personality = 'aggressive' THEN 1 END) as aggressive_bots,
    COUNT(CASE WHEN bot_personality = 'defensive' THEN 1 END) as defensive_bots,
    COUNT(CASE WHEN bot_personality = 'balanced' THEN 1 END) as balanced_bots
FROM bot_users;

-- Check bot functions work
SELECT maintain_bot_ecosystem() as ecosystem_test;

-- Show sample bot data for leaderboards
SELECT 'SAMPLE BOT LEADERBOARD DATA' as check_type;
SELECT username, level, xp, coins, bot_personality, clan_affiliation 
FROM bot_users 
ORDER BY level DESC, xp DESC 
LIMIT 10;

-- Show sample bot PvP targets
SELECT 'SAMPLE BOT PVP TARGETS' as check_type;
SELECT * FROM get_bot_pvp_targets('00000000-0000-0000-0000-000000000000'::UUID) LIMIT 5;

SELECT 'Enhanced Kyrgyz bot system deployed successfully!' as final_status;