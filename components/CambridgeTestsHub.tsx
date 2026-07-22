import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { tryConsumePilotQuota } from '../services/tierService';
import type { Profile } from '../types';
import ProfessionalCambridgeReport, { generateSerialNumber } from './ProfessionalCambridgeReport';
import type { ProfessionalReportData } from './ProfessionalCambridgeReport';
import { sanitizeCommunicativeAchievementText } from '../src/lib/writingCommunicativeAchievement';
import { BIOLOGY_IMAGE_CHAPTERS, getBiologyChapterPartRanges } from './biologyCambridgeCatalog';

interface CambridgeTest {
  id: string;
  name: string;
  description: string;
  duration: string;
  totalQuestions: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  category: 'Reading' | 'Listening' | 'Grammar' | 'Vocabulary' | 'Writing' | 'Science';
  subject: 'English stage 9' | 'Chemistry' | 'Biology' | 'Travel & Tourism';
  url: string;
  isCompleted?: boolean;
  score?: number;
  completedAt?: string;
  requiresMarking?: boolean;
  isAwaitingMarking?: boolean; // True if submitted but not yet marked
  feedbackReleased?: boolean; // True if teacher has released feedback
  isMarked?: boolean; // True if teacher has marked the test
  scoresReleased?: boolean; // True if teacher released auto-marked score/report
}

interface CambridgeTestsHubProps {
  profile: Profile;
  onExit: () => void;
}

// Available Cambridge tests - add new tests here
const ENGLISH_TESTS: CambridgeTest[] = [
  {
    id: 'cambridge-end-unit-4',
    name: 'End of Unit 4 Test',
    description: 'Stage 9 end-of-unit assessment focusing on vocabulary and grammar skills.',
    duration: '40 min',
    totalQuestions: 40,
    difficulty: 'Intermediate',
    category: 'Grammar',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_end_unit_4_test.html',
  },
  {
    id: 'cambridge-reading-25',
    name: 'Cambridge Reading Test 25',
    description: 'Comprehensive reading comprehension test covering vocabulary, matching, and detailed analysis.',
    duration: '45 min',
    totalQuestions: 42,
    difficulty: 'Intermediate',
    category: 'Reading',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_reading_25_answer_form.html',
  },
  {
    id: 'cambridge-listening-1',
    name: 'Cambridge Listening Test 1',
    description: 'Complete listening test with 5 parts: picture selection, multiple choice, fill-in-the-blanks, interview, and matching exercises.',
    duration: '30 min',
    totalQuestions: 25,
    difficulty: 'Intermediate',
    category: 'Listening',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_listening_test_1.html',
  },
  {
    id: 'cambridge-writing-1',
    name: 'Cambridge Writing Test 1',
    description: 'E2L Stage 9 Paper 3 writing test with 2 parts: a short message (45-55 words) and an opinion essay (110-130 words). Teacher-marked.',
    duration: '45 min',
    totalQuestions: 2,
    difficulty: 'Intermediate',
    category: 'Writing',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_writing_test_1.html',
    requiresMarking: true,
  },
  {
    id: 'cambridge-writing-2',
    name: 'Cambridge Writing Test 2',
    description: 'E2L Stage 9 Paper 3 writing test with 2 parts: an email (45-55 words) and a story (110-130 words). Teacher-marked.',
    duration: '45 min',
    totalQuestions: 2,
    difficulty: 'Intermediate',
    category: 'Writing',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_writing_test_2.html',
    requiresMarking: true,
  },
  {
    id: 'cambridge-end-unit-4-stage-8',
    name: 'End of Unit 4 Test (Stage 8 English)',
    description: 'Comprehensive test covering vocabulary, grammar, and language skills. 40 questions total: vocabulary matching, passive voice, present perfect continuous, and multiple-choice sections.',
    duration: '60 min',
    totalQuestions: 40,
    difficulty: 'Intermediate',
    category: 'Vocabulary' as const,
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_end_unit_4_test.html',
  },
];

const AS_CHEMISTRY_TESTS: CambridgeTest[] = [
  // Ch1 — Atomic Structure
  {
    id: 'as-chemistry-atomic-structure-part-1',
    name: 'AS Chemistry — Atomic Structure (Part 1)',
    description: 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.',
    duration: '50 min',
    totalQuestions: 25,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/atomic_structure.html?part=1',
  },
  {
    id: 'as-chemistry-atomic-structure-part-2',
    name: 'AS Chemistry — Atomic Structure (Part 2)',
    description: 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.',
    duration: '48 min',
    totalQuestions: 24,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/atomic_structure.html?part=2',
  },
  // Ch2 — Atoms, molecules and stoichiometry
  {
    id: 'as-chemistry-ch2-atoms-molecules-stoichiometry-part-1',
    name: 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 1)',
    description: 'Chapter 2 multiple-choice practice covering Avogadro constant, empirical formulae, ionisation trends, and reacting masses.',
    duration: '64 min',
    totalQuestions: 32,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/atoms_molecules_stoichiometry.html?part=1',
  },
  {
    id: 'as-chemistry-ch2-atoms-molecules-stoichiometry-part-2',
    name: 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)',
    description: 'Chapter 2 multiple-choice practice covering Avogadro constant, empirical formulae, ionisation trends, and reacting masses.',
    duration: '64 min',
    totalQuestions: 32,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/atoms_molecules_stoichiometry.html?part=2',
  },
  // Ch3 — Chemical bonding
  {
    id: 'as-chemistry-ch3-chemical-bonding-part-1',
    name: 'AS Chemistry Ch3 (Chemical bonding) (Part 1)',
    description: 'Chapter 3 multiple-choice practice on metallic bonding, shapes, hybridisation, bonding energetics, and dative bonds.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_bonding.html?part=1',
  },
  {
    id: 'as-chemistry-ch3-chemical-bonding-part-2',
    name: 'AS Chemistry Ch3 (Chemical bonding) (Part 2)',
    description: 'Chapter 3 multiple-choice practice on metallic bonding, shapes, hybridisation, bonding energetics, and dative bonds.',
    duration: '54 min',
    totalQuestions: 27,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_bonding.html?part=2',
  },
  // Ch4 — States of matter
  {
    id: 'as-chemistry-ch4-states-of-matter-part-1',
    name: 'AS Chemistry Ch4 (States of matter) (Part 1)',
    description: 'Chapter 4 multiple-choice practice on gas laws, kinetic theory, real gas deviations, and quantitative gas questions.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/states_of_matter.html?part=1',
  },
  {
    id: 'as-chemistry-ch4-states-of-matter-part-2',
    name: 'AS Chemistry Ch4 (States of matter) (Part 2)',
    description: 'Chapter 4 multiple-choice practice on gas laws, kinetic theory, real gas deviations, and quantitative gas questions.',
    duration: '60 min',
    totalQuestions: 30,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/states_of_matter.html?part=2',
  },
  // Ch5 — Chemical Energetics
  {
    id: 'as-chemistry-ch5-chemical-energetics-part-1',
    name: 'AS Chemistry Ch5 (Chemical Energetics) (Part 1)',
    description: 'Chapter 5 multiple-choice practice on enthalpy terminology, energy profiles, Hess\u2019 law reasoning, and calorimetry.',
    duration: '54 min',
    totalQuestions: 27,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_energetics.html?part=1',
  },
  {
    id: 'as-chemistry-ch5-chemical-energetics-part-2',
    name: 'AS Chemistry Ch5 (Chemical Energetics) (Part 2)',
    description: 'Chapter 5 multiple-choice practice on enthalpy terminology, energy profiles, Hess\u2019 law reasoning, and calorimetry.',
    duration: '52 min',
    totalQuestions: 26,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_energetics.html?part=2',
  },
  // Ch6 — Electrochemistry
  {
    id: 'as-chemistry-ch6-electrochemistry-part-1',
    name: 'AS Chemistry Ch6 (Electrochemistry) (Part 1)',
    description: 'Chapter 6 multiple-choice practice on electrochemical cells, electrode potentials, fuel cells, and redox processes.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/electrochemistry.html?part=1',
  },
  {
    id: 'as-chemistry-ch6-electrochemistry-part-2',
    name: 'AS Chemistry Ch6 (Electrochemistry) (Part 2)',
    description: 'Chapter 6 multiple-choice practice on electrochemical cells, electrode potentials, fuel cells, and redox processes.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/electrochemistry.html?part=2',
  },
  // Ch7 — Equilibria
  {
    id: 'as-chemistry-ch7-equilibria-part-1',
    name: 'AS Chemistry Ch7 (Equilibria) (Part 1)',
    description: 'Le Chatelier shifts, Kp / Kc calculations, industrial processes, and equilibrium graphs.',
    duration: '74 min',
    totalQuestions: 37,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/equilibria.html?part=1',
  },
  {
    id: 'as-chemistry-ch7-equilibria-part-2',
    name: 'AS Chemistry Ch7 (Equilibria) (Part 2)',
    description: 'Le Chatelier shifts, Kp / Kc calculations, industrial processes, and equilibrium graphs.',
    duration: '72 min',
    totalQuestions: 36,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/equilibria.html?part=2',
  },
  // Ch8 — Reaction kinetics
  {
    id: 'as-chemistry-ch8-reaction-kinetics-part-1',
    name: 'AS Chemistry Ch8 (Reaction kinetics) (Part 1)',
    description: 'Collision theory, Maxwell\u2013Boltzmann curves, catalysts, half-life, and rate equation reasoning.',
    duration: '42 min',
    totalQuestions: 21,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/reaction_kinetics.html?part=1',
  },
  {
    id: 'as-chemistry-ch8-reaction-kinetics-part-2',
    name: 'AS Chemistry Ch8 (Reaction kinetics) (Part 2)',
    description: 'Collision theory, Maxwell\u2013Boltzmann curves, catalysts, half-life, and rate equation reasoning.',
    duration: '40 min',
    totalQuestions: 20,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/reaction_kinetics.html?part=2',
  },
  // Ch9 — Chemical Periodicity
  {
    id: 'as-chemistry-ch9-chemical-periodicity-part-1',
    name: 'AS Chemistry Ch9 (Chemical Periodicity) (Part 1)',
    description: 'Period 3 oxides, chlorides, structure trends, acid-base behaviour, and combustion stoichiometry.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_periodicity.html?part=1',
  },
  {
    id: 'as-chemistry-ch9-chemical-periodicity-part-2',
    name: 'AS Chemistry Ch9 (Chemical Periodicity) (Part 2)',
    description: 'Period 3 oxides, chlorides, structure trends, acid-base behaviour, and combustion stoichiometry.',
    duration: '84 min',
    totalQuestions: 42,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_periodicity.html?part=2',
  },
  // Ch10 — Group 2
  {
    id: 'as-chemistry-ch10-group-2-part-1',
    name: 'AS Chemistry Ch10 (Group 2) (Part 1)',
    description: 'Group 2 trends practice on solubility, thermal stability, reactions, and qualitative analysis scenarios.',
    duration: '74 min',
    totalQuestions: 37,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/group_2.html?part=1',
  },
  {
    id: 'as-chemistry-ch10-group-2-part-2',
    name: 'AS Chemistry Ch10 (Group 2) (Part 2)',
    description: 'Group 2 trends practice on solubility, thermal stability, reactions, and qualitative analysis scenarios.',
    duration: '72 min',
    totalQuestions: 36,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/group_2.html?part=2',
  },
  // Ch11 — Group 17
  {
    id: 'as-chemistry-ch11-group-17-part-1',
    name: 'AS Chemistry Ch11 ( Group 17 ) (Part 1)',
    description: 'Chapter 11 part 1 practice on halogen trends, volatility, redox reactions, and halide tests.',
    duration: '41 min',
    totalQuestions: 41,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/group_17.html?part=1',
  },
  {
    id: 'as-chemistry-ch11-group-17-part-2',
    name: 'AS Chemistry Ch11 ( Group 17 ) (Part 2)',
    description: 'Chapter 11 part 2 practice on hydrogen halides, stability trends, and halogen displacement.',
    duration: '40 min',
    totalQuestions: 40,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/group_17.html?part=2',
  },
  // Ch12 — Nitrogen and sulfur
  {
    id: 'as-chemistry-ch12-nitrogen-sulfur-part-1',
    name: 'AS Chemistry Ch12 ( Nitrogen and sulfur ) (Part 1)',
    description: 'Chapter 12 part 1 - multiple-choice practice covering nitrogen oxides, ammonia, fertilisers, and atmospheric pollution.',
    duration: '50 min',
    totalQuestions: 25,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/nitrogen_sulfur.html?part=1',
  },
  {
    id: 'as-chemistry-ch12-nitrogen-sulfur-part-2',
    name: 'AS Chemistry Ch12 ( Nitrogen and sulfur ) (Part 2)',
    description: 'Chapter 12 part 2 - multiple-choice practice covering nitrogen oxides, ammonia, fertilisers, and atmospheric pollution.',
    duration: '50 min',
    totalQuestions: 25,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/nitrogen_sulfur.html?part=2',
  },
  // Ch13 — An introduction to AS Level organic chemistry
  {
    id: 'as-chemistry-ch13-introduction-as-level-organic-chemistry-part-1',
    name: 'AS Chemistry Ch13 ( An introduction to AS Level organic chemistry ) (Part 1)',
    description: 'Chapter 13 part 1 - multiple-choice practice on introductory organic chemistry structures, formulae, and bonding.',
    duration: '76 min',
    totalQuestions: 38,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/intro_as_level_organic_chemistry.html?part=1',
  },
  {
    id: 'as-chemistry-ch13-introduction-as-level-organic-chemistry-part-2',
    name: 'AS Chemistry Ch13 ( An introduction to AS Level organic chemistry ) (Part 2)',
    description: 'Chapter 13 part 2 - multiple-choice practice on reaction types, stereochemistry, and organic analysis fundamentals.',
    duration: '76 min',
    totalQuestions: 38,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/intro_as_level_organic_chemistry.html?part=2',
  },
  // Ch14 — Hydrocarbons
  {
    id: 'as-chemistry-ch14-hydrocarbons-part-1',
    name: 'AS Chemistry Ch14 ( Hydrocarbons ) (Part 1)',
    description: 'Chapter 14 part 1 - multiple-choice practice on hydrocarbons, combustion, and free radical substitution basics.',
    duration: '60 min',
    totalQuestions: 30,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/hydrocarbons.html?part=1',
  },
  {
    id: 'as-chemistry-ch14-hydrocarbons-part-2',
    name: 'AS Chemistry Ch14 ( Hydrocarbons ) (Part 2)',
    description: 'Chapter 14 part 2 - multiple-choice practice on catalytic converters, alkenes, and reaction mechanisms.',
    duration: '60 min',
    totalQuestions: 30,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/hydrocarbons.html?part=2',
  },
  // Ch15 — Halogen compounds
  {
    id: 'as-chemistry-ch15-halogen-compounds-part-1',
    name: 'AS Chemistry Ch15 ( Halogen compounds ) (Part 1)',
    description: 'Chapter 15 part 1 - multiple-choice practice on halogenoalkanes, reaction rates, and nucleophilic substitution.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/halogen_compounds.html?part=1',
  },
  {
    id: 'as-chemistry-ch15-halogen-compounds-part-2',
    name: 'AS Chemistry Ch15 ( Halogen compounds ) (Part 2)',
    description: 'Chapter 15 part 2 - multiple-choice practice on elimination, mechanisms, and halogen compound synthesis.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/halogen_compounds.html?part=2',
  },
  // Ch16 — Hydroxy compounds
  {
    id: 'as-chemistry-ch16-hydroxy-compounds-part-1',
    name: 'AS Chemistry Ch16 ( Hydroxy compounds ) (Part 1)',
    description: 'Chapter 16 part 1 - multiple-choice practice on hydroxy compounds, oxidation, and alcohol reactions.',
    duration: '88 min',
    totalQuestions: 44,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/hydroxy_compounds.html?part=1',
  },
  {
    id: 'as-chemistry-ch16-hydroxy-compounds-part-2',
    name: 'AS Chemistry Ch16 ( Hydroxy compounds ) (Part 2)',
    description: 'Chapter 16 part 2 - multiple-choice practice on hydroxy compound synthesis, esterification, and reaction pathways.',
    duration: '88 min',
    totalQuestions: 44,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/hydroxy_compounds.html?part=2',
  },
  // Ch17 — Carbonyl compounds
  {
    id: 'as-chemistry-ch17-carbonyl-compounds-part-1',
    name: 'AS Chemistry Ch17 ( Carbonyl compounds ) (Part 1)',
    description: 'Chapter 17 part 1 - multiple-choice practice on aldehydes, ketones, carbonyl tests, and nucleophilic addition.',
    duration: '65 min',
    totalQuestions: 32,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/carbonyl_compounds.html?part=1',
  },
  {
    id: 'as-chemistry-ch17-carbonyl-compounds-part-2',
    name: 'AS Chemistry Ch17 ( Carbonyl compounds ) (Part 2)',
    description: 'Chapter 17 part 2 - multiple-choice practice on oxidation, carbonyl mechanisms, and analytical tests.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/carbonyl_compounds.html?part=2',
  },
  // Ch18 — Carboxylic acids and derivatives
  {
    id: 'as-chemistry-ch18-carboxylic-acids-derivatives-part-1',
    name: 'AS Chemistry Ch18 ( Carboxylic acids and derivatives ) (Part 1)',
    description: 'Chapter 18 part 1 - multiple-choice practice on carboxylic acid properties, derivatives, and reactions.',
    duration: '82 min',
    totalQuestions: 41,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/carboxylic_acids_derivatives.html?part=1',
  },
  {
    id: 'as-chemistry-ch18-carboxylic-acids-derivatives-part-2',
    name: 'AS Chemistry Ch18 ( Carboxylic acids and derivatives ) (Part 2)',
    description: 'Chapter 18 part 2 - multiple-choice practice on carboxylic acid properties, derivatives, and reactions.',
    duration: '82 min',
    totalQuestions: 41,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/carboxylic_acids_derivatives.html?part=2',
  },
  // Ch19 — Nitrogen compounds
  {
    id: 'as-chemistry-ch19-nitrogen-compounds-part-1',
    name: 'AS Chemistry Ch19 ( Nitrogen compounds ) (Part 1)',
    description: 'Chapter 19 part 1 - multiple-choice practice on nitrogen compounds, nitriles, and reaction pathways.',
    duration: '6 min',
    totalQuestions: 3,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/nitrogen_compounds.html?part=1',
  },
  {
    id: 'as-chemistry-ch19-nitrogen-compounds-part-2',
    name: 'AS Chemistry Ch19 ( Nitrogen compounds ) (Part 2)',
    description: 'Chapter 19 part 2 - multiple-choice practice on nitrogen compounds, nitriles, and reaction pathways.',
    duration: '6 min',
    totalQuestions: 3,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/nitrogen_compounds.html?part=2',
  },
  // Ch20 — Polymerisation
  {
    id: 'as-chemistry-ch20-polymerisation-part-1',
    name: 'AS Chemistry Ch20 ( Polymerisation ) (Part 1)',
    description: 'Chapter 20 part 1 - multiple-choice practice covering addition polymers, PVC properties, and monomer identification.',
    duration: '16 min',
    totalQuestions: 8,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/polymerisation.html?part=1',
  },
  {
    id: 'as-chemistry-ch20-polymerisation-part-2',
    name: 'AS Chemistry Ch20 ( Polymerisation ) (Part 2)',
    description: 'Chapter 20 part 2 - multiple-choice practice covering polymer structures, combustion, and disposal considerations.',
    duration: '16 min',
    totalQuestions: 8,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/polymerisation.html?part=2',
  },
  // Ch21 — Analytical techniques
  {
    id: 'as-chemistry-ch21-analytical-techniques-part-1',
    name: 'AS Chemistry Ch21 ( Analytical techniques ) (Part 1)',
    description: 'Chapter 21 part 1 - multiple-choice practice covering infrared spectroscopy, mass spectrometry, and analytical interpretation.',
    duration: '35 min',
    totalQuestions: 17,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/analytical_techniques.html?part=1',
  },
  {
    id: 'as-chemistry-ch21-analytical-techniques-part-2',
    name: 'AS Chemistry Ch21 ( Analytical techniques ) (Part 2)',
    description: 'Chapter 21 part 2 - multiple-choice practice covering infrared spectroscopy, mass spectrometry, and analytical interpretation.',
    duration: '35 min',
    totalQuestions: 17,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Chemistry',
    url: '/cambridge-tests/Chemistry/analytical_techniques.html?part=2',
  },
];


function buildBiologyImageChapterTests(): CambridgeTest[] {
  return BIOLOGY_IMAGE_CHAPTERS.flatMap((chapter) => getBiologyChapterPartRanges(chapter).map((range) => ({
    id: `${chapter.quizBaseId.replaceAll('_', '-')}-part-${range.part}`,
    name: `AS Biology Ch${chapter.chapter} ( ${chapter.title} ) (Part ${range.part})`,
    description: `${chapter.description} (Q${range.start}–Q${range.end}). 9700 AS Biology MCQ image-question pool.`,
    duration: `${range.size * 2} min`,
    totalQuestions: range.size,
    difficulty: 'Advanced' as const,
    category: 'Science' as const,
    subject: 'Biology' as const,
    url: `/cambridge-tests/Biology/${chapter.slug}.html?part=${range.part}`,
  })));
}

const AS_BIOLOGY_TESTS: CambridgeTest[] = [
  // Ch1 — Cell structure (151 validated 2017–2024 questions split 31/31/31/31/27)
  {
    id: 'as-biology-ch1-cell-structure-part-1',
    name: 'AS Biology Ch1 ( Cell structure ) (Part 1)',
    description: 'Chapter 1 Part 1 — Microscope in cell studies (Q1–Q31). 9700 AS Biology MCQ question pool.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/cell_structure.html?part=1',
  },
  {
    id: 'as-biology-ch1-cell-structure-part-2',
    name: 'AS Biology Ch1 ( Cell structure ) (Part 2)',
    description: 'Chapter 1 Part 2 — Microscopy & cells as basic units (Q32–Q62). 9700 AS Biology MCQ question pool.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/cell_structure.html?part=2',
  },
  {
    id: 'as-biology-ch1-cell-structure-part-3',
    name: 'AS Biology Ch1 ( Cell structure ) (Part 3)',
    description: 'Chapter 1 Part 3 — Cells as basic units of living organisms (Q63–Q93). 9700 AS Biology MCQ question pool.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/cell_structure.html?part=3',
  },
  {
    id: 'as-biology-ch1-cell-structure-part-4',
    name: 'AS Biology Ch1 ( Cell structure ) (Part 4)',
    description: 'Chapter 1 Part 4 — Cells as basic units of living organisms (Q94–Q124). 9700 AS Biology MCQ question pool.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/cell_structure.html?part=4',
  },
  {
    id: 'as-biology-ch1-cell-structure-part-5',
    name: 'AS Biology Ch1 ( Cell structure ) (Part 5)',
    description: 'Chapter 1 Part 5 — Cells as basic units of living organisms (Q125–Q151). 9700 AS Biology MCQ question pool.',
    duration: '54 min',
    totalQuestions: 27,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/cell_structure.html?part=5',
  },
  ...buildBiologyImageChapterTests(),
  // Ch12 — Energy and respiration
  {
    id: 'as-biology-ch12-energy-respiration-part-1',
    name: 'AS Biology Ch12 ( Energy and respiration ) (Part 1)',
    description: 'Chapter 12 multiple-choice practice on ATP, glycolysis, Krebs cycle, and oxidative phosphorylation.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/energy_respiration.html?part=1',
  },
  {
    id: 'as-biology-ch12-energy-respiration-part-2',
    name: 'AS Biology Ch12 ( Energy and respiration ) (Part 2)',
    description: 'Chapter 12 multiple-choice practice on ATP, glycolysis, Krebs cycle, and oxidative phosphorylation.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/energy_respiration.html?part=2',
  },
  // Ch13 — Photosynthesis
  {
    id: 'as-biology-ch13-photosynthesis-part-1',
    name: 'AS Biology Ch13 ( Photosynthesis ) (Part 1)',
    description: 'Chapter 13 multiple-choice practice on light-dependent reactions, Calvin cycle, and limiting factors.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/photosynthesis.html?part=1',
  },
  {
    id: 'as-biology-ch13-photosynthesis-part-2',
    name: 'AS Biology Ch13 ( Photosynthesis ) (Part 2)',
    description: 'Chapter 13 multiple-choice practice on light-dependent reactions, Calvin cycle, and limiting factors.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/photosynthesis.html?part=2',
  },
  // Ch14 — Inherited change
  {
    id: 'as-biology-ch14-inherited-change-part-1',
    name: 'AS Biology Ch14 ( Inherited change ) (Part 1)',
    description: 'Chapter 14 multiple-choice practice on meiosis, genetic variation, mutations, and inheritance patterns.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/inherited_change.html?part=1',
  },
  {
    id: 'as-biology-ch14-inherited-change-part-2',
    name: 'AS Biology Ch14 ( Inherited change ) (Part 2)',
    description: 'Chapter 14 multiple-choice practice on meiosis, genetic variation, mutations, and inheritance patterns.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/inherited_change.html?part=2',
  },
  // Ch15 — Selection and evolution
  {
    id: 'as-biology-ch15-selection-evolution-part-1',
    name: 'AS Biology Ch15 ( Selection and evolution ) (Part 1)',
    description: 'Chapter 15 multiple-choice practice on natural selection, speciation, and evidence for evolution.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/selection_evolution.html?part=1',
  },
  {
    id: 'as-biology-ch15-selection-evolution-part-2',
    name: 'AS Biology Ch15 ( Selection and evolution ) (Part 2)',
    description: 'Chapter 15 multiple-choice practice on natural selection, speciation, and evidence for evolution.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/selection_evolution.html?part=2',
  },
  // Ch16 — Biodiversity, classification and conservation
  {
    id: 'as-biology-ch16-biodiversity-classification-conservation-part-1',
    name: 'AS Biology Ch16 ( Biodiversity, classification and conservation ) (Part 1)',
    description: 'Chapter 16 multiple-choice practice on species diversity, taxonomy, ecosystems, and conservation.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/biodiversity_classification_conservation.html?part=1',
  },
  {
    id: 'as-biology-ch16-biodiversity-classification-conservation-part-2',
    name: 'AS Biology Ch16 ( Biodiversity, classification and conservation ) (Part 2)',
    description: 'Chapter 16 multiple-choice practice on species diversity, taxonomy, ecosystems, and conservation.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/biodiversity_classification_conservation.html?part=2',
  },
  // Ch17 — Genetic technology
  {
    id: 'as-biology-ch17-genetic-technology-part-1',
    name: 'AS Biology Ch17 ( Genetic technology ) (Part 1)',
    description: 'Chapter 17 multiple-choice practice on genetic engineering, PCR, gel electrophoresis, and gene therapy.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/genetic_technology.html?part=1',
  },
  {
    id: 'as-biology-ch17-genetic-technology-part-2',
    name: 'AS Biology Ch17 ( Genetic technology ) (Part 2)',
    description: 'Chapter 17 multiple-choice practice on genetic engineering, PCR, gel electrophoresis, and gene therapy.',
    duration: '0 min',
    totalQuestions: 0,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'Biology',
    url: '/cambridge-tests/Biology/genetic_technology.html?part=2',
  },
];

const TRAVEL_TOURISM_TESTS: CambridgeTest[] = [
  {
    id: 'travel-tourism-sustainable-mission',
    name: 'Operation Sustainable Tourism',
    description: 'Guarded Cambridge International AS & A Level Travel & Tourism 9395 Paper 1 style exam. Teacher-marked, with optional AI marking suggestions for teachers.',
    duration: '90 min',
    totalQuestions: 80,
    difficulty: 'Intermediate',
    category: 'Writing',
    subject: 'Travel & Tourism',
    url: '/cambridge-tests/Travel%20Tourism/sustainable_tourism_mission.html',
    requiresMarking: true,
  },
];

const AVAILABLE_TESTS: CambridgeTest[] = [
  ...ENGLISH_TESTS,
  ...AS_CHEMISTRY_TESTS,
  ...AS_BIOLOGY_TESTS,
  ...TRAVEL_TOURISM_TESTS,
];

interface MistakeItem {
  wrong: string;
  correct: string;
  explanation: string;
}

interface MarkJustifications {
  content: string;
  organisation: string;
  language: string;
  communicativeAchievement?: string;
}

interface WritingFeedbackView {
  testName: string;
  score: number;
  percentage: number;
  part1: {
    original: string;
    feedback: string;
    corrected: string;
    content: number;
    organisation: number;
    language: number;
    spellingMistakes?: MistakeItem[];
    grammarMistakes?: MistakeItem[];
    markJustifications?: MarkJustifications;
  };
  part2: {
    original: string;
    feedback: string;
    corrected: string;
    content: number;
    communicativeAchievement: number;
    organisation: number;
    language: number;
    spellingMistakes?: MistakeItem[];
    grammarMistakes?: MistakeItem[];
    markJustifications?: MarkJustifications;
  };
  markedBy?: string | null;
  markedAt?: string | null;
  overallComments?: string;
}

interface WritingSubmissionHistoryItem {
  submittedAt: string;
  percentage: number;
  score: number;
  grammarIssues: number;
  punctuationIssues: number;
}

const getProgressBarColor = (value: number) => {
  if (value >= 80) return '#22c55e';
  if (value >= 60) return '#eab308';
  return '#ef4444';
};

const classifyGrammarAndPunctuation = (items: MistakeItem[] = []) => {
  const punctuation = items.filter((item) => /punct|comma|full stop|period|apostrophe|quote|capital/i.test(item.explanation || item.wrong));
  const grammar = items.filter((item) => !punctuation.includes(item));
  return { grammar, punctuation };
};

const CambridgeTestsHub: React.FC<CambridgeTestsHubProps> = ({ profile, onExit }) => {
  const [tests, setTests] = useState<CambridgeTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<CambridgeTest | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackData, setFeedbackData] = useState<WritingFeedbackView | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [activeFeedbackPart, setActiveFeedbackPart] = useState<'part1' | 'part2'>('part1');
  const [feedbackHistory, setFeedbackHistory] = useState<WritingSubmissionHistoryItem[]>([]);
  const [showStudentReport, setShowStudentReport] = useState(false);
  const [studentReportData, setStudentReportData] = useState<ProfessionalReportData | null>(null);
  const [studentReportLoading, setStudentReportLoading] = useState(false);
  const [collapsedSubjects, setCollapsedSubjects] = useState<Record<string, boolean>>({});
  const [visibleTestIds, setVisibleTestIds] = useState<Set<string>>(new Set());
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [testSubmittedInSession, setTestSubmittedInSession] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialLoadDone = useRef(false);

  // Fetch visible tests based on teacher visibility settings
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);

  const loadVisibleTests = async () => {
    if (!profile.school_id || profile.grade === null) {
      // If no school or grade, show no tests — student profile needs to be set up
      console.warn('Student has no school_id or grade — hiding all tests until profile is configured');
      setVisibleTestIds(new Set());
      setVisibilityLoaded(true);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_visible_cambridge_tests_for_student', {
        p_student_grade: profile.grade,
        p_school_id: profile.school_id
      });

      if (error) {
        console.error('Error fetching visible tests:', error);
        // On error, hide all tests — never expose tests on failure
        setVisibleTestIds(new Set());
        setVisibilityLoaded(true);
        return;
      }

      if (!data || data.length === 0) {
        // No visibility settings found - show no tests (teachers need to enable them)
        setVisibleTestIds(new Set());
      } else {
        const visibleIds = new Set(data.map((row: { test_id: string }) => row.test_id));
        setVisibleTestIds(visibleIds);
      }
    } catch (err) {
      console.error('Exception loading visible tests:', err);
      // On exception, hide all tests — never expose tests on failure
      setVisibleTestIds(new Set());
    } finally {
      setVisibilityLoaded(true);
    }
  };

  useEffect(() => {
    const initialLoad = async () => {
      await loadVisibleTests();
    };
    initialLoad();
  }, [profile.school_id, profile.grade]);

  // Load test progress once visible tests are known (initial load only)
  useEffect(() => {
    if (!initialLoadDone.current && visibilityLoaded) {
      initialLoadDone.current = true;
      loadTestProgress();
    }
  }, [visibilityLoaded, visibleTestIds]);

  useEffect(() => {
    if (!showFeedbackModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [showFeedbackModal]);

  // Listen for test completion and deletion messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CAMBRIDGE_TEST_COMPLETE') {
        console.log('Test completed:', event.data);
        setTestSubmittedInSession(true);
        // Refresh the test list to show updated completion status
        setTimeout(() => {
          loadTestProgress();
        }, 1000);
      } else if (event.data?.type === 'CAMBRIDGE_TEST_DELETED') {
        console.log('Test submission deleted:', event.data);
        // Refresh the test list to show reset status (no longer marked as completed)
        setTimeout(() => {
          loadTestProgress();
        }, 500);
      } else if (event.data?.type === 'CAMBRIDGE_TEST_REVIEW_MODE') {
        // Iframe detected the test was already submitted — enter review mode
        setIsReviewMode(true);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Manual refresh: re-fetch visibility + progress without full loading spinner
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadVisibleTests();
      await loadTestProgress(true);
    } finally {
      setRefreshing(false);
    }
  };

  const loadTestProgress = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch completed tests from quiz_scores table (include answers for marking status)
      let progressQuery = supabase
        .from('quiz_scores')
        .select('quiz_name, score, total_questions, percentage, submitted_at, answers, scores_released')
        .eq('student_name', profile.username)
        .order('submitted_at', { ascending: false });
      
      // Defense-in-depth: scope to own school
      if (profile.school_id) {
        progressQuery = progressQuery.eq('school_id', profile.school_id);
      }

      const { data: completedTests, error } = await progressQuery;

      if (error) throw error;

      // Filter tests by visibility settings first
      // Only show tests that teachers have explicitly made visible
      const availableTests = AVAILABLE_TESTS.filter(test => 
        visibleTestIds.has(test.id)
      );

      // Map test completion status
      const normalizeTestName = (value: string) => value
        .toLowerCase()
        .replace(/cambridge/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const testsWithProgress = availableTests.map(test => {
        const normalizedTestId = normalizeTestName(test.id.replace(/-/g, ' '));
        const normalizedTestName = normalizeTestName(test.name);
        const completion = completedTests?.find(c => {
          const normalizedQuizName = normalizeTestName(c.quiz_name);
          return normalizedQuizName.includes(normalizedTestId)
            || normalizedQuizName.includes(normalizedTestName)
            || normalizedTestName.includes(normalizedQuizName);
        });
        
        // Check if this is a writing test awaiting marking
        // Parse answers if it's a string (Supabase sometimes returns JSONB as string)
        let answers: { requires_marking?: boolean; feedback?: { releasedToStudent?: boolean } } | undefined;
        if (completion?.answers) {
          answers = typeof completion.answers === 'string' 
            ? JSON.parse(completion.answers) 
            : completion.answers;
        }
        const isAwaitingMarking = test.requiresMarking && answers?.requires_marking === true;
        const feedbackReleased = answers?.feedback?.releasedToStudent === true;
        // Test is marked if requires_marking is explicitly false (was true, now marked)
        const isMarked = test.requiresMarking && answers?.requires_marking === false && answers?.marks !== undefined;
        const scoresReleased = completion?.scores_released === true;
        
        // DEBUG: Log writing test status
        if (test.requiresMarking) {
          console.log('=== WRITING TEST STATUS ===');
          console.log('Test:', test.name);
          console.log('Found completion:', !!completion);
          console.log('Raw answers type:', typeof completion?.answers);
          console.log('Raw answers:', completion?.answers);
          console.log('Parsed answers:', answers);
          console.log('answers?.requires_marking:', answers?.requires_marking);
          console.log('answers?.feedback:', answers?.feedback);
          console.log('answers?.feedback?.releasedToStudent:', answers?.feedback?.releasedToStudent);
          console.log('isAwaitingMarking:', isAwaitingMarking);
          console.log('feedbackReleased:', feedbackReleased);
        }
        
        return {
          ...test,
          isCompleted: !!completion,
          score: completion?.percentage,
          completedAt: completion?.submitted_at,
          isAwaitingMarking,
          feedbackReleased,
          isMarked,
          scoresReleased,
        };
      });

      setTests(testsWithProgress);
    } catch (err) {
      console.error('Error loading test progress:', err);
      // Filter by visibility even on error
      // Only show tests that are in the visible set
      const availableTests = AVAILABLE_TESTS.filter(test => 
        visibleTestIds.has(test.id)
      );
      setTests(availableTests);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadVerifiedExamIdentity = async () => {
    const { data, error } = await supabase.rpc('get_my_cambridge_exam_identity');
    if (error || !data?.success) {
      alert(data?.error || error?.message || 'Your school administrator must confirm your real name before you can open a Cambridge test.');
      return null;
    }
    localStorage.setItem('cambridge_test_user', JSON.stringify(data));
    return data;
  };

  // Open the test in iframe for review mode (no retake, no deletion)
  const viewDetailedAnswers = async (test: CambridgeTest) => {
    if (!(await loadVerifiedExamIdentity())) return;
    setIsReviewMode(true);
    // Append review mode parameter so the test page skips anti-cheat and loads review directly
    const separator = test.url.includes('?') ? '&' : '?';
    setActiveTest({ ...test, url: `${test.url}${separator}mode=review` });
  };

  const handleStartTest = async (test: CambridgeTest) => {
    // Exams must use the student's school-verified real identity, never their codename.
    if (!(await loadVerifiedExamIdentity())) return;

    // Consume pilot quota only after identity validation succeeds.
    const quota = await tryConsumePilotQuota('cambridge_tests');
    if (!quota.proceed) {
      alert(quota.error || 'You\'ve reached the Cambridge test limit on the Pilot plan. Upgrade to continue.');
      return;
    }

    const isChemistryTest = test.subject === 'Chemistry';
    if (isChemistryTest && test.isCompleted && !test.scoresReleased) {
      return;
    }
    // If this is a retake, clear the previous submission lock from localStorage
    if (test.isCompleted && !isChemistryTest) {
      // Delete old submission from database so unique constraint allows re-submission
      try {
        const { data: retakeResult, error: retakeError } = await supabase.rpc('rpc_allow_cambridge_retake', {
          p_student_name: profile.username,
          p_quiz_name_pattern: `%${test.name}%`,
        });
        if (retakeError) {
          console.error('Failed to delete old submission for retake:', retakeError);
        } else {
          console.log('Old submission deleted for retake:', retakeResult);
        }
      } catch (e) {
        console.error('Error calling retake RPC:', e);
      }

      // Clear the submission lock for writing tests
      const quizId = test.id.replace(/-/g, '_');
      localStorage.removeItem(`quiz_submitted_${quizId}`);
      localStorage.removeItem(`quiz_draft_${quizId}`);
      // Also set a flag indicating this is a retake
      localStorage.setItem('cambridge_retake', 'true');
    }
    
    setActiveTest(test);
  };

  const handleTestComplete = () => {
    setActiveTest(null);
    setShowExitConfirm(false);
    setTestSubmittedInSession(false);
    setIsReviewMode(false);
    loadTestProgress(); // Refresh completion status
  };

  // Show exit confirmation before leaving an active test
  const handleExitClick = () => {
    if (testSubmittedInSession || isReviewMode) {
      // Test already submitted or in review mode, just exit without confirmation
      handleTestComplete();
      return;
    }
    setShowExitConfirm(true);
  };

  // Confirm exit: auto-submit via postMessage, then close
  const handleConfirmExit = () => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'FORCE_SUBMIT' }, '*');
      }
    } catch (e) {
      console.error('Failed to send FORCE_SUBMIT to test iframe:', e);
    }
    // Give the iframe a moment to process the auto-submit, then close
    setTimeout(() => {
      handleTestComplete();
    }, 1200);
  };

  // Function to view writing test feedback
  const viewWritingFeedback = async (test: CambridgeTest) => {
    setFeedbackLoading(true);
    setShowFeedbackModal(true);
    
    try {
      // Fetch the submission with feedback
      let feedbackQuery = supabase
        .from('quiz_scores')
        .select('*')
        .eq('student_name', profile.username)
        .ilike('quiz_name', '%writing%')
        .order('submitted_at', { ascending: false })
        .limit(1);
      
      // Defense-in-depth: scope to own school
      if (profile.school_id) {
        feedbackQuery = feedbackQuery.eq('school_id', profile.school_id);
      }

      const { data, error } = await feedbackQuery.single();
      const { data: historyRows } = await supabase
        .from('quiz_scores')
        .select('score, percentage, submitted_at, answers')
        .eq('student_name', profile.username)
        .eq('quiz_name', test.name)
        .order('submitted_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      if (data && data.answers) {
        const answers = typeof data.answers === 'string' ? JSON.parse(data.answers) : data.answers;
        
        // DEBUG: Log what we received from the database
        console.log('=== STUDENT FEEDBACK DEBUG ===');
        console.log('Raw data.answers:', data.answers);
        console.log('Parsed answers:', answers);
        console.log('answers.feedback:', answers.feedback);
        console.log('answers.feedback?.releasedToStudent:', answers.feedback?.releasedToStudent);
        console.log('answers.requires_marking:', answers.requires_marking);
        
        // Marks and feedback are stored INSIDE the answers JSONB column
        const marks = answers.marks || null;
        const feedback = answers.feedback || null;

        console.log('Extracted marks:', marks);
        console.log('Extracted feedback:', feedback);
        console.log('feedback?.releasedToStudent:', feedback?.releasedToStudent);

        // Check if the test has been marked (requires_marking is false means it's been marked)
        // Show feedback if marked, regardless of releasedToStudent flag
        const isMarked = answers.requires_marking === false && (marks !== null || feedback !== null);
        
        if (!isMarked && answers.requires_marking === true) {
          console.log('BLOCKING: Test is still awaiting marking');
          setFeedbackData(null);
          return;
        }

        console.log('SUCCESS: Test is marked, showing feedback to student');
        setFeedbackData({
          testName: data.quiz_name,
          score: data.score,
          percentage: data.percentage,
          part1: {
            original: answers.part1 || '',
            feedback: feedback?.part1?.feedback || '',
            corrected: feedback?.part1?.correctedVersion || '',
            content: marks?.part1?.content || 0,
            organisation: marks?.part1?.organisation || 0,
            language: marks?.part1?.language || 0,
            spellingMistakes: feedback?.part1?.spellingMistakes || [],
            grammarMistakes: feedback?.part1?.grammarMistakes || [],
            markJustifications: feedback?.part1?.markJustifications || null,
          },
          part2: {
            original: answers.part2 || '',
            feedback: feedback?.part2?.feedback || '',
            corrected: feedback?.part2?.correctedVersion || '',
            content: marks?.part2?.content || 0,
            communicativeAchievement: marks?.part2?.communicativeAchievement || 0,
            organisation: marks?.part2?.organisation || 0,
            language: marks?.part2?.language || 0,
            spellingMistakes: feedback?.part2?.spellingMistakes || [],
            grammarMistakes: feedback?.part2?.grammarMistakes || [],
            markJustifications: feedback?.part2?.markJustifications
              ? {
                  ...feedback.part2.markJustifications,
                  communicativeAchievement: sanitizeCommunicativeAchievementText(
                    feedback.part2.markJustifications.communicativeAchievement,
                    '',
                  ),
                }
              : null,
          },
          markedBy: answers.marked_by || null,
          markedAt: answers.marked_at || null,
          overallComments: feedback?.overallComments || '',
        });
        if (historyRows) {
          const parsedHistory = historyRows.map((row: any) => {
            const rowAnswers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
            const rowFeedback = rowAnswers?.feedback || {};
            const issues = [...(rowFeedback?.part1?.grammarMistakes || []), ...(rowFeedback?.part2?.grammarMistakes || [])];
            const { grammar, punctuation } = classifyGrammarAndPunctuation(issues);
            return {
              submittedAt: row.submitted_at,
              score: Number(row.score || 0),
              percentage: Number(row.percentage || 0),
              grammarIssues: grammar.length,
              punctuationIssues: punctuation.length,
            };
          });
          setFeedbackHistory(parsedHistory);
        } else {
          setFeedbackHistory([]);
        }
        setActiveFeedbackPart('part1');
      }
    } catch (err) {
      console.error('Error fetching writing feedback:', err);
      setFeedbackData(null);
      setFeedbackHistory([]);
    } finally {
      setFeedbackLoading(false);
    }
  };

  // ─── View Professional Score Report (Student Side) ────────────────────────
  const viewStudentReport = async (test: CambridgeTest) => {
    setStudentReportLoading(true);
    try {
      let reportQuery = supabase
        .from('quiz_scores')
        .select('*')
        .eq('student_name', profile.username)
        .order('submitted_at', { ascending: false });
      
      // Defense-in-depth: scope to own school
      if (profile.school_id) {
        reportQuery = reportQuery.eq('school_id', profile.school_id);
      }

      const { data, error } = await reportQuery;

      if (error) throw error;
      if (!data || data.length === 0) return;

      // Find matching test score
      const normalizeTestName = (value: string) => value
        .toLowerCase()
        .replace(/cambridge/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const normalizedTestId = normalizeTestName(test.id.replace(/-/g, ' '));
      const normalizedTestName = normalizeTestName(test.name);
      const scoreRow = data.find(c => {
        const nq = normalizeTestName(c.quiz_name);
        return nq.includes(normalizedTestId) || nq.includes(normalizedTestName) || normalizedTestName.includes(nq);
      });

      if (!scoreRow) {
        console.warn('No matching score found for student report');
        return;
      }

      // Grading helpers
      const getGrade = (pct: number) => {
        if (pct >= 90) return 'A+';
        if (pct >= 80) return 'A';
        if (pct >= 70) return 'B';
        if (pct >= 60) return 'C';
        if (pct >= 50) return 'D';
        return 'F';
      };
      const getEncouragement = (grade: string) => {
        switch (grade) {
          case 'A+': return { title: '🌟 Outstanding Achievement!', message: "You've mastered this material! Keep challenging yourself." };
          case 'A': return { title: '🎯 Excellent Work!', message: "You're performing at a high level. Focus on the few areas that need polish." };
          case 'B': return { title: '👍 Good Progress!', message: 'You have a solid foundation. Target your weak areas for improvement.' };
          case 'C': return { title: '📈 Room to Grow', message: "You're on the right track. More practice will boost your scores." };
          case 'D': return { title: '💪 Keep Pushing!', message: "Don't give up! Focus on understanding core concepts." };
          default: return { title: '🚀 Start Your Journey', message: 'Every expert was once a beginner. Let\'s work on building your skills.' };
        }
      };

      const pct = scoreRow.percentage ?? 0;
      const grade = getGrade(pct);
      const encouragement = getEncouragement(grade);
      const firstName = (scoreRow.student_name || profile.username || 'Student').split(' ')[0];

      // Build a basic skill performance from the score (limited data on student side)
      const skillPerformance: Record<string, { correct: number; total: number; percentage: number; icon: string }> = {
        'Overall Performance': {
          correct: scoreRow.score || 0,
          total: scoreRow.total_questions || 1,
          percentage: pct,
          icon: '📊',
        },
      };

      const personalizedNote = `${firstName}, you scored ${scoreRow.score}/${scoreRow.total_questions} (${pct}%). ${pct >= 80 ? 'Excellent work — keep it up!' : pct >= 60 ? 'Good effort. Review your weak areas to improve further.' : 'Keep practising and you will see improvement.'}`;

      const reportData: ProfessionalReportData = {
        id: scoreRow.id || '',
        studentName: scoreRow.student_name || profile.username || 'Student',
        studentClass: scoreRow.student_class || profile.batch || 'N/A',
        quizName: scoreRow.quiz_name,
        score: scoreRow.score || 0,
        totalQuestions: scoreRow.total_questions || 0,
        percentage: pct,
        submittedAt: scoreRow.submitted_at,
        timeTakenSeconds: scoreRow.time_taken_seconds,
        skillPerformance,
        correctCount: scoreRow.score || 0,
        wrongCount: (scoreRow.total_questions || 0) - (scoreRow.score || 0),
        unansweredCount: 0,
        grade,
        encouragement,
        actionPlanItems: [],
        fallbackPlan: pct < 80 ? { title: 'Focus on Practice', tips: ['Review the questions you got wrong', 'Re-read the relevant material', 'Try similar practice questions'] } : undefined,
        personalizedNote,
      };

      setStudentReportData(reportData);
      setShowStudentReport(true);
    } catch (err) {
      console.error('Error loading student report:', err);
    } finally {
      setStudentReportLoading(false);
    }
  };

  const gradeSubjectMap: Record<number, CambridgeTest['subject'][]> = {
    7: ['English stage 9'],
    8: ['English stage 9'],
    9: ['Travel & Tourism'],
    10: ['Travel & Tourism'],
    11: ['Chemistry', 'Biology', 'Travel & Tourism'],
    12: ['Chemistry', 'Biology', 'Travel & Tourism'],
  };

  const eligibleSubjects = profile.grade === null
    ? null
    : gradeSubjectMap[profile.grade] ?? [];

  const gradeFilteredTests = eligibleSubjects === null
    ? tests
    : tests.filter(test => eligibleSubjects.includes(test.subject));

  const filteredTests = gradeFilteredTests.filter(test => {
    if (filter === 'completed') return test.isCompleted;
    if (filter === 'pending') return !test.isCompleted;
    return true;
  });

  const testsBySubject = filteredTests.reduce<Record<string, CambridgeTest[]>>((acc, test) => {
    if (!acc[test.subject]) acc[test.subject] = [];
    acc[test.subject].push(test);
    return acc;
  }, {});

  const subjectList = Object.keys(testsBySubject);

  useEffect(() => {
    setCollapsedSubjects(prev => {
      const next = { ...prev };
      subjectList.forEach(subject => {
        if (next[subject] === undefined) {
          next[subject] = true;
        }
      });
      return next;
    });
  }, [subjectList.join('|')]);

  const toggleSubject = (subject: string) => {
    setCollapsedSubjects(prev => ({
      ...prev,
      [subject]: !prev[subject],
    }));
  };

  const completedCount = gradeFilteredTests.filter(t => t.isCompleted).length;
  const totalCount = gradeFilteredTests.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return '#22c55e';
      case 'Intermediate': return '#f59e0b';
      case 'Advanced': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Reading': return '📖';
      case 'Listening': return '🏧';
      case 'Grammar': return '✌️';
      case 'Vocabulary': return '📚';
      case 'Writing': return '✏️';
      case 'Science': return '🧪';
      default: return '📝';
    }
  };

  // If a test is active, show it in an iframe
  if (activeTest) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100vh',
        backgroundColor: '#fff',
        zIndex: 9999,
        overflow: 'hidden',
      }}>
        {/* Minimal Test Header Bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 15px',
          background: 'linear-gradient(135deg, #302b63 0%, #24243e 100%)',
          borderBottom: '2px solid #00f5ff',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>🧠</span>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeTest.name}
              </h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
                {activeTest.totalQuestions} questions
              </p>
            </div>
          </div>
          <button
            onClick={handleExitClick}
            style={{
              padding: '6px 16px',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            ✕ Exit
          </button>
        </div>
        
        {/* Test iframe - absolute positioning for reliable sizing */}
        <iframe
          ref={iframeRef}
          src={activeTest.url}
          style={{
            position: 'absolute',
            top: '52px',
            left: 0,
            width: '100%',
            height: 'calc(100vh - 52px)',
            border: 'none',
          }}
          title={activeTest.name}
          allow="autoplay"
        />

        {/* Exit Confirmation Modal */}
        {showExitConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #1e1b4b, #1a1a2e)',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '420px',
              width: '90%',
              border: '1px solid rgba(255,100,100,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px', color: '#fff', fontSize: '20px', fontWeight: 700 }}>
                Exit Test?
              </h3>
              <p style={{ margin: '0 0 25px', color: 'rgba(255,255,255,0.8)', fontSize: '14px', lineHeight: '1.6' }}>
                Exiting now will <strong style={{ color: '#ff6b6b' }}>automatically submit</strong> your current answers. 
                You will not be able to retake this test.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowExitConfirm(false)}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  Continue Test
                </button>
                <button
                  onClick={handleConfirmExit}
                  style={{
                    padding: '10px 24px',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  Exit & Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      color: '#fff',
      padding: '20px',
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '30px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img 
              src="/logo.png" 
              alt="Brains Heist" 
              style={{ width: '50px', height: '50px' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div>
              <h1 style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: 'bold',
                background: 'linear-gradient(90deg, #00f5ff, #00d4aa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Cambridge Tests
              </h1>
              <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
                Complete tests to boost your skills across subjects
              </p>
            </div>
          </div>
          <button
            onClick={onExit}
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            ← Back to Game
          </button>
        </div>

        {/* Progress Overview */}
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          padding: '20px 25px',
          marginBottom: '25px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'rgba(255,255,255,0.9)' }}>
                Your Progress
              </h3>
              <p style={{ margin: '5px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#00f5ff' }}>
                {completedCount} / {totalCount} Tests Completed
              </p>
            </div>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `conic-gradient(#00f5ff ${progressPercent}%, rgba(255,255,255,0.1) 0)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                width: '65px',
                height: '65px',
                borderRadius: '50%',
                backgroundColor: '#24243e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold',
              }}>
                {progressPercent}%
              </div>
            </div>
          </div>
          
          {/* Welcome message */}
          <div style={{
            background: 'rgba(0,245,255,0.1)',
            borderRadius: '10px',
            padding: '12px 15px',
            borderLeft: '3px solid #00f5ff',
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>
              👋 Welcome, <strong>{profile.username}</strong>! Take your time with each test. 
              Your progress is automatically saved.
            </p>
          </div>
        </div>

        {/* Filters + Refresh */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          alignItems: 'center',
        }}>
          {(['all', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s',
                background: filter === f 
                  ? 'linear-gradient(135deg, #00f5ff, #00d4aa)' 
                  : 'rgba(255,255,255,0.1)',
                color: filter === f ? '#0f0c29' : '#fff',
              }}
            >
              {f === 'all' && `📋 All (${totalCount})`}
              {f === 'pending' && `⏳ Pending (${totalCount - completedCount})`}
              {f === 'completed' && `✅ Completed (${completedCount})`}
            </button>
          ))}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              marginLeft: 'auto',
              padding: '8px 18px',
              borderRadius: '20px',
              border: '1px solid rgba(0,245,255,0.4)',
              cursor: refreshing ? 'default' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.2s',
              background: 'rgba(0,245,255,0.1)',
              color: '#00f5ff',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
          </button>
        </div>

        {/* Tests Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>?</div>
            Loading tests...
          </div>
        ) : filteredTests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>
              {filter === 'completed' ? '📭' : visibleTestIds.size === 0 && tests.length === 0 ? '🔒' : '🎉'}
            </div>
            {visibleTestIds.size === 0 && tests.length === 0 
              ? "No tests are currently available. Your teacher will make tests visible soon!"
              : filter === 'completed' 
              ? "You haven't completed any tests yet. Start one below!"
              : filter === 'pending'
              ? "Great job! You've completed all available tests!"
              : "No tests available at the moment."}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {Object.entries(testsBySubject).map(([subject, subjectTests]) => (
              <div key={subject} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  onClick={() => toggleSubject(subject)}
                  aria-expanded={!collapsedSubjects[subject]}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px' }}>{subject === 'Chemistry' ? '🧪' : subject === 'Biology' ? '🧬' : subject === 'Travel & Tourism' ? '🧭' : '📖'}</span>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>{subject}</h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                          {subjectTests.length} test{subjectTests.length !== 1 ? 's' : ''} available
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>
                      {collapsedSubjects[subject] ? '▼' : '▲'}
                    </span>
                  </div>
                </button>
                {!collapsedSubjects[subject] && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px',
                  }}>
                    {subjectTests.map(test => {
                      const isChemistryTest = test.subject === 'Chemistry';
                      const chemistryReportReady = isChemistryTest && test.isCompleted && test.scoresReleased;
                      const chemistryLocked = isChemistryTest && test.isCompleted && !test.scoresReleased;
                      const actionLabel = test.isCompleted
                        ? (isChemistryTest ? (chemistryReportReady ? '📊 View Detailed Answers' : '✅ Submitted') : '📄 Retake Test')
                        : '▶️ Start Test';
                      return (
                      <div
                        key={test.id}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '16px',
                          overflow: 'hidden',
                          border: test.isCompleted 
                            ? '2px solid #22c55e' 
                            : '1px solid rgba(255,255,255,0.1)',
                          transition: 'all 0.3s',
                        }}
                      >
                        {/* Test Header */}
                        <div style={{
                          background: test.isCompleted 
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #667eea, #764ba2)',
                          padding: '20px',
                          position: 'relative',
                          paddingRight: test.isCompleted ? '120px' : '20px',
                        }}>
                          {test.isCompleted && (
                            <div style={{
                              position: 'absolute',
                              top: '12px',
                              right: '12px',
                              background: '#fff',
                              color: '#22c55e',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                            }}>
                              ✓ COMPLETED
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '32px' }}>{getCategoryIcon(test.category)}</span>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                                {test.name}
                              </h3>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: 'rgba(255,255,255,0.2)',
                                }}>
                                  {test.category}
                                </span>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: getDifficultyColor(test.difficulty),
                                  color: '#fff',
                                }}>
                                  {test.difficulty}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Test Body */}
                        <div style={{ padding: '20px' }}>
                          <p style={{
                            margin: '0 0 15px',
                            fontSize: '13px',
                            color: 'rgba(255,255,255,0.7)',
                            lineHeight: 1.5,
                          }}>
                            {test.description}
                          </p>

                          <div style={{
                            display: 'flex',
                            gap: '15px',
                            marginBottom: '15px',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.6)',
                          }}>
                            <span>⏱️ {test.duration}</span>
                            <span>📝 {test.category === 'Writing' ? '2 parts' : `${test.totalQuestions} questions`}</span>
                          </div>

                          {test.isCompleted && (
                            <div style={{
                              background: test.isAwaitingMarking 
                                ? 'rgba(245,158,11,0.1)' 
                                : 'rgba(34,197,94,0.1)',
                              borderRadius: '10px',
                              padding: '12px',
                              marginBottom: '15px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                                  Status:
                                </span>
                                <span style={{
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                                  color: test.isAwaitingMarking
                                    ? '#f59e0b'
                                    : chemistryLocked
                                      ? '#f59e0b'
                                      : '#22c55e',
                                }}>
                                  {test.isAwaitingMarking
                                    ? '⏳ Awaiting Marking'
                                    : chemistryLocked
                                      ? '🔒 Awaiting Release'
                                      : '✅ Completed'}
                                </span>
                              </div>
                              {test.completedAt && (
                                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                                  {test.isAwaitingMarking ? 'Submitted:' : 'Completed:'} {new Date(test.completedAt).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                              )}
                              {chemistryLocked && (
                                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
                                  Detailed report will unlock once your teacher releases the results.
                                </p>
                              )}
                              
                              {/* View Feedback button for marked writing tests */}
                              {test.requiresMarking && /^Cambridge Writing Test/i.test(test.name) && test.feedbackReleased && !test.isAwaitingMarking && test.isCompleted && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    viewWritingFeedback(test);
                                  }}
                                  style={{
                                    marginTop: '10px',
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #00f5ff',
                                    background: 'transparent',
                                    color: '#00f5ff',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                  }}
                                >
                                  📝 View Teacher Feedback
                                </button>
                              )}

                              {/* View Detailed Answers button for completed tests with released scores */}
                              {!test.requiresMarking && test.isCompleted && test.scoresReleased && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    viewDetailedAnswers(test);
                                  }}
                                  style={{
                                    marginTop: '10px',
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #00f5ff',
                                    background: 'linear-gradient(135deg, rgba(0,245,255,0.12), rgba(0,212,170,0.12))',
                                    color: '#00f5ff',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                  }}
                                >
                                  🔍 View Detailed Answers
                                </button>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => chemistryReportReady ? viewDetailedAnswers(test) : handleStartTest(test)}
                            disabled={chemistryLocked}
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: '10px',
                              border: 'none',
                              cursor: chemistryLocked ? 'not-allowed' : 'pointer',
                              fontSize: '14px',
                              fontWeight: 600,
                              transition: 'all 0.2s',
                              background: test.isCompleted
                                ? 'rgba(255,255,255,0.1)'
                                : 'linear-gradient(135deg, #00f5ff, #00d4aa)',
                              color: test.isCompleted ? '#fff' : '#0f0c29',
                              opacity: chemistryLocked ? 0.7 : 1,
                            }}
                          >
                            {actionLabel}
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Coming Soon Notice */}
        <div style={{
          marginTop: '40px',
          textAlign: 'center',
          padding: '30px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          border: '1px dashed rgba(255,255,255,0.2)',
        }}>
          <span style={{ fontSize: '32px' }}>🚀</span>
          <h4 style={{ margin: '10px 0 5px', color: '#fff', fontSize: '16px' }}>More Tests Coming Soon!</h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
            We're adding new Cambridge tests regularly. Check back for more practice opportunities!
          </p>
        </div>
      </div>

      {/* Writing Feedback Modal */}
      {showFeedbackModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(0,245,255,0.3)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
                📝 Writing Test Feedback
              </h3>
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackData(null);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', overflowY: 'auto' }}>
              {feedbackLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '15px' }}>⏳</div>
                  <p style={{ color: 'rgba(255,255,255,0.7)' }}>Loading feedback...</p>
                </div>
              ) : !feedbackData ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
                  <h4 style={{ color: '#fff', marginBottom: '10px' }}>Feedback Not Yet Available</h4>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                    Your teacher has marked your work but hasn't released the detailed feedback yet.
                    Check back later!
                  </p>
                </div>
              ) : (
                <>
                  {/* Score Summary */}
                  <div style={{
                    background: 'rgba(0,245,255,0.1)',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '20px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#00f5ff' }}>
                      {feedbackData.score}/35
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                      Total Score ({feedbackData.percentage}%)
                    </div>
                    <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.14)', borderRadius: '999px', height: '12px', overflow: 'hidden' }}>
                      <div style={{ width: `${feedbackData.percentage}%`, background: getProgressBarColor(feedbackData.percentage), height: '100%', transition: 'width 350ms ease' }} />
                    </div>
                  </div>
                  {feedbackHistory.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '12px', marginBottom: '20px' }}>
                      <h5 style={{ margin: '0 0 10px', color: '#fff', fontSize: '14px' }}>📚 Earlier Submissions Timeline</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {feedbackHistory.map((item, index) => {
                          const prev = feedbackHistory[index + 1];
                          const trend = !prev ? '—' : item.percentage > prev.percentage ? '↑' : item.percentage < prev.percentage ? '↓' : '→';
                          return (
                            <div key={`${item.submittedAt}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr .8fr .5fr', gap: '8px', alignItems: 'center', color: 'rgba(255,255,255,0.9)', fontSize: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px' }}>
                              <span>{new Date(item.submittedAt).toLocaleDateString()}</span>
                              <span>{item.score}/35</span>
                              <span>{item.percentage}%</span>
                              <span>G:{item.grammarIssues} • P:{item.punctuationIssues}</span>
                              <span style={{ color: trend === '↑' ? '#4ade80' : trend === '↓' ? '#f87171' : '#cbd5e1' }}>{trend}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Part Selector Tabs */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px',
                  }}>
                    <button
                      onClick={() => setActiveFeedbackPart('part1')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: activeFeedbackPart === 'part1' ? '2px solid #00f5ff' : '1px solid rgba(255,255,255,0.2)',
                        background: activeFeedbackPart === 'part1' ? 'rgba(0,245,255,0.1)' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Part 1: Message
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                        {feedbackData.part1.content + feedbackData.part1.organisation + feedbackData.part1.language}/15
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveFeedbackPart('part2')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: activeFeedbackPart === 'part2' ? '2px solid #00f5ff' : '1px solid rgba(255,255,255,0.2)',
                        background: activeFeedbackPart === 'part2' ? 'rgba(0,245,255,0.1)' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Part 2: Essay
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                        {feedbackData.part2.content + feedbackData.part2.communicativeAchievement + feedbackData.part2.organisation + feedbackData.part2.language}/20
                      </div>
                    </button>
                  </div>

                  {/* Spelling Mistakes */}
                  {((activeFeedbackPart === 'part1' ? feedbackData.part1.spellingMistakes : feedbackData.part2.spellingMistakes) || []).length > 0 && (
                    <div style={{
                      background: '#fef2f2',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fecaca',
                    }}>
                      <h5 style={{ margin: '0 0 12px', color: '#991b1b', fontSize: '14px', fontWeight: 'bold' }}>
                        🔤 Spelling Mistakes ({(activeFeedbackPart === 'part1' ? feedbackData.part1.spellingMistakes : feedbackData.part2.spellingMistakes)?.length || 0})
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(activeFeedbackPart === 'part1' ? feedbackData.part1.spellingMistakes : feedbackData.part2.spellingMistakes)?.map((m, i) => (
                          <div key={i} style={{
                            background: '#fff',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                          }}>
                            <div style={{ marginBottom: '4px' }}>
                              <span style={{ color: '#dc2626', textDecoration: 'line-through', fontWeight: 500 }}>{m.wrong}</span>
                              <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>{m.correct}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>{m.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grammar + Punctuation Mistakes */}
                  {(() => {
                    const issueList = (activeFeedbackPart === 'part1' ? feedbackData.part1.grammarMistakes : feedbackData.part2.grammarMistakes) || [];
                    const { grammar, punctuation } = classifyGrammarAndPunctuation(issueList);
                    if (issueList.length === 0) return null;
                    return (
                    <div style={{
                      background: '#fefce8',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fde047',
                    }}>
                      <h5 style={{ margin: '0 0 12px', color: '#854d0e', fontSize: '14px', fontWeight: 'bold' }}>📝 Grammar & Punctuation Issues ({issueList.length})</h5>
                      {grammar.length > 0 && <p style={{ margin: '0 0 8px', color: '#713f12', fontSize: '12px' }}>Grammar issues: {grammar.length}</p>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {grammar.map((m, i) => (
                          <div key={i} style={{
                            background: '#fff',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                          }}>
                            <div style={{ marginBottom: '4px' }}>
                              <span style={{ color: '#dc2626', textDecoration: 'line-through', fontWeight: 500 }}>{m.wrong}</span>
                              <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>{m.correct}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>{m.explanation}</p>
                          </div>
                        ))}
                      </div>
                      {punctuation.length > 0 && (
                        <>
                          <p style={{ margin: '12px 0 8px', color: '#713f12', fontSize: '12px' }}>Punctuation/capitalization issues: {punctuation.length}</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {punctuation.map((m, i) => (
                              <div key={`p-${i}`} style={{ background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                <div style={{ marginBottom: '4px' }}>
                                  <span style={{ color: '#dc2626', textDecoration: 'line-through', fontWeight: 500 }}>{m.wrong}</span>
                                  <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
                                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{m.correct}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>{m.explanation}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })()}

                  {/* Mark Justifications */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications) && (
                    <div style={{
                      background: '#eff6ff',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #bfdbfe',
                    }}>
                      <h5 style={{ margin: '0 0 12px', color: '#1e40af', fontSize: '14px', fontWeight: 'bold' }}>
                        📊 Why You Received These Marks
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <strong style={{ color: '#374151' }}>Content:</strong>
                          <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                            {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications)?.content}
                          </p>
                        </div>
                        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <strong style={{ color: '#374151' }}>Organisation:</strong>
                          <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                            {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications)?.organisation}
                          </p>
                        </div>
                        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <strong style={{ color: '#374151' }}>Language:</strong>
                          <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                            {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications)?.language}
                          </p>
                        </div>
                        {activeFeedbackPart === 'part2' && feedbackData.part2.markJustifications?.communicativeAchievement && (
                          <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                            <strong style={{ color: '#374151' }}>Communicative Achievement:</strong>
                            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                              {feedbackData.part2.markJustifications.communicativeAchievement}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scores Breakdown */}
                  <div style={{
                    background: '#f5f5f5',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '20px',
                    color: '#000',
                  }}>
                    <h5 style={{ margin: '0 0 12px', color: '#000', fontSize: '14px' }}>📈 Score Breakdown</h5>
                    {activeFeedbackPart === 'part1' ? (
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.content}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Content</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.organisation}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Organisation</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.language}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Language</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.content}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Content</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.communicativeAchievement}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Comm. Ach.</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.organisation}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Organisation</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.language}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Language</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Your Original Writing */}
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '15px',
                    color: '#000',
                  }}>
                    <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>📝 Your Original Writing</h5>
                    <div style={{
                      background: '#fff',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#000',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {activeFeedbackPart === 'part1' ? feedbackData.part1.original : feedbackData.part2.original}
                    </div>
                  </div>

                  {/* Teacher Feedback */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.feedback : feedbackData.part2.feedback) && (
                    <div style={{
                      background: '#fff7ed',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fed7aa',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>💬 Teacher's Comments</h5>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {activeFeedbackPart === 'part1' ? feedbackData.part1.feedback : feedbackData.part2.feedback}
                      </div>
                    </div>
                  )}

                  {/* Corrected Version */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.corrected : feedbackData.part2.corrected) && (
                    <div style={{
                      background: '#ecfdf3',
                      borderRadius: '12px',
                      padding: '15px',
                      border: '1px solid #bbf7d0',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>? Improved Version</h5>
                      <div style={{
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {activeFeedbackPart === 'part1' ? feedbackData.part1.corrected : feedbackData.part2.corrected}
                      </div>
                      <p style={{
                        margin: '10px 0 0',
                        fontSize: '11px',
                        color: '#000',
                        fontStyle: 'italic',
                      }}>
                        💡 Compare this with your original to see how you can improve your writing!
                      </p>
                    </div>
                  )}

                  {/* Overall Comments */}
                  {feedbackData.overallComments && (
                    <div style={{
                      background: '#f0f9ff',
                      borderRadius: '12px',
                      padding: '15px',
                      marginTop: '15px',
                      border: '1px solid #bae6fd',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>📝 Overall Comments</h5>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {feedbackData.overallComments}
                      </div>
                    </div>
                  )}

                  {/* Marked By Info */}
                  {feedbackData.markedBy && (
                    <div style={{
                      marginTop: '15px',
                      padding: '10px',
                      background: '#f3f4f6',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#6b7280',
                      textAlign: 'center',
                    }}>
                      Marked by <strong style={{ color: '#374151' }}>{feedbackData.markedBy.replace(/\s*\(AI\)\s*/gi, '')}</strong>
                      {feedbackData.markedAt && (
                        <span> on {new Date(feedbackData.markedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Professional Student Report Modal */}
      {showStudentReport && studentReportData && (
        <ProfessionalCambridgeReport
          data={studentReportData}
          onClose={() => {
            setShowStudentReport(false);
            setStudentReportData(null);
          }}
          isTeacherView={false}
        />
      )}
    </div>
  );
};

export default CambridgeTestsHub;
