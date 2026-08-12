/**
 * can_teach is an explicit teaching-staff registration. It is never inherited
 * from administrative access, so a registered dual-role administrator remains
 * eligible without making every administrator a teacher.
 */
export function getAssignableTeachers(teachers) {
    return teachers.filter((teacher) => teacher.can_teach);
}
export function formatAssignableTeacherLabel(teacher) {
    return teacher.role_in_school === 'school_admin'
        ? `${teacher.username} — Teaching staff & School Admin`
        : teacher.username;
}
