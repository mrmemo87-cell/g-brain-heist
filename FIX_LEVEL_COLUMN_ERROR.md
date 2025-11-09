# Fix: "column level does not exist" Error

## Problem
When running `supabase-schema.sql`, you get the error:
```
ERROR: 42703: column "level" does not exist
```

## Root Causes
This error can occur for several reasons:

1. **Column doesn't exist on referenced table**
   - A SQL query references `u.level` on the `users` table
   - The column might not be created yet when policies are applied
   - Or a table schema is missing the column

2. **RLS Policy execution before table creation**
   - Policies are being created before all tables exist
   - A policy references a column that hasn't been created

3. **Ambiguous column reference**
   - A query joins multiple tables both with "level" columns
   - Needs explicit table prefix (e.g., `users.level` not just `level`)

## Solutions

### Solution 1: Run Schema First (Recommended)
1. Run `supabase-schema.sql` FIRST
2. Wait for it to complete successfully
3. Then run `supabase-rls-policies.sql`
4. Then run any migration files

**Why:** This ensures all tables and columns exist before policies try to reference them.

### Solution 2: Verify Table Structure
Run the diagnostic queries in `TROUBLESHOOT_LEVEL_ERROR.sql`:

```sql
-- Check if users table has level column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
AND column_name = 'level';
```

If this returns no results, the `level` column is missing from the `users` table.

### Solution 3: Add Missing Column
If the `level` column is missing:

```sql
-- Add level column to users if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
```

### Solution 4: Fix RLS Policies
If a specific policy is causing the error, check that it references correct columns:

```sql
-- Example: Make sure the reference is explicit
-- WRONG: AND grade = mcq_questions.grade  (grade is ambiguous)
-- CORRECT: AND u.grade = mcq_questions.grade
```

## Step-by-Step Recovery

1. **Identify which query is failing**
   - Look at the Supabase error log
   - Run individual queries from the script

2. **Check what tables exist**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' ORDER BY table_name;
   ```

3. **Check table structure**
   ```sql
   \d users;  -- Shows all columns
   ```

4. **Verify the level column exists**
   ```sql
   SELECT * FROM users LIMIT 1;  -- Should work without errors
   ```

5. **Add missing columns if needed**
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
   ```

## Files Modified
- `supabase-schema.sql` - Added trigger DROP statements, added IF NOT EXISTS to indexes
- `TROUBLESHOOT_LEVEL_ERROR.sql` - Created diagnostic script

## Prevention
Always:
1. Run schema creation before RLS policies
2. Use explicit table aliases (`u.level`, `p.level`, etc.)
3. Check for column existence before using in policies
4. Test with simple queries first before complex joins
