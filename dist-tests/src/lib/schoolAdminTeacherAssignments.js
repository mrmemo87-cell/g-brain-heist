/**
 * Teaching capability is the source of truth for assignment eligibility.
 * A school administrator can also be a teacher, so role alone must not hide them.
 */
export function getAssignableTeachers(teachers) {
    return teachers.filter((teacher) => teacher.can_teach);
}
export function formatAssignableTeacherLabel(teacher) {
    return teacher.role_in_school === 'school_admin'
        ? `${teacher.username} - Teacher & School Admin`
        : teacher.username;
}
