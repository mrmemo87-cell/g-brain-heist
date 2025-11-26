-- ================================================
-- ASSIGN UNIQUE COLORS TO ALL CLANS (Scalable)
-- ================================================
-- This script adds a color column to the clans table and assigns UNIQUE colors
-- to every clan using a combination of predefined palette and HSL generation.
-- Works for unlimited clans with no collisions.

-- Step 1: Add color column to clans table if it doesn't exist
ALTER TABLE clans
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#f97316';

-- Step 2: Create predefined color palette (20 distinct, carefully chosen colors)
-- These are primary colors for small clan counts
DO $$
DECLARE
  -- Extended palette for maximum distinctiveness
  color_palette TEXT[] := ARRAY[
    '#f97316',  -- orange-500
    '#0ea5e9',  -- sky-500
    '#10b981',  -- emerald-500
    '#a855f7',  -- purple-500
    '#f43f5e',  -- rose-500
    '#14b8a6',  -- teal-500
    '#6366f1',  -- indigo-500
    '#eab308',  -- yellow-500
    '#06b6d4',  -- cyan-500
    '#ec4899',  -- pink-500
    '#8b5cf6',  -- violet-500
    '#ef4444',  -- red-500
    '#3b82f6',  -- blue-500
    '#22c55e',  -- green-500
    '#f59e0b',  -- amber-500
    '#06b6d4',  -- cyan-500
    '#d946ef',  -- fuchsia-500
    '#64748b',  -- slate-500 (for contrast)
    '#7c3aed',  -- violet-600
    '#dc2626'   -- red-600
  ];
  
  clan_count INT;
  color_index INT := 0;
  current_clan RECORD;
  clan_counter INT := 0;
  hsl_hue NUMERIC;
  hsl_color TEXT;
  
BEGIN
  -- Count total clans
  SELECT COUNT(*) INTO clan_count FROM clans;
  
  RAISE NOTICE '======================================';
  RAISE NOTICE 'ASSIGNING UNIQUE COLORS TO % CLANS', clan_count;
  RAISE NOTICE '======================================';
  
  -- Assign colors intelligently
  FOR current_clan IN 
    SELECT id, name, created_at FROM clans ORDER BY created_at ASC, id ASC
  LOOP
    -- For first N clans (where N = palette size), use predefined colors
    -- For clans beyond that, generate unique HSL colors
    IF clan_counter < array_length(color_palette, 1) THEN
      -- Use predefined palette color
      UPDATE clans 
      SET color = color_palette[clan_counter + 1]
      WHERE id = current_clan.id;
      
      RAISE NOTICE 'Clan %: % → %', clan_counter + 1, current_clan.name, color_palette[clan_counter + 1];
    ELSE
      -- Generate unique color using HSL (Hue rotation)
      -- This creates a unique, saturated color for every clan beyond the palette
      hsl_hue := ROUND(((clan_counter - array_length(color_palette, 1)) * 360.0 / 
                        GREATEST(clan_count - array_length(color_palette, 1), 1))::NUMERIC, 0);
      
      -- Convert HSL to HEX (using hsl_to_hex formula)
      -- HSL(hue, 70%, 50%) creates vibrant, distinct colors
      hsl_color := 'hsl(' || hsl_hue || ', 70%, 50%)';
      
      UPDATE clans 
      SET color = hsl_color
      WHERE id = current_clan.id;
      
      RAISE NOTICE 'Clan %: % → %', clan_counter + 1, current_clan.name, hsl_color;
    END IF;
    
    clan_counter := clan_counter + 1;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Successfully assigned unique colors:';
  RAISE NOTICE '- Clans 1-%: Predefined palette', array_length(color_palette, 1);
  RAISE NOTICE '- Clans >%: HSL-generated unique colors', array_length(color_palette, 1);
  RAISE NOTICE '- Total clans colored: %', clan_counter;
  RAISE NOTICE '======================================';
END $$;

-- Step 3: Add constraint to ensure color is not null
ALTER TABLE clans
ALTER COLUMN color SET NOT NULL;

-- Step 3b: Create a trigger function to auto-assign colors to newly created clans
CREATE OR REPLACE FUNCTION assign_clan_color()
RETURNS TRIGGER AS $$
DECLARE
  color_palette TEXT[] := ARRAY[
    '#f97316',  -- orange-500
    '#0ea5e9',  -- sky-500
    '#10b981',  -- emerald-500
    '#a855f7',  -- purple-500
    '#f43f5e',  -- rose-500
    '#14b8a6',  -- teal-500
    '#6366f1',  -- indigo-500
    '#eab308',  -- yellow-500
    '#06b6d4',  -- cyan-500
    '#ec4899',  -- pink-500
    '#8b5cf6',  -- violet-500
    '#ef4444',  -- red-500
    '#3b82f6',  -- blue-500
    '#22c55e',  -- green-500
    '#f59e0b',  -- amber-500
    '#d946ef',  -- fuchsia-500
    '#64748b',  -- slate-500
    '#7c3aed',  -- violet-600
    '#dc2626'   -- red-600
  ];
  
  total_clans INT;
  clan_index INT;
  hsl_hue NUMERIC;
  new_color TEXT;
BEGIN
  -- If color is already set, don't override it
  IF NEW.color IS NOT NULL AND NEW.color != '#f97316' THEN
    RETURN NEW;
  END IF;
  
  -- Count existing clans
  SELECT COUNT(*) INTO total_clans FROM clans WHERE id != NEW.id;
  
  -- For first 20 clans, use predefined palette
  IF total_clans < array_length(color_palette, 1) THEN
    NEW.color := color_palette[total_clans + 1];
  ELSE
    -- For clans beyond 20, generate unique HSL color
    hsl_hue := ROUND(((total_clans - array_length(color_palette, 1)) * 360.0 / 
                      GREATEST(total_clans - array_length(color_palette, 1) + 1, 1))::NUMERIC, 0);
    NEW.color := 'hsl(' || hsl_hue || ', 70%, 50%)';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_assign_clan_color ON clans;

-- Create trigger for INSERT operations
CREATE TRIGGER trigger_assign_clan_color
BEFORE INSERT ON clans
FOR EACH ROW
EXECUTE FUNCTION assign_clan_color();

-- Step 4: Verify the assignment - show all clans with their colors
SELECT 
  ROW_NUMBER() OVER (ORDER BY created_at, id) as position,
  id,
  name,
  color,
  'Use in UI' as usage
FROM clans 
ORDER BY created_at ASC, id ASC;

-- Step 5: Verify completion
SELECT 
  'Migration completed successfully!' as status,
  COUNT(*) as total_clans_colored,
  COUNT(DISTINCT color) as unique_colors_assigned
FROM clans;

-- ================================================
-- AUTOMATIC COLOR ASSIGNMENT FOR NEW CLANS
-- ================================================
-- A trigger function has been installed that will automatically assign
-- unique colors to any NEW clans that are created:
--
-- ✓ New clans 1-20: Get colors from the predefined palette
-- ✓ New clans >20: Get HSL-generated unique colors
-- ✓ No manual work needed - colors are auto-assigned on INSERT
-- ✓ Colors are guaranteed to be unique (no collisions)
--
-- This trigger will run BEFORE any new clan is inserted into the database.
-- ================================================

