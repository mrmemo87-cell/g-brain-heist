// Which students an assignment column applies to in the collective report.
// A student who was never set an assignment must not be reported as
// "Not submitted" for it, nor counted against completion.
/**
 * True when the assignment was set for this student. A recorded score always
 * counts. Without a recipient list the assignment is treated as set for the
 * whole class shown, which is how class assignments behaved before recipient
 * lists existed.
 */
export const isAssignedTo = (assignment, studentId, hasScore) => {
    if (hasScore)
        return true;
    const recipients = assignment.student_ids;
    if (!Array.isArray(recipients) || recipients.length === 0)
        return true;
    return recipients.includes(studentId);
};
