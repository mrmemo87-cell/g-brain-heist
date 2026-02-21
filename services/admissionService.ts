/**
 * Admission Hub Service
 * Handles all Supabase interactions for the admission testing system.
 * Uses the adm_* tables and rpc_adm_* RPCs created by ADM_SCHEMA_MIGRATION.sql / ADM_RPCS.sql.
 */

import { supabase } from './supabaseClient';

// ── Types ──

export type QuestionType =
  | 'mcq'
  | 'gap_fill'
  | 'error_correction'
  | 'sentence_transformation'
  | 'word_formation'
  | 'open_cloze'
  | 'reading_comprehension'
  | 'short_answer'
  | 'matching'
  | 'structured';

export type SubjectKey = 'english' | 'math' | 'science' | 'chemistry';

export const SUBJECT_META: Record<SubjectKey, { label: string; icon: string; color: string; poolFile: string; pools?: Record<number, string> }> = {
  english:   { label: 'English',   icon: '📖', color: 'cyan',    poolFile: 'english_stage9_pool.json', pools: { 7: 'english_stage7_pool.json', 8: 'english_stage8_pool.json', 9: 'english_stage9_pool.json' } },
  math:      { label: 'Mathematics', icon: '🔢', color: 'violet',  poolFile: 'math_stage9_pool.json' },
  science:   { label: 'Science',   icon: '🔬', color: 'emerald', poolFile: '' },
  chemistry: { label: 'Chemistry', icon: '⚗️', color: 'amber',   poolFile: '' },
};

export type QuestionStatus = 'draft' | 'published' | 'archived';
export type FormStatus = 'draft' | 'published' | 'closed';
export type CandidateStatus = 'registered' | 'testing' | 'completed' | 'placed';
export type AttemptStatus = 'in_progress' | 'submitted' | 'scored' | 'expired';
export type PlacementBand = 'A' | 'B' | 'C' | 'D' | 'E';
export type DeliveryMode = 'practice' | 'exam';

export interface AdmQuestionPool {
  id: string;
  school_id: string | null;
  subject: string;
  stage: number | null;
  grade_level: number | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmQuestion {
  id: string;
  pool_id: string;
  question_type: QuestionType;
  stem: string;
  stem_image_url: string | null;
  passage: string | null;
  options: any | null;
  correct_answer: any;
  correct_index: number | null;
  keyword: string | null;
  base_word: string | null;
  marks: number;
  difficulty: string;
  cognitive_level: string | null;
  topic: string | null;
  skill_tag: string | null;
  explanation: string | null;
  status: QuestionStatus;
  created_at: string;
  updated_at: string;
}

export interface AdmBlueprint {
  id: string;
  school_id: string | null;
  pool_id: string | null;
  name: string;
  subject: string;
  target_grade: number | null;
  target_stage: number | null;
  total_marks: number;
  duration_minutes: number;
  question_distribution: Record<string, any>;
  pass_percentage: number;
  delivery_mode: DeliveryMode;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmTestForm {
  id: string;
  blueprint_id: string;
  school_id: string;
  form_code: string;
  status: FormStatus;
  published_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmCandidate {
  id: string;
  school_id: string;
  full_name: string;
  email: string | null;
  parent_phone: string | null;
  applied_grade: number | null;
  token: string;
  status: CandidateStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmAttempt {
  id: string;
  candidate_id: string;
  form_id: string;
  school_id: string;
  started_at: string;
  submitted_at: string | null;
  expires_at: string;
  status: AttemptStatus;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  anti_cheat_flags: any;
  created_at: string;
}

export interface AdmPlacementResult {
  id: string;
  attempt_id: string;
  candidate_id: string;
  school_id: string;
  subject: string;
  band: PlacementBand;
  recommended_grade: number | null;
  recommended_stage: number | null;
  strengths: string[];
  weaknesses: string[];
  notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface CandidateReportAnswer {
  question_id: string;
  question_type: string;
  stem: string;
  topic: string | null;
  response: any;
  correct_answer: any;
  is_correct: boolean;
  marks_awarded: number;
  marks_possible: number;
  explanation: string | null;
  ai_feedback?: string | null;
}

export interface CandidateReport {
  candidate_name: string;
  form_code: string;
  total_score: number;
  max_score: number;
  percentage: number;
  band: PlacementBand;
  started_at: string;
  submitted_at: string;
  by_topic: Array<{ topic: string; correct: number; total: number; pct: number }>;
  by_type: Array<{ question_type: string; correct: number; total: number; pct: number }>;
  strengths: string[];
  weaknesses: string[];
  answers: CandidateReportAnswer[];
  ai_summary?: string | null;
}

export interface GradeStageMap {
  id: string;
  school_id: string;
  grade_level: string;
  cambridge_stage: string;
  subject: string;
}

// ── Question Pool CRUD ──

export async function fetchQuestionPools(schoolId: string): Promise<AdmQuestionPool[]> {
  const { data, error } = await supabase
    .from('adm_question_pools')
    .select('*')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createQuestionPool(
  pool: Pick<AdmQuestionPool, 'school_id' | 'subject' | 'stage' | 'name' | 'description' | 'grade_level'>
): Promise<AdmQuestionPool> {
  const { data, error } = await supabase
    .from('adm_question_pools')
    .insert(pool)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Question CRUD ──

export async function fetchQuestions(poolId: string): Promise<AdmQuestion[]> {
  const { data, error } = await supabase
    .from('adm_questions')
    .select('*')
    .eq('pool_id', poolId)
    .order('question_type')
    .order('difficulty');
  if (error) throw error;
  return data ?? [];
}

export async function bulkInsertQuestions(
  questions: Omit<AdmQuestion, 'id' | 'created_at'>[]
): Promise<number> {
  const { data, error } = await supabase
    .from('adm_questions')
    .insert(questions)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<Pick<AdmQuestion, 'stem' | 'options' | 'correct_answer' | 'explanation' | 'difficulty' | 'marks' | 'topic' | 'skill_tag' | 'status'>>
): Promise<void> {
  const { error } = await supabase
    .from('adm_questions')
    .update(updates)
    .eq('id', questionId);
  if (error) throw error;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from('adm_questions')
    .delete()
    .eq('id', questionId);
  if (error) throw error;
}

// ── Blueprint CRUD ──

export async function fetchBlueprints(schoolId: string): Promise<AdmBlueprint[]> {
  const { data, error } = await supabase
    .from('adm_blueprints')
    .select('*')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createBlueprint(
  bp: Omit<AdmBlueprint, 'id' | 'created_at' | 'updated_at'>
): Promise<AdmBlueprint> {
  const { data, error } = await supabase
    .from('adm_blueprints')
    .insert(bp)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBlueprint(
  bpId: string,
  updates: Partial<Pick<AdmBlueprint, 'name' | 'total_marks' | 'duration_minutes' | 'question_distribution' | 'delivery_mode' | 'pass_percentage' | 'is_active'>>
): Promise<void> {
  const { error } = await supabase
    .from('adm_blueprints')
    .update(updates)
    .eq('id', bpId);
  if (error) throw error;
}

export async function deleteBlueprint(bpId: string): Promise<void> {
  const { error } = await supabase.from('adm_blueprints').delete().eq('id', bpId);
  if (error) throw error;
}

export async function deleteTestForm(formId: string): Promise<void> {
  // Delete form questions first
  await supabase.from('adm_test_form_questions').delete().eq('form_id', formId);
  const { error } = await supabase.from('adm_test_forms').delete().eq('id', formId);
  if (error) throw error;
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  // Delete related answers, attempts first
  const { data: attemptIds } = await supabase.from('adm_attempts').select('id').eq('candidate_id', candidateId);
  if (attemptIds?.length) {
    for (const a of attemptIds) {
      await supabase.from('adm_answers').delete().eq('attempt_id', a.id);
    }
  }
  await supabase.from('adm_placement_results').delete().eq('candidate_id', candidateId);
  await supabase.from('adm_attempts').delete().eq('candidate_id', candidateId);
  const { error } = await supabase.from('adm_candidates').delete().eq('id', candidateId);
  if (error) throw error;
}

export async function deleteAttempt(attemptId: string): Promise<void> {
  await supabase.from('adm_answers').delete().eq('attempt_id', attemptId);
  await supabase.from('adm_placement_results').delete().eq('attempt_id', attemptId);
  const { error } = await supabase.from('adm_attempts').delete().eq('id', attemptId);
  if (error) throw error;
}

// ── Test Form CRUD + RPCs ──

export async function fetchTestForms(schoolId: string): Promise<AdmTestForm[]> {
  const { data, error } = await supabase
    .from('adm_test_forms')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function generateTestForm(blueprintId: string, formCode: string): Promise<{ success: boolean; form_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_generate_test_form', {
    p_blueprint_id: blueprintId,
    p_form_code: formCode,
  });
  if (error) return { success: false, error: error.message };
  return data;
}

export async function publishForm(formId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_publish_form', {
    p_form_id: formId,
  });
  if (error) return { success: false, error: error.message };
  return data;
}

export async function closeForm(formId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_close_form', {
    p_form_id: formId,
  });
  if (error) return { success: false, error: error.message };
  return data;
}

// ── Candidate CRUD ──

export async function fetchCandidates(schoolId: string): Promise<AdmCandidate[]> {
  const { data, error } = await supabase
    .from('adm_candidates')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCandidate(
  candidate: Pick<AdmCandidate, 'school_id' | 'full_name' | 'email' | 'parent_phone' | 'applied_grade' | 'notes'>
): Promise<AdmCandidate> {
  const { data, error } = await supabase
    .from('adm_candidates')
    .insert(candidate)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreateCandidates(
  candidates: Pick<AdmCandidate, 'school_id' | 'full_name' | 'email' | 'parent_phone' | 'applied_grade' | 'notes'>[]
): Promise<AdmCandidate[]> {
  const { data, error } = await supabase
    .from('adm_candidates')
    .insert(candidates)
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updateCandidate(
  candidateId: string,
  updates: Partial<Pick<AdmCandidate, 'full_name' | 'email' | 'parent_phone' | 'applied_grade' | 'status' | 'notes'>>
): Promise<void> {
  const { error } = await supabase
    .from('adm_candidates')
    .update(updates)
    .eq('id', candidateId);
  if (error) throw error;
}

// ── Attempt / Report RPCs ──

export async function fetchAttempts(schoolId: string): Promise<AdmAttempt[]> {
  const { data, error } = await supabase
    .from('adm_attempts')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCandidateReport(attemptId: string): Promise<CandidateReport | null> {
  const { data, error } = await supabase.rpc('rpc_adm_get_candidate_report', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  if (!data || !data.success) return null;

  // Transform RPC shape → CandidateReport shape
  const raw = data as any;
  return {
    candidate_name: raw.candidate?.name ?? 'Unknown',
    form_code: raw.form_code ?? '',
    total_score: raw.attempt?.total_score ?? 0,
    max_score: raw.attempt?.max_score ?? 0,
    percentage: raw.attempt?.percentage ?? 0,
    band: raw.band ?? 'E',
    started_at: raw.attempt?.started_at ?? '',
    submitted_at: raw.attempt?.submitted_at ?? '',
    by_topic: (raw.topic_breakdown ?? []).map((t: any) => ({
      topic: t.topic,
      correct: t.correct,
      total: t.total,
      pct: t.percentage ?? t.pct ?? 0,
    })),
    by_type: (raw.type_breakdown ?? []).map((t: any) => ({
      question_type: t.type ?? t.question_type,
      correct: t.correct,
      total: t.total,
      pct: t.max_marks ? Math.round((t.marks / t.max_marks) * 100) : 0,
    })),
    strengths: raw.strengths ?? [],
    weaknesses: raw.weaknesses ?? [],
    answers: (raw.answers ?? []).map((a: any) => ({
      question_id: a.question_id,
      question_type: a.question_type,
      stem: a.stem,
      topic: a.topic,
      response: a.response,
      correct_answer: a.correct_answer,
      is_correct: a.is_correct,
      marks_awarded: a.marks_awarded ?? 0,
      marks_possible: a.marks_possible ?? 0,
      explanation: a.explanation,
      ai_feedback: a.ai_feedback ?? null,
    })),
    ai_summary: raw.ai_summary ?? null,
  };
}

// ── Placement ──

export async function fetchPlacementResults(schoolId: string): Promise<AdmPlacementResult[]> {
  const { data, error } = await supabase
    .from('adm_placement_results')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function recordPlacement(
  attemptId: string,
  band: PlacementBand,
  stage: number | null,
  grade: number | null,
  notes: string | null
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_record_placement', {
    p_attempt_id: attemptId,
    p_band: band,
    p_recommended_stage: stage,
    p_recommended_grade: grade,
    p_notes: notes,
  });
  if (error) return { success: false, error: error.message };
  return data;
}

// ── Grade-Stage Mapping ──

export async function fetchGradeStageMap(schoolId: string): Promise<GradeStageMap[]> {
  const { data, error } = await supabase
    .from('adm_school_grade_stage_map')
    .select('*')
    .eq('school_id', schoolId)
    .order('grade_level');
  if (error) throw error;
  return data ?? [];
}

export async function upsertGradeStageMap(
  mapping: Pick<GradeStageMap, 'school_id' | 'grade_level' | 'cambridge_stage' | 'subject'>
): Promise<void> {
  const { error } = await supabase
    .from('adm_school_grade_stage_map')
    .upsert(mapping, { onConflict: 'school_id,grade_level,subject' });
  if (error) throw error;
}

// ── Entitlement check ──

export async function checkAdmissionEntitlement(): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  const { data, error } = await supabase.rpc('rpc_adm_check_entitlement');
  if (error) return { allowed: false, reason: error.message };
  return data;
}

export async function consumeAdmissionQuota(): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_consume_quota');
  if (error) return { success: false, error: error.message };
  return data;
}

// ── Import staging ──

export async function fetchImportStaging(schoolId: string, batchRef?: string) {
  let query = supabase
    .from('adm_import_staging')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (batchRef) query = query.eq('batch_ref', batchRef);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Audit log ──

export async function fetchAuditLog(schoolId: string, limit = 50) {
  const { data, error } = await supabase
    .from('adm_audit_log')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ── Utility: generate a token-based test link ──

export function buildTestLink(baseUrl: string, token: string, formCode: string): string {
  return `${baseUrl}/admission-tests/admission-test.html?token=${encodeURIComponent(token)}&form=${encodeURIComponent(formCode)}`;
}

// ── Pool JSON loader (offline mode / demo) ──

export async function loadPoolFromJson(url: string): Promise<{ pool_metadata: any; questions: any[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load pool: ${res.statusText}`);
  return res.json();
}
