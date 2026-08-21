import type { AssignmentCategory } from '../../types.js';

export interface AssignmentCategoryMeta {
  label: string;
  background: string;
  border: string;
  text: string;
}

export const ASSIGNMENT_CATEGORY_META: Record<AssignmentCategory, AssignmentCategoryMeta> = {
  classwork: {
    label: 'Classwork',
    background: '#FEF9C3',
    border: '#FDE68A',
    text: '#713F12',
  },
  homework: {
    label: 'Homework',
    background: '#DBEAFE',
    border: '#BFDBFE',
    text: '#1E3A8A',
  },
  quiz: {
    label: 'Quiz',
    background: '#F3E8FF',
    border: '#E9D5FF',
    text: '#6B21A8',
  },
  term_exam: {
    label: 'Term Exam',
    background: '#FFEDD5',
    border: '#FED7AA',
    text: '#9A3412',
  },
};

export const UNCATEGORIZED_ASSIGNMENT_META: AssignmentCategoryMeta = {
  label: 'Uncategorized',
  background: '#F1F5F9',
  border: '#CBD5E1',
  text: '#475569',
};

export const getAssignmentCategoryMeta = (
  category?: AssignmentCategory | null,
): AssignmentCategoryMeta => category ? ASSIGNMENT_CATEGORY_META[category] : UNCATEGORIZED_ASSIGNMENT_META;

export const assignmentCategoryBadgeStyle = (category?: AssignmentCategory | null) => {
  const meta = getAssignmentCategoryMeta(category);
  return {
    backgroundColor: meta.background,
    borderColor: meta.border,
    color: meta.text,
  } as const;
};
