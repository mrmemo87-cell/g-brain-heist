import type { QuestionDifficulty, QuestionType, Subject } from '../types';
import { supabase } from './supabaseClient';

export const TEACHER_QUESTION_SOURCE_BUCKET = 'teacher-question-sources';
export const MAX_TEACHER_QUESTION_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_TEACHER_QUESTION_BATCH_SIZE = 50;
export const MAX_GENERATED_QUESTION_COUNT = 24;

export type AssessmentProcessCode = 'AO1' | 'AO2' | 'AO3' | 'AO4';
export type CognitiveProcess = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';
export type TeacherPdfProcessingMode = 'extract' | 'generate' | 'both';
export type TeacherPdfDocumentType = 'question_paper' | 'learning_material' | 'mixed' | 'unsupported';
export type TeacherQuestionCandidateOrigin = 'source_question' | 'ai_generated_from_source';
export type TeacherQuestionSourceEvidenceKind = 'text' | 'visual' | 'mixed';
export type TeacherQuestionPurpose = 'retrieval_practice' | 'diagnostic' | 'homework' | 'exam_practice';
export type TeacherQuestionChallenge = 'accessible' | 'balanced' | 'challenging';
export type TeacherQuestionVisualPolicy = 'self_contained' | 'text_only';

export interface TeacherQuestionPdfRequest {
  processingMode: TeacherPdfProcessingMode;
  preferredSubject?: Subject;
  preferredTopic?: string;
  targetGrade?: number;
  questionCount?: number;
  allowedQuestionTypes?: QuestionType[];
  purpose?: TeacherQuestionPurpose;
  challenge?: TeacherQuestionChallenge;
  pageFrom?: number;
  pageTo?: number;
  learningPriorities?: string;
  visualPolicy?: TeacherQuestionVisualPolicy;
  sourceRightsAttested?: boolean;
}

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
  candidate_origin: TeacherQuestionCandidateOrigin;
  source_grounding_note: string;
  source_evidence_kind: TeacherQuestionSourceEvidenceKind;
  source_visual_description: string;
  grounding_confidence: number;
  learning_objective: string;
}

export interface TeacherQuestionPdfExtraction {
  extractionId: string;
  model: string;
  sourceSha256: string;
  sourceFileSize: number;
  detectedPageCount: number | null;
  processingMode: TeacherPdfProcessingMode;
  detectedDocumentType: TeacherPdfDocumentType;
  documentTypeConfidence: number;
  sourceRightsAttested: boolean;
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
    candidate_origin: candidate.candidate_origin === 'ai_generated_from_source'
      ? 'ai_generated_from_source'
      : 'source_question',
    source_grounding_note: candidate.source_grounding_note || '',
    source_evidence_kind: ['text', 'visual', 'mixed'].includes(candidate.source_evidence_kind)
      ? candidate.source_evidence_kind
      : 'text',
    source_visual_description: candidate.source_visual_description || '',
    grounding_confidence: Number.isFinite(Number(candidate.grounding_confidence))
      ? Number(candidate.grounding_confidence)
      : 0,
    learning_objective: candidate.learning_objective || '',
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
  if (candidate.candidate_origin === 'ai_generated_from_source') {
    if (!candidate.source_page) issues.push('Confirm the source page used to create this question.');
    if (candidate.source_grounding_note.trim().length < 20) issues.push('The source-grounding note needs review.');
    if (candidate.learning_objective.trim().length < 10) issues.push('The learning objective needs review.');
    if (candidate.explanation.trim().length < 10) issues.push('Add a clear answer explanation for this generated question.');
  }
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
  options: TeacherQuestionPdfRequest & {
    onStageChange?: (stage: TeacherQuestionUploadStage) => void;
  },
): Promise<TeacherQuestionPdfExtraction> => {
  options.onStageChange?.('checking');
  if (!file.name.toLocaleLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
  if (file.size < 5) throw new Error('This PDF is empty.');
  if (file.size > MAX_TEACHER_QUESTION_PDF_BYTES) throw new Error('Use a PDF no larger than 20 MB.');
  if (await readPdfSignature(file) !== '%PDF-') throw new Error('This file is not a valid PDF.');
  const createsQuestions = options.processingMode !== 'extract';
  if (createsQuestions) {
    if (!options.preferredSubject) throw new Error('Choose the subject for the questions.');
    if (!Number.isInteger(options.targetGrade) || Number(options.targetGrade) < 1 || Number(options.targetGrade) > 12) {
      throw new Error('Choose the target grade for the questions.');
    }
    if (!options.sourceRightsAttested) throw new Error('Confirm that you may use this material for classroom question creation.');
    const count = Number(options.questionCount || 0);
    if (!Number.isInteger(count) || count < 1 || count > MAX_GENERATED_QUESTION_COUNT) {
      throw new Error(`Choose between 1 and ${MAX_GENERATED_QUESTION_COUNT} questions.`);
    }
    if (!options.allowedQuestionTypes?.length) throw new Error('Choose at least one question type.');
  }
  if (options.pageFrom && options.pageTo && options.pageFrom > options.pageTo) {
    throw new Error('The first page must come before the last page.');
  }

  const [{ data: authData, error: authError }, sourceSha256] = await Promise.all([
    supabase.auth.getUser(),
    sha256Hex(file),
  ]);
  if (authError || !authData.user) throw new Error('Sign in again before using the PDF question workspace.');

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
      processingMode: options.processingMode,
      preferredSubject: options.preferredSubject,
      preferredTopic: options.preferredTopic?.trim() || undefined,
      targetGrade: options.targetGrade,
      questionCount: options.questionCount,
      allowedQuestionTypes: options.allowedQuestionTypes,
      purpose: options.purpose,
      challenge: options.challenge,
      pageFrom: options.pageFrom,
      pageTo: options.pageTo,
      learningPriorities: options.learningPriorities?.trim() || undefined,
      visualPolicy: options.visualPolicy,
      sourceRightsAttested: options.sourceRightsAttested === true,
    },
  });
  if (error) throw new Error(await extractionErrorMessage(error));

  options.onStageChange?.('securing');
  const payload = data as Partial<TeacherQuestionPdfExtraction> & { success?: boolean };
  if (!payload.success || !payload.extractionId || !Array.isArray(payload.questions) || !payload.questions.length) {
    throw new Error('No usable questions were prepared. Try a clearer PDF or adjust the page range.');
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
    processingMode: payload.processingMode || options.processingMode,
    detectedDocumentType: payload.detectedDocumentType || 'question_paper',
    documentTypeConfidence: Number(payload.documentTypeConfidence || 0),
    sourceRightsAttested: payload.sourceRightsAttested === true,
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
    candidate_origin: question.candidate_origin,
    source_grounding_note: question.source_grounding_note.trim(),
    source_evidence_kind: question.source_evidence_kind,
    source_visual_description: question.source_visual_description.trim(),
    grounding_confidence: question.grounding_confidence,
    learning_objective: question.learning_objective.trim(),
  }));

  const { data, error } = await supabase.rpc('rpc_teacher_submit_question_batch_v2', {
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
    if (error.message.includes('question_source_provenance_mismatch')) {
      throw new Error('The source evidence for one question no longer matches this secured PDF draft. Upload the PDF again.');
    }
    if (error.message.includes('generated_question_grounding_incomplete')) {
      throw new Error('One created question is missing its secured source page, grounding note or answer explanation. Create a fresh draft.');
    }
    throw new Error(error.message || 'The question batch could not be submitted safely.');
  }
  const result = data as TeacherQuestionBatchSubmitResult | null;
  if (!result?.success) throw new Error('The question batch returned an invalid confirmation.');
  return result;
};
