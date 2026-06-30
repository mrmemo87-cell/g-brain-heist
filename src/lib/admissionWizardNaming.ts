export const ADMISSION_WIZARD_BLUEPRINT_PREFIX = 'Admission Test Wizard —';

export const ADMISSION_WIZARD_SUBJECT_LABELS: Record<string, string> = {
  english: 'English',
  math: 'Maths',
  maths: 'Maths',
  mathematics: 'Maths',
  science: 'Science',
  chemistry: 'Chemistry',
};

export const getAdmissionWizardSubjectLabel = (subject: string): string => {
  return ADMISSION_WIZARD_SUBJECT_LABELS[subject] || subject;
};

export const buildAdmissionWizardDefaultName = (grade: number, subject: string): string => {
  return `Grade ${grade} ${getAdmissionWizardSubjectLabel(subject)} Admission Test`;
};

export const buildAdmissionWizardBlueprintName = (testName: string): string => {
  const trimmed = testName.trim();
  return trimmed.startsWith(ADMISSION_WIZARD_BLUEPRINT_PREFIX)
    ? trimmed
    : `${ADMISSION_WIZARD_BLUEPRINT_PREFIX} ${trimmed}`;
};
