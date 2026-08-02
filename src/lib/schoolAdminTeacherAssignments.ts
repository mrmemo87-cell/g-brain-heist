export interface TeacherAssignmentCandidate {
  user_id: string;
  username: string;
  role_in_school?: string | null;
  can_teach: boolean;
}

/**
 * Teaching capability is the source of truth for assignment eligibility.
 * A school administrator can also be a teacher, so role alone must not hide them.
 */
export function getAssignableTeachers<T extends TeacherAssignmentCandidate>(teachers: readonly T[]): T[] {
  return teachers.filter((teacher) => teacher.can_teach);
}

export function formatAssignableTeacherLabel(teacher: TeacherAssignmentCandidate): string {
  return teacher.role_in_school === 'school_admin'
    ? `${teacher.username} - Teacher & School Admin`
    : teacher.username;
}
