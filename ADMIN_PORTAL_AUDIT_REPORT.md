# Admin Portal — Full Audit Report
**Date:** February 24, 2026  
**Goal:** Transform the admin portal from a messy single-school tool into the real command center for the whole app.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [What's Useful (Keep)](#2-whats-useful-keep)
3. [What's Useless (Remove)](#3-whats-useless-remove)
4. [What's Broken / Half-Wired](#4-whats-broken--half-wired)
5. [Must-Have Features Missing](#5-must-have-features-missing)
6. [Security Issues](#6-security-issues)
7. [Code Health](#7-code-health)
8. [Recommended New Architecture](#8-recommended-new-architecture)
9. [Prioritized Action Plan](#9-prioritized-action-plan)

---

## 1. Architecture Overview

### Current Layout — 6 Scattered Admin Surfaces

| Component | Lines | Purpose | Entry Point |
|-----------|------:|---------|-------------|
| `AdminPortal.tsx` | 3,854 | Superadmin platform management | `view='admin'` (superadmin only) |
| `SchoolAdminPortal.tsx` | 3,453 | Per-school management | `view='school_admin'` |
| `IeltsAdminDashboard.tsx` | 2,578 | IELTS grading & membership | `view='ielts'` tab / `/ielts/admin` route |
| `Phase1AdminDashboard.tsx` | 644 | Competition phase 1 admin | `view='phase1_admin'` |
| `TournamentAdminDashboard.tsx` | 465 | Tournament season management | `view='tournament_admin'` |
| `RaidAdminView.tsx` | 180 | Raid scheduling & finalization | `view='raid_admin'` |

**Total: ~11,174 lines of admin code, zero shared components, zero shared state.**

### The Core Problem

The admin was built around **one school** and then features were bolted on as separate monoliths. Result:
- 6 disconnected admin panels that don't talk to each other
- Superadmin is **locked out** of SchoolAdminPortal (can't manage schools hands-on)
- School admin is **locked out** of everything except 4 views
- Duplicate functionality in 3+ places (Reset Progress, Refill AP, Cambridge scores)
- 154 `useState` hooks across just AdminPortal + SchoolAdminPortal
- No shared UI components (pagination, data tables, modals are copy-pasted)
- Feature toggles that do literally nothing

---

## 2. What's Useful (Keep)

### AdminPortal.tsx — Superadmin

| Tab | Verdict | Notes |
|-----|---------|-------|
| **Users** | **KEEP** | Core functionality. User search, role management, grants, bans — all essential. |
| **Schools** | **KEEP** | School admin assignment, plan management, pilot quotas — essential for multi-school. |
| **Applications** | **KEEP** | School request review workflow is complete and well-built. |
| **Cambridge** | **KEEP but MERGE** | Duplicates SchoolAdminPortal's Cambridge tab. Keep the superadmin version (cross-school view) but extract to shared component. |
| **IELTS** (wrapper) | **KEEP** | Just wraps IeltsAdminDashboard — clean delegation. |
| **Clans** | **KEEP** | Unique management surface — clan editing, member transfer, disband. |

### SchoolAdminPortal.tsx

| Tab | Verdict | Notes |
|-----|---------|-------|
| **Dashboard** | **KEEP** | Clean stats + quick actions. |
| **Members** | **KEEP** | Full member lifecycle: search, role change, ban/unban, moderation, suspension. Well-built with audit log. |
| **Classes** | **KEEP** | Create/edit/archive classes. Essential. |
| **Roster** | **KEEP** | Delegates to ClassRoster component. Works well. |
| **Subjects** | **KEEP** | CRUD for school subjects. Clean. |
| **Teachers** | **KEEP** | Teacher-to-class-subject assignments. Complete. |
| **Students** | **KEEP** | Student enrollment and class moves. |
| **Invites** | **KEEP** | Invite code display + rotation. |
| **Settings** | **KEEP** | School settings management. |
| **Billing** | **KEEP** | Tier/plan management with Paddle checkout. Well-structured. |
| **Cambridge** | **KEEP but MERGE** | Same data as AdminPortal's Cambridge tab + test visibility controls unique to school admin. |

### Other Panels

| Panel | Verdict | Notes |
|-------|---------|-------|
| **IeltsAdminDashboard** | **KEEP** | 10 sections + case file system. Most feature-complete admin panel. |
| **TournamentAdminDashboard** | **KEEP** | Clean and self-contained. Season/bracket/match management. |
| **RaidAdminView** | **KEEP** | Small, focused, complete. Schedule → monitor → finalize flow. |
| **IeltsAdminGuard** | **KEEP** | Only proper route-level auth guard in the system. |

### Backend Services

| Service | Verdict | Notes |
|---------|---------|-------|
| `adminService.ts` | **KEEP** | Two functions, both used. |
| `schoolAdminService.ts` | **KEEP + CLEAN** | 46 functions, 41 used, 5 dead. |
| `tierService.ts` | **KEEP** | Well-integrated tier/quota system used by 15+ components. |

---

## 3. What's Useless (Remove)

### Dead Code — Immediate Removal

| Item | Location | Why Remove |
|------|----------|------------|
| `maintenanceMode` state | AdminPortal.tsx L116 | Declared, never read or written. Dead. |
| `selectedStudent` state | AdminPortal.tsx L139 | Declared, never read. Modals use `reportStudent` instead. |
| Feature Toggles UI | AdminPortal.tsx L117-129, L3235-3260 | 10 toggles stored in React state only. Reset on refresh. Do literally nothing. Never wired to backend. |
| "God Mode" card | AdminPortal.tsx L1698 | Cosmetic. Always shows "ACTIVE". Connected to nothing. |
| Dashboard "User Analytics" | AdminPortal.tsx L1751-1800 | Misleading — shows stats for current page of 50 users but labels them as global stats. |
| `modTargetId` state | SchoolAdminPortal.tsx L147 | Written but never read. |
| `modTargetLoading` state | SchoolAdminPortal.tsx L149 | Set in loader but never displayed in UI. |
| `sortedMembers` alias | SchoolAdminPortal.tsx L1115 | Identity assignment `const sortedMembers = members;` — just use `members`. |
| Orphaned Gemstones JSX | Phase1AdminDashboard.tsx L125-128 | **BUG:** JSX fragment inside function body, never rendered. The "Total Gemstones" card is silently missing. |

### Dead Backend Functions

| Function | File | Why Remove |
|----------|------|------------|
| `getTeacherProfileWithClasses()` | schoolAdminService.ts | Never imported by any component. |
| `teacherHasClassAccess()` | schoolAdminService.ts | Never imported by any component. |
| `filterClassesForTeacher()` | schoolAdminService.ts | Never imported by any component. |
| `listMembersViaRPC()` | schoolAdminService.ts | Duplicate of `listSchoolMembers()`. Never called. |
| `setMemberRoleViaRPC()` | schoolAdminService.ts | Duplicate of `updateMemberRole()`. Never called. |

### Unwired SQL RPCs (Functions in DB, no frontend caller)

| RPC | SQL File | Why |
|-----|----------|-----|
| `get_school_analytics()` | SCHOOL_ADMIN_FUNCTIONS.sql | Zero TypeScript references. |
| `get_school_top_performers()` | SCHOOL_ADMIN_FUNCTIONS.sql | Zero TypeScript references. |
| `is_school_admin(UUID)` (DB version) | SCHOOL_ADMIN_FUNCTIONS.sql | Frontend does direct queries instead. |
| `rpc_adm_start_attempt()` | ADM_RPCS.sql | admissionService uses direct table queries. |
| `rpc_adm_save_answer()` | ADM_RPCS.sql | Same. |
| `rpc_adm_submit_test()` | ADM_RPCS.sql | Same. |

### Duplicate Functionality to Consolidate

| Feature | Appears In | Action |
|---------|-----------|--------|
| "Reset All Progress" | AdminPortal Dashboard, Game tab, System tab (3 copies with 3 different confirmation flows) | Keep ONE copy in System/Danger zone. |
| "Refill AP for All" | AdminPortal Game tab, System tab (identical) | Keep ONE copy. |
| "Reset PvP Leaderboard" | AdminPortal Game tab, System tab (identical) | Keep ONE copy. |
| Cambridge scores table | AdminPortal Cambridge tab, SchoolAdminPortal Cambridge tab | Extract shared `<CambridgeScoresTable>` component. |
| Player grants (coins/XP) | AdminPortal Users tab has `grantCoins` + `grantCustomCoins` (near-identical functions) | Merge into one parameterized function. |

---

## 4. What's Broken / Half-Wired

### Critical Bugs

| Bug | Severity | Location | Impact |
|-----|----------|----------|--------|
| **Orphaned JSX in Phase1AdminDashboard** | HIGH | Phase1AdminDashboard.tsx L125-128 | "Total Gemstones" card is rendered as a dead expression inside `refreshLeaderboards()` function body. The card never appears in the UI. Move it to `renderOverview()`. |
| **`playersToday` and `activeNow` show same value** | MEDIUM | AdminPortal.tsx L1421-1422 | Both mapped from `stats.attempts_last_5min`. Labels say different things but display identical numbers. |
| **Stale `defaultSeasonPayload`** | LOW | TournamentAdminDashboard.tsx L22 | `new Date().toISOString()` captured at import time. Stale if module stays loaded for days. |

### Navigation / Access Control Bugs

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| **Superadmin locked out of SchoolAdminPortal** | HIGH | App.tsx L308-311 | `isAdminMode` blocks ALL views except `'admin'`. A superadmin who is also a school admin cannot access SchoolAdminPortal to manage their school hands-on. |
| **Teacher+SchoolAdmin loses TeacherPortal** | HIGH | App.tsx L272-277 | `isSchoolAdminRole` guard fires, restricting to `[school_admin, admissions, cambridge, ielts]`. Teacher features become inaccessible. |
| **Student+SchoolAdmin loses all game features** | MEDIUM | App.tsx L272-277 | Same guard: a student promoted to school admin loses access to dashboard, pvp, shop, clan, etc. |
| **`onOpenTeacherPortal` never wired** | LOW | MainActions.tsx L539 → not passed from App.tsx | "Teacher" button in MainActions never renders for any user. Dead entry point. |
| **No mobile School Admin button** | MEDIUM | Header.tsx L692 | Button only in desktop `hidden md:flex` block. No mobile hamburger equivalent. |
| **`profile.is_admin` vs `isAdminMode` mismatch** | MEDIUM | App.tsx L1860 | Phase1Admin uses `profile?.is_admin` (client-side field) while everything else uses server-verified `isAdminMode`. A user with `is_admin=true` in their profile but who fails `isSuperadmin()` RPC can access Phase1AdminDashboard. |
| **Header `onNavigate` type too narrow** | LOW | Header.tsx L84 | Missing `school_admin`, `admissions`, `tournament`, `ielts`, `cambridge`, etc. NotificationCenter can't navigate to those views. |

### Half-Implemented Features

| Feature | Status | Location |
|---------|--------|----------|
| **Feature Toggles** | UI exists, does nothing | AdminPortal.tsx L117-129, L3235-3260 |
| **Delete School** | Button disabled with "Coming Soon" | SchoolAdminPortal.tsx L2534 |
| **Maintenance Mode** | State declared, never used | AdminPortal.tsx L116 |

---

## 5. Must-Have Features Missing

For the admin portal to be "the real admin of the whole app," these are needed:

### Tier 1 — Critical Missing

| Feature | Why Essential | Current Gap |
|---------|---------------|-------------|
| **Unified Admin Shell** | Superadmin should access ALL admin surfaces from one place | Currently 6 disconnected panels. Superadmin is locked to AdminPortal only. |
| **Real Feature Flags** | Control which features are enabled per-school or globally | Current toggles are client-side-only React state that resets on refresh. |
| **Global Search** | Search users, schools, transactions across the whole platform | Current search is per-tab, paginated, limited to 50 users. |
| **Activity/Audit Trail** | Track all admin actions globally | Only IELTS has a proper audit log. No audit trail for superadmin actions like bans, grants, role changes. |
| **Error Monitoring Dashboard** | See app errors, failed RPCs, stuck states in real-time | Analytics tab has a static "Recent Errors" field that shows nothing useful. |
| **Content Management** | Manage questions, tests, Cambridge content from admin | Cambridge answer keys are hardcoded in the component (L699-730). No CMS. |

### Tier 2 — Important Missing

| Feature | Why Important | Current Gap |
|---------|---------------|-------------|
| **Superadmin School Impersonation** | View any school as if you were their admin | Superadmin can see school list but can't "enter" a school's admin view. |
| **Bulk Operations Dashboard** | Import/export users, bulk school setup | Only individual user operations exist. |
| **Notification Center (Admin)** | Send push/email notifications to segments | Only basic announcement posting exists. No targeting. |
| **Financial Dashboard** | Revenue, subscription metrics, plan distribution | Billing tab exists per-school but no platform-wide financial overview. |
| **System Health** | DB stats, Supabase usage, storage quotas, connection pool | System tab counts table rows one-by-one. No real monitoring. |
| **Role Management UI** | Define custom roles, permissions matrix | Roles are hardcoded strings ('student', 'teacher', 'admin', 'school_admin'). |

### Tier 3 — Nice to Have

| Feature | Why Nice | Current Gap |
|---------|----------|-------------|
| **Admin Dark/Light Mode** | Admin works long hours | Uses app's existing theme only. |
| **Keyboard Shortcuts** | Power-user productivity | None. |
| **Saved Filters / Views** | Admin workflow optimization | All filters reset on tab switch. |
| **Export Everything** | Compliance and reporting | Only Cambridge has CSV export. |
| **Changelog / Release Notes** | Track what changed when | No versioning visibility. |

---

## 6. Security Issues

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| **Cambridge fallback bypasses school scoping** | HIGH | AdminPortal.tsx L180 | If `get_school_cambridge_scores` RPC fails, fallback queries ALL `quiz_scores` with no school filter. Any school's data could leak. Remove the unscoped fallback. |
| **`innerHTML` usage in React** | MEDIUM | AdminPortal.tsx L1896, L3317 | DOM mutation bypasses React, XSS vector if data changes. Replace with React state. |
| **Direct `.update()` bypasses audit trail** | MEDIUM | IeltsAdminDashboard.tsx L807 | `updatePrimeApplication` does a direct Supabase `.update()` instead of using the audited RPC path. No audit log entry. |
| **No auth guard on 4 of 6 admin panels** | MEDIUM | Tournament, Phase1, Raid, AdminPortal | Only IeltsAdminGuard does server-side auth check. All others rely on the caller (App.tsx) to verify access. If the view state is manipulated, guards are bypassed. |
| **`profile.is_admin` client-side check** | MEDIUM | App.tsx L1860 | Phase1Admin access gated by a client-side profile field, not server-verified `isSuperadmin()` RPC. |
| **Triple-fallback data loading** | LOW | AdminPortal.tsx L250-282, L293-380 | 3 fallback strategies (RPC → join → direct query) with different security scoping. If the most restrictive RPC fails, the least restrictive direct query runs. |

---

## 7. Code Health

### Monolith Size

| File | Lines | useState hooks | Why It's a Problem |
|------|------:|:--------------:|-------------------|
| AdminPortal.tsx | 3,854 | 72 | Unmaintainable. 10 tabs in one file. ~250 lines of hardcoded answer keys. |
| SchoolAdminPortal.tsx | 3,453 | 82 | 11 tabs in one file. Pagination copy-pasted 4 times. |
| IeltsAdminDashboard.tsx | 2,578 | 45 | 10 sections + 10 case-file tabs. All data typed as `any[]`. |

### Code Duplication

- **Pagination controls**: Copy-pasted 4 times in SchoolAdminPortal
- **Data tables**: Same `<table>` structure repeated in 6+ tabs
- **Confirm dialogs**: Same pattern ~10 times in SchoolAdminPortal
- **Cambridge scores rendering**: Duplicated between AdminPortal and SchoolAdminPortal
- **Grant functions**: `grantCoins` vs `grantCustomCoins` are near-identical

### Type Safety

- IeltsAdminDashboard: All data arrays are `any[]` (L208-217)
- SchoolAdminPortal: `quizScores` is `any[]` (L131)
- AdminPortal: Multiple `any` casts in fallback paths

### Console Statements in Production

| File | Count |
|------|------:|
| AdminPortal.tsx | 8 (7 unguarded) |
| SchoolAdminPortal.tsx | 12 |
| IeltsAdminDashboard.tsx | 2 |
| TournamentAdminDashboard.tsx | 7 |
| RaidAdminView.tsx | 3 |
| **Total** | **32** |

### Hardcoded Values That Should Be in Config/DB

| Value | Location |
|-------|----------|
| Cambridge answer keys (67 answers) | AdminPortal.tsx L699-730 |
| Skill categories & section definitions | AdminPortal.tsx L762-813 |
| Study action plans (text content) | AdminPortal.tsx L816-858 |
| Batch definitions (6A-12C) | AdminPortal.tsx L156-164 |
| Grade/class lists [8,9], [8A..9C] | Phase1AdminDashboard.tsx L59-60 |
| Default boss ID 'obsidian_sentinel' | RaidAdminView.tsx L16 |
| Data fetch limits (50, 200, 500, 5000, 10000) | Scattered across all files |

---

## 8. Recommended New Architecture

### Unified Admin Shell

```
/admin (SuperAdmin Shell)
├── /admin/dashboard          → Platform overview (all schools, all users, revenue)
├── /admin/users              → Global user management (existing Users tab, improved)
├── /admin/schools            → School management + ability to "enter" any school
│   └── /admin/schools/:id    → SchoolAdminPortal as a sub-view (impersonation)
├── /admin/applications       → School request review (existing)
├── /admin/content            → Question bank, Cambridge tests, answer keys (NEW)
├── /admin/game               → Bulk ops, AP refill, PvP reset (consolidated)
├── /admin/clans              → Clan management (existing)
├── /admin/tournaments        → TournamentAdminDashboard (moved here)
├── /admin/raids              → RaidAdminView (moved here)
├── /admin/phase1             → Phase1AdminDashboard (moved here)
├── /admin/ielts              → IeltsAdminDashboard (existing)
├── /admin/cambridge          → Cambridge scores cross-school (existing)
├── /admin/analytics          → Platform analytics (improved)
├── /admin/feature-flags      → Real feature flags backed by DB (NEW)
├── /admin/audit-log          → Global admin action log (NEW)
└── /admin/system             → Health, DB stats, danger zone (consolidated)
```

### Key Architectural Changes

1. **URL-based routing** instead of `view` state — use React Router for admin pages
2. **Shared component library**: `<DataTable>`, `<Pagination>`, `<ConfirmDialog>`, `<StatCard>`, `<SearchBar>`
3. **Custom hooks by domain**: `useUserManagement()`, `useCambridgeScores()`, `useSchoolMembers()`
4. **School impersonation**: Superadmin can "enter" any school and see its SchoolAdminPortal
5. **Proper feature flags**: Backed by a `feature_flags` DB table, scoped per-school or global
6. **Admin audit log**: Every admin mutation logged with who/what/when/target

### Component Decomposition

**AdminPortal.tsx (3,854 lines) → break into:**
- `AdminDashboard.tsx` (stats + quick actions)
- `AdminUserManager.tsx` (search, list, per-user actions)
- `AdminSchoolManager.tsx` (school list, plan management, quotas)
- `AdminApplicationReview.tsx` (school requests)
- `AdminGameOps.tsx` (bulk operations, consolidated)
- `AdminClanManager.tsx` (clan CRUD)
- `AdminAnalytics.tsx` (platform metrics)
- `AdminCambridgeScores.tsx` (shared with school admin)
- `AdminSystem.tsx` (feature flags, DB stats, danger zone)

**SchoolAdminPortal.tsx (3,453 lines) → break into:**
- `SchoolDashboard.tsx`
- `SchoolMemberManager.tsx` (with `useMemberState` hook)
- `SchoolClassManager.tsx`
- `SchoolSubjectManager.tsx`
- `SchoolTeacherAssignments.tsx`
- `SchoolStudentEnrollment.tsx`
- `SchoolInviteManager.tsx`
- `SchoolSettings.tsx`
- `SchoolBilling.tsx` (already partially separated)
- `SchoolCambridgeAdmin.tsx` (uses shared `<CambridgeScoresTable>`)
- `SchoolModerationPanel.tsx`

---

## 9. Prioritized Action Plan

### Phase 1 — Fix Bugs & Security (1-2 days)

| # | Task | Priority |
|---|------|----------|
| 1.1 | Fix Phase1AdminDashboard orphaned JSX (L125-128) — move Gemstones card to renderOverview | CRITICAL |
| 1.2 | Remove unscoped Cambridge fallback query (AdminPortal L180) | CRITICAL |
| 1.3 | Replace `innerHTML` with React state (AdminPortal L1896, L3317) | HIGH |
| 1.4 | Route IeltsAdminDashboard prime `.update()` through audited RPC | HIGH |
| 1.5 | Fix `playersToday` / `activeNow` showing same value (AdminPortal L1421-1422) | MEDIUM |
| 1.6 | Add mobile School Admin button in Header hamburger menu | MEDIUM |

### Phase 2 — Remove Dead Code (1 day)

| # | Task |
|---|------|
| 2.1 | Delete `maintenanceMode`, `selectedStudent` state from AdminPortal |
| 2.2 | Delete `modTargetId`, `modTargetLoading` from SchoolAdminPortal |
| 2.3 | Remove `sortedMembers` identity alias |
| 2.4 | Remove "God Mode" card from dashboard |
| 2.5 | Remove fake "User Analytics" section from dashboard (or wire to real global stats RPC) |
| 2.6 | Delete 5 unused functions from schoolAdminService.ts |
| 2.7 | Remove `onOpenTeacherPortal` from MainActions (or wire it) |
| 2.8 | Remove dead prop passes (`onJoinSchool`, `profile`) to MainActions |
| 2.9 | Remove or archive one-time SQL seed files (CREATE_ADMIN.sql, MAKE_SOBBI_ADMIN.sql, etc.) |

### Phase 3 — Fix Navigation & Access Control (2 days)

| # | Task |
|---|------|
| 3.1 | Allow superadmin to access SchoolAdminPortal (add `school_admin` to admin-mode allowlist, or add a "View as School Admin" button in AdminPortal Schools tab) |
| 3.2 | Fix Teacher+SchoolAdmin role conflict (allow `teacher` view in school admin guard allowlist) |
| 3.3 | Unify `profile.is_admin` and `isAdminMode` — use server-verified flag everywhere |
| 3.4 | Widen Header's `onNavigate` type to include all views, or migrate to React Router |
| 3.5 | Clean up `'teacher'` view state — either use it properly or remove it |

### Phase 4 — Extract Shared Components (3-4 days)

| # | Task | Saves |
|---|------|-------|
| 4.1 | Create `<DataTable>` component with sorting, selection, pagination | Replaces 6+ table implementations |
| 4.2 | Create `<Pagination>` component | Replaces 4 copy-pasted pagination blocks |
| 4.3 | Create `<ConfirmDialog>` component | Replaces ~10 inline confirm patterns |
| 4.4 | Create `<StatCard>` component | Replaces 20+ inline stat card implementations |
| 4.5 | Create `<CambridgeScoresTable>` shared component | Deduplicates AdminPortal + SchoolAdminPortal |
| 4.6 | Extract Cambridge answer keys, skill categories, action plans to config file | Removes ~250 lines from AdminPortal |

### Phase 5 — Decompose Monoliths (1-2 weeks)

| # | Task |
|---|------|
| 5.1 | Split AdminPortal.tsx into 9 focused components (see §8) |
| 5.2 | Split SchoolAdminPortal.tsx into 11 focused components (see §8) |
| 5.3 | Extract custom hooks: `useUserManagement`, `useMemberState`, `useCambridgeScores`, `useModerationState` |
| 5.4 | Add proper TypeScript interfaces for all `any[]` data (IeltsAdminDashboard, SchoolAdminPortal) |
| 5.5 | Replace 32 console.error/warn statements with centralized logger |

### Phase 6 — Wire Real Feature Flags (3-4 days)

| # | Task |
|---|------|
| 6.1 | Create `feature_flags` table in Supabase (flag_key, enabled, scope: global/school, school_id) |
| 6.2 | Create RPCs: `get_feature_flags(school_id)`, `set_feature_flag(key, enabled, scope, school_id)` |
| 6.3 | Create `featureFlagService.ts` and `useFeatureFlag(key)` hook |
| 6.4 | Replace AdminPortal's fake toggles with real DB-backed flags |
| 6.5 | Gate existing features (PvP, Shop, Raids, Tournaments, etc.) behind feature flags |

### Phase 7 — Add Global Audit Trail (3-4 days)

| # | Task |
|---|------|
| 7.1 | Create `admin_audit_log` table (admin_id, action, target_type, target_id, details JSONB, timestamp) |
| 7.2 | Create `log_admin_action()` DB function called by all admin RPCs |
| 7.3 | Build `AdminAuditLog.tsx` component with filters and search |
| 7.4 | Wire all existing admin mutations to log actions |

### Phase 8 — Unified Admin Shell (1-2 weeks)

| # | Task |
|---|------|
| 8.1 | Add React Router routes for `/admin/*` |
| 8.2 | Create `AdminShell.tsx` with sidebar navigation |
| 8.3 | Move all admin sub-panels under the unified shell |
| 8.4 | Add school impersonation (superadmin can "enter" any school's admin view) |
| 8.5 | Add global search across users, schools, and content |
| 8.6 | Add platform-wide analytics dashboard |

---

## Quick Reference — File Inventory

### Files to Edit
| File | Changes Needed |
|------|---------------|
| `App.tsx` | Fix navigation guards (L272-277, L308-311), clean dead props, unify auth checks |
| `components/AdminPortal.tsx` | Remove dead code, fix security fallback, extract to sub-components |
| `components/SchoolAdminPortal.tsx` | Remove dead state, extract to sub-components |
| `components/phase1/Phase1AdminDashboard.tsx` | Fix orphaned JSX bug at L125-128 |
| `components/IeltsAdminDashboard.tsx` | Route prime update through RPC, add types |
| `components/Header.tsx` | Add mobile school admin button, widen onNavigate type |
| `components/MainActions.tsx` | Remove or wire onOpenTeacherPortal |
| `services/schoolAdminService.ts` | Delete 5 unused functions |

### Files to Create
| File | Purpose |
|------|---------|
| `components/admin/shared/DataTable.tsx` | Reusable sortable data table |
| `components/admin/shared/Pagination.tsx` | Reusable pagination controls |
| `components/admin/shared/ConfirmDialog.tsx` | Reusable confirmation modal |
| `components/admin/shared/StatCard.tsx` | Reusable stat display card |
| `components/admin/shared/CambridgeScoresTable.tsx` | Shared Cambridge scores view |
| `config/cambridgeAnswerKeys.ts` | Extracted from AdminPortal |
| `services/featureFlagService.ts` | Real feature flag system |
| `services/auditLogService.ts` | Admin audit trail |

### SQL to Clean Up (one-time seed files — archive or delete)
- `CREATE_ADMIN.sql`
- `INIT_ADMIN_DATA.sql`
- `VERIFY_ADMIN.sql`
- `MAKE_SOBBI_ADMIN.sql`
- `FIX_ADMIN_PROFILE.sql`
- `COMPLETE_ADMIN_SETUP.sql`

---

*End of audit. The admin portal is functional but structurally broken for multi-school/platform use. Phases 1-3 (bugs, dead code, navigation) should be done immediately. Phases 4-8 (shared components, decomposition, feature flags, unified shell) are the path to making this "the real admin of the whole app."*
