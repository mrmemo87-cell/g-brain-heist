# UI Click-Through Checklist — Post-Security-Patch Manual Testing

> Generated from full codebase scan of all `.rpc(` calls in frontend TypeScript/TSX files.

---

## Navigation Structure (App.tsx view state)

The app uses a **single-page state machine** (no React Router). The top-level `view` state in `App.tsx` controls which component renders:

| View key | Component rendered | Role |
|---|---|---|
| `dashboard` | Main dashboard / `MainActions` | All users |
| `quest` | `QuestView` | Student |
| `pvp` | `PvPView` | Student |
| `shop` | `ShopView` | Student |
| `clan` | `ClanView` | Student |
| `inventory` | `InventoryView` | Student |
| `leaderboard` | `LeaderboardView` | All users |
| `achievements` | `AchievementView` | Student |
| `teacher` | `TeacherPortal` | Teacher |
| `admin` | `AdminPortal` | Superadmin |
| `tournament` | `TournamentHub` | Student |
| `tournament_admin` | `TournamentAdminDashboard` | Admin |
| `phase1_play` / `phase1_leaderboard` / `phase1_admin` | Phase 1 competition | Various |
| `raids` / `raid_admin` | Raid feature | Student / Admin |
| `ielts` | `IeltsPrepHub` + `IeltsAdminDashboard` | Student / IELTS admin |
| `lockdown` | `LockdownHostView` / `LockdownPlayerApp` | Teacher / Student |
| `cambridge` | `CambridgeTestsHub` | Student |
| `school_admin` | `SchoolAdminPortal` | School admin |
| `admissions` | `AdmissionHub` | Admin |

### TeacherPortal sub-views
`dashboard` → `question-bank` → `create-question` → `csv-upload` → `create-assignment` → `assignments` → `reports` → `report-detail` → `report-analysis` → `cambridge-reports` → `collective-report` → `geometry-diagrams`

### AdminPortal tabs
`dashboard` | `users` | `schools` | `applications` | `game` | `clans` | `analytics` | `cambridge` | `ielts` | `system`

### ClanView tabs
`home` | `chat` | `browse` | `management`

---

## RPC → File → UI Feature Map

### 1. AUTH & ONBOARDING

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 1 | `get_available_schools` | `services/authService.ts` | Sign-up flow — school picker dropdown |
| 2 | `check_user_setup_status` | `services/authService.ts` | Post-login — redirect to onboarding if incomplete |
| 3 | `profile_bootstrap` | `services/authService.ts` | Onboarding — save profile (name, grade, batch, avatar) |
| 4 | `validate_invite_code` | `services/authService.ts` | Join school — validate invite code |
| 5 | `join_school_by_code` | `services/authService.ts` | Join school — finalize enrollment |
| 6 | `create_teacher_profile` | `services/rpcGateway.ts` → `authService.ts` | Teacher sign-up flow |

### 2. XP / LEVEL / REWARDS (core loop)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 7 | `rpc_my_xp_status` | `services/xpStatus.ts` | Dashboard — XP bar, level display |
| 8 | `rpc_grant_levelup_rewards` | `App.tsx` | Level-up modal — grant rewards on level up |
| 9 | `rpc_apply_reward_delta` | `services/gameService.ts`, `ClanTerritoryStudentView.tsx` | Claim rewards (quests, territory missions) |
| 10 | `regenerate_user_ap` | `services/rpcGateway.ts` | AP regen tick (background) |
| 11 | `notify_ap_full` | `services/rpcGateway.ts` | Notification when AP refills |
| 12 | `notify_level_up` | `services/rpcGateway.ts` | Notification on level up |

### 3. COMPETITION / PHASE 1 (competitionService.ts)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 13 | `get_school_grades` | `services/competitionService.ts` | Phase 1 — grade picker |
| 14 | `get_school_batches` | `services/competitionService.ts` | Phase 1 — batch picker |
| 15 | `rpc_questions_next` | `services/competitionService.ts` | Phase 1 Play — fetch next question |
| 16 | `rpc_submit_attempt` | `services/competitionService.ts` | Phase 1 Play — submit answer |
| 17 | `rpc_leaderboard_grade` | `services/competitionService.ts` | Phase 1 Leaderboard — by grade |
| 18 | `rpc_leaderboard_batch` | `services/competitionService.ts` | Phase 1 Leaderboard — by batch |
| 19 | `get_school_batch_summaries` | `services/competitionService.ts` | Phase 1 Admin — batch summary |
| 20 | `rpc_announcement_post` | `services/competitionService.ts` | Admin — post announcement |
| 21 | `rpc_announcement_next` | `services/competitionService.ts` | Dashboard — fetch next announcement |
| 22 | `rpc_announcement_mark_seen` | `services/competitionService.ts` | Dashboard — dismiss announcement |

### 4. QUEST / MCQ / QUESTION SYSTEM

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 23 | `get_all_active_questions` | `services/gameService.ts` | Quest — load questions for selected subject |
| 24 | `rpc_submit_mcq_answer` | `services/gameService.ts` | Quest — submit MCQ answer |
| 25 | `record_question_attempt` | `services/rpcGateway.ts` | Quest — record attempt stats |
| 26 | `rpc_check_achievements` | `services/rpcGateway.ts` | Post-quest — trigger achievement check |
| 27 | `check_assignment_achievements` | `services/rpcGateway.ts` | Post-assignment — trigger achievement check |

### 5. PVP / HACK

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 28 | `get_attack_targets` | `services/gameService.ts` | PvP — load target list |
| 29 | `rpc_hack_attempt` | `services/rpcGateway.ts` | PvP — execute hack/attack |
| 30 | `rpc_update_pvp_score` | `services/gameService.ts` | PvP — update score after match |
| 31 | `notify_attack_incoming` | `services/rpcGateway.ts` | Notification — attack incoming |
| 32 | `notify_coins_lost` | `services/rpcGateway.ts` | Notification — coins lost |
| 33 | `notify_revenge_available` | `services/rpcGateway.ts` | Notification — revenge available |
| 34 | `notify_attack_defended` | `services/rpcGateway.ts` | Notification — attack defended |

### 6. CLANS

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 35 | `rpc_create_clan` | `services/gameService.ts` | Clan View → Create Clan |
| 36 | `rpc_join_clan` | `services/gameService.ts` | Clan View → Browse → Join |
| 37 | `rpc_leave_clan` | `services/gameService.ts` | Clan View → Home → Leave |
| 38 | `rpc_get_clan_leaderboard` | `services/gameService.ts` | Clan View → Home (leaderboard) |
| 39 | `rpc_get_clan_members` | `services/gameService.ts`, `LeaderboardView.tsx` | Clan View → Home (member list) |
| 40 | `rpc_clan_join_request_decide` | `services/gameService.ts` | Clan View → Management → Approve/Reject requests |
| 41 | `rpc_purchase_clan_buff` | `services/gameService.ts` | Clan View → Home → Buy buff |
| 42 | `rpc_transfer_clan_leadership` | `services/gameService.ts` | Clan View → Management → Transfer leadership |
| 43 | `rpc_update_clan_member_role` | `services/gameService.ts` | Clan View → Management → Change member role |
| 44 | `get_school_clan_leaderboard` | `services/gameService.ts`, `LeaderboardView.tsx` | Leaderboard → Clan tab |

### 7. LEADERBOARD

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 45 | `get_school_leaderboard` (total_score) | `components/LeaderboardView.tsx` | Leaderboard → Total Score tab |
| 46 | `get_school_leaderboard` (xp) | `components/LeaderboardView.tsx` | Leaderboard → XP tab |
| 47 | `get_school_leaderboard` (pvp_score) | `components/LeaderboardView.tsx` | Leaderboard → PvP tab |

### 8. PUBLIC PROFILES & ACTIVITY

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 48 | `get_public_profile` | `services/gameService.ts` | Click username → profile modal |
| 49 | `get_school_activity_feed` | `services/gameService.ts` | Dashboard → News Feed |

### 9. COSMETICS / NEON FRAMES

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 50 | `rpc_get_users_with_neon` | `services/cosmeticService.ts` | Neon frame display on avatars |

### 10. ASSIGNMENTS (Teacher)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 51 | `rpc_create_assignment` | `services/rpcGateway.ts` | Teacher Portal → Create Assignment |
| 52 | `rpc_get_assignments_for_teacher` | `services/rpcGateway.ts` | Teacher Portal → Assignments list |
| 53 | `rpc_get_students_for_assignment` | `services/rpcGateway.ts` | Teacher Portal → Assignment detail → student list |
| 54 | `rpc_teacher_assignment_report` | `services/rpcGateway.ts` | Teacher Portal → Reports → grade report |
| 55 | `rpc_get_assignment_student_answers` | `services/rpcGateway.ts` | Teacher Portal → Report Detail → student answers |
| 56 | `rpc_get_assignment_question_analysis` | `services/rpcGateway.ts` | Teacher Portal → Report Analysis |

### 11. ASSIGNMENTS (Student)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 57 | `rpc_get_student_active_assignment` | `services/rpcGateway.ts` | Dashboard → Active assignment banner |
| 58 | `rpc_get_student_pending_assignments` | `services/rpcGateway.ts` | Dashboard → Pending assignments list |
| 59 | `rpc_submit_assignment_result` | `services/rpcGateway.ts` | Assignment play → submit final result |
| 60 | `rpc_submit_assignment_answer` | `services/rpcGateway.ts` | Assignment play → submit each answer |
| 61 | `rpc_get_student_completed_assignments` | `services/rpcGateway.ts` | Student → completed assignments list |
| 62 | `rpc_get_my_assignment_answers` | `services/rpcGateway.ts` | Student → view own assignment answers |

### 12. CAMBRIDGE TESTS (Student)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 63 | `get_visible_cambridge_tests_for_student` | `components/CambridgeTestsHub.tsx` | Cambridge view → load available tests |
| 64 | `rpc_allow_cambridge_retake` | `components/CambridgeTestsHub.tsx` | Cambridge view → retake button |

### 13. CAMBRIDGE TESTS (Teacher)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 65 | `get_all_cambridge_tests` | `components/TeacherPortal.tsx` | Teacher Portal → Cambridge Reports tab → test list |
| 66 | `get_school_cambridge_scores` | `TeacherPortal.tsx`, `AdminPortal.tsx`, `SchoolAdminPortal.tsx` | Teacher/Admin → Cambridge Reports → score table |
| 67 | `get_teacher_test_visibility_settings` | `components/TeacherPortal.tsx` | Teacher Portal → test visibility toggles |
| 68 | `toggle_cambridge_test_visibility` | `components/TeacherPortal.tsx` | Teacher Portal → toggle a single test's visibility |
| 69 | `bulk_set_cambridge_test_visibility` | `components/TeacherPortal.tsx` | Teacher Portal → bulk visibility change |
| 70 | `release_quiz_scores` | `components/TeacherPortal.tsx` | Teacher Portal → release scores to students |
| 71 | `hide_quiz_scores` | `components/TeacherPortal.tsx` | Teacher Portal → hide scores from students |

### 14. CAMBRIDGE TESTS (School Admin)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 72 | `get_school_cambridge_test_visibility_settings` | `TeacherPortal.tsx`, `SchoolAdminPortal.tsx` | School Admin → test visibility settings |
| 73 | `set_school_cambridge_test_visibility` | `TeacherPortal.tsx`, `SchoolAdminPortal.tsx` | School Admin → set single test visibility |
| 74 | `bulk_set_school_cambridge_test_visibility` | `TeacherPortal.tsx`, `SchoolAdminPortal.tsx` | School Admin → bulk set visibility |

### 15. GEOMETRY

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 75 | `get_random_geometry_question` | `components/geometry/geometryService.ts` | Geometry play → load question |
| 76 | `record_geometry_attempt` | `components/geometry/geometryService.ts` | Geometry play → submit answer |

### 16. RAIDS

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 77 | `bh_enroll_self` | `src/features/raids/raidService.ts` | Raids → auto-enroll before joining |
| 78 | `create_raid` | `services/rpcGateway.ts` | Raids → create new raid session |
| 79 | `join_raid` | `services/rpcGateway.ts` | Raids → join existing raid |
| 80 | `submit_raid_answer` | `services/rpcGateway.ts` | Raids → submit answer during raid |
| 81 | `finalize_raid` | `services/rpcGateway.ts` | Raids → end raid session |
| 82 | `get_raid_status` | `services/rpcGateway.ts` | Raids → poll raid status |

### 17. TOURNAMENTS

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 83 | `approve_tournament_signup` | `services/tournamentService.ts` | Tournament Admin → approve player signup |
| 84 | `generate_season_bracket` | `services/tournamentService.ts` | Tournament Admin → generate bracket |
| 85 | `update_match_schedule` | `services/tournamentService.ts` | Tournament Admin → schedule match |
| 86 | `record_match_winner` | `services/tournamentService.ts` | Tournament Admin → record winner |

### 18. IELTS

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 87 | `get_effective_tier` | `services/ieltsService.ts`, `services/tierService.ts` | IELTS Hub — check tier/access |
| 88 | `rpc_is_ielts_admin` | `components/ielts/IeltsAdminGuard.tsx` | IELTS Admin guard check |

### 19. IELTS ADMIN (IeltsAdminDashboard.tsx — via `handleRpc`)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 89 | `admin_ielts_write_grade` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → grade writing submission |
| 90 | `admin_ielts_speaking_grade` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → grade speaking submission |
| 91 | `admin_ielts_set_user_tags` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → tag a user |
| 92 | `admin_ielts_add_note` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → add note to user |
| 93 | `admin_ielts_note_delete` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → delete note |
| 94 | `admin_ielts_membership_grant` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → grant membership |
| 95 | `admin_ielts_membership_extend` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → extend membership |
| 96 | `admin_ielts_membership_revoke` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → revoke membership |
| 97 | `admin_ielts_reset_progress` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → reset user progress |
| 98 | `admin_ielts_mark_notification_sent` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → mark notification sent |
| 99 | `admin_ielts_prime_approve_and_grant` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → approve prime application |
| 100 | `admin_ielts_violation_set_status` | `components/IeltsAdminDashboard.tsx` | IELTS Admin → set violation status |

### 20. TIER / PILOT / LOCKDOWN (tierService.ts)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 101 | `get_school_plan_details` | `services/tierService.ts` | Tier UI — show current plan |
| 102 | `check_lockdown_limits` | `services/tierService.ts` | Lockdown mode — check usage caps |
| 103 | `start_school_pilot` | `services/tierService.ts` | Pilot sign-up — start trial |
| 104 | `get_school_pilot_quotas` | `services/tierService.ts` | Pilot dashboard — view quotas |
| 105 | `check_pilot_quota` | `services/tierService.ts` | Feature gate — check if quota remains |
| 106 | `consume_pilot_quota` | `services/tierService.ts` | Feature use — consume quota unit |

### 21. SUPERADMIN PORTAL (AdminPortal.tsx)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 107 | `rpc_is_superadmin` | `AdminPortal.tsx`, `services/adminService.ts` | Admin tab guard — verify superadmin |
| 108 | `rpc_admin_dashboard_stats` | `components/AdminPortal.tsx` | Admin → Dashboard tab (stats cards) |
| 109 | `rpc_admin_list_users` | `components/AdminPortal.tsx` | Admin → Users tab (user table) |
| 110 | `rpc_admin_grant` | `AdminPortal.tsx`, `competitionService.ts` | Admin → Users → grant XP/coins to user |
| 111 | `rpc_admin_set_level` | `components/AdminPortal.tsx` | Admin → Users → set user level |
| 112 | `rpc_admin_reset_ap` | `components/AdminPortal.tsx` | Admin → Users → reset user AP |
| 113 | `rpc_admin_grant_all` | `components/AdminPortal.tsx` | Admin → Game tab → bulk grant XP/coins to all |
| 114 | `rpc_admin_reset_user` | `services/competitionService.ts` | Admin → reset single user progress |
| 115 | `rpc_admin_reset_all` | `services/competitionService.ts` | Admin → reset all users |
| 116 | `rpc_admin_refill_all_ap` | `services/competitionService.ts` | Admin → refill AP for all |
| 117 | `rpc_admin_reset_pvp_wins` | `services/competitionService.ts` | Admin → reset PvP wins |
| 118 | `rpc_admin_disband_clan` | `services/competitionService.ts` | Admin → Clans tab → disband clan |
| 119 | `rpc_admin_set_user_academics` | `services/competitionService.ts` | Admin → set user grade/batch |
| 120 | `rpc_admin_reset_user_academics` | `services/competitionService.ts` | Admin → reset user academics |
| 121 | `rpc_admin_ban_user` | `services/competitionService.ts` | Admin → Users → ban user |
| 122 | `rpc_admin_delete_user` | `services/competitionService.ts` | Admin → Users → delete user |
| 123 | `admin_list_schools` | `components/AdminPortal.tsx` | Admin → Schools tab (school list) |
| 124 | `admin_set_school_plan` | `components/AdminPortal.tsx` | Admin → Schools → change school plan |
| 125 | `admin_get_school_pilot_quotas` | `components/AdminPortal.tsx` | Admin → Schools → view pilot quotas |
| 126 | `admin_reset_school_quotas` | `components/AdminPortal.tsx` | Admin → Schools → reset quotas |
| 127 | `admin_set_school_quota` | `components/AdminPortal.tsx` | Admin → Schools → set specific quota |
| 128 | `admin_extend_pilot_trial` | `components/AdminPortal.tsx` | Admin → Schools → extend pilot trial |
| 129 | `admin_set_school_admin` | `components/AdminPortal.tsx` | Admin → Schools → assign school admin |
| 130 | `bulk_release_quiz_scores` | `components/AdminPortal.tsx` | Admin → Cambridge tab → bulk release scores |
| 131 | `release_quiz_score` | `components/AdminPortal.tsx` | Admin → Cambridge tab → release single score |

### 22. SCHOOL ADMIN PORTAL (schoolAdminService.ts)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 132 | `get_school_details` | `services/schoolAdminService.ts` | School Admin → dashboard header info |
| 133 | `get_school_members` | `services/schoolAdminService.ts` | School Admin → Members tab |
| 134 | `update_member_role` | `services/schoolAdminService.ts` | School Admin → change member role |
| 135 | `remove_school_member` | `services/schoolAdminService.ts` | School Admin → remove member |
| 136 | `update_member_status` | `services/schoolAdminService.ts` | School Admin → approve/suspend member |
| 137 | `rotate_school_invite_code` | `services/schoolAdminService.ts` | School Admin → rotate invite code |
| 138 | `update_school_info` | `services/schoolAdminService.ts` | School Admin → edit school name/info |
| 139 | `update_school_settings` | `services/schoolAdminService.ts` | School Admin → edit settings |
| 140 | `admin_assign_teacher_to_class_subject` | `services/schoolAdminService.ts` | School Admin → assign teacher to class |
| 141 | `get_teacher_assigned_classes` | `services/schoolAdminService.ts` | School Admin → view teacher's classes |
| 142 | `get_teacher_profile_with_classes` | `services/schoolAdminService.ts` | School Admin → teacher profile detail |
| 143 | `teacher_has_class_access` | `services/schoolAdminService.ts` | School Admin → verify teacher access |
| 144 | `filter_classes_for_teacher` | `services/schoolAdminService.ts` | School Admin → filter classes by teacher |
| 145 | `school_admin_list_members` | `services/schoolAdminService.ts` | School Admin → full member list |
| 146 | `school_admin_set_member_role` | `services/schoolAdminService.ts` | School Admin → set member role |
| 147 | `school_admin_move_student_to_class` | `services/schoolAdminService.ts` | School Admin → move student between classes |

### 23. CLASS ROSTER MANAGEMENT (schoolAdminService.ts)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 148 | `get_class_roster` | `services/schoolAdminService.ts` | School Admin → Class Roster view |
| 149 | `get_school_class_rosters` | `services/schoolAdminService.ts` | School Admin → all class rosters |
| 150 | `get_unassigned_students` | `services/schoolAdminService.ts` | School Admin → students not in a class |
| 151 | `add_student_to_class` | `services/schoolAdminService.ts` | School Admin → add student to class |
| 152 | `remove_student_from_class` | `services/schoolAdminService.ts` | School Admin → remove student from class |
| 153 | `move_student_between_classes` | `services/schoolAdminService.ts` | School Admin → move student |
| 154 | `bulk_add_students_to_class` | `services/schoolAdminService.ts` | School Admin → bulk add students |
| 155 | `bulk_remove_students_from_class` | `services/schoolAdminService.ts` | School Admin → bulk remove students |
| 156 | `get_class_statistics` | `services/schoolAdminService.ts` | School Admin → class stats panel |
| 157 | `auto_enroll_students_by_grade` | `services/schoolAdminService.ts` | School Admin → auto-enroll by grade |

### 24. SCHOOL REQUESTS (schoolRequestService.ts)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 158 | `request_school_v2` | `services/schoolRequestService.ts` | Sign-up → Request new school |
| 159 | `request_school` | `services/schoolRequestService.ts` | Legacy school request flow |
| 160 | `admin_list_school_requests` | `services/schoolRequestService.ts` | Admin → Applications tab → list requests |
| 161 | `admin_school_request_need_more_info` | `services/schoolRequestService.ts` | Admin → Applications → request more info |
| 162 | `admin_review_school_request` | `services/schoolRequestService.ts` | Admin → Applications → approve/reject |
| 163 | `school_request_reply` | `services/schoolRequestService.ts` | Applicant → reply to admin query |

### 25. ADMISSIONS (admissionService.ts)

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 164 | `rpc_adm_generate_test_form` | `services/admissionService.ts` | Admissions → generate test form |
| 165 | `rpc_adm_publish_form` | `services/admissionService.ts` | Admissions → publish form |
| 166 | `rpc_adm_close_form` | `services/admissionService.ts` | Admissions → close form |
| 167 | `rpc_adm_get_candidate_report` | `services/admissionService.ts` | Admissions → view candidate report |
| 168 | `rpc_adm_record_placement` | `services/admissionService.ts` | Admissions → record candidate placement |
| 169 | `rpc_adm_check_entitlement` | `services/admissionService.ts` | Admissions → check if school has access |
| 170 | `rpc_adm_consume_quota` | `services/admissionService.ts` | Admissions → consume quota on form creation |

### 26. CLAN TERRITORY

| # | RPC function | File | UI feature / test action |
|---|---|---|---|
| 171 | `rpc_apply_reward_delta` | `src/features/clanTerritory/components/ClanTerritoryStudentView.tsx` | Clan Territory → claim territory reward |

---

## Edge-Function RPCs (backend-only via `supabase/functions/bh_api/index.ts`)

These are **not called directly from the browser** but from the Brains Heist edge function. They flow through the `/bh_api` endpoint:

| RPC function | Edge function route | Feature |
|---|---|---|
| `start_brains_heist_mission` | POST `/mission/start` | BH — start mission |
| `get_next_brains_heist_mission` | POST `/mission/next` | BH — get next question |
| `submit_brains_heist_answer` | POST `/mission/answer` | BH — submit answer |
| `finish_brains_heist_mission` | POST `/mission/finish` | BH — finish mission |
| `get_brains_heist_progress` | GET `/progress` | BH — get user progress |
| `get_brains_heist_topic_statuses` | GET `/progress` | BH — topic completion statuses |
| `create_bh_pvp_challenge` | POST `/pvp/create` | BH PvP — create challenge |
| `join_bh_pvp_challenge` | POST `/pvp/join` | BH PvP — join challenge |
| `get_bh_pvp_state` | GET `/pvp/state` | BH PvP — get match state |
| `submit_bh_pvp_answer` | POST `/pvp/answer` | BH PvP — submit answer |
| `resolve_bh_pvp_battle` | POST `/pvp/resolve` | BH PvP — resolve battle |
| `get_bh_class_topic_summary` | GET `/teacher/class-summary` | BH Teacher — class topic summary |
| `get_bh_task_group_summary` | GET `/teacher/class-summary` | BH Teacher — task group summary |
| `get_bh_student_missions` | GET `/teacher/student-detail` | BH Teacher — student missions |
| `get_bh_student_mastery` | GET `/teacher/student-detail` | BH Teacher — student mastery |
| `xp_status` | POST `/xp/grant` | BH — XP status check |
| `finish_bh_clan_territory_mission` | POST `/clan-territory/finish` | BH — finish territory mission |

---

## Quick Click-Through Test Script

### Pre-requisites
- [ ] Have accounts ready: **Student**, **Teacher**, **School Admin**, **Superadmin**, **IELTS Admin**

### Auth & Onboarding
- [ ] Fresh sign-up → see school picker (`get_available_schools`)
- [ ] Enter invite code → validate (`validate_invite_code`) → join (`join_school_by_code`)
- [ ] Complete onboarding → profile saved (`profile_bootstrap`)
- [ ] Login check → status verified (`check_user_setup_status`)

### Student Dashboard
- [ ] XP bar loads (`rpc_my_xp_status`)
- [ ] News feed loads (`get_school_activity_feed`)
- [ ] Announcement banner appears if pending (`rpc_announcement_next`)
- [ ] Active assignment shows if any (`rpc_get_student_active_assignment`)

### Quest
- [ ] Open Quest → questions load (`get_all_active_questions`)
- [ ] Answer question → submit works (`rpc_submit_mcq_answer`)
- [ ] Achievement check fires post-quest (`rpc_check_achievements`)

### PvP
- [ ] Open PvP → targets load (`get_attack_targets`)
- [ ] Execute hack → result displays (`rpc_hack_attempt`)
- [ ] Score updates (`rpc_update_pvp_score`)

### Clans
- [ ] Create clan (`rpc_create_clan`)
- [ ] Browse & join clan (`rpc_join_clan`)
- [ ] View members (`rpc_get_clan_members`)
- [ ] View leaderboard (`rpc_get_clan_leaderboard`)
- [ ] Purchase buff (`rpc_purchase_clan_buff`)
- [ ] Leave clan (`rpc_leave_clan`)
- [ ] Approve/reject join request (`rpc_clan_join_request_decide`)
- [ ] Transfer leadership (`rpc_transfer_clan_leadership`)

### Leaderboard
- [ ] Total Score tab loads (`get_school_leaderboard` total_score)
- [ ] XP tab loads (`get_school_leaderboard` xp)
- [ ] PvP tab loads (`get_school_leaderboard` pvp_score)
- [ ] Clan leaderboard loads (`get_school_clan_leaderboard`)

### Cambridge Tests (Student)
- [ ] Open Cambridge → tests load (`get_visible_cambridge_tests_for_student`)
- [ ] Request retake (`rpc_allow_cambridge_retake`)

### Teacher Portal
- [ ] Dashboard loads
- [ ] Create question → save works
- [ ] Question Bank loads
- [ ] Create assignment (`rpc_create_assignment`)
- [ ] View assignments (`rpc_get_assignments_for_teacher`)
- [ ] Cambridge reports load (`get_school_cambridge_scores`)
- [ ] Toggle test visibility (`toggle_cambridge_test_visibility`)
- [ ] Release scores (`release_quiz_scores`)
- [ ] Hide scores (`hide_quiz_scores`)
- [ ] Reports tab → select assignment → report loads (`rpc_teacher_assignment_report`)

### School Admin Portal
- [ ] School details load (`get_school_details`)
- [ ] Member list loads (`get_school_members`, `school_admin_list_members`)
- [ ] Change member role (`update_member_role`)
- [ ] Remove member (`remove_school_member`)
- [ ] Rotate invite code (`rotate_school_invite_code`)
- [ ] Class roster loads (`get_class_roster`)
- [ ] Add/remove students to class
- [ ] Cambridge visibility settings (`get_school_cambridge_test_visibility_settings`)

### Superadmin Portal
- [ ] Admin guard passes (`rpc_is_superadmin`)
- [ ] Dashboard stats load (`rpc_admin_dashboard_stats`)
- [ ] Users tab → user list loads (`rpc_admin_list_users`)
- [ ] Grant XP/coins to user (`rpc_admin_grant`)
- [ ] Set user level (`rpc_admin_set_level`)
- [ ] Ban user (`rpc_admin_ban_user`)
- [ ] Schools tab → school list loads (`admin_list_schools`)
- [ ] Set school plan (`admin_set_school_plan`)
- [ ] Cambridge tab → bulk release scores (`bulk_release_quiz_scores`)
- [ ] Applications tab → list requests (`admin_list_school_requests`)
- [ ] Approve/reject school request (`admin_review_school_request`)

### IELTS Admin
- [ ] Guard check passes (`rpc_is_ielts_admin`)
- [ ] Grade writing (`admin_ielts_write_grade`)
- [ ] Grade speaking (`admin_ielts_speaking_grade`)
- [ ] Manage membership grant/extend/revoke
- [ ] Add/delete notes on user

### Geometry
- [ ] Load geometry question (`get_random_geometry_question`)
- [ ] Submit answer (`record_geometry_attempt`)

### Raids
- [ ] Enroll self (`bh_enroll_self`)
- [ ] Create raid → Join raid → Submit answers → Finalize

### Tournaments
- [ ] Approve signup (`approve_tournament_signup`)
- [ ] Generate bracket (`generate_season_bracket`)

### Tier / Pilot
- [ ] Check effective tier (`get_effective_tier`)
- [ ] Start pilot (`start_school_pilot`)
- [ ] View quotas (`get_school_pilot_quotas`)

---

**Total unique frontend RPC functions identified: ~171 direct calls + 17 edge-function RPCs**
