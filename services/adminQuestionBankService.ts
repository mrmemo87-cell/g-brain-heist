import { supabase } from './supabaseClient';

export type AdminQuestionPool = 'verified' | 'teacher' | 'archive';
export type AdminQuestionStatusFilter = 'all' | 'active' | 'inactive' | 'visual' | 'needs_attention' | 'high_usage';

export interface AdminQuestionBankSummary {
  totalQuestions: number;
  verifiedQuestions: number;
  teacherQuestions: number;
  archivedQuestions: number;
  visualQuestions: number;
  teacherAuthors: number;
  teacherSchools: number;
  needsAttention: number;
}

export interface AdminQuestionBankFilterOption {
  name: string;
  count: number;
}

export interface AdminQuestionBankSchoolOption extends AdminQuestionBankFilterOption {
  id: string;
}

export interface AdminQuestionTeacherProvenance {
  teacherId: string;
  userId?: string | null;
  name: string;
  avatarUrl?: string | null;
  verified: boolean;
  profileLinked: boolean;
  schoolId?: string | null;
  schoolName: string;
  schoolLogoUrl?: string | null;
  schoolStatus?: string | null;
}

export interface AdminQuestionBankQuestion {
  id: string;
  pool: AdminQuestionPool;
  subject: string;
  topic: string;
  difficulty: string;
  questionText: string;
  questionType: string;
  options?: Array<string | { text?: string; image_url?: string }>;
  correctAnswer: string;
  explanation?: string | null;
  imageUrl?: string | null;
  imageAltText?: string | null;
  gradeLevel?: string | null;
  eligibleGradeLevels?: number[];
  curriculum?: {
    strand?: string | null;
    skill?: string | null;
    subskill?: string | null;
    objective?: string | null;
    reviewStatus?: string | null;
  };
  verificationStatus?: string | null;
  analyticsEligible: boolean;
  integrityState: 'sealed' | 'drift' | 'classroom' | 'retired';
  needsAttention: boolean;
  isPublic: boolean;
  isActive: boolean;
  timesAnswered: number;
  timesCorrect: number;
  accuracyPercent?: number | null;
  contentVersion?: string | null;
  contentRevision?: number | null;
  externalId?: string | null;
  verifiedByAuthority?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  teacher?: AdminQuestionTeacherProvenance | null;
}

export interface AdminQuestionBankCatalog {
  summary: AdminQuestionBankSummary;
  filters: {
    subjects: AdminQuestionBankFilterOption[];
    schools: AdminQuestionBankSchoolOption[];
  };
  pool: AdminQuestionPool;
  total: number;
  limit: number;
  offset: number;
  questions: AdminQuestionBankQuestion[];
}

export interface AdminQuestionBankQuery {
  pool: AdminQuestionPool;
  search?: string;
  subject?: string;
  schoolId?: string;
  status?: AdminQuestionStatusFilter;
  limit?: number;
  offset?: number;
}

export type AdminTaxonomyReviewStatus =
  | 'all'
  | 'in_review'
  | 'approved'
  | 'returned'
  | 'retired'
  | 'superseded';

export type AdminTaxonomyDecision = 'approve' | 'return' | 'retire' | 'supersede';
export type AdminTaxonomyConfidenceBand = 'all' | 'low' | 'medium' | 'high';
export type AdminAssessmentProcessCode = 'AO1' | 'AO2' | 'AO3' | 'AO4';

export interface AdminTaxonomyReviewCursor {
  createdAt: string;
  id: string;
}

export interface AdminTaxonomyObjectiveOption {
  curriculumMappingId: string;
  frameworkCode: string;
  frameworkVersionCode: string;
  frameworkVersionName: string;
  scopeCode: string;
  scopeName: string;
  objectiveCode: string;
  objectiveStatement: string;
  mappingRole: string;
  confidenceScore: number;
}

export interface AdminTaxonomyReviewItem {
  id: string;
  status: Exclude<AdminTaxonomyReviewStatus, 'all'>;
  sourceEligible: boolean;
  mappingDrift: boolean;
  hasActiveTaxonomy: boolean;
  proposalPrimaryCurrent: boolean;
  exactApprovalEligible: boolean;
  question: {
    id: string;
    externalId?: string | null;
    subject: string;
    topic?: string | null;
    difficulty?: string | null;
    questionText: string;
    questionType: string;
    options?: Array<string | { text?: string; image_url?: string }>;
    correctAnswer: string;
    explanation?: string | null;
    imageUrl?: string | null;
    imageAltText?: string | null;
    gradeLevel?: string | null;
    eligibleGradeLevels?: number[];
    verificationStatus: string;
    isActive: boolean;
  };
  proposal: {
    id: string;
    proposalKey: string;
    proposalHash: string;
    assessmentItemId: string;
    curriculumMappingId: string;
    frameworkCode: string;
    frameworkVersionCode: string;
    scopeCode: string;
    objectiveCode: string;
    objectiveStatement: string;
    packageVersion: string;
    taxonomyVersion: string;
    primarySkillCode: string;
    primarySkillName: string;
    atomicSubskillCode: string;
    atomicSubskillName: string;
    assessmentProcessCode: AdminAssessmentProcessCode;
    assessmentProcessName: string;
    assessmentProcessDefinition: string;
    cognitiveProcess: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';
    evidenceStatement: string;
    secondarySkillCodes: string[];
    confidenceScore: number;
    reviewReason: string;
    sourceLifecycleStatus: 'verified' | 'retired';
    sourceArtifact: string;
    createdAt: string;
  };
  objectiveOptions: AdminTaxonomyObjectiveOption[];
  decision?: {
    id: string;
    decision: AdminTaxonomyDecision;
    rationale: string;
    decidedBy: string;
    decidedByAuthority: string;
    resultingTaxonomyId?: string | null;
    decidedAt: string;
  } | null;
  decisionHistory: Array<{
    id: string;
    previousDecisionId?: string | null;
    decision: AdminTaxonomyDecision;
    rationale: string;
    decidedBy: string;
    decidedByAuthority: string;
    resultingTaxonomyId?: string | null;
    decidedAt: string;
  }>;
}

export interface AdminTaxonomyReviewCatalog {
  summary: {
    total: number;
    inReview: number;
    approved: number;
    returned: number;
    retired: number;
    superseded: number;
    sourceBlocked: number;
    mappingDrift: number;
  };
  filters: {
    subjects: AdminQuestionBankFilterOption[];
    assessmentProcesses: Array<{ code: AdminAssessmentProcessCode; count: number }>;
  };
  total: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: AdminTaxonomyReviewCursor | null;
  items: AdminTaxonomyReviewItem[];
}

export interface AdminTaxonomyReviewQuery {
  status?: AdminTaxonomyReviewStatus;
  search?: string;
  subject?: string;
  assessmentProcessCode?: AdminAssessmentProcessCode | '';
  confidenceBand?: AdminTaxonomyConfidenceBand;
  limit?: number;
  cursor?: AdminTaxonomyReviewCursor | null;
}

export interface AdminTaxonomyReplacement {
  curriculumMappingId: string;
  primarySkillCode: string;
  primarySkillName: string;
  atomicSubskillCode: string;
  atomicSubskillName: string;
  assessmentProcessCode: AdminAssessmentProcessCode;
  cognitiveProcess: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';
  evidenceStatement: string;
  secondarySkillCodes: string[];
  confidenceScore: number;
}

export interface AdminTaxonomyDecisionResult {
  success: true;
  reviewItemId: string;
  decision: AdminTaxonomyDecision;
  status: Exclude<AdminTaxonomyReviewStatus, 'all' | 'in_review'>;
  resultingTaxonomyId?: string | null;
  decidedAt: string;
}

const EMPTY_SUMMARY: AdminQuestionBankSummary = {
  totalQuestions: 0,
  verifiedQuestions: 0,
  teacherQuestions: 0,
  archivedQuestions: 0,
  visualQuestions: 0,
  teacherAuthors: 0,
  teacherSchools: 0,
  needsAttention: 0,
};

export async function loadSuperadminQuestionBank(query: AdminQuestionBankQuery): Promise<AdminQuestionBankCatalog> {
  const { data, error } = await supabase.rpc('rpc_superadmin_question_bank_inspector', {
    p_pool: query.pool,
    p_search: query.search?.trim() || null,
    p_subject: query.subject || null,
    p_school_id: query.schoolId || null,
    p_status: query.status || 'all',
    p_limit: query.limit || 24,
    p_offset: query.offset || 0,
  });

  if (error) {
    if (error.message.includes('platform_superadmin_access_required')) {
      throw new Error('This question-bank inspector is restricted to the platform superadmin.');
    }
    throw new Error(error.message || 'The question bank could not be loaded.');
  }

  const result = data as Partial<AdminQuestionBankCatalog> & { success?: boolean; error?: string } | null;
  if (!result?.success) throw new Error(result?.error || 'The question bank returned an invalid response.');

  return {
    summary: { ...EMPTY_SUMMARY, ...(result.summary || {}) },
    filters: {
      subjects: result.filters?.subjects || [],
      schools: result.filters?.schools || [],
    },
    pool: result.pool || query.pool,
    total: Number(result.total || 0),
    limit: Number(result.limit || query.limit || 24),
    offset: Number(result.offset || query.offset || 0),
    questions: result.questions || [],
  };
}

const taxonomyReviewError = (message?: string) => {
  const value = message || '';
  if (value.includes('platform_superadmin_access_required')) {
    return new Error('This taxonomy review workspace is restricted to the platform superadmin.');
  }
  if (value.includes('taxonomy_review_already_decided')) {
    return new Error('Another reviewer has already completed this item. Refresh the queue to see the final decision.');
  }
  if (value.includes('taxonomy_review_already_returned')) {
    return new Error('This item is already returned. Approve, supersede or retire it after the correction is ready.');
  }
  if (value.includes('taxonomy_review_source_no_longer_eligible')) {
    return new Error('This question changed or was retired after import. It can no longer be approved.');
  }
  if (value.includes('taxonomy_review_requires_supersede')) {
    return new Error('This question already has an approved taxonomy. Use Supersede to create a reviewed successor.');
  }
  if (value.includes('taxonomy_approval_mapping_no_longer_current')
      || value.includes('taxonomy_supersede_mapping_not_approved')) {
    return new Error('The selected objective mapping is no longer current. Refresh the queue and choose an approved objective.');
  }
  if (value.includes('taxonomy_review_rationale_required')) {
    return new Error('Add a clear decision rationale of at least 20 characters.');
  }
  if (value.includes('taxonomy_supersede_requires_a_correction')) {
    return new Error('Change at least one taxonomy field before superseding this proposal.');
  }
  if (value.includes('invalid_taxonomy_secondary_skill_codes')
      || value.includes('secondary_skill_codes_array_required')) {
    return new Error('Secondary skill codes must be unique governed dotted codes and cannot repeat the primary skill or atomic subskill.');
  }
  return new Error('The taxonomy review request could not be completed safely. Refresh and try again.');
};

const EMPTY_TAXONOMY_SUMMARY: AdminTaxonomyReviewCatalog['summary'] = {
  total: 0,
  inReview: 0,
  approved: 0,
  returned: 0,
  retired: 0,
  superseded: 0,
  sourceBlocked: 0,
  mappingDrift: 0,
};

export async function loadSuperadminQuestionTaxonomyReviewQueue(
  query: AdminTaxonomyReviewQuery = {},
): Promise<AdminTaxonomyReviewCatalog> {
  const { data, error } = await supabase.rpc('rpc_superadmin_question_taxonomy_review_queue', {
    p_status: query.status || 'in_review',
    p_search: query.search?.trim() || null,
    p_subject: query.subject || null,
    p_assessment_process_code: query.assessmentProcessCode || null,
    p_confidence_band: query.confidenceBand || 'all',
    p_limit: query.limit || 20,
    p_after_created_at: query.cursor?.createdAt || null,
    p_after_id: query.cursor?.id || null,
  });

  if (error) throw taxonomyReviewError(error.message);
  const result = data as Partial<AdminTaxonomyReviewCatalog> & { success?: boolean } | null;
  if (!result?.success) throw new Error('The taxonomy review queue returned an invalid response.');

  return {
    summary: { ...EMPTY_TAXONOMY_SUMMARY, ...(result.summary || {}) },
    filters: {
      subjects: result.filters?.subjects || [],
      assessmentProcesses: result.filters?.assessmentProcesses || [],
    },
    total: Number(result.total || 0),
    limit: Number(result.limit || query.limit || 20),
    hasMore: Boolean(result.hasMore),
    nextCursor: result.nextCursor || null,
    items: result.items || [],
  };
}

export async function decideSuperadminQuestionTaxonomyReview(input: {
  reviewItemId: string;
  decision: AdminTaxonomyDecision;
  rationale: string;
  replacement?: AdminTaxonomyReplacement | null;
}): Promise<AdminTaxonomyDecisionResult> {
  const { data, error } = await supabase.rpc('rpc_superadmin_decide_question_taxonomy_review', {
    p_review_item_id: input.reviewItemId,
    p_decision: input.decision,
    p_rationale: input.rationale.trim(),
    p_replacement: input.decision === 'supersede' ? input.replacement || null : null,
  });

  if (error) throw taxonomyReviewError(error.message);
  const result = data as AdminTaxonomyDecisionResult | null;
  if (!result?.success) throw new Error('The taxonomy decision returned an invalid response.');
  return result;
}
