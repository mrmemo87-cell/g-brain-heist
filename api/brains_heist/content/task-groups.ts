import { createCrudHandler } from '../_lib/crudFactory';
import { ensureOptionalNumber, ensureOptionalString, ensureString } from '../_lib/validation';
import type { AuthContext } from '../_lib/auth';

interface TaskGroupPayload extends Record<string, unknown> {
  topic_id: string;
  title: string;
  mission_type?: string;
  recommended_level?: number;
  owner_teacher_id: string;
}

type TaskGroupInput = Partial<{
  topicId: unknown;
  topic_id: unknown;
  title: unknown;
  missionType: unknown;
  mission_type: unknown;
  recommendedLevel: unknown;
  recommended_level: unknown;
}>;

const mapTaskGroupPayload = (payload: unknown, _action: 'create' | 'update', context: AuthContext): TaskGroupPayload => {
  const body = (payload ?? {}) as TaskGroupInput;
  return {
    topic_id: ensureString(body.topicId ?? body.topic_id, 'topicId'),
    title: ensureString(body.title, 'title'),
    mission_type: ensureOptionalString(body.missionType ?? body.mission_type, 'missionType'),
    recommended_level: ensureOptionalNumber(body.recommendedLevel ?? body.recommended_level, 'recommendedLevel'),
    owner_teacher_id: context.userId,
  };
};

export default createCrudHandler<TaskGroupPayload, TaskGroupPayload>({
  table: 'bh_task_groups',
  mapPayload: mapTaskGroupPayload,
});
