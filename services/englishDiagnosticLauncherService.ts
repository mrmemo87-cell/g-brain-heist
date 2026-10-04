import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type EnglishDiagnosticPublishStatus = 'draft' | 'scheduled' | 'published';

export interface EnglishDiagnosticDifficulty {
  level: 'easy' | 'medium' | 'hard' | string;
  count: number;
}

export interface EnglishDiagnosticPreset {
  key: string;
  name: string;
  shortName: string;
  description: string;
  questionCount: number;
  estimatedMinutes: number;
  assignmentCategory: string;
  recommended: boolean;
  freshForm: boolean;
  coverageNote?: string | null;
  notDirectlyAssessed: string[];
  difficultyBreakdown: EnglishDiagnosticDifficulty[];
  answerBalance: {
    enabled: boolean;
    maxPositionSpread: number;
    maxConsecutiveSamePosition: number;
  };
}

export interface EnglishDiagnosticLauncher {
  success: boolean;
  group: {
    id: string;
    name: string;
    gradeLevel: string;
    studentCount: number;
    schoolSubjectId: string;
    schoolSubjectName: string;
    academicSubjectId: string;
    academicSubjectCode: string;
    academicSubjectName: string;
    academicYearId: string;
  };
  registry: {
    id: string;
    code: string;
    subjectKey: string;
    title: string;
  };
  presets: EnglishDiagnosticPreset[];
  evidenceContract: {
    brainsHeistVerifiedOnly: boolean;
    independentAssessment: boolean;
    targetedPractice: boolean;
    completionCreatesGovernedLongitudinalEvidence: boolean;
    languageUseDiagnostic: boolean;
    speakingDirectlyAssessed: boolean;
    listeningDirectlyAssessed: boolean;
    extendedWritingDirectlyAssessed: boolean;
  };
}

export interface CreateEnglishDiagnosticInput {
  schoolId: string;
  groupId: string;
  presetKey: string;
  title?: string;
  publishStatus: EnglishDiagnosticPublishStatus;
  assignedAt?: string | null;
  dueAt?: string | null;
  notifyStudentsByEmail?: boolean;
  closeSubmissionsAfterDue?: boolean;
  clientTimezone?: string;
}

export interface CreateEnglishDiagnosticResult {
  success: boolean;
  assignmentId: string;
  title: string;
  publishStatus: EnglishDiagnosticPublishStatus;
  presetKey: string;
  presetName: string;
  questionCount: number;
  studentCount: number;
  groupId: string;
  evidencePurpose: 'independent_assessment';
  targetedPractice: false;
  freshForm: boolean;
  answerPositionBalanced: boolean;
}

export const fetchEnglishDiagnosticLauncher = async (
  schoolId: string,
  groupId: string,
): Promise<EnglishDiagnosticLauncher> => {
  const { data, error } = await supabase.rpc('rpc_teacher_english_diagnostic_launcher', {
    p_school_id: schoolId,
    p_group_id: groupId,
  });

  if (error) {
    throw userFacingError(error, 'English diagnostic options could not be loaded.');
  }

  return data as EnglishDiagnosticLauncher;
};

export const createEnglishDiagnostic = async (
  input: CreateEnglishDiagnosticInput,
): Promise<CreateEnglishDiagnosticResult> => {
  const { data, error } = await supabase.rpc('rpc_teacher_create_registry_diagnostic', {
    p_school_id: input.schoolId,
    p_group_id: input.groupId,
    p_preset_key: input.presetKey,
    p_title: input.title?.trim() || null,
    p_publish_status: input.publishStatus,
    p_assigned_at: input.assignedAt || null,
    p_due_at: input.dueAt || null,
    p_notify_students_by_email: input.notifyStudentsByEmail ?? false,
    p_close_submissions_after_due: input.closeSubmissionsAfterDue ?? true,
    p_client_timezone: input.clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });

  if (error) {
    throw userFacingError(error, 'The English diagnostic could not be created.');
  }

  return data as CreateEnglishDiagnosticResult;
};
