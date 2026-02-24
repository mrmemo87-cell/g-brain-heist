# Tenant Isolation Audit — 2026-02-24

> **Scope**: Every SQL RPC (SECURITY DEFINER), every RLS policy, and every TypeScript direct-table query that touches school-scoped data.
>
> **Principle**: A teacher or school_admin from School A must NEVER see, affect, or modify data belonging to any other school.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 8     |
| HIGH     | 10    |
| MEDIUM   | 9     |

---

## CRITICAL Violations

### C-1: `release_quiz_score(UUID)` — No school_id filter

- **File**: [ADD_CHEMISTRY_SCORE_RELEASE.sql](ADD_CHEMISTRY_SCORE_RELEASE.sql#L36)
- **Problem**: Checks only `role = 'admin'` (via `users` table). The UPDATE has **no** `school_id` clause — any admin-role user can release scores for **any school**.
- **Impact**: Cross-tenant write. A school_admin promoted to `'admin'` role, or any user with `role='admin'`, can release quiz scores belonging to every other school.
- **Not patched**: FIX_CONSOLIDATED_AUDIT_2026_02_24.sql patches `release_quiz_scores` (plural) but NOT `release_quiz_score` (singular).
- **Fix**: Add `AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())` to the UPDATE, and change role check to include `school_admin`/`teacher` with school scoping.

---

### C-2: `get_unreleased_quiz_scores(TEXT)` — No school_id filter

- **File**: [ADD_CHEMISTRY_SCORE_RELEASE.sql](ADD_CHEMISTRY_SCORE_RELEASE.sql#L125)
- **Problem**: Checks only `role = 'admin'`. Returns ALL unreleased scores from ALL schools with no `school_id` WHERE clause.
- **Impact**: Full cross-tenant read of every unreleased score (student names, classes, quiz names, scores, percentages).
- **Not patched anywhere**.
- **Fix**: Filter `WHERE qs.school_id = (SELECT school_id FROM users WHERE id = auth.uid())` and widen role gate to `teacher`/`school_admin`.

---

### C-3: `bulk_release_quiz_scores(TEXT, TEXT)` — Original version has no school_id filter

- **File**: [ADD_CHEMISTRY_SCORE_RELEASE.sql](ADD_CHEMISTRY_SCORE_RELEASE.sql#L75)
- **Problem**: Original version checks only `role = 'admin'` and updates ALL matching quiz_scores with no school_id filter.
- **Partially patched**: [FIX_CONSOLIDATED_AUDIT_2026_02_24.sql](FIX_CONSOLIDATED_AUDIT_2026_02_24.sql#L574) replaces this with a school-scoped version. **If FIX_CONSOLIDATED was not run, the cross-tenant version is LIVE.**
- **Fix**: Ensure FIX_CONSOLIDATED_AUDIT_2026_02_24.sql has been applied. Verify with: `SELECT prosrc FROM pg_proc WHERE proname = 'bulk_release_quiz_scores'` and confirm `school_id = v_school_id` is present.

---

### C-4: `quiz_scores` INSERT — `WITH CHECK (true)` + GRANT to `anon`

- **File**: [FIX_CHEMISTRY_ANONYMOUS_SUBMISSIONS.sql](FIX_CHEMISTRY_ANONYMOUS_SUBMISSIONS.sql#L30)
- **Problem**: ANY user (including unauthenticated/anonymous) can INSERT into `quiz_scores` with **any** `student_name`, `student_class`, `quiz_name`, and `score`. The `set_quiz_score_school_id` trigger sets `school_id` by looking up `student_name` in the `users` table, but:
  - If `student_name` doesn't match any user → `school_id` stays NULL
  - Attacker can forge scores under real student names, which would get the victim's school_id
- **Impact**: Score injection/forgery across all schools. Fake scores appear in teacher dashboards.
- **Fix**: Require authentication for INSERT (`WITH CHECK (auth.uid() IS NOT NULL)`), or validate `student_name` matches `auth.uid() → users.username` for authenticated users. For anonymous chemistry tests, use a separate staging table with moderation.

---

### C-5: `get_class_roster(UUID)` — No auth/role/school check

- **File**: [ADD_CLASS_ROSTER_MANAGEMENT.sql](ADD_CLASS_ROSTER_MANAGEMENT.sql#L11)
- **Problem**: Takes any `p_class_id`, returns all students (names, emails, grades, levels, XP, ban status) with zero authorization. SECURITY DEFINER bypasses RLS.
- **Impact**: Any authenticated user can enumerate the full roster (including emails) for any class in any school.
- **Not patched**: SECURITY_PATCH_E only patches write functions (`add_student_to_class`, etc.), NOT `get_class_roster`.
- **Fix**: Add `IF NOT public.is_class_staff(p_class_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;`

---

### C-6: `get_school_class_rosters(UUID)` — No auth/school check

- **File**: [ADD_CLASS_ROSTER_MANAGEMENT.sql](ADD_CLASS_ROSTER_MANAGEMENT.sql#L59)
- **Problem**: Takes any `p_school_id` and returns all classes (codes, names, grade levels, student/teacher counts) from that school. No check that caller belongs to the school.
- **Impact**: Any authenticated user can enumerate all class structures of any school.
- **Fix**: Verify caller is `school_admin` or `teacher` + member of `p_school_id`.

---

### C-7: `get_unassigned_students(UUID)` — No auth/school check

- **File**: [ADD_CLASS_ROSTER_MANAGEMENT.sql](ADD_CLASS_ROSTER_MANAGEMENT.sql#L97)
- **Problem**: Takes any `p_school_id`, returns all unassigned students (usernames, emails, grades, XP). No authorization check.
- **Impact**: Full PII leak of unassigned students for any school.
- **Fix**: Verify caller is school_admin or teacher of `p_school_id`.

---

### C-8: `auto_enroll_students_by_grade(UUID)` — No auth/role check

- **File**: [ADD_CLASS_ROSTER_MANAGEMENT.sql](ADD_CLASS_ROSTER_MANAGEMENT.sql#L499)
- **Problem**: Any authenticated user can trigger auto-enrollment of students into a class. The function does verify the students belong to the class's school (via `u.school_id = v_class.school_id`), but there is no check that the **caller** is authorized.
- **Impact**: Cross-tenant disruption — a malicious user can auto-enroll students into classes (though limited to same-school students).
- **Fix**: Add `IF NOT public.is_class_staff(p_class_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;`

---

## HIGH Violations

### H-1: `get_teacher_assigned_classes(UUID)` — Parameter injection

- **File**: [TEACHER_CLASS_ACCESS_CONTROL.sql](TEACHER_CLASS_ACCESS_CONTROL.sql#L15)
- **Problem**: Accepts `p_teacher_user_id` parameter and returns that teacher's assigned classes without verifying the caller. A School A teacher can pass a School B teacher's UUID and see their class list (including school_name, grade_level, subjects).
- **Fix**: Only allow `auth.uid()` or verify caller is school_admin of the same school.

---

### H-2: `get_students_in_teacher_classes(UUID)` — Parameter injection

- **File**: [TEACHER_CLASS_ACCESS_CONTROL.sql](TEACHER_CLASS_ACCESS_CONTROL.sql#L100)
- **Problem**: Same as H-1. Pass any teacher's UUID → get student list (names, emails, grades, avatar_urls) for their classes in any school.
- **Fix**: Restrict to `auth.uid()` only, or verify caller is school_admin of the teacher's school.

---

### H-3: `get_teacher_profile_with_classes(UUID)` — Returns any teacher's profile

- **File**: [TEACHER_CLASS_ACCESS_CONTROL.sql](TEACHER_CLASS_ACCESS_CONTROL.sql#L138)
- **Problem**: Returns teacher profile + assigned classes + school info for any `p_teacher_user_id`. No authorization gate beyond authentication.
- **Fix**: Restrict to `auth.uid()` or verify caller is in the same school.

---

### H-4: `filter_classes_for_teacher(UUID, UUID)` — Parameter injection

- **File**: [TEACHER_CLASS_ACCESS_CONTROL.sql](TEACHER_CLASS_ACCESS_CONTROL.sql#L270)
- **Problem**: Returns filtered class list for any `p_teacher_user_id` across all schools.
- **Fix**: Restrict to `auth.uid()`.

---

### H-5: `teacher_has_class_access(UUID, UUID)` — Information leak

- **File**: [TEACHER_CLASS_ACCESS_CONTROL.sql](TEACHER_CLASS_ACCESS_CONTROL.sql#L68)
- **Problem**: Checks if any `p_teacher_user_id` has access to any `p_class_id`. Can be used to enumerate which teachers are assigned to which classes across schools.
- **Fix**: Restrict to `auth.uid()` for the teacher parameter.

---

### H-6: `get_public_profile(UUID)` — Cross-school exposure

- **File**: [SECURITY_PATCH_WAVE2.sql](SECURITY_PATCH_WAVE2.sql#L261)
- **Problem**: Returns level, XP, streak, pvp_score, batch, grade, role for ANY user_id. No school scoping.
- **Impact**: A teacher/student from School A can view sensitive gaming stats for ANY user in School B.
- **Fix**: Either restrict to same-school users, or strip sensitive fields when cross-school.

---

### H-7: Frontend fallback — direct `quiz_scores` query without school_id

- **Files**:
  - [TeacherPortal.tsx](components/TeacherPortal.tsx#L627): Fallback `.from('quiz_scores').select('*')` — fetches ALL scores across schools
  - [AdminPortal.tsx](components/AdminPortal.tsx#L179): Same fallback pattern
  - [TeacherPortal.tsx](components/TeacherPortal.tsx#L938): Direct `.update()` on quiz_scores without school_id filter
- **Problem**: When the school-scoped RPC (`get_school_cambridge_scores`) fails, the fallback queries return **all** quiz_scores (subject to RLS). If RLS policies were modified or not applied, this exposes cross-school data.
- **Fix**: Always add `.eq('school_id', currentSchoolId)` in fallback queries, or remove fallbacks entirely and require the RPC.

---

### H-8: `get_class_statistics(UUID)` — No auth check

- **File**: [ADD_CLASS_ROSTER_MANAGEMENT.sql](ADD_CLASS_ROSTER_MANAGEMENT.sql#L432)
- **Problem**: Returns detailed statistics (student count, avg XP, avg level, teacher names) for any class. No authorization. SECURITY_PATCH_E only revoked `anon` access but didn't add role/school checks inside the function.
- **Fix**: Add `IF NOT public.is_class_staff(p_class_id) THEN RAISE EXCEPTION; END IF;`

---

### H-9: `get_school_details(UUID)` — p_school_id can target foreign school

- **File**: [SCHOOL_ADMIN_FUNCTIONS.sql](SCHOOL_ADMIN_FUNCTIONS.sql#L12)
- **Problem**: While it DOES check `school_admin` membership in the target school, the check uses `school_members` which a user might not be able to fake. However, the pattern of accepting `p_school_id` as a parameter is risky — if any policy or trigger is misconfigured, the caller could pass another school's UUID.
- **Mitigating factor**: The admin check properly verifies `school_id = v_school_id AND user_id = v_user_id AND role_in_school = 'school_admin'`. Currently safe, but fragile pattern.
- **Fix**: Ignore `p_school_id` for non-superadmins; always derive from caller's membership.

---

### H-10: `rpc_get_students_for_assignment` fallback path shows all school students

- **File**: [TEACHER_CLASS_ACCESS_CONTROL.sql](TEACHER_CLASS_ACCESS_CONTROL.sql#L350)
- **Problem**: When a teacher has NO class assignments, the function falls back to showing ALL students from teacher's school. This is school-scoped but too broad — teachers should only see students in their assigned classes.
- **Fix**: If no class assignments, return empty set rather than entire school.

---

## MEDIUM Violations

### M-1: Announcements — No school scoping

- **Files**: [supabase-rls-policies.sql](supabase-rls-policies.sql#L125), [SAFE_DATABASE_MIGRATION.sql](SAFE_DATABASE_MIGRATION.sql#L382)
- **Problem**: `announcements` SELECT policy is `USING (true)` or `USING (active = true)` — all schools see all announcements. INSERT requires `is_admin = true`. AdminPortal.tsx deletes announcements by `id` without school_id filter.
- **Impact**: If announcements are intended to be school-specific, every school sees announcements from other schools. If announcements are platform-wide, this is intentional behavior.
- **Fix**: Either add `school_id` column to `announcements` and scope policies, or document that announcements are platform-wide.

---

### M-2: `quiz_scores` NULL school_id records

- **Files**: [FIX_CAMBRIDGE_TESTS_ISOLATION.sql](FIX_CAMBRIDGE_TESTS_ISOLATION.sql#L35), [FIX_CHEMISTRY_ANONYMOUS_SUBMISSIONS.sql](FIX_CHEMISTRY_ANONYMOUS_SUBMISSIONS.sql#L30)
- **Problem**: The `set_quiz_score_school_id` trigger derives school_id from `student_name → users.username → users.school_id`. If the student_name doesn't match any user, school_id is NULL. Records with NULL school_id might:
  - Be invisible to teachers (who filter by school_id)
  - Or be visible to everyone depending on which RLS policy version is active
- **Fix**: Consider rejecting inserts where school_id cannot be resolved, or require explicit school_id from the client.

---

### M-3: `remove_school_member(UUID, UUID)` — Missing `status='active'` in admin check

- **File**: [SCHOOL_ADMIN_FUNCTIONS.sql](SCHOOL_ADMIN_FUNCTIONS.sql#L612)
- **Problem**: The admin access check does `role_in_school = 'school_admin'` without `AND status = 'active'`. A suspended school_admin might still pass this check.
- **Fix**: Add `AND status = 'active'` to the admin membership check.

---

### M-4: `get_school_top_performers(UUID)` — Same admin check gap

- **File**: [SCHOOL_ADMIN_FUNCTIONS.sql](SCHOOL_ADMIN_FUNCTIONS.sql#L659)
- **Problem**: Same as M-3 — checks `role_in_school = 'school_admin'` without `status = 'active'`.
- **Fix**: Add `AND status = 'active'`.

---

### M-5: `teacher_questions` table — `USING (true)` SELECT policy

- **File**: [COMPLETE_SUPABASE_MIGRATION.sql](COMPLETE_SUPABASE_MIGRATION.sql#L254)
- **Problem**: `teacher_questions` SELECT is globally readable. If teacher-created questions contain school-specific content, students from other schools can read them.
- **Impact**: Low if questions are meant to be a shared bank; medium if questions contain school-identifying information.
- **Fix**: Add school_id scoping if questions should be school-private.

---

### M-6: `quiz_scores` RLS conflict — multiple policy definitions across files

- **Problem**: quiz_scores policies are defined/modified in at least 8 different SQL files:
  - `CREATE_QUIZ_SCORES_TABLE.sql`
  - `FIX_CAMBRIDGE_TESTS_ISOLATION.sql`
  - `SECURITY_PATCH_C_ROLE_UNIFICATION.sql`
  - `TEACHER_CLASS_ACCESS_CONTROL.sql`
  - `FIX_CONSOLIDATED_AUDIT_2026_02_24.sql`
  - `DIAGNOSTIC_QUIZ_SCORES_RLS.sql`
  - `DEEP_DIAGNOSTIC_CLEANUP.sql`
  - `FIX_CHEMISTRY_ANONYMOUS_SUBMISSIONS.sql`
- **Impact**: The active policy set depends entirely on which files were run last and in what order. There's no single source of truth.
- **Fix**: Create a single canonical migration that drops ALL existing quiz_scores policies and recreates the correct set.

---

### M-7: ADM (Admission Hub) RPCs accessible without school_id scoping

- **File**: [ADM_RPCS.sql](ADM_RPCS.sql#L12)
- **Problem**: Admission RPCs (`rpc_adm_start_attempt`, `rpc_adm_save_answer`, `rpc_adm_submit_attempt`) use candidate tokens as authentication. The school_id check is done via `v_candidate.school_id` matching the test form's school, which is correct. However, token-based auth has no rate limiting visible in the SQL.
- **Impact**: Low — the school scoping is implicit via the candidate record. But token brute-force is a risk.
- **Fix**: Consider adding attempt rate limiting per token/IP.

---

### M-8: Multiple function versions — ambiguity about live code

- **Problem**: Many functions exist in multiple files with different implementations:
  - `release_quiz_scores` — in ADD_SCORE_RELEASE_FEATURE.sql, FIX_TEACHER_ADMIN_SCORE_RELEASE.sql, FIX_CONSOLIDATED_AUDIT_2026_02_24.sql
  - `get_school_members` — in SCHOOL_ADMIN_FUNCTIONS.sql, FIX_CONSOLIDATED_AUDIT_2026_02_24.sql
  - `create_teacher_profile` — in SECURITY_PATCH_WAVE2.sql, FIX_CONSOLIDATED_AUDIT_2026_02_24.sql
  - `get_teacher_assigned_classes` — in FIX_AMBIGUOUS_COLUMN_REFERENCES.sql, FIX_TEACHER_CLASS_VISIBILITY_COMPLETE.sql, TEACHER_CLASS_ACCESS_CONTROL.sql
  - `rpc_get_students_for_assignment` — in at least 5 files
- **Impact**: If a developer re-runs an older migration, they may silently revert security fixes.
- **Fix**: Add a migration numbering system and document which file is the single source of truth for each function.

---

### M-9: `AdminPortal.tsx` — Direct queries without school_id filter

- **File**: [components/AdminPortal.tsx](components/AdminPortal.tsx#L1402)
- **Problem**: Several direct queries bypass RPCs:
  - Line 1402: `.from('users').select('grade, role, is_admin').limit(5000)` — fetches users across all schools for analytics
  - Line 1480: `.from('announcements').select('*')` — no school filter
  - Line 1493: `.from('announcements').delete().eq('id', id)` — no school_id check
- **Impact**: Depends on RLS policies. The `users` table RLS may or may not scope by school_id. If the admin has `is_admin = true`, RLS may be bypassed entirely.
- **Fix**: Use school-scoped RPCs instead of direct table queries, even for admin operations.

---

## RLS Policy Summary for Key Tables

| Table | SELECT | INSERT | UPDATE | DELETE | School-scoped? |
|-------|--------|--------|--------|--------|---------------|
| `quiz_scores` | Own scores + school staff + released | `WITH CHECK (true)` + anon | School staff | School staff | ✅ SELECT is scoped (if SECURITY_PATCH_C applied); ❌ INSERT allows anyone |
| `school_members` | Via RPC only | Via RPC only | Via RPC only | Via RPC only | ✅ Managed via RPCs |
| `users` | Varies by migration | Own record | Own record | N/A | ⚠️ Depends on which migration was last applied |
| `cambridge_test_visibility` | School staff + own | Teacher/admin | School staff | N/A | ✅ If SECURITY_PATCH_C applied |
| `classes` | School-scoped via helper fn | School admin | School admin | N/A | ✅ If FIX_CLASSES_TABLE applied |
| `class_teacher_assignments` | Not checked in detail | N/A | N/A | N/A | ⚠️ Needs verification |
| `announcements` | `USING (true)` or `active = true` | Admin only | Admin only | Admin only | ❌ No school scoping |
| `assignments` | Via RPC | Via RPC | Via RPC | N/A | ✅ RPCs are school-scoped |
| `questions` | `USING (true)` | Teacher/admin | Teacher/admin | Teacher/admin | ❌ Global read (intentional? — shared question bank) |
| `teacher_questions` | `USING (true)` | Teacher/admin | Own questions | Own questions | ❌ Global read |

---

## Priority Remediation Order

1. **Patch `release_quiz_score` (singular)** – C-1 – add school_id filter + widen role gate
2. **Patch `get_unreleased_quiz_scores`** – C-2 – add school_id filter + widen role gate
3. **Fix `quiz_scores` INSERT policy** – C-4 – require authentication or validate student_name
4. **Patch all read-only class roster RPCs** – C-5/C-6/C-7/H-8 – add `is_class_staff()` or school_admin check
5. **Lock `get_teacher_assigned_classes` and friends** – H-1 through H-5 – restrict to `auth.uid()` only for teacher param
6. **Remove frontend fallback direct queries** – H-7 – never query quiz_scores without school_id
7. **Create a single canonical migration** for quiz_scores RLS – M-6
8. **Add school_id to announcements** if per-school – M-1
