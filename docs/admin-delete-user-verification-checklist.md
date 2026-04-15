# Admin Delete User — Read-Only Verification Checklist

This checklist verifies that `admin_delete_user` removed a target account cleanly and that the person can sign up again as a new user.

> Scope: **read-only verification only** (no destructive SQL in this document).

---

## 0) Inputs and safety

Set the target UUID once and reuse it:

```sql
-- Replace with the target user id you deleted
\set target_user_id '00000000-0000-0000-0000-000000000000'
```

If your SQL editor does not support `\set`, manually replace `:'target_user_id'` in queries.

---

## 1) Dry-run verification checklist (before actual delete)

Run the edge function with `dry_run=true` from a **superadmin** session and review output.

### 1.1 Dry-run call

```json
{
  "user_id": "<target_user_id>",
  "dry_run": true
}
```

### 1.2 Validate dry-run response

Confirm all are true:

- `success = true`
- `auth_deleted = false` (expected in dry run)
- `rows_deleted` contains expected table keys and non-negative counts
- `storage_paths` lists any objects under:
  - `avatars/<user_id>/...`
  - `questions/<user_id>/...` in `question-images` bucket
- `warnings` is empty, or only contains known `table_missing:*` entries for non-installed modules

### 1.3 Pre-delete sanity SQL (read-only)

```sql
-- public.users baseline
select id, email, username, created_at
from public.users
where id = :'target_user_id'::uuid;

-- superadmin self-check is not part of target verification, but target should usually not be superadmin
select user_id, added_at
from public.superadmins
where user_id = :'target_user_id'::uuid;

-- school/class links
select count(*) as school_members_count
from public.school_members
where user_id = :'target_user_id'::uuid;

select count(*) as class_students_count
from public.class_students
where student_id = :'target_user_id'::uuid;

select count(*) as bh_class_memberships_count
from public.brains_heist_class_memberships
where student_id = :'target_user_id'::uuid;
```

---

## 2) Post-delete SQL audit pack (single user_id)

Run after real delete (`dry_run=false`).

## 2.1 Core identity checks

```sql
-- Must return 0 rows
select id, email, username
from public.users
where id = :'target_user_id'::uuid;

-- Requires privileged SQL editor role (service_role / owner)
-- Must return 0 rows
select id, email, phone, created_at
from auth.users
where id = :'target_user_id'::uuid;
```

## 2.2 School/class membership checks

```sql
select count(*) as school_members_count
from public.school_members
where user_id = :'target_user_id'::uuid;

select count(*) as class_students_count
from public.class_students
where student_id = :'target_user_id'::uuid;

select count(*) as brains_heist_class_memberships_count
from public.brains_heist_class_memberships
where student_id = :'target_user_id'::uuid;
```

## 2.3 Competition / PvP checks

```sql
select count(*) as attempts_count
from public.attempts
where user_id = :'target_user_id'::uuid;

select count(*) as brains_heist_student_attempts_count
from public.brains_heist_student_attempts
where student_id = :'target_user_id'::uuid;

select count(*) as pvp_attack_attempts_count
from public.pvp_attack_attempts
where attacker_id = :'target_user_id'::uuid
   or defender_id = :'target_user_id'::uuid;

select count(*) as brains_heist_battle_events_count
from public.brains_heist_battle_events
where student_id = :'target_user_id'::uuid;
```

## 2.4 Writing Hub checks

```sql
select count(*) as bh_writing_student_profiles_count
from public.bh_writing_student_profiles
where student_id = :'target_user_id'::uuid;

select count(*) as bh_writing_student_states_count
from public.bh_writing_student_states
where student_id = :'target_user_id'::uuid;

-- Payload tables (student_id/user_id in JSON payload)
select count(*) as bh_writing_attempts_payload_count
from public.bh_writing_attempts
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_weekly_plans_payload_count
from public.bh_writing_weekly_plans
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_daily_tasks_payload_count
from public.bh_writing_daily_tasks
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_daily_submissions_payload_count
from public.bh_writing_daily_submissions
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_daily_evaluations_payload_count
from public.bh_writing_daily_evaluations
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_monthly_reports_payload_count
from public.bh_writing_monthly_reports
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_memory_snapshots_payload_count
from public.bh_writing_memory_snapshots
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';

select count(*) as bh_writing_review_signals_payload_count
from public.bh_writing_review_signals
where coalesce(payload->>'student_id', payload->>'user_id') = :'target_user_id';
```

## 2.5 IELTS checks

```sql
select count(*) as ielts_users_count
from public.ielts_users
where id = :'target_user_id'::uuid;

select count(*) as ielts_reading_attempts_count
from public.ielts_reading_attempts
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_listening_attempts_count
from public.ielts_listening_attempts
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_writing_attempts_count
from public.ielts_writing_attempts
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_speaking_attempts_count
from public.ielts_speaking_attempts
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_mock_test_attempts_count
from public.ielts_mock_test_attempts
where user_id = :'target_user_id'::uuid;

-- Depending on your schema version, user key may be user_id or student_id
select count(*) as ielts_sessions_count
from public.ielts_sessions
where user_id = :'target_user_id'::uuid
   or student_id = :'target_user_id'::uuid;

select count(*) as ielts_violation_logs_count
from public.ielts_violation_logs
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_admin_notes_count
from public.ielts_admin_notes
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_admin_user_tags_count
from public.ielts_admin_user_tags
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_memberships_count
from public.ielts_memberships
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_prime_applications_count
from public.ielts_prime_applications
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_notification_preferences_count
from public.ielts_notification_preferences
where user_id = :'target_user_id'::uuid;

select count(*) as ielts_admin_audit_log_count
from public.ielts_admin_audit_log
where user_id = :'target_user_id'::uuid;
```

## 2.6 Storage object checks (read-only)

```sql
-- Requires access to storage schema
-- avatars bucket
select count(*) as avatars_objects_count
from storage.objects
where bucket_id = 'avatars'
  and name like (:'target_user_id' || '/%');

-- question-images bucket
select count(*) as question_images_objects_count
from storage.objects
where bucket_id = 'question-images'
  and name like ('questions/' || :'target_user_id' || '/%');
```

## 2.7 Audit log verification

```sql
-- Verify edge function logged action with details
select created_at, function_name, log_level, message, user_id, context
from public.rpc_event_log
where function_name = 'admin_delete_user_v2'
  and context->>'target_user_id' = :'target_user_id'
order by created_at desc
limit 10;
```

---

## 3) Expected results for a fully deleted user

For a clean delete:

- `auth.users`: **0 rows**
- `public.users`: **0 rows**
- Every count query above: **0**
- `storage.objects` checks: **0** in both target prefixes
- `rpc_event_log` includes one recent `admin_delete_user_v2` event with:
  - `result = success`
  - `dry_run = false`
  - non-negative `rows_deleted` map and `storage_deleted`

---

## 4) Re-signup verification checklist

After deletion audits pass:

1. Start from a clean browser context (incognito/private session).
2. Sign up again with same email/phone previously used by deleted user.
3. Verify signup **succeeds** (no duplicate-user conflict).
4. Complete onboarding flow.
5. Confirm new account has a **new `auth.users.id`** and **new `public.users.id`**.
6. Confirm baseline state is fresh:
   - no old school/class memberships
   - no old attempts/progress
   - no old writing history
   - no old IELTS attempts/history
   - no legacy avatar/image references
7. Confirm login/logout works normally and app mode resolves correctly.

---

## 5) If deletion looks successful but re-signup is still odd

Inspect the following likely leftovers:

1. **Auth record still exists**
   - `auth.users` row remained due auth delete failure.
2. **Storage leftovers**
   - orphaned `avatars/<user_id>/...` or `question-images/questions/<user_id>/...` objects.
3. **Payload-table residues**
   - `bh_writing_*` rows where JSON payload uses unexpected key casing/shape.
4. **Schema drift in IELTS sessions key**
   - some deployments use `student_id`, others `user_id`; check both.
5. **Module not installed vs table missing warnings**
   - if warnings include `table_missing:*`, ensure those modules are truly absent.
6. **Client cache/session artifacts**
   - stale local storage, persisted session, or cached profile in browser/app state.
7. **External identity factor conflicts**
   - same email provider with unverified or locked auth identity outside app flow.

---

## 6) Sign-up-again acceptance criteria (pass/fail)

A delete is accepted only when **all** are true:

- Post-delete SQL pack shows **zero rows** in auth/users + all scoped dependency tables.
- Storage checks show **zero objects** under both target prefixes.
- Audit log shows successful `admin_delete_user_v2` event.
- Re-signup with same identity succeeds without manual DB intervention.
- New user lands in clean baseline state (no prior progress/history/memberships).

