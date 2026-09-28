import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type DiagnosticSignal = 'correct' | 'needs_check' | 'not_answered' | 'not_completed';

export interface TeacherDiagnosticFocus {
  evidenceFocusCode: string;
  evidenceFocusName: string;
  skillKey: string;
  subskillName?: string | null;
  primarySkillCode?: string | null;
  primarySkillName?: string | null;
  orderIndex: number;
  questionCount: number;
  attempts: number;
  correctCount: number;
  incorrectCount: number;
  studentsAnswered: number;
  accuracyPercent?: number | null;
  avgTimeSeconds?: number | null;
}

export interface TeacherDiagnosticStudentFocus {
  evidenceFocusCode: string;
  evidenceFocusName: string;
  skillKey: string;
  subskillName?: string | null;
  primarySkillName?: string | null;
  orderIndex: number;
  questionCount: number;
  answeredQuestions: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPercent?: number | null;
  signal: DiagnosticSignal;
}

export interface TeacherDiagnosticStudent {
  studentId: string;
  studentName: string;
  batch?: string | null;
  completedAt?: string | null;
  assignmentAccuracy?: number | null;
  focusSignalsAnswered: number;
  needsCheckCount: number;
  correctSignalCount: number;
  focuses: TeacherDiagnosticStudentFocus[];
}

export interface TeacherAssignmentDiagnosticIntelligence {
  success: boolean;
  assignment: {
    id: string;
    title: string;
    topicName: string;
    subjectName: string;
    studentCount: number;
    completedStudents: number;
    questionCount: number;
    focusQuestionCount: number;
    focusCount: number;
  };
  focuses: TeacherDiagnosticFocus[];
  students: TeacherDiagnosticStudent[];
  disclosure: {
    screeningOnly: boolean;
    message: string;
  };
}

export async function fetchTeacherAssignmentDiagnosticIntelligence(
  assignmentId: string,
  teacherId: string,
): Promise<TeacherAssignmentDiagnosticIntelligence> {
  const { data, error } = await supabase.rpc('rpc_teacher_assignment_diagnostic_intelligence', {
    p_assignment_id: assignmentId,
    p_teacher_id: teacherId,
  });
  if (error) {
    throw userFacingError(error, 'Diagnostic skill intelligence could not be loaded just now. Please try again.');
  }
  return data as TeacherAssignmentDiagnosticIntelligence;
}
