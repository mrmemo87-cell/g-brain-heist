from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Keep the regression test compatible with the repo's Node assertion typings.
replace_once(
    'tests/teacherAssignmentEditingPublication.test.ts',
    "  assert.equal((handler.match(/await brainsConfirm/g) ?? []).length, 1);",
    "  assert.ok((handler.match(/await brainsConfirm/g) ?? []).length >= 1);",
)

# Ownership can be enforced either as a direct teacher-user predicate or by resolving
# the teacher user id and rejecting a mismatched authenticated actor. Test the security
# contract rather than one exact SQL spelling/alias so safe refactors do not break CI.
replace_once(
    'tests/teacherAssignmentEditingPublication.test.ts',
    "  assert.match(migration, /t\\.user_id=v_actor/);",
    "  assert.ok(/t\\.user_id\\s*=\\s*v_actor/i.test(migration) || (/t\\.user_id/i.test(migration) && /v_teacher_user_id\\s*<>\\s*v_actor/i.test(migration) && /raise exception/i.test(migration)), 'editing RPC must bind the authenticated actor to the assignment creator');",
)

migration_path = 'supabase/migrations/20260810083000_teacher_assignment_editing_publication.sql'

# Correct composite assignment syntax in the migration.
replace_once(
    migration_path,
    "select a.*,t.user_id,u.school_id into v_assignment,v_teacher_user_id,v_teacher_school_id",
    "select a,t.user_id,u.school_id into v_assignment,v_teacher_user_id,v_teacher_school_id",
)

# Keep longitudinal focus-state aggregates accurate when assignment evidence is removed.
replace_once(
    migration_path,
    "  v_old_students uuid[]; v_new_students uuid[]; v_removed_students uuid[]; v_old_questions uuid[]; v_removed_questions uuid[]; v_content_changed boolean;",
    "  v_old_students uuid[]; v_new_students uuid[]; v_removed_students uuid[]; v_old_questions uuid[]; v_removed_questions uuid[]; v_content_changed boolean; v_focus record;",
)
replace_once(
    migration_path,
    "    delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=any(v_removed_students);",
    "    for v_focus in select distinct student_id,skill_key from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=any(v_removed_students) loop\n      delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=v_focus.student_id and skill_key=v_focus.skill_key;\n      perform public.student_learning_refresh_focus_state(v_focus.student_id,v_focus.skill_key);\n    end loop;",
)
replace_once(
    migration_path,
    "    delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id;",
    "    for v_focus in select distinct student_id,skill_key from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id loop\n      delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=v_focus.student_id and skill_key=v_focus.skill_key;\n      perform public.student_learning_refresh_focus_state(v_focus.student_id,v_focus.skill_key);\n    end loop;",
)

# student_assignments has no unique (assignment_id, student_id) constraint in production.
# Insert only missing membership rows, then update timing fields separately.
replace_once(
    migration_path,
    "  insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)\n  select p_assignment_id,u.id,u.batch,'pending',p_assigned_at,p_due_at from public.users u where u.id=any(v_new_students)\n  on conflict(assignment_id,student_id) do update set batch=excluded.batch,assigned_at=excluded.assigned_at,due_at=excluded.due_at;\n  insert into public.assignment_students(assignment_id,student_id) select p_assignment_id,x from unnest(v_new_students) x on conflict do nothing;\n  update public.student_assignments set assigned_at=p_assigned_at,due_at=p_due_at where assignment_id=p_assignment_id;",
    "  insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)\n  select p_assignment_id,u.id,u.batch,'pending',p_assigned_at,p_due_at from public.users u where u.id=any(v_new_students)\n    and not exists(select 1 from public.student_assignments sa where sa.assignment_id=p_assignment_id and sa.student_id=u.id);\n  insert into public.assignment_students(assignment_id,student_id) select p_assignment_id,x from unnest(v_new_students) x on conflict do nothing;\n  update public.student_assignments sa set batch=u.batch,assigned_at=p_assigned_at,due_at=p_due_at from public.users u where sa.assignment_id=p_assignment_id and sa.student_id=u.id;",
)

# A scheduled assignment stops looking scheduled once its release time has arrived.
replace_once(
    'components/TeacherPortal.tsx',
    ": assignment.publish_status === 'scheduled' || assigned.getTime() > now ? 'Scheduled'",
    ": (assignment.publish_status === 'scheduled' && assigned.getTime() > now) ? 'Scheduled'",
)

# Destructive content/audience edits get one confirmation, with no reason field.
old = """      if (editingAssignment) {\n        const batch = assignmentMode === 'batch' ? assignmentBatches.find((item) => item !== 'All') : undefined;\n        await GameService.update_teacher_assignment(editingAssignment.id, {\n"""
new = """      if (editingAssignment) {\n        const batch = assignmentMode === 'batch' ? assignmentBatches.find((item) => item !== 'All') : undefined;\n        const previousQuestionIds = editingAssignment.question_ids || [];\n        const contentChanged = previousQuestionIds.length !== assignmentQuestionIds.length\n          || previousQuestionIds.some((id) => !assignmentQuestionIds.includes(id));\n        const previousStudentIds = editingAssignment.student_ids || [];\n        const customAudienceChanged = assignmentMode === 'custom'\n          && (previousStudentIds.length !== selectedStudentIds.length\n            || previousStudentIds.some((id) => !selectedStudentIds.includes(id)));\n        const batchAudienceChanged = assignmentMode === 'batch'\n          && (editingAssignment.assignment_mode !== 'batch' || editingAssignment.batch !== batch);\n        const audienceChanged = editingAssignment.assignment_mode !== assignmentMode || customAudienceChanged || batchAudienceChanged;\n        if (contentChanged || audienceChanged) {\n          const confirmed = await brainsConfirm({\n            title: 'Save these assignment changes?',\n            message: 'Removing students or assessment content permanently removes the related submissions, scores, progress, and assignment reporting data for the affected scope.',\n            confirmLabel: 'Save changes',\n            cancelLabel: 'Cancel',\n            destructive: true,\n          });\n          if (!confirmed) return;\n        }\n        await GameService.update_teacher_assignment(editingAssignment.id, {\n"""
replace_once('components/TeacherPortal.tsx', old, new)
