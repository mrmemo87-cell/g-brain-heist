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
    "  assert.ok((handler.match(/await brainsConfirm/g) ?? []).length === 1);",
)

# Correct composite assignment syntax in the migration.
replace_once(
    'supabase/migrations/20260810083000_teacher_assignment_editing_publication.sql',
    "select a.*,t.user_id,u.school_id into v_assignment,v_teacher_user_id,v_teacher_school_id",
    "select a,t.user_id,u.school_id into v_assignment,v_teacher_user_id,v_teacher_school_id",
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
