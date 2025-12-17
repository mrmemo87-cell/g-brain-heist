# Multi-Tenant Deployment Guide

This guide explains how to deploy the multi-tenant (multi-school) upgrade for G-Brains Heist.

## Overview

The multi-tenant upgrade transforms your single-school setup into a platform that can support multiple schools, each with isolated data and their own teachers/students.

### What's New

1. **Schools as tenants** - Each school is a separate entity with its own settings
2. **School memberships** - Users belong to schools via `school_members` table
3. **OAuth setup flow** - Google OAuth users now complete a "Finish Setup" screen
4. **Invite codes** - Schools can generate invite codes for easy onboarding
5. **RLS isolation** - Users can only see data from their own school

---

## Deployment Steps

### Phase 1: Database Migration

1. **Backup your database** (if you have live data)
   ```sql
   -- In Supabase SQL Editor, export your data first
   ```

2. **Run the migration script**
   - Go to Supabase Dashboard → SQL Editor
   - Open `MULTI_TENANT_MIGRATION.sql`
   - Run the entire script
   - This will:
     - Create `schools` and `school_members` tables
     - Add `school_id`, `role`, `needs_setup` columns to `users`
     - Create a default school "Silk Road International School"
     - Migrate all existing users to the default school
     - Set up RLS policies for school isolation

3. **Verify migration**
   ```sql
   -- Check schools table
   SELECT * FROM schools;
   
   -- Check school_members were created
   SELECT COUNT(*) FROM school_members;
   
   -- Check users have school_id
   SELECT id, username, school_id, role FROM users LIMIT 10;
   ```

### Phase 2: Deploy Frontend

1. **Update your deployment**
   - Push the updated code to your repository
   - Vercel/Netlify will auto-deploy

2. **Test the signup flow**
   - Visit your app
   - Click "Sign Up"
   - Verify the school dropdown loads
   - Try creating a new account

3. **Test OAuth flow**
   - Click "Continue with Google"
   - After auth, you should see the "Finish Setup" modal
   - Select school, role, grade/batch
   - Complete setup

---

## Adding New Schools

### Option 1: Direct SQL Insert

```sql
INSERT INTO schools (name, slug, status, settings)
VALUES (
    'New School Name',
    'new-school-slug',
    'active',
    '{
        "allow_student_signup": true,
        "allow_teacher_signup": true,
        "require_email_verification": true
    }'::jsonb
);
```

### Option 2: With Invite Code

```sql
-- Create school with invite code
INSERT INTO schools (name, slug, invite_code, status, settings)
VALUES (
    'Partner School',
    'partner-school',
    'PARTNER1',  -- 8-character code
    'active',
    '{
        "allow_student_signup": true,
        "allow_teacher_signup": true
    }'::jsonb
);
```

### Option 3: With Email Domain Restriction

```sql
-- Only allow specific email domains
INSERT INTO schools (name, slug, allowed_email_domains, status, settings)
VALUES (
    'Corporate Training',
    'corporate-training',
    ARRAY['company.com', 'partner.com'],
    'active',
    '{
        "allow_student_signup": true,
        "allow_teacher_signup": true
    }'::jsonb
);
```

---

## Managing Schools

### Generate New Invite Code

```sql
-- As a school admin, generate new invite code
SELECT generate_school_invite_code('SCHOOL_UUID_HERE');
```

### View School Members

```sql
SELECT 
    u.username,
    u.email,
    sm.role_in_school,
    sm.joined_at
FROM school_members sm
JOIN users u ON u.id = sm.user_id
WHERE sm.school_id = 'SCHOOL_UUID_HERE'
ORDER BY sm.joined_at DESC;
```

### Promote User to School Admin

```sql
UPDATE school_members 
SET role_in_school = 'school_admin'
WHERE user_id = 'USER_UUID_HERE' 
AND school_id = 'SCHOOL_UUID_HERE';
```

### Suspend a School

```sql
UPDATE schools 
SET status = 'suspended', updated_at = NOW()
WHERE id = 'SCHOOL_UUID_HERE';
```

---

## RLS Policy Summary

| Table | Policy | Description |
|-------|--------|-------------|
| `schools` | Anyone can view active | For signup dropdown |
| `school_members` | View own + same school | Users see their school's members |
| `users` | View same school | Users see profiles in their school |
| `mcq_questions` | View same school + grade | Questions scoped to school |

---

## Testing Checklist

### Signup Flow
- [ ] School dropdown loads from database
- [ ] Invite code validation works
- [ ] Student signup with grade/batch works
- [ ] Teacher signup works
- [ ] Error messages display correctly

### OAuth Flow
- [ ] Google login redirects properly
- [ ] Finish Setup modal appears for new OAuth users
- [ ] School selection works
- [ ] Role selection works
- [ ] Grade/batch selection for students works
- [ ] Profile bootstrap completes successfully

### Data Isolation
- [ ] Student A from School 1 cannot see Student B from School 2
- [ ] Teacher from School 1 cannot see questions from School 2
- [ ] Leaderboards only show same-school users

---

## Troubleshooting

### "School dropdown is empty"

1. Check if schools exist:
   ```sql
   SELECT * FROM schools WHERE status = 'active';
   ```

2. Check RPC permissions:
   ```sql
   -- Grant access if needed
   GRANT EXECUTE ON FUNCTION get_available_schools() TO anon;
   GRANT EXECUTE ON FUNCTION get_available_schools() TO authenticated;
   ```

### "Profile bootstrap failed"

1. Check user's auth status:
   ```sql
   SELECT * FROM auth.users WHERE email = 'user@example.com';
   ```

2. Check if profile already exists:
   ```sql
   SELECT * FROM users WHERE email = 'user@example.com';
   ```

3. Check school_members constraint:
   ```sql
   SELECT * FROM school_members 
   WHERE user_id = 'USER_UUID';
   ```

### "User can see other school's data"

1. Verify RLS is enabled:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
   ```

2. Check user's school_id:
   ```sql
   SELECT id, school_id FROM users WHERE id = auth.uid();
   ```

---

## Rollback Plan

If you need to rollback:

```sql
-- 1. Remove new columns (WARNING: loses data)
ALTER TABLE users DROP COLUMN IF EXISTS school_id;
ALTER TABLE users DROP COLUMN IF EXISTS needs_setup;

-- 2. Drop new tables
DROP TABLE IF EXISTS school_members;
DROP TABLE IF EXISTS schools;

-- 3. Restore old RLS policies
-- (Run your original supabase-rls-policies.sql)
```

---

## Next Steps (Phase 2)

Once Phase 1 is stable, consider:

1. **School Admin Dashboard**
   - Manage members
   - Generate invite codes
   - View analytics

2. **Bulk Student Import**
   - CSV upload
   - Generate login credentials

3. **Email Customization**
   - School-branded emails
   - Custom SMTP per school

4. **SSO Integration**
   - SAML for enterprise schools
   - Microsoft 365 integration

---

## Files Changed

| File | Changes |
|------|---------|
| `MULTI_TENANT_MIGRATION.sql` | New: Complete database migration |
| `services/authService.ts` | Added multi-tenant functions |
| `components/FinishSetupModal.tsx` | New: OAuth setup flow |
| `components/LoginView.tsx` | Dynamic school dropdown |
| `index.tsx` | Setup flow integration |
| `types.ts` | Added school_id, needs_setup |

---

## Support

If you encounter issues:

1. Check the browser console for errors
2. Check Supabase logs (Dashboard → Logs)
3. Verify RPC function permissions
4. Ensure RLS policies are correct

Good luck with your multi-school deployment! 🎓🚀
