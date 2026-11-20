// Pure helpers behind the teacher dashboard. They turn the assignment summary
// returned by rpc_teacher_assignment_success_summary into the specific,
// per-student and per-assignment statements the dashboard shows, so the
// wording can be unit-tested without rendering the portal.
export const LOW_ACCURACY_THRESHOLD = 65;
/** A student is flagged for missing work only when it is a pattern, not a one-off. */
export const MISSING_WORK_MIN_COUNT = 2;
export const MISSING_WORK_MIN_SHARE = 0.4;
const plural = (count, one, many) => (count === 1 ? one : many);
export const assignmentProgressStatus = (assignment, now = new Date()) => {
    const assigned = assignment.student_count || 0;
    const completed = assignment.completed_count || 0;
    if (assigned > 0 && completed >= assigned)
        return 'complete';
    if (assignment.due_at) {
        const due = new Date(assignment.due_at);
        if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime())
            return 'overdue';
    }
    return 'open';
};
export const assignmentAccuracy = (result) => {
    if (!result || result.answered_question_count <= 0)
        return null;
    return Math.round((result.correct_answer_count * 100) / result.answered_question_count);
};
/** Accuracy across several assignments, weighted by answers rather than averaged per assignment. */
export const combinedAccuracy = (results) => {
    let answered = 0;
    let correct = 0;
    results.forEach((result) => {
        if (!result)
            return;
        answered += result.answered_question_count || 0;
        correct += result.correct_answer_count || 0;
    });
    return answered > 0 ? Math.round((correct * 100) / answered) : null;
};
/**
 * A student is at risk because of their own record: a pattern of missing work
 * or low accuracy across what they did submit. Class-level completion never
 * flags an individual, so a student who is up to date is not listed just for
 * being in a class that is behind.
 */
export const studentRisk = (row) => {
    const assigned = Math.max(row.assigned_count || 0, 0);
    const missing = Math.max(row.missing_count || 0, 0);
    const missingShare = assigned > 0 ? missing / assigned : 0;
    const hasMissingPattern = missing >= MISSING_WORK_MIN_COUNT && missingShare >= MISSING_WORK_MIN_SHARE;
    const hasLowAccuracy = row.accuracy !== null
        && row.accuracy !== undefined
        && row.answered_question_count > 0
        && row.accuracy < LOW_ACCURACY_THRESHOLD;
    if (!hasMissingPattern && !hasLowAccuracy)
        return null;
    const missingText = `Missing ${missing} of ${assigned} ${plural(assigned, 'assignment', 'assignments')}`;
    const accuracyText = row.accuracy === null || row.accuracy === undefined
        ? null
        : `${row.accuracy}% accuracy on submitted work`;
    const reason = hasMissingPattern ? missingText : accuracyText;
    const detail = hasMissingPattern
        ? (hasLowAccuracy ? accuracyText : null)
        : (missing > 0 ? missingText : null);
    const score = (hasMissingPattern ? 50 + Math.round(missingShare * 50) : 0)
        + (hasLowAccuracy ? LOW_ACCURACY_THRESHOLD - row.accuracy : 0);
    return { studentId: row.student_id, name: row.student_name, reason, detail, score };
};
export const rankStudentRisks = (rows, limit = 6) => rows
    .map(studentRisk)
    .filter((risk) => risk !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
/** One line per assignment instead of one line per missing student. */
export const assignmentAlerts = (rows, now = new Date(), limit = 6) => rows
    .filter((row) => row.missing_count > 0 || row.low_accuracy_count > 0)
    .slice(0, limit)
    .map((row) => {
    const parts = [];
    if (row.missing_count > 0) {
        parts.push(row.student_count === 1
            ? 'not started yet'
            : `${row.missing_count} of ${row.student_count} ${row.missing_count === 1 ? "student has" : "students have"} not submitted`);
    }
    if (row.low_accuracy_count > 0) {
        parts.push(`${row.low_accuracy_count} scored below ${LOW_ACCURACY_THRESHOLD}%`);
    }
    const overdue = assignmentProgressStatus({ id: row.assignment_id, ...row }, now) === 'overdue';
    return {
        tone: row.missing_count > 0 ? 'warning' : 'info',
        text: `“${row.assignment_title}”: ${parts.join('; ')}${overdue && row.missing_count > 0 ? ' — past due' : ''}.`,
    };
});
export const describeTopMissingAssignment = (rows) => {
    const top = rows
        .filter((row) => row.student_count > 1 && row.missing_count > 0)
        .sort((a, b) => b.missing_count - a.missing_count)[0];
    if (!top)
        return null;
    return `Chase “${top.assignment_title}” — ${top.missing_count} of ${top.student_count} ${top.missing_count === 1 ? "student has" : "students have"} not submitted.`;
};
export const describeWeakestAssignment = (assignments, results, minimumSubmissions = 3) => {
    const weakest = assignments
        .map((assignment) => ({ assignment, result: results.get(assignment.id) }))
        .filter(({ result }) => !!result && result.submission_count >= minimumSubmissions)
        .map(({ assignment, result }) => ({ assignment, accuracy: assignmentAccuracy(result) }))
        .filter((row) => row.accuracy !== null)
        .sort((a, b) => a.accuracy - b.accuracy)[0];
    if (!weakest || weakest.accuracy >= LOW_ACCURACY_THRESHOLD)
        return null;
    return `Reteach “${weakest.assignment.title || 'Untitled assignment'}” — class accuracy was ${weakest.accuracy}%.`;
};
