// BH identifiers for paraphrases of Cambridge's AO bullets; not official sub-AO codes.
export const physicsObjectiveComponentLabels = {
    'BH-CIE0654-AO1-concepts': 'Scientific concepts and relationships',
    'BH-CIE0654-AO1-terminology': 'Scientific terms, symbols and units',
    'BH-CIE0654-AO1-apparatus-safety': 'Apparatus and safety knowledge',
    'BH-CIE0654-AO1-applications': 'Scientific applications and implications',
    'BH-CIE0654-AO2-select-information': 'Selecting relevant information',
    'BH-CIE0654-AO2-representations': 'Translating representations',
    'BH-CIE0654-AO2-numerical-data': 'Using numerical data',
    'BH-CIE0654-AO2-patterns-conclusions': 'Patterns and conclusions',
    'BH-CIE0654-AO2-reasoned-explanations': 'Reasoning about relationships',
    'BH-CIE0654-AO2-predictions': 'Predicting outcomes',
    'BH-CIE0654-AO2-problem-solving': 'Solving quantitative problems',
};
export const questionAssessmentSearchText = (question) => [
    question.curriculum_strand, question.curriculum_skill, question.curriculum_subskill,
    question.curriculum_objective,
    ...(question.assessment_profiles || []).flatMap((profile) => [
        profile.programmeCode, profile.sourceVersion, profile.syllabusTier, profile.syllabusReference,
        ...profile.assessmentObjectives,
        ...(profile.objectiveComponents || []).map((code) => physicsObjectiveComponentLabels[code] || code),
    ]),
    ...(question.registry_mappings || []).flatMap((mapping) => [
        mapping.strand, mapping.skill, mapping.subskill, mapping.evidenceFocus, mapping.evidenceStatement,
    ]),
].filter(Boolean).join(' ');
