import { useCallback, useState } from 'react';
// Hydrating a prepared form and choosing a different subject are different
// actions. Never clear imported questions in a subject-change effect: that
// effect runs after React has already installed the complete prepared form.
export function useAssignmentQuestionSelection() {
    const [selection, setSelection] = useState({ subject: '', questionIds: [] });
    const setAssignmentSubject = useCallback((subject) => {
        setSelection((current) => current.subject === subject ? current : { ...current, subject });
    }, []);
    const setAssignmentQuestionIds = useCallback((action) => {
        setSelection((current) => ({
            ...current,
            questionIds: typeof action === 'function' ? action(current.questionIds) : action,
        }));
    }, []);
    const chooseAssignmentSubject = useCallback((subject) => {
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
