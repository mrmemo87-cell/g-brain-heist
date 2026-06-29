import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

// ── Types ──

type AdmTab = 'create' | 'overview' | 'pools' | 'blueprints' | 'forms' | 'candidates' | 'results' | 'audit';

interface AdmissionHubProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

// ── Band Colours ──

const BAND_COLORS: Record<PlacementBand, string> = {
  A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  B: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  C: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  D: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  E: 'bg-red-500/20 text-red-300 border-red-500/40',
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
    marks: 27,
    duration: 45,
    distribution: JSON.stringify({ mcq: { easy: 5, medium: 8, hard: 1 }, gap_fill: { easy: 1, medium: 2, hard: 1 }, sentence_transformation: { medium: 2, hard: 1 } }),
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
  custom: { label: 'Custom', description: 'Use Advanced setup to fine-tune question types and distribution.', duration: 45, pass: 60, mix: { easy: 0.4, medium: 0.5, hard: 0.1 } },
};

const buildWizardDistribution = (questionCount: number, difficulty: WizardDifficulty, questions: AdmQuestion[] = []): Record<string, Record<string, number>> => {
  const meta = WIZARD_DIFFICULTY_META[difficulty === 'custom' ? 'balanced' : difficulty];
  const requestedByDifficulty: Record<string, number> = {
    easy: Math.floor(questionCount * meta.mix.easy),
    hard: Math.floor(questionCount * meta.mix.hard),
    medium: 0,
  };
  requestedByDifficulty.medium = Math.max(0, questionCount - requestedByDifficulty.easy - requestedByDifficulty.hard);

  const published = questions.filter(q => q.status === 'published');
  const distribution: Record<string, Record<string, number>> = {};
  const allocate = (difficultyKey: string, requested: number) => {
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

  // Before availability has loaded, return a simple MCQ-shaped plan so the review step remains stable.
  if (Object.keys(distribution).length === 0) {
    const fallback: Record<string, Record<string, number>> = { mcq: {} };
    Object.entries(requestedByDifficulty).forEach(([diff, count]) => { if (count > 0) fallback.mcq[diff] = count; });
    return fallback;
  }
  return distribution;
};

const countDistributionQuestions = (questions: AdmQuestion[], distribution: Record<string, Record<string, number>>) => {
  let required = 0;
  let availableForRequired = 0;
  const missing: string[] = [];
  Object.entries(distribution).forEach(([type, diffs]) => {
    Object.entries(diffs).forEach(([difficulty, needed]) => {
      required += needed;
      const available = questions.filter(q => q.status === 'published' && q.question_type === type && q.difficulty === difficulty).length;
      availableForRequired += Math.min(available, needed);
      if (available < needed) missing.push(`${needed - available} more ${difficulty} ${type.replace(/_/g, ' ')} question${needed - available === 1 ? '' : 's'}`);
    });
  });
  return { required, availableForRequired, canGenerate: missing.length === 0 && required > 0, missing };
};

const friendlyAdmissionError = (message?: string) => {
  const text = (message || '').toLowerCase();
  if (text.includes('duplicate') || text.includes('unique') || text.includes('question_order')) {
    return 'We could not generate this test safely. Please try again or check that enough questions are available.';
  }
  if (text.includes('no question') || text.includes('not enough') || text.includes('matched')) {
    return 'We could not find enough published questions for this setup. Please adjust the grade, subject, difficulty, or question count.';
  }
  if (text.includes('access denied') || text.includes('permission')) {
    return 'You do not have permission to create admission tests for this school.';
  }
  if (text.includes('already exists') || text.includes('idempotent')) {
    return 'This admission test may already have been generated. Refresh the Admission Hub and check Advanced Test Forms before trying again.';
  }
  return 'We could not generate this admission test. Please try again or check the question availability.';
};

// ── Pipeline Steps ──

const PIPELINE_STEPS = [
  { key: 'pools', icon: '📝', label: 'Question Pool', desc: 'Import questions' },
  { key: 'blueprints', icon: '📐', label: 'Blueprint', desc: 'Define test structure' },
  { key: 'forms', icon: '📋', label: 'Test Form', desc: 'Generate & publish' },
  { key: 'candidates', icon: '👤', label: 'Candidates', desc: 'Register & send links' },
  { key: 'results', icon: '🏆', label: 'Results', desc: 'Score & place' },
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

// ── Main Component ──

const AdmissionHub: React.FC<AdmissionHubProps> = ({ onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdmTab>('create');
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');

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
  const [wizardName, setWizardName] = useState('Grade 7 English Admission Test');
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

  // Candidate file modal
  const [candidateFileId, setCandidateFileId] = useState<string | null>(null);

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
      addToast(err.message || 'Failed to load admission data', 'error');
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

  const wizardDistribution = useMemo(() => buildWizardDistribution(wizardQuestionCount, wizardDifficulty, wizardQuestions), [wizardQuestionCount, wizardDifficulty, wizardQuestions]);
  const wizardAvailability = useMemo(() => countDistributionQuestions(wizardQuestions, wizardDistribution), [wizardQuestions, wizardDistribution]);
  const wizardCanGenerate = wizardAvailability.canGenerate && wizardAvailability.required === wizardQuestionCount;
  const wizardSubjectLabel = BLUEPRINT_PRESETS[wizardSubject]?.label || wizardSubject;
  const wizardFormCode = useMemo(() => {
    const subjectCode = wizardSubject.slice(0, 3).toUpperCase();
    const suffix = Math.abs([...`${schoolId || ''}-${wizardName}-${wizardGrade}-${wizardSubject}`].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)).toString(36).toUpperCase().slice(-3).padStart(3, '0');
    return `${subjectCode}${wizardGrade}-${new Date().getFullYear()}-${suffix}`;
  }, [schoolId, wizardName, wizardGrade, wizardSubject]);

  useEffect(() => {
    const meta = WIZARD_DIFFICULTY_META[wizardDifficulty];
    if (wizardDifficulty !== 'custom') {
      setWizardDuration(meta.duration);
      setWizardPassPercentage(meta.pass);
    }
  }, [wizardDifficulty]);

  useEffect(() => {
    setWizardName(`Grade ${wizardGrade} ${BLUEPRINT_PRESETS[wizardSubject]?.label || wizardSubject} Admission Test`);
    setWizardPoolId('');
  }, [wizardGrade, wizardSubject]);

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
          name: wizardName.trim().startsWith('Admission Test Wizard —') ? wizardName.trim() : `Admission Test Wizard — ${wizardName.trim()}`,
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

      const res = await AdmService.generateTestForm(blueprint.id, wizardFormCode);
      if (!res.success || !res.form_id) throw new Error(res.error || 'Generation failed');
      const publishRes = await AdmService.publishForm(res.form_id);
      if (!publishRes.success) throw new Error(publishRes.error || 'Publish failed');
      await loadAll();
      const createdForm = (await AdmService.fetchTestForms(schoolId)).find(f => f.id === res.form_id) || null;
      setWizardResult({ blueprint, form: createdForm, formCode: wizardFormCode });
      setWizardStep(5);
      addToast('Admission test generated and ready to share', 'success');
    } catch (err: any) {
      console.warn('Admission wizard generation failed', err);
      setWizardError(friendlyAdmissionError(err.message));
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
      addToast(err.message || 'Failed to create blueprint', 'error');
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
        addToast(res.error || 'Failed to generate form', 'error');
      }
    } finally {
      setIsGeneratingForm(false);
    }
  };

  const handlePublishForm = async (formId: string) => {
    const res = await AdmService.publishForm(formId);
    if (res.success) { addToast('Form published', 'success'); await loadAll(); }
    else addToast(res.error || 'Failed to publish', 'error');
  };

  const handleCloseForm = async (formId: string) => {
    const res = await AdmService.closeForm(formId);
    if (res.success) { addToast('Form closed', 'success'); await loadAll(); }
    else addToast(res.error || 'Failed to close', 'error');
  };

  // Delete handlers
  const handleDeleteBlueprint = async (id: string) => {
    if (!confirm('Delete this blueprint? Any generated forms from it will remain.')) return;
    try { await AdmService.deleteBlueprint(id); addToast('Blueprint deleted', 'success'); await loadAll(); }
    catch (err: any) { addToast(err.message || 'Failed to delete blueprint', 'error'); }
  };

  const handleDeleteForm = async (id: string) => {
    if (!confirm('Delete this test form and all its questions? Existing attempts will also be affected.')) return;
    try { await AdmService.deleteTestForm(id); addToast('Form deleted', 'success'); await loadAll(); }
    catch (err: any) { addToast(err.message || 'Failed to delete form', 'error'); }
  };

  const handleDeleteCandidate = async (id: string) => {
    if (!confirm('Delete this candidate and ALL their test data (attempts, answers, placements)? This cannot be undone.')) return;
    try { await AdmService.deleteCandidate(id); addToast('Candidate deleted', 'success'); await loadAll(); }
    catch (err: any) { addToast(err.message || 'Failed to delete candidate', 'error'); }
  };

  const handleDeleteAttempt = async (id: string) => {
    if (!confirm('Delete this test attempt and its answers? This cannot be undone.')) return;
    try { await AdmService.deleteAttempt(id); addToast('Attempt deleted', 'success'); await loadAll(); }
    catch (err: any) { addToast(err.message || 'Failed to delete attempt', 'error'); }
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
      addToast(err.message || 'Failed to create candidate', 'error');
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
      addToast(err.message || 'Bulk import failed', 'error');
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

  const handleViewReport = async (attemptId: string) => {
    setReportLoading(true);
    setShowReport(true);
    setReportAttemptId(attemptId);
    setShowAnswers(false);
    try {
      const report = await AdmService.getCandidateReport(attemptId);
      setReportData(report);
    } catch {
      addToast('Failed to load report', 'error');
      setShowReport(false);
    } finally {
      setReportLoading(false);
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
      addToast(`AI report failed: ${err.message}`, 'error');
    } finally {
      setGeneratingAiReport(false);
    }
  };

  const handleRecordPlacement = async (attemptId: string, band: PlacementBand) => {
    const res = await AdmService.recordPlacement(attemptId, band, null, null, null);
    if (res.success) { addToast('Placement recorded', 'success'); await loadAll(); }
    else addToast(res.error || 'Failed', 'error');
  };

  // ── Tab config ──

  const tabs: { key: AdmTab; label: string; icon: string }[] = [
    { key: 'create', label: 'Create Admission Test', icon: '✨' },
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'pools', label: 'Advanced: Question Pools', icon: '📝' },
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
        c.token.toLowerCase().includes(q)
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
    <div className={`rounded-xl border ${accent} bg-slate-800/60 p-4 flex items-center gap-3`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
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
      draft: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
      published: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      closed: 'bg-red-500/20 text-red-300 border-red-500/40',
      registered: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      testing: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      placed: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      scored: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      pending: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
      'not sent': 'bg-gray-500/20 text-gray-500 border-gray-600/40',
      expired: 'bg-red-500/20 text-red-300 border-red-500/40',
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold capitalize ${map[status] || 'bg-gray-500/20 text-gray-300'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const inputClass = 'w-full rounded-lg border border-gray-600 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400 focus:outline-none';
  const btnPrimary = 'rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed';
  const btnSecondary = 'rounded-lg border border-gray-600 hover:border-gray-500 px-3 py-1.5 text-xs text-gray-300 hover:text-white transition';

  // ── RENDER ──

  if (loading && !schoolId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-cyan-200">
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
          <h2 className="text-xl font-heading text-white mb-2">No School Access</h2>
          <p className="text-sm text-gray-400">You need school admin or teacher role to access the Admission Hub.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton onClick={onComplete} label="Back" />
        <div className="flex-1">
          <h1 className="text-2xl font-heading text-white flex items-center gap-2">
            <span className="text-3xl">🎓</span> Admission Hub
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage entrance tests, candidates, and placements</p>
        </div>
        <button
          onClick={() => loadAll()}
          disabled={loading}
          className="rounded-lg border border-gray-600 hover:border-cyan-500 bg-slate-800/60 hover:bg-slate-700/60 px-3 py-2 text-sm text-gray-300 hover:text-cyan-200 transition flex items-center gap-1.5 disabled:opacity-40"
          title="Refresh data"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 pb-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTab === t.key
                ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/50'
                : 'bg-slate-800/50 text-gray-400 border border-transparent hover:text-gray-200 hover:bg-slate-700/50'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center gap-2 text-cyan-300 text-sm py-4">
          <div className="h-4 w-4 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
          Loading data…
        </div>
      )}

      {/*  ━━━ CREATE ADMISSION TEST WIZARD ━━━  */}
      {activeTab === 'create' && !loading && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 via-slate-900/80 to-indigo-950/40 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">School-friendly setup</p>
                <h2 className="mt-1 text-2xl font-heading text-white">Create an admission test</h2>
                <p className="mt-2 max-w-2xl text-sm text-gray-300">Choose the grade, subject, length, and difficulty. The Hub will create the technical setup and test form behind the scenes.</p>
              </div>
              <button onClick={() => setActiveTab('blueprints')} className={btnSecondary}>Advanced setup</button>
            </div>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {['Basics', 'Style', 'Questions', 'Review', 'Share'].map((label, i) => {
                const step = i + 1;
                return (
                  <button key={label} onClick={() => setWizardStep(step)} className={`rounded-xl border px-2 py-3 text-center text-xs transition ${wizardStep === step ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : wizardStep > step ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-gray-700 bg-slate-800/50 text-gray-400'}`}>
                    <div className="text-lg">{wizardStep > step ? '✓' : step}</div>
                    <div className="font-semibold">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {wizardError && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">⚠️ {wizardError}</div>}

          {wizardStep === 1 && (
            <div className="rounded-xl border border-gray-700 bg-slate-800/70 p-5 space-y-4">
              <h3 className="font-semibold text-white">Step 1: Test basics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><label className="block text-xs font-semibold text-gray-300 mb-1">Test name</label><input className={inputClass} value={wizardName} onChange={e => setWizardName(e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-gray-300 mb-1">Grade / Stage</label><input type="number" min={1} className={inputClass} value={wizardGrade} onChange={e => setWizardGrade(+e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-gray-300 mb-1">Subject</label><select className={inputClass} value={wizardSubject} onChange={e => setWizardSubject(e.target.value)}><option value="english">English</option><option value="math">Mathematics</option><option value="science">Science</option><option value="chemistry">Chemistry</option></select></div>
                <div className="md:col-span-2"><label className="block text-xs font-semibold text-gray-300 mb-1">Internal setup note <span className="text-gray-500">(optional, not shown to candidates yet)</span></label><textarea className={inputClass} rows={3} value={wizardDescription} onChange={e => setWizardDescription(e.target.value)} placeholder="Example: Remind office staff that calculators are not allowed. This note is not saved to the test." /><p className="mt-1 text-[11px] text-amber-200/80">Candidate-facing instructions are not supported by the current admission test backend, so this note is only for this setup session.</p></div>
              </div>
              <button onClick={() => setWizardStep(2)} disabled={!wizardName.trim()} className={btnPrimary}>Next: Test style</button>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="rounded-xl border border-gray-700 bg-slate-800/70 p-5 space-y-4">
              <h3 className="font-semibold text-white">Step 2: Test style</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {(Object.keys(WIZARD_DIFFICULTY_META) as WizardDifficulty[]).map(key => <button key={key} onClick={() => setWizardDifficulty(key)} className={`rounded-xl border p-3 text-left ${wizardDifficulty === key ? 'border-cyan-400 bg-cyan-500/20' : 'border-gray-700 bg-slate-900/50 hover:border-gray-500'}`}><div className="font-semibold text-white">{WIZARD_DIFFICULTY_META[key].label}</div><div className="mt-1 text-xs text-gray-400">{WIZARD_DIFFICULTY_META[key].description}</div></button>)}
              </div>
              {wizardDifficulty === 'custom' && <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-100">Custom distributions are available in Advanced setup. This wizard will use the balanced mix unless you switch to Advanced setup.</div>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-semibold text-gray-300 mb-1">Number of questions</label><input type="number" min={1} className={inputClass} value={wizardQuestionCount} onChange={e => setWizardQuestionCount(+e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-gray-300 mb-1">Duration (minutes)</label><input type="number" min={5} className={inputClass} value={wizardDuration} onChange={e => setWizardDuration(+e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-gray-300 mb-1">Pass mark (%)</label><input type="number" min={1} max={100} className={inputClass} value={wizardPassPercentage} onChange={e => setWizardPassPercentage(+e.target.value)} /></div>
              </div>
              <div className="flex gap-2"><button onClick={() => setWizardStep(1)} className={btnSecondary}>Back</button><button onClick={() => setWizardStep(3)} className={btnPrimary}>Next: Question source</button></div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="rounded-xl border border-gray-700 bg-slate-800/70 p-5 space-y-4">
              <h3 className="font-semibold text-white">Step 3: Question source</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={() => setWizardSource('auto')} className={`rounded-xl border p-4 text-left ${wizardSource === 'auto' ? 'border-emerald-400 bg-emerald-500/15' : 'border-gray-700 bg-slate-900/50'}`}><div className="font-semibold text-white">Recommended: auto-select questions</div><div className="text-xs text-gray-400 mt-1">Use published questions matching this subject and Grade / Stage.</div></button>
                <button onClick={() => setWizardSource('pool')} className={`rounded-xl border p-4 text-left ${wizardSource === 'pool' ? 'border-cyan-400 bg-cyan-500/15' : 'border-gray-700 bg-slate-900/50'}`}><div className="font-semibold text-white">Advanced: choose a question pool</div><div className="text-xs text-gray-400 mt-1">Limit this test to one specific pool.</div></button>
              </div>
              {wizardSource === 'pool' && <div><label className="block text-xs font-semibold text-gray-300 mb-1">Question pool</label><select className={inputClass} value={wizardPoolId} onChange={e => setWizardPoolId(e.target.value)}><option value="">Choose a pool…</option>{pools.filter(p => p.is_active && p.subject === wizardSubject).map(p => <option key={p.id} value={p.id}>{p.name}{p.stage ? ` (Stage ${p.stage})` : ''}</option>)}</select></div>}
              <div className={`rounded-xl border p-4 ${wizardCanGenerate ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
                <div className="flex items-center justify-between gap-3"><div className="font-semibold text-white">Availability check</div>{wizardCheckingAvailability && <span className="text-xs text-cyan-300">Checking…</span>}</div>
                <p className="mt-1 text-sm text-gray-300">Found {wizardAvailability.availableForRequired} of {wizardQuestionCount} required matching published questions across {wizardMatchingPools.length} pool{wizardMatchingPools.length === 1 ? '' : 's'}.</p>
                {wizardCanGenerate ? <p className="mt-1 text-sm text-emerald-200">This setup can generate a valid admission test.</p> : <p className="mt-1 text-sm text-amber-100">{wizardMatchingPools.length === 0 ? `No active ${wizardSubjectLabel} pool matches Grade / Stage ${wizardGrade}.` : `Missing: ${wizardAvailability.missing.join(', ') || `${wizardQuestionCount - wizardAvailability.required} more matching published questions`}.`}</p>}
              </div>
              <div className="flex gap-2"><button onClick={() => setWizardStep(2)} className={btnSecondary}>Back</button><button onClick={() => setWizardStep(4)} disabled={!wizardCanGenerate} className={btnPrimary}>Next: Review</button></div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="rounded-xl border border-gray-700 bg-slate-800/70 p-5 space-y-4">
              <h3 className="font-semibold text-white">Step 4: Review & Generate</h3>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-cyan-50">This will create a Grade {wizardGrade} {wizardSubjectLabel} admission test with {wizardQuestionCount} questions, {wizardDuration} minutes, {WIZARD_DIFFICULTY_META[wizardDifficulty].label.toLowerCase()} difficulty, pass mark {wizardPassPercentage}%.</div>
              {wizardDescription.trim() && <div className="rounded-lg border border-gray-700 bg-slate-900/60 p-3 text-sm text-gray-300"><span className="font-semibold text-white">Internal setup note only:</span> {wizardDescription}<div className="mt-1 text-[11px] text-amber-200/80">This note is not saved or shown to candidates.</div></div>}
              <div className="text-xs text-gray-500">Behind the scenes, this creates an admission blueprint, generates a test form, and publishes it so candidates can take it.</div>
              <div className="flex gap-2"><button onClick={() => setWizardStep(3)} disabled={wizardGenerating} className={btnSecondary}>Back</button><button onClick={handleWizardGenerate} disabled={wizardGenerating || !wizardCanGenerate} className={btnPrimary}>{wizardGenerating ? 'Generating admission test…' : 'Generate Admission Test'}</button></div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-4">
              <h3 className="text-lg font-semibold text-white">Step 5: Publish / Share</h3>
              {wizardResult ? <>
                <p className="text-sm text-emerald-100">Your admission test is ready. This app uses candidate-specific test links, so register candidates to create personal test links. You can also copy the form code for your office records.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-900/60 p-3"><div className="text-xs text-gray-400">Test</div><div className="font-semibold text-white">{wizardResult.blueprint.name}</div></div>
                  <div className="rounded-lg bg-slate-900/60 p-3"><div className="text-xs text-gray-400">Form code</div><div className="font-mono text-lg text-cyan-200">{wizardResult.formCode}</div></div>
                  <div className="rounded-lg bg-slate-900/60 p-3"><div className="text-xs text-gray-400">Status</div><div>{statusPill(wizardResult.form?.status || 'published')}</div></div>
                </div>
                <div className="flex flex-wrap gap-2"><button onClick={() => { navigator.clipboard.writeText(wizardResult.formCode); addToast('Form code copied', 'success'); }} className={btnPrimary}>Copy form code</button><button onClick={() => setActiveTab('candidates')} className={btnSecondary}>Go to Candidates</button><button onClick={() => setActiveTab('results')} className={btnSecondary}>Go to Results</button><button onClick={() => setActiveTab('forms')} className={btnSecondary}>Manage in Advanced Test Forms</button></div>
              </> : <p className="text-sm text-gray-300">Generate an admission test first, then sharing options will appear here.</p>}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ OVERVIEW TAB ━━━  */}
      {activeTab === 'overview' && !loading && (
        <div className="space-y-6">
          {/* Admission Pipeline - Visual Step Tracker */}
          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-800/80 via-slate-800/60 to-slate-800/80 p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <span className="text-lg">🚀</span> Admission Pipeline
            </h3>
            <div className="flex items-center justify-between gap-1">
              {PIPELINE_STEPS.map((step, i) => {
                const done = pipelineProgress[step.key as keyof typeof pipelineProgress];
                return (
                  <React.Fragment key={step.key}>
                    <button
                      onClick={() => setActiveTab(step.key as AdmTab)}
                      className={`flex-1 rounded-xl p-3 text-center transition-all cursor-pointer border ${
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : 'border-gray-700 bg-slate-800/40 hover:bg-slate-700/40'
                      }`}
                    >
                      <div className={`text-2xl mb-1 ${done ? 'grayscale-0' : 'grayscale opacity-50'}`}>{step.icon}</div>
                      <div className={`text-xs font-semibold ${done ? 'text-emerald-300' : 'text-gray-400'}`}>{step.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{step.desc}</div>
                      {done && <div className="text-emerald-400 text-xs mt-1">✓</div>}
                    </button>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className={`w-6 h-0.5 shrink-0 ${done ? 'bg-emerald-500/50' : 'bg-gray-700'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCard('Question Pools', pools.length, '📝', 'border-cyan-500/30')}
            {statCard('Blueprints', blueprints.length, '📐', 'border-blue-500/30')}
            {statCard('Test Forms', forms.length, '📋', 'border-indigo-500/30')}
            {statCard('Candidates', candidates.length, '👤', 'border-purple-500/30')}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCard('Active Tests', forms.filter(f => f.status === 'published').length, '✅', 'border-emerald-500/30')}
            {statCard('Attempts', attempts.length, '📊', 'border-amber-500/30')}
            {statCard('Scored', attempts.filter(a => a.status === 'scored').length, '🏆', 'border-yellow-500/30')}
            {statCard('Placed', placements.length, '🎯', 'border-pink-500/30')}
          </div>

          {/* Band Distribution Chart */}
          {placements.length > 0 && (
            <div className="rounded-xl border border-gray-700 bg-slate-800/60 p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Band Distribution</h3>
              <div className="flex items-end gap-3 h-32">
                {(['A', 'B', 'C', 'D', 'E'] as PlacementBand[]).map(band => {
                  const count = bandDistribution[band];
                  const maxBand = Math.max(...Object.values(bandDistribution), 1);
                  const heightPct = (count / maxBand) * 100;
                  return (
                    <div key={band} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-300 font-bold">{count}</span>
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

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => setActiveTab('candidates')} className="group rounded-xl border border-purple-500/30 bg-slate-800/60 p-5 hover:bg-purple-900/20 hover:border-purple-500/50 transition-all text-left">
              <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">➕</span>
              <div className="text-sm font-semibold text-white">Register Candidates</div>
              <div className="text-xs text-gray-400 mt-1">Add one or bulk import from CSV</div>
              {candidates.length > 0 && <div className="text-xs text-purple-400 mt-2">{candidates.filter(c => c.status === 'registered').length} awaiting test</div>}
            </button>
            <button onClick={() => setActiveTab('forms')} className="group rounded-xl border border-indigo-500/30 bg-slate-800/60 p-5 hover:bg-indigo-900/20 hover:border-indigo-500/50 transition-all text-left">
              <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">📋</span>
              <div className="text-sm font-semibold text-white">Manage Tests</div>
              <div className="text-xs text-gray-400 mt-1">Generate, publish, or close test forms</div>
              {forms.filter(f => f.status === 'published').length > 0 && <div className="text-xs text-indigo-400 mt-2">{forms.filter(f => f.status === 'published').length} active</div>}
            </button>
            <button onClick={() => setActiveTab('results')} className="group rounded-xl border border-amber-500/30 bg-slate-800/60 p-5 hover:bg-amber-900/20 hover:border-amber-500/50 transition-all text-left">
              <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">🏆</span>
              <div className="text-sm font-semibold text-white">View Results</div>
              <div className="text-xs text-gray-400 mt-1">Review scores, AI analysis & placements</div>
              {attempts.filter(a => a.status === 'scored' && !placements.find(p => p.attempt_id === a.id)).length > 0 && (
                <div className="text-xs text-amber-400 mt-2 animate-pulse">{attempts.filter(a => a.status === 'scored' && !placements.find(p => p.attempt_id === a.id)).length} need placement</div>
              )}
            </button>
          </div>

          {/* Recent Activity */}
          {attempts.length > 0 && (
            <div className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Activity</h3>
              <div className="space-y-2">
                {attempts.slice(0, 5).map(a => {
                  const cand = candidates.find(c => c.id === a.candidate_id);
                  return (
                    <div key={a.id} className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500 w-28 shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
                      <span className="text-white font-medium">{cand?.full_name || 'Unknown'}</span>
                      {statusPill(a.status)}
                      {a.percentage !== null && <span className="text-cyan-300 ml-auto">{a.percentage}%</span>}
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
            <h2 className="text-lg font-semibold text-white">Question Pools</h2>
            <div className="text-xs text-gray-400">
              {pools.length} pool{pools.length !== 1 ? 's' : ''} loaded
            </div>
          </div>

          {/* Available subjects */}
          <div className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Available Subjects</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(BLUEPRINT_PRESETS).map(([key, preset]) => {
                const poolExists = pools.some(p => p.subject.toLowerCase() === key);
                return (
                  <div key={key} className={`rounded-lg border p-3 text-center ${poolExists ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-700 bg-slate-800/40 opacity-50'}`}>
                    <div className="text-2xl mb-1">{preset.icon}</div>
                    <div className="text-sm font-semibold text-white">{preset.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
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
              <p className="text-gray-400 text-sm">No question pools yet.</p>
              <p className="text-gray-500 text-xs mt-1">Run the import script or upload pool JSON to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pools.map((p) => {
                const subjectKey = p.subject.toLowerCase();
                const preset = BLUEPRINT_PRESETS[subjectKey];
                return (
                  <div key={p.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4 flex items-center justify-between hover:border-gray-600 transition">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{preset?.icon || '📄'}</span>
                      <div>
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.subject} · Stage {p.stage} {p.school_id ? '' : '· 🌐 Global'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</div>
                      {p.is_active && <div className="text-[10px] text-emerald-400 mt-0.5">Active</div>}
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
            <h2 className="text-lg font-semibold text-white">Test Blueprints</h2>
            <button onClick={() => setCreatingBlueprint(!creatingBlueprint)} className={btnSecondary}>
              {creatingBlueprint ? 'Cancel' : '+ New Blueprint'}
            </button>
          </div>

          {creatingBlueprint && (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-800/80 p-5 space-y-4">
              {/* Subject Preset Buttons */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">Quick Preset — click to auto-fill</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(BLUEPRINT_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applySubjectPreset(key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition ${
                        bpSubject === key
                          ? 'border-cyan-500 bg-cyan-600/20 text-cyan-200'
                          : 'border-gray-600 bg-slate-700/60 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span>{preset.icon}</span> {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Name</label>
                  <input className={inputClass} value={bpName} onChange={e => setBpName(e.target.value)} placeholder="e.g. English Stage 9 — Admission Test" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Subject</label>
                  <select className={inputClass} value={bpSubject} onChange={e => applySubjectPreset(e.target.value)}>
                    <option value="english">English</option>
                    <option value="math">Mathematics</option>
                    <option value="science">Science</option>
                    <option value="chemistry">Chemistry</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Question Pool</label>
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
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {subjectPools.filter(p => p.stage === bpTargetStage).length > 0
                        ? `Will match: ${subjectPools.filter(p => p.stage === bpTargetStage).map(p => p.name).join(', ')}`
                        : 'No pool matches this stage — select one above or adjust stage.'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Target Stage</label>
                  <input type="number" className={inputClass} value={bpTargetStage} onChange={e => setBpTargetStage(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Duration (min)</label>
                  <input type="number" className={inputClass} value={bpDuration} onChange={e => setBpDuration(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Total Marks</label>
                  <input type="number" className={inputClass} value={bpTotalMarks} onChange={e => setBpTotalMarks(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Pass Percentage (%)</label>
                  <input type="number" className={inputClass} value={bpPassPercentage} onChange={e => setBpPassPercentage(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Mode</label>
                  <select className={inputClass} value={bpDelivery} onChange={e => setBpDelivery(e.target.value as 'practice' | 'exam')}>
                    <option value="exam">Exam</option>
                    <option value="practice">Practice</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">Question Distribution</label>
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
                        <span className="text-[10px] text-red-400">Hard</span>
                        <input type="number" min={0} className={`${inputClass} w-14 text-center`} value={row.hard}
                          onChange={e => { const next = [...distRows]; next[ri].hard = +e.target.value; setDistRows(next); }} />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{row.easy + row.medium + row.hard}</span>
                      <button onClick={() => setDistRows(distRows.filter((_, i) => i !== ri))} className="text-red-400 hover:text-red-300 text-sm px-1" title="Remove">✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setDistRows([...distRows, { type: '', easy: 0, medium: 0, hard: 0 }])}
                    className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
                  >
                    + Add question type
                  </button>
                  <div className="text-xs text-gray-500 mt-1">
                    Total: <strong className="text-white">{distRows.reduce((s, r) => s + r.easy + r.medium + r.hard, 0)}</strong> questions
                  </div>
                </div>
              </div>
              <button onClick={handleCreateBlueprint} disabled={creatingBlueprint && !bpName} className={btnPrimary}>
                Create Blueprint
              </button>
            </div>
          )}

          {blueprints.length === 0 && !creatingBlueprint ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No blueprints yet. Create one to define your test structure.
            </div>
          ) : (
            <div className="space-y-3">
              {blueprints.map((bp) => {
                const linkedPool = bp.pool_id ? pools.find(p => p.id === bp.pool_id) : null;
                return (
                <div key={bp.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{bp.name}</div>
                      <div className="text-xs text-gray-400">
                        {bp.duration_minutes}min · {bp.total_marks} marks · {bp.delivery_mode} · pass ≥ {bp.pass_percentage}%
                        {linkedPool && <span className="ml-1 text-cyan-400">· Pool: {linkedPool.name}</span>}
                        {!linkedPool && bp.target_stage && <span className="ml-1 text-gray-500">· auto-match stage {bp.target_stage}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDeleteBlueprint(bp.id)} className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition" title="Delete blueprint">🗑</button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(bp.question_distribution).map(([type, val]) => {
                      const total = typeof val === 'object' && val !== null
                        ? Object.values(val as Record<string, number>).reduce((s, n) => s + n, 0)
                        : val;
                      return (
                        <span key={type} className="px-2 py-0.5 rounded bg-slate-700 text-xs text-gray-300">
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
            <h2 className="text-lg font-semibold text-white">Test Forms</h2>
            <button onClick={() => !isGeneratingForm && setGeneratingForm(!generatingForm)} disabled={isGeneratingForm} className={btnSecondary}>
              {generatingForm ? 'Cancel' : '+ Generate Form'}
            </button>
          </div>

          {generatingForm && (
            <div className="rounded-xl border border-indigo-500/30 bg-slate-800/80 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Blueprint</label>
                  <select className={inputClass} value={genBlueprintId} onChange={e => generateFormCode(e.target.value)}>
                    <option value="">Select blueprint…</option>
                    {blueprints.map(bp => <option key={bp.id} value={bp.id}>{bp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Form Code (auto-generated, editable)</label>
                  <input className={inputClass} value={genFormCode} onChange={e => setGenFormCode(e.target.value)} placeholder="e.g. ENG9-2026-A" />
                </div>
              </div>
              <button onClick={handleGenerateForm} disabled={!genBlueprintId || !genFormCode || isGeneratingForm} className={btnPrimary}>
                {isGeneratingForm ? 'Generating…' : 'Generate Form'}
              </button>
            </div>
          )}

          {forms.length === 0 && !generatingForm ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No test forms yet. Generate one from a blueprint.
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map((f) => (
                <div key={f.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm font-bold text-white">{f.form_code}</div>
                      {statusPill(f.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.status === 'draft' && (
                        <button onClick={() => handlePublishForm(f.id)} className="text-xs px-2 py-1 rounded bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 transition">
                          Publish
                        </button>
                      )}
                      {f.status === 'published' && (
                        <button onClick={() => handleCloseForm(f.id)} className="text-xs px-2 py-1 rounded bg-red-600/30 text-red-300 hover:bg-red-600/50 transition">
                          Close
                        </button>
                      )}
                      <button onClick={() => handleDeleteForm(f.id)} className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition" title="Delete form">🗑</button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created {new Date(f.created_at).toLocaleString()}
                    {f.published_at && ` · Published ${new Date(f.published_at).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ CANDIDATES TAB ━━━  */}
      {activeTab === 'candidates' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-white">Candidates</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBulkMode(false); setCreatingCandidate(!creatingCandidate); }}
                className={`${btnSecondary} ${!bulkMode && creatingCandidate ? 'border-cyan-500 text-cyan-300' : ''}`}
              >
                {creatingCandidate && !bulkMode ? 'Cancel' : '+ Add One'}
              </button>
              <button
                onClick={() => { setBulkMode(true); setCreatingCandidate(!creatingCandidate || !bulkMode); }}
                className={`${btnSecondary} ${bulkMode && creatingCandidate ? 'border-cyan-500 text-cyan-300' : ''}`}
              >
                {creatingCandidate && bulkMode ? 'Cancel' : '📋 Bulk Import'}
              </button>
            </div>
          </div>

          {/* Bulk import */}
          {creatingCandidate && bulkMode && (
            <div className="rounded-xl border border-amber-500/30 bg-slate-800/80 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white mb-1">Paste candidate list</h4>
                  <p className="text-xs text-gray-400 mb-3">One candidate per line. Format: <span className="font-mono text-cyan-400">Name, Email, Phone, Grade</span> (comma or tab separated)</p>
                  <textarea
                    className={`${inputClass} h-32 font-mono text-xs`}
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={`Ahmed Al-Rashid, parent@email.com, +971501234567, 9\nFatima Hassan, fatima@school.com, +971509876543, 9\nOmar Khalid, , +971507654321, 8`}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
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
            <div className="rounded-xl border border-purple-500/30 bg-slate-800/80 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Full Name *</label>
                  <input className={inputClass} value={candName} onChange={e => setCandName(e.target.value)} placeholder="Ahmed Al-Rashid" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Email *</label>
                  <input type="email" className={inputClass} value={candEmail} onChange={e => setCandEmail(e.target.value)} placeholder="parent@email.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Parent Phone *</label>
                  <input className={inputClass} value={candPhone} onChange={e => setCandPhone(e.target.value)} placeholder="+971 50 123 4567" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Applied Grade *</label>
                  <input type="number" className={inputClass} value={candAppliedGrade} onChange={e => setCandAppliedGrade(e.target.value)} placeholder="9" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Current Grade <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input type="number" className={inputClass} value={candCurrentGrade} onChange={e => setCandCurrentGrade(e.target.value)} placeholder="7" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Date of Birth <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input type="date" className={inputClass} value={candDob} onChange={e => setCandDob(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Previous Curriculum <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candPreviousCurriculum} onChange={e => setCandPreviousCurriculum(e.target.value)} placeholder="Cambridge, CBSE, IB…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Previous School Language <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candPreviousSchoolLanguage} onChange={e => setCandPreviousSchoolLanguage(e.target.value)} placeholder="English, Arabic…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Home Language <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candHomeLanguage} onChange={e => setCandHomeLanguage(e.target.value)} placeholder="Arabic, English…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Years in English-medium Education <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input type="number" step="0.5" className={inputClass} value={candYearsEnglishMedium} onChange={e => setCandYearsEnglishMedium(e.target.value)} placeholder="3" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Admin Notes <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input className={inputClass} value={candNotes} onChange={e => setCandNotes(e.target.value)} placeholder="Any additional notes…" />
                </div>
              </div>
              <button onClick={handleCreateCandidate} disabled={!candName || !candEmail || !candPhone || !candAppliedGrade} className={btnPrimary}>
                Register Candidate
              </button>
            </div>
          )}

          {/* Search & Filter Bar */}
          {candidates.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                <input
                  className={`${inputClass} pl-9`}
                  value={candSearch}
                  onChange={e => setCandSearch(e.target.value)}
                  placeholder="Search by name, email, or token…"
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
              <span className="text-xs text-gray-500">{filteredCandidates.length} of {candidates.length}</span>
            </div>
          )}

          {candidates.length === 0 && !creatingCandidate ? (
            <div className="card-glass p-8 text-center">
              <span className="text-4xl block mb-3">👤</span>
              <p className="text-gray-400 text-sm">No candidates registered yet.</p>
              <p className="text-gray-500 text-xs mt-1">Click "+ Add One" or "Bulk Import" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Contact</th>
                    <th className="pb-2 pr-4">Grade</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Send Test</th>
                    <th className="pb-2 pr-4">File</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredCandidates.map((c) => {
                    const publishedForms = forms.filter(f => f.status === 'published');
                    return (
                      <tr key={c.id} className="text-gray-300 hover:bg-slate-700/30 transition">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-white">{c.full_name}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">{c.token.slice(0, 12)}…</div>
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {c.email && <div>{c.email}</div>}
                          {c.parent_phone && <div className="text-gray-500">{c.parent_phone}</div>}
                          {!c.email && !c.parent_phone && <span className="text-gray-600">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-xs">{c.applied_grade || '—'}</td>
                        <td className="py-3 pr-4">
                          {(() => {
                            const publishedFormsForStatus = forms.filter(f => f.status === 'published');
                            if (publishedFormsForStatus.length === 0) return statusPill(c.status);
                            return (
                              <div className="flex flex-col gap-1">
                                {publishedFormsForStatus.map(f => {
                                  const attempt = attempts.find(a => a.candidate_id === c.id && a.form_id === f.id);
                                  const formLabel = f.form_code.split('-')[0]; // e.g. "ENG9" or "MAT9"
                                  let status = 'not sent';
                                  if (attempt) status = attempt.status;
                                  else if (c.status === 'registered') status = 'pending';
                                  return (
                                    <div key={f.id} className="flex items-center gap-1">
                                      <span className="text-[10px] text-gray-500 w-10">{formLabel}</span>
                                      {statusPill(status)}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {publishedForms.map(f => {
                              const link = AdmService.buildTestLink(window.location.origin, c.token, f.form_code);
                              return (
                                <div key={f.id} className="flex items-center gap-1">
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(link); addToast('Link copied!', 'success'); }}
                                    className="text-xs px-2 py-1 rounded bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50 transition"
                                    title="Copy link"
                                  >
                                    📋
                                  </button>
                                  {c.parent_phone && (
                                    <button
                                      onClick={() => shareViaWhatsApp(c.parent_phone, link, c.full_name)}
                                      className="text-xs px-2 py-1 rounded bg-green-600/30 text-green-300 hover:bg-green-600/50 transition"
                                      title="Send via WhatsApp"
                                    >
                                      💬
                                    </button>
                                  )}
                                  {c.email && (
                                    <button
                                      onClick={() => shareViaEmail(c.email, link, c.full_name)}
                                      className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 transition"
                                      title="Send via Email"
                                    >
                                      ✉️
                                    </button>
                                  )}
                                  <span className="text-[10px] text-gray-500">{f.form_code}</span>
                                </div>
                              );
                            })}
                            {publishedForms.length === 0 && (
                              <span className="text-xs text-gray-600 italic">No published tests</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          <button onClick={() => setCandidateFileId(c.id)} className="text-xs px-2 py-1 rounded bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 transition" title="View candidate file">📁</button>
                        </td>
                        <td className="py-3">
                          <button onClick={() => handleDeleteCandidate(c.id)} className="text-xs px-1.5 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition" title="Delete candidate">🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/*  ━━━ RESULTS TAB ━━━  */}
      {activeTab === 'results' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Test Results</h2>
            {attempts.filter(a => a.status === 'scored').length > 0 && (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>Avg: <strong className="text-cyan-300">{Math.round(attempts.filter(a => a.percentage != null).reduce((s, a) => s + (a.percentage || 0), 0) / Math.max(attempts.filter(a => a.percentage != null).length, 1))}%</strong></span>
                <span>Scored: <strong className="text-emerald-300">{attempts.filter(a => a.status === 'scored').length}</strong></span>
                <span>Placed: <strong className="text-purple-300">{placements.length}</strong></span>
              </div>
            )}
          </div>

          {attempts.length === 0 ? (
            <div className="card-glass p-8 text-center">
              <span className="text-4xl block mb-3">🏆</span>
              <p className="text-gray-400 text-sm">No test attempts yet.</p>
              <p className="text-gray-500 text-xs mt-1">Results will appear here once candidates complete their tests.</p>
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
                    <div key={cId} className="rounded-2xl border border-gray-700 bg-slate-800/40 overflow-hidden">
                      {/* Candidate header */}
                      <div className="flex items-center gap-3 px-5 py-3 bg-slate-800/80 border-b border-gray-700/50">
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-lg font-bold text-white">
                          {(cand?.full_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-white">{cand?.full_name || 'Unknown'}</div>
                          <div className="text-[11px] text-gray-500">
                            {cand?.email || ''}{cand?.email && cand?.parent_phone ? ' · ' : ''}{cand?.parent_phone || ''}
                            {cand?.applied_grade ? ` · Grade ${cand.applied_grade}` : ''}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">{candAttempts.length} test{candAttempts.length > 1 ? 's' : ''}</div>
                      </div>

                      {/* Per-test results */}
                      <div className="divide-y divide-gray-700/50">
                        {candAttempts.map(a => {
                          const form = forms.find(f => f.id === a.form_id);
                          const bp = form ? blueprints.find(b => b.id === form.blueprint_id) : null;
                          const testLabel = bp ? `${bp.subject.charAt(0).toUpperCase() + bp.subject.slice(1)}` : (form?.form_code || 'Test');
                          const placement = placements.find(p => p.attempt_id === a.id);
                          const scorePct = a.percentage ?? 0;
                          const scoreColor = scorePct >= 80 ? 'text-emerald-400' : scorePct >= 60 ? 'text-cyan-400' : scorePct >= 40 ? 'text-amber-400' : 'text-red-400';
                          const barColor = scorePct >= 80 ? 'bg-emerald-500' : scorePct >= 60 ? 'bg-cyan-500' : scorePct >= 40 ? 'bg-amber-500' : 'bg-red-500';
                          return (
                            <div key={a.id} className="px-5 py-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-semibold">{testLabel}</span>
                                  <span className="text-[10px] text-gray-500 font-mono">{form?.form_code}</span>
                                  {statusPill(a.status)}
                                  <span className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  {a.percentage !== null && (
                                    <div className="text-right">
                                      <span className={`text-xl font-bold ${scoreColor}`}>{a.percentage}%</span>
                                      <span className="text-xs text-gray-500 ml-1">{a.total_score}/{a.max_score}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {a.percentage !== null && (
                                <div className="mt-2 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${scorePct}%` }} />
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-2">
                                <div>{placement && <span className="mr-2">{bandBadge(placement.band)}</span>}</div>
                                <div className="flex items-center gap-2">
                                  {a.status === 'scored' && (
                                    <button onClick={() => handleViewReport(a.id)} className="text-xs px-3 py-1 rounded-lg bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 transition flex items-center gap-1">
                                      📊 Report
                                    </button>
                                  )}
                                  {a.status === 'scored' && !placement && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500 mr-1">Place:</span>
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
                                  <button onClick={() => handleDeleteAttempt(a.id)} className="text-xs px-1.5 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition" title="Delete attempt">🗑</button>
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
        </div>
      )}

      {/*  ━━━ AUDIT TAB ━━━  */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Activity Log</h2>
          {auditLog.length === 0 ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">No entries yet.</div>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {auditLog.map((entry, i) => {
                const details = entry.details || {};
                const actionMap: Record<string, { icon: string; label: string; color: string }> = {
                  attempt_started: { icon: '🚀', label: 'Test Started', color: 'text-blue-300' },
                  attempt_scored: { icon: '✅', label: 'Test Scored', color: 'text-emerald-300' },
                  form_published: { icon: '📋', label: 'Form Published', color: 'text-indigo-300' },
                  form_closed: { icon: '🔒', label: 'Form Closed', color: 'text-red-300' },
                  placement_decided: { icon: '🎯', label: 'Placement Made', color: 'text-purple-300' },
                };
                const actionInfo = actionMap[entry.action] || { icon: '📝', label: entry.action.replace(/_/g, ' '), color: 'text-gray-300' };
                const candidateName = details.candidate || '';
                const formCode = details.form_code || '';
                const score = details.score != null ? `${details.score}/${details.max}` : '';
                const pct = details.percentage != null ? `${details.percentage}%` : '';
                const band = details.band || '';

                return (
                  <div key={i} className="rounded-lg border border-gray-700/50 bg-slate-800/40 px-4 py-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{actionInfo.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${actionInfo.color}`}>{actionInfo.label}</span>
                        {candidateName && <span className="text-sm text-white">{candidateName}</span>}
                        {formCode && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-gray-400 font-mono">{formCode}</span>}
                      </div>
                      {(score || band) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {score && <span className="text-xs text-gray-400">Score: {score} ({pct})</span>}
                          {band && <span className="text-xs text-gray-400">Band: {band}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 shrink-0">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => { setShowReport(false); setReportData(null); }}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-900 border border-gray-700 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            {reportLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
              </div>
            ) : reportData ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-heading text-white">{reportData.candidate_name}</h3>
                    <p className="text-xs text-gray-400">Form: {reportData.form_code}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">{reportData.percentage}%</div>
                    {bandBadge(reportData.band)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {statCard('Score', `${reportData.total_score}/${reportData.max_score}`, '🎯', 'border-cyan-500/30')}
                  {statCard('Started', new Date(reportData.started_at).toLocaleTimeString(), '🕐', 'border-gray-500/30')}
                  {statCard('Submitted', new Date(reportData.submitted_at).toLocaleTimeString(), '✅', 'border-emerald-500/30')}
                </div>

                {reportData.placement_recommendation && (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-900/10 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-sm font-semibold text-cyan-200">Placement Recommendation</h4>
                        <p className="text-lg font-bold text-white">{reportData.placement_recommendation.label}</p>
                      </div>
                      {reportData.placement_recommendation.interviewFlag && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">Interview recommended</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-900/50 p-3"><span className="text-xs text-gray-400">English readiness</span><p className="text-white font-semibold">{reportData.placement_recommendation.englishPercentage ?? 'Not enough data'}{reportData.placement_recommendation.englishPercentage != null ? '%' : ''}</p></div>
                      <div className="rounded-lg bg-slate-900/50 p-3"><span className="text-xs text-gray-400">Maths readiness</span><p className="text-white font-semibold">{reportData.placement_recommendation.mathsPercentage ?? 'Not enough data'}{reportData.placement_recommendation.mathsPercentage != null ? '%' : ''}</p></div>
                    </div>
                    <div>
                      <h5 className="text-xs font-semibold text-gray-300 mb-1">Why this recommendation?</h5>
                      <ul className="text-xs text-gray-300 list-disc pl-5 space-y-0.5">{reportData.placement_recommendation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                    <p className="text-xs text-cyan-100"><strong>Next action:</strong> {reportData.placement_recommendation.nextAction}</p>
                  </div>
                )}

                {reportData.candidate_profile && (
                  <div className="rounded-xl border border-gray-700 bg-slate-800/50 p-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Candidate Academic Profile</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-gray-500">Applying for</span><p className="text-white">Grade {reportData.candidate_profile.applied_grade ?? '—'}</p></div>
                      <div><span className="text-gray-500">Current grade</span><p className="text-white">{reportData.candidate_profile.current_grade ?? '—'}</p></div>
                      <div><span className="text-gray-500">Date of birth</span><p className="text-white">{reportData.candidate_profile.date_of_birth ?? '—'}</p></div>
                      <div><span className="text-gray-500">Previous curriculum</span><p className="text-white">{reportData.candidate_profile.previous_curriculum ?? '—'}</p></div>
                      <div><span className="text-gray-500">School language</span><p className="text-white">{reportData.candidate_profile.previous_school_language ?? '—'}</p></div>
                      <div><span className="text-gray-500">Home language</span><p className="text-white">{reportData.candidate_profile.home_language ?? '—'}</p></div>
                      <div><span className="text-gray-500">English-medium years</span><p className="text-white">{reportData.candidate_profile.years_english_medium ?? '—'}</p></div>
                    </div>
                  </div>
                )}

                {/* Diagnostic Breakdown */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Diagnostic Breakdown</h4>
                  {(reportData.diagnostic_breakdown ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500">Detailed subject and skill tags are not available for this older test yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(reportData.diagnostic_breakdown ?? []).map((t) => (
                        <div key={t.key} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-48 truncate capitalize">{t.subject} · {t.skill}{t.difficulty ? ` · ${t.difficulty}` : ''}</span>
                          <div className="flex-1 h-3 rounded bg-slate-700 overflow-hidden"><div className={`h-full rounded transition-all ${t.percentage >= 70 ? 'bg-emerald-500' : t.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${t.percentage}%` }} /></div>
                          <span className="text-xs text-gray-300 w-16 text-right">{t.score}/{t.maxScore}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Topic */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Performance by Topic</h4>
                  <div className="space-y-1.5">
                    {(reportData.by_topic ?? []).map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-40 truncate">{t.topic}</span>
                        <div className="flex-1 h-3 rounded bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${t.pct >= 70 ? 'bg-emerald-500' : t.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 w-12 text-right">{t.correct}/{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Type */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Performance by Question Type</h4>
                  <div className="space-y-1.5">
                    {(reportData.by_type ?? []).map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-40 truncate capitalize">{t.question_type.replace('_', ' ')}</span>
                        <div className="flex-1 h-3 rounded bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${t.pct >= 70 ? 'bg-emerald-500' : t.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 w-12 text-right">{t.correct}/{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths / Weaknesses */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-300 mb-1">Strengths</h4>
                    <ul className="text-xs text-gray-300 space-y-0.5">
                      {(reportData.strengths ?? []).map((s, i) => <li key={i}>✓ {s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-red-300 mb-1">Areas for Improvement</h4>
                    <ul className="text-xs text-gray-300 space-y-0.5">
                      {(reportData.weaknesses ?? []).map((w, i) => <li key={i}>△ {w}</li>)}
                    </ul>
                  </div>
                </div>

                {/* AI Summary */}
                {reportData.ai_summary && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-900/20 p-4">
                    <h4 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                      <span>🤖</span> AI Assessment
                    </h4>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{reportData.ai_summary}</p>
                  </div>
                )}

                {/* Generate AI Report Button — grades writing, re-checks text answers */}
                {!reportData.ai_summary && (
                  <div className="space-y-2">
                    {(reportData.answers ?? []).some(a => ['email_writing','essay_writing','gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured'].includes(a.question_type)) && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-3 py-2 text-xs text-amber-200">
                        ⚠️ This test has writing and/or open-ended answers that need AI grading for accurate scores. Click below to run AI grading.
                      </div>
                    )}
                    <button
                      onClick={() => handleGenerateAiReport(reportAttemptId!)}
                      disabled={generatingAiReport || !reportAttemptId}
                      className="w-full rounded-lg border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/30 px-4 py-2 text-sm text-purple-200 transition flex items-center justify-center gap-2 disabled:opacity-40"
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
                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-300 hover:text-white py-2 transition"
                  >
                    <span>📝 Detailed Answers ({(reportData.answers ?? []).length} questions)</span>
                    <span className="text-lg">{showAnswers ? '▲' : '▼'}</span>
                  </button>
                  
                  {showAnswers && (
                    <div className="space-y-3 mt-2 max-h-[50vh] overflow-y-auto pr-1">
                      {(reportData.answers ?? []).map((ans, i) => (
                        <div
                          key={ans.question_id || i}
                          className={`rounded-lg border p-3 ${
                            ans.is_correct
                              ? 'border-emerald-500/30 bg-emerald-900/10'
                              : ans.is_correct === null || ['email_writing','essay_writing'].includes(ans.question_type)
                              ? 'border-amber-500/30 bg-amber-900/10'
                              : !ans.ai_feedback && ['gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured'].includes(ans.question_type)
                              ? 'border-yellow-500/30 bg-yellow-900/10'
                              : 'border-red-500/30 bg-red-900/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-gray-300 capitalize">
                                {ans.question_type.replace(/_/g, ' ')}
                              </span>
                              {!ans.ai_feedback && ans.is_correct !== true && ['email_writing','essay_writing','gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured'].includes(ans.question_type) && (
                                <span className="text-xs px-2 py-0.5 rounded bg-amber-800/50 text-amber-300">⏳ Needs AI</span>
                              )}
                              {ans.ai_feedback && (
                                <span className="text-xs px-2 py-0.5 rounded bg-purple-800/50 text-purple-300">🤖 AI Graded</span>
                              )}
                            </div>
                            <span className={`text-xs font-bold ${
                              ans.is_correct ? 'text-emerald-400' 
                              : ans.is_correct === null ? 'text-amber-400'
                              : 'text-red-400'
                            }`}>
                              {ans.marks_awarded}/{ans.marks_possible}
                            </span>
                          </div>
                          <p className="text-sm text-white mb-2">{ans.stem}</p>
                          
                          {/* Student Response */}
                          <div className="text-xs">
                            <span className="text-gray-400">Student answered: </span>
                            <span className={ans.is_correct ? 'text-emerald-300' : ans.is_correct === null ? 'text-amber-300' : 'text-red-300'}>
                              {typeof ans.response === 'object'
                                ? (ans.response?.text || ans.response?.index) ?? JSON.stringify(ans.response)
                                : ans.response || '(no answer)'}
                            </span>
                          </div>
                          
                          {/* Correct Answer (for non-writing) */}
                          {!['email_writing', 'essay_writing'].includes(ans.question_type) && !ans.is_correct && (
                            <div className="text-xs mt-1">
                              <span className="text-gray-400">Correct: </span>
                              <span className="text-emerald-300">
                                {typeof ans.correct_answer === 'object'
                                  ? JSON.stringify(ans.correct_answer)
                                  : ans.correct_answer}
                              </span>
                            </div>
                          )}
                          
                          {/* AI Feedback for writing */}
                          {ans.ai_feedback && (
                            <div className="mt-2 p-2 rounded bg-purple-900/20 border border-purple-500/20">
                              <span className="text-xs text-purple-300 font-semibold">🤖 AI Feedback:</span>
                              <p className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{ans.ai_feedback}</p>
                            </div>
                          )}
                          
                          {/* Explanation */}
                          {ans.explanation && (
                            <div className="text-xs text-gray-500 mt-2 italic">
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
            ) : (
              <div className="text-center text-gray-400 py-8">No report data</div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setCandidateFileId(null)}>
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-900 border border-gray-700 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">📁</span>
                <div>
                  <h2 className="text-xl font-bold text-white">{cand.full_name}</h2>
                  <p className="text-xs text-gray-400">
                    Candidate File · Registered {new Date(cand.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setCandidateFileId(null)} className="ml-auto text-gray-400 hover:text-white text-xl">✕</button>
              </div>

              {/* Personal Info */}
              <div className="rounded-lg border border-gray-700/50 bg-slate-800/50 p-4 mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Personal Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Email</span>
                    <p className="text-white">{cand.email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Phone</span>
                    <p className="text-white">{cand.parent_phone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Applied Grade</span>
                    <p className="text-white">{cand.applied_grade || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Status</span>
                    <p>{statusPill(cand.status)}</p>
                  </div>
                  {cand.notes && (
                    <div className="col-span-2">
                      <span className="text-gray-500 text-xs">Notes</span>
                      <p className="text-white text-xs">{cand.notes}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500 text-xs">Token</span>
                    <p className="text-white font-mono text-xs">{cand.token}</p>
                  </div>
                </div>
              </div>

              {/* Test Results */}
              <div className="rounded-lg border border-gray-700/50 bg-slate-800/50 p-4 mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Test Results ({candAttempts.length})
                </h3>
                {candAttempts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No tests taken yet.</p>
                ) : (
                  <div className="space-y-3">
                    {candAttempts.map(a => {
                      const form = forms.find(f => f.id === a.form_id);
                      const bp = form ? blueprints.find(b => b.id === form.blueprint_id) : null;
                      const subjectLabel = bp?.subject ? bp.subject.charAt(0).toUpperCase() + bp.subject.slice(1) : 'Unknown';
                      const pct = a.max_score ? Math.round((a.total_score / a.max_score) * 100) : 0;
                      return (
                        <div key={a.id} className="rounded-lg border border-gray-600/30 bg-slate-700/30 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{subjectLabel}</span>
                              {form && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-600 text-gray-400 font-mono">{form.form_code}</span>}
                              {statusPill(a.status)}
                            </div>
                            <span className="text-[11px] text-gray-500">{new Date(a.started_at).toLocaleDateString()}</span>
                          </div>
                          {a.status === 'scored' && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-400">Score: {a.total_score}/{a.max_score}</span>
                                <span className={`font-bold ${pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-blue-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{pct}%</span>
                              </div>
                              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity Timeline */}
              <div className="rounded-lg border border-gray-700/50 bg-slate-800/50 p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Activity Timeline ({candAuditEntries.length})
                </h3>
                {candAuditEntries.length === 0 ? (
                  <p className="text-gray-500 text-sm">No activity recorded.</p>
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
                          <span className="text-gray-500 w-28 shrink-0">{new Date(entry.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>{info.icon}</span>
                          <span className="text-gray-300">{info.label}</span>
                          {details.form_code && <span className="text-gray-500 font-mono">({details.form_code})</span>}
                          {details.band && <span className="text-gray-500">Band {details.band}</span>}
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
        );
      })()}
    </div>
  );
};

export default AdmissionHub;
