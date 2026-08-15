export interface TeacherAllocationCandidate {
  user_id: string;
  username: string;
  role_in_school?: string | null;
  can_teach: boolean;
}

/**
 * can_teach is an explicit teaching-staff registration. It is never inherited
 * from administrative access, so a registered dual-role administrator remains
 * eligible without making every administrator a teacher.
 */
export function getAllocatableTeachers<T extends TeacherAllocationCandidate>(teachers: readonly T[]): T[] {
  return teachers.filter((teacher) => teacher.can_teach);
}

export function formatAllocatableTeacherLabel(teacher: TeacherAllocationCandidate): string {
  return teacher.role_in_school === 'school_admin'
    ? `${teacher.username} — Teaching staff & School Admin`
    : teacher.username;
}
