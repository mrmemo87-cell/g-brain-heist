import {
  RepeatedErrorMemory,
  SupportedGenre,
  WeaknessTag,
  WeeklyImprovementPlan,
  WritingAssessmentResult,
} from './writingAssessment';

export type TaskType =
  | 'sentence correction'
  | 'error spotting'
  | 'sentence combining'
  | 'paragraph ordering'
  | 'linking words insertion'
  | 'paragraph writing'
  | 'guided writing'
  | 'rewrite from feedback'
  | 'full exam-style response'
  | 'genre convention task'
  | 'word-count control task';

export type TaskMode = 'drill' | 'guided' | 'exam_style' | 'rewrite';

export interface DailyWritingTask {
  day_number: number;
  task_type: TaskType;
  title: string;
  instructions: string;
  target_skill: string;
  target_tags: WeaknessTag[];
  expected_word_count: number;
  success_criteria: string[];
  support_level: 'high' | 'medium' | 'low';
  task_mode: TaskMode;
}

export interface DailyTaskGeneratorInput {
  weekly_plan: WeeklyImprovementPlan;
  latest_assessment: WritingAssessmentResult;
  grade: number;
  target_genre: SupportedGenre;
  repeated_error_memory: RepeatedErrorMemory;
  student_id: string;
}

const GENRE_FOCUS: Record<SupportedGenre, string> = {
  email: 'clear purpose, friendly/formal tone, and all question points answered',
  article: 'a strong opening, clear audience focus, and smooth flow',
  review: 'a clear opinion, strong reasons, and a final recommendation',
  story: 'a clear sequence, developed moments, and a satisfying ending',
  essay: 'a clear opinion, useful support, and logical paragraph flow',
  report: 'formal tone, clear sections, and practical recommendations',
  paragraph: 'one clear main idea with supporting detail',
};

const supportLevelForGrade = (grade: number): 'high' | 'medium' | 'low' => {
  if (grade <= 7) return 'high';
  if (grade <= 9) return 'medium';
  return 'low';
};

const baseWordCountForGrade = (grade: number): number => {
  if (grade <= 7) return 70;
  if (grade <= 9) return 110;
  return 160;
};

const inferFocusArea = (primaryTarget: string): 'language' | 'organisation' | 'content' | 'communicative' => {
  const text = primaryTarget.toLowerCase();
  if (/tone|register|audience|genre|communicative/.test(text)) return 'communicative';
  if (/paragraph|sequencing|linking|organisation|flow/.test(text)) return 'organisation';
  if (/content|coverage|under length|missed/.test(text)) return 'content';
  return 'language';
};

const repeatedTagCounts = (memory: RepeatedErrorMemory, studentId: string): Partial<Record<WeaknessTag, number>> =>
  memory.byStudent[studentId]?.tagCounts ?? {};

const getTopTargetTags = (assessment: WritingAssessmentResult): WeaknessTag[] => assessment.weakness_tags.slice(0, 3);

const buildCriteria = (tags: WeaknessTag[], genre: SupportedGenre, includeWordCount: boolean): string[] => {
  const criteria: string[] = [];

  if (tags.includes('missed_content_point') || tags.includes('partial_content_coverage')) criteria.push('Covers all required content points.');
  if (tags.includes('weak_paragraphing') || tags.includes('poor_sequencing')) criteria.push('Uses clear paragraphing and logical sequencing.');
  if (tags.includes('tense_error')) criteria.push('Avoids repeated tense errors.');
  if (tags.includes('agreement_error')) criteria.push('Maintains correct subject–verb agreement.');
  if (tags.includes('wrong_tone') || tags.includes('weak_register_control')) criteria.push('Matches tone and register to task purpose.');
  if (genre === 'email') criteria.push('Includes a suitable opening and closing.');
  if (includeWordCount) criteria.push('Stays within the target word range.');

  if (criteria.length < 2) {
    criteria.push('Addresses the task clearly and directly.', 'Uses accurate sentence control in most lines.');
  }

  return criteria.slice(0, 4);
};

interface TaskBlueprint {
  task_type: TaskType;
  task_mode: TaskMode;
  target_skill: string;
}

const blueprintsForFocus = (focus: 'language' | 'organisation' | 'content' | 'communicative'): TaskBlueprint[] => {
  if (focus === 'language') {
    return [
      { task_type: 'sentence correction', task_mode: 'drill', target_skill: 'grammar control' },
      { task_type: 'error spotting', task_mode: 'drill', target_skill: 'error detection' },
      { task_type: 'sentence combining', task_mode: 'guided', target_skill: 'sentence fluency' },
      { task_type: 'rewrite from feedback', task_mode: 'rewrite', target_skill: 'error repair from feedback' },
      { task_type: 'paragraph writing', task_mode: 'guided', target_skill: 'controlled paragraph production' },
      { task_type: 'guided writing', task_mode: 'guided', target_skill: 'applied language control' },
      { task_type: 'full exam-style response', task_mode: 'exam_style', target_skill: 'independent exam performance' },
    ];
  }
  if (focus === 'organisation') {
    return [
      { task_type: 'paragraph ordering', task_mode: 'drill', target_skill: 'sequencing and structure' },
      { task_type: 'linking words insertion', task_mode: 'drill', target_skill: 'cohesion control' },
      { task_type: 'sentence combining', task_mode: 'guided', target_skill: 'flow between ideas' },
      { task_type: 'paragraph writing', task_mode: 'guided', target_skill: 'paragraph unity' },
      { task_type: 'guided writing', task_mode: 'guided', target_skill: 'full-structure writing' },
      { task_type: 'rewrite from feedback', task_mode: 'rewrite', target_skill: 'organisation repair' },
      { task_type: 'full exam-style response', task_mode: 'exam_style', target_skill: 'independent exam performance' },
    ];
  }
  if (focus === 'content') {
    return [
      { task_type: 'genre convention task', task_mode: 'guided', target_skill: 'genre content requirements' },
      { task_type: 'guided writing', task_mode: 'guided', target_skill: 'content coverage planning' },
      { task_type: 'paragraph writing', task_mode: 'guided', target_skill: 'development of key points' },
      { task_type: 'rewrite from feedback', task_mode: 'rewrite', target_skill: 'content-point recovery' },
      { task_type: 'sentence combining', task_mode: 'drill', target_skill: 'expand ideas clearly' },
      { task_type: 'guided writing', task_mode: 'guided', target_skill: 'complete task response' },
      { task_type: 'full exam-style response', task_mode: 'exam_style', target_skill: 'independent exam performance' },
    ];
  }
  return [
    { task_type: 'genre convention task', task_mode: 'guided', target_skill: 'tone/register alignment' },
    { task_type: 'guided writing', task_mode: 'guided', target_skill: 'audience and purpose control' },
    { task_type: 'error spotting', task_mode: 'drill', target_skill: 'tone mismatch detection' },
    { task_type: 'rewrite from feedback', task_mode: 'rewrite', target_skill: 'register correction' },
    { task_type: 'paragraph writing', task_mode: 'guided', target_skill: 'purpose-led paragraphing' },
    { task_type: 'guided writing', task_mode: 'guided', target_skill: 'genre-consistent response' },
    { task_type: 'full exam-style response', task_mode: 'exam_style', target_skill: 'independent exam performance' },
  ];
};

const withGradeScaffolding = (grade: number, instructions: string): string => {
  if (grade <= 7) return `${instructions} Use the checklist and start with one simple plan sentence.`;
  if (grade <= 9) return `${instructions} Use the short checklist before you write your final version.`;
  return `${instructions} Plan first, then check style, structure, and accuracy before submission.`;
};

export const generateDailyWritingTasksForWeek = (input: DailyTaskGeneratorInput): DailyWritingTask[] => {
  const focusArea = inferFocusArea(input.weekly_plan.primary_target);
  const supportLevel = supportLevelForGrade(input.grade);
  const baseWords = baseWordCountForGrade(input.grade);
  const tags = getTopTargetTags(input.latest_assessment);
  const tagCounts = repeatedTagCounts(input.repeated_error_memory, input.student_id);
  const hasRepeatedErrors = Object.values(tagCounts).some((count) => (count ?? 0) >= 2);
  const weakWordCount = (tagCounts.under_length ?? 0) >= 2 || input.latest_assessment.weakness_tags.includes('under_length');

  const tasks = blueprintsForFocus(focusArea);

  if (hasRepeatedErrors && !tasks.some((task) => task.task_type === 'rewrite from feedback')) {
    tasks[3] = { task_type: 'rewrite from feedback', task_mode: 'rewrite', target_skill: 'error repair from feedback' };
  }

  if (weakWordCount) {
    tasks[4] = { task_type: 'word-count control task', task_mode: 'guided', target_skill: 'length and relevance control' };
  }

  tasks[6] = { task_type: 'full exam-style response', task_mode: 'exam_style', target_skill: 'independent exam performance' };

  return tasks.map((task, index) => {
    const day = index + 1;
    const isExam = task.task_type === 'full exam-style response';
    const expectedWords =
      task.task_type === 'sentence correction' || task.task_type === 'error spotting' || task.task_type === 'sentence combining'
        ? Math.max(40, Math.round(baseWords * 0.6))
        : task.task_type === 'paragraph writing'
          ? Math.round(baseWords * 0.8)
          : isExam
            ? baseWords
            : Math.round(baseWords * 0.75);

    const title = `Day ${day}: ${task.task_type}`;
    const instructions = withGradeScaffolding(
      input.grade,
      `Today, complete a ${task.task_type} practice for ${input.target_genre} writing. Main focus: ${input.weekly_plan.primary_target}. Second focus: ${input.weekly_plan.secondary_target}. Keep this writing style in mind: ${GENRE_FOCUS[input.target_genre]}.`
    );

    const includeWordCountCriterion = weakWordCount || task.task_type === 'word-count control task' || isExam;

    return {
      day_number: day,
      task_type: task.task_type,
      title,
      instructions,
      target_skill: task.target_skill,
      target_tags: tags,
      expected_word_count: expectedWords,
      success_criteria: buildCriteria(tags, input.target_genre, includeWordCountCriterion),
      support_level: supportLevel,
      task_mode: task.task_mode,
    };
  });
};
