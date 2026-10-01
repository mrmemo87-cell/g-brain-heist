import type * as GameService from './gameService';

export type CurriculumSubjectExperienceKey =
  | 'english'
  | 'mathematics'
  | 'science'
  | 'global-perspectives'
  | 'digital-technology'
  | 'geography'
  | 'modern-languages'
  | 'travel-tourism'
  | 'economics'
  | 'generic';

export interface CurriculumSubjectDimensionCopy {
  title: string;
  description: string;
}

export interface CurriculumSubjectExperience {
  key: CurriculumSubjectExperienceKey;
  subjectName: string;
  eyebrow: string;
  headline: string;
  intro: string;
  radarTitle: string;
  radarDescription: string;
  contentDimension: CurriculumSubjectDimensionCopy;
  reasoningDimension: CurriculumSubjectDimensionCopy;
  barrierLabel: string;
  classroomMoveLabel: string;
  reteachLabel: string;
  reassessmentLabel: string;
  assessmentLensLabel: string;
  navigatorTitle: string;
  navigatorDescription: string;
  selectedLeafPrompt: string;
  noHotspotTitle: string;
  noHotspotDescription: string;
  searchPlaceholder: string;
  reasoningStrandPatterns: RegExp[];
}

const profiles: Record<CurriculumSubjectExperienceKey, CurriculumSubjectExperience> = {
  english: {
    key: 'english',
    subjectName: 'English',
    eyebrow: 'English curriculum intelligence',
    headline: 'See how students understand, communicate and control language — not just their total mark.',
    intro: 'Separate language knowledge from reading, writing, listening and speaking evidence so the next lesson targets the real barrier.',
    radarTitle: 'What should I teach next in English?',
    radarDescription: 'Persistent language and communication needs rise first. Improving skills stay visible so reteaching is precise rather than repetitive.',
    contentDimension: {
      title: 'Language knowledge',
      description: 'Grammar, vocabulary, sentence control, form and language accuracy.',
    },
    reasoningDimension: {
      title: 'Communication & comprehension',
      description: 'Reading, writing, listening, speaking, inference, organisation and purposeful response.',
    },
    barrierLabel: 'Likely language barrier to test',
    classroomMoveLabel: 'English classroom move',
    reteachLabel: 'Four-step teaching sequence',
    reassessmentLabel: 'Reassess independently',
    assessmentLensLabel: 'Communication & marking lens',
    navigatorTitle: 'English curriculum map',
    navigatorDescription: 'Move from strand → skill → subskill and inspect the evidence behind each language outcome.',
    selectedLeafPrompt: 'Select an English subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified English hotspot yet.',
    noHotspotDescription: 'That does not mean the class has no language needs. It means current governed evidence is not strong enough to justify a class-level teaching priority yet.',
    searchPlaceholder: 'Search reading, writing, grammar, vocabulary…',
    reasoningStrandPatterns: [/^eng.(reading|writing|listening|speaking)$/],
  },
  mathematics: {
    key: 'mathematics',
    subjectName: 'Mathematics',
    eyebrow: 'Mathematics curriculum intelligence',
    headline: 'See which methods are secure, where reasoning breaks down, and which mathematical idea needs the next lesson.',
    intro: 'Keep mathematical knowledge separate from thinking and working mathematically so a procedural error is not confused with a reasoning gap.',
    radarTitle: 'What should I reteach next in Mathematics?',
    radarDescription: 'Recurring method errors and mathematical-reasoning gaps are prioritised from governed evidence across the class.',
    contentDimension: {
      title: 'Mathematical knowledge & methods',
      description: 'Number, algebra, geometry, measure, statistics, probability and reliable procedures.',
    },
    reasoningDimension: {
      title: 'Thinking & working mathematically',
      description: 'Problem solving, modelling, representation, justification, reasoning and checking.',
    },
    barrierLabel: 'Likely mathematical barrier to test',
    classroomMoveLabel: 'Maths classroom move',
    reteachLabel: 'Four-step reteach',
    reassessmentLabel: 'Reassess with a fresh problem',
    assessmentLensLabel: 'Mathematical reasoning lens',
    navigatorTitle: 'Mathematics curriculum map',
    navigatorDescription: 'Trace each mathematical strand into precise skills, subskills and evidence targets.',
    selectedLeafPrompt: 'Select a Maths subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Mathematics hotspot yet.',
    noHotspotDescription: 'The class may still need support, but the current governed evidence does not yet justify a shared reteach priority.',
    searchPlaceholder: 'Search algebra, number, geometry, probability…',
    reasoningStrandPatterns: [/^math.mathematical-practice$/],
  },
  science: {
    key: 'science',
    subjectName: 'Science',
    eyebrow: 'Science curriculum intelligence',
    headline: 'Separate scientific knowledge from practical, data and evidence reasoning so the next teaching move is clear.',
    intro: 'Track Biology, Chemistry and Physics knowledge alongside the scientific practices students need to explain, investigate and interpret evidence.',
    radarTitle: 'What should I reteach next in Science?',
    radarDescription: 'Conceptual gaps and scientific-practice needs are prioritised separately from governed classroom evidence.',
    contentDimension: {
      title: 'Scientific knowledge',
      description: 'Biology, Chemistry, Physics, Earth and Space concepts, processes and relationships.',
    },
    reasoningDimension: {
      title: 'Scientific practice & reasoning',
      description: 'Variables, investigations, data interpretation, evidence, evaluation and science in context.',
    },
    barrierLabel: 'Likely scientific misconception to test',
    classroomMoveLabel: 'Science classroom move',
    reteachLabel: 'Four-step teaching sequence',
    reassessmentLabel: 'Reassess with fresh evidence',
    assessmentLensLabel: 'Scientific reasoning lens',
    navigatorTitle: 'Science curriculum map',
    navigatorDescription: 'See where scientific concepts and scientific-practice evidence sit across the class.',
    selectedLeafPrompt: 'Select a Science subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Science hotspot yet.',
    noHotspotDescription: 'No class-level priority is justified by current governed evidence yet; continue normal assessment before drawing conclusions.',
    searchPlaceholder: 'Search biology, chemistry, physics, investigation…',
    reasoningStrandPatterns: [/^science.(scientific-practice|context)$/],
  },
  'global-perspectives': {
    key: 'global-perspectives',
    subjectName: 'Global Perspectives',
    eyebrow: 'Global Perspectives intelligence',
    headline: 'See how students research, analyse, evaluate and communicate — with evidence for each thinking skill.',
    intro: 'Distinguish evidence gathering and analysis from evaluation, reflection and communication so intervention targets the actual thinking process.',
    radarTitle: 'What should I teach next in Global Perspectives?',
    radarDescription: 'The radar surfaces recurring research, analysis, evaluation and communication needs without reducing the subject to one overall score.',
    contentDimension: {
      title: 'Research & analysis',
      description: 'Questions, sources, evidence selection, interpretation and analytical comparison.',
    },
    reasoningDimension: {
      title: 'Evaluation & communication',
      description: 'Credibility, judgement, reflection, collaboration and communicating a reasoned position.',
    },
    barrierLabel: 'Likely thinking barrier to test',
    classroomMoveLabel: 'Global Perspectives classroom move',
    reteachLabel: 'Four-step thinking sequence',
    reassessmentLabel: 'Reassess with a new source/context',
    assessmentLensLabel: 'Critical-thinking lens',
    navigatorTitle: 'Global Perspectives skills map',
    navigatorDescription: 'Follow the subject from research and analysis into evaluation, communication and reflection.',
    selectedLeafPrompt: 'Select a Global Perspectives subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Global Perspectives hotspot yet.',
    noHotspotDescription: 'Current governed evidence does not yet justify a shared thinking-skill priority for the class.',
    searchPlaceholder: 'Search research, sources, evaluation, reflection…',
    reasoningStrandPatterns: [/^gp.(evaluation|communication|reflection|collaboration)$/],
  },
  'digital-technology': {
    key: 'digital-technology',
    subjectName: 'Digital Technology',
    eyebrow: 'Digital Technology intelligence',
    headline: 'See what students know about digital systems and how well they can apply computational thinking to real tasks.',
    intro: 'Separate technical knowledge from programming and computational practice so the next lesson targets understanding or application accurately.',
    radarTitle: 'What should I reteach next in Digital Technology?',
    radarDescription: 'The radar separates technical knowledge gaps from computational-thinking and creation problems.',
    contentDimension: {
      title: 'Technical knowledge',
      description: 'Systems, data, networks, security, digital literacy and core computing concepts.',
    },
    reasoningDimension: {
      title: 'Computational thinking & creation',
      description: 'Decomposition, algorithms, programming, testing, debugging and solution design.',
    },
    barrierLabel: 'Likely technical barrier to test',
    classroomMoveLabel: 'Digital classroom move',
    reteachLabel: 'Four-step build sequence',
    reassessmentLabel: 'Reassess with a new task',
    assessmentLensLabel: 'Computational-thinking lens',
    navigatorTitle: 'Digital Technology curriculum map',
    navigatorDescription: 'Track technical concepts separately from computational thinking and programming evidence.',
    selectedLeafPrompt: 'Select a Digital Technology subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Digital Technology hotspot yet.',
    noHotspotDescription: 'The current governed evidence does not yet justify a class-level technical or computational priority.',
    searchPlaceholder: 'Search programming, data, networks, security…',
    reasoningStrandPatterns: [/^digital.(computational-thinking|programming)$/],
  },
  geography: {
    key: 'geography',
    subjectName: 'Geography',
    eyebrow: 'Geography curriculum intelligence',
    headline: 'See what students understand about places and processes, and where geographical skills or enquiry need strengthening.',
    intro: 'Keep geographical knowledge separate from map, data, fieldwork and enquiry skills so reteaching is specific.',
    radarTitle: 'What should I reteach next in Geography?',
    radarDescription: 'Physical and human geography needs are separated from geographical skills and enquiry evidence.',
    contentDimension: {
      title: 'Geographical knowledge',
      description: 'Places, physical processes, human systems, environments and sustainability.',
    },
    reasoningDimension: {
      title: 'Geographical skills & enquiry',
      description: 'Maps, graphs, data, fieldwork, evidence, interpretation and geographical investigation.',
    },
    barrierLabel: 'Likely geographical misconception to test',
    classroomMoveLabel: 'Geography classroom move',
    reteachLabel: 'Four-step teaching sequence',
    reassessmentLabel: 'Reassess with a new place/data set',
    assessmentLensLabel: 'Geographical-thinking lens',
    navigatorTitle: 'Geography curriculum map',
    navigatorDescription: 'Move from geographical content into the skills and enquiry evidence students need to use it.',
    selectedLeafPrompt: 'Select a Geography subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Geography hotspot yet.',
    noHotspotDescription: 'Current governed evidence does not yet justify a shared geographical teaching priority.',
    searchPlaceholder: 'Search physical, human, maps, fieldwork…',
    reasoningStrandPatterns: [/^geo.(enquiry|skills)$/],
  },
  'modern-languages': {
    key: 'modern-languages',
    subjectName: 'Modern Languages',
    eyebrow: 'Modern Languages intelligence',
    headline: 'See whether students need more language knowledge or more support using the language to communicate.',
    intro: 'Separate grammar and vocabulary knowledge from listening, reading, speaking and writing performance.',
    radarTitle: 'What should I teach next in this language?',
    radarDescription: 'The radar distinguishes language-form gaps from communication and comprehension needs.',
    contentDimension: {
      title: 'Language knowledge',
      description: 'Grammar, vocabulary, structures and cultural understanding.',
    },
    reasoningDimension: {
      title: 'Communication skills',
      description: 'Listening, reading, speaking and writing with meaning, accuracy and purpose.',
    },
    barrierLabel: 'Likely language barrier to test',
    classroomMoveLabel: 'Language classroom move',
    reteachLabel: 'Four-step language sequence',
    reassessmentLabel: 'Reassess in a fresh context',
    assessmentLensLabel: 'Communication lens',
    navigatorTitle: 'Language curriculum map',
    navigatorDescription: 'Track grammar and vocabulary separately from receptive and productive communication.',
    selectedLeafPrompt: 'Select a language subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified language hotspot yet.',
    noHotspotDescription: 'Current governed evidence does not yet justify a shared class priority in language knowledge or communication.',
    searchPlaceholder: 'Search grammar, vocabulary, listening, speaking…',
    reasoningStrandPatterns: [/^mfl.(listening|reading|speaking|writing)$/],
  },
  'travel-tourism': {
    key: 'travel-tourism',
    subjectName: 'Travel & Tourism',
    eyebrow: 'Travel & Tourism intelligence',
    headline: 'See which industry concepts are secure and where students need stronger analysis, judgement or customer-facing application.',
    intro: 'Separate tourism-industry knowledge from applied research, sustainability and decision-making evidence.',
    radarTitle: 'What should I reteach next in Travel & Tourism?',
    radarDescription: 'The radar highlights recurring industry-knowledge and applied-analysis needs from governed evidence.',
    contentDimension: {
      title: 'Industry knowledge',
      description: 'Destinations, products, customer service, operations, marketing and tourism systems.',
    },
    reasoningDimension: {
      title: 'Applied analysis & judgement',
      description: 'Research, evidence use, sustainability trade-offs, customer scenarios and justified decisions.',
    },
    barrierLabel: 'Likely industry-thinking barrier to test',
    classroomMoveLabel: 'Travel & Tourism classroom move',
    reteachLabel: 'Four-step applied sequence',
    reassessmentLabel: 'Reassess with a new industry scenario',
    assessmentLensLabel: 'Industry-application lens',
    navigatorTitle: 'Travel & Tourism curriculum map',
    navigatorDescription: 'Track industry knowledge alongside the applied analysis students need in realistic tourism contexts.',
    selectedLeafPrompt: 'Select a Travel & Tourism subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Travel & Tourism hotspot yet.',
    noHotspotDescription: 'Current governed evidence does not yet justify a shared class priority.',
    searchPlaceholder: 'Search customers, destinations, marketing, sustainability…',
    reasoningStrandPatterns: [/^travel.(research-analysis|impacts-sustainability)$/],
  },
  economics: {
    key: 'economics',
    subjectName: 'Economics',
    eyebrow: 'Economics curriculum intelligence',
    headline: 'See what students know, how they reason economically, and what should be taught next.',
    intro: 'Separate Economics content from application, data use, causal chains, evaluation and judgement.',
    radarTitle: 'What should I reteach next in Economics?',
    radarDescription: 'Persistent and recurring Economics needs rise first while improving evidence stays visible.',
    contentDimension: {
      title: 'Economics content',
      description: 'Concepts, mechanisms, diagrams and calculations.',
    },
    reasoningDimension: {
      title: 'Exam & economic reasoning',
      description: 'Application, data use, causal chains, evaluation and judgement.',
    },
    barrierLabel: 'Likely misconception to test',
    classroomMoveLabel: 'Economics classroom move',
    reteachLabel: 'Four-step reteach',
    reassessmentLabel: 'Reassess independently',
    assessmentLensLabel: 'Examiner lens',
    navigatorTitle: 'Economics curriculum map',
    navigatorDescription: 'Move from syllabus content into precise economic skills, reasoning and Evidence Focus targets.',
    selectedLeafPrompt: 'Select an Economics subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified Economics hotspot yet.',
    noHotspotDescription: 'That does not mean there is no weakness; current governed evidence does not yet justify a class-level reteach priority.',
    searchPlaceholder: 'Search demand, inflation, PED, evaluation…',
    reasoningStrandPatterns: [/^econ.reasoning$/],
  },
  generic: {
    key: 'generic',
    subjectName: 'Subject',
    eyebrow: 'Curriculum intelligence',
    headline: 'See what the class has evidenced, where learning is fragile, and what should be taught next.',
    intro: 'Separate subject knowledge from application and reasoning so intervention is based on evidence rather than one total score.',
    radarTitle: 'What should I teach next?',
    radarDescription: 'Persistent and recurring learning needs rise first while improving evidence stays visible.',
    contentDimension: {
      title: 'Subject knowledge',
      description: 'Core concepts, methods, vocabulary and curriculum knowledge.',
    },
    reasoningDimension: {
      title: 'Application & reasoning',
      description: 'Using knowledge in context, solving problems, analysing evidence and communicating a justified response.',
    },
    barrierLabel: 'Likely learning barrier to test',
    classroomMoveLabel: 'Classroom move',
    reteachLabel: 'Four-step reteach',
    reassessmentLabel: 'Reassess independently',
    assessmentLensLabel: 'Assessment lens',
    navigatorTitle: 'Curriculum map',
    navigatorDescription: 'Move from strand → skill → subskill and inspect the evidence behind each curriculum outcome.',
    selectedLeafPrompt: 'Select a curriculum subskill to inspect evidence readiness and its governed Evidence Focus.',
    noHotspotTitle: 'No qualified class hotspot yet.',
    noHotspotDescription: 'Current governed evidence does not yet justify a shared class-level teaching priority.',
    searchPlaceholder: 'Search curriculum skills and subskills…',
    reasoningStrandPatterns: [/.(reasoning|practice|skills|enquiry|analysis|evaluation|communication)$/],
  },
};

const registryVersionMap: Array<[RegExp, CurriculumSubjectExperienceKey]> = [
  [/bh-english-core/i, 'english'],
  [/bh-mathematics-core/i, 'mathematics'],
  [/bh-science-core/i, 'science'],
  [/bh-global-perspectives-core/i, 'global-perspectives'],
  [/bh-digital-technology-core/i, 'digital-technology'],
  [/bh-geography-core/i, 'geography'],
  [/bh-modern-languages-core/i, 'modern-languages'],
  [/bh-travel-tourism-core/i, 'travel-tourism'],
  [/bh-economics-core/i, 'economics'],
];

const subjectMatchers: Array<[RegExp, CurriculumSubjectExperienceKey]> = [
  [/(economics|economic studies)/i, 'economics'],
  [/(mathematics|maths|math)/i, 'mathematics'],
  [/(science|biology|chemistry|physics)/i, 'science'],
  [/(global perspectives?)/i, 'global-perspectives'],
  [/(digital technology|digital literacy|ict|computing|computer science)/i, 'digital-technology'],
  [/geograph/i, 'geography'],
  [/(english|esl|language arts)/i, 'english'],
  [/(french|german|spanish|russian|kyrgyz|modern languages?|mfl)/i, 'modern-languages'],
  [/(travel|tourism)/i, 'travel-tourism'],
];

export const resolveCurriculumSubjectExperience = (
  subjectLabel?: string | null,
  registryVersion?: string | null,
): CurriculumSubjectExperience => {
  const registryMatch = registryVersionMap.find(([pattern]) => pattern.test(registryVersion || ''));
  const subjectMatch = subjectMatchers.find(([pattern]) => pattern.test(subjectLabel || ''));
  const key = registryMatch?.[1] || subjectMatch?.[1] || 'generic';
  const base = profiles[key];
  if (key !== 'generic' || !subjectLabel?.trim()) return base;
  return {
    ...base,
    subjectName: subjectLabel.trim(),
    eyebrow: `${subjectLabel.trim()} curriculum intelligence`,
  };
};

export const curriculumDimensionForSubject = (
  leaf: Pick<GameService.TeacherAcademicSkillRegistryLeaf, 'strandCode' | 'strandName' | 'skillCode' | 'subskillCode'>,
  subjectKey: CurriculumSubjectExperienceKey,
): 'content' | 'reasoning' => {
  const profile = profiles[subjectKey] || profiles.generic;
  if (profile.reasoningStrandPatterns.some((pattern) => pattern.test(leaf.strandCode))) {
    return 'reasoning';
  }
  if (subjectKey === 'generic') {
    const searchable = [leaf.strandCode, leaf.strandName, leaf.skillCode, leaf.subskillCode].join(' ');
    if (profile.reasoningStrandPatterns.some((pattern) => pattern.test(searchable))) return 'reasoning';
  }
  return 'content';
};

export const curriculumSubjectProfiles = profiles;
