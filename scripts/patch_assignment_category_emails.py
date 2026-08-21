from pathlib import Path
import re

path = Path('supabase/functions/school_email_dispatcher/index.ts')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'{label}: expected source block not found')
    text = text.replace(old, new, 1)


if 'const assignmentCategoryLabel' not in text:
    replace_once(
        'const sha256 = async (value: string) => {',
        '''const assignmentCategoryLabel = (value: unknown) => {
  switch (cleanText(value, 40).toLowerCase()) {
    case "classwork": return "Classwork";
    case "homework": return "Homework";
    case "quiz": return "Quiz";
    case "term_exam": return "Term Exam";
    default: return "Uncategorized";
  }
};
const sha256 = async (value: string) => {''',
        'email category formatter',
    )
    replace_once(
        '  const subjectName = cleanText(payload.subject, 100);',
        '  const subjectName = cleanText(payload.subject, 100);\n  const assignmentCategory = assignmentCategoryLabel(payload.assignment_category);',
        'transactional email category value',
    )

    for template_key in [
        'assignment_result_ready',
        'assignment_submission_received',
        'assignment_due_reminder',
        'assignment_updated',
        'assignment_cancelled',
    ]:
        pattern = re.compile(
            rf'(case "{template_key}":.*?\n\s*details: )\[',
            re.S,
        )
        if not pattern.search(text):
            raise SystemExit(f'email template {template_key}: details block not found')
        text = pattern.sub(
            r'\1[{ label: "Type", value: assignmentCategory }, ',
            text,
            count=1,
        )

    replace_once(
        '.select("id,teacher_id,school_id,title,subject_name,subject_id,description,assigned_at,due_at,publish_status,notify_students_by_email")',
        '.select("id,teacher_id,school_id,title,subject_name,subject_id,description,assignment_category,assigned_at,due_at,publish_status,notify_students_by_email")',
        'initial assignment notification select',
    )
    replace_once(
        '        const subjectName = cleanText(assignment.subject_name || assignment.subject_id, 100) || "School assignment";\n        const rendered = renderBrandedEmail(school, {',
        '        const subjectName = cleanText(assignment.subject_name || assignment.subject_id, 100) || "School assignment";\n        const categoryName = assignmentCategoryLabel(assignment.assignment_category);\n        const rendered = renderBrandedEmail(school, {',
        'initial assignment category value',
    )
    replace_once(
        '          intro: `Hi ${studentName}, ${teacherName} has published a ${subjectName} assignment for you.`,\n          details: [{ label: "Subject", value: subjectName }, { label: "Due", value: fmt(assignment.due_at) }],',
        '          intro: `Hi ${studentName}, ${teacherName} has published ${categoryName === "Uncategorized" ? "an assignment" : `a ${categoryName.toLowerCase()}`} for ${subjectName}.`,\n          details: [{ label: "Subject", value: subjectName }, { label: "Type", value: categoryName }, { label: "Due", value: fmt(assignment.due_at) }],',
        'initial assignment category render',
    )

path.write_text(text, encoding='utf-8')
print('Assignment email category rendering materialized.')
