import { supabase } from './supabaseClient';

export type PaperReadinessState = 'not_assessed' | 'low_data' | 'evidence_established';

export interface PaperReadinessEvidenceRow {
  paperComponent: 'paper_1' | 'paper_2';
  paperSection?: 'section_a' | 'section_b' | null;
  evidenceMode: 'mcq' | 'data_response' | 'structured_response';
  primaryAssessmentObjective: 'AO1' | 'AO2' | 'AO3';
  assessmentObjectives: string[];
  gradedResponses: number;
  correctResponses: number;
  studentsWithEvidence: number;
  distinctQuestions: number;
  distinctAssignments: number;
  observedAccuracy: number | null;
  firstEvidenceAt?: string | null;
  lastEvidenceAt?: string | null;
}

interface PaperReadinessRpc {
  success: true;
  programme: {
    providerName: string;
    programmeCode: string;
    sourceVersion: string;
  };
  studentCount: number;
  profiledQuestionCount: number;
  evidence?: PaperReadinessEvidenceRow[];
  reportingPolicy: {
    policyId: string;
    minimumDistinctQuestions: number;
    minimumDistinctAssignments: number;
    minimumStudents: number;
    minimumRosterShare: number;
    accuracyIsObservedEvidenceNotExamPrediction: boolean;
    noGradePrediction: boolean;
  };
}

export interface PaperEvidenceSummary {
  key: 'paper_1' | 'paper_2_section_a' | 'paper_2_section_b';
  title: string;
  subtitle: string;
  state: PaperReadinessState;
  studentsWithEvidence: number;
  distinctQuestions: number;
  distinctAssignments: number;
  gradedResponses: number;
  correctResponses: number;
  observedAccuracy: number | null;
  assessmentObjectives: string[];
  firstEvidenceAt: string | null;
  lastEvidenceAt: string | null;
}

export interface AssessmentObjectiveEvidenceSummary {
  code: 'AO1' | 'AO2' | 'AO3';
  name: string;
  officialQualificationWeight: number;
  paper1Weight: number;
  paper2Weight: number;
  gradedResponses: number;
  distinctQuestions: number;
  studentsWithEvidence: number;
  observedAccuracy: number | null;
}

export interface EconomicsPaperReadiness {
  supported: true;
  programme: PaperReadinessRpc['programme'];
  studentCount: number;
  profiledQuestionCount: number;
  paper1: PaperEvidenceSummary;
  paper2SectionA: PaperEvidenceSummary;
  paper2SectionB: PaperEvidenceSummary;
  assessmentObjectives: AssessmentObjectiveEvidenceSummary[];
  evidenceGaps: string[];
  reportingPolicy: PaperReadinessRpc['reportingPolicy'];
}

const officialAo = {
  AO1: { name: 'Knowledge and understanding', qualification: 43, paper1: 50, paper2: 40 },
  AO2: { name: 'Analysis', qualification: 47, paper1: 50, paper2: 45 },
  AO3: { name: 'Evaluation', qualification: 10, paper1: 0, paper2: 15 },
} as const;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizedRows = (rows: PaperReadinessEvidenceRow[] = []): PaperReadinessEvidenceRow[] => (
  rows.map((row) => ({
    ...row,
    gradedResponses: toNumber(row.gradedResponses),
    correctResponses: toNumber(row.correctResponses),
    studentsWithEvidence: toNumber(row.studentsWithEvidence),
    distinctQuestions: toNumber(row.distinctQuestions),
    distinctAssignments: toNumber(row.distinctAssignments),
    observedAccuracy: row.observedAccuracy == null ? null : toNumber(row.observedAccuracy),
  }))
);

const summarizeRows = (
  key: PaperEvidenceSummary['key'],
  title: string,
  subtitle: string,
  rows: PaperReadinessEvidenceRow[],
  studentCount: number,
  policy: PaperReadinessRpc['reportingPolicy'],
): PaperEvidenceSummary => {
  const gradedResponses = rows.reduce((sum, row) => sum + row.gradedResponses, 0);
  const correctResponses = rows.reduce((sum, row) => sum + row.correctResponses, 0);
  const distinctQuestions = rows.reduce((sum, row) => sum + row.distinctQuestions, 0);
  const distinctAssignments = rows.reduce((max, row) => Math.max(max, row.distinctAssignments), 0);
  const studentsWithEvidence = rows.reduce((max, row) => Math.max(max, row.studentsWithEvidence), 0);
  const minimumStudents = Math.max(
    policy.minimumStudents,
    Math.ceil(studentCount * policy.minimumRosterShare),
  );
  const state: PaperReadinessState = gradedResponses === 0
    ? 'not_assessed'
    : (
      distinctQuestions >= policy.minimumDistinctQuestions
      && distinctAssignments >= policy.minimumDistinctAssignments
      && studentsWithEvidence >= minimumStudents
        ? 'evidence_established'
        : 'low_data'
    );
  const times = rows.flatMap((row) => [row.firstEvidenceAt, row.lastEvidenceAt]).filter(Boolean) as string[];
  const timestamps = times.map((value) => new Date(value).getTime()).filter(Number.isFinite);
  return {
    key,
    title,
    subtitle,
    state,
    studentsWithEvidence,
    distinctQuestions,
    distinctAssignments,
    gradedResponses,
    correctResponses,
    observedAccuracy: gradedResponses > 0 ? Math.round((correctResponses / gradedResponses) * 1000) / 10 : null,
    assessmentObjectives: [...new Set(rows.map((row) => row.primaryAssessmentObjective))].sort(),
    firstEvidenceAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    lastEvidenceAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
  };
};

const summarizeAo = (
  code: AssessmentObjectiveEvidenceSummary['code'],
  rows: PaperReadinessEvidenceRow[],
): AssessmentObjectiveEvidenceSummary => {
  const matching = rows.filter((row) => row.primaryAssessmentObjective === code);
  const gradedResponses = matching.reduce((sum, row) => sum + row.gradedResponses, 0);
  const correctResponses = matching.reduce((sum, row) => sum + row.correctResponses, 0);
  const official = officialAo[code];
  return {
    code,
    name: official.name,
    officialQualificationWeight: official.qualification,
    paper1Weight: official.paper1,
    paper2Weight: official.paper2,
    gradedResponses,
    distinctQuestions: matching.reduce((sum, row) => sum + row.distinctQuestions, 0),
    studentsWithEvidence: matching.reduce((max, row) => Math.max(max, row.studentsWithEvidence), 0),
    observedAccuracy: gradedResponses > 0 ? Math.round((correctResponses / gradedResponses) * 1000) / 10 : null,
  };
};

export const fetchEconomicsPaperReadiness = async (
  schoolId: string,
  groupId: string,
): Promise<EconomicsPaperReadiness> => {
  const { data, error } = await supabase.rpc('rpc_teacher_curriculum_paper_readiness', {
    p_school_id: schoolId,
    p_group_id: groupId,
  });
  if (error) throw error;
  const result = data as PaperReadinessRpc;
  const rows = normalizedRows(result.evidence || []);

  const paper1Rows = rows.filter((row) => row.paperComponent === 'paper_1');
  const sectionARows = rows.filter((row) => row.paperComponent === 'paper_2' && row.paperSection === 'section_a');
  const sectionBRows = rows.filter((row) => row.paperComponent === 'paper_2' && row.paperSection === 'section_b');

  const paper1 = summarizeRows(
    'paper_1',
    'Paper 1 · Multiple Choice',
    '40 questions · 40 marks · 1 hour · 30% of qualification',
    paper1Rows,
    result.studentCount,
    result.reportingPolicy,
  );
  const paper2SectionA = summarizeRows(
    'paper_2_section_a',
    'Paper 2 · Section A',
    'Compulsory data response · unseen real economic situation · 20 marks',
    sectionARows,
    result.studentCount,
    result.reportingPolicy,
  );
  const paper2SectionB = summarizeRows(
    'paper_2_section_b',
    'Paper 2 · Section B',
    'Structured response · answer 3 of 4 questions · 20 marks each',
    sectionBRows,
    result.studentCount,
    result.reportingPolicy,
  );

  const assessmentObjectives = (['AO1','AO2','AO3'] as const).map((code) => summarizeAo(code, rows));
  const evidenceGaps: string[] = [];
  if (result.profiledQuestionCount === 0) {
    evidenceGaps.push('No Brains Heist Verified Economics questions are profiled for Cambridge 0455 paper/AO evidence yet.');
  }
  if (paper1.gradedResponses === 0) evidenceGaps.push('No governed Paper 1 multiple-choice evidence has been collected for this class.');
  if (paper2SectionA.gradedResponses === 0) evidenceGaps.push('No governed Paper 2 Section A data-response evidence has been collected for this class.');
  if (paper2SectionB.gradedResponses === 0) evidenceGaps.push('No governed Paper 2 Section B structured-response evidence has been collected for this class.');
  assessmentObjectives.forEach((ao) => {
    if (ao.gradedResponses === 0) evidenceGaps.push(`No governed ${ao.code} ${ao.name.toLowerCase()} evidence is available yet.`);
  });

  return {
    supported: true,
    programme: result.programme,
    studentCount: result.studentCount,
    profiledQuestionCount: result.profiledQuestionCount,
    paper1,
    paper2SectionA,
    paper2SectionB,
    assessmentObjectives,
    evidenceGaps,
    reportingPolicy: result.reportingPolicy,
  };
};
