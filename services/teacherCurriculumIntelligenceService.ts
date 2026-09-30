import * as GameService from './gameService';
import {
  fetchTeacherTeachingGroupRoster,
  fetchTeacherTeachingGroups,
  type SchoolSubjectGroup,
  type SubjectGroupRosterStudent,
} from './schoolSubjectGroupService';
import {
  fetchStudentAcademicConfidence,
  type StudentAcademicConfidence,
} from './studentAcademicProfileService';

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

export interface TeacherCurriculumIntelligence {
  group: CurriculumTeachingGroup;
  registry: GameService.TeacherAcademicSkillRegistryResult;
  roster: SubjectGroupRosterStudent[];
  evidenceBySubskill: Record<string, CurriculumSubskillEvidence>;
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

const canonicalSubskillFromSkillKey = (skillKey?: string | null): string | null => {
  const parts = String(skillKey || '').split(':').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
};

const loadConfidencePool = async (
  roster: SubjectGroupRosterStudent[],
  academicYearId: string,
  concurrency = 6,
): Promise<Array<{ studentId: string; confidence: StudentAcademicConfidence | null }>> => {
  const results: Array<{ studentId: string; confidence: StudentAcademicConfidence | null }> = new Array(roster.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < roster.length) {
      const index = cursor++;
      const student = roster[index];
      try {
        const confidence = await fetchStudentAcademicConfidence(student.student_id, academicYearId);
        results[index] = { studentId: student.student_id, confidence };
      } catch (error) {
        console.warn('Curriculum intelligence confidence unavailable for student', student.student_id, error);
        results[index] = { studentId: student.student_id, confidence: null };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, roster.length)) }, () => worker()),
  );
  return results;
};

const percent = (part: number, whole: number): number | null => (
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
);

export const getTeacherCurriculumIntelligence = async (
  schoolId: string,
  group: CurriculumTeachingGroup,
): Promise<TeacherCurriculumIntelligence> => {
  const [registry, roster] = await Promise.all([
    GameService.get_teacher_academic_skill_registry(group.subjectLabel, group.gradeNumber),
    fetchTeacherTeachingGroupRoster(schoolId, group.id),
  ]);

  if (!registry.supported) {
    return {
      group,
      registry,
      roster,
      evidenceBySubskill: {},
      summary: {
        studentCount: roster.length,
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

  const confidenceRows = await loadConfidencePool(roster, group.academicYearId);
  const confidenceTotals = new Map<string, { total: number; count: number }>();
  let profilesUnavailable = 0;

  confidenceRows.forEach(({ confidence }) => {
    if (!confidence) {
      profilesUnavailable += 1;
      return;
    }

    confidence.confidenceStates.forEach((state) => {
      const subskillCode = canonicalSubskillFromSkillKey(state.skillKey);
      if (!subskillCode || !allowedSubskills.has(subskillCode)) return;

      const aggregate = evidenceBySubskill.get(subskillCode);
      if (!aggregate) return;

      aggregate.studentsWithEvidence += 1;
      if (state.assessmentState === 'assessed') aggregate.assessedStudents += 1;
      if (state.assessmentState === 'low_data') aggregate.lowDataStudents += 1;
      if (state.assessmentState === 'stale') aggregate.staleStudents += 1;
      if (state.assessmentState === 'contradictory') aggregate.contradictoryStudents += 1;
      if (state.teacherReviewRequired) aggregate.teacherReviewStudents += 1;

      if (typeof state.confidenceScore === 'number' && Number.isFinite(state.confidenceScore)) {
        const total = confidenceTotals.get(subskillCode) || { total: 0, count: 0 };
        total.total += state.confidenceScore;
        total.count += 1;
        confidenceTotals.set(subskillCode, total);
      }
    });
  });

  confidenceTotals.forEach((value, code) => {
    const aggregate = evidenceBySubskill.get(code);
    if (aggregate && value.count > 0) {
      aggregate.averageConfidence = Math.round((value.total / value.count) * 10) / 10;
    }
  });

  const evidence = [...evidenceBySubskill.values()];
  const studentSubskillPairs = roster.length * registry.skills.length;
  const observedPairs = evidence.reduce((sum, item) => sum + item.studentsWithEvidence, 0);
  const assessedPairs = evidence.reduce((sum, item) => sum + item.assessedStudents, 0);
  const lowDataPairs = evidence.reduce((sum, item) => sum + item.lowDataStudents, 0);
  const stalePairs = evidence.reduce((sum, item) => sum + item.staleStudents, 0);
  const contradictoryPairs = evidence.reduce((sum, item) => sum + item.contradictoryStudents, 0);
  const teacherReviewPairs = evidence.reduce((sum, item) => sum + item.teacherReviewStudents, 0);
  const confidenceValues = evidence
    .map((item) => item.averageConfidence)
    .filter((value): value is number => typeof value === 'number');

  return {
    group,
    registry,
    roster,
    evidenceBySubskill: Object.fromEntries(evidenceBySubskill.entries()),
    summary: {
      studentCount: roster.length,
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
      profilesUnavailable,
    },
  };
};
