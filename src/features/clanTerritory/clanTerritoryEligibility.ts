export const normalizeClanTerritoryClassCode = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

export const normalizeClanTerritoryClassCodes = (
  values: readonly (string | null | undefined)[] | null | undefined,
): string[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map(normalizeClanTerritoryClassCode)
        .filter(Boolean),
    ),
  );

export const canEnterClanTerritoryOfficialRoom = (
  allowedClassCodes: readonly (string | null | undefined)[] | null | undefined,
  studentClassCodes: readonly (string | null | undefined)[] | null | undefined,
  legacyBatch?: string | null,
): boolean => {
  const normalizedAllowed = normalizeClanTerritoryClassCodes(allowedClassCodes);
  if (normalizedAllowed.length === 0) return true;

  const normalizedStudentClasses = normalizeClanTerritoryClassCodes([
    ...(studentClassCodes ?? []),
    legacyBatch,
  ]);

  return normalizedStudentClasses.some((classCode) => normalizedAllowed.includes(classCode));
};
