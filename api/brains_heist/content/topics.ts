import { createCrudHandler } from '../_lib/crudFactory';
import { ensureOptionalString, ensureString } from '../_lib/validation';
import type { AuthContext } from '../_lib/auth';

interface TopicPayload extends Record<string, unknown> {
  subject_id: string;
  name: string;
  difficulty_band?: string;
  syllabus_code?: string;
  owner_teacher_id: string;
}

type TopicInput = Partial<{
  subjectId: unknown;
  subject_id: unknown;
  name: unknown;
  difficultyBand: unknown;
  difficulty_band: unknown;
  syllabusCode: unknown;
  syllabus_code: unknown;
}>;

const mapTopicPayload = (payload: unknown, _action: 'create' | 'update', context: AuthContext): TopicPayload => {
  const body = (payload ?? {}) as TopicInput;
  return {
    subject_id: ensureString(body.subjectId ?? body.subject_id, 'subjectId'),
    name: ensureString(body.name, 'name'),
    difficulty_band: ensureOptionalString(body.difficultyBand ?? body.difficulty_band, 'difficultyBand'),
    syllabus_code: ensureOptionalString(body.syllabusCode ?? body.syllabus_code, 'syllabusCode'),
    owner_teacher_id: context.userId,
  };
};

export default createCrudHandler<TopicPayload, TopicPayload>({
  table: 'bh_topics',
  mapPayload: mapTopicPayload,
});
