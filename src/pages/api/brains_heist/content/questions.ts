import { createCrudHandler } from '../_lib/crudFactory';
import { ensureArray, ensureOptionalNumber, ensureOptionalString, ensureString } from '../_lib/validation';
import type { AuthContext } from '../_lib/auth';

interface QuestionPayload extends Record<string, unknown> {
  task_group_id: string;
  prompt: string;
  options: string[];
  correct_option: string;
  explanation?: string;
  difficulty_rating?: number;
  owner_teacher_id: string;
}

type QuestionInput = Partial<{
  taskGroupId: unknown;
  task_group_id: unknown;
  prompt: unknown;
  options: unknown;
  correctOption: unknown;
  correct_option: unknown;
  explanation: unknown;
  difficultyRating: unknown;
  difficulty_rating: unknown;
}>;

const mapQuestionPayload = (payload: unknown, _action: 'create' | 'update', context: AuthContext): QuestionPayload => {
  const body = (payload ?? {}) as QuestionInput;
  return {
    task_group_id: ensureString(body.taskGroupId ?? body.task_group_id, 'taskGroupId'),
    prompt: ensureString(body.prompt, 'prompt'),
    options: ensureArray(body.options, 'options', ensureString),
    correct_option: ensureString(body.correctOption ?? body.correct_option, 'correctOption'),
    explanation: ensureOptionalString(body.explanation, 'explanation'),
    difficulty_rating: ensureOptionalNumber(body.difficultyRating ?? body.difficulty_rating, 'difficultyRating'),
    owner_teacher_id: context.userId,
  };
};

export default createCrudHandler<QuestionPayload, QuestionPayload>({
  table: 'bh_questions',
  mapPayload: mapQuestionPayload,
});
