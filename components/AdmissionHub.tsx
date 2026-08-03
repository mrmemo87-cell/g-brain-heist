import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import BackButton from './BackButton';
import type { ToastMessage } from '../types';
import * as AdmService from '../services/admissionService';
import { tryConsumePilotQuota } from '../services/tierService';
import type {
  AdmQuestionPool,
  AdmQuestion,
  AdmBlueprint,
  AdmTestForm,
  AdmCandidate,
  AdmAttempt,
  AdmPlacementResult,
  CandidateReport,
  PlacementBand,
} from '../services/admissionService';
import { supabase } from '../services/supabaseClient';
import { buildAdmissionWizardBlueprintName, buildAdmissionWizardDefaultName, getAdmissionWizardSubjectLabel } from '../src/lib/admissionWizardNaming';
import { AdmissionReportPartialAttemptNotice, resolveAdmissionReportPartialAttempt, resolveAdmissionReportVisiblePartialAttempt } from './admissionReportPartialAttempt';
import { useSchoolBranding } from '../src/hooks/useSchoolBranding';
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  schoolDocumentFileName,
} from '../src/lib/schoolDocument';

// ── Types ──

type AdmTab = 'create' | 'overview' | 'pools' | 'blueprints' | 'forms' | 'candidates' | 'results' | 'audit';

interface AdmissionHubProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

// ── Band Colours ──

const BAND_COLORS: Record<PlacementBand, string> = {
  A: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  B: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  C: 'bg-amber-100 text-amber-700 border-amber-200',
  D: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  E: 'bg-red-100 text-red-700 border-red-200',
};

const BAND_LABELS: Record<PlacementBand, string> = {
  A: 'Outstanding',
  B: 'Above Average',
  C: 'Average',
  D: 'Below Average',
  E: 'Requires Support',
};

// ── Blueprint Presets (auto-fill for each subject) ──

const BLUEPRINT_PRESETS: Record<string, { label: string; icon: string; marks: number; duration: number; distribution: string }> = {
  english: {
    label: 'English',
    icon: '📖',
    marks: 25,
    duration: 45,
    distribution: JSON.stringify({ reading_comprehension: { easy: 3, medium: 5 }, mcq: { easy: 7, medium: 8, hard: 2 } }),
  },
  math: {
    label: 'Mathematics',
    icon: '🔢',
    marks: 30,
    duration: 60,
    distribution: JSON.stringify({ mcq: { easy: 6, medium: 8, hard: 2 }, short_answer: { easy: 2, medium: 3, hard: 1 }, structured: { medium: 3, hard: 2 }, gap_fill: { easy: 1, medium: 1, hard: 1 } }),
  },
  science: {
    label: 'Science',
    icon: '🔬',
    marks: 25,
    duration: 50,
    distribution: JSON.stringify({ mcq: { easy: 5, medium: 7, hard: 2 }, short_answer: { easy: 2, medium: 3 }, structured: { medium: 2, hard: 1 } }),
  },
  chemistry: {
    label: 'Chemistry',
    icon: '⚗️',
    marks: 25,
    duration: 50,
    distribution: JSON.stringify({ mcq: { easy: 4, medium: 6, hard: 2 }, short_answer: { easy: 2, medium: 3 }, structured: { medium: 2, hard: 2 } }),
  },
};



type WizardDifficulty = 'easy' | 'balanced' | 'advanced' | 'custom';
type WizardSource = 'auto' | 'pool';

const WIZARD_DIFFICULTY_META: Record<WizardDifficulty, { label: string; description: string; duration: number; pass: number; mix: Record<string, number> }> = {
  easy: { label: 'Easy', description: 'Mostly easy questions for a lighter first screen.', duration: 35, pass: 50, mix: { easy: 0.7, medium: 0.3, hard: 0 } },
  balanced: { label: 'Balanced', description: 'Recommended mix for most admission tests.', duration: 45, pass: 60, mix: { easy: 0.4, medium: 0.5, hard: 0.1 } },
  advanced: { label: 'Advanced', description: 'More medium and hard questions for selective entry.', duration: 60, pass: 70, mix: { easy: 0.2, medium: 0.5, hard: 0.3 } },
  custom: { label: 'Custom', description: 'Fine-tune question types and distribution.', duration: 45, pass: 60, mix: { easy: 0.4, medium: 0.5, hard: 0.1 } },
};

const ENGLISH_WIZARD_TYPE_MIX: Record<string, number> = {
  reading_comprehension: 0.32,
  mcq: 0.68,
};

const ENGLISH_WIZARD_MIN_READING_QUESTIONS = 1;

const distributeCount = (total: number, weights: Record<string, number>) => {
  const entries = Object.entries(weights);
  const base = entries.map(([key, weight]) => ({ key, count: Math.floor(total * weight), remainder: (total * weight) % 1 }));
  let allocated = base.reduce((sum, item) => sum + item.count, 0);
  base.sort((a, b) => b.remainder - a.remainder);
  for (const item of base) {
    if (allocated >= total) break;
    item.count += 1;
    allocated += 1;
  }
  return Object.fromEntries(base.map(({ key, count }) => [key, count]));
};

const buildWizardDistribution = (questionCount: number, difficulty: WizardDifficulty, questions: AdmQuestion[] = [], subject = 'english'): Record<string, Record<string, number>> => {
  const meta = WIZARD_DIFFICULTY_META[difficulty === 'custom' ? 'balanced' : difficulty];
  const requestedByDifficulty: Record<string, number> = {
    easy: Math.floor(questionCount * meta.mix.easy),
    hard: Math.floor(questionCount * meta.mix.hard),
    medium: 0,
  };
  requestedByDifficulty.medium = Math.max(0, questionCount - requestedByDifficulty.easy - requestedByDifficulty.hard);

  const published = questions.filter(q => q.status === 'published');
  const distribution: Record<string, Record<string, number>> = {};
  const isEnglish = normalizeAdmissionSubject(subject) === 'english';
  const requestedByType = isEnglish ? distributeCount(questionCount, ENGLISH_WIZARD_TYPE_MIX) : null;
  if (isEnglish && questionCount > 1) {
    requestedByType!.reading_comprehension = Math.max(ENGLISH_WIZARD_MIN_READING_QUESTIONS, requestedByType!.reading_comprehension || 0);
    requestedByType!.mcq = Math.max(0, questionCount - requestedByType!.reading_comprehension);
  }

  const allocate = (difficultyKey: string, requested: number) => {
    if (isEnglish && requestedByType) {
      let remainingForDifficulty = requested;
      for (const type of ['reading_comprehension', 'mcq']) {
        if (remainingForDifficulty <= 0) return;
        const alreadyForType = Object.values(distribution[type] || {}).reduce((sum, count) => sum + count, 0);
        const remainingForType = Math.max(0, (requestedByType[type] || 0) - alreadyForType);
        if (remainingForType <= 0) continue;
        const available = published.filter(q => q.difficulty === difficultyKey && q.question_type === type).length;
        const take = Math.min(available, remainingForDifficulty, remainingForType);
        if (take > 0) {
          distribution[type] = distribution[type] || {};
          distribution[type][difficultyKey] = take;
          remainingForDifficulty -= take;
        }
      }
      return;
    }

    let remaining = requested;
    const byType = published
      .filter(q => q.difficulty === difficultyKey)
      .reduce<Record<string, number>>((acc, q) => ({ ...acc, [q.question_type]: (acc[q.question_type] || 0) + 1 }), {});
    Object.entries(byType)
      .sort(([a], [b]) => (a === 'mcq' ? -1 : b === 'mcq' ? 1 : a.localeCompare(b)))
      .forEach(([type, available]) => {
        if (remaining <= 0) return;
        const take = Math.min(available, remaining);
        distribution[type] = distribution[type] || {};
        distribution[type][difficultyKey] = take;
        remaining -= take;
      });
  };

  allocate('easy', requestedByDifficulty.easy);
  allocate('medium', requestedByDifficulty.medium);
  allocate('hard', requestedByDifficulty.hard);

  // Before availability has loaded, return a simple subject-shaped plan so the review step remains stable.
  if (Object.keys(distribution).length === 0) {
    const fallback: Record<string, Record<string, number>> = isEnglish ? { reading_comprehension: {}, mcq: {} } : { mcq: {} };
    Object.entries(requestedByDifficulty).forEach(([diff, count]) => {
      if (count <= 0) return;
      if (!isEnglish) { fallback.mcq[diff] = count; return; }
      const readingCount = Math.min(count, Math.max(0, Math.round(count * ENGLISH_WIZARD_TYPE_MIX.reading_comprehension)));
      if (readingCount > 0) fallback.reading_comprehension[diff] = readingCount;
      if (count - readingCount > 0) fallback.mcq[diff] = count - readingCount;
    });
    return fallback;
  }
  return distribution;
};

const countDistributionQuestions = (questions: AdmQuestion[], distribution: Record<string, Record<string, number>>) => {
  let required = 0;
  let availableForRequired = 0;
  const missing: string[] = [];
  const selectedStemKeys = new Set<string>();
  const normalizeStem = (value: string | null | undefined) => String(value ?? '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\b(?:question|item|investigation|scenario|problem)\s+\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const eligibleQuestions = questions.filter(q =>
    q.status === 'published'
    && q.is_official === true
    && q.is_locked === true
    && q.pool?.is_official === true
    && q.pool?.is_locked === true
    && q.external_id
    && q.pool?.external_id
    && (q.content_owner || q.pool?.content_owner) === 'brain_heist'
    && (q.content_version || q.pool?.content_version)
    && (q.content_version || q.pool?.content_version) !== 'legacy-import'
    && String(q.content_version || q.pool?.content_version).startsWith('adm-bank-v1-g')
  );
  Object.entries(distribution).forEach(([type, diffs]) => {
    Object.entries(diffs).forEach(([difficulty, needed]) => {
      required += needed;
      const uniqueCandidates = eligibleQuestions.filter(q => q.question_type === type && q.difficulty === difficulty);
      const uniqueStemKeys = new Set<string>();
      uniqueCandidates.forEach(q => {
        const stemKey = normalizeStem(q.stem);
        if (stemKey && !selectedStemKeys.has(stemKey)) uniqueStemKeys.add(stemKey);
      });
      const available = uniqueStemKeys.size;
      availableForRequired += Math.min(available, needed);
      if (available < needed) {
        missing.push(`${needed - available} more unique official ${difficulty} ${type.replace(/_/g, ' ')} question${needed - available === 1 ? '' : 's'}`);
      } else {
        let selected = 0;
        for (const q of uniqueCandidates) {
          const stemKey = normalizeStem(q.stem);
          if (!stemKey || selectedStemKeys.has(stemKey)) continue;
          selectedStemKeys.add(stemKey);
          selected += 1;
          if (selected >= needed) break;
        }
      }
    });
  });
  return { required, availableForRequired, canGenerate: missing.length === 0 && required > 0, missing };
};

export const friendlyAdmissionError = (message?: string, fallback = 'We could not complete that admission action. Please try again or contact support.') => {
  const text = (message || '').toLowerCase();
  if (text.includes('no question') || text.includes('not enough') || text.includes('matched') || text.includes('pool')) {
    return 'Not enough official questions are available for this grade and subject yet.';
  }
  if (text.includes('duplicate') || text.includes('unique') || text.includes('question_order') || text.includes('generate') || text.includes('publish')) {
    return 'Test could not be generated. Please refresh, check question availability, and try again.';
  }
  if (text.includes('attempt not found')) {
    return 'We could not find this attempt.';
  }
  if (text.includes('access denied') || text.includes('permission') || text.includes('rls') || text.includes('policy') || text.includes('jwt')) {
    return 'You do not have permission to view this candidate report.';
  }
  if (text.includes('result not ready') || text.includes('not ready') || text.includes('not yet scored') || text.includes('unsubmitted') || text.includes('in_progress')) {
    return 'Result not ready yet. Please wait until the candidate submits and scoring is complete.';
  }
  if (text.includes('report data unavailable') || text.includes('report unavailable') || text.includes('activity') || text.includes('report')) {
    return 'Report is unavailable right now. Please try again.';
  }
  if (text.includes('token') || text.includes('link') || text.includes('not found')) {
    return 'Candidate link unavailable. Please refresh the candidate list and copy a new link.';
  }
  if (text.includes('retake') || text.includes('reset')) {
    return 'Retake failed. Please confirm you are signed in as a school admin for this school.';
  }
  if (text.includes('result') || text.includes('attempt')) {
    return fallback;
  }
  if (text.includes('closed') || text.includes('not currently available') || text.includes('expired')) {
    return 'This test is closed or no longer available.';
  }
  if (text.includes('rpc') || text.includes('database') || text.includes('sql') || text.includes('postgres') || text.includes('supabase')) {
    return fallback;
  }
  return fallback;
};

// ── Pipeline Steps ──

const MAIN_TABS: AdmTab[] = ['overview', 'create', 'candidates', 'results'];
const ADMISSION_PACKAGE_SUBJECTS = [
  { key: 'english', label: 'English', required: true },
  { key: 'math', label: 'Maths', required: true },
  { key: 'science', label: 'Science', required: false },
];

const PIPELINE_STEPS = [
  { key: 'create', icon: '📝', label: 'Create admission test', desc: 'Choose grade and subject' },
  { key: 'candidates', icon: '👤', label: 'Register candidates', desc: 'Add applicant details' },
  { key: 'candidates', icon: '🔗', label: 'Send links', desc: 'Candidate-specific tests' },
  { key: 'candidates', icon: '📍', label: 'Track status', desc: 'Sent, submitted, scored' },
  { key: 'results', icon: '🏆', label: 'View results', desc: 'Recommendations' },
] as const;

// ── Question types available per subject ──

const QUESTION_TYPES: Record<string, { value: string; label: string }[]> = {
  english: [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'gap_fill', label: 'Gap Fill' },
    { value: 'sentence_transformation', label: 'Sentence Transformation' },
    { value: 'word_formation', label: 'Word Formation' },
    { value: 'error_correction', label: 'Error Correction' },
    { value: 'open_cloze', label: 'Open Cloze' },
    { value: 'reading_comprehension', label: 'Reading Comprehension' },
    { value: 'email_writing', label: 'Email Writing' },
    { value: 'essay_writing', label: 'Essay Writing' },
  ],
  math: [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'short_answer', label: 'Short Answer' },
    { value: 'structured', label: 'Structured' },
    { value: 'gap_fill', label: 'Gap Fill' },
  ],
  science: [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'short_answer', label: 'Short Answer' },
    { value: 'structured', label: 'Structured' },
  ],
  chemistry: [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'short_answer', label: 'Short Answer' },
    { value: 'structured', label: 'Structured' },
  ],
};


const normalizeAdmissionSubject = AdmService.normalizeAdmissionSubjectKey;

const admissionSubjectLabel = (subject?: string | null) => {
  const normalized = normalizeAdmissionSubject(subject);
  return normalized === 'maths' ? 'Maths' : normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getFormBlueprint = (form: Pick<AdmTestForm, 'blueprint_id'>, blueprints: AdmBlueprint[]) =>
  blueprints.find(b => b.id === form.blueprint_id) || null;

const getFormGrade = (form: Pick<AdmTestForm, 'blueprint_id' | 'form_code'>, blueprints: AdmBlueprint[]) => {
  const bp = getFormBlueprint(form, blueprints);
  const codeGrade = String(form.form_code || '').match(/(?:G|GRADE|ENG|MAT|MATH|SCI)(\d{1,2})/i)?.[1];
  return bp?.target_grade ?? bp?.target_stage ?? (codeGrade ? Number(codeGrade) : null);
};

const getFormSubjectFromCode = AdmService.getAdmissionFormSubjectFromCode;

const getFormSubject = (form: Pick<AdmTestForm, 'blueprint_id' | 'form_code'>, blueprints: AdmBlueprint[]) => {
  const bp = getFormBlueprint(form, blueprints);
  const codeSubject = getFormSubjectFromCode(form.form_code);
  const blueprintSubject = bp?.subject ? normalizeAdmissionSubject(bp.subject) : null;
  // Form-code prefixes are immutable public share codes. If legacy data points a SCI/MAT
  // code at an English blueprint, keep the candidate UI safe by refusing to label it English.
  return codeSubject ?? blueprintSubject ?? 'english';
};

const isFormCodeSubjectConflict = (form: Pick<AdmTestForm, 'blueprint_id' | 'form_code'>, blueprints: AdmBlueprint[]) => {
  const bp = getFormBlueprint(form, blueprints);
  const codeSubject = getFormSubjectFromCode(form.form_code);
  const blueprintSubject = bp?.subject ? normalizeAdmissionSubject(bp.subject) : null;
  return !!codeSubject && !!blueprintSubject && codeSubject !== blueprintSubject;
};

const getAdmissionFormTitle = (form: Pick<AdmTestForm, 'blueprint_id' | 'form_code'>, blueprints: AdmBlueprint[]) => {
  const grade = getFormGrade(form, blueprints);
  const subject = admissionSubjectLabel(getFormSubject(form, blueprints));
  return `${grade ? `Grade ${grade} ` : ''}${subject} Admission Test`;
};

type AdmissionLifecycleStatus = 'not_sent' | 'sent' | 'in_progress' | 'submitted' | 'scored' | 'retake_available';

const getAdmissionLifecycleStatus = (attempt?: AdmAttempt, hasPublishedLink = true, retakeAvailable = false): AdmissionLifecycleStatus => {
  if (retakeAvailable) return 'retake_available';
  if (!attempt) return hasPublishedLink ? 'sent' : 'not_sent';
  if (attempt.status === 'scored') return 'scored';
  if (attempt.status === 'submitted' || attempt.status === 'expired') return 'submitted';
  return 'in_progress';
};

// Compatibility note for regression tests: legacy calls looked like {getAttemptLabel(attempt)}; new calls pass shared link context.
const getAttemptLabel = (attempt?: AdmAttempt, hasPublishedLink = true, retakeAvailable = false) => {
  const status = getAdmissionLifecycleStatus(attempt, hasPublishedLink, retakeAvailable);
  const labels: Record<AdmissionLifecycleStatus, string> = {
    not_sent: 'Not sent', sent: 'Sent', in_progress: 'In progress', submitted: 'Submitted', scored: 'Scored', retake_available: 'Retake available',
  };
  return labels[status];
};

const isFinalAdmissionAttempt = (attempt?: AdmAttempt) => !!attempt && ['submitted', 'scored', 'expired'].includes(attempt.status);


// ── Main Component ──

const AdmissionHub: React.FC<AdmissionHubProps> = ({ onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdmTab>('overview');
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const { schoolName: reportSchoolName, schoolLogoUrl: reportSchoolLogoUrl } = useSchoolBranding({ schoolId, schoolName });

  // Data
  const [pools, setPools] = useState<AdmQuestionPool[]>([]);
  const [blueprints, setBlueprints] = useState<AdmBlueprint[]>([]);
  const [forms, setForms] = useState<AdmTestForm[]>([]);
  const [candidates, setCandidates] = useState<AdmCandidate[]>([]);
  const [attempts, setAttempts] = useState<AdmAttempt[]>([]);
  const [placements, setPlacements] = useState<AdmPlacementResult[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  // Forms state
  const [creatingBlueprint, setCreatingBlueprint] = useState(false);
  const [creatingCandidate, setCreatingCandidate] = useState(false);
  const [generatingForm, setGeneratingForm] = useState(false);
  const [isGeneratingForm, setIsGeneratingForm] = useState(false);

  // Blueprint form
  const [bpName, setBpName] = useState('');
  const [bpSubject, setBpSubject] = useState('english');
  const [bpPoolId, setBpPoolId] = useState<string | null>(null);
  const [bpTargetStage, setBpTargetStage] = useState(9);
  const [bpDuration, setBpDuration] = useState(45);
  const [bpTotalMarks, setBpTotalMarks] = useState(27);
  const [bpPassPercentage, setBpPassPercentage] = useState(50);
  const [bpDelivery, setBpDelivery] = useState<'practice' | 'exam'>('exam');
  const [bpDistribution, setBpDistribution] = useState(BLUEPRINT_PRESETS.english.distribution);

  // Distribution builder (interactive rows)
  const [distRows, setDistRows] = useState<{type: string; easy: number; medium: number; hard: number}[]>([
    { type: 'mcq', easy: 5, medium: 8, hard: 1 },
  ]);

  // Candidate form
  const [candName, setCandName] = useState('');
  const [candEmail, setCandEmail] = useState('');
  const [candPhone, setCandPhone] = useState('');
  const [candAppliedGrade, setCandAppliedGrade] = useState('');
  const [candCurrentGrade, setCandCurrentGrade] = useState('');
  const [candDob, setCandDob] = useState('');
  const [candPreviousCurriculum, setCandPreviousCurriculum] = useState('');
  const [candPreviousSchoolLanguage, setCandPreviousSchoolLanguage] = useState('');
  const [candHomeLanguage, setCandHomeLanguage] = useState('');
  const [candYearsEnglishMedium, setCandYearsEnglishMedium] = useState('');
  const [candNotes, setCandNotes] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Form generation
  const [genBlueprintId, setGenBlueprintId] = useState('');
  const [genFormCode, setGenFormCode] = useState('');

  // Guided wizard
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardName, setWizardName] = useState(() => buildAdmissionWizardDefaultName(7, 'english'));
  const [wizardNameEdited, setWizardNameEdited] = useState(false);
  const [wizardGrade, setWizardGrade] = useState(7);
  const [wizardSubject, setWizardSubject] = useState('english');
  const [wizardDescription, setWizardDescription] = useState('');
  const [wizardDifficulty, setWizardDifficulty] = useState<WizardDifficulty>('balanced');
  const [wizardQuestionCount, setWizardQuestionCount] = useState(25);
  const [wizardDuration, setWizardDuration] = useState(WIZARD_DIFFICULTY_META.balanced.duration);
  const [wizardPassPercentage, setWizardPassPercentage] = useState(WIZARD_DIFFICULTY_META.balanced.pass);
  const [wizardSource, setWizardSource] = useState<WizardSource>('auto');
  const [wizardPoolId, setWizardPoolId] = useState<string>('');
  const [wizardQuestions, setWizardQuestions] = useState<AdmQuestion[]>([]);
  const [wizardCheckingAvailability, setWizardCheckingAvailability] = useState(false);
  const [wizardGenerating, setWizardGenerating] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardResult, setWizardResult] = useState<{ blueprint: AdmBlueprint; form: AdmTestForm | null; formCode: string } | null>(null);
  const [wizardBlueprintId, setWizardBlueprintId] = useState<string | null>(null);

  // Candidate search
  const [candSearch, setCandSearch] = useState('');
  const [candStatusFilter, setCandStatusFilter] = useState<string>('all');

  // Share modal
  const [shareModalCandidate, setShareModalCandidate] = useState<AdmCandidate | null>(null);
  const [shareModalForm, setShareModalForm] = useState<AdmTestForm | null>(null);

  // Report modal
  const [reportData, setReportData] = useState<CandidateReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [generatingAiReport, setGeneratingAiReport] = useState(false);
  const [reportAttemptId, setReportAttemptId] = useState<string | null>(null);
  const reportPartialAttemptMetrics = useMemo(() => resolveAdmissionReportPartialAttempt(reportData as any), [reportData]);
  const visibleReportScoreTotal = reportData?.total_score ?? 0;
  const visibleReportQuestionTotal = reportData?.max_score ?? 0;
  const visibleReportAnsweredCount = (reportData?.answers ?? []).length;
  const visibleReportPartialAttemptMetrics = useMemo(() => resolveAdmissionReportVisiblePartialAttempt({
    totalScore: visibleReportScoreTotal,
    totalQuestions: visibleReportQuestionTotal,
    answeredCount: visibleReportAnsweredCount,
  }), [visibleReportScoreTotal, visibleReportQuestionTotal, visibleReportAnsweredCount]);

  useEffect(() => {
    if (!reportData) return;
    const raw = reportData as any;
    const answersLength = Array.isArray(raw.answers) ? raw.answers.length : 0;
    const impliedPartialAttempt = answersLength > 0 && (Number(raw.max_score ?? raw.maxScore ?? raw.attempt?.max_score) > answersLength);
    if (import.meta.env.DEV && impliedPartialAttempt && !reportPartialAttemptMetrics.partialAttempt) {
      console.warn('Admission report partial attempt fields were not resolved', {
        attemptId: raw.attempt_id ?? raw.attemptId ?? raw.attempt?.id ?? reportAttemptId,
        totalScore: raw.total_score ?? raw.totalScore ?? raw.attempt?.total_score,
        maxScore: raw.max_score ?? raw.maxScore ?? raw.attempt?.max_score,
        answeredCount: reportPartialAttemptMetrics.answeredCount,
        totalQuestions: reportPartialAttemptMetrics.totalQuestions,
        answersLength,
        reportKeys: Object.keys(raw),
      });
    }
  }, [reportData, reportPartialAttemptMetrics, reportAttemptId]);

  // Candidate file modal
  const [candidateFileId, setCandidateFileId] = useState<string | null>(null);
  const [showOtherGradeFormsForCandidate, setShowOtherGradeFormsForCandidate] = useState<Record<string, boolean>>({});
  const overviewCardsRef = useRef<HTMLDivElement | null>(null);
  const [admissionConfirm, setAdmissionConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    requiresReason?: boolean;
    reasonPlaceholder?: string;
    onConfirm: (reason?: string) => Promise<void>;
  } | null>(null);
  const [admissionConfirmBusy, setAdmissionConfirmBusy] = useState(false);
  const [admissionConfirmReason, setAdmissionConfirmReason] = useState('');

  // ── Bootstrap ──

  const loadSchool = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: membership } = await supabase
      .from('school_members')
      .select('school_id, schools!inner(name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('role_in_school', ['school_admin', 'teacher'])
      .limit(1)
      .maybeSingle();
    if (membership) {
      setSchoolId(membership.school_id);
      setSchoolName((membership as any).schools?.name ?? '');
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [p, bp, f, c, a, pl] = await Promise.all([
        AdmService.fetchQuestionPools(schoolId),
        AdmService.fetchBlueprints(schoolId),
        AdmService.fetchTestForms(schoolId),
        AdmService.fetchCandidates(schoolId),
        AdmService.fetchAttempts(schoolId),
        AdmService.fetchPlacementResults(schoolId),
      ]);
      setPools(p);
      setBlueprints(bp);
      setForms(f);
      setCandidates(c);
      setAttempts(a);
      setPlacements(pl);
    } catch (err: any) {
      console.warn('Admission data load failed', err);
      addToast(friendlyAdmissionError(err.message, 'Admission Hub could not load right now. Please refresh and try again.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, addToast]);

  useEffect(() => { loadSchool(); }, [loadSchool]);
  useEffect(() => { if (schoolId) loadAll(); }, [schoolId, loadAll]);

  // Load audit log on demand
  useEffect(() => {
    if (activeTab === 'audit' && schoolId) {
      AdmService.fetchAuditLog(schoolId).then(setAuditLog).catch(() => {});
    }
  }, [activeTab, schoolId]);

  // ── Handlers ──

  // Pools filtered by selected subject
  const subjectPools = useMemo(() => pools.filter(p => p.subject === bpSubject && p.is_active), [pools, bpSubject]);

  const wizardMatchingPools = useMemo(() => {
    return pools.filter(p => p.is_active && p.subject === wizardSubject && (wizardSource === 'pool' ? p.id === wizardPoolId : p.stage === wizardGrade));
  }, [pools, wizardSubject, wizardGrade, wizardSource, wizardPoolId]);

  const wizardDistribution = useMemo(() => buildWizardDistribution(wizardQuestionCount, wizardDifficulty, wizardQuestions, wizardSubject), [wizardQuestionCount, wizardDifficulty, wizardQuestions, wizardSubject]);
  const wizardAvailability = useMemo(() => countDistributionQuestions(wizardQuestions, wizardDistribution), [wizardQuestions, wizardDistribution]);
  const wizardCanGenerate = wizardAvailability.canGenerate && wizardAvailability.required === wizardQuestionCount;
  const wizardSubjectLabel = getAdmissionWizardSubjectLabel(wizardSubject);
  const wizardFormCodePreview = useMemo(() => {
    const subjectCode = wizardSubject.slice(0, 3).toUpperCase();
    return `${subjectCode}${wizardGrade}-${new Date().getFullYear()}-new`;
  }, [wizardGrade, wizardSubject]);


  const resetWizardForNewTest = useCallback(() => {
    const defaultGrade = 7;
    const defaultSubject = 'english';
    setWizardStep(1);
    setWizardGrade(defaultGrade);
    setWizardSubject(defaultSubject);
    setWizardName(buildAdmissionWizardDefaultName(defaultGrade, defaultSubject));
    setWizardNameEdited(false);
    setWizardDescription('');
    setWizardDifficulty('balanced');
    setWizardQuestionCount(25);
    setWizardDuration(WIZARD_DIFFICULTY_META.balanced.duration);
    setWizardPassPercentage(WIZARD_DIFFICULTY_META.balanced.pass);
    setWizardSource('auto');
    setWizardPoolId('');
    setWizardQuestions([]);
    setWizardError(null);
    setWizardResult(null);
    setWizardBlueprintId(null);
  }, []);

  useEffect(() => {
    const meta = WIZARD_DIFFICULTY_META[wizardDifficulty];
    if (wizardDifficulty !== 'custom') {
      setWizardDuration(meta.duration);
      setWizardPassPercentage(meta.pass);
    }
  }, [wizardDifficulty]);

  useEffect(() => {
    if (!wizardNameEdited) {
      setWizardName(buildAdmissionWizardDefaultName(wizardGrade, wizardSubject));
    }
    setWizardPoolId('');
    setWizardBlueprintId(null);
    setWizardResult(null);
    setWizardError(null);
  }, [wizardGrade, wizardSubject, wizardNameEdited]);

  useEffect(() => {
    let cancelled = false;
    const loadWizardQuestions = async () => {
      setWizardCheckingAvailability(true);
      try {
        const matching = pools.filter(p => p.is_active && p.subject === wizardSubject && (wizardSource === 'pool' ? p.id === wizardPoolId : p.stage === wizardGrade));
        const lists = await Promise.all(matching.map(p => AdmService.fetchQuestions(p.id)));
        if (!cancelled) setWizardQuestions(lists.flat());
      } catch {
        if (!cancelled) setWizardQuestions([]);
      } finally {
        if (!cancelled) setWizardCheckingAvailability(false);
      }
    };
    if (schoolId) loadWizardQuestions();
    return () => { cancelled = true; };
  }, [schoolId, pools, wizardSubject, wizardGrade, wizardSource, wizardPoolId]);

  const handleWizardGenerate = async () => {
    if (!schoolId || wizardGenerating) return;
    setWizardError(null);
    if (!wizardName.trim()) { setWizardError('Please add a test name.'); setWizardStep(1); return; }
    if (wizardQuestionCount < 1) { setWizardError('Please choose at least 1 question.'); setWizardStep(2); return; }
    if (wizardMatchingPools.length === 0) { setWizardError(`No active ${wizardSubjectLabel} question pool is available for Grade / Stage ${wizardGrade}.`); setWizardStep(3); return; }
    if (!wizardCanGenerate) { setWizardError(`Not enough published questions yet: ${wizardAvailability.missing.join(', ') || `${wizardQuestionCount - wizardAvailability.required} more matching published questions`}.`); setWizardStep(3); return; }

    const quota = await tryConsumePilotQuota('admission_tests');
    if (!quota.proceed) { setWizardError(quota.error || 'You have reached the admission test limit on the Pilot plan.'); return; }

    setWizardGenerating(true);
    try {
      let blueprint = wizardBlueprintId ? blueprints.find(bp => bp.id === wizardBlueprintId) || null : null;
      if (!blueprint) {
        blueprint = await AdmService.createBlueprint({
          school_id: schoolId,
          pool_id: wizardSource === 'pool' ? wizardPoolId : null,
          name: buildAdmissionWizardBlueprintName(wizardName),
          subject: wizardSubject,
          target_grade: wizardGrade,
          target_stage: wizardGrade,
          total_marks: wizardQuestionCount,
          duration_minutes: wizardDuration,
          question_distribution: wizardDistribution,
          delivery_mode: 'exam',
          pass_percentage: wizardPassPercentage,
          is_active: true,
          created_by: null,
        });
        setWizardBlueprintId(blueprint.id);
      }

      const res = await AdmService.generateTestForm(blueprint.id);
      if (!res.success || !res.form_id) throw new Error([res.error || 'Generation failed', res.debug_reason ? `Admin debug: ${res.debug_reason}` : null].filter(Boolean).join(' — '));
      const publishRes = await AdmService.publishForm(res.form_id);
      if (!publishRes.success) throw new Error(publishRes.error || 'Publish failed');
      await loadAll();
      const createdForm = (await AdmService.fetchTestForms(schoolId)).find(f => f.id === res.form_id) || null;
      setWizardResult({ blueprint, form: createdForm, formCode: createdForm?.form_code || res.form_code || wizardFormCodePreview });
      setWizardStep(5);
      addToast('Admission test generated and ready to share', 'success');
    } catch (err: any) {
      console.warn('Admission wizard generation failed', err);
      setWizardError(`${friendlyAdmissionError(err.message)}${err.message?.includes('Admin debug:') ? ` (${err.message.split('Admin debug:').pop()?.trim()})` : ''}`);
    } finally {
      setWizardGenerating(false);
    }
  };

  // Auto-apply preset when subject changes
  const applySubjectPreset = (subject: string) => {
    setBpSubject(subject);
    setBpPoolId(null); // reset pool selection
    const preset = BLUEPRINT_PRESETS[subject];
    if (preset) {
      setBpTotalMarks(preset.marks);
      setBpDuration(preset.duration);
      setBpDistribution(preset.distribution);
      setBpName(`${preset.label} Stage ${bpTargetStage} — Admission Test`);
      // Convert preset JSON to distRows for the builder UI
      try {
        const parsed = JSON.parse(preset.distribution);
        const rows: {type: string; easy: number; medium: number; hard: number}[] = [];
        Object.entries(parsed).forEach(([type, diffs]: [string, any]) => {
          rows.push({ type, easy: diffs.easy || 0, medium: diffs.medium || 0, hard: diffs.hard || 0 });
        });
        setDistRows(rows.length ? rows : [{ type: 'mcq', easy: 0, medium: 0, hard: 0 }]);
      } catch { setDistRows([{ type: 'mcq', easy: 5, medium: 5, hard: 0 }]); }
    }
  };

  // When a pool is selected, auto-fill stage and name
  const handlePoolSelect = (poolId: string) => {
    setBpPoolId(poolId || null);
    if (!poolId) return;
    const pool = pools.find(p => p.id === poolId);
    if (pool) {
      if (pool.stage) setBpTargetStage(pool.stage);
      const preset = BLUEPRINT_PRESETS[pool.subject];
      const label = preset?.label || pool.subject;
      setBpName(`${label} Stage ${pool.stage || bpTargetStage} — Admission Test`);
    }
  };

  // Auto-generate form code
  const generateFormCode = (blueprintId: string) => {
    setGenBlueprintId(blueprintId);
    const bp = blueprints.find(b => b.id === blueprintId);
    if (bp) {
      const subCode = bp.subject.slice(0, 3).toUpperCase();
      const year = new Date().getFullYear();
      const letter = String.fromCharCode(65 + forms.filter(f => f.blueprint_id === blueprintId).length);
      setGenFormCode(`${subCode}${bp.target_stage || 9}-${year}-${letter}`);
    }
  };

  const handleCreateBlueprint = async () => {
    if (!schoolId || !bpName) return;
    setCreatingBlueprint(true);
    try {
      // Build distribution from distRows
      const dist: Record<string, any> = {};
      for (const row of distRows) {
        if (!row.type) continue;
        const diffs: Record<string, number> = {};
        if (row.easy > 0) diffs.easy = row.easy;
        if (row.medium > 0) diffs.medium = row.medium;
        if (row.hard > 0) diffs.hard = row.hard;
        if (Object.keys(diffs).length > 0) dist[row.type] = diffs;
      }
      if (Object.keys(dist).length === 0) { addToast('Add at least one question type with a count > 0', 'error'); return; }
      await AdmService.createBlueprint({
        school_id: schoolId,
        pool_id: bpPoolId,
        name: bpName,
        subject: bpSubject,
        target_grade: null,
        target_stage: bpTargetStage,
        total_marks: bpTotalMarks,
        duration_minutes: bpDuration,
        question_distribution: dist,
        delivery_mode: bpDelivery,
        pass_percentage: bpPassPercentage,
        is_active: true,
        created_by: null,
      });
      addToast('Blueprint created', 'success');
      setBpName(''); setBpPoolId(null); setBpDistribution(BLUEPRINT_PRESETS[bpSubject]?.distribution || '{}');
      await loadAll();
    } catch (err: any) {
      console.warn('Admission setup save failed', err);
      addToast(friendlyAdmissionError(err.message, 'Test setup could not be saved. Please try again.'), 'error');
    } finally {
      setCreatingBlueprint(false);
    }
  };

  const handleGenerateForm = async () => {
    if (!genBlueprintId || !genFormCode || isGeneratingForm) return;

    // Consume pilot quota if applicable
    const quota = await tryConsumePilotQuota('admission_tests');
    if (!quota.proceed) {
      addToast(quota.error || 'You\'ve reached the admission test limit on the Pilot plan. Upgrade to continue.', 'error');
      return;
    }

    setIsGeneratingForm(true);
    try {
      const res = await AdmService.generateTestForm(genBlueprintId, genFormCode);
      if (res.success) {
        addToast(`Form ${genFormCode} generated`, 'success');
        setGenFormCode('');
        await loadAll();
      } else {
        addToast(friendlyAdmissionError(res.error, 'Test could not be generated. Please check availability and try again.'), 'error');
      }
    } finally {
      setIsGeneratingForm(false);
    }
  };

  const handlePublishForm = async (formId: string) => {
    const res = await AdmService.publishForm(formId);
    if (res.success) { addToast('Form published', 'success'); await loadAll(); }
    else addToast(friendlyAdmissionError(res.error, 'Test could not be made available. Please try again.'), 'error');
  };

  const handleCloseForm = async (formId: string) => {
    const res = await AdmService.closeForm(formId);
    if (res.success) { addToast('Form closed', 'success'); await loadAll(); }
    else addToast(friendlyAdmissionError(res.error, 'Test could not be closed. Please try again.'), 'error');
  };

  // Delete handlers
  const handleDeleteBlueprint = (id: string) => {
    setAdmissionConfirm({ title: 'Delete this test setup?', description: 'Generated forms will remain, but this blueprint will no longer be available for future tests.', confirmLabel: 'Delete setup', onConfirm: async () => {
      try { await AdmService.deleteBlueprint(id); addToast('Blueprint deleted', 'success'); await loadAll(); }
      catch (err: any) { console.warn('Admission setup delete failed', err); addToast(friendlyAdmissionError(err.message, 'Test setup could not be deleted.'), 'error'); }
    } });
  };

  const handleDeleteForm = (id: string) => {
    setAdmissionConfirm({ title: 'Delete this admission test?', description: 'The form and its questions will be deleted. Existing candidate attempts may also be affected.', confirmLabel: 'Delete test', onConfirm: async () => {
      try { await AdmService.deleteTestForm(id); addToast('Form deleted', 'success'); await loadAll(); }
      catch (err: any) { console.warn('Admission test delete failed', err); addToast(friendlyAdmissionError(err.message, 'Test could not be deleted.'), 'error'); }
    } });
  };

  const handleDeleteCandidate = (id: string) => {
    setAdmissionConfirm({ title: 'Delete this candidate?', description: 'This permanently removes the candidate, attempts, answers and placement records. This cannot be undone.', confirmLabel: 'Delete candidate', onConfirm: async () => {
      try { await AdmService.deleteCandidate(id); addToast('Candidate deleted', 'success'); await loadAll(); }
      catch (err: any) { console.warn('Admission candidate delete failed', err); addToast(friendlyAdmissionError(err.message, 'Candidate could not be deleted.'), 'error'); }
    } });
  };

  const handleDeleteAttempt = (id: string) => {
    setAdmissionConfirm({ title: 'Delete this test attempt?', description: 'The attempt and all submitted answers will be permanently removed. This cannot be undone.', confirmLabel: 'Delete attempt', onConfirm: async () => {
      try { await AdmService.deleteAttempt(id); addToast('Attempt deleted', 'success'); await loadAll(); }
      catch (err: any) { console.warn('Admission attempt delete failed', err); addToast(friendlyAdmissionError(err.message, 'Attempt history could not be deleted.'), 'error'); }
    } });
  };

  const handleCreateCandidate = async () => {
    if (!schoolId || !candName || !candEmail || !candPhone || !candAppliedGrade) {
      addToast('Please fill in all required fields (Name, Email, Phone, Grade)', 'error');
      return;
    }
    setCreatingCandidate(true);
    try {
      await AdmService.createCandidate({
        school_id: schoolId,
        full_name: candName,
        email: candEmail || null,
        parent_phone: candPhone || null,
        applied_grade: candAppliedGrade ? parseInt(candAppliedGrade, 10) : null,
        current_grade: candCurrentGrade ? parseInt(candCurrentGrade, 10) : null,
        date_of_birth: candDob || null,
        previous_curriculum: candPreviousCurriculum || null,
        previous_school_language: candPreviousSchoolLanguage || null,
        home_language: candHomeLanguage || null,
        years_english_medium: candYearsEnglishMedium ? Number(candYearsEnglishMedium) : null,
        notes: candNotes || null,
        admin_notes: candNotes || null,
      });
      addToast('Candidate registered', 'success');
      setCandName(''); setCandEmail(''); setCandPhone(''); setCandAppliedGrade(''); setCandCurrentGrade(''); setCandDob(''); setCandPreviousCurriculum(''); setCandPreviousSchoolLanguage(''); setCandHomeLanguage(''); setCandYearsEnglishMedium(''); setCandNotes('');
      await loadAll();
    } catch (err: any) {
      console.warn('Admission candidate create failed', err);
      addToast(friendlyAdmissionError(err.message, 'Candidate could not be registered. Please check the details and try again.'), 'error');
    } finally {
      setCreatingCandidate(false);
    }
  };

  // Bulk import candidates from pasted text (name, email, phone per line)
  const handleBulkImport = async () => {
    if (!schoolId || !bulkText.trim()) return;
    setCreatingCandidate(true);
    try {
      const lines = bulkText.trim().split('\n').filter(l => l.trim());
      const parsed = lines.map(line => {
        const parts = line.split(/[,\t]/).map(p => p.trim());
        return {
          school_id: schoolId!,
          full_name: parts[0] || '',
          email: parts[1] || null,
          parent_phone: parts[2] || null,
          applied_grade: parts[3] ? parseInt(parts[3], 10) : null,
          notes: null,
        };
      }).filter(c => c.full_name);

      if (parsed.length === 0) { addToast('No valid entries found', 'error'); return; }
      await AdmService.bulkCreateCandidates(parsed);
      addToast(`${parsed.length} candidate(s) imported`, 'success');
      setBulkText('');
      setBulkMode(false);
      await loadAll();
    } catch (err: any) {
      console.warn('Admission candidate bulk import failed', err);
      addToast(friendlyAdmissionError(err.message, 'Candidate import could not be completed. Please check the pasted list.'), 'error');
    } finally {
      setCreatingCandidate(false);
    }
  };

  // Share via WhatsApp
  const shareViaWhatsApp = (phone: string | null, link: string, candidateName: string) => {
    const msg = encodeURIComponent(`Hello,\n\nThis is the admission test for *${schoolName || 'our school'}* for the student *${candidateName}*.\n\n${link}\n\nPlease complete the test before the deadline. Good luck!`);
    const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  };

  // Share via Email
  const shareViaEmail = (email: string | null, link: string, candidateName: string) => {
    const subject = encodeURIComponent(`Admission Test for ${candidateName} — ${schoolName || 'Our School'}`);
    const body = encodeURIComponent(`Hello,\n\nThis is the admission test for ${schoolName || 'our school'} for the student ${candidateName}.\n\n${link}\n\nPlease complete the test before the deadline. Good luck!`);
    window.open(`mailto:${email || ''}?subject=${subject}&body=${body}`, '_blank');
  };

  const buildReportContext = (attemptId: string): AdmService.CandidateReportContext => {
    const attempt = attempts.find(a => a.id === attemptId) ?? null;
    const form = attempt ? forms.find(f => f.id === attempt.form_id) : null;
    const blueprint = form ? blueprints.find(b => b.id === form.blueprint_id) : null;
    const candidate = attempt ? candidates.find(c => c.id === attempt.candidate_id) : null;
    const subject = blueprint?.subject ?? (form ? getFormSubject(form, blueprints) : null);
    const grade = candidate?.applied_grade ?? blueprint?.target_grade ?? blueprint?.target_stage ?? (form ? getFormGrade(form, blueprints) : null);
    return {
      form_code: form?.form_code ?? null,
      form_subject: subject ?? null,
      form_title: form ? getAdmissionFormTitle(form, blueprints) : null,
      grade,
      content_version: blueprint?.content_version ?? null,
      candidate: candidate ? { applied_grade: candidate.applied_grade, name: candidate.full_name } : null,
      attempt,
    };
  };

  const handleViewReport = async (attemptId: string) => {
    setReportLoading(true);
    setShowReport(true);
    setReportAttemptId(attemptId);
    setShowAnswers(false);
    try {
      const report = await AdmService.getCandidateReport(attemptId, buildReportContext(attemptId));
      const activity = await AdmService.getAttemptActivity(attemptId).catch(() => ({ notes: [], events: [] }));
      setReportData(report ? { ...report, activity_notes: activity.notes, activity_events: activity.events } : report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Report data unavailable');
      addToast(friendlyAdmissionError(message, 'Report is unavailable right now. Please try again.'), 'error');
      setShowReport(false);
    } finally {
      setReportLoading(false);
    }
  };

  const printAdmissionReport = (audience: 'family' | 'internal') => {
    if (!reportData) return;
    const list = (items: string[] | undefined, fallback: string) => `<ul>${items?.length ? items.map((item) => `<li>${escapeSchoolDocumentHtml(item)}</li>`).join('') : `<li>${escapeSchoolDocumentHtml(fallback)}</li>`}</ul>`;
    const recommendation = reportData.placement_recommendation;
    const profile = reportData.candidate_profile;
    const diagnosticRows = (reportData.diagnostic_breakdown ?? []).map((row) => `<tr><td>${escapeSchoolDocumentHtml(row.label)}</td><td>${escapeSchoolDocumentHtml(row.score)}/${escapeSchoolDocumentHtml(row.maxScore)}</td><td>${escapeSchoolDocumentHtml(row.percentage)}%</td></tr>`).join('');
    const answerRows = (reportData.answers ?? []).map((answer, index) => {
      const response = typeof answer.response === 'object' ? JSON.stringify(answer.response) : answer.response || '(no answer)';
      const correctAnswer = typeof answer.correct_answer === 'object' ? JSON.stringify(answer.correct_answer) : answer.correct_answer ?? '—';
      return `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(answer.stem)}</td><td>${escapeSchoolDocumentHtml(response)}</td><td>${escapeSchoolDocumentHtml(correctAnswer)}</td><td>${answer.marks_awarded}/${answer.marks_possible}</td></tr>`;
    }).join('');
    const privateSection = audience === 'internal' ? `
      <section class="document-page-break"><h2>Confidential candidate profile</h2>
        <div class="document-grid">
          <div class="document-card"><strong>Applying for</strong><p>Grade ${escapeSchoolDocumentHtml(profile?.applied_grade ?? '—')}</p></div>
          <div class="document-card"><strong>Current grade</strong><p>${escapeSchoolDocumentHtml(profile?.current_grade ?? '—')}</p></div>
          <div class="document-card"><strong>Previous curriculum</strong><p>${escapeSchoolDocumentHtml(profile?.previous_curriculum ?? '—')}</p></div>
          <div class="document-card"><strong>Language context</strong><p>School: ${escapeSchoolDocumentHtml(profile?.previous_school_language ?? '—')} · Home: ${escapeSchoolDocumentHtml(profile?.home_language ?? '—')}</p></div>
        </div>
        <h2>Internal activity review</h2><div class="document-callout document-callout--private"><strong>Context, not an automatic misconduct finding</strong>${list(reportData.activity_notes, 'No activity concerns were recorded.')}</div>
        <section class="document-appendix"><h2>Answer evidence appendix</h2>${reportData.answer_details_available === false ? `<p>${escapeSchoolDocumentHtml(reportData.answer_detail_message || 'Detailed answers are unavailable.')}</p>` : `<table><thead><tr><th>No.</th><th>Question</th><th>Candidate response</th><th>Expected answer</th><th>Marks</th></tr></thead><tbody>${answerRows}</tbody></table>`}</section>
      </section>` : '';
    const bodyHtml = `
      ${reportData.partial_attempt ? `<div class="document-callout document-callout--warning"><strong>Partial attempt</strong><p>${escapeSchoolDocumentHtml(reportData.answered_count ?? reportData.answers.length)} of ${escapeSchoolDocumentHtml(reportData.total_questions ?? reportData.max_score)} questions were answered. Interpret the result with care.</p></div>` : ''}
      <h2>Assessment outcome</h2>
      <div class="document-grid"><div class="document-card"><strong>Overall result</strong><p>${reportData.total_score}/${reportData.max_score} · ${reportData.percentage}% · Band ${escapeSchoolDocumentHtml(reportData.band)}</p></div><div class="document-card"><strong>Placement recommendation</strong><p>${escapeSchoolDocumentHtml(recommendation?.label || 'School review required')}</p></div></div>
      ${recommendation ? `<div class="document-callout"><strong>Rationale</strong>${list(recommendation.reasons, 'The school will review the available assessment evidence.')}<p><strong>Next action:</strong> ${escapeSchoolDocumentHtml(recommendation.nextAction)}</p></div>` : ''}
      ${diagnosticRows ? `<h2>Diagnostic profile</h2><table><thead><tr><th>Area</th><th>Score</th><th>Attainment</th></tr></thead><tbody>${diagnosticRows}</tbody></table>` : ''}
      <div class="document-grid"><div class="document-card"><strong>Demonstrated strengths</strong>${list(reportData.strengths, 'More completed evidence is needed to identify secure strengths.')}</div><div class="document-card"><strong>Priority growth areas</strong>${list(reportData.weaknesses, 'No major growth area was identified from this attempt.')}</div></div>
      ${reportData.ai_summary ? `<h2>Assessment summary</h2><p>${escapeSchoolDocumentHtml(reportData.ai_summary)}</p>` : ''}
      ${audience === 'family' ? '<div class="document-callout"><strong>What happens next</strong><p>The admissions team will consider this assessment together with the candidate’s wider application. This report is not, by itself, a final admission decision.</p></div><div class="document-signatures"><div class="document-signature">Admissions representative · Name / signature / date</div><div class="document-signature">Parent or guardian · Name / signature / date</div></div>' : privateSection}`;
    try {
      openSchoolDocumentPreview({
        meta: {
          documentId: createSchoolDocumentId('admission'),
          templateVersion: audience === 'family' ? 'admission-family-v1' : 'admission-internal-v1',
          title: audience === 'family' ? 'Admission Assessment Summary' : 'Admission Committee Report',
          subtitle: reportData.form_label || AdmService.buildAdmissionReportFormLabel(reportData.form_code, profile?.applied_grade, reportData.answers?.[0]?.subject),
          schoolName: reportSchoolName,
          schoolLogoUrl: reportSchoolLogoUrl,
          audience,
          status: reportData.partial_attempt ? 'draft' : 'final',
          confidentiality: audience === 'family' ? 'family-copy' : 'confidential',
          generatedAt: new Date().toISOString(),
          generatedBy: 'School Administration',
          studentName: reportData.candidate_name,
          subject: reportData.formSubject || reportData.subject || reportData.answers?.[0]?.subject || undefined,
          schoolId,
          visibilityScope: 'admin_only',
          sourceType: 'admission_attempt',
          sourceId: reportAttemptId || undefined,
        },
        bodyHtml,
        orientation: audience === 'internal' ? 'landscape' : 'portrait',
        fileName: schoolDocumentFileName(reportSchoolName, reportData.candidate_name, audience === 'family' ? 'Admission_Summary' : 'Admission_Committee_Report', new Date().toISOString().slice(0, 10)),
      });
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to open the admission document.', 'error');
    }
  };

  const handleGenerateAiReport = async (attemptId: string) => {
    if (!attemptId) return;
    setGeneratingAiReport(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/adm_generate_report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ attempt_id: attemptId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && reportData) {
        // Update ALL score fields so the UI reflects AI grading results
        setReportData({
          ...reportData,
          total_score: data.total_score ?? reportData.total_score,
          max_score: data.max_score ?? reportData.max_score,
          percentage: data.percentage ?? reportData.percentage,
          band: data.band ?? reportData.band,
          ai_summary: data.ai_summary ?? reportData.ai_summary,
          answers: data.answers ?? reportData.answers,
        });
      }
      addToast('AI report generated — scores updated', 'success');
      // Reload attempt list so the Results table also shows updated scores
      await loadAll();
    } catch (err: any) {
      console.warn('Admission AI report failed', err);
      addToast(friendlyAdmissionError(err.message, 'Recommendation report could not be generated yet.'), 'error');
    } finally {
      setGeneratingAiReport(false);
    }
  };


  const handleResetAttemptForRetake = async (attemptId: string) => {
    setAdmissionConfirmReason('Accidental interruption — allow retake');
    setAdmissionConfirm({
      title: 'Allow this candidate to retake?',
      description: 'This keeps the old attempt history and creates an audit log. The previous attempt remains as expired history.',
      confirmLabel: 'Allow retake',
      requiresReason: true,
      reasonPlaceholder: 'Enter a short reason',
      onConfirm: async (reason) => {
        if (!reason) return;
        try {
          const res = await AdmService.resetAttemptForRetake(attemptId, reason);
          if (res.success) { addToast('Attempt reset for retake. Share the same candidate link again.', 'success'); await loadAll(); }
          else addToast(friendlyAdmissionError(res.error, 'Attempt could not be reset.'), 'error');
        } catch (err: any) {
          console.warn('Admission attempt reset failed', err);
          addToast(friendlyAdmissionError(err.message, 'Attempt could not be reset.'), 'error');
        }
      },
    });
  };

  const handleRecordPlacement = async (attemptId: string, band: PlacementBand) => {
    const res = await AdmService.recordPlacement(attemptId, band, null, null, null);
    if (res.success) { addToast('Placement recorded', 'success'); await loadAll(); }
    else addToast(friendlyAdmissionError(res.error), 'error');
  };

  // ── Tab config ──

  const tabs: { key: AdmTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'create', label: 'Create Admission Test', icon: '✨' },
    { key: 'pools', label: 'Official Question Bank', icon: '🔒' },
    { key: 'blueprints', label: 'Advanced: Blueprints', icon: '📐' },
    { key: 'forms', label: 'Advanced: Test Forms', icon: '📋' },
    { key: 'candidates', label: 'Candidates', icon: '👤' },
    { key: 'results', label: 'Results', icon: '🏆' },
    { key: 'audit', label: 'Audit Log', icon: '📜' },
  ];

  // ── Computed data ──

  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (candSearch.trim()) {
      const q = candSearch.toLowerCase();
      list = list.filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.parent_phone || '').toLowerCase().includes(q)
      );
    }
    if (candStatusFilter !== 'all') {
      list = list.filter(c => c.status === candStatusFilter);
    }
    return list;
  }, [candidates, candSearch, candStatusFilter]);

  const bandDistribution = useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    placements.forEach(p => { if (counts[p.band] !== undefined) counts[p.band]++; });
    return counts;
  }, [placements]);

  useEffect(() => {
    if (activeTab !== 'overview' || !overviewCardsRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(overviewCardsRef.current.querySelectorAll('[data-admission-card]'), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out' });
  }, [activeTab, candidates.length, attempts.length, forms.length]);

  const pipelineProgress = useMemo(() => {
    return {
      pools: pools.length > 0,
      blueprints: blueprints.length > 0,
      forms: forms.some(f => f.status === 'published'),
      candidates: candidates.length > 0,
      results: attempts.some(a => a.status === 'scored'),
    };
  }, [pools, blueprints, forms, candidates, attempts]);

  // ── Render helpers ──

  const statCard = (label: string, value: number | string, icon: string, accent: string) => (
    <div data-admission-card className={`rounded-xl border ${accent} bg-white p-4 flex items-center gap-3 shadow-sm`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-2xl font-bold text-slate-950">{value}</div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );

  const bandBadge = (band: PlacementBand) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold ${BAND_COLORS[band]}`}>
      Band {band} <span className="font-normal opacity-75">· {BAND_LABELS[band]}</span>
    </span>
  );

  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-gray-500/20 text-slate-700 border-slate-300',
      published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      closed: 'bg-red-100 text-red-700 border-red-200',
      registered: 'bg-blue-500/20 text-blue-700 border-blue-500/40',
      testing: 'bg-amber-100 text-amber-700 border-amber-200',
      completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      placed: 'bg-purple-500/20 text-purple-700 border-purple-500/40',
      in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
      submitted: 'bg-blue-500/20 text-blue-700 border-blue-500/40',
      scored: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      pending: 'bg-gray-500/20 text-slate-600 border-slate-300',
      'not sent': 'bg-gray-500/20 text-slate-500 border-slate-300',
      expired: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold capitalize ${map[status] || 'bg-gray-500/20 text-slate-700'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1e4b82] focus:outline-none focus:ring-2 focus:ring-[#1e4b82]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
  const btnPrimary = 'rounded-lg bg-[#1e4b82] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#173d6c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e4b82]/30 disabled:cursor-not-allowed disabled:opacity-50';
  const btnSecondary = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e4b82]/20 disabled:cursor-not-allowed disabled:opacity-50';

  // ── RENDER ──

  if (loading && !schoolId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-cyan-700">
        <div className="h-8 w-8 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
        <span className="ml-3 text-sm">Loading Admission Hub…</span>
      </div>
    );
  }

  if (!schoolId) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onComplete} label="Back" />
        <div className="card-glass p-8 text-center">
          <span className="text-4xl mb-3 block">🏫</span>
          <h2 className="text-xl font-heading text-slate-900 mb-2">No School Access</h2>
          <p className="text-sm text-slate-600">You need school admin or teacher role to access the Admission Hub.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admission-hub-admin-theme mx-auto max-w-6xl space-y-6 overflow-x-hidden pb-12 text-slate-900">
      {/* Header */}
      <div className="admin-section-heading">
        <div className="flex-1">
          <p className="school-admin-eyebrow">Admissions</p>
          <h2>Admission Hub</h2>
          <p>Create admission tests, send candidate-specific links, track progress and review results.</p>
        </div>
        <button
          onClick={() => loadAll()}
          disabled={loading}
          className="rounded-lg border border-slate-300 hover:border-cyan-500 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:text-cyan-700 transition flex items-center gap-1.5 disabled:opacity-40"
          title="Refresh data"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 pb-2" role="tablist">
        {tabs.filter(t => MAIN_TABS.includes(t.key)).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTab === t.key
                ? 'bg-[#1e4b82] text-white border border-[#1e4b82]'
                : 'bg-slate-50 text-slate-600 border border-transparent hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center gap-2 text-cyan-700 text-sm py-4">
          <div className="h-4 w-4 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
          Loading data…
        </div>
      )}

      {/*  ━━━ CREATE ADMISSION TEST WIZARD ━━━  */}
      {activeTab === 'create' && !loading && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">School-friendly setup</p>
                <h2 className="mt-1 text-2xl font-heading text-slate-900">Create an admission test</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-700">Choose the grade, subject, length, and difficulty. The Hub will create the technical setup and test form behind the scenes.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {['Basics', 'Style', 'Questions', 'Review', 'Share'].map((label, i) => {
                const step = i + 1;
                return (
                  <button key={label} onClick={() => setWizardStep(step)} className={`rounded-xl border px-2 py-3 text-center text-xs transition ${wizardStep === step ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : wizardStep > step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                    <div className="text-lg">{wizardStep > step ? '✓' : step}</div>
                    <div className="font-semibold">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {wizardError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">⚠️ {wizardError}</div>}

          {wizardStep === 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-slate-900">Step 1: Test basics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><label className="block text-xs font-semibold text-slate-700 mb-1">Test name</label><input className={inputClass} value={wizardName} onChange={e => { setWizardNameEdited(true); setWizardName(e.target.value); }} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Grade / Stage</label><input type="number" min={1} className={inputClass} value={wizardGrade} onChange={e => setWizardGrade(+e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label><select className={inputClass} value={wizardSubject} onChange={e => setWizardSubject(e.target.value)}><option value="english">English</option><option value="math">Maths</option><option value="science">Science</option><option value="chemistry">Chemistry</option></select></div>
                <div className="md:col-span-2"><label className="block text-xs font-semibold text-slate-700 mb-1">Internal setup note <span className="text-slate-500">(optional, not shown to candidates yet)</span></label><textarea className={inputClass} rows={3} value={wizardDescription} onChange={e => setWizardDescription(e.target.value)} placeholder="Example: Remind office staff that calculators are not allowed. This note is not saved to the test." /><p className="mt-1 text-[11px] text-amber-700">Candidate-facing instructions are not supported by the current admission test backend, so this note is only for this setup session.</p></div>
              </div>
              <button onClick={() => setWizardStep(2)} disabled={!wizardName.trim()} className={btnPrimary}>Next: Test style</button>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-slate-900">Step 2: Test style</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {(Object.keys(WIZARD_DIFFICULTY_META) as WizardDifficulty[]).filter(key => key !== 'custom').map(key => <button key={key} onClick={() => setWizardDifficulty(key)} className={`rounded-xl border p-3 text-left ${wizardDifficulty === key ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}><div className="font-semibold text-slate-900">{WIZARD_DIFFICULTY_META[key].label}</div><div className="mt-1 text-xs text-slate-600">{WIZARD_DIFFICULTY_META[key].description}</div></button>)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Number of questions</label><input type="number" min={1} className={inputClass} value={wizardQuestionCount} onChange={e => setWizardQuestionCount(+e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Duration (minutes)</label><input type="number" min={5} className={inputClass} value={wizardDuration} onChange={e => setWizardDuration(+e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Pass mark (%)</label><input type="number" min={1} max={100} className={inputClass} value={wizardPassPercentage} onChange={e => setWizardPassPercentage(+e.target.value)} /></div>
              </div>
              <div className="flex gap-2"><button onClick={() => setWizardStep(1)} className={btnSecondary}>Back</button><button onClick={() => setWizardStep(3)} className={btnPrimary}>Next: Question source</button></div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-slate-900">Step 3: Question source</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={() => setWizardSource('auto')} className={`rounded-xl border p-4 text-left ${wizardSource === 'auto' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><div className="font-semibold text-slate-900">Recommended: auto-select official questions</div><div className="text-xs text-slate-600 mt-1">Use official locked Brain Heist content matching this subject and Grade / Stage.</div></button>
                <button onClick={() => setWizardSource('pool')} className={`rounded-xl border p-4 text-left ${wizardSource === 'pool' ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-slate-50'}`}><div className="font-semibold text-slate-900">Advanced: choose an official bank pool</div><div className="text-xs text-slate-600 mt-1">Limit this test to one readable official or legacy pool.</div></button>
              </div>
              {wizardSource === 'pool' && <div><label className="block text-xs font-semibold text-slate-700 mb-1">Question pool</label><select className={inputClass} value={wizardPoolId} onChange={e => setWizardPoolId(e.target.value)}><option value="">Choose a pool…</option>{pools.filter(p => p.is_active && p.subject === wizardSubject).map(p => <option key={p.id} value={p.id}>{p.name}{p.stage ? ` (Stage ${p.stage})` : ''}</option>)}</select></div>}
              <div className={`rounded-xl border p-4 ${wizardCanGenerate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center justify-between gap-3"><div className="font-semibold text-slate-900">Availability check</div>{wizardCheckingAvailability && <span className="text-xs text-cyan-700">Checking…</span>}</div>
                <p className="mt-1 text-sm text-slate-700">Found {wizardAvailability.availableForRequired} of {wizardQuestionCount} required matching published questions across {wizardMatchingPools.length} pool{wizardMatchingPools.length === 1 ? '' : 's'}.</p>
                {wizardCanGenerate ? <p className="mt-1 text-sm text-emerald-700">This setup can generate a valid admission test.</p> : <p className="mt-1 text-sm text-amber-800">{wizardMatchingPools.length === 0 ? `No active ${wizardSubjectLabel} pool matches Grade / Stage ${wizardGrade}.` : `Missing: ${wizardAvailability.missing.join(', ') || `${wizardQuestionCount - wizardAvailability.required} more matching published questions`}.`}</p>}
              </div>
              <div className="flex gap-2"><button onClick={() => setWizardStep(2)} className={btnSecondary}>Back</button><button onClick={() => setWizardStep(4)} disabled={!wizardCanGenerate} className={btnPrimary}>Next: Review</button></div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-slate-900">Step 4: Review & Generate</h3>
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-800">This will create a Grade {wizardGrade} {wizardSubjectLabel} admission test with {wizardQuestionCount} questions, {wizardDuration} minutes, {WIZARD_DIFFICULTY_META[wizardDifficulty].label.toLowerCase()} difficulty, pass mark {wizardPassPercentage}%.</div>
              {wizardDescription.trim() && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold text-slate-900">Internal setup note only:</span> {wizardDescription}<div className="mt-1 text-[11px] text-amber-700">This note is not saved or shown to candidates.</div></div>}
              <div className="text-xs text-slate-500">We’ll prepare and activate the test for candidate-specific links.</div>
              <div className="flex gap-2"><button onClick={() => setWizardStep(3)} disabled={wizardGenerating} className={btnSecondary}>Back</button><button onClick={handleWizardGenerate} disabled={wizardGenerating || !wizardCanGenerate} className={btnPrimary}>{wizardGenerating ? 'Generating admission test…' : 'Generate Admission Test'}</button></div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Step 5: Publish / Share</h3>
              {wizardResult ? <>
                <p className="text-sm text-emerald-800">Your admission test is ready. This app uses candidate-specific test links, so register candidates to create personal test links. You can also copy the form code for your office records.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-600">Test</div><div className="font-semibold text-slate-900">{wizardResult.blueprint.name}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-600">Form code</div><div className="font-mono text-lg text-cyan-700">{wizardResult.formCode}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-600">Status</div><div>{statusPill(wizardResult.form?.status || 'published')}</div></div>
                </div>
                <div className="flex flex-wrap gap-2"><button onClick={() => { navigator.clipboard.writeText(wizardResult.formCode); addToast('Form code copied', 'success'); }} className={btnPrimary}>Copy form code</button><button onClick={() => setActiveTab('candidates')} className={btnSecondary}>Go to Candidates</button><button onClick={() => setActiveTab('results')} className={btnSecondary}>Go to Results</button><button onClick={resetWizardForNewTest} className={btnSecondary}>Start another admission test</button></div>
              </> : <p className="text-sm text-slate-700">Generate an admission test first, then sharing options will appear here.</p>}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ OVERVIEW TAB ━━━  */}
      {activeTab === 'overview' && !loading && (
        <div className="space-y-6" ref={overviewCardsRef}>
          {/* Admission overview - Visual Step Tracker */}
          <div className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-white via-slate-50 to-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <span className="text-lg">🚀</span> Admission overview
            </h3>
            <ol className="admission-step-flow" aria-label="Admission workflow steps">
              {PIPELINE_STEPS.map((step, i) => {
                const done = pipelineProgress[step.key as keyof typeof pipelineProgress];
                return (
                  <li key={step.key} className="admission-step-item">
                    <button
                      onClick={() => setActiveTab(step.key as AdmTab)}
                      className={`flex-1 rounded-xl p-3 text-center transition-all cursor-pointer border ${
                        done
                          ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100/40'
                      }`}
                    >
                      <span className="admission-step-number">Step {i + 1}</span>
                      <div className={`text-2xl mb-1 ${done ? 'grayscale-0' : 'grayscale opacity-50'}`}>{step.icon}</div>
                      <div className={`text-xs font-semibold ${done ? 'text-emerald-700' : 'text-slate-600'}`}>{step.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{step.desc}</div>
                      {done && <div className="text-emerald-400 text-xs mt-1">✓</div>}
                    </button>
                    {i < PIPELINE_STEPS.length - 1 && <span className={`admission-step-connector ${done ? 'is-complete' : ''}`} aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCard('Candidates waiting', candidates.filter(c => c.status === 'registered').length, '⏳', 'border-cyan-200')}
            {statCard('Tests in progress', attempts.filter(a => a.status === 'in_progress').length, '📝', 'border-blue-500/30')}
            {statCard('Results ready', attempts.filter(a => a.status === 'submitted' || a.status === 'scored').length, '✅', 'border-indigo-200')}
            {statCard('Needs attention', attempts.filter(a => a.status === 'submitted').length, '🔎', 'border-purple-200')}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCard('Active Tests', forms.filter(f => f.status === 'published').length, '✅', 'border-emerald-200')}
            {statCard('Attempts', attempts.length, '📊', 'border-amber-200')}
            {statCard('Scored', attempts.filter(a => a.status === 'scored').length, '🏆', 'border-yellow-500/30')}
            {statCard('Placed', placements.length, '🎯', 'border-pink-500/30')}
          </div>

          {/* Band Distribution Chart */}
          {placements.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Band Distribution</h3>
              <div className="flex items-end gap-3 h-32">
                {(['A', 'B', 'C', 'D', 'E'] as PlacementBand[]).map(band => {
                  const count = bandDistribution[band];
                  const maxBand = Math.max(...Object.values(bandDistribution), 1);
                  const heightPct = (count / maxBand) * 100;
                  return (
                    <div key={band} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-slate-700 font-bold">{count}</span>
                      <div className="w-full rounded-t-lg relative" style={{ height: `${Math.max(heightPct, 4)}%` }}>
                        <div className={`absolute inset-0 rounded-t-lg ${BAND_COLORS[band].split(' ')[0]} opacity-70`} />
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${BAND_COLORS[band]}`}>
                        {band}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {attempts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Activity</h3>
              <div className="space-y-2">
                {attempts.slice(0, 5).map(a => {
                  const cand = candidates.find(c => c.id === a.candidate_id);
                  return (
                    <div key={a.id} className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500 w-28 shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
                      <span className="text-slate-900 font-medium">{cand?.full_name || 'Unknown'}</span>
                      {statusPill(a.status)}
                      {a.percentage !== null && <span className="text-cyan-700 ml-auto">{a.percentage}%</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/*  ━━━ POOLS TAB ━━━  */}
      {activeTab === 'pools' && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Official Question Bank</h2>
            <div className="text-xs text-slate-600">
              {pools.length} readable pool{pools.length !== 1 ? 's' : ''} loaded
            </div>
          </div>

          {/* Available subjects */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Official Brain Heist admission content</h4>
            <p className="text-sm text-slate-700 mb-3">Locked for assessment fairness. Schools can generate tests, but cannot edit official questions.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(BLUEPRINT_PRESETS).map(([key, preset]) => {
                const poolExists = pools.some(p => p.subject.toLowerCase() === key);
                return (
                  <div key={key} className={`rounded-lg border p-3 text-center ${poolExists ? 'border-emerald-200 bg-emerald-500/5' : 'border-slate-200 bg-slate-50 opacity-50'}`}>
                    <div className="text-2xl mb-1">{preset.icon}</div>
                    <div className="text-sm font-semibold text-slate-900">{preset.label}</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {poolExists ? '✓ Pool ready' : 'Not imported yet'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {pools.length === 0 ? (
            <div className="card-glass p-8 text-center">
              <span className="text-4xl block mb-3">📝</span>
              <p className="text-slate-600 text-sm">No official question bank pools are visible yet.</p>
              <p className="text-slate-500 text-xs mt-1">Platform admins can seed locked Brain Heist official admission content.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pools.map((p) => {
                const subjectKey = p.subject.toLowerCase();
                const preset = BLUEPRINT_PRESETS[subjectKey];
                return (
                  <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between hover:border-slate-300 transition">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{preset?.icon || '📄'}</span>
                      <div>
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-600">{p.subject} · Stage {p.stage || p.stage_level || 'Any'} {p.is_official ? '· Official Brain Heist admission content' : p.school_id ? '· Legacy school content' : '· Legacy global content'}</div>
                        <div className="text-[10px] text-cyan-700 mt-0.5">{p.is_locked ? '🔒 Locked for assessment fairness' : 'Read-only here for school admins'} · {p.source_label || 'Admission content'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</div>
                      {p.is_active && <div className="text-[10px] text-emerald-400 mt-0.5">Active</div>}
                      {p.is_official && <div className="text-[10px] text-cyan-700 mt-0.5">Official · {p.content_version || 'versioned'}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ BLUEPRINTS TAB ━━━  */}
      {activeTab === 'blueprints' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Test Blueprints</h2>
            <button onClick={() => setCreatingBlueprint(!creatingBlueprint)} className={btnSecondary}>
              {creatingBlueprint ? 'Cancel' : '+ New Blueprint'}
            </button>
          </div>

          {creatingBlueprint && (
            <div className="rounded-xl border border-cyan-200 bg-white p-5 space-y-4">
              {/* Subject Preset Buttons */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Quick Preset — click to auto-fill</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(BLUEPRINT_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applySubjectPreset(key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition ${
                        bpSubject === key
                          ? 'border-cyan-500 bg-cyan-600/20 text-cyan-700'
                          : 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span>{preset.icon}</span> {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                  <input className={inputClass} value={bpName} onChange={e => setBpName(e.target.value)} placeholder="e.g. English Stage 9 — Admission Test" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                  <select className={inputClass} value={bpSubject} onChange={e => applySubjectPreset(e.target.value)}>
                    <option value="english">English</option>
                    <option value="math">Mathematics</option>
                    <option value="science">Science</option>
                    <option value="chemistry">Chemistry</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Question Pool</label>
                  <select className={inputClass} value={bpPoolId ?? ''} onChange={e => handlePoolSelect(e.target.value)}>
                    <option value="">Auto-match by stage</option>
                    {subjectPools.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.stage ? ` (Stage ${p.stage})` : ''}
                      </option>
                    ))}
                  </select>
                  {bpPoolId && (
                    <p className="text-[10px] text-cyan-400 mt-0.5">Questions will be drawn exclusively from this pool.</p>
                  )}
                  {!bpPoolId && subjectPools.length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {subjectPools.filter(p => p.stage === bpTargetStage).length > 0
                        ? `Will match: ${subjectPools.filter(p => p.stage === bpTargetStage).map(p => p.name).join(', ')}`
                        : 'No pool matches this stage — select one above or adjust stage.'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Stage</label>
                  <input type="number" className={inputClass} value={bpTargetStage} onChange={e => setBpTargetStage(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (min)</label>
                  <input type="number" className={inputClass} value={bpDuration} onChange={e => setBpDuration(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Marks</label>
                  <input type="number" className={inputClass} value={bpTotalMarks} onChange={e => setBpTotalMarks(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pass Percentage (%)</label>
                  <input type="number" className={inputClass} value={bpPassPercentage} onChange={e => setBpPassPercentage(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mode</label>
                  <select className={inputClass} value={bpDelivery} onChange={e => setBpDelivery(e.target.value as 'practice' | 'exam')}>
                    <option value="exam">Exam</option>
                    <option value="practice">Practice</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Question Distribution</label>
                <div className="space-y-2">
                  {distRows.map((row, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <select
                        className={`${inputClass} w-44`}
                        value={row.type}
                        onChange={e => {
                          const next = [...distRows]; next[ri].type = e.target.value; setDistRows(next);
                        }}
                      >
                        <option value="">Pick type…</option>
                        {(QUESTION_TYPES[bpSubject] || QUESTION_TYPES.english).map(qt => (
                          <option key={qt.value} value={qt.value}>{qt.label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-emerald-400">Easy</span>
                        <input type="number" min={0} className={`${inputClass} w-14 text-center`} value={row.easy}
                          onChange={e => { const next = [...distRows]; next[ri].easy = +e.target.value; setDistRows(next); }} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-amber-400">Med</span>
                        <input type="number" min={0} className={`${inputClass} w-14 text-center`} value={row.medium}
                          onChange={e => { const next = [...distRows]; next[ri].medium = +e.target.value; setDistRows(next); }} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-700">Hard</span>
                        <input type="number" min={0} className={`${inputClass} w-14 text-center`} value={row.hard}
                          onChange={e => { const next = [...distRows]; next[ri].hard = +e.target.value; setDistRows(next); }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{row.easy + row.medium + row.hard}</span>
                      <button onClick={() => setDistRows(distRows.filter((_, i) => i !== ri))} className="text-red-700 hover:text-red-700 text-sm px-1" title="Remove">✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setDistRows([...distRows, { type: '', easy: 0, medium: 0, hard: 0 }])}
                    className="text-xs text-cyan-400 hover:text-cyan-700 mt-1"
                  >
                    + Add question type
                  </button>
                  <div className="text-xs text-slate-500 mt-1">
                    Total: <strong className="text-slate-900">{distRows.reduce((s, r) => s + r.easy + r.medium + r.hard, 0)}</strong> questions
                  </div>
                </div>
              </div>
              <button onClick={handleCreateBlueprint} disabled={creatingBlueprint && !bpName} className={btnPrimary}>
                Create Blueprint
              </button>
            </div>
          )}

          {blueprints.length === 0 && !creatingBlueprint ? (
            <div className="card-glass p-6 text-center text-slate-600 text-sm">
              No blueprints yet. Create one to define your test structure.
            </div>
          ) : (
            <div className="space-y-3">
              {blueprints.map((bp) => {
                const linkedPool = bp.pool_id ? pools.find(p => p.id === bp.pool_id) : null;
                return (
                <div key={bp.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{bp.name}</div>
                      <div className="text-xs text-slate-600">
                        {bp.duration_minutes}min · {bp.total_marks} marks · {bp.delivery_mode} · pass ≥ {bp.pass_percentage}%
                        {linkedPool && <span className="ml-1 text-cyan-400">· Pool: {linkedPool.name}</span>}
                        {!linkedPool && bp.target_stage && <span className="ml-1 text-slate-500">· auto-match stage {bp.target_stage}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDeleteBlueprint(bp.id)} className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-700 hover:bg-red-600/40 transition" title="Delete blueprint">🗑</button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(bp.question_distribution).map(([type, val]) => {
                      const total = typeof val === 'object' && val !== null
                        ? Object.values(val as Record<string, number>).reduce((s, n) => s + n, 0)
                        : val;
                      return (
                        <span key={type} className="px-2 py-0.5 rounded bg-slate-100 text-xs text-slate-700">
                          {type}: {String(total)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ FORMS TAB ━━━  */}
      {activeTab === 'forms' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Test Forms</h2>
            <button onClick={() => !isGeneratingForm && setGeneratingForm(!generatingForm)} disabled={isGeneratingForm} className={btnSecondary}>
              {generatingForm ? 'Cancel' : '+ Generate Form'}
            </button>
          </div>

          {generatingForm && (
            <div className="rounded-xl border border-indigo-200 bg-white p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Blueprint</label>
                  <select className={inputClass} value={genBlueprintId} onChange={e => generateFormCode(e.target.value)}>
                    <option value="">Select blueprint…</option>
                    {blueprints.map(bp => <option key={bp.id} value={bp.id}>{bp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Form Code (auto-generated, editable)</label>
                  <input className={inputClass} value={genFormCode} onChange={e => setGenFormCode(e.target.value)} placeholder="e.g. ENG9-2026-A" />
                </div>
              </div>
              <button onClick={handleGenerateForm} disabled={!genBlueprintId || !genFormCode || isGeneratingForm} className={btnPrimary}>
                {isGeneratingForm ? 'Generating…' : 'Generate Form'}
              </button>
            </div>
          )}

          {forms.length === 0 && !generatingForm ? (
            <div className="card-glass p-6 text-center text-slate-600 text-sm">
              No test forms yet. Generate one from a blueprint.
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map((f) => {
                const bp = blueprints.find(b => b.id === f.blueprint_id);
                return (
                <div key={f.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm font-bold text-slate-900">{f.form_code}</div>
                      {statusPill(f.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.status === 'draft' && (
                        <button onClick={() => handlePublishForm(f.id)} className="text-xs px-2 py-1 rounded bg-emerald-600/30 text-emerald-700 hover:bg-emerald-600/50 transition">
                          Publish
                        </button>
                      )}
                      {f.status === 'published' && (
                        <button onClick={() => handleCloseForm(f.id)} className="text-xs px-2 py-1 rounded bg-red-600/30 text-red-700 hover:bg-red-600/50 transition">
                          Close
                        </button>
                      )}
                      <button onClick={() => handleDeleteForm(f.id)} className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-700 hover:bg-red-600/40 transition" title="Delete form">🗑</button>
                    </div>
                  </div>
                  {bp && <div className="mt-2 text-sm font-medium text-slate-800">{bp.name}</div>}
                  <div className="text-xs text-slate-500 mt-1">
                    Created {new Date(f.created_at).toLocaleString()}
                    {f.published_at && ` · Published ${new Date(f.published_at).toLocaleString()}`}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ CANDIDATES TAB ━━━  */}
      {activeTab === 'candidates' && !loading && (
        <section className="admission-light-panel admission-candidates-panel space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Candidates</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBulkMode(false); setCreatingCandidate(!creatingCandidate); }}
                className={`${btnSecondary} ${!bulkMode && creatingCandidate ? 'border-cyan-500 text-cyan-700' : ''}`}
              >
                {creatingCandidate && !bulkMode ? 'Cancel' : '+ Add One'}
              </button>
              <button
                onClick={() => { setBulkMode(true); setCreatingCandidate(!creatingCandidate || !bulkMode); }}
                className={`${btnSecondary} ${bulkMode && creatingCandidate ? 'border-cyan-500 text-cyan-700' : ''}`}
              >
                {creatingCandidate && bulkMode ? 'Cancel' : '📋 Bulk Import'}
              </button>
            </div>
          </div>

          {/* Bulk import */}
          {creatingCandidate && bulkMode && (
            <div className="rounded-xl border border-amber-200 bg-white p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">Paste candidate list</h4>
                  <p className="text-xs text-slate-600 mb-3">One candidate per line. Format: <span className="font-mono text-cyan-400">Name, Email, Phone, Grade</span> (comma or tab separated)</p>
                  <textarea
                    className={`${inputClass} h-32 font-mono text-xs`}
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={`Ahmed Al-Rashid, parent@email.com, +971501234567, 9\nFatima Hassan, fatima@school.com, +971509876543, 9\nOmar Khalid, , +971507654321, 8`}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-500">
                      {bulkText.trim() ? `${bulkText.trim().split('\n').filter(l => l.trim()).length} candidate(s) detected` : 'Paste from spreadsheet or type manually'}
                    </span>
                    <button onClick={handleBulkImport} disabled={!bulkText.trim()} className={btnPrimary}>
                      Import All
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Single candidate form */}
          {creatingCandidate && !bulkMode && (
            <div className="rounded-xl border border-purple-200 bg-white p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input className={inputClass} value={candName} onChange={e => setCandName(e.target.value)} placeholder="Ahmed Al-Rashid" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
                  <input type="email" className={inputClass} value={candEmail} onChange={e => setCandEmail(e.target.value)} placeholder="parent@email.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Parent Phone *</label>
                  <input className={inputClass} value={candPhone} onChange={e => setCandPhone(e.target.value)} placeholder="+971 50 123 4567" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Applied Grade *</label>
                  <input type="number" className={inputClass} value={candAppliedGrade} onChange={e => setCandAppliedGrade(e.target.value)} placeholder="9" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Current Grade <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input type="number" className={inputClass} value={candCurrentGrade} onChange={e => setCandCurrentGrade(e.target.value)} placeholder="7" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input type="date" className={inputClass} value={candDob} onChange={e => setCandDob(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Previous Curriculum <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candPreviousCurriculum} onChange={e => setCandPreviousCurriculum(e.target.value)} placeholder="Cambridge, CBSE, IB…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Previous School Language <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candPreviousSchoolLanguage} onChange={e => setCandPreviousSchoolLanguage(e.target.value)} placeholder="English, Arabic…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Home Language <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candHomeLanguage} onChange={e => setCandHomeLanguage(e.target.value)} placeholder="Arabic, English…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Years in English-medium Education <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input type="number" step="0.5" className={inputClass} value={candYearsEnglishMedium} onChange={e => setCandYearsEnglishMedium(e.target.value)} placeholder="3" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Notes <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candNotes} onChange={e => setCandNotes(e.target.value)} placeholder="Any additional notes…" />
                </div>
              </div>
              <button onClick={handleCreateCandidate} disabled={!candName || !candEmail || !candPhone || !candAppliedGrade} className={btnPrimary}>
                Register Candidate
              </button>
            </div>
          )}

          {/* Grade 6 package guidance */}
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Grade 6 Admission Package</h3>
                <p className="text-xs text-cyan-800/80 mt-1">Recommended Grade 6 bundle: English required, Maths required, Science optional. Register one candidate once, then send each matching subject link below.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">English required</span>
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Maths required</span>
                <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300">Science optional</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          {candidates.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                <input
                  className={`${inputClass} pl-9`}
                  value={candSearch}
                  onChange={e => setCandSearch(e.target.value)}
                  placeholder="Search by name or contact…"
                />
              </div>
              <select
                className={`${inputClass} w-auto`}
                value={candStatusFilter}
                onChange={e => setCandStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="registered">Registered</option>
                <option value="testing">Testing</option>
                <option value="completed">Completed</option>
                <option value="placed">Placed</option>
              </select>
              <span className="text-xs text-slate-500">{filteredCandidates.length} of {candidates.length}</span>
            </div>
          )}

          {candidates.length === 0 && !creatingCandidate ? (
            <div className="card-glass p-8 text-center">
              <span className="text-4xl block mb-3">👤</span>
              <p className="text-slate-600 text-sm">No candidates registered yet.</p>
              <p className="text-slate-500 text-xs mt-1">Click "+ Add One" or "Bulk Import" to get started.</p>
            </div>
          ) : (
            <div
              className="admission-candidate-directory admin-table-scroll"
              role="region"
              aria-label="Candidates table"
              tabIndex={0}
            >
              <table className="admission-candidate-table w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-600 border-b border-slate-200">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Contact</th>
                    <th className="pb-2 pr-4">Grade</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Send Test</th>
                    <th className="pb-2 pr-4">View details</th>
                    <th className="admission-delete-column" aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredCandidates.map((c) => {
                    const publishedForms = forms.filter(f => f.status === 'published' && !isFormCodeSubjectConflict(f, blueprints));
                    const gradeMatchingPublishedForms = publishedForms.filter(f => getFormGrade(f, blueprints) === c.applied_grade);
                    const matchingForms = AdmService.getCurrentAdmissionPackageForms(gradeMatchingPublishedForms, blueprints, c.applied_grade);
                    const otherGradeForms = publishedForms.filter(f => getFormGrade(f, blueprints) !== c.applied_grade && AdmService.isCurrentManagedAdmissionForm(f));
                    const showOtherGrades = !!showOtherGradeFormsForCandidate[c.id];
                    const assignableForms = showOtherGrades ? [...matchingForms, ...otherGradeForms] : matchingForms;
                    const attemptedFormIds = new Set(attempts.filter(a => a.candidate_id === c.id).map(a => a.form_id));
                    const historyForms = forms.filter(f => attemptedFormIds.has(f.id) && !matchingForms.some(pf => pf.id === f.id));
                    return (
                      <tr key={c.id} className="admission-candidate-row text-slate-700 hover:bg-slate-100 transition">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{c.full_name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Candidate-specific links are private</div>
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {c.email && <div>{c.email}</div>}
                          {c.parent_phone && <div className="text-slate-500">{c.parent_phone}</div>}
                          {!c.email && !c.parent_phone && <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-xs">{c.applied_grade || '—'}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col gap-1.5">
                            {[...matchingForms, ...historyForms].slice(0, 3).map(f => {
                              const attempt = attempts.find(a => a.candidate_id === c.id && a.form_id === f.id);
                              return (
                                <div key={f.id} className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-600 min-w-[9rem]">{admissionSubjectLabel(getFormSubject(f, blueprints))} · {f.form_code}{f.status !== 'published' ? ' · history' : ''}{isFormCodeSubjectConflict(f, blueprints) ? ' · legacy/stale' : ''}</span>
                                  {statusPill(getAdmissionLifecycleStatus(attempt, f.status === 'published'))}
                                </div>
                              );
                            })}
                            {matchingForms.length === 0 && <span className="text-xs text-amber-700">No current clean forms for Grade {c.applied_grade || '—'}</span>}
                            {matchingForms.length > 0 && <span className="text-[10px] text-emerald-700">Showing current Grade {c.applied_grade || '—'} admission package</span>}
                          </div>
                        </td>
                        <td className="py-3 pr-4 min-w-[280px]">
                          <div className="space-y-2">
                            {assignableForms.length > 0 ? assignableForms.map(f => {
                              const link = AdmService.buildTestLink(window.location.origin, c.token, f.form_code);
                              const attempt = attempts.find(a => a.candidate_id === c.id && a.form_id === f.id);
                              const isOtherGrade = getFormGrade(f, blueprints) !== c.applied_grade;
                              return (
                                <div key={f.id} className={`rounded-lg border p-2 ${isOtherGrade ? 'border-amber-600/40 bg-amber-950/20' : 'border-slate-200 bg-slate-50'}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="text-xs font-semibold text-slate-900">{getAdmissionFormTitle(f, blueprints)}</div>
                                      <div className="text-[10px] text-slate-600">Code <span className="font-mono">{f.form_code}</span> · {getAttemptLabel(attempt, true)}</div>
                                      {isOtherGrade && <div className="text-[10px] text-amber-700">Other grade — send only by exception</div>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {isFinalAdmissionAttempt(attempt) ? (
                                        <>
                                          <button onClick={() => handleViewReport(attempt!.id)} className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-700 hover:bg-blue-600/50 transition">View result</button>
                                          <button onClick={() => handleViewReport(attempt!.id)} className="text-xs px-2 py-1 rounded bg-amber-600/20 text-amber-700 hover:bg-amber-600/40 transition">Activity notes</button>
                                          <button onClick={() => handleResetAttemptForRetake(attempt!.id)} className="text-xs px-2 py-1 rounded bg-white/10 text-slate-900 hover:bg-white/20 transition">Allow retake</button>
                                        </>
                                      ) : (
                                        <>
                                          <button onClick={() => { navigator.clipboard.writeText(link); addToast(`${getAdmissionFormTitle(f, blueprints)} link copied`, 'success'); }} className="text-xs px-2 py-1 rounded bg-cyan-600/30 text-cyan-700 hover:bg-cyan-600/50 transition" title={`Copy ${getAdmissionFormTitle(f, blueprints)} link`}>Copy</button>
                                          {c.parent_phone && <button onClick={() => shareViaWhatsApp(c.parent_phone, link, c.full_name)} className="text-xs px-2 py-1 rounded bg-green-600/30 text-green-300 hover:bg-green-600/50 transition" title={`WhatsApp ${getAdmissionFormTitle(f, blueprints)} link`}>WhatsApp</button>}
                                          {c.email && <button onClick={() => shareViaEmail(c.email, link, c.full_name)} className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-700 hover:bg-blue-600/50 transition" title={`Email ${getAdmissionFormTitle(f, blueprints)} link`}>Email</button>}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            }) : <span className="text-xs text-slate-600 italic">No current clean matching tests</span>}
                            {otherGradeForms.length > 0 && (
                              <button type="button" onClick={() => setShowOtherGradeFormsForCandidate(prev => ({ ...prev, [c.id]: !prev[c.id] }))} className="text-[11px] text-amber-700 hover:text-amber-700">
                                {showOtherGrades ? 'Hide other grades' : `Show ${otherGradeForms.length} other-grade form(s)`}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          <button onClick={() => setCandidateFileId(c.id)} className="text-xs px-2 py-1 rounded bg-amber-600/20 text-amber-700 hover:bg-amber-600/40 transition" title="View candidate details">View candidate</button>
                        </td>
                        <td className="admission-delete-column">
                          <button onClick={() => handleDeleteCandidate(c.id)} className="school-admin-icon-button school-admin-icon-button--danger" title="Delete candidate" aria-label={`Delete ${c.full_name}`}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/*  ━━━ RESULTS TAB ━━━  */}
      {activeTab === 'results' && !loading && (
        <section className="admission-light-panel admission-results-panel space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Test Results</h2>
            {attempts.filter(a => a.status === 'scored').length > 0 && (
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>Avg: <strong className="text-cyan-700">{Math.round(attempts.filter(a => a.percentage != null).reduce((s, a) => s + (a.percentage || 0), 0) / Math.max(attempts.filter(a => a.percentage != null).length, 1))}%</strong></span>
                <span>Scored: <strong className="text-emerald-700">{attempts.filter(a => a.status === 'scored').length}</strong></span>
                <span>Placed: <strong className="text-purple-700">{placements.length}</strong></span>
              </div>
            )}
          </div>

          {attempts.length === 0 ? (
            <div className="card-glass p-8 text-center">
              <span className="text-4xl block mb-3">🏆</span>
              <p className="text-slate-600 text-sm">No test attempts yet.</p>
              <p className="text-slate-500 text-xs mt-1">Results will appear here once candidates complete their tests.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Group attempts by candidate */}
              {(() => {
                const candidateIds = [...new Set(attempts.map(a => a.candidate_id))];
                return candidateIds.map(cId => {
                  const cand = candidates.find(c => c.id === cId);
                  const candAttempts = attempts.filter(a => a.candidate_id === cId);
                  return (
                    <div key={cId} className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                      {/* Candidate header */}
                      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200">
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-lg font-bold text-white">
                          {(cand?.full_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">{cand?.full_name || 'Unknown'}</div>
                          <div className="text-[11px] text-slate-500">
                            {cand?.email || ''}{cand?.email && cand?.parent_phone ? ' · ' : ''}{cand?.parent_phone || ''}
                            {cand?.applied_grade ? ` · Grade ${cand.applied_grade}` : ''}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{candAttempts.length} test{candAttempts.length > 1 ? 's' : ''}</div>
                      </div>

                      {/* Per-test results */}
                      <div className="divide-y divide-gray-700/50">
                        {candAttempts.map(a => {
                          const form = forms.find(f => f.id === a.form_id);
                          const bp = form ? blueprints.find(b => b.id === form.blueprint_id) : null;
                          const testLabel = bp ? `${bp.subject.charAt(0).toUpperCase() + bp.subject.slice(1)}` : (form?.form_code || 'Test');
                          const placement = placements.find(p => p.attempt_id === a.id);
                          const scorePct = a.percentage ?? 0;
                          const scoreColor = scorePct >= 80 ? 'text-emerald-400' : scorePct >= 60 ? 'text-cyan-400' : scorePct >= 40 ? 'text-amber-400' : 'text-red-700';
                          const barColor = scorePct >= 80 ? 'bg-emerald-500' : scorePct >= 60 ? 'bg-cyan-500' : scorePct >= 40 ? 'bg-amber-500' : 'bg-red-500';
                          return (
                            <div key={a.id} className="px-5 py-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-700 border border-indigo-500/40 font-semibold">{testLabel}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">{form?.form_code}</span>
                                  {statusPill(a.status)}
                                  <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  {a.percentage !== null && (
                                    <div className="text-right">
                                      <span className={`text-xl font-bold ${scoreColor}`}>{a.percentage}%</span>
                                      <span className="text-xs text-slate-500 ml-1">{a.total_score}/{a.max_score}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {a.percentage !== null && (
                                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${scorePct}%` }} />
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-2">
                                <div>{placement && <span className="mr-2">{bandBadge(placement.band)}</span>}</div>
                                <div className="flex items-center gap-2">
                                  {a.status === 'scored' && (
                                    <button onClick={() => handleViewReport(a.id)} className="text-xs px-3 py-1 rounded-lg bg-blue-600/30 text-blue-700 hover:bg-blue-600/50 transition flex items-center gap-1">
                                      📊 Report
                                    </button>
                                  )}
                                  {a.status === 'scored' && !placement && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-slate-500 mr-1">Place:</span>
                                      {(['A', 'B', 'C', 'D', 'E'] as PlacementBand[]).map(b => (
                                        <button
                                          key={b}
                                          onClick={() => handleRecordPlacement(a.id, b)}
                                          className={`text-xs px-2 py-0.5 rounded border ${BAND_COLORS[b]} hover:opacity-80 transition font-bold`}
                                          title={`Band ${b} — ${BAND_LABELS[b]}`}
                                        >
                                          {b}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <button onClick={() => handleResetAttemptForRetake(a.id)} className="text-xs px-2 py-1 rounded bg-amber-600/20 text-amber-700 hover:bg-amber-600/40 transition" title="Reset attempt for retake">Allow retake</button>
                                  <button onClick={() => handleDeleteAttempt(a.id)} className="text-xs px-1.5 py-1 rounded bg-red-600/20 text-red-700 hover:bg-red-600/40 transition" title="Delete attempt">🗑</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </section>
      )}

      {/*  ━━━ AUDIT TAB ━━━  */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Activity Log</h2>
          {auditLog.length === 0 ? (
            <div className="card-glass p-6 text-center text-slate-600 text-sm">No entries yet.</div>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {auditLog.map((entry, i) => {
                const details = entry.details || {};
                const actionMap: Record<string, { icon: string; label: string; color: string }> = {
                  attempt_started: { icon: '🚀', label: 'Test Started', color: 'text-blue-700' },
                  attempt_scored: { icon: '✅', label: 'Test Scored', color: 'text-emerald-700' },
                  form_published: { icon: '📋', label: 'Form Published', color: 'text-indigo-700' },
                  form_closed: { icon: '🔒', label: 'Form Closed', color: 'text-red-700' },
                  placement_decided: { icon: '🎯', label: 'Placement Made', color: 'text-purple-700' },
                };
                const actionInfo = actionMap[entry.action] || { icon: '📝', label: entry.action.replace(/_/g, ' '), color: 'text-slate-700' };
                const candidateName = details.candidate || '';
                const formCode = details.form_code || '';
                const score = details.score != null ? `${details.score}/${details.max}` : '';
                const pct = details.percentage != null ? `${details.percentage}%` : '';
                const band = details.band || '';

                return (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{actionInfo.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${actionInfo.color}`}>{actionInfo.label}</span>
                        {candidateName && <span className="text-sm text-slate-900">{candidateName}</span>}
                        {formCode && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{formCode}</span>}
                      </div>
                      {(score || band) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {score && <span className="text-xs text-slate-600">Score: {score} ({pct})</span>}
                          {band && <span className="text-xs text-slate-600">Band: {band}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ REPORT MODAL ━━━  */}
      {showReport && (
        <div className="school-admin-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={() => { setShowReport(false); setReportData(null); }}>
          <div className="school-admin-modal school-admin-detail-modal w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="Admission assessment report" onClick={e => e.stopPropagation()}>
            {reportLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
              </div>
            ) : reportData ? (
              <div className="space-y-6">
                <header className="school-admin-detail-header">
                  {reportSchoolLogoUrl ? <img src={reportSchoolLogoUrl} alt={`${reportSchoolName} logo`} className="h-12 w-12 rounded-lg bg-white object-contain p-1" /> : <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#1e4b82] text-xs font-bold text-white">{reportSchoolName.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase()}</span>}
                  <div><h2 className="text-lg font-bold text-slate-900">{reportSchoolName}</h2><p className="text-xs text-slate-500">Admission Assessment Report</p></div>
                  <div className="ml-auto flex flex-wrap items-center gap-2"><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => printAdmissionReport('family')}>Family copy</button><button type="button" className="rounded-lg bg-[#1e4b82] px-3 py-2 text-xs font-semibold text-white" onClick={() => printAdmissionReport('internal')}>Committee copy</button><button type="button" className="school-admin-modal-close" onClick={() => { setShowReport(false); setReportData(null); }} aria-label="Close admission report">✕</button></div>
                </header>
                <div className="school-admin-detail-body space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-heading text-slate-900">{reportData.candidate_name}</h3>
                    <p className="text-xs text-slate-600">Form: {reportData.form_label || AdmService.buildAdmissionReportFormLabel(reportData.form_code, reportData.candidate_profile?.applied_grade, reportData.answers?.[0]?.subject)}</p>
                    <p className="text-xs text-slate-500 font-mono">Code {reportData.form_code || '—'}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-900">{reportData.percentage}%</div>
                    {bandBadge(reportData.band)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {statCard('Score', `${visibleReportScoreTotal}/${visibleReportQuestionTotal}`, '🎯', 'border-cyan-200')}
                  {statCard('Started', new Date(reportData.started_at).toLocaleTimeString(), '🕐', 'border-slate-300/30')}
                  {statCard('Submitted', new Date(reportData.submitted_at).toLocaleTimeString(), '✅', 'border-emerald-200')}
                </div>

                <AdmissionReportPartialAttemptNotice metrics={visibleReportPartialAttemptMetrics.partialAttempt ? visibleReportPartialAttemptMetrics : reportPartialAttemptMetrics} />

                {(reportData.activity_events ?? []).some(e => e.event_type === 'auto_submit_repeated_page_exits') && (
                  <div className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Unusual activity: repeated page exits</div>
                )}

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h4 className="text-sm font-semibold text-amber-700 mb-2">Activity notes</h4>
                  {(reportData.activity_notes ?? []).length > 0 ? (
                    <ul className="text-xs text-amber-800 list-disc pl-5 space-y-1">
                      {(reportData.activity_notes ?? []).map((note, i) => <li key={i}>{note}</li>)}
                    </ul>
                  ) : <p className="text-xs text-amber-800">No activity notes recorded for this attempt.</p>}
                  <p className="mt-2 text-[11px] text-amber-800/70">Activity notes help the school review unusual test behaviour. They do not automatically prove misconduct.</p>
                </div>

                {reportData.placement_recommendation && (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-900/10 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-sm font-semibold text-cyan-700">Placement Recommendation</h4>
                        <p className="text-lg font-bold text-slate-900">{reportData.placement_recommendation.label}</p>
                      </div>
                      {reportData.placement_recommendation.interviewFlag && reportData.placement_recommendation.label !== 'Interview recommended' && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Interview recommended</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      {(() => {
                        const rec = reportData.placement_recommendation;
                        const cards = [
                          { key: 'english', label: 'English readiness', value: rec.englishPercentage },
                          { key: 'math', label: 'Maths readiness', value: rec.mathsPercentage },
                          { key: 'science', label: 'Science readiness', value: rec.sciencePercentage },
                        ];
                        const visible = rec.isPackageReport ? cards : cards.filter(card => card.key === rec.currentSubject);
                        return visible.map(card => (
                          <div key={card.key} className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-600">{card.label}</span><p className="text-slate-900 font-semibold">{card.value ?? 'Not enough data'}{card.value != null ? '%' : ''}</p></div>
                        ));
                      })()}
                    </div>
                    <div>
                      <h5 className="text-xs font-semibold text-slate-700 mb-1">Why this recommendation?</h5>
                      <ul className="text-xs text-slate-700 list-disc pl-5 space-y-0.5">{reportData.placement_recommendation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                    <p className="text-xs text-cyan-800"><strong>Next action:</strong> {reportData.placement_recommendation.nextAction}</p>
                  </div>
                )}

                {reportData.candidate_profile && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Candidate Academic Profile</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-slate-500">Applying for</span><p className="text-slate-900">Grade {reportData.candidate_profile.applied_grade ?? '—'}</p></div>
                      <div><span className="text-slate-500">Current grade</span><p className="text-slate-900">{reportData.candidate_profile.current_grade ?? '—'}</p></div>
                      <div><span className="text-slate-500">Date of birth</span><p className="text-slate-900">{reportData.candidate_profile.date_of_birth ?? '—'}</p></div>
                      <div><span className="text-slate-500">Previous curriculum</span><p className="text-slate-900">{reportData.candidate_profile.previous_curriculum ?? '—'}</p></div>
                      <div><span className="text-slate-500">School language</span><p className="text-slate-900">{reportData.candidate_profile.previous_school_language ?? '—'}</p></div>
                      <div><span className="text-slate-500">Home language</span><p className="text-slate-900">{reportData.candidate_profile.home_language ?? '—'}</p></div>
                      <div><span className="text-slate-500">English-medium years</span><p className="text-slate-900">{reportData.candidate_profile.years_english_medium ?? '—'}</p></div>
                    </div>
                  </div>
                )}

                {/* Diagnostic Breakdown */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Diagnostic Breakdown</h4>
                  {(reportData.diagnostic_breakdown ?? []).length === 0 ? (
                    <p className="text-xs text-slate-500">Detailed subject and skill tags are not available for this older test yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(reportData.diagnostic_breakdown ?? []).map((t) => (
                        <div key={t.key} className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-48 truncate">{AdmService.admissionSubjectLabel(t.subject)} · {t.skill}</span>
                          {t.difficulty && <span className="rounded-full border border-slate-600 bg-white px-2 py-0.5 text-[10px] text-slate-600 capitalize">Difficulty: {t.difficulty}</span>}
                          <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden"><div className={`h-full rounded transition-all ${t.percentage >= 70 ? 'bg-emerald-500' : t.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${t.percentage}%` }} /></div>
                          <span className="text-xs text-slate-700 w-16 text-right">{t.score}/{t.maxScore}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Topic */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Performance by Topic</h4>
                  <div className="space-y-1.5">
                    {(reportData.by_topic ?? []).map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-40 truncate">{t.topic}</span>
                        <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${t.pct >= 70 ? 'bg-emerald-500' : t.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-700 w-12 text-right">{t.correct}/{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Type */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Performance by Question Type</h4>
                  <div className="space-y-1.5">
                    {(reportData.by_type ?? []).map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-40 truncate capitalize">{t.question_type.replace('_', ' ')}</span>
                        <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${t.pct >= 70 ? 'bg-emerald-500' : t.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-700 w-12 text-right">{t.correct}/{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths / Weaknesses */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-700 mb-1">Strengths</h4>
                    <ul className="text-xs text-slate-700 space-y-0.5">
                      {(reportData.strengths ?? []).length > 0 ? (reportData.strengths ?? []).map((s, i) => <li key={i}>✓ {s}</li>) : <li>No clear strengths yet — more completed answers are needed.</li>}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-red-700 mb-1">Areas for Improvement</h4>
                    <ul className="text-xs text-slate-700 space-y-0.5">
                      {(reportData.weaknesses ?? []).length > 0 ? (reportData.weaknesses ?? []).map((w, i) => <li key={i}>△ {w}</li>) : <li>No major weak area detected from this attempt.</li>}
                    </ul>
                  </div>
                </div>

                {/* AI Summary */}
                {reportData.ai_summary && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                    <h4 className="text-sm font-semibold text-purple-700 mb-2 flex items-center gap-2">
                      <span>🤖</span> AI Assessment
                    </h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{reportData.ai_summary}</p>
                  </div>
                )}

                {/* Generate AI Report Button — grades writing, re-checks text answers */}
                {!reportData.ai_summary && !AdmService.isObjectiveAutoScoredAdmissionReport(reportData) && (
                  <div className="space-y-2">
                    {(reportData.answers ?? []).some(a => ['email_writing','essay_writing','gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured'].includes(a.question_type)) && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        ⚠️ This test has writing and/or open-ended answers that need AI grading for accurate scores. Click below to run AI grading.
                      </div>
                    )}
                    <button
                      onClick={() => handleGenerateAiReport(reportAttemptId!)}
                      disabled={generatingAiReport || !reportAttemptId}
                      className="w-full rounded-lg border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/30 px-4 py-2 text-sm text-purple-800 transition flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {generatingAiReport ? (
                        <><span className="animate-spin">🔄</span> AI Grading in Progress (this may take a minute)...</>
                      ) : (
                        <><span>🤖</span> Run AI Grading &amp; Generate Report</>
                      )}
                    </button>
                  </div>
                )}

                {/* Detailed Answers Section */}
                <div>
                  <button
                    onClick={() => setShowAnswers(!showAnswers)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-slate-900 py-2 transition"
                  >
                    <span>📝 Detailed Answers ({visibleReportAnsweredCount} questions)</span>
                    <span className="text-lg">{showAnswers ? '▲' : '▼'}</span>
                  </button>
                  
                  {showAnswers && (
                    <div className="space-y-3 mt-2 max-h-[50vh] overflow-y-auto pr-1">
                      {reportData.answer_details_available === false && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                          {reportData.answer_detail_message || 'Detailed answers unavailable'}
                        </div>
                      )}
                      {(reportData.answers ?? []).map((ans, i) => (
                        <div
                          key={ans.question_id || i}
                          className={`rounded-lg border p-3 ${
                            ans.is_correct
                              ? 'border-emerald-200 bg-emerald-900/10'
                              : ans.is_correct === null || ['email_writing','essay_writing'].includes(ans.question_type)
                              ? 'border-amber-200 bg-amber-50'
                              : !ans.ai_feedback && ['gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured'].includes(ans.question_type)
                              ? 'border-yellow-500/30 bg-yellow-900/10'
                              : 'border-red-500/30 bg-red-900/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">
                                {ans.question_type.replace(/_/g, ' ')}
                              </span>
                              {!ans.ai_feedback && ans.is_correct !== true && ['email_writing','essay_writing','gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured'].includes(ans.question_type) && (
                                <span className="text-xs px-2 py-0.5 rounded bg-amber-800/50 text-amber-700">⏳ Needs AI</span>
                              )}
                              {ans.ai_feedback && (
                                <span className="text-xs px-2 py-0.5 rounded bg-purple-800/50 text-purple-700">🤖 AI Graded</span>
                              )}
                            </div>
                            <span className={`text-xs font-bold ${
                              ans.is_correct ? 'text-emerald-400' 
                              : ans.is_correct === null ? 'text-amber-400'
                              : 'text-red-700'
                            }`}>
                              {ans.marks_awarded}/{ans.marks_possible}
                            </span>
                          </div>
                          <p className="text-sm text-slate-900 mb-2">{ans.stem}</p>
                          
                          {/* Student Response */}
                          <div className="text-xs">
                            <span className="text-slate-600">Student answered: </span>
                            <span className={ans.is_correct ? 'text-emerald-700' : ans.is_correct === null ? 'text-amber-700' : 'text-red-700'}>
                              {typeof ans.response === 'object'
                                ? (ans.response?.text || ans.response?.index) ?? JSON.stringify(ans.response)
                                : ans.response || '(no answer)'}
                            </span>
                          </div>
                          
                          {/* Correct Answer (for non-writing) */}
                          {!['email_writing', 'essay_writing'].includes(ans.question_type) && !ans.is_correct && (
                            <div className="text-xs mt-1">
                              <span className="text-slate-600">Correct: </span>
                              <span className="text-emerald-700">
                                {typeof ans.correct_answer === 'object'
                                  ? JSON.stringify(ans.correct_answer)
                                  : ans.correct_answer}
                              </span>
                            </div>
                          )}
                          
                          {/* AI Feedback for writing */}
                          {ans.ai_feedback && (
                            <div className="mt-2 p-2 rounded bg-purple-50 border border-purple-500/20">
                              <span className="text-xs text-purple-700 font-semibold">🤖 AI Feedback:</span>
                              <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{ans.ai_feedback}</p>
                            </div>
                          )}
                          
                          {/* Explanation */}
                          {ans.explanation && (
                            <div className="text-xs text-slate-500 mt-2 italic">
                              💡 {ans.explanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={() => { setShowReport(false); setReportData(null); setShowAnswers(false); }} className={`${btnPrimary} w-full`}>
                  Close Report
                </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-600 py-8">No report data</div>
            )}
          </div>
        </div>
      )}
      {/* ━━━ CANDIDATE FILE MODAL ━━━ */}
      {candidateFileId && (() => {
        const cand = candidates.find(c => c.id === candidateFileId);
        if (!cand) return null;
        const candAttempts = attempts.filter(a => a.candidate_id === cand.id);
        const candAuditEntries = auditLog.filter(e => {
          const d = e.details || {};
          return d.candidate === cand.full_name || e.target_id === cand.id || candAttempts.some(a => e.target_id === a.id);
        });

        return (
          <div className="school-admin-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={() => setCandidateFileId(null)}>
            <div className="school-admin-modal school-admin-detail-modal w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="candidate-file-title" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="school-admin-detail-header">
                <span className="text-3xl">📁</span>
                <div>
                  <p className="school-admin-eyebrow">Candidate file</p>
                  <h2 id="candidate-file-title" className="text-xl font-bold text-slate-900">{cand.full_name}</h2>
                  <p className="text-xs text-slate-600">
                    Candidate details · Registered {new Date(cand.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setCandidateFileId(null)} className="school-admin-modal-close" aria-label="Close candidate file">✕</button>
              </div>

              <div className="school-admin-detail-body">

              {/* Personal Info */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Candidate profile</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Email</span>
                    <p className="text-slate-900">{cand.email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Phone</span>
                    <p className="text-slate-900">{cand.parent_phone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Applied Grade</span>
                    <p className="text-slate-900">{cand.applied_grade || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Status</span>
                    <p>{statusPill(cand.status)}</p>
                  </div>
                  {cand.notes && (
                    <div className="col-span-2">
                      <span className="text-slate-500 text-xs">Notes</span>
                      <p className="text-slate-900 text-xs">{cand.notes}</p>
                    </div>
                  )}
                  <div className="col-span-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                    Candidate-specific links are private. Use Sent links below to copy or send links without exposing tokens.
                  </div>
                </div>
              </div>

              {/* Admission package */}
              <div className="rounded-lg border border-sky-200 bg-white p-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admission package / matching tests</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(() => {
                    const currentPackageForms = AdmService.getCurrentAdmissionPackageForms(forms, blueprints, cand.applied_grade);
                    return ADMISSION_PACKAGE_SUBJECTS.map(subject => {
                      const matching = currentPackageForms.find(f => normalizeAdmissionSubject(getFormSubject(f, blueprints)) === subject.key);
                      const attempt = matching ? candAttempts.find(a => a.form_id === matching.id) : undefined;
                      return <div key={subject.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="font-semibold text-slate-900">{subject.label}</div><div className="text-xs text-slate-500">{subject.required ? 'Required' : 'Optional'} · {getAttemptLabel(attempt, !!matching)}</div></div>;
                    });
                  })()}
                </div>
              </div>

              {/* Sent links */}
              <div className="rounded-lg border border-sky-200 bg-white p-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sent links</h3>
                <p className="text-xs text-slate-500 mb-2">Showing current Grade {cand.applied_grade || '—'} admission package. Tokens are never shown in the normal admin UI.</p>
                <div className="flex flex-wrap gap-2">{AdmService.getCurrentAdmissionPackageForms(forms, blueprints, cand.applied_grade).map(f => <button key={f.id} onClick={() => { navigator.clipboard.writeText(AdmService.buildTestLink(window.location.origin, cand.token, f.form_code)); addToast('Candidate link copied', 'success'); }} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">Copy {admissionSubjectLabel(getFormSubject(f, blueprints))} link</button>)}</div>
              </div>

              {/* Attempts / Results / Retake */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  Attempts, Results, Activity notes, and Retake ({candAttempts.length})
                </h3>
                {candAttempts.length === 0 ? (
                  <p className="text-slate-500 text-sm">No tests taken yet.</p>
                ) : (
                  <div className="space-y-3">
                    {candAttempts.map(a => {
                      const form = forms.find(f => f.id === a.form_id);
                      const bp = form ? blueprints.find(b => b.id === form.blueprint_id) : null;
                      const subjectLabel = bp?.subject ? bp.subject.charAt(0).toUpperCase() + bp.subject.slice(1) : 'Unknown';
                      const pct = a.max_score ? Math.round((a.total_score / a.max_score) * 100) : 0;
                      return (
                        <div key={a.id} className="rounded-lg border border-slate-300/30 bg-slate-100 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{subjectLabel}</span>
                              {form && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-600 text-slate-600 font-mono">{form.form_code}</span>}
                              {statusPill(a.status)}
                            </div>
                            <span className="text-[11px] text-slate-500">{new Date(a.started_at).toLocaleDateString()}</span>
                          </div>
                          {a.status === 'scored' && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-600">Score: {a.total_score}/{a.max_score}</span>
                                <span className={`font-bold ${pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-blue-400' : pct >= 40 ? 'text-amber-400' : 'text-red-700'}`}>{pct}%</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                          {a.status === 'submitted' && (
                            <p className="text-xs text-amber-400 mt-1">⏳ Awaiting scoring…</p>
                          )}
                          {a.status === 'in_progress' && (
                            <p className="text-xs text-blue-400 mt-1">🔄 Test in progress…</p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {(a.status === 'submitted' || a.status === 'scored') && <button onClick={() => handleViewReport(a.id)} className="rounded-lg bg-blue-600/30 px-3 py-1 text-blue-800 hover:bg-blue-600/50">View result</button>}
                            <button onClick={() => handleViewReport(a.id)} className="rounded-lg bg-amber-600/20 px-3 py-1 text-amber-700 hover:bg-amber-600/40">Activity notes</button>
                            <button onClick={() => handleResetAttemptForRetake(a.id)} className="rounded-lg bg-white/10 px-3 py-1 text-slate-900 hover:bg-white/20">Allow retake</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity notes */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-2">
                  Activity notes ({candAuditEntries.length})
                </h3>
                <p className="mb-3 text-xs text-amber-900">Activity notes help the school review unusual test behaviour. They do not automatically prove misconduct.</p>
                {candAuditEntries.length === 0 ? (
                  <p className="text-slate-500 text-sm">No activity notes recorded for this attempt.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {candAuditEntries.map((entry, i) => {
                      const details = entry.details || {};
                      const actionMap: Record<string, { icon: string; label: string }> = {
                        attempt_started: { icon: '🚀', label: 'Started test' },
                        attempt_scored: { icon: '✅', label: 'Test scored' },
                        placement_decided: { icon: '🎯', label: 'Placement decided' },
                      };
                      const info = actionMap[entry.action] || { icon: '📝', label: entry.action.replace(/_/g, ' ') };
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 w-28 shrink-0">{new Date(entry.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>{info.icon}</span>
                          <span className="text-slate-700">{info.label}</span>
                          {details.form_code && <span className="text-slate-500 font-mono">({details.form_code})</span>}
                          {details.band && <span className="text-slate-500">Band {details.band}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button onClick={() => setCandidateFileId(null)} className={`${btnPrimary} w-full mt-5`}>
                Close File
              </button>
              </div>
            </div>
          </div>
        );
      })()}

      {admissionConfirm && <div className="school-admin-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !admissionConfirmBusy) { setAdmissionConfirm(null); setAdmissionConfirmReason(''); } }}>
        <div className="school-admin-modal school-admin-confirm-modal is-destructive w-full max-w-md rounded-xl" role="dialog" aria-modal="true" aria-labelledby="admission-confirm-title" aria-describedby="admission-confirm-description">
          <div className="school-admin-confirm-heading"><span aria-hidden="true">!</span><div><p className="school-admin-eyebrow">Please confirm</p><h3 id="admission-confirm-title">{admissionConfirm.title}</h3></div></div>
          <p id="admission-confirm-description" className="school-admin-confirm-description">{admissionConfirm.description}</p>
          {admissionConfirm.requiresReason && <div className="mb-4"><label htmlFor="admission-confirm-reason" className="mb-1 block text-sm font-medium text-slate-700">Reason</label><input id="admission-confirm-reason" value={admissionConfirmReason} onChange={(event) => setAdmissionConfirmReason(event.target.value)} placeholder={admissionConfirm.reasonPlaceholder} /></div>}
          <div className="school-admin-confirm-actions"><button className="admin-button-ghost" disabled={admissionConfirmBusy} onClick={() => { setAdmissionConfirm(null); setAdmissionConfirmReason(''); }}>Cancel</button><button className="admin-button-danger school-admin-confirm-submit" disabled={admissionConfirmBusy || (admissionConfirm.requiresReason && !admissionConfirmReason.trim())} onClick={async () => { setAdmissionConfirmBusy(true); try { await admissionConfirm.onConfirm(admissionConfirmReason.trim() || undefined); setAdmissionConfirm(null); setAdmissionConfirmReason(''); } finally { setAdmissionConfirmBusy(false); } }}>{admissionConfirmBusy ? 'Processing…' : admissionConfirm.confirmLabel}</button></div>
        </div>
      </div>}
    </div>
  );
};

export default AdmissionHub;
