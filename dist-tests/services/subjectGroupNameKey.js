/**
 * Mirrors private.subject_group_name_key in the database: "Grade 7 ESL", "7 ESL", "G7 ESL"
 * and "ESL grade 7" all normalise to "7 esl", so a near-duplicate teaching group is caught in
 * the browser before the request is sent and the administrator gets a useful question
 * ("use the existing group?") instead of an error.
 */
export const groupNameKey = (name) => name
    .toLowerCase()
    .replace(/\b(grade|gr|g|year|yr|y)\s*(\d+)\b/g, ' $2 ')
    .replace(/\b(grade|group|gr|g|year|yr|class|set|team)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
