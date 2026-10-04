import type { TeacherQuestion } from '../../types';

export const questionAssessmentSearchText = (question: TeacherQuestion): string => [
  question.curriculum_strand, question.curriculum_skill, question.curriculum_subskill,
  question.curriculum_objective,
  ...(question.registry_mappings || []).flatMap((mapping) => [
    mapping.strand, mapping.skill, mapping.subskill, mapping.evidenceFocus, mapping.evidenceStatement,
  ]),
].filter(Boolean).join(' ');
