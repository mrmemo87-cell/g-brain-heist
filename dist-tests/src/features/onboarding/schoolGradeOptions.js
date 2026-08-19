const gradeCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});
export const normalizeConfiguredGrade = (value) => (value === null || value === undefined ? '' : String(value).trim());
/**
 * School onboarding treats the school's active class configuration as the
 * authority. No global curriculum range is applied here: if a school has a
 * class for Foundation, Grade 4, Year 13, or another local label, it must be
 * available to that school's students.
 */
export const getConfiguredSchoolGrades = (classes) => Array.from(new Set(classes
    .map((schoolClass) => normalizeConfiguredGrade(schoolClass.grade_level))
    .filter(Boolean))).sort((left, right) => gradeCollator.compare(left, right));
export const classMatchesConfiguredGrade = (schoolClass, grade) => normalizeConfiguredGrade(schoolClass.grade_level) === normalizeConfiguredGrade(grade);
