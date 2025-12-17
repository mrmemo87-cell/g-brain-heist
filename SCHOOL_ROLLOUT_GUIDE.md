# Multi-school rollout guide (G-Brains Heist)

This guide describes **how multi-school works right now** based on the deployed schema/RPCs in `MULTI_TENANT_FINAL.sql` and the current UI flows in the app.

## What exists today (plain-English)

- **A “school” is a tenant** (`schools` table).
- **Membership is canonical** (`school_members` table). Each user should have at most one active membership.
- `users.school_id` is a **cached copy** (synced by trigger) used for faster lookups.
- **Direct client writes are blocked** on tenant tables by RLS; the intended pattern is **RPC-only writes**.
- The signup UI currently supports:
  - selecting a school from a list (`get_available_schools()`)
  - optionally entering an invite code (`validate_invite_code()`)
  - completing setup via `profile_bootstrap()` (this is what actually creates membership)

## For you (platform owner / superadmin)

### 1) Create a new school

Run in Supabase SQL Editor (as DB owner):

```sql
INSERT INTO public.schools (name, slug, status, settings, allowed_email_domains, invite_code)
VALUES (
  'Example Partner School',
  'example-partner-school',
  'active',
  jsonb_build_object(
    'allow_student_signup', true,
    'allow_teacher_signup', true,
    'require_email_verification', true,
    'max_students', null,
    'max_teachers', null
  ),
  ARRAY[]::text[],
  'EXAMPLE01'
);
```

Notes:
- `slug` must be unique and URL-friendly.
- `invite_code` is **one code per school** in the current schema.
- If you don’t want invite codes, you can set `invite_code = NULL`.

### 2) Control who can sign up (student vs teacher)

These flags live inside `schools.settings` (JSONB).

```sql
-- Disable teacher signup for a school
UPDATE public.schools
SET settings = jsonb_set(settings, '{allow_teacher_signup}', 'false'::jsonb, true)
WHERE slug = 'example-partner-school';

-- Disable student signup for a school
UPDATE public.schools
SET settings = jsonb_set(settings, '{allow_student_signup}', 'false'::jsonb, true)
WHERE slug = 'example-partner-school';
```

### 3) Give a school their join instructions

Send them:
- the app URL
- their **school name** (so they can select it in the dropdown)
- optionally their **invite code** (so users can paste it to auto-select the school)

### 4) Promote someone to school admin (optional)

This is currently easiest via SQL:

```sql
-- Find user id by email
SELECT id, email FROM public.users WHERE email = 'admin@partner.edu';

-- Promote to school_admin within that school
UPDATE public.school_members
SET role_in_school = 'school_admin', updated_at = now()
WHERE user_id = (SELECT id FROM public.users WHERE email = 'admin@partner.edu')
  AND school_id = (SELECT id FROM public.schools WHERE slug = 'example-partner-school');
```

### 5) Suspend a school (hard stop)

```sql
UPDATE public.schools
SET status = 'suspended', updated_at = now()
WHERE slug = 'example-partner-school';
```

## For partner schools (what you tell them)

### Teachers
1. Create an account (email/password or Google).
2. If you see “Finish setup”, pick your school (dropdown) or paste the invite code.
3. Choose **Teacher**.
4. Setup completes immediately (teachers don’t need grade/class).

### Students
1. Create an account (email/password or Google).
2. Finish setup:
   - select school (or paste invite code)
   - choose **Student**
   - pick **Grade** and **Class/Batch**

### What they can/can’t see
- Users can only see school-scoped data where implemented via school-aware queries/RPCs.
- Leaderboards should be fetched via the school-scoped RPC (not a global table read).

## School Admin Portal (current behavior)

The in-app School Admin Portal is aligned to the deployed schema:
- **One invite code per school** (`schools.invite_code`)
- “Invites” tab shows the current code and lets admins **rotate** it (invalidates old code)
- Signup toggles are stored in `schools.settings` JSON

Required DB step:
- Run `SCHOOL_ADMIN_FUNCTIONS.sql` after `MULTI_TENANT_FINAL.sql` to install the admin RPCs the portal calls (`get_school_details`, `get_school_members`, `update_member_role`, `update_member_status`, `remove_school_member`, `update_school_settings`, `update_school_info`).

Optional hardening step (recommended):
- Run `TENANT_ISOLATION_HARDENING_PATCH.sql` after `MULTI_TENANT_FINAL.sql` to enforce “one active school per user” at the DB level and to normalize invite-code handling.

## Tenant isolation verification checklist (SQL + expected results)

These checks are meant to be run in Supabase SQL Editor.

### A) Structural guarantees (should be TRUE / present)

```sql
-- RLS enabled on tenant tables
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('schools','school_members','school_requests','invite_code_attempts');
```

Expected:
- `rls_enabled = true` for all listed tables.

```sql
-- “RPC-only writes” policies exist (insert/update/delete policies should be present and deny writes)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('schools','school_members','school_requests','invite_code_attempts')
ORDER BY tablename, policyname;
```

Expected:
- Policies exist for SELECT and for INSERT/UPDATE/DELETE.

### B) One active membership per user (should return 0 rows)

```sql
SELECT user_id, COUNT(*) AS active_memberships
FROM public.school_members
WHERE status = 'active'
GROUP BY user_id
HAVING COUNT(*) > 1;
```

Expected:
- No rows.

```sql
-- Confirm the DB-level enforcement exists (index should exist)
SELECT to_regclass('public.uq_school_members_one_active_per_user') AS active_membership_unique_index;
```

Expected:
- `active_membership_unique_index` is not null.

### C) Invite code normalization (sanity)

```sql
-- Invite codes are stored uppercase (if the optional patch ran)
SELECT COUNT(*) AS non_uppercase
FROM public.schools
WHERE invite_code IS NOT NULL AND invite_code <> UPPER(invite_code);
```

Expected:
- `non_uppercase = 0`.

### D) RLS tenant isolation behavior (requires simulating a user)

Pick two users who belong to different schools:

```sql
SELECT sm.user_id, sm.school_id
FROM public.school_members sm
WHERE sm.status = 'active'
ORDER BY sm.joined_at DESC
LIMIT 10;
```

Then simulate “user A” and verify they can’t see members of “school B”:

```sql
-- Replace with a real user UUID for user A
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
SET LOCAL ROLE authenticated;

-- Replace with school B UUID
SELECT COUNT(*) AS visible_other_school_members
FROM public.school_members
WHERE school_id = '00000000-0000-0000-0000-000000000000'::uuid;
```

Expected:
- `visible_other_school_members = 0`.

And verify cross-school leaderboard access is denied:

```sql
-- Replace with school B UUID
SELECT public.get_school_leaderboard('school', '00000000-0000-0000-0000-000000000000'::uuid, NULL, NULL, 10, 0);
```

Expected:
- JSON with `success = false` and an error like “You can only view your own school leaderboard”.

## Quick verification queries

```sql
-- Confirm a school exists and is active
SELECT id, name, slug, status, invite_code, settings
FROM public.schools
ORDER BY created_at DESC;

-- Confirm members are being created
SELECT sm.school_id, s.slug, sm.user_id, sm.role_in_school, sm.status, sm.joined_at
FROM public.school_members sm
JOIN public.schools s ON s.id = sm.school_id
ORDER BY sm.joined_at DESC
LIMIT 50;
```
