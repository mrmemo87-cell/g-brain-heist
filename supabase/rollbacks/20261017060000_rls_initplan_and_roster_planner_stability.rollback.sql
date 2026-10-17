-- ROLLBACK for 20261017060000_rls_initplan_and_roster_planner_stability.sql
-- Restores the exact pre-migration text of the 479 policies the migration rewrites,
-- captured from production on 2026-10-17 (md5 of statements: de3e091c6b8fa84f12b2b085c78c50e9).
-- Run only if needed. Policy roles/commands/modes are never changed by the
-- migration, so only USING / WITH CHECK expressions are restored. Expressions
-- were deparsed with search_path=public; keep that setting when running.
begin;
set local search_path = public;
set local lock_timeout = '3s';
alter function private.teacher_current_teaching_roster(uuid, uuid) reset join_collapse_limit;
alter policy "Users can create activities" on public.activities with check ((auth.uid() = actor_id));
alter policy activities_delete on public.activities using ((actor_id = auth.uid()));
alter policy activities_insert on public.activities with check ((actor_id = auth.uid()));
alter policy activities_insert_own on public.activities with check ((actor_id = auth.uid()));
alter policy activities_select on public.activities using (((school_id = get_caller_school_id()) OR ((school_id IS NULL) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = activities.actor_id) AND (u.school_id = get_caller_school_id())))))));
alter policy activities_select_same_tenant on public.activities using (((actor_id = auth.uid()) OR (target_id = auth.uid()) OR ((current_user_school_id() IS NOT NULL) AND (same_tenant_user(actor_id) OR ((target_id IS NOT NULL) AND same_tenant_user(target_id))))));
alter policy activities_update on public.activities using (((school_id = get_caller_school_id()) OR ((school_id IS NULL) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = activities.actor_id) AND (u.school_id = get_caller_school_id())))))));
alter policy "Users can add reactions" on public.activity_reactions with check ((auth.uid() = user_id));
alter policy "Users can delete own reactions" on public.activity_reactions using ((auth.uid() = user_id));
alter policy "Users can manage own reactions" on public.activity_reactions using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy adm_ans_school_admin_select on public.adm_answers using ((EXISTS ( SELECT 1
   FROM (adm_attempts att
     JOIN school_members sm ON ((sm.school_id = att.school_id)))
  WHERE ((att.id = adm_answers.attempt_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_ans_teacher_select on public.adm_answers using ((EXISTS ( SELECT 1
   FROM (adm_attempts att
     JOIN school_members sm ON ((sm.school_id = att.school_id)))
  WHERE ((att.id = adm_answers.attempt_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_answers on public.adm_answers using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy adm_att_school_admin_all on public.adm_attempts using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_attempts.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_attempts.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_att_teacher_select on public.adm_attempts using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_attempts.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_attempts on public.adm_attempts using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_attempts using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_audit_school_admin_select on public.adm_audit_log using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_audit_log.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_audit_log on public.adm_audit_log using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_audit_log using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_bp_school_admin_all on public.adm_blueprints using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_blueprints.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_blueprints.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_bp_teacher_select on public.adm_blueprints using (((is_active = true) AND (EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_blueprints.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text))))));
alter policy adm_superadmin_adm_blueprints on public.adm_blueprints using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_blueprints using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_candidate_events_school_staff_select on public.adm_candidate_test_events using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_candidate_test_events.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['school_admin'::text, 'teacher'::text])) AND (sm.status = 'active'::text)))));
alter policy school_admissions_module_required on public.adm_candidate_test_events using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_cand_school_admin_all on public.adm_candidates using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_candidates.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_candidates.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_cand_teacher_select on public.adm_candidates using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_candidates.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_candidates on public.adm_candidates using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_candidates using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_import_school_admin_all on public.adm_import_staging using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_import_staging.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_import_staging.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_import_staging on public.adm_import_staging using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_import_staging using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_place_school_admin_all on public.adm_placement_results using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_placement_results.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_placement_results.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_place_teacher_select on public.adm_placement_results using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_placement_results.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_placement_results on public.adm_placement_results using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_placement_results using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_qpool_platform_admin_all on public.adm_question_pools using (adm_is_platform_admin(auth.uid())) with check (adm_is_platform_admin(auth.uid()));
alter policy adm_qpool_school_admin_all on public.adm_question_pools using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_question_pools.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_question_pools.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_qpool_teacher_select on public.adm_question_pools using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_question_pools.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_question_pools on public.adm_question_pools using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_question_pools using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_q_platform_admin_all on public.adm_questions using (adm_is_platform_admin(auth.uid())) with check (adm_is_platform_admin(auth.uid()));
alter policy adm_q_school_admin_all on public.adm_questions using (((is_official = false) AND (is_locked = false) AND (EXISTS ( SELECT 1
   FROM (adm_question_pools qp
     JOIN school_members sm ON ((sm.school_id = qp.school_id)))
  WHERE ((qp.id = adm_questions.pool_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))))) with check (((is_official = false) AND (is_locked = false) AND (EXISTS ( SELECT 1
   FROM (adm_question_pools qp
     JOIN school_members sm ON ((sm.school_id = qp.school_id)))
  WHERE ((qp.id = adm_questions.pool_id) AND (qp.is_official = false) AND (qp.is_locked = false) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))));
alter policy adm_q_teacher_select on public.adm_questions using (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM (adm_question_pools qp
     JOIN school_members sm ON ((sm.school_id = qp.school_id)))
  WHERE ((qp.id = adm_questions.pool_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text))))));
alter policy adm_superadmin_adm_questions on public.adm_questions using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy adm_gsmap_school_admin_all on public.adm_school_grade_stage_map using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_school_grade_stage_map.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_school_grade_stage_map.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_gsmap_teacher_select on public.adm_school_grade_stage_map using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_school_grade_stage_map.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_school_grade_stage_map on public.adm_school_grade_stage_map using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_school_grade_stage_map using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy adm_fq_school_admin_all on public.adm_test_form_questions using ((EXISTS ( SELECT 1
   FROM (adm_test_forms tf
     JOIN school_members sm ON ((sm.school_id = tf.school_id)))
  WHERE ((tf.id = adm_test_form_questions.form_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM (adm_test_forms tf
     JOIN school_members sm ON ((sm.school_id = tf.school_id)))
  WHERE ((tf.id = adm_test_form_questions.form_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_fq_teacher_select on public.adm_test_form_questions using ((EXISTS ( SELECT 1
   FROM (adm_test_forms tf
     JOIN school_members sm ON ((sm.school_id = tf.school_id)))
  WHERE ((tf.id = adm_test_form_questions.form_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_test_form_questions on public.adm_test_form_questions using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy adm_form_school_admin_all on public.adm_test_forms using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_test_forms.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text))))) with check ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_test_forms.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text) AND (sm.status = 'active'::text)))));
alter policy adm_form_teacher_select on public.adm_test_forms using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = adm_test_forms.school_id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.status = 'active'::text)))));
alter policy adm_superadmin_adm_test_forms on public.adm_test_forms using ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM superadmins
  WHERE (superadmins.user_id = auth.uid()))));
alter policy school_admissions_module_required on public.adm_test_forms using ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text))) with check ((is_superadmin(auth.uid()) OR school_has_module_access(school_id, 'admissions'::text)));
alter policy admin_roles_read_self on public.admin_roles using ((user_id = auth.uid()));
alter policy "Players acknowledge announcements" on public.announcement_receipts with check ((auth.uid() = user_id));
alter policy "Players update receipt timestamp" on public.announcement_receipts using ((auth.uid() = user_id));
alter policy "Players view own receipts" on public.announcement_receipts using ((auth.uid() = user_id));
alter policy active_players_insert_announcement_receipts on public.announcement_receipts with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_announcement_receipts on public.announcement_receipts using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_update_announcement_receipts on public.announcement_receipts using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false)))))) with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_announcement_receipts on public.announcement_receipts using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy "Admins create announcements" on public.announcements with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true)))));
alter policy "Admins manage announcements" on public.announcements using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true)))));
alter policy "Students view assigned questions" on public.assignment_questions using ((EXISTS ( SELECT 1
   FROM student_assignments sa
  WHERE ((sa.assignment_id = assignment_questions.assignment_id) AND (sa.student_id = auth.uid())))));
alter policy "Teachers manage assignment questions" on public.assignment_questions using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN teachers t ON ((t.id = a.teacher_id)))
  WHERE ((a.id = assignment_questions.assignment_id) AND (t.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN teachers t ON ((t.id = a.teacher_id)))
  WHERE ((a.id = assignment_questions.assignment_id) AND (t.user_id = auth.uid())))));
alter policy feature_entitlement_guard on public.assignment_questions using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy "Teachers manage assignment students" on public.assignment_students using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN teachers t ON ((t.id = a.teacher_id)))
  WHERE ((a.id = assignment_students.assignment_id) AND (t.user_id = auth.uid())))));
alter policy feature_entitlement_guard on public.assignment_students using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy "Students view assigned assignments" on public.assignments using ((EXISTS ( SELECT 1
   FROM student_assignments sa
  WHERE ((sa.assignment_id = assignments.id) AND (sa.student_id = auth.uid())))));
alter policy assignments_teacher_group_insert on public.assignments with check (((subject_group_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((school_subject_group_teachers gt
     JOIN school_subject_groups g ON (((g.id = gt.group_id) AND (g.school_id = gt.school_id) AND (g.status = 'active'::text))))
     JOIN school_subject_offerings o ON (((o.id = g.school_subject_offering_id) AND (o.school_id = g.school_id) AND (o.status = 'active'::text))))
  WHERE ((gt.group_id = assignments.subject_group_id) AND (gt.school_id = assignments.school_id) AND (gt.teacher_user_id = auth.uid()) AND gt.active AND gt.can_create AND (o.academic_year_id = assignments.academic_year_id))))));
alter policy assignments_teacher_select_via_students on public.assignments using (((class_id IS NULL) AND (EXISTS ( SELECT 1
   FROM ((student_assignments sa
     JOIN class_students cs ON ((cs.student_id = sa.student_id)))
     JOIN class_teacher_assignments cta ON (((cta.class_id = cs.class_id) AND (cta.teacher_user_id = auth.uid()) AND (cta.active = true))))
  WHERE ((sa.assignment_id = assignments.id) AND (cta.subject = assignments.subject))))));
alter policy feature_entitlement_guard on public.assignments using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy "Admins view attempts" on public.attempts using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true)))));
alter policy "Students insert own attempts" on public.attempts with check ((auth.uid() = user_id));
alter policy "Students view own attempts" on public.attempts using ((auth.uid() = user_id));
alter policy active_players_insert_attempts on public.attempts with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_attempts on public.attempts using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_attempts on public.attempts using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy school_writing_module_required on public.bh_writing_assessment_reviews using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy school_writing_module_required on public.bh_writing_assessments using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing attempts read" on public.bh_writing_attempts using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing attempts write" on public.bh_writing_attempts using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_attempts using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing calibration read" on public.bh_writing_calibration_followups using (((student_id = auth.uid()) OR can_access_bh_writing_student(student_id)));
alter policy "bh writing calibration write" on public.bh_writing_calibration_followups using (is_bh_admin_or_teacher()) with check (is_bh_admin_or_teacher());
alter policy school_writing_module_required on public.bh_writing_calibration_followups using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing evaluations read" on public.bh_writing_daily_evaluations using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing evaluations write" on public.bh_writing_daily_evaluations using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_daily_evaluations using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing submissions read" on public.bh_writing_daily_submissions using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing submissions write" on public.bh_writing_daily_submissions using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_daily_submissions using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing daily tasks read" on public.bh_writing_daily_tasks using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing daily tasks write" on public.bh_writing_daily_tasks using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_daily_tasks using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing memory read" on public.bh_writing_memory_snapshots using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing memory write" on public.bh_writing_memory_snapshots using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_memory_snapshots using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing monthly reports read" on public.bh_writing_monthly_reports using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing monthly reports write" on public.bh_writing_monthly_reports using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_monthly_reports using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing prompt bank read" on public.bh_writing_prompt_bank using (is_bh_admin_or_teacher());
alter policy "bh writing prompt bank write" on public.bh_writing_prompt_bank with check (is_bh_admin_or_teacher());
alter policy school_writing_module_required on public.bh_writing_prompt_bank using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing review signals read" on public.bh_writing_review_signals using (is_bh_admin_or_teacher());
alter policy "bh writing review signals write" on public.bh_writing_review_signals using (is_bh_admin_or_teacher()) with check (is_bh_admin_or_teacher());
alter policy school_writing_module_required on public.bh_writing_review_signals using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing profile insert" on public.bh_writing_student_profiles with check (((student_id = auth.uid()) OR is_bh_admin_or_teacher()));
alter policy "bh writing profile scoped select" on public.bh_writing_student_profiles using ((can_access_bh_writing_student(student_id) OR (student_id = auth.uid())));
alter policy "bh writing profile scoped upsert" on public.bh_writing_student_profiles using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (u.role = ANY (ARRAY['admin'::text, 'school_admin'::text])))))))) with check (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (u.role = ANY (ARRAY['admin'::text, 'school_admin'::text]))))))));
alter policy "bh writing profile select" on public.bh_writing_student_profiles using (((student_id = auth.uid()) OR is_bh_admin_or_teacher()));
alter policy "bh writing profile update" on public.bh_writing_student_profiles using (((student_id = auth.uid()) OR is_bh_admin_or_teacher())) with check (((student_id = auth.uid()) OR is_bh_admin_or_teacher()));
alter policy school_writing_module_required on public.bh_writing_student_profiles using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing states insert" on public.bh_writing_student_states with check (((student_id = auth.uid()) OR is_bh_admin_or_teacher()));
alter policy "bh writing states scoped delete" on public.bh_writing_student_states using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (u.role = ANY (ARRAY['admin'::text, 'school_admin'::text]))))))));
alter policy "bh writing states scoped select" on public.bh_writing_student_states using (((student_id = auth.uid()) OR can_access_bh_writing_student(student_id)));
alter policy "bh writing states scoped update" on public.bh_writing_student_states using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (u.role = ANY (ARRAY['admin'::text, 'school_admin'::text])))))))) with check (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (u.role = ANY (ARRAY['admin'::text, 'school_admin'::text]))))))));
alter policy "bh writing states scoped write" on public.bh_writing_student_states with check (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (u.role = ANY (ARRAY['admin'::text, 'school_admin'::text]))))))));
alter policy "bh writing states select" on public.bh_writing_student_states using (((student_id = auth.uid()) OR is_bh_admin_or_teacher()));
alter policy "bh writing states update" on public.bh_writing_student_states using (((student_id = auth.uid()) OR is_bh_admin_or_teacher())) with check (((student_id = auth.uid()) OR is_bh_admin_or_teacher()));
alter policy school_writing_module_required on public.bh_writing_student_states using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing teacher reports update" on public.bh_writing_teacher_reports using (can_access_bh_writing_student(student_id)) with check ((can_access_bh_writing_student(student_id) AND (auth.uid() IS NOT NULL) AND (updated_by = auth.uid())));
alter policy "bh writing teacher reports write" on public.bh_writing_teacher_reports with check ((can_access_bh_writing_student(student_id) AND (auth.uid() IS NOT NULL) AND (created_by = auth.uid()) AND (updated_by = auth.uid())));
alter policy school_writing_module_required on public.bh_writing_teacher_reports using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "bh writing weekly plans read" on public.bh_writing_weekly_plans using ((((payload ->> 'student_id'::text) = (auth.uid())::text) OR ((payload ->> 'user_id'::text) = (auth.uid())::text) OR can_access_bh_writing_student(bh_writing_payload_student_uuid(payload))));
alter policy "bh writing weekly plans write" on public.bh_writing_weekly_plans using ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text))) with check ((is_bh_admin_or_teacher() OR (COALESCE((payload ->> 'student_id'::text), (payload ->> 'user_id'::text)) = (auth.uid())::text)));
alter policy school_writing_module_required on public.bh_writing_weekly_plans using (private.actor_has_programme_access('writing'::text, true)) with check (private.actor_has_programme_access('writing'::text, true));
alter policy "Service role manages entitlements" on public.billing_entitlements using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy "Service role manages billing events" on public.billing_events using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy "Superadmin can read billing events" on public.billing_events using (is_superadmin(auth.uid()));
alter policy bh_read_brains_heist_adaptive_snapshots on public.brains_heist_adaptive_snapshots using (is_bh_member());
alter policy bh_write_brains_heist_adaptive_snapshots on public.brains_heist_adaptive_snapshots using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_assignments on public.brains_heist_assignments using (is_bh_member());
alter policy bh_write_brains_heist_assignments on public.brains_heist_assignments using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_battle_events on public.brains_heist_battle_events using (is_bh_member());
alter policy bh_write_brains_heist_battle_events on public.brains_heist_battle_events using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_battles on public.brains_heist_battles using (is_bh_member());
alter policy bh_write_brains_heist_battles on public.brains_heist_battles using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_choices on public.brains_heist_choices using (is_bh_member());
alter policy bh_write_brains_heist_choices on public.brains_heist_choices using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_class_memberships on public.brains_heist_class_memberships using (is_bh_member());
alter policy bh_write_brains_heist_class_memberships on public.brains_heist_class_memberships using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_classes on public.brains_heist_classes using (is_bh_member());
alter policy bh_write_brains_heist_classes on public.brains_heist_classes using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_gates on public.brains_heist_gates using (is_bh_member());
alter policy bh_write_brains_heist_gates on public.brains_heist_gates using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_homework_schedule on public.brains_heist_homework_schedule using (is_bh_member());
alter policy bh_write_brains_heist_homework_schedule on public.brains_heist_homework_schedule using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bhm_read_admin on public.brains_heist_memberships using (is_bh_admin());
alter policy bhm_read_self on public.brains_heist_memberships using ((user_id = auth.uid()));
alter policy bhm_service_all on public.brains_heist_memberships using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy bh_read_brains_heist_milestones on public.brains_heist_milestones using (is_bh_member());
alter policy bh_write_brains_heist_milestones on public.brains_heist_milestones using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_progress_map on public.brains_heist_progress_map using (is_bh_member());
alter policy bh_write_brains_heist_progress_map on public.brains_heist_progress_map using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_question_variants on public.brains_heist_question_variants using (is_bh_member());
alter policy bh_write_brains_heist_question_variants on public.brains_heist_question_variants using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_questions on public.brains_heist_questions using (is_bh_member());
alter policy bh_write_brains_heist_questions on public.brains_heist_questions using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_raid_attacks on public.brains_heist_raid_attacks using (is_bh_member());
alter policy bh_write_brains_heist_raid_attacks on public.brains_heist_raid_attacks using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.brains_heist_raid_attacks using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy bh_read_brains_heist_raid_participants on public.brains_heist_raid_participants using (is_bh_member());
alter policy bh_write_brains_heist_raid_participants on public.brains_heist_raid_participants using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.brains_heist_raid_participants using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy bh_read_brains_heist_raids on public.brains_heist_raids using (is_bh_member());
alter policy bh_write_brains_heist_raids on public.brains_heist_raids using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.brains_heist_raids using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy bh_read_brains_heist_student_attempts on public.brains_heist_student_attempts using (is_bh_member());
alter policy bh_write_brains_heist_student_attempts on public.brains_heist_student_attempts using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_subjects on public.brains_heist_subjects using (is_bh_member());
alter policy bh_write_brains_heist_subjects on public.brains_heist_subjects using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_task_group_stats on public.brains_heist_task_group_stats using (is_bh_member());
alter policy bh_write_brains_heist_task_group_stats on public.brains_heist_task_group_stats using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_task_groups on public.brains_heist_task_groups using (is_bh_member());
alter policy bh_write_brains_heist_task_groups on public.brains_heist_task_groups using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_topic_stats on public.brains_heist_topic_stats using (is_bh_member());
alter policy bh_write_brains_heist_topic_stats on public.brains_heist_topic_stats using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bh_read_brains_heist_topics on public.brains_heist_topics using (is_bh_member());
alter policy bh_write_brains_heist_topics on public.brains_heist_topics using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy bm_purchases_insert_own on public.brains_master_purchases with check ((user_id = auth.uid()));
alter policy bm_purchases_select_own on public.brains_master_purchases using ((user_id = auth.uid()));
alter policy "Teachers and admins can manage visibility" on public.cambridge_test_visibility using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school_admin'::text])) AND (u.school_id = cambridge_test_visibility.school_id))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school_admin'::text])) AND (u.school_id = cambridge_test_visibility.school_id)))));
alter policy ctv_manage_school_admin on public.cambridge_test_visibility using (((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = 'school_admin'::text) AND (sm.school_id = cambridge_test_visibility.school_id)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true))))));
alter policy ctv_own_teacher on public.cambridge_test_visibility using ((teacher_user_id = auth.uid()));
alter policy ctv_select_school_staff on public.cambridge_test_visibility using (((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (sm.school_id = cambridge_test_visibility.school_id)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true))))));
alter policy active_players_insert_caps on public.caps with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_caps on public.caps using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_caps on public.caps using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy bh_read_clan_buff_templates on public.clan_buff_templates using (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_banned, false) = false))))));
alter policy bh_write_clan_buff_templates on public.clan_buff_templates using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.clan_buff_templates using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy "Members view clan buffs" on public.clan_buffs using ((clan_id IN ( SELECT cm.clan_id
   FROM clan_members cm
  WHERE (cm.user_id = auth.uid()))));
alter policy bh_read_clan_buffs on public.clan_buffs using (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_banned, false) = false))))));
alter policy bh_write_clan_buffs on public.clan_buffs using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.clan_buffs using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy "Clan members can post messages" on public.clan_chat with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM clan_members
  WHERE ((clan_members.clan_id = clan_chat.clan_id) AND (clan_members.user_id = auth.uid()))))));
alter policy "Clan members can view clan chat" on public.clan_chat using ((EXISTS ( SELECT 1
   FROM clan_members
  WHERE ((clan_members.clan_id = clan_chat.clan_id) AND (clan_members.user_id = auth.uid())))));
alter policy feature_entitlement_guard on public.clan_chat using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy clan_join_requests_delete on public.clan_join_requests using (((user_id = auth.uid()) OR (clan_id IN ( SELECT clan_members.clan_id
   FROM clan_members
  WHERE ((clan_members.user_id = auth.uid()) AND (clan_members.role = ANY (ARRAY['leader'::text, 'moderator'::text])))))));
alter policy clan_join_requests_insert on public.clan_join_requests with check ((user_id = auth.uid()));
alter policy clan_join_requests_update on public.clan_join_requests using ((clan_id IN ( SELECT clan_members.clan_id
   FROM clan_members
  WHERE ((clan_members.user_id = auth.uid()) AND (clan_members.role = ANY (ARRAY['leader'::text, 'moderator'::text])))))) with check ((clan_id IN ( SELECT clan_members.clan_id
   FROM clan_members
  WHERE ((clan_members.user_id = auth.uid()) AND (clan_members.role = ANY (ARRAY['leader'::text, 'moderator'::text]))))));
alter policy clan_join_requests_view on public.clan_join_requests using (((EXISTS ( SELECT 1
   FROM clan_members
  WHERE ((clan_members.user_id = auth.uid()) AND (clan_members.clan_id = clan_join_requests.clan_id) AND (clan_members.role = ANY (ARRAY['leader'::text, 'moderator'::text]))))) OR (user_id = auth.uid())));
alter policy feature_entitlement_guard on public.clan_join_requests using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy "Clan members can view deposit totals" on public.clan_member_coin_contributions using ((EXISTS ( SELECT 1
   FROM clan_members cm
  WHERE ((cm.clan_id = clan_member_coin_contributions.clan_id) AND (cm.user_id = auth.uid())))));
alter policy feature_entitlement_guard on public.clan_member_coin_contributions using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy "Leaders can add members to clan" on public.clan_members with check ((clan_id IN ( SELECT clan_members_1.clan_id
   FROM clan_members clan_members_1
  WHERE ((clan_members_1.user_id = auth.uid()) AND (clan_members_1.role = ANY (ARRAY['leader'::text, 'moderator'::text]))))));
alter policy "Leaders can remove members" on public.clan_members using ((EXISTS ( SELECT 1
   FROM clans
  WHERE ((clans.id = clan_members.clan_id) AND (clans.leader_id = auth.uid())))));
alter policy "Users can join clans" on public.clan_members with check ((auth.uid() = user_id));
alter policy "Users can leave clans" on public.clan_members using ((auth.uid() = user_id));
alter policy clan_members_select_same_tenant_or_shared_clan on public.clan_members using (((user_id = auth.uid()) OR is_current_user_member_of_clan(clan_id) OR ((current_user_school_id() IS NOT NULL) AND same_tenant_user(user_id))));
alter policy feature_entitlement_guard on public.clan_members using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy "Admins manage clans" on public.clans using ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)) with check ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
alter policy "Leaders can delete own clan" on public.clans using ((auth.uid() = leader_id));
alter policy "Leaders can update own clan" on public.clans using ((auth.uid() = leader_id));
alter policy "Users can create clans" on public.clans with check ((auth.uid() = leader_id));
alter policy clans_select_same_tenant_or_member on public.clans using (((leader_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM clan_members cm
  WHERE ((cm.clan_id = clans.id) AND (cm.user_id = auth.uid())))) OR ((current_user_school_id() IS NOT NULL) AND same_tenant_user(leader_id))));
alter policy feature_entitlement_guard on public.clans using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy "Students can view their class enrollments" on public.class_students using ((student_id = auth.uid()));
alter policy cta_read_self on public.class_teacher_assignments using ((teacher_user_id = auth.uid()));
alter policy "Teachers can manage their own classes" on public.classes using ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = auth.uid()))));
alter policy "Teachers can view their own classes" on public.classes using ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = auth.uid()))));
alter policy classes_school_admin_all on public.classes using (((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = classes.school_id) AND (sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = 'school_admin'::text)))) OR is_superadmin(auth.uid()))) with check (((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = classes.school_id) AND (sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = 'school_admin'::text)))) OR is_superadmin(auth.uid())));
alter policy "Teachers manage own geometry questions" on public.geometry_questions using ((EXISTS ( SELECT 1
   FROM teachers t
  WHERE ((t.id = geometry_questions.teacher_id) AND (t.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM teachers t
  WHERE ((t.id = geometry_questions.teacher_id) AND (t.user_id = auth.uid())))));
alter policy ielts_admin_audit_log_admin_only on public.ielts_admin_audit_log using (is_ielts_admin());
alter policy ielts_admin_notes_admin_only on public.ielts_admin_notes using (is_ielts_admin()) with check (is_ielts_admin());
alter policy ielts_admin_user_tags_admin_only on public.ielts_admin_user_tags using (is_ielts_admin()) with check (is_ielts_admin());
alter policy "Users view own certificates" on public.ielts_certificates using ((user_id = auth.uid()));
alter policy ielts_exam_assignments_select_owner_or_monitor on public.ielts_exam_assignments using (((student_id = auth.uid()) OR can_monitor_ielts_exam(exam_event_id)));
alter policy school_ielts_module_required on public.ielts_exam_assignments using ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text))) with check ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text)));
alter policy ielts_exam_attempts_select_owner_or_monitor on public.ielts_exam_attempts using (((student_id = auth.uid()) OR can_monitor_ielts_exam(exam_event_id)));
alter policy ielts_exam_audit_log_select_managers on public.ielts_exam_audit_log using ((is_superadmin(auth.uid()) OR ((exam_event_id IS NOT NULL) AND can_manage_ielts_exam(exam_event_id)) OR ((attempt_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ielts_exam_attempts a
  WHERE ((a.id = ielts_exam_audit_log.attempt_id) AND can_manage_ielts_exam(a.exam_event_id)))))));
alter policy ielts_exam_drafts_select_owner_or_monitor on public.ielts_exam_drafts using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ielts_exam_attempts a
  WHERE ((a.id = ielts_exam_drafts.attempt_id) AND can_monitor_ielts_exam(a.exam_event_id))))));
alter policy ielts_exam_events_manage on public.ielts_exam_events using (can_manage_ielts_exam(id)) with check ((is_superadmin(auth.uid()) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = ielts_exam_events.school_id) AND (sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = 'school_admin'::text))))));
alter policy school_ielts_module_required on public.ielts_exam_events using ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text))) with check ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text)));
alter policy ielts_exam_incidents_select_owner_or_monitor on public.ielts_exam_incidents using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ielts_exam_attempts a
  WHERE ((a.id = ielts_exam_incidents.attempt_id) AND can_monitor_ielts_exam(a.exam_event_id))))));
alter policy ielts_exam_submissions_select_owner_or_monitor on public.ielts_exam_submissions using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ielts_exam_attempts a
  WHERE ((a.id = ielts_exam_submissions.attempt_id) AND can_monitor_ielts_exam(a.exam_event_id))))));
alter policy "ielts funnel admin read" on public.ielts_funnel_events using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (lower(COALESCE(u.role, ''::text)) = ANY (ARRAY['admin'::text, 'superadmin'::text, 'school_admin'::text])))))));
alter policy "ielts funnel admin reset" on public.ielts_funnel_events using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (lower(COALESCE(u.role, ''::text)) = ANY (ARRAY['admin'::text, 'superadmin'::text, 'school_admin'::text])))))));
alter policy "ielts funnel authenticated own inserts" on public.ielts_funnel_events with check (((user_id IS NULL) OR (user_id = auth.uid())));
alter policy "ielts funnel authenticated own read" on public.ielts_funnel_events using ((user_id = auth.uid()));
alter policy "Students insert listening attempts" on public.ielts_listening_attempts with check ((auth.uid() = user_id));
alter policy "Students manage listening attempts" on public.ielts_listening_attempts using ((auth.uid() = user_id));
alter policy "Students update listening attempts" on public.ielts_listening_attempts using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy "Teachers view listening attempts" on public.ielts_listening_attempts using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy "Users create own listening attempts" on public.ielts_listening_attempts with check ((user_id = auth.uid()));
alter policy "Users view own listening attempts" on public.ielts_listening_attempts using ((user_id = auth.uid()));
alter policy ielts_listening_attempts_read on public.ielts_listening_attempts using (((user_id = auth.uid()) OR is_ielts_admin()));
alter policy "Listening questions full access for teachers" on public.ielts_listening_questions using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_listening_questions_admin_all on public.ielts_listening_questions using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text]))))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text])))))));
alter policy ielts_listening_questions_read_members on public.ielts_listening_questions using (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ielts_memberships m
  WHERE (m.user_id = auth.uid())))));
alter policy "Listening sets full access for teachers" on public.ielts_listening_sets using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_listening_sets_admin_all on public.ielts_listening_sets using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text]))))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text])))))));
alter policy ielts_memberships_read_self_or_admin on public.ielts_memberships using ((is_ielts_admin() OR (user_id = auth.uid())));
alter policy ielts_memberships_write_admin_only on public.ielts_memberships using (is_ielts_admin()) with check (is_ielts_admin());
alter policy "Students insert mock test attempts" on public.ielts_mock_test_attempts with check ((auth.uid() = user_id));
alter policy "Students manage mock test attempts" on public.ielts_mock_test_attempts using ((auth.uid() = user_id));
alter policy "Students update mock test attempts" on public.ielts_mock_test_attempts using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy "Teachers view mock test attempts" on public.ielts_mock_test_attempts using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy "Mock tests full access for teachers" on public.ielts_mock_tests using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy "Mock tests selectable when active" on public.ielts_mock_tests using ((is_active AND (auth.uid() IS NOT NULL)));
alter policy "Users manage own notification prefs" on public.ielts_notification_preferences using ((auth.uid() = user_id));
alter policy ielts_notif_read on public.ielts_notification_preferences using ((is_ielts_admin() OR (user_id = auth.uid())));
alter policy ielts_notif_update_admin on public.ielts_notification_preferences using (is_ielts_admin()) with check (is_ielts_admin());
alter policy ielts_practice_item_students_select_scoped on public.ielts_practice_assignment_item_students using (((student_id = auth.uid()) OR can_manage_ielts_practice_assignment(assignment_id)));
alter policy ielts_practice_students_select_scoped on public.ielts_practice_assignment_students using (((student_id = auth.uid()) OR can_manage_ielts_practice_assignment(assignment_id)));
alter policy ielts_practice_assignments_select_scoped on public.ielts_practice_assignments using ((can_manage_ielts_practice_class(school_id, class_id) OR (EXISTS ( SELECT 1
   FROM ielts_practice_assignment_students s
  WHERE ((s.assignment_id = ielts_practice_assignments.id) AND (s.student_id = auth.uid()))))));
alter policy school_ielts_module_required on public.ielts_practice_assignments using ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text))) with check ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text)));
alter policy "Admins can update prime applications" on public.ielts_prime_applications using (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.is_admin = true) OR (users.role = 'admin'::text))))) OR (EXISTS ( SELECT 1
   FROM ielts_users
  WHERE ((ielts_users.id = auth.uid()) AND (ielts_users.tier = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));
alter policy "Anyone can view prime applications" on public.ielts_prime_applications using ((auth.uid() IS NOT NULL));
alter policy "Users create own prime applications" on public.ielts_prime_applications with check ((user_id = auth.uid()));
alter policy ielts_prime_apps_read on public.ielts_prime_applications using ((is_ielts_admin() OR (user_id = auth.uid())));
alter policy ielts_prime_apps_update_status on public.ielts_prime_applications using (is_ielts_admin()) with check (is_ielts_admin());
alter policy ielts_prime_subscriptions_select_own on public.ielts_prime_subscriptions using ((user_id = auth.uid()));
alter policy ielts_prime_subscriptions_service_role_all on public.ielts_prime_subscriptions using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy "ielts review events scoped select" on public.ielts_productive_skill_review_events using ((EXISTS ( SELECT 1
   FROM ielts_productive_skill_reviews r
  WHERE ((r.id = ielts_productive_skill_review_events.review_id) AND ((r.student_id = auth.uid()) OR can_review_ielts_productive_submission(r.school_id, NULL::uuid, r.student_id))))));
alter policy "ielts review scoped select" on public.ielts_productive_skill_reviews using (((student_id = auth.uid()) OR can_review_ielts_productive_submission(school_id, NULL::uuid, student_id)));
alter policy school_ielts_module_required on public.ielts_productive_skill_reviews using ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text))) with check ((is_superadmin(auth.uid()) OR (school_id IS NULL) OR school_has_module_access(school_id, 'ielts'::text)));
alter policy "Students insert reading attempts" on public.ielts_reading_attempts with check ((auth.uid() = user_id));
alter policy "Students manage reading attempts" on public.ielts_reading_attempts using ((auth.uid() = user_id));
alter policy "Students update reading attempts" on public.ielts_reading_attempts using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy "Teachers view reading attempts" on public.ielts_reading_attempts using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_reading_attempts_read on public.ielts_reading_attempts using (((user_id = auth.uid()) OR is_ielts_admin()));
alter policy "Reading questions full access for teachers" on public.ielts_reading_questions using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_reading_questions_admin_all on public.ielts_reading_questions using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text]))))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text])))))));
alter policy "Reading sets full access for teachers" on public.ielts_reading_sets using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_reading_sets_admin_all on public.ielts_reading_sets using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text]))))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text])))))));
alter policy "Users view own usage" on public.ielts_skill_usage using ((user_id = auth.uid()));
alter policy "Students insert speaking attempts" on public.ielts_speaking_attempts with check ((auth.uid() = user_id));
alter policy "Students manage speaking attempts" on public.ielts_speaking_attempts using ((auth.uid() = user_id));
alter policy "Students update speaking attempts" on public.ielts_speaking_attempts using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy "Teachers view speaking attempts" on public.ielts_speaking_attempts using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy "Users create own speaking attempts" on public.ielts_speaking_attempts with check ((user_id = auth.uid()));
alter policy "Users view own speaking attempts" on public.ielts_speaking_attempts using ((user_id = auth.uid()));
alter policy ielts_speaking_attempts_read on public.ielts_speaking_attempts using (((user_id = auth.uid()) OR is_ielts_admin()));
alter policy ielts_speaking_attempts_update_admin on public.ielts_speaking_attempts using (is_ielts_admin()) with check (is_ielts_admin());
alter policy "Speaking tasks full access for teachers" on public.ielts_speaking_tasks using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_speaking_tasks_admin_all on public.ielts_speaking_tasks using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text]))))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text])))))));
alter policy "Service roles manage teacher membership" on public.ielts_teachers using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy "Teachers can view their membership" on public.ielts_teachers using ((auth.uid() = user_id));
alter policy "IELTS users can create their profile" on public.ielts_users with check ((auth.uid() = id));
alter policy "IELTS users can update their profile" on public.ielts_users using ((auth.uid() = id)) with check ((auth.uid() = id));
alter policy "IELTS users can view their profile" on public.ielts_users using ((auth.uid() = id));
alter policy "Service roles manage IELTS profiles" on public.ielts_users using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy ielts_violation_logs_insert_self on public.ielts_violation_logs with check ((user_id = auth.uid()));
alter policy ielts_violation_logs_read_admin_only on public.ielts_violation_logs using (is_ielts_admin());
alter policy ielts_violation_logs_write_admin_only on public.ielts_violation_logs using (is_ielts_admin()) with check (is_ielts_admin());
alter policy "Students insert writing attempts" on public.ielts_writing_attempts with check ((auth.uid() = user_id));
alter policy "Students manage writing attempts" on public.ielts_writing_attempts using ((auth.uid() = user_id));
alter policy "Students update writing attempts" on public.ielts_writing_attempts using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy "Teachers view writing attempts" on public.ielts_writing_attempts using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy "Users create own writing attempts" on public.ielts_writing_attempts with check ((user_id = auth.uid()));
alter policy "Users view own writing attempts" on public.ielts_writing_attempts using ((user_id = auth.uid()));
alter policy ielts_writing_attempts_read on public.ielts_writing_attempts using (((user_id = auth.uid()) OR is_ielts_admin()));
alter policy ielts_writing_attempts_update_admin on public.ielts_writing_attempts using (is_ielts_admin()) with check (is_ielts_admin());
alter policy "Writing tasks full access for teachers" on public.ielts_writing_tasks using ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM ielts_teachers t
  WHERE (t.user_id = auth.uid()))));
alter policy ielts_writing_tasks_admin_all on public.ielts_writing_tasks using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text]))))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.is_admin = true) OR (u.role = ANY (ARRAY['school_admin'::text, 'admin'::text, 'superadmin'::text, 'teacher'::text])))))));
alter policy active_players_delete_inventory on public.inventory using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_insert_inventory on public.inventory with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_inventory on public.inventory using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_update_inventory on public.inventory using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false)))))) with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_inventory on public.inventory using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy feature_entitlement_guard on public.inventory using (can_use_feature('shop'::text, true)) with check (can_use_feature('shop'::text, true));
alter policy invite_attempts_select on public.invite_code_attempts using (((user_id = auth.uid()) OR is_superadmin(auth.uid())));
alter policy "Admins manage questions" on public.mcq_questions using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true)))));
alter policy mcq_questions_admin_delete on public.mcq_questions using ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
alter policy mcq_questions_admin_update on public.mcq_questions using ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['teacher'::text, 'admin'::text])));
alter policy mcq_questions_global_read on public.mcq_questions using (((active = true) AND (NOT COALESCE(( SELECT users.is_banned
   FROM users
  WHERE (users.id = auth.uid())), false))));
alter policy mcq_questions_teacher_insert on public.mcq_questions with check ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['teacher'::text, 'admin'::text])));
alter policy notifications_delete_own on public.notifications using ((auth.uid() = user_id));
alter policy notifications_select_own on public.notifications using ((auth.uid() = user_id));
alter policy notifications_update_own on public.notifications using ((auth.uid() = user_id));
alter policy onboarding_events_insert_own on public.onboarding_events with check (((auth.uid() = user_id) OR (user_id IS NULL)));
alter policy onboarding_events_select_own on public.onboarding_events using ((auth.uid() = user_id));
alter policy feature_entitlement_guard on public.pvp_attack_attempts using (can_use_feature('pvp_battles'::text, true)) with check (can_use_feature('pvp_battles'::text, true));
alter policy pvp_attack_attempts_owner_insert on public.pvp_attack_attempts with check ((attacker_id = auth.uid()));
alter policy pvp_attack_attempts_owner_select on public.pvp_attack_attempts using (((attacker_id = auth.uid()) OR (defender_id = auth.uid())));
alter policy quest_events_admin_insert on public.quest_events with check ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy quest_events_admin_update on public.quest_events using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy quest_missions_admin_delete on public.quest_missions using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy quest_missions_admin_insert on public.quest_missions with check ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy quest_missions_admin_update on public.quest_missions using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy quest_missions_select on public.quest_missions using (((is_active = true) OR (created_by = auth.uid())));
alter policy quest_missions_teacher_delete on public.quest_missions using (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'teacher'::text))))));
alter policy quest_missions_teacher_insert on public.quest_missions with check (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'teacher'::text))))));
alter policy quest_missions_teacher_update on public.quest_missions using (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'teacher'::text)))))) with check ((created_by = auth.uid()));
alter policy quest_run_nodes_insert on public.quest_run_nodes with check ((EXISTS ( SELECT 1
   FROM quest_runs
  WHERE ((quest_runs.id = quest_run_nodes.run_id) AND (quest_runs.user_id = auth.uid())))));
alter policy quest_run_nodes_select on public.quest_run_nodes using ((EXISTS ( SELECT 1
   FROM quest_runs
  WHERE ((quest_runs.id = quest_run_nodes.run_id) AND (quest_runs.user_id = auth.uid())))));
alter policy quest_runs_insert on public.quest_runs with check ((user_id = auth.uid()));
alter policy quest_runs_select on public.quest_runs using ((user_id = auth.uid()));
alter policy quest_runs_update on public.quest_runs using ((user_id = auth.uid()));
alter policy "Public quest templates are viewable by everyone" on public.quest_templates using (((is_public = true) OR (teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = auth.uid())))));
alter policy "Teachers can manage their own quest templates" on public.quest_templates using ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = auth.uid()))));
alter policy "Teachers can view attempts on their questions" on public.question_attempts using ((question_id IN ( SELECT q.id
   FROM (questions q
     JOIN teachers t ON ((q.teacher_id = t.id)))
  WHERE (t.user_id = auth.uid()))));
alter policy school_module_cambridge_quiz_scores on public.quiz_scores using ((is_superadmin(auth.uid()) OR (NOT (EXISTS ( SELECT 1
   FROM cambridge_tests ct
  WHERE (ct.id = quiz_scores.test_id)))) OR school_has_module_access(school_id, 'cambridge'::text))) with check ((is_superadmin(auth.uid()) OR (NOT (EXISTS ( SELECT 1
   FROM cambridge_tests ct
  WHERE (ct.id = quiz_scores.test_id)))) OR school_has_module_access(school_id, 'cambridge'::text)));
alter policy bh_read_raid_events on public.raid_events using (is_bh_member());
alter policy bh_write_raid_events on public.raid_events using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.raid_events using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy bh_read_raid_participants on public.raid_participants using (is_bh_member());
alter policy bh_write_raid_participants on public.raid_participants using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.raid_participants using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy bh_read_raid_waves on public.raid_waves using (is_bh_member());
alter policy bh_write_raid_waves on public.raid_waves using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.raid_waves using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy bh_read_raids on public.raids using (is_bh_member());
alter policy bh_write_raids on public.raids using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy feature_entitlement_guard on public.raids using (can_use_feature('raids'::text, true)) with check (can_use_feature('raids'::text, true));
alter policy reward_event_receipts_owner_insert on public.reward_event_receipts with check ((user_id = auth.uid()));
alter policy reward_event_receipts_owner_select on public.reward_event_receipts using ((user_id = auth.uid()));
alter policy feature_entitlement_guard on public.rivalry_war_actions using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_actions_select_service_admin on public.rivalry_war_actions using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_effects using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_effects_select_service_admin on public.rivalry_war_effects using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_member_state using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_member_state_select_service_admin on public.rivalry_war_member_state using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_pair_cooldowns using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_pair_cooldowns_select_involved on public.rivalry_war_pair_cooldowns using ((EXISTS ( SELECT 1
   FROM clan_members cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.clan_id = ANY (ARRAY[rivalry_war_pair_cooldowns.clan_a_id, rivalry_war_pair_cooldowns.clan_b_id]))))));
alter policy rivalry_pair_cooldowns_select_service_admin on public.rivalry_war_pair_cooldowns using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_rewards using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_rewards_select_owner on public.rivalry_war_rewards using ((auth.uid() = user_id));
alter policy rivalry_rewards_select_service_admin on public.rivalry_war_rewards using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_rosters using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_rosters_select_service_admin on public.rivalry_war_rosters using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_scores using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_scores_select_service_admin on public.rivalry_war_scores using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_stakes using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_stakes_select_service_admin on public.rivalry_war_stakes using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_war_structures using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_structures_select_service_admin on public.rivalry_war_structures using (rivalry_is_service_or_admin());
alter policy feature_entitlement_guard on public.rivalry_wars using (can_use_feature('clans'::text, true)) with check (can_use_feature('clans'::text, true));
alter policy rivalry_wars_select_service_admin on public.rivalry_wars using (rivalry_is_service_or_admin());
alter policy "Admins read rpc logs" on public.rpc_event_log using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true)))));
alter policy "School members can view own school visibility" on public.school_cambridge_test_visibility using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.school_id = school_cambridge_test_visibility.school_id)))) OR is_superadmin()));
alter policy school_members_select on public.school_members using (((user_id = auth.uid()) OR (school_id = get_my_active_school_id())));
alter policy "Members can view own school pilot usage" on public.school_pilot_usage using (((school_id IN ( SELECT u.school_id
   FROM users u
  WHERE (u.id = auth.uid()))) OR is_superadmin()));
alter policy "Service role manages pilot usage" on public.school_pilot_usage using (is_superadmin()) with check (is_superadmin());
alter policy "Superadmins manage all pilot usage" on public.school_pilot_usage using (is_superadmin()) with check (is_superadmin());
alter policy srm_insert_admin on public.school_request_messages with check (is_superadmin(auth.uid()));
alter policy srm_insert_applicant on public.school_request_messages with check (((sender_user_id = auth.uid()) AND (sender_role = 'applicant'::text) AND (EXISTS ( SELECT 1
   FROM school_requests r
  WHERE ((r.id = school_request_messages.request_id) AND (r.requested_by = auth.uid()) AND (r.status = 'needs_more_info'::text))))));
alter policy srm_read_admin on public.school_request_messages using (is_superadmin(auth.uid()));
alter policy srm_read_applicant on public.school_request_messages using ((EXISTS ( SELECT 1
   FROM school_requests r
  WHERE ((r.id = school_request_messages.request_id) AND (r.requested_by = auth.uid())))));
alter policy school_requests_select on public.school_requests using (((requested_by = auth.uid()) OR is_superadmin(auth.uid())));
alter policy school_subjects_admin_all on public.school_subjects using (((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = school_subjects.school_id) AND (sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = 'school_admin'::text)))) OR is_superadmin(auth.uid()))) with check (((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = school_subjects.school_id) AND (sm.user_id = auth.uid()) AND (sm.status = 'active'::text) AND (sm.role_in_school = 'school_admin'::text)))) OR is_superadmin(auth.uid())));
alter policy school_subjects_read_school on public.school_subjects using (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = school_subjects.school_id) AND (sm.user_id = auth.uid()) AND (sm.status = 'active'::text))))));
alter policy "School admins can update their school" on public.schools using ((EXISTS ( SELECT 1
   FROM school_members sm
  WHERE ((sm.school_id = schools.id) AND (sm.user_id = auth.uid()) AND (sm.role_in_school = 'school_admin'::text)))));
alter policy "Super admins can manage all schools" on public.schools using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy active_players_delete_sessions on public.sessions using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_insert_sessions on public.sessions with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_sessions on public.sessions using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_update_sessions on public.sessions using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false)))))) with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_sessions on public.sessions using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy active_players_insert_shop_purchases on public.shop_purchases with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_shop_purchases on public.shop_purchases using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_shop_purchases on public.shop_purchases using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy feature_entitlement_guard on public.shop_purchases using (can_use_feature('shop'::text, true)) with check (can_use_feature('shop'::text, true));
alter policy "School members can view own subscription" on public.stripe_customers using (((school_id IN ( SELECT u.school_id
   FROM users u
  WHERE (u.id = auth.uid()))) OR is_superadmin()));
alter policy "Service role manages stripe customers" on public.stripe_customers using (is_superadmin()) with check (is_superadmin());
alter policy "Students see own analyses" on public.student_assignment_analyses using ((student_id = auth.uid()));
alter policy "Teachers see analyses for their assignments" on public.student_assignment_analyses using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = student_assignment_analyses.assignment_id) AND (a.teacher_id = ( SELECT teachers.id
           FROM teachers
          WHERE (teachers.user_id = auth.uid())
         LIMIT 1))))));
alter policy feature_entitlement_guard on public.student_assignment_analyses using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy feature_entitlement_guard on public.student_assignment_answers using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy feature_entitlement_guard on public.student_assignment_results using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy student_assignment_results_insert on public.student_assignment_results with check ((student_id = auth.uid()));
alter policy student_assignment_results_select on public.student_assignment_results using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (assignments a
     JOIN teachers t ON ((t.id = a.teacher_id)))
  WHERE ((a.id = student_assignment_results.assignment_id) AND (t.user_id = auth.uid()))))));
alter policy student_assignment_results_update on public.student_assignment_results using ((student_id = auth.uid())) with check ((student_id = auth.uid()));
alter policy "Students update own assignments" on public.student_assignments using ((student_id = auth.uid()));
alter policy "Students view own assignments" on public.student_assignments using ((student_id = auth.uid()));
alter policy feature_entitlement_guard on public.student_assignments using (can_use_feature('assignments'::text, false)) with check (can_use_feature('assignments'::text, false));
alter policy superadmins_read on public.superadmins using (((auth.role() = 'service_role'::text) OR is_superadmin(auth.uid())));
alter policy superadmins_write on public.superadmins using ((auth.role() = 'service_role'::text)) with check ((auth.role() = 'service_role'::text));
alter policy bh_read_task_progress on public.task_progress using (is_bh_member());
alter policy bh_write_task_progress on public.task_progress using ((is_bh_teacher() OR is_bh_admin())) with check ((is_bh_teacher() OR is_bh_admin()));
alter policy active_players_delete_tasks on public.tasks using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_insert_tasks on public.tasks with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_tasks on public.tasks using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_update_tasks on public.tasks using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false)))))) with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_tasks on public.tasks using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy feature_entitlement_guard on public.teacher_questions using (can_use_feature('question_bank'::text, false)) with check (can_use_feature('question_bank'::text, false));
alter policy teacher_questions_delete_own on public.teacher_questions using ((teacher_id = auth.uid()));
alter policy teacher_questions_insert_own on public.teacher_questions with check ((teacher_id = auth.uid()));
alter policy teacher_questions_update_own on public.teacher_questions using ((teacher_id = auth.uid())) with check ((teacher_id = auth.uid()));
alter policy "Users can insert their own teacher profile" on public.teachers with check ((auth.uid() = user_id));
alter policy "Users can update their own teacher profile" on public.teachers using ((auth.uid() = user_id));
alter policy teachers_insert_own on public.teachers with check ((auth.uid() = user_id));
alter policy teachers_select_own on public.teachers using ((auth.uid() = user_id));
alter policy teachers_update_own on public.teachers using ((auth.uid() = user_id));
alter policy feature_entitlement_guard on public.tournament_matches using (can_use_feature('tournaments'::text, true)) with check (can_use_feature('tournaments'::text, true));
alter policy tournament_matches_admin_delete on public.tournament_matches using (is_tournament_admin());
alter policy tournament_matches_admin_insert on public.tournament_matches with check (is_tournament_admin());
alter policy tournament_matches_admin_update on public.tournament_matches using (is_tournament_admin()) with check (is_tournament_admin());
alter policy feature_entitlement_guard on public.tournament_school_signups using (can_use_feature('tournaments'::text, true)) with check (can_use_feature('tournaments'::text, true));
alter policy tournament_signups_admin_delete on public.tournament_school_signups using (is_tournament_admin());
alter policy tournament_signups_admin_update on public.tournament_school_signups using (is_tournament_admin()) with check (is_tournament_admin());
alter policy tournament_signups_insert_authenticated on public.tournament_school_signups with check ((auth.uid() IS NOT NULL));
alter policy tournament_signups_select_admin_only on public.tournament_school_signups using (is_tournament_admin());
alter policy feature_entitlement_guard on public.tournament_seasons using (can_use_feature('tournaments'::text, true)) with check (can_use_feature('tournaments'::text, true));
alter policy tournament_seasons_admin_delete on public.tournament_seasons using (is_tournament_admin());
alter policy tournament_seasons_admin_insert on public.tournament_seasons with check (is_tournament_admin());
alter policy tournament_seasons_admin_only on public.tournament_seasons using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
alter policy tournament_seasons_admin_update on public.tournament_seasons using (is_tournament_admin()) with check (is_tournament_admin());
alter policy active_players_insert_user_achievements on public.user_achievements with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy active_players_select_user_achievements on public.user_achievements using (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM users u_guard
  WHERE ((u_guard.id = auth.uid()) AND (COALESCE(u_guard.is_banned, false) = false))))));
alter policy admins_manage_user_achievements on public.user_achievements using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text))) with check (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (COALESCE(u.is_admin, false) OR (COALESCE(u.role, 'student'::text) = 'admin'::text))))) OR (auth.role() = 'service_role'::text)));
alter policy user_achievements_select_own on public.user_achievements using ((auth.uid() = user_id));
alter policy user_onboarding_delete_own on public.user_onboarding using ((auth.uid() = user_id));
alter policy user_onboarding_insert_own on public.user_onboarding with check ((auth.uid() = user_id));
alter policy user_onboarding_select_own on public.user_onboarding using ((auth.uid() = user_id));
alter policy user_onboarding_update_own on public.user_onboarding using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
alter policy "Users can insert own profile" on public.users with check ((auth.uid() = id));
alter policy "Users can insert their own profile" on public.users with check ((auth.uid() = id));
alter policy "Users can read own data" on public.users using ((auth.uid() = id));
alter policy "Users can update own data" on public.users using ((auth.uid() = id)) with check ((auth.uid() = id));
alter policy "Users can update own profile" on public.users using (((auth.uid() = id) AND (COALESCE(is_banned, false) = false))) with check (((auth.uid() = id) AND (COALESCE(is_banned, false) = false)));
alter policy users_select_self on public.users using ((id = auth.uid()));
alter policy users_select_self_or_same_tenant on public.users using (((id = auth.uid()) OR same_tenant_user(id)));
commit;
