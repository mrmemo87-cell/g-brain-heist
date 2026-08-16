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
