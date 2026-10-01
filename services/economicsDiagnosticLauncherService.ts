import { supabase } from './supabaseClient';
import { userFacingError } from './errorService';

export type DiagnosticPublishStatus = 'draft' | 'scheduled' | 'published';

export interface DiagnosticAoBreakdown {
  code: string;
  count: number;
}

export interface DiagnosticContentCoverage {
  strandCode: string;
  strandName: string;
  externalLabel?: string | null;
  questionCount: number;
}

export interface DiagnosticDifficultyBreakdown {
  level: 'easy' | 'medium' | 'hard' | string;
  count: number;
}

export interface EconomicsDiagnosticPreset {
  key: string;
  name: string;
  shortName: string;
  description: string;
  questionCount: number;
  estimatedMinutes: number;
  assignmentCategory: string;
  recommended: boolean;
  programmeCode?: string | null;
  paperComponent?: string | null;
  sourceVersion?: string | null;
  aoBreakdown: DiagnosticAoBreakdown[];
  contentCoverage: DiagnosticContentCoverage[];
  difficultyBreakdown: DiagnosticDifficultyBreakdown[];
}

export interface EconomicsDiagnosticLauncher {
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
  programme: {
    providerName: string;
    programmeCode: string;
    sourceVersion: string;
    paperComponent: string;
  };
  presets: EconomicsDiagnosticPreset[];
  evidenceContract: {
    brainsHeistVerifiedOnly: boolean;
    independentAssessment: boolean;
    targetedPractice: boolean;
    completionCreatesGovernedLongitudinalEvidence: boolean;
    gradePrediction: boolean;
  };
}

export interface CreateEconomicsDiagnosticInput {
  schoolId: string;
  groupId: string;
  presetKey: string;
  title?: string;
  publishStatus: DiagnosticPublishStatus;
  assignedAt?: string | null;
  dueAt?: string | null;
  notifyStudentsByEmail?: boolean;
  closeSubmissionsAfterDue?: boolean;
  clientTimezone?: string;
}

export interface CreateEconomicsDiagnosticResult {
  success: boolean;
  assignmentId: string;
  title: string;
  publishStatus: DiagnosticPublishStatus;
  presetKey: string;
  presetName: string;
  questionCount: number;
  studentCount: number;
  groupId: string;
  evidencePurpose: 'independent_assessment';
  targetedPractice: false;
}

export const fetchEconomicsDiagnosticLauncher = async (
  schoolId: string,
  groupId: string,
): Promise<EconomicsDiagnosticLauncher> => {
  const { data, error } = await supabase.rpc('rpc_teacher_registry_diagnostic_launcher', {
    p_school_id: schoolId,
    p_group_id: groupId,
  });

  if (error) {
    throw new Error(userFacingError(error, 'Economics diagnostic options could not be loaded.'));
  }

  return data as EconomicsDiagnosticLauncher;
};

export const createEconomicsDiagnostic = async (
  input: CreateEconomicsDiagnosticInput,
): Promise<CreateEconomicsDiagnosticResult> => {
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
    throw new Error(userFacingError(error, 'The diagnostic could not be created.'));
  }

  return data as CreateEconomicsDiagnosticResult;
};
