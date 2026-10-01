import * as GameService from './gameService';
import { supabase } from './supabaseClient';
import {
  fetchEconomicsPaperReadiness,
  type EconomicsPaperReadiness,
} from './economicsPaperReadinessService';
import {
  buildReteachRecommendations,
  curriculumDimension,
  type CurriculumHotspotEvidence,
  type CurriculumReteachRecommendation,
} from './teacherCurriculumActionService';
import {
  fetchTeacherTeachingGroups,
  type SchoolSubjectGroup,
} from './schoolSubjectGroupService';
import {
  resolveCurriculumSubjectExperience,
  type CurriculumSubjectExperience,
} from './curriculumSubjectExperienceService';

export interface CurriculumTeachingGroup extends SchoolSubjectGroup {
  subjectLabel: string;
  gradeNumber: number;
}

export interface CurriculumSubskillEvidence {
  subskillCode: string;
  studentsWithEvidence: number;
  assessedStudents: number;
  lowDataStudents: number;
  staleStudents: number;
  contradictoryStudents: number;
  teacherReviewStudents: number;
  averageConfidence: number | null;
}

interface CurriculumGroupEvidenceRpc {
  success: true;
  studentCount: number;
  evidence?: CurriculumSubskillEvidence[];
  hotspots?: CurriculumHotspotEvidence[];
}

export interface TeacherCurriculumIntelligence {
  group: CurriculumTeachingGroup;
  registry: GameService.TeacherAcademicSkillRegistryResult;
  experience: CurriculumSubjectExperience;
  evidenceBySubskill: Record<string, CurriculumSubskillEvidence>;
  hotspots: CurriculumHotspotEvidence[];
  reteachNext: CurriculumReteachRecommendation[];
  paperReadiness: EconomicsPaperReadiness | null;
  dimensions: {
    content: { hotspotCount: number; impactedStudents: number; persistentStudents: number; recurringStudents: number; improvingStudents: number; resolvedStudents: number };
    reasoning: { hotspotCount: number; impactedStudents: number; persistentStudents: number; recurringStudents: number; improvingStudents: number; resolvedStudents: number };
  };
  summary: {
    studentCount: number;
    curriculumSubskills: number;
    studentSubskillPairs: number;
    observedPairs: number;
    assessedPairs: number;
    lowDataPairs: number;
    stalePairs: number;
    contradictoryPairs: number;
    teacherReviewPairs: number;
    observedPairPercent: number | null;
    assessedPairPercent: number | null;
    averageConfidence: number | null;
    profilesUnavailable: number;
  };
}

const gradeNumber = (value?: string | null): number | null => {
  const match = String(value || '').match(/\d{1,2}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
};

const groupSubject = (group: SchoolSubjectGroup): string => (
  group.academicSubjectName || group.schoolSubjectName || group.academicSubjectCode || ''
).trim();

export const getTeacherCurriculumGroups = async (schoolId: string): Promise<CurriculumTeachingGroup[]> => {
  const groups = await fetchTeacherTeachingGroups(schoolId);
  return groups
    .map((group) => {
      const grade = gradeNumber(group.gradeLevel);
      if (!grade) return null;
      return {
        ...group,
        subjectLabel: groupSubject(group),
        gradeNumber: grade,
      };
    })
    .filter((group): group is CurriculumTeachingGroup => Boolean(group?.subjectLabel))
    .sort((a, b) => (
      a.subjectLabel.localeCompare(b.subjectLabel)
      || a.gradeNumber - b.gradeNumber
      || a.name.localeCompare(b.name)
    ));
};

const percent = (part: number, whole: number): number | null => (
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
);

const fetchGroupEvidence = async (
  schoolId: string,
  groupId: string,
): Promise<CurriculumGroupEvidenceRpc> => {
  const { data, error } = await supabase.rpc('rpc_teacher_curriculum_group_evidence', {
    p_school_id: schoolId,
    p_group_id: groupId,
  });
  if (error) throw error;
  return (data || { success: true, studentCount: 0, evidence: [] }) as CurriculumGroupEvidenceRpc;
};

export const getTeacherCurriculumIntelligence = async (
  schoolId: string,
  group: CurriculumTeachingGroup,
): Promise<TeacherCurriculumIntelligence> => {
  const paperReadinessPromise = /economics/i.test(group.subjectLabel)
    ? fetchEconomicsPaperReadiness(schoolId, group.id).catch((error) => {
      console.warn('Economics paper readiness unavailable', error);
      return null;
    })
    : Promise.resolve(null);

  const [registry, groupEvidence, paperReadiness] = await Promise.all([
    GameService.get_teacher_academic_skill_registry(group.subjectLabel, group.gradeNumber),
    fetchGroupEvidence(schoolId, group.id),
    paperReadinessPromise,
  ]);

  const experience = resolveCurriculumSubjectExperience(group.subjectLabel, registry.registryVersion);

  if (!registry.supported) {
    return {
      group,
      registry,
      experience,
      evidenceBySubskill: {},
      hotspots: [],
      reteachNext: [],
      paperReadiness,
      dimensions: {
        content: { hotspotCount: 0, impactedStudents: 0, persistentStudents: 0, recurringStudents: 0, improvingStudents: 0, resolvedStudents: 0 },
        reasoning: { hotspotCount: 0, impactedStudents: 0, persistentStudents: 0, recurringStudents: 0, improvingStudents: 0, resolvedStudents: 0 },
      },
      summary: {
        studentCount: groupEvidence.studentCount || 0,
        curriculumSubskills: 0,
        studentSubskillPairs: 0,
        observedPairs: 0,
        assessedPairs: 0,
        lowDataPairs: 0,
        stalePairs: 0,
        contradictoryPairs: 0,
        teacherReviewPairs: 0,
        observedPairPercent: null,
        assessedPairPercent: null,
        averageConfidence: null,
        profilesUnavailable: 0,
      },
    };
  }

  const allowedSubskills = new Set(registry.skills.map((leaf) => leaf.subskillCode));
  const evidenceBySubskill = new Map<string, CurriculumSubskillEvidence>();

  registry.skills.forEach((leaf) => {
    evidenceBySubskill.set(leaf.subskillCode, {
      subskillCode: leaf.subskillCode,
      studentsWithEvidence: 0,
      assessedStudents: 0,
      lowDataStudents: 0,
      staleStudents: 0,
      contradictoryStudents: 0,
      teacherReviewStudents: 0,
      averageConfidence: null,
    });
  });

  (groupEvidence.evidence || []).forEach((aggregate) => {
    if (!allowedSubskills.has(aggregate.subskillCode)) return;
    evidenceBySubskill.set(aggregate.subskillCode, {
      ...aggregate,
      averageConfidence:
        typeof aggregate.averageConfidence === 'number'
          ? aggregate.averageConfidence
          : aggregate.averageConfidence == null
            ? null
            : Number(aggregate.averageConfidence),
    });
  });

  const evidence = [...evidenceBySubskill.values()];
  const hotspots = (groupEvidence.hotspots || []).filter((hotspot) => allowedSubskills.has(hotspot.subskillCode));
  const reteachNext = buildReteachRecommendations(registry.skills, hotspots, experience.key);
  const leavesByCode = new Map(registry.skills.map((leaf) => [leaf.subskillCode, leaf]));
  const dimensionSummary = {
    content: { hotspotCount: 0, impactedStudents: new Set<string>(), persistentStudents: 0, recurringStudents: 0, improvingStudents: 0, resolvedStudents: 0 },
    reasoning: { hotspotCount: 0, impactedStudents: new Set<string>(), persistentStudents: 0, recurringStudents: 0, improvingStudents: 0, resolvedStudents: 0 },
  };
  hotspots.forEach((hotspot) => {
    const leaf = leavesByCode.get(hotspot.subskillCode);
    if (!leaf) return;
    const dimension = curriculumDimension(leaf, experience.key);
    if (hotspot.impactedStudents > 0) dimensionSummary[dimension].hotspotCount += 1;
    hotspot.students
      .filter((student) => student.status !== 'resolved')
      .forEach((student) => dimensionSummary[dimension].impactedStudents.add(student.studentId));
    dimensionSummary[dimension].persistentStudents += hotspot.persistentStudents;
    dimensionSummary[dimension].recurringStudents += hotspot.recurringStudents;
    dimensionSummary[dimension].improvingStudents += hotspot.improvingStudents;
    dimensionSummary[dimension].resolvedStudents += hotspot.resolvedStudents;
  });
  const dimensions = {
    content: {
      ...dimensionSummary.content,
      impactedStudents: dimensionSummary.content.impactedStudents.size,
    },
    reasoning: {
      ...dimensionSummary.reasoning,
      impactedStudents: dimensionSummary.reasoning.impactedStudents.size,
    },
  };
  const studentCount = groupEvidence.studentCount || 0;
  const studentSubskillPairs = studentCount * registry.skills.length;
  const observedPairs = evidence.reduce((sum, item) => sum + item.studentsWithEvidence, 0);
  const assessedPairs = evidence.reduce((sum, item) => sum + item.assessedStudents, 0);
  const lowDataPairs = evidence.reduce((sum, item) => sum + item.lowDataStudents, 0);
  const stalePairs = evidence.reduce((sum, item) => sum + item.staleStudents, 0);
  const contradictoryPairs = evidence.reduce((sum, item) => sum + item.contradictoryStudents, 0);
  const teacherReviewPairs = evidence.reduce((sum, item) => sum + item.teacherReviewStudents, 0);
  const confidenceValues = evidence
    .map((item) => item.averageConfidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    group,
    registry,
    experience,
    evidenceBySubskill: Object.fromEntries(evidenceBySubskill.entries()),
    hotspots,
    reteachNext,
    paperReadiness,
    dimensions,
    summary: {
      studentCount,
      curriculumSubskills: registry.skills.length,
      studentSubskillPairs,
      observedPairs,
      assessedPairs,
      lowDataPairs,
      stalePairs,
      contradictoryPairs,
      teacherReviewPairs,
      observedPairPercent: percent(observedPairs, studentSubskillPairs),
      assessedPairPercent: percent(assessedPairs, studentSubskillPairs),
      averageConfidence: confidenceValues.length
        ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 10) / 10
        : null,
      profilesUnavailable: 0,
    },
  };
};
