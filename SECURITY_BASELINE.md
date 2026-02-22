# SECURITY BASELINE

> Last updated after Patches A → I (Feb 2026).  
> Run **SECURITY_REGRESSION_TRIPWIRE.sql** after every deployment — expect 27/27 PASS.

---

## 1. Architecture Overview

| Layer | Access model |
|---|---|
| Frontend (React) | Supabase JS client via `supabase.from()` + `supabase.rpc()` |
| Edge functions (`bh_api`, `stripe`, `analyze_assignment_answers`) | `supabaseAdmin` (service role) |
| Database | SECURITY DEFINER RPCs + RLS policies on tables |

**Auth flow:** Supabase Auth → JWT → `auth.uid()` resolved server-side.  
**Multi-tenant isolation:** `school_id` column on tables + JOIN-based school checks in RPCs.

---

## 2. Tables That Are "RPC Only"

These tables are **never** accessed directly from the frontend via `.from()`.  
All access flows through server-side RPCs or edge functions.

| Table(s) | Access via |
|---|---|
| `school_plans`, `pilot_quotas`, `pilot_features` | tierService RPCs (`get_school_plan_details`, `check_pilot_quota`, etc.) |
| `superadmins` | `rpc_is_superadmin`, admin RPCs internally |
| `bh_scheduled_missions`, `bh_*` game tables | Edge function `bh_api` (service role) |
| `student_assignment_answers`, `student_assignment_analyses` | Edge function `analyze_assignment_answers` |
| `stripe_customers` | Edge function `stripe` |
| `admin_roles` (IELTS) | `ielts_actor_uid()` + `is_ielts_admin()` internally |

**Rule:** If a table is RPC-only today, keep it that way. Never add `.from('table')` calls in frontend code for these.

---

## 3. Critical-Path RPCs

### Authentication & Gating
| RPC | Guard | Notes |
|---|---|---|
| `rpc_is_superadmin` | `superadmins` table | Gates entire AdminPortal |
| `rpc_is_ielts_admin` | `admin_roles` table | Gates IeltsAdminDashboard |
| `is_ielts_admin()` | `admin_roles` table | Used inside 12 `admin_ielts_*` funcs |
| `ielts_actor_uid()` | `auth.uid()` only | UUID helper; hardcoded fallback removed (Patch D) |

### Data-Modifying (High Risk)
| RPC | Guard | What it does |
|---|---|---|
| `rpc_hack_attempt` | auth + ban + cooldown + AP + school isolation | PvP attack |
| `rpc_admin_grant` | auth + `superadmins` | Grant XP/coins to any user |
| `rpc_admin_reset_all` | auth + `users.is_admin` | Wipe all player data |
| `rpc_admin_dashboard_stats` | auth + `is_current_user_admin()` | Dashboard statistics |
| `rpc_adm_consume_quota` | auth + school membership | Admission quota burn |
| `rpc_create_assignment` | auth (Patch H) | Teacher creates assignment |

### Anonymous Access (Intentional — exactly 5)
| RPC | Why anonymous |
|---|---|
| `rpc_adm_save_answer` | Admission candidates have no account |
| `rpc_adm_start_attempt` | Same |
| `rpc_adm_submit_attempt` | Same |
| `validate_invite_code` | Pre-login school join flow |
| `get_available_schools` | Pre-login school picker |

**Rule:** No other SECURITY DEFINER function should ever have `anon` access. The tripwire enforces this (check H3-2).

---

## 4. How to Add a New SECURITY DEFINER Function Safely

### RPC Header Template

Every new RPC should start with this comment block inside the function body, just after `BEGIN`:

```sql
  -- ================================================================
  -- RPC: my_new_function
  -- Purpose : <one-line description>
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : <none | superadmin | school_admin | ielts_admin | class_staff>
  -- Scope   : <own-row only | same school_id | global>
  -- Returns : <type description>
  -- Added   : <YYYY-MM-DD>
  -- Patch   : <patch letter if part of a security fix, or "N/A">
  -- ================================================================
```

Paste it, fill it in, keep it up to date. This makes audit grep-able and helps future reviewers understand intent at a glance.

### Full Function Template

```sql
-- Template for new SECURITY DEFINER RPCs
CREATE OR REPLACE FUNCTION public.my_new_function(p_param text)
RETURNS void
LANGUAGE plpgsql
VOLATILE                              -- or STABLE for reads
SECURITY DEFINER
SET search_path = public              -- MANDATORY (Patch B)
AS $$
BEGIN
  -- ================================================================
  -- RPC: my_new_function
  -- Purpose : <describe what this does>
  -- Auth    : auth.uid() IS NULL → reject
  -- Role    : <none | superadmin | school_admin | ielts_admin>
  -- Scope   : <own-row only | same school_id | global>
  -- Returns : void
  -- Added   : <YYYY-MM-DD>
  -- Patch   : N/A
  -- ================================================================

  -- 1. Auth gate (MANDATORY for all non-anonymous RPCs)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Role gate (pick the right one)
  -- For superadmin-only:
  --   IF NOT EXISTS (SELECT 1 FROM superadmins WHERE user_id = auth.uid()) THEN
  --     RAISE EXCEPTION 'Forbidden';
  --   END IF;
  -- For school admin:
  --   IF NOT public.is_school_admin_of(p_school_id) THEN
  --     RAISE EXCEPTION 'Forbidden';
  --   END IF;
  -- For IELTS admin:
  --   IF NOT public.is_ielts_admin() THEN
  --     RAISE EXCEPTION 'not_ielts_admin';
  --   END IF;

  -- 3. School isolation (if cross-tenant data is involved)
  --   Verify the target resource belongs to the caller's school.

  -- 4. Your business logic here
  NULL;
END;
$$;

-- 5. Lock down permissions (MANDATORY)
REVOKE ALL ON FUNCTION public.my_new_function(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_new_function(text) TO authenticated;
```

### Checklist for new functions:
- [ ] `SECURITY DEFINER` with `SET search_path = public`
- [ ] RPC header comment block filled in (Purpose, Auth, Role, Scope, Returns)
- [ ] `auth.uid() IS NULL` check at top of body
- [ ] Role gate if admin/teacher/school-admin only
- [ ] School isolation if touching multi-tenant data
- [ ] `REVOKE ALL FROM PUBLIC, anon` + `GRANT TO authenticated`
- [ ] Add the function to the tripwire if it's critical-path
- [ ] Run tripwire after deployment — 27/27 PASS
- [ ] Add entry to Security Changelog (Section 9)

---

## 5. How to Run the Tripwire

1. Open **Supabase SQL Editor**
2. Paste the entire contents of `SECURITY_REGRESSION_TRIPWIRE.sql`
3. Run it
4. **Expected result:** single table, 27 rows, all showing `PASS`
5. If any row shows `FAIL`:
   - Check the `check_name` to identify which patch/section regressed
   - Cross-reference with the relevant `SECURITY_PATCH_*.sql` file
   - Fix and re-run

### When to run:
- After **every** deployment
- After any migration that touches functions or policies
- After creating or modifying any `SECURITY DEFINER` function
- After changing RLS policies
- After adding new tables or RPCs

---

## 6. Patch History

| Patch | File | Scope |
|---|---|---|
| A | `SECURITY_PATCH_DEFINER_AUDIT.sql` | 5 duplicate function overloads dropped |
| B | `SECURITY_PATCH_WAVE2.sql` | ~30 SECURITY DEFINER `search_path` fixes |
| C | `SECURITY_PATCH_C_ROLE_UNIFICATION.sql` | Role system unification + sync trigger |
| D | `SECURITY_PATCH_D_IELTS_ACTOR_UUID.sql` | Hardcoded IELTS admin UUID removed (11 funcs) |
| E | `SECURITY_PATCH_E_RPC_HARDENING.sql` | teacher_id bug, class roster auth, config flags |
| F | `SECURITY_PATCH_F_MASS_CLEANUP.sql` | 28 funcs: revoke, auth gates, self-only, role gates |
| G | `SECURITY_PATCH_G_CHATGPT_FOLLOWUP.sql` | quota fix, 8 revokes, notify self-only, school isolation |
| H | `SECURITY_PATCH_H_ABUSE_SCAN.sql` | 3 drops, 13 lockdowns, ~60 anon revokes, 14 auth gates, admin gate |
| H1 | `SECURITY_PATCH_H1_HOTFIX.sql` | SQL-to-plpgsql conversion for 2 brains_heist funcs |
| I | `SECURITY_PATCH_I_TEACHER_ASSIGNMENTS.sql` | SQL-to-plpgsql for `rpc_get_assignments_for_teacher` |
| J | `SECURITY_PATCH_J_SCHOOL_ADMIN_HARDENING.sql` | 11 new RPCs replacing direct table queries in School Admin Portal |

---

## 7. Security Changelog

> **Update this every time you touch a SECURITY DEFINER function, RLS policy, or grant.**
> One line per change. Keep newest at top.

| Date | What changed | Patch / PR | Tripwire |
|---|---|---|---|
| 2026-02-22 | 11 RPCs replacing direct table queries in School Admin Portal; class archive + subject edit UI | Patch J | 27/27 PASS |
| 2025-06-20 | `rpc_get_assignments_for_teacher` SQL→plpgsql + auth gate | Patch I | 22/22 PASS |
| 2025-06-20 | 2 brains_heist funcs SQL→plpgsql + auth gate | Patch H1 | 22/22 PASS |
| 2025-06-20 | Comprehensive abuse scan: 3 drops, 13 lockdowns, ~60 anon revokes, 14 auth gates, admin gate | Patch H | 22/22 PASS |
| 2025-06-19 | quota fix, 8 revokes, notify self-only, school isolation | Patch G | — |
| 2025-06-19 | 28 funcs: revoke, auth gates, self-only, role gates | Patch F | — |
| 2025-06-19 | teacher_id bug, class roster auth, config flags | Patch E | — |
| 2025-06-19 | Hardcoded IELTS admin UUID removed (11 funcs) | Patch D | — |
| 2025-06-19 | Role system unification + sync trigger | Patch C | — |
| 2025-06-18 | ~30 SECURITY DEFINER search_path fixes | Patch B | — |
| 2025-06-18 | 5 duplicate function overloads dropped | Patch A | — |

---

## 8. Guard Function Reference

| Function | Returns | Used by |
|---|---|---|
| `is_superadmin()` | boolean | Some admin RPCs |
| `is_current_user_admin()` | boolean | `rpc_admin_dashboard_stats` |
| `is_school_admin_of(school_id)` | boolean | School admin RPCs |
| `is_class_staff(class_id)` | boolean | Teacher RPCs (via `class_teacher_assignments`) |
| `is_ielts_admin()` | boolean | All `admin_ielts_*` RPCs |
| `ielts_actor_uid()` | uuid | IELTS internal helper (returns `auth.uid()`) |

---

## 9. What "Revoked" Means

- **`REVOKE ALL FROM PUBLIC, anon`** = cannot be called via Supabase anon key or by default
- **`REVOKE ALL FROM authenticated`** (trigger/internal funcs) = not callable via `supabase.rpc()` at all; triggers still fire via table-owner privileges
- **`GRANT EXECUTE TO authenticated`** = callable only with a valid JWT (logged-in user)
- **`proacl IS NULL`** = PostgreSQL default = everyone can call it = **bad for SECURITY DEFINER**

If you see `proacl IS NULL` on a SECURITY DEFINER function that isn't in the anonymous-5 list, that's a security gap. The tripwire catches this (GEN-1).

---

## 10. Safe Feature Loop

> **Follow this for every PR / deploy that touches RPCs, tables, or policies.**

```
1. Implement feature via RPCs only
   - No new table exposure unless explicitly whitelisted in Section 2
   - For every new/changed RPC:
     a. Paste the RPC Header Template (Section 4)
     b. Enforce auth/role/scope in code — never "assumed by RLS"

2. Update docs
   - SECURITY_BASELINE.md checklist items (Section 4)
   - Section 7 changelog row (date / change / patch / tripwire)

3. Verify
   - npm run security:tripwire   → 22/22 PASS (or N/N if new checks added)
   - UI click-through (UI_RPC_CLICK_THROUGH_CHECKLIST.md) for touched roles/screens only

4. Ship
```

### Definition of Done — every feature slice

A feature is **done** only when:

- [ ] RPC header template present in every new/changed function
- [ ] Security changelog (Section 7) updated
- [ ] `npm run security:tripwire` → all PASS
- [ ] UI click-through for touched roles → all PASS
- [ ] No new table grants unless this baseline is updated intentionally
- [ ] No direct table queries from frontend — all writes go through RPCs

### Build Order (best ROI, minimal risk)

| Priority | Feature | Why |
|---|---|---|
| 1 | **School Admin Portal hardening** | Contained, admin-only, high surface area to secure |
| 2 | **Teacher workflows** | Assignments feed, grading, score visibility |
| 3 | **Gameplay expansions** | Only once the school system is rock-solid |
