export const normalizeClanTerritoryClassCode = (value) => String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
export const normalizeClanTerritoryClassCodes = (values) => Array.from(new Set((values ?? [])
    .map(normalizeClanTerritoryClassCode)
    .filter(Boolean)));
export const canEnterClanTerritoryOfficialRoom = (allowedClassCodes, studentClassCodes, legacyBatch) => {
    const normalizedAllowed = normalizeClanTerritoryClassCodes(allowedClassCodes);
    if (normalizedAllowed.length === 0)
        return true;
    const normalizedStudentClasses = normalizeClanTerritoryClassCodes([
        ...(studentClassCodes ?? []),
        legacyBatch,
    ]);
    return normalizedStudentClasses.some((classCode) => normalizedAllowed.includes(classCode));
};
