# Fix Assignment Questions Not Rendering

## Problem
Assignment questions were returning as empty arrays (`[]`) even though questions were assigned. The logs showed:
```
[gameService] Fallback loaded rows: 0 []
[gameService] After normalization: 0 []
```

## Root Cause
The `rpc_get_student_active_assignment()` function was using `set_config('row_security', 'off', true)` but this wasn't properly bypassing RLS policies on the `questions` table within the subquery that builds the questions JSON aggregate.

## Solution
Rewrote the RPC function to:
1. Use `SECURITY DEFINER` context more effectively
2. Build the JSON payload explicitly with `jsonb_build_object` 
3. Separate the assignment lookup from the payload building
4. Ensure all question fields are properly mapped

## Deployment Steps

### Option 1: Apply via Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `FIX_ASSIGNMENT_QUESTIONS_RENDER.sql`
5. Click **Run** (or press F5)
6. Verify you see "Function updated successfully!"

### Option 2: Apply via Supabase CLI

```powershell
# Make sure you're in the project directory
cd c:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist

# Apply the migration
supabase db push --file FIX_ASSIGNMENT_QUESTIONS_RENDER.sql
```

## Verification

After applying the fix, test as a student user:

1. Log in as a student who has a pending assignment
2. Navigate to the assignments page
3. Check browser console - you should now see questions loading
4. Verify the assignment displays properly

### SQL Test Query
Run this in the SQL Editor while logged in as a student:

```sql
SELECT rpc_get_student_active_assignment();
```

You should see a JSON object with a populated `questions` array.

## Diagnostic Queries

If you still have issues, run the queries in `DIAGNOSE_ASSIGNMENT_QUESTIONS.sql` to check:
- Are assignments created?
- Are questions linked to assignments?
- Are student assignments properly assigned?
- What does the view return?

## Files Modified
- `supabase-functions/teacher_assignments.sql` - Updated RPC function
- `FIX_ASSIGNMENT_QUESTIONS_RENDER.sql` - Deployment script
- `DIAGNOSE_ASSIGNMENT_QUESTIONS.sql` - Diagnostic queries
