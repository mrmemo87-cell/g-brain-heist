/**
 * Admission Hub Service
 * Handles all Supabase interactions for the admission testing system.
 * Uses the adm_* tables and rpc_adm_* RPCs created by ADM_SCHEMA_MIGRATION.sql / ADM_RPCS.sql.
 */

import { supabase } from './supabaseClient';
import { calculateDiagnosticBreakdown, calculatePlacementRecommendation, deriveAdmissionSubject, type AcademicProfile, type DiagnosticBreakdownRow, type PlacementRecommendation } from '../src/lib/admissionPlacementIntelligence';

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

export type SubjectKey = 'english' | 'math' | 'maths' | 'science' | 'chemistry';

export const SUBJECT_META: Record<SubjectKey, { label: string; icon: string; color: string; poolFile: string; pools?: Record<number, string> }> = {
  english:   { label: 'English',   icon: '📖', color: 'cyan',    poolFile: 'english_stage9_pool.json', pools: { 7: 'english_stage7_pool.json', 8: 'english_stage8_pool.json', 9: 'english_stage9_pool.json' } },
  math:      { label: 'Mathematics', icon: '🔢', color: 'violet',  poolFile: 'math_stage9_pool.json' },
  maths:     { label: 'Mathematics', icon: '🔢', color: 'violet',  poolFile: 'math_stage9_pool.json' },
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
  is_official?: boolean;
  is_locked?: boolean;
  content_owner?: string | null;
  content_version?: string | null;
  source_label?: string | null;
  placement_band?: 'foundation' | 'target' | 'stretch' | null;
  stage_level?: number | null;
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
  diagnostic_skill?: string | null;
  stage_level?: number | null;
  grade_level?: number | null;
  placement_band?: 'foundation' | 'target' | 'stretch' | null;
  strand?: string | null;
  subskill?: string | null;
  estimated_seconds?: number | null;
  writing_rubric?: any | null;
  reading_passage_id?: string | null;
  is_official?: boolean;
  is_locked?: boolean;
  content_owner?: string | null;
  content_version?: string | null;
  source_label?: string | null;
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
  is_official?: boolean;
  is_locked?: boolean;
  content_owner?: string | null;
  content_version?: string | null;
  source_label?: string | null;
  placement_band?: 'foundation' | 'target' | 'stretch' | null;
  stage_level?: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmTestForm {
  id: string;
  blueprint_id: string;
  school_id: string;
  form_code: string;
  form_label?: string;
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
  current_grade?: number | null;
  date_of_birth?: string | null;
  previous_curriculum?: string | null;
  previous_school_language?: string | null;
  home_language?: string | null;
  years_english_medium?: number | null;
  admin_notes?: string | null;
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
  id?: string | null;
  answer_id?: string | null;
  question_id: string;
  question_type: string;
  stem: string;
  topic: string | null;
  subject?: string | null;
  diagnostic_skill?: string | null;
  strand?: string | null;
  subskill?: string | null;
  skill_tag?: string | null;
  difficulty?: string | null;
  grade_level?: number | null;
  stage_level?: number | null;
  content_version?: string | null;
  form_code?: string | null;
  response: any;
  correct_answer: any;
  options?: any | null;
  is_correct: boolean | null;
  marks_awarded: number;
  marks_possible: number;
  explanation: string | null;
  ai_feedback?: string | null;
}

export interface CandidateReport {
  candidate_name: string;
  form_code: string;
  formCode?: string;
  formSubject?: string | null;
  subject?: string | null;
  formTitle?: string;
  grade?: number | null;
  form_label?: string;
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
  candidate_profile?: AcademicProfile;
  diagnostic_breakdown?: DiagnosticBreakdownRow[];
  placement_recommendation?: PlacementRecommendation;
  skill_breakdown?: any[];
  difficulty_breakdown?: any[];
  activity_notes?: string[];
  activity_events?: AdmCandidateTestEvent[];
  answered_count?: number;
  total_questions?: number;
  partial_attempt?: boolean;
  answered_question_accuracy?: number | null;
  answer_details_available?: boolean;
  answer_detail_message?: string | null;
}

export interface AdmCandidateTestEvent {
  event_type: string;
  event_payload: Record<string, unknown>;
  created_at: string;
}

export interface GradeStageMap {
  id: string;
  school_id: string;
  grade_level: string;
  cambridge_stage: string;
  subject: string;
}


export const admissionSubjectLabel = (subject?: string | null, formCode?: string | null, contentVersion?: string | null) => {
  const normalized = deriveAdmissionSubject(subject, formCode, contentVersion);
  if (normalized === 'math') return 'Maths';
  if (normalized === 'english') return 'English';
  if (normalized === 'science') return 'Science';
  return 'General';
};

export const buildAdmissionReportFormLabel = (formCode?: string | null, grade?: number | null, subject?: string | null) => {
  const label = admissionSubjectLabel(subject, formCode);
  const codeGrade = Number(String(formCode || '').match(/(?:ENG|MAT|SCI|G|GRADE)(\d{1,2})/i)?.[1] || '');
  const inferredGrade = grade ?? (codeGrade || null);
  const gradeText = inferredGrade ? `Grade ${inferredGrade}` : 'Admission';
  return `${gradeText} ${label} Admission Test`;
};

const ACTIVITY_LABELS: Record<string, string> = {
  page_opened: 'Page opened',
  page_reopened: 'Page reopened',
  page_reload: 'Page refreshed/reloaded',
  tab_hidden: 'Candidate left the test page',
  tab_visible: 'Candidate returned to the test page',
  submit_clicked: 'Submit button clicked',
  submitted: 'Test submitted',
  submit_time_expired: 'Timer expired',
  auto_submit_repeated_page_exits: 'Test auto-submitted after repeated page exits',
};

const pluralTimes = (count: number) => `${count} time${count === 1 ? '' : 's'}`;

export function buildAdmissionActivityNotes(events: AdmCandidateTestEvent[] = [], submittedAt?: string | null): string[] {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.event_type, (counts.get(event.event_type) || 0) + 1);
  const notes: string[] = [];
  const hasAutoSubmit = counts.has('auto_submit_repeated_page_exits');
  for (const type of ['page_opened','page_reopened','page_reload','tab_hidden','tab_visible','submit_clicked','submit_time_expired']) {
    const count = counts.get(type) || 0;
    if (count > 0) notes.push(`${ACTIVITY_LABELS[type]} ${pluralTimes(count)}`);
  }
  if (hasAutoSubmit) notes.push(ACTIVITY_LABELS['auto_submit_repeated_page_exits'] + '.');
  else if ((counts.get('submitted') || 0) > 0) notes.push(ACTIVITY_LABELS['submitted'] + '.');
  if (submittedAt) notes.push(`Submitted at ${new Date(submittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  return [...new Set(notes)];
}

export function dedupeAdmissionFocusAreas(items: string[] = [], breakdown: DiagnosticBreakdownRow[] = [], weakestFirst = false): string[] {
  const scoreBy = new Map(breakdown.map(r => [`${r.subject} ${r.skill}`.toLowerCase(), r.percentage]));
  const seen = new Set<string>();
  const unique = items.filter(item => { const key = item.trim().toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  if (!weakestFirst) return unique;
  return unique.sort((a,b) => (scoreBy.get(a.toLowerCase()) ?? 999) - (scoreBy.get(b.toLowerCase()) ?? 999));
}

export function isObjectiveAutoScoredAdmissionReport(report: Pick<CandidateReport, 'answers' | 'diagnostic_breakdown'>): boolean {
  const manualTypes = new Set(['email_writing','essay_writing']);
  const openReviewTypes = new Set(['short_answer','structured']);
  return (report.answers ?? []).every(a => !manualTypes.has(a.question_type) && !openReviewTypes.has(a.question_type));
}

// ── Question Pool CRUD ──

export async function fetchQuestionPools(schoolId: string): Promise<AdmQuestionPool[]> {
  const { data, error } = await supabase
    .from('adm_question_pools')
    .select('*')
    .or(`school_id.eq.${schoolId},school_id.is.null,is_official.eq.true`)
    .order('is_official', { ascending: false })
    .order('stage', { ascending: true, nullsFirst: false })
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

export async function generateTestForm(blueprintId: string, formCode?: string | null): Promise<{ success: boolean; form_id?: string; form_code?: string; idempotent?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_generate_test_form', {
    p_blueprint_id: blueprintId,
    p_form_code: formCode ?? null,
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
  candidate: Pick<AdmCandidate, 'school_id' | 'full_name' | 'email' | 'parent_phone' | 'applied_grade' | 'notes'> & Partial<Pick<AdmCandidate, 'current_grade' | 'date_of_birth' | 'previous_curriculum' | 'previous_school_language' | 'home_language' | 'years_english_medium' | 'admin_notes'>>
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
  updates: Partial<Pick<AdmCandidate, 'full_name' | 'email' | 'parent_phone' | 'applied_grade' | 'status' | 'notes' | 'current_grade' | 'date_of_birth' | 'previous_curriculum' | 'previous_school_language' | 'home_language' | 'years_english_medium' | 'admin_notes'>>
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

export interface CandidateReportContext {
  form_code?: string | null;
  form_subject?: string | null;
  form_title?: string | null;
  grade?: number | null;
  content_version?: string | null;
  candidate?: { applied_grade?: number | null; name?: string | null } | null;
  attempt?: Partial<AdmAttempt> | null;
}

const firstDefined = (...values: any[]) => values.find(v => v !== undefined && v !== null && v !== '');

const normalizeReportPayload = (raw: any, context: CandidateReportContext = {}) => {
  const form = raw.form ?? raw.test_form ?? raw.adm_test_forms ?? {};
  const blueprint = raw.blueprint ?? raw.adm_blueprints ?? form.blueprint ?? {};
  const candidate = raw.candidate ?? raw.candidate_profile ?? context.candidate ?? {};
  const attempt = raw.attempt ?? context.attempt ?? {};
  const formCode = firstDefined(raw.form_code, raw.formCode, form.form_code, form.formCode, context.form_code);
  const contentVersion = firstDefined(raw.content_version, raw.contentVersion, blueprint.content_version, form.content_version, context.content_version);
  const formSubject = deriveAdmissionSubject(firstDefined(raw.form_subject, raw.formSubject, raw.subject, form.subject, blueprint.subject, context.form_subject), formCode, contentVersion);
  const grade = Number(firstDefined(raw.grade, raw.form_grade, raw.formGrade, candidate.applied_grade, context.grade, String(formCode || '').match(/(?:ENG|MAT|SCI|G|GRADE)(\d{1,2})/i)?.[1]) || '') || null;
  const formTitle = firstDefined(raw.form_title, raw.formTitle, form.form_title, form.form_label, blueprint.name, context.form_title) || buildAdmissionReportFormLabel(formCode, grade, formSubject);
  const normalizedAttempt = {
    ...attempt,
    status: firstDefined(attempt.status, raw.status),
    total_score: firstDefined(attempt.total_score, attempt.totalScore, raw.total_score, raw.totalScore),
    max_score: firstDefined(attempt.max_score, attempt.maxScore, raw.max_score, raw.maxScore),
    percentage: firstDefined(attempt.percentage, raw.percentage),
    started_at: firstDefined(attempt.started_at, attempt.startedAt, raw.started_at, raw.startedAt),
    submitted_at: firstDefined(attempt.submitted_at, attempt.submittedAt, raw.submitted_at, raw.submittedAt),
  };
  return { ...raw, candidate, attempt: normalizedAttempt, form_code: formCode ?? null, formCode: formCode ?? null, form_subject: formSubject, formSubject, subject: formSubject, grade, form_title: formTitle, formTitle, content_version: contentVersion ?? null };
};

export async function getCandidateReport(attemptId: string, context: CandidateReportContext = {}): Promise<CandidateReport | null> {
  const { data, error } = await supabase.rpc('rpc_adm_get_candidate_report', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  if (!data) throw new Error('Report data unavailable');
  if (!data.success) throw new Error(data.error || 'Report data unavailable');

  // Transform RPC shape → CandidateReport shape
  const raw = normalizeReportPayload(data as any, context);
  if (import.meta.env?.DEV && (!raw.form_code || raw.subject === 'unknown')) {
    console.warn('Admission report metadata missing or ambiguous', {
      attempt_id: attemptId,
      keys: Object.keys(data as any),
      derived: { formCode: raw.form_code, formSubject: raw.form_subject, subject: raw.subject, title: raw.form_title },
    });
  }
  const answerRows = Array.isArray(raw.answers) ? raw.answers : [];
  const answers = answerRows.map((a: any) => ({
      id: a.id ?? a.answer_id ?? null,
      answer_id: a.answer_id ?? a.id ?? null,
      question_id: a.question_id,
      question_type: a.question_type ?? 'structured',
      stem: a.stem ?? a.prompt ?? 'Detailed question text unavailable',
      subject: admissionSubjectLabel(a.subject ?? raw.subject ?? raw.form_subject ?? null, raw.form_code ?? null, a.content_version ?? raw.content_version ?? null),
      topic: a.topic ?? a.strand ?? null,
      strand: a.strand ?? null,
      subskill: a.subskill ?? null,
      diagnostic_skill: a.diagnostic_skill ?? a.subskill ?? a.strand ?? null,
      skill_tag: a.skill_tag ?? null,
      difficulty: a.difficulty ?? null,
      grade_level: a.grade_level ?? null,
      stage_level: a.stage_level ?? null,
      form_code: raw.form_code ?? null,
      content_version: a.content_version ?? raw.content_version ?? null,
      response: a.response,
      correct_answer: a.correct_answer,
      is_correct: a.is_correct,
      marks_awarded: a.marks_awarded ?? 0,
      marks_possible: a.marks_possible ?? 0,
      explanation: a.explanation ?? null,
      options: a.options ?? null,
      ai_feedback: a.ai_feedback ?? null,
    }));
  const candidateProfile = raw.candidate ? {
    applied_grade: raw.candidate.applied_grade ?? null,
    current_grade: raw.candidate.current_grade ?? null,
    date_of_birth: raw.candidate.date_of_birth ?? null,
    previous_curriculum: raw.candidate.previous_curriculum ?? null,
    previous_school_language: raw.candidate.previous_school_language ?? null,
    home_language: raw.candidate.home_language ?? null,
    years_english_medium: raw.candidate.years_english_medium ?? null,
    admin_notes: raw.candidate.admin_notes ?? null,
  } : undefined;
  const reportSubject = raw.subject ?? raw.form_subject ?? answers[0]?.subject ?? null;
  const diagnosticAnswers = answers.map((answer: any) => ({ ...answer, subject: answer.subject ?? reportSubject, form_code: raw.form_code ?? null, content_version: answer.content_version ?? raw.content_version ?? null }));
  const diagnosticBreakdown = calculateDiagnosticBreakdown(diagnosticAnswers);
  const attemptPercentage = raw.attempt?.percentage ?? 0;
  const placementRecommendation = calculatePlacementRecommendation(candidateProfile, diagnosticAnswers, attemptPercentage);
  const totalQuestions = Number(raw.total_questions ?? raw.form?.total_questions ?? raw.form?.question_count ?? raw.attempt?.max_score ?? answers.length);
  const answeredCount = Number(raw.answered_count ?? answers.length);
  const answeredMarks = answers.reduce((sum: number, answer: CandidateReportAnswer) => sum + Number(answer.marks_awarded ?? (answer.is_correct ? 1 : 0)), 0);
  const answeredMaxMarks = answers.reduce((sum: number, answer: CandidateReportAnswer) => sum + Number(answer.marks_possible ?? 1), 0);
  const answeredQuestionAccuracy = answeredMaxMarks > 0 ? Math.round((answeredMarks / answeredMaxMarks) * 100) : null;
  return {
    candidate_name: raw.candidate?.name ?? 'Unknown',
    form_code: raw.form_code ?? '',
    formCode: raw.form_code ?? '',
    formSubject: raw.form_subject ?? null,
    subject: reportSubject,
    formTitle: raw.form_title ?? buildAdmissionReportFormLabel(raw.form_code ?? '', raw.grade ?? raw.candidate?.applied_grade ?? null, reportSubject),
    grade: raw.grade ?? raw.candidate?.applied_grade ?? null,
    form_label: raw.form_title ?? buildAdmissionReportFormLabel(raw.form_code ?? '', raw.grade ?? raw.candidate?.applied_grade ?? null, reportSubject),
    total_score: raw.attempt?.total_score ?? 0,
    max_score: raw.attempt?.max_score ?? 0,
    percentage: attemptPercentage,
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
    strengths: dedupeAdmissionFocusAreas(raw.strengths ?? placementRecommendation.strengths ?? [], diagnosticBreakdown),
    weaknesses: dedupeAdmissionFocusAreas(raw.weaknesses ?? placementRecommendation.weakAreas ?? [], diagnosticBreakdown, true),
    answers,
    ai_summary: raw.ai_summary ?? null,
    candidate_profile: candidateProfile,
    diagnostic_breakdown: diagnosticBreakdown,
    placement_recommendation: placementRecommendation,
    skill_breakdown: raw.skill_breakdown ?? [],
    difficulty_breakdown: raw.difficulty_breakdown ?? [],
    activity_notes: raw.activity_notes ?? [],
    activity_events: Array.isArray(raw.activity_events) ? raw.activity_events : [],
    answer_details_available: raw.answer_details_available ?? raw.answerDetailsAvailable ?? true,
    answer_detail_message: raw.answer_detail_message ?? raw.answerDetailMessage ?? null,
    answered_count: answeredCount,
    total_questions: totalQuestions,
    partial_attempt: answeredCount < totalQuestions,
    answered_question_accuracy: answeredQuestionAccuracy,
  };
}


export async function getAttemptActivity(attemptId: string): Promise<{ notes: string[]; events: AdmCandidateTestEvent[] }> {
  const { data, error } = await supabase.rpc('rpc_adm_get_attempt_activity', { p_attempt_id: attemptId });
  if (error) throw error;
  if (!data || !data.success) return { notes: [], events: [] };
  const events = data.events ?? [];
  return { notes: buildAdmissionActivityNotes(events, data.submitted_at), events };
}

export async function resetAttemptForRetake(attemptId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adm_reset_attempt_for_retake', { p_attempt_id: attemptId, p_reason: reason });
  if (error) throw error;
  return data as { success: boolean; error?: string };
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
