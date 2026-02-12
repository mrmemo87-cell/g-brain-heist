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
  | 'matching';

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
  stage: string;
  label: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface AdmQuestion {
  id: string;
  pool_id: string;
  external_id: string;
  question_type: QuestionType;
  stem: string;
  options: any | null;
  correct_answer: string;
  explanation: string | null;
  difficulty: string;
  marks: number;
  topic: string | null;
  skill_tag: string | null;
  cognitive_level: string | null;
  image_url: string | null;
  status: QuestionStatus;
  metadata: Record<string, any>;
  created_at: string;
}

export interface AdmBlueprint {
  id: string;
  school_id: string;
  pool_id: string;
  label: string;
  total_marks: number;
  duration_minutes: number;
  question_distribution: Record<string, number>;
  delivery_mode: DeliveryMode;
  pass_threshold: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface AdmTestForm {
  id: string;
  blueprint_id: string;
  school_id: string;
  form_code: string;
  status: FormStatus;
  opens_at: string | null;
  closes_at: string | null;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
}

export interface AdmCandidate {
  id: string;
  school_id: string;
  full_name: string;
  email: string | null;
  dob: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  token: string;
  status: CandidateStatus;
  metadata: Record<string, any>;
  created_at: string;
}

export interface AdmAttempt {
  id: string;
  candidate_id: string;
  form_id: string;
  started_at: string;
  submitted_at: string | null;
  expires_at: string;
  status: AttemptStatus;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  band: PlacementBand | null;
  anti_cheat_flags: Record<string, any>;
  created_at: string;
}

export interface AdmPlacementResult {
  id: string;
  attempt_id: string;
  candidate_id: string;
  school_id: string;
  band: PlacementBand;
  percentage: number;
  recommended_stage: string | null;
  recommended_grade: string | null;
  strengths: string[];
  weaknesses: string[];
  teacher_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
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
  pool: Pick<AdmQuestionPool, 'school_id' | 'subject' | 'stage' | 'label' | 'metadata'>
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
    .order('external_id');
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
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createBlueprint(
  bp: Omit<AdmBlueprint, 'id' | 'created_at'>
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
  updates: Partial<Pick<AdmBlueprint, 'label' | 'total_marks' | 'duration_minutes' | 'question_distribution' | 'delivery_mode' | 'pass_threshold'>>
): Promise<void> {
  const { error } = await supabase
    .from('adm_blueprints')
    .update(updates)
    .eq('id', bpId);
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
  candidate: Pick<AdmCandidate, 'school_id' | 'full_name' | 'email' | 'dob' | 'guardian_name' | 'guardian_phone' | 'metadata'>
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
  candidates: Pick<AdmCandidate, 'school_id' | 'full_name' | 'email' | 'dob' | 'guardian_name' | 'guardian_phone' | 'metadata'>[]
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
  updates: Partial<Pick<AdmCandidate, 'full_name' | 'email' | 'dob' | 'guardian_name' | 'guardian_phone' | 'status' | 'metadata'>>
): Promise<void> {
  const { error } = await supabase
    .from('adm_candidates')
    .update(updates)
    .eq('id', candidateId);
  if (error) throw error;
}

// ── Attempt / Report RPCs ──

export async function fetchAttempts(schoolId: string): Promise<AdmAttempt[]> {
  // Attempts link candidate -> form; we join through candidates belonging to this school
  const { data, error } = await supabase
    .from('adm_attempts')
    .select('*, adm_candidates!inner(school_id)')
    .eq('adm_candidates.school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { adm_candidates, ...attempt } = row;
    return attempt as AdmAttempt;
  });
}

export async function getCandidateReport(attemptId: string): Promise<CandidateReport | null> {
  const { data, error } = await supabase.rpc('rpc_adm_get_candidate_report', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
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
  stage: string | null,
  grade: string | null,
  notes: string | null
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_record_placement', {
    p_attempt_id: attemptId,
    p_band: band,
    p_recommended_stage: stage,
    p_recommended_grade: grade,
    p_teacher_notes: notes,
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
