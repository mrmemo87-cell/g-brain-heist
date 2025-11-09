-- Function to calculate current AP with regeneration
-- This function calculates AP on-the-fly based on time elapsed
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION calculate_current_ap(
  current_ap INT,
  max_ap INT,
  last_update TIMESTAMPTZ
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  minutes_elapsed INT;
  ap_to_regen INT;
  new_ap INT;
  current_local TIMESTAMP;
  last_local TIMESTAMP;
BEGIN
  -- Calculate minutes elapsed using Asia/Bishkek timezone reference
  current_local := timezone('Asia/Bishkek', NOW());
  last_local := timezone('Asia/Bishkek', last_update);
  minutes_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (current_local - last_local))::INT / 60);
  
  -- Regenerate 1 AP per 10 minutes
  ap_to_regen := minutes_elapsed / 10;
  
  -- Calculate new AP, capped at max
  new_ap := LEAST(current_ap + ap_to_regen, max_ap);
  
  RETURN new_ap;
END;
$$;

-- Create a view that shows users with their current calculated AP
CREATE OR REPLACE VIEW users_with_current_ap AS
SELECT 
  u.*,
  calculate_current_ap(u.ap_now, u.ap_max, COALESCE(u.last_ap_update, NOW())) as ap_current
FROM users u;

-- Function to regenerate AP for a user (call this to actually update the database)
CREATE OR REPLACE FUNCTION regenerate_user_ap(user_id_param UUID)
RETURNS TABLE(
  new_ap INT,
  ap_regenerated INT,
  minutes_elapsed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_record RECORD;
  minutes_elapsed_val INT;
  ap_to_regen INT;
  new_ap_val INT;
  current_local TIMESTAMP;
  last_local TIMESTAMP;
BEGIN
  -- Get user data
  SELECT ap_now, ap_max, COALESCE(last_ap_update, NOW()) as last_ap_update
  INTO user_record
  FROM users
  WHERE id = user_id_param;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Calculate minutes elapsed in Asia/Bishkek time
  current_local := timezone('Asia/Bishkek', NOW());
  last_local := timezone('Asia/Bishkek', user_record.last_ap_update);
  minutes_elapsed_val := GREATEST(0, EXTRACT(EPOCH FROM (current_local - last_local))::INT / 60);
  
  -- Regenerate 1 AP per 10 minutes
  ap_to_regen := minutes_elapsed_val / 10;
  
  -- Only update if there's AP to regenerate and not at max
  IF ap_to_regen > 0 AND user_record.ap_now < user_record.ap_max THEN
    new_ap_val := LEAST(user_record.ap_now + ap_to_regen, user_record.ap_max);
    
    -- Update the database
    UPDATE users
    SET 
      ap_now = new_ap_val,
      last_ap_update = timezone('Asia/Bishkek', NOW()) AT TIME ZONE 'Asia/Bishkek'
    WHERE id = user_id_param;
    
    RETURN QUERY SELECT new_ap_val, ap_to_regen, minutes_elapsed_val;
  ELSE
    -- No regeneration needed
    RETURN QUERY SELECT user_record.ap_now, 0, minutes_elapsed_val;
  END IF;
END;
$$;

-- Scheduled job to regenerate AP for all users every 10 minutes
-- This requires pg_cron extension (enable in Supabase dashboard)
-- To enable: Go to Database > Extensions > Enable pg_cron

-- Example: schedule regeneration every 10 minutes (requires pg_cron)
-- SELECT cron.schedule(
--   'regenerate-all-users-ap',
--   '*/10 * * * *',
--   $$
--   UPDATE users
--   SET 
--     ap_now = LEAST(
--       ap_now + (EXTRACT(EPOCH FROM (NOW() - COALESCE(last_ap_update, NOW())))::INT / 60 / 10),
--       ap_max
--     ),
--     last_ap_update = timezone('Asia/Bishkek', NOW()) AT TIME ZONE 'Asia/Bishkek'
--   WHERE ap_now < ap_max
--     AND (EXTRACT(EPOCH FROM (NOW() - COALESCE(last_ap_update, NOW())))::INT / 60) >= 10;
--   $$
-- );

COMMENT ON FUNCTION calculate_current_ap IS 'Calculates current AP with regeneration without updating database';
COMMENT ON FUNCTION regenerate_user_ap IS 'Regenerates and updates AP for a specific user in database';
COMMENT ON VIEW users_with_current_ap IS 'View showing users with their current calculated AP (with regeneration)';
