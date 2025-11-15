import { createCrudHandler } from '../_lib/crudFactory';
import { ensureOptionalString, ensureString } from '../_lib/validation';
import type { AuthContext } from '../_lib/auth';

interface SubjectPayload extends Record<string, unknown> {
  name: string;
  description?: string;
  grade_band?: string;
  owner_teacher_id: string;
}

type SubjectInput = Partial<{
  name: unknown;
  description: unknown;
  gradeBand: unknown;
  grade_band: unknown;
}>;

const mapSubjectPayload = (payload: unknown, _action: 'create' | 'update', context: AuthContext): SubjectPayload => {
  const body = (payload ?? {}) as SubjectInput;
  return {
    name: ensureString(body.name, 'name'),
    description: ensureOptionalString(body.description, 'description'),
    grade_band: ensureOptionalString(body.gradeBand ?? body.grade_band, 'gradeBand'),
    owner_teacher_id: context.userId,
  };
};

export default createCrudHandler<SubjectPayload, SubjectPayload>({
  table: 'bh_subjects',
  mapPayload: mapSubjectPayload,
});
