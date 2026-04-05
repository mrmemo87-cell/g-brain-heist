import { SupportedGenre, WeaknessTag } from './writingAssessment.js';

export type PromptDifficultyLevel = 'foundational' | 'core' | 'stretch';
export type WritingPromptFocusTag =
  | 'content_coverage'
  | 'weak_paragraphing'
  | 'tone_control'
  | 'recommendation'
  | 'storytelling'
  | 'evidence'
  | 'audience_awareness'
  | 'sequencing'
  | 'language_accuracy'
  | 'word_count_control';

export type WritingPromptContextTag =
  | 'school_event'
  | 'campaign'
  | 'student_life'
  | 'community'
  | 'ethics'
  | 'competition'
  | 'environment'
  | 'digital_life';

export interface StructuredWritingPrompt {
  id: string;
  genre: SupportedGenre;
  title: string;
  prompt_text: string;
  grade_band: string;
  target_word_count: number;
  difficulty_level: PromptDifficultyLevel;
  focus_tags: WritingPromptFocusTag[];
  context_tags: WritingPromptContextTag[];
}

export const FALLBACK_PROMPT_BY_GENRE: Record<SupportedGenre, string> = {
  essay:
    'Your school plans to cut one student program due to budget limits. Write an essay for the principal arguing which program should be protected, why it matters to students, and one realistic improvement to make it stronger.',
  story:
    'Write a short story about a student who makes a difficult choice during a school event. Show why that choice matters to the character and end with one change that could have led to a better outcome.',
  article:
    'Write a school newsletter article about a recent campus or community event. Explain why it mattered to readers and propose one practical improvement for next time.',
  review:
    'Write a review of a school or community event for younger students deciding whether to attend next time. Evaluate what worked, explain why it mattered, and recommend one specific improvement.',
  report:
    'Write a report for school leaders about a recent activity or campaign. Summarize key outcomes, explain why they mattered, and present one evidence-based recommendation for improvement.',
  email:
    'Write an email to an event organizer about an event you attended. Explain what impact it had, why that impact mattered, and suggest one clear improvement they could act on.',
  paragraph:
    'Write one focused paragraph for your class blog about an event that affected students. Explain why it mattered and include one concrete idea to make future events better.',
};

export const STRUCTURED_WRITING_PROMPT_BANK: StructuredWritingPrompt[] = [
  {
    id: 'sys-email-basic-event-thanks',
    genre: 'email',
    title: 'Event thank-you with one improvement',
    prompt_text:
      'Write an email to a school event organizer thanking them for a recent event. Mention two things that helped students and suggest one realistic improvement for next time.',
    grade_band: '6-8',
    target_word_count: 90,
    difficulty_level: 'foundational',
    focus_tags: ['tone_control', 'content_coverage', 'recommendation'],
    context_tags: ['school_event', 'student_life'],
  },
  {
    id: 'sys-email-core-campaign-followup',
    genre: 'email',
    title: 'Campaign follow-up request',
    prompt_text:
      'Write an email to the student council after a school campaign. Explain what impact the campaign had, identify one problem that remained, and request one specific follow-up action.',
    grade_band: '8-10',
    target_word_count: 120,
    difficulty_level: 'core',
    focus_tags: ['audience_awareness', 'tone_control', 'recommendation'],
    context_tags: ['campaign', 'community'],
  },
  {
    id: 'sys-email-stretch-community-partnership',
    genre: 'email',
    title: 'Community partnership proposal email',
    prompt_text:
      'Write a formal email to a local community partner proposing a joint student project. Present the project purpose, expected benefits, and one evidence-based reason they should support it.',
    grade_band: '10-12',
    target_word_count: 170,
    difficulty_level: 'stretch',
    focus_tags: ['tone_control', 'evidence', 'audience_awareness'],
    context_tags: ['community', 'competition'],
  },
  {
    id: 'sys-article-basic-student-life-update',
    genre: 'article',
    title: 'Student life event article',
    prompt_text:
      'Write a short school article about a student-life event this month. Describe what happened, why it mattered to students, and one improvement for the next event.',
    grade_band: '6-8',
    target_word_count: 100,
    difficulty_level: 'foundational',
    focus_tags: ['content_coverage', 'recommendation'],
    context_tags: ['student_life', 'school_event'],
  },
  {
    id: 'sys-article-core-community-awareness',
    genre: 'article',
    title: 'Community awareness article',
    prompt_text:
      'Write an article for your school website about a community awareness campaign. Explain the campaign goal, summarize outcomes, and recommend one next-step action for readers.',
    grade_band: '8-10',
    target_word_count: 130,
    difficulty_level: 'core',
    focus_tags: ['content_coverage', 'audience_awareness', 'recommendation'],
    context_tags: ['campaign', 'community'],
  },
  {
    id: 'sys-article-stretch-ethics-analysis',
    genre: 'article',
    title: 'Ethics issue analysis article',
    prompt_text:
      'Write an article analyzing an ethics-related issue in school digital life. Compare two viewpoints, evaluate likely effects on students, and argue for one balanced school policy.',
    grade_band: '10-12',
    target_word_count: 180,
    difficulty_level: 'stretch',
    focus_tags: ['evidence', 'audience_awareness', 'content_coverage'],
    context_tags: ['ethics', 'digital_life'],
  },
  {
    id: 'sys-review-basic-club-event',
    genre: 'review',
    title: 'Club event recommendation review',
    prompt_text:
      'Write a review for younger students about a school club event. Explain what worked well, what could be better, and whether you recommend attending next time.',
    grade_band: '6-8',
    target_word_count: 100,
    difficulty_level: 'foundational',
    focus_tags: ['recommendation', 'content_coverage', 'tone_control'],
    context_tags: ['school_event', 'student_life'],
  },
  {
    id: 'sys-review-core-competition-experience',
    genre: 'review',
    title: 'Competition experience review',
    prompt_text:
      'Write a review of a recent student competition for your school newsletter. Judge organization, fairness, and learning value, then give one clear recommendation for improvement.',
    grade_band: '8-10',
    target_word_count: 130,
    difficulty_level: 'core',
    focus_tags: ['evidence', 'recommendation', 'content_coverage'],
    context_tags: ['competition', 'school_event'],
  },
  {
    id: 'sys-review-stretch-community-program',
    genre: 'review',
    title: 'Community program review with criteria',
    prompt_text:
      'Write a formal review of a community youth program for school leaders. Evaluate it against clear criteria and conclude with a justified recommendation to continue, change, or stop the program.',
    grade_band: '10-12',
    target_word_count: 180,
    difficulty_level: 'stretch',
    focus_tags: ['evidence', 'tone_control', 'recommendation'],
    context_tags: ['community', 'ethics'],
  },
  {
    id: 'sys-story-basic-school-choice',
    genre: 'story',
    title: 'School choice turning point story',
    prompt_text:
      'Write a story about a student who must choose between helping a friend and following school rules during an event. Show the decision and ending clearly.',
    grade_band: '6-8',
    target_word_count: 100,
    difficulty_level: 'foundational',
    focus_tags: ['storytelling', 'sequencing', 'content_coverage'],
    context_tags: ['school_event', 'ethics'],
  },
  {
    id: 'sys-story-core-campaign-consequence',
    genre: 'story',
    title: 'Campaign consequence story',
    prompt_text:
      'Write a story about a student campaign that unexpectedly goes wrong. Build a clear sequence of events, show the main character’s growth, and end with a realistic solution.',
    grade_band: '8-10',
    target_word_count: 140,
    difficulty_level: 'core',
    focus_tags: ['storytelling', 'sequencing', 'recommendation'],
    context_tags: ['campaign', 'student_life'],
  },
  {
    id: 'sys-story-stretch-community-ethics',
    genre: 'story',
    title: 'Community ethics dilemma story',
    prompt_text:
      'Write a story in which a student team discovers an unfair practice during a community competition. Develop tension, present a moral choice, and resolve the conflict with reflection.',
    grade_band: '10-12',
    target_word_count: 190,
    difficulty_level: 'stretch',
    focus_tags: ['storytelling', 'sequencing', 'audience_awareness'],
    context_tags: ['community', 'competition', 'ethics'],
  },
  {
    id: 'sys-essay-basic-school-policy',
    genre: 'essay',
    title: 'School policy argument essay',
    prompt_text:
      'Write an essay arguing whether your school should change one student-life policy. Give your position, support it with reasons, and provide one practical recommendation.',
    grade_band: '6-8',
    target_word_count: 110,
    difficulty_level: 'foundational',
    focus_tags: ['content_coverage', 'recommendation', 'weak_paragraphing'],
    context_tags: ['student_life', 'ethics'],
  },
  {
    id: 'sys-essay-core-community-impact',
    genre: 'essay',
    title: 'Community impact essay',
    prompt_text:
      'Write an essay on whether schools should require students to join one community project each year. Consider benefits and challenges, then defend your final recommendation.',
    grade_band: '8-10',
    target_word_count: 150,
    difficulty_level: 'core',
    focus_tags: ['evidence', 'weak_paragraphing', 'recommendation'],
    context_tags: ['community', 'student_life'],
  },
  {
    id: 'sys-essay-stretch-digital-ethics',
    genre: 'essay',
    title: 'Digital ethics essay',
    prompt_text:
      'Write an essay evaluating whether AI writing tools should be limited in school assessments. Weigh educational value, fairness, and long-term impact before giving a reasoned conclusion.',
    grade_band: '10-12',
    target_word_count: 210,
    difficulty_level: 'stretch',
    focus_tags: ['evidence', 'weak_paragraphing', 'tone_control'],
    context_tags: ['digital_life', 'ethics'],
  },
  {
    id: 'sys-report-basic-event-summary',
    genre: 'report',
    title: 'Event outcomes report',
    prompt_text:
      'Write a report for your teacher about a recent school event. Summarize what happened, explain the main outcomes, and include one recommendation for improvement.',
    grade_band: '6-8',
    target_word_count: 110,
    difficulty_level: 'foundational',
    focus_tags: ['content_coverage', 'recommendation', 'sequencing'],
    context_tags: ['school_event', 'student_life'],
  },
  {
    id: 'sys-report-core-campaign-results',
    genre: 'report',
    title: 'Campaign results report',
    prompt_text:
      'Write a report for school leaders about results from a student campaign. Present findings, identify one key gap, and propose one evidence-based action.',
    grade_band: '8-10',
    target_word_count: 150,
    difficulty_level: 'core',
    focus_tags: ['evidence', 'content_coverage', 'recommendation'],
    context_tags: ['campaign', 'community'],
  },
  {
    id: 'sys-report-stretch-community-data',
    genre: 'report',
    title: 'Community program data report',
    prompt_text:
      'Write a formal report reviewing data from a school-community program. Analyze strengths and risks, and conclude with prioritized recommendations for next term.',
    grade_band: '10-12',
    target_word_count: 210,
    difficulty_level: 'stretch',
    focus_tags: ['evidence', 'sequencing', 'recommendation'],
    context_tags: ['community', 'ethics'],
  },
  {
    id: 'sys-paragraph-basic-class-blog',
    genre: 'paragraph',
    title: 'Class blog reflection paragraph',
    prompt_text:
      'Write one paragraph for your class blog about a school activity that helped students. Include one clear example and one idea to improve the activity next time.',
    grade_band: '6-8',
    target_word_count: 80,
    difficulty_level: 'foundational',
    focus_tags: ['content_coverage', 'weak_paragraphing', 'recommendation'],
    context_tags: ['school_event', 'student_life'],
  },
  {
    id: 'sys-paragraph-core-community-voice',
    genre: 'paragraph',
    title: 'Community voice paragraph',
    prompt_text:
      'Write one paragraph that explains why students should join a community clean-up campaign. Keep one main idea and support it with specific detail.',
    grade_band: '8-10',
    target_word_count: 100,
    difficulty_level: 'core',
    focus_tags: ['weak_paragraphing', 'audience_awareness', 'content_coverage'],
    context_tags: ['community', 'environment'],
  },
  {
    id: 'sys-paragraph-stretch-ethics-position',
    genre: 'paragraph',
    title: 'Ethics position paragraph',
    prompt_text:
      'Write one well-developed paragraph arguing for or against anonymous peer feedback in school. Use clear logic and precise language to support your position.',
    grade_band: '10-12',
    target_word_count: 120,
    difficulty_level: 'stretch',
    focus_tags: ['weak_paragraphing', 'evidence', 'language_accuracy'],
    context_tags: ['ethics', 'digital_life'],
  },
];

export const WEAKNESS_TAG_TO_PROMPT_FOCUS: Record<WeaknessTag, WritingPromptFocusTag[]> = {
  missed_content_point: ['content_coverage'],
  partial_content_coverage: ['content_coverage'],
  irrelevant_detail: ['content_coverage', 'sequencing'],
  under_length: ['word_count_control', 'content_coverage'],
  wrong_tone: ['tone_control', 'audience_awareness'],
  weak_register_control: ['tone_control'],
  weak_genre_convention: ['tone_control', 'content_coverage'],
  weak_audience_awareness: ['audience_awareness', 'tone_control'],
  weak_paragraphing: ['weak_paragraphing', 'sequencing'],
  poor_sequencing: ['sequencing', 'storytelling'],
  weak_linking: ['sequencing', 'weak_paragraphing'],
  repetitive_flow: ['sequencing', 'storytelling'],
  tense_error: ['language_accuracy'],
  agreement_error: ['language_accuracy'],
  article_error: ['language_accuracy'],
  preposition_error: ['language_accuracy'],
  fragment: ['language_accuracy', 'weak_paragraphing'],
  run_on: ['language_accuracy', 'weak_paragraphing'],
  weak_word_choice: ['language_accuracy', 'audience_awareness'],
  spelling_error: ['language_accuracy'],
  punctuation_error: ['language_accuracy'],
};

export const WEAKNESS_TAG_TO_MISSION_CATEGORY: Record<WeaknessTag, string> = {
  missed_content_point: 'mission_content_planning',
  partial_content_coverage: 'mission_content_planning',
  irrelevant_detail: 'mission_content_selection',
  under_length: 'mission_expansion_control',
  wrong_tone: 'mission_tone_shift',
  weak_register_control: 'mission_register_shift',
  weak_genre_convention: 'mission_genre_conventions',
  weak_audience_awareness: 'mission_audience_targeting',
  weak_paragraphing: 'mission_paragraph_build',
  poor_sequencing: 'mission_idea_ordering',
  weak_linking: 'mission_linking_upgrade',
  repetitive_flow: 'mission_flow_variation',
  tense_error: 'mission_grammar_repair',
  agreement_error: 'mission_grammar_repair',
  article_error: 'mission_grammar_repair',
  preposition_error: 'mission_grammar_repair',
  fragment: 'mission_sentence_clarity',
  run_on: 'mission_sentence_clarity',
  weak_word_choice: 'mission_vocabulary_precision',
  spelling_error: 'mission_language_accuracy',
  punctuation_error: 'mission_language_accuracy',
};

export const gradeToDifficultyLevel = (grade: number): PromptDifficultyLevel => {
  if (grade <= 7) return 'foundational';
  if (grade <= 10) return 'core';
  return 'stretch';
};

export const toCurriculumTagsForStructuredPrompt = (prompt: StructuredWritingPrompt): string[] => [
  `focus:${prompt.focus_tags.join('|')}`,
  `context:${prompt.context_tags.join('|')}`,
  'source:system_prompt_bank_v1',
];

export const parseFocusAndContextTags = (curriculumTags: string[]): {
  focus_tags: WritingPromptFocusTag[];
  context_tags: WritingPromptContextTag[];
} => {
  const focusLine = curriculumTags.find((item) => item.startsWith('focus:'));
  const contextLine = curriculumTags.find((item) => item.startsWith('context:'));
  const focusTags = (focusLine?.replace('focus:', '').split('|').filter(Boolean) ?? []) as WritingPromptFocusTag[];
  const contextTags = (contextLine?.replace('context:', '').split('|').filter(Boolean) ?? []) as WritingPromptContextTag[];
  return { focus_tags: focusTags, context_tags: contextTags };
};
