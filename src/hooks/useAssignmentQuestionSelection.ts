import { useCallback, useState, type SetStateAction } from 'react';

// Hydrating a prepared form and choosing a different subject are different
// actions. Never clear imported questions in a subject-change effect: that
// effect runs after React has already installed the complete prepared form.
export function useAssignmentQuestionSelection() {
  const [selection, setSelection] = useState({ subject: '', questionIds: [] as string[] });

  const setAssignmentSubject = useCallback((subject: string) => {
    setSelection((current) => current.subject === subject ? current : { ...current, subject });
  }, []);

  const setAssignmentQuestionIds = useCallback((action: SetStateAction<string[]>) => {
    setSelection((current) => ({
      ...current,
      questionIds: typeof action === 'function' ? action(current.questionIds) : action,
    }));
  }, []);

  const chooseAssignmentSubject = useCallback((subject: string) => {
    setSelection((current) => current.subject === subject
      ? current
      : { subject, questionIds: [] });
  }, []);

  return {
    assignmentSubject: selection.subject,
    assignmentQuestionIds: selection.questionIds,
    setAssignmentSubject,
    setAssignmentQuestionIds,
    chooseAssignmentSubject,
  };
}
