import type { QuestionDifficulty, QuestionType, Subject } from '../types';
import { supabase } from './supabaseClient';

export const TEACHER_QUESTION_SOURCE_BUCKET = 'teacher-question-sources';
export const MAX_TEACHER_QUESTION_PDF_BYTES = 6 * 1024 * 1024;
export const MAX_TEACHER_QUESTION_BATCH_SIZE = 50;

export type AssessmentProcessCode = 'AO1' | 'AO2' | 'AO3' | 'AO4';
export type CognitiveProcess = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';

export interface TeacherQuestionTaxonomyProposal {
  primary_skill_name: string;
  atomic_subskill_name: string;
  assessment_process_code: AssessmentProcessCode;
  assessment_process_name: string;
  assessment_process_definition: string;
  cognitive_process: CognitiveProcess;
  evidence_statement: string;
  secondary_skill_names: string[];
  confidence_score: number;
  review_reason: string;
}

export interface TeacherQuestionBatchCandidate {
  client_id: string;
  source_index: number;
  source_page: number | null;
  subject: Subject;
  topic: string;
  eligible_grade_levels: number[];
  difficulty: QuestionDifficulty;
  question_type: QuestionType;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  time_limit: number;
  points: number;
  taxonomy_proposal: TeacherQuestionTaxonomyProposal;
  extraction_confidence: number;
  needs_human_attention: boolean;
  attention_reason: string;
  visual_required: boolean;
}

export interface TeacherQuestionPdfExtraction {
  extractionId: string;
  model: string;
  sourceSha256: string;
  sourceFileSize: number;
  detectedPageCount: number | null;
  document_title: string;
  document_summary: string;
  questions: TeacherQuestionBatchCandidate[];
  sourceObjectPath: string;
  sourceFileName: string;
}

export interface TeacherQuestionBatchSubmitResult {
  success: true;
  batchId: string;
  status: 'in_review';
  submitted: number;
  created: number;
  duplicatesSkipped: number;
  academicProfileEligible: false;
}

export type TeacherQuestionUploadStage = 'checking' | 'uploading' | 'extracting' | 'securing';

const AO_DETAILS: Record<AssessmentProcessCode, {
  name: string;
  definition: string;
  cognitiveProcess: CognitiveProcess;
}> = {
  AO1: {
    name: 'Knowledge and comprehension',
    definition: 'Retrieve, recognize, identify, define, or understand explicit subject knowledge and information.',
    cognitiveProcess: 'understand',
  },
  AO2: {
    name: 'Application and procedure',
    definition: 'Apply a rule, convention, method, algorithm, calculation, or classification in a familiar assessed context.',
    cognitiveProcess: 'apply',
  },
  AO3: {
    name: 'Analysis and interpretation',
    definition: 'Connect evidence, infer, compare, explain, predict, interpret, or select a supported conclusion.',
    cognitiveProcess: 'analyze',
  },
  AO4: {
    name: 'Evaluation and judgment',
    definition: 'Judge credibility, validity, bias, limitations, trade-offs, or alternatives using explicit criteria and evidence.',
    cognitiveProcess: 'evaluate',
  },
};

const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

const sha256Hex = async (file: File) => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readPdfSignature = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return new TextDecoder().decode(bytes);
};

const extractionErrorMessage = async (error: unknown) => {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    const payload = await context.json().catch(() => null) as { error?: string } | null;
    if (payload?.error) return payload.error;
  }
  return error instanceof Error && error.message
    ? error.message
    : 'The PDF could not be analysed. Please try again.';
};

const candidateFromPayload = (value: unknown, index: number): TeacherQuestionBatchCandidate => {
  const candidate = (value || {}) as Omit<TeacherQuestionBatchCandidate, 'client_id'>;
  return {
    ...candidate,
    client_id: crypto.randomUUID(),
    source_index: index + 1,
    source_page: candidate.source_page || null,
    options: Array.isArray(candidate.options) ? candidate.options : [],
    eligible_grade_levels: Array.isArray(candidate.eligible_grade_levels)
      ? candidate.eligible_grade_levels
      : [],
    taxonomy_proposal: {
      ...candidate.taxonomy_proposal,
      secondary_skill_names: Array.isArray(candidate.taxonomy_proposal?.secondary_skill_names)
        ? candidate.taxonomy_proposal.secondary_skill_names
        : [],
    },
  };
};

export const questionCandidateFingerprint = (candidate: TeacherQuestionBatchCandidate) => [
  candidate.subject,
  candidate.topic,
  candidate.question_text,
  candidate.correct_answer,
  ...candidate.options,
].map(normalize).join('|');

export const getQuestionCandidateIssues = (candidate: TeacherQuestionBatchCandidate) => {
  const issues: string[] = [];
  if (candidate.question_text.trim().length < 5) issues.push('Add the complete question wording.');
  if (!candidate.correct_answer.trim()) issues.push('Confirm the correct answer.');
  if (!candidate.topic.trim()) issues.push('Add a topic.');
  if (!candidate.eligible_grade_levels.length) issues.push('Choose at least one grade.');
  if (candidate.visual_required) issues.push('This question depends on a visual. Rewrite it as self-contained text or remove it.');
  if (candidate.needs_human_attention && !candidate.visual_required) {
    issues.push(candidate.attention_reason.trim() || 'Confirm this question against the source PDF.');
  }
  if (candidate.question_type === 'multiple_choice') {
    const options = candidate.options.map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) issues.push('Add at least two answer options.');
    if (new Set(options.map(normalize)).size !== options.length) issues.push('Make every answer option unique.');
    if (candidate.correct_answer.trim() && !options.some((option) => normalize(option) === normalize(candidate.correct_answer))) {
      issues.push('Choose a correct answer that exactly matches one option.');
    }
  }
  if (candidate.question_type === 'true_false' && !['true', 'false'].includes(normalize(candidate.correct_answer))) {
    issues.push('Set the answer to True or False.');
  }
  if (candidate.taxonomy_proposal.primary_skill_name.trim().length < 3) issues.push('The primary skill needs review.');
  if (candidate.taxonomy_proposal.atomic_subskill_name.trim().length < 3) issues.push('The subskill needs review.');
  if (candidate.taxonomy_proposal.evidence_statement.trim().length < 20) issues.push('The evidence statement needs review.');
  return issues;
};

export const setCandidateAssessmentProcess = (
  candidate: TeacherQuestionBatchCandidate,
  code: AssessmentProcessCode,
): TeacherQuestionBatchCandidate => ({
  ...candidate,
  taxonomy_proposal: {
    ...candidate.taxonomy_proposal,
    assessment_process_code: code,
    assessment_process_name: AO_DETAILS[code].name,
    assessment_process_definition: AO_DETAILS[code].definition,
    cognitive_process: AO_DETAILS[code].cognitiveProcess,
  },
});

export const uploadAndExtractTeacherQuestionPdf = async (
  file: File,
  options: {
    preferredSubject?: Subject;
    preferredTopic?: string;
    onStageChange?: (stage: TeacherQuestionUploadStage) => void;
  } = {},
): Promise<TeacherQuestionPdfExtraction> => {
  options.onStageChange?.('checking');
  if (!file.name.toLocaleLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
  if (file.size < 5) throw new Error('This PDF is empty.');
  if (file.size > MAX_TEACHER_QUESTION_PDF_BYTES) throw new Error('Use a PDF no larger than 6 MB.');
  if (await readPdfSignature(file) !== '%PDF-') throw new Error('This file is not a valid PDF.');

  const [{ data: authData, error: authError }, sourceSha256] = await Promise.all([
    supabase.auth.getUser(),
    sha256Hex(file),
  ]);
  if (authError || !authData.user) throw new Error('Sign in again before uploading a question paper.');

  const objectPath = `${authData.user.id}/${Date.now()}-${crypto.randomUUID()}.pdf`;
  options.onStageChange?.('uploading');
  const { error: uploadError } = await supabase.storage
    .from(TEACHER_QUESTION_SOURCE_BUCKET)
    .upload(objectPath, file, {
      contentType: 'application/pdf',
      cacheControl: '0',
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message || 'The PDF could not be uploaded.');

  options.onStageChange?.('extracting');
  const { data, error } = await supabase.functions.invoke('teacher_question_pdf_extract', {
    body: {
      objectPath,
      fileName: file.name,
      preferredSubject: options.preferredSubject,
      preferredTopic: options.preferredTopic?.trim() || undefined,
    },
  });
  if (error) throw new Error(await extractionErrorMessage(error));

  options.onStageChange?.('securing');
  const payload = data as Partial<TeacherQuestionPdfExtraction> & { success?: boolean };
  if (!payload.success || !payload.extractionId || !Array.isArray(payload.questions) || !payload.questions.length) {
    throw new Error('No usable questions were found. Try a clearer PDF or a shorter question paper.');
  }
  if (payload.sourceSha256 !== sourceSha256) {
    throw new Error('The uploaded file did not pass the integrity check. Please upload it again.');
  }

  return {
    extractionId: payload.extractionId,
    model: payload.model || 'AI-assisted extraction',
    sourceSha256,
    sourceFileSize: Number(payload.sourceFileSize || file.size),
    detectedPageCount: payload.detectedPageCount || null,
    document_title: payload.document_title || file.name.replace(/\.pdf$/i, ''),
    document_summary: payload.document_summary || 'Questions extracted for teacher review.',
    questions: payload.questions.slice(0, MAX_TEACHER_QUESTION_BATCH_SIZE).map(candidateFromPayload),
    sourceObjectPath: objectPath,
    sourceFileName: file.name,
  };
};

export const submitTeacherQuestionBatch = async (
  extractionId: string,
  questions: TeacherQuestionBatchCandidate[],
): Promise<TeacherQuestionBatchSubmitResult> => {
  if (!questions.length || questions.length > MAX_TEACHER_QUESTION_BATCH_SIZE) {
    throw new Error('Submit between 1 and 50 reviewed questions.');
  }
  const fingerprints = new Set<string>();
  questions.forEach((question) => {
    const issues = getQuestionCandidateIssues(question);
    if (issues.length) throw new Error(`Question ${question.source_index}: ${issues[0]}`);
    const fingerprint = questionCandidateFingerprint(question);
    if (fingerprints.has(fingerprint)) throw new Error(`Question ${question.source_index} duplicates another question in this batch.`);
    fingerprints.add(fingerprint);
  });

  const payload = questions.map((question, index) => ({
    source_index: index + 1,
    source_page: question.source_page,
    subject: question.subject,
    topic: question.topic.trim() || 'General',
    eligible_grade_levels: [...new Set(question.eligible_grade_levels)].sort((a, b) => a - b),
    difficulty: question.difficulty,
    question_type: question.question_type,
    question_text: question.question_text.trim(),
    options: question.question_type === 'short_answer'
      ? []
      : question.question_type === 'true_false'
        ? ['True', 'False']
        : question.options.map((option) => option.trim()).filter(Boolean),
    correct_answer: question.correct_answer.trim(),
    explanation: question.explanation.trim(),
    time_limit: question.time_limit,
    points: question.points,
    taxonomy_proposal: question.taxonomy_proposal,
    extraction_confidence: question.extraction_confidence,
    needs_human_attention: question.needs_human_attention,
  }));

  const { data, error } = await supabase.rpc('rpc_teacher_submit_question_batch', {
    p_extraction_id: extractionId,
    p_questions: payload,
  });
  if (error) {
    if (error.message.includes('teacher_question_batch_already_submitted')) {
      throw new Error('This PDF batch has already been submitted. Open My Pool to view it.');
    }
    if (error.message.includes('invalid_multiple_choice')) {
      throw new Error('One multiple-choice question has missing, repeated, or mismatched answer options.');
    }
    if (error.message.includes('teacher_subject_not_assigned')) {
      throw new Error('One question uses a subject that is not assigned to you. Choose one of your allocated subjects.');
    }
    throw new Error(error.message || 'The question batch could not be submitted safely.');
  }
  const result = data as TeacherQuestionBatchSubmitResult | null;
  if (!result?.success) throw new Error('The question batch returned an invalid confirmation.');
  return result;
};
