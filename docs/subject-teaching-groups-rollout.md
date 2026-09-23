# School subject teaching groups: audit and rollout gate

Status: **DRAFT FOUNDATION — NOT AN END-TO-END RELEASE.**

Inspected main: `14e850b187ab1a3652877b6f8102113618ba50d3` (PR #1484).
Production project: `sozodkxwhubespiedgxm`. Audit date: 2026-09-23.

## Findings confirmed against production

- School subjects, offerings, and school-subject enrolments exist. Academic mapping is nullable.
- Teaching-group tables and assignment group context did not exist before this work.
- Production migration history includes the five identity/admin/catalogue/permissions/mapping-notification migrations under September 22 production timestamps. It does not record repository migration `20260923105000_school_subject_allocation_consistency.sql`.
- The live authorization helper still resolves legacy class allocations by normalized subject text. It does not enforce first-class selected-subject enrolment. Changing UI labels cannot fix this.
- 84 live function definitions directly reference `class_teacher_assignments`. The inventory below is a transition worklist, not a claim that every permission path has been corrected.
- The three current Grade 7 allocations in the requested smoke case predate creation of the later school subject. Their text labels have already been overwritten. Earlier rollover snapshots record the teacher's prior-year English allocations, but those snapshots alone do not prove every current-year allocation's intended subject.
- Both local English and ESL subject identities exist and map to the same academic subject. ESL has selected access and one active school-subject enrolment. Do not clone current allocations into both subjects or infer a cross-class group from `selected` access alone.
- Baseline tests reproduce exactly four failures: three retired UI contracts and one equivalent SQL equality written in the other order. The corrected tests retain governed-resource, school-subject identity, curriculum-only setup, and dynamic catalogue assertions.
- The prior allocation-consistency migration contains an extra closing parenthesis in its second `candidates` CTE. It must not be blindly applied. Its generic clone-both-meanings backfill also does not establish administrator intent once labels have been overwritten.

## Implemented foundation

- Independent `delivery_mode`; existing offerings default to `by_class` without inferring custom groups.
- Normalized groups, explicit custom roster history, co-teacher allocations, and optional assignment group context.
- Composite tenant foreign keys, active uniqueness indexes, fixed-search-path private helpers, revoked raw Data API access, and RLS on all new public tables.
- One current-year eligibility resolver intersects academic enrolment, registration membership, active school membership, moderation, grade, and independent subject access.
- Class and whole-grade rosters derive from current sources. Custom rosters intersect explicit membership with the same eligibility source.
- Admin group APIs validate school authority and scope; teacher read APIs require an active allocation.
- Delivery changes require acknowledgement before archiving existing groups. Group identity and historical assignment snapshots cannot be reparented.
- Typed service API; SQL behavioral regression suite; updated stale baseline tests.

The foundation does **not** migrate legacy data, enable group assignment publication, change existing UI, or replace legacy permission functions. Keeping it additive protects the currently deployed application while the remaining integration is built.

## Migration safety and verification

The candidate migration and behavioral SQL suite were run together against the live schema inside `BEGIN ... SET CONSTRAINTS ALL IMMEDIATE ... ROLLBACK`. No production migration was committed. This proves the candidate parses against current production and that exercised runtime paths meet the tested invariants; it is not proof of a complete migration-chain replay or final application behavior.

The behavioral suite exercises separate local subjects sharing a map, class versus custom rosters, selected access, enrolment withdrawal, independent roster edits, creation permissions, anonymous denial, cross-tenant rejection, immutable group identity, optional mapping, archival, and delivery-mode replacement. It creates only transient test subjects/groups inside the rollback transaction.

Do not run the test file outside a transaction. Do not apply the whole migration directory to production: the repository and production timestamps differ, and the prior allocation-consistency migration is defective. The CLI-generated candidate timestamp sorts before that future-dated repository migration. A reviewed migration baseline/supersession strategy is required before any clean replay or deployment.

## Remaining release gates

1. Audit the inventory's indirect callers, triggers, policies, and overloads. Replace exact operational subject/group permission paths, retain true registration-class permissions, and isolate historical reads.
2. Implement group-aware assignment create **and edit**, audience persistence, canonical resource authorization, local questions for unmapped subjects, publication/email/category/schedule compatibility, and report read models. Do not expose the new UI until these gates pass.
3. Build the catalogue aggregate and school admin workflow, group allocation editor, teacher profile, assignment wizard, and student subject display from the same canonical group context.
4. Keep school-facing grades, academic profiles, reports, intervention evidence, and exports separated by school subject/group. Preserve canonical mastery only as a secondary lens.
5. Update year rollover snapshot/preview/apply/integrity handling, staff deactivation, class archival, and subject archival. Do not silently carry custom rosters into a new year.
6. Repair mapping-attention event lifecycle: the existing request table has one unique row per subject and reopens it; prove new event identity and exactly-once inbox/email behavior across map/unmap cycles.
7. Design reviewed legacy backfill with explicit ambiguous-allocation resolution. Preserve before/after snapshots and avoid canonical-ID-based subject merging.
8. Exercise the full A–R acceptance matrix in a safe environment; run every CI gate. Reconcile the historical migration problem without editing previously shared migration files casually.
9. Apply additive DB changes first, verify old frontend compatibility, then deploy the completed UI. Run final smoke tests, security advisors, count comparisons, and production read verification.

No merge or production apply is authorized by a green foundation test suite alone. The user's full definition of done still applies.

## Live dependency inventory

Classification is the proposed transition treatment; each row still needs implementation/caller verification.

| Function | Proposed treatment |
| --- | --- |
| `private.actor_can_review_bh_writing_assessment` | Related feature; capability plus exact authorized roster review |
| `private.apply_school_year_rollover_post_commit_policies` | Compatibility transition; inspect indirect callers before replacement |
| `private.can_access_school_document` | Related feature; capability plus exact authorized roster review |
| `private.capture_school_year_rollover_snapshots_for_plan` | Historical compatibility; preserve snapshots/semantics |
| `private.current_teacher_class_ids` | Compatibility transition; inspect indirect callers before replacement |
| `private.school_head_build_operational_decisions` | Compatibility transition; inspect indirect callers before replacement |
| `private.school_year_rollover_integrity_audit_internal` | Compatibility transition; inspect indirect callers before replacement |
| `private.teacher_assignment_authorized_students` | Use teaching groups and school-subject identity |
| `public.academic_reporting_can_generate` | Compatibility transition; inspect indirect callers before replacement |
| `public.admin_allocate_teacher_to_school_subject` | Use teaching groups and school-subject identity |
| `public.admin_assign_teacher_to_class_subject` | Compatibility transition; inspect indirect callers before replacement |
| `public.allow_cambridge_retake_legacy_internal` | Related feature; capability plus exact authorized roster review |
| `public.bh_writing_allowed_students` | Related feature; capability plus exact authorized roster review |
| `public.bh_writing_authorized_english_classes` | Related feature; capability plus exact authorized roster review |
| `public.bulk_set_teacher_cambridge_class_visibility` | Retain registration-class purpose; review group capability separately |
| `public.can_access_bh_writing_student` | Related feature; capability plus exact authorized roster review |
| `public.can_manage_cambridge_score` | Related feature; capability plus exact authorized roster review |
| `public.can_manage_ielts_practice_class` | Retain registration-class purpose; review group capability separately |
| `public.can_monitor_ielts_exam` | Retain registration-class purpose; review group capability separately |
| `public.can_review_ielts_productive_submission` | Related feature; capability plus exact authorized roster review |
| `public.filter_classes_for_teacher` | Compatibility transition; inspect indirect callers before replacement |
| `public.get_all_active_questions` | Use teaching groups and school-subject identity |
| `public.get_class_statistics` | Retain registration-class purpose; review group capability separately |
| `public.get_school_cambridge_scores` | Related feature; capability plus exact authorized roster review |
| `public.get_school_cambridge_scores_for_year` | Related feature; capability plus exact authorized roster review |
| `public.get_school_class_rosters` | Retain registration-class purpose; review group capability separately |
| `public.get_students_in_teacher_classes` | Compatibility transition; inspect indirect callers before replacement |
| `public.get_teacher_assigned_classes` | Compatibility transition; inspect indirect callers before replacement |
| `public.get_teacher_cambridge_test_catalog` | Related feature; capability plus exact authorized roster review |
| `public.ielts_exam_actor_can_control` | Retain registration-class purpose; review group capability separately |
| `public.is_class_staff` | Retain registration-class purpose; review group capability separately |
| `public.is_teacher_assigned_to` | Compatibility transition; inspect indirect callers before replacement |
| `public.remove_school_member_legacy_assignment_vocabulary` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_academic_progress_experience_context` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_academic_reporting_context` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_bh_writing_canonical_assessment_entitlement_internal` | Related feature; capability plus exact authorized roster review |
| `public.rpc_bh_writing_submit_assessment_review_entitlement_internal` | Related feature; capability plus exact authorized roster review |
| `public.rpc_bh_writing_teacher_report_unbranded_v1` | Related feature; capability plus exact authorized roster review |
| `public.rpc_create_assignment` | Use teaching groups and school-subject identity |
| `public.rpc_get_assignments_for_teacher` | Use teaching groups and school-subject identity |
| `public.rpc_get_my_teacher_class_roster` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_get_students_for_assignment` | Use teaching groups and school-subject identity |
| `public.rpc_guardian_child_academic_year_progress` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_ielts_get_exam_admin_detail` | Retain registration-class purpose; review group capability separately |
| `public.rpc_ielts_list_manageable_exams` | Retain registration-class purpose; review group capability separately |
| `public.rpc_ielts_school_results_entitlement_internal` | Related feature; capability plus exact authorized roster review |
| `public.rpc_ielts_student_journey_entitlement_internal` | Related feature; capability plus exact authorized roster review |
| `public.rpc_school_admin_delete_school_subject` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_school_admin_save_school_subject` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_school_admin_set_teaching_staff_status_legacy_assignment_vo` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_school_admin_subject_catalog` | Use teaching groups and school-subject identity |
| `public.rpc_school_admin_subject_provisioning_state` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_school_admin_year_rollover_preview` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_school_student_progress_validation` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_student_academic_confidence` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_student_academic_profile` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_student_academic_subjects` | Use teaching groups and school-subject identity |
| `public.rpc_student_academic_subjects_for_year` | Use teaching groups and school-subject identity |
| `public.rpc_student_learning_catalog` | Use teaching groups and school-subject identity |
| `public.rpc_submit_student_learning_validation_review` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_teacher_academic_profile_students` | Use teaching groups and school-subject identity |
| `public.rpc_teacher_academic_profile_students_for_year` | Use teaching groups and school-subject identity |
| `public.rpc_teacher_assignment_success_summary` | Use teaching groups and school-subject identity |
| `public.rpc_teacher_student_intervention_intelligence` | Related feature; capability plus exact authorized roster review |
| `public.rpc_teacher_student_intervention_intelligence_unscoped_20260828` | Historical compatibility; preserve snapshots/semantics |
| `public.rpc_teacher_submit_question_batch` | Compatibility transition; inspect indirect callers before replacement |
| `public.rpc_update_teacher_assignment` | Use teaching groups and school-subject identity |
| `public.school_admin_archive_class_legacy_assignment_vocabulary` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_admin_delete_teacher_allocation` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_admin_delete_teacher_assignment` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_admin_get_my_capabilities` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_admin_list_teacher_allocations` | Use teaching groups and school-subject identity |
| `public.school_admin_list_teacher_assignments` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_admin_list_teachers` | Use teaching groups and school-subject identity |
| `public.school_admin_transition_member_role_legacy_assignment_vocabular` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_head_get_executive_snapshot_legacy_20260812` | Historical compatibility; preserve snapshots/semantics |
| `public.school_head_get_executive_snapshot_legacy_20260815` | Historical compatibility; preserve snapshots/semantics |
| `public.school_head_get_setup_checklist` | Compatibility transition; inspect indirect callers before replacement |
| `public.school_ops_sync_class_groups` | Retain registration-class purpose; review group capability separately |
| `public.set_assignment_tenant_scope` | Compatibility transition; inspect indirect callers before replacement |
| `public.set_teacher_cambridge_class_visibility` | Retain registration-class purpose; review group capability separately |
| `public.student_learning_can_manage_intervention` | Related feature; capability plus exact authorized roster review |
| `public.teacher_has_class_access` | Retain registration-class purpose; review group capability separately |
| `public.update_member_status_legacy_assignment_vocabulary` | Compatibility transition; inspect indirect callers before replacement |
