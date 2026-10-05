import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export interface DiagnosticComposerDepth {
  questionCount: number;
  shortName: string;
  name: string;
  estimatedMinutes: number;
  description: string;
  recommended: boolean;
  available: boolean;
}

export interface DiagnosticComposerDifficulty {
  level: string;
  count: number;
}

export interface DiagnosticComposerCapabilities {
  success: boolean;
  ready: boolean;
  reason?: string | null;
  group: {
    id: string;
    name: string;
    gradeLevel: string;
    studentCount: number;
    schoolSubjectId?: string | null;
    schoolSubjectName: string;
    academicSubjectId?: string | null;
    academicSubjectCode?: string | null;
    academicSubjectName?: string | null;
    academicYearId?: string | null;
  };
  pool?: {
    eligibleQuestions: number;
    notRecentlyUsed: number;
    distinctSkills: number;
    difficultyBreakdown: DiagnosticComposerDifficulty[];
    recentLookbackDays: number;
  };
  depths: DiagnosticComposerDepth[];
  qualityContract?: {
    brainsHeistVerifiedOnly: boolean;
    gradeEligibleOnly: boolean;
    curriculumMappedOnly: boolean;
    fourOptionMcqOnly: boolean;
    recentQuestionsDeprioritized: boolean;
    skillDiversityPrioritized: boolean;
    minimumSkillAndDifficultyDiversityEnforced: boolean;
    balancedAnswerPositionsOnAssignmentSnapshot: boolean;
    canonicalQuestionContentUnchanged: boolean;
  };
}

export interface PreparedDiagnostic {
  success: boolean;
  groupId: string;
  groupName: string;
  gradeLevel: string;
  studentCount: number;
  schoolSubjectId: string;
  schoolSubjectName: string;
  academicSubjectId: string;
  academicSubjectCode: string;
  academicSubjectName: string;
  questionIds: string[];
  questionCount: number;
  distinctSkills: number;
  recentRepeatCount: number;
  difficultyBreakdown: DiagnosticComposerDifficulty[];
  defaultTitle: string;
  defaultDescription: string;
  defaultInstructions: string;
  assignmentCategory: 'quiz';
  topicName: 'Quick diagnostic';
  quality: {
    freshForm: boolean;
    recentLookbackDays: number;
    verifiedOnly: boolean;
    curriculumMappedOnly: boolean;
    balancedAnswerPositionsOnSave: boolean;
    canonicalContentUnchanged: boolean;
  };
}

export const fetchDiagnosticComposerCapabilities = async (
  schoolId: string,
  groupId: string,
): Promise<DiagnosticComposerCapabilities> => {
  const { data, error } = await supabase.rpc('rpc_teacher_diagnostic_composer', {
    p_school_id: schoolId,
    p_group_id: groupId,
  });

  if (error) {
    throw userFacingError(error, 'Diagnostic options could not be loaded.');
  }

  return data as DiagnosticComposerCapabilities;
};

export const composeDiagnostic = async (
  schoolId: string,
  groupId: string,
  questionCount: number,
): Promise<PreparedDiagnostic> => {
  const { data, error } = await supabase.rpc('rpc_teacher_compose_diagnostic', {
    p_school_id: schoolId,
    p_group_id: groupId,
    p_question_count: questionCount,
  });

  if (error) {
    throw userFacingError(error, 'The diagnostic could not be prepared.');
  }

  return data as PreparedDiagnostic;
};
