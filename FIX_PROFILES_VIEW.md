# Fix: "Could not find the table 'public.profiles' in the schema cache"

## Problem
The application queries a `profiles` view that doesn't exist in your Supabase database. The view is defined in `supabase-schema.sql` but wasn't executed during initial setup.

## Solution

### Option 1: Run the Migration in Supabase Console (Recommended)
1. Go to [Supabase Console](https://app.supabase.com)
2. Navigate to your project
3. Go to **SQL Editor**
4. Create a new query
5. Copy and paste the contents of `CREATE_PROFILES_VIEW.sql`
6. Click **Run**

### Option 2: Use the Full Schema Script
If the `profiles` view was never created, run the full `supabase-schema.sql` script:

**⚠️ WARNING**: This will recreate all tables. Only do this on a fresh database without production data.

1. Go to Supabase Console → SQL Editor
2. Copy the entire `supabase-schema.sql`
3. Paste into SQL Editor
4. Click **Run**

### Option 3: Manual Creation via SQL
```sql
CREATE OR REPLACE VIEW profiles AS
SELECT
    id,
    username,
    grade,
    batch,
    xp,
    coins,
    streak,
    avatar_url,
    last_seen,
    level,
    updated_at,
    is_admin,
    is_banned
FROM users;
```

## Verification
After creating the view, verify it works:

```sql
SELECT * FROM profiles LIMIT 1;
```

If successful, you should see user data with the columns listed above.

## What the View Does
The `profiles` view provides public user information for:
- Leaderboards (grade-based and batch-based)
- User summaries
- Competition rankings
- Public profile data

The view is read-only and only exposes non-sensitive user information.

## Files Affected
- `services/competitionService.ts` - Uses `.from('profiles')`
- `supabase-schema.sql` - Defines the view

## Related Issues
- Uses RLS policies from the base `users` table
- Requires the `users` table to exist first
