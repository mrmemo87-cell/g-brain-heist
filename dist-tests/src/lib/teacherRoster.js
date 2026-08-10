const normalizeClassCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
/**
 * Keeps one canonical row per student and prefers an RPC row whose class code
 * agrees with the student's recorded batch. This is a client-side safety net;
 * the database RPC is still responsible for returning a canonical roster.
 */
export const normalizeTeacherRoster = (rows) => {
    const unique = new Map();
    rows.forEach((row) => {
        if (!row?.id)
            return;
        const classCode = normalizeClassCode(row.class_code);
        const batch = normalizeClassCode(row.batch);
        const canonical = Boolean(classCode && classCode === batch);
        const normalizedBatch = (classCode || batch || null);
        const candidate = { ...row, batch: normalizedBatch };
        const current = unique.get(row.id);
        if (!current || (canonical && !current.canonical)) {
            unique.set(row.id, { student: candidate, canonical });
        }
    });
    return [...unique.values()].map(({ student }) => student);
};
