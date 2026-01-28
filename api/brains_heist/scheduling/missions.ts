import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireTeacher, type AuthContext } from '../_lib/auth';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';
import { getQueryValue } from '../_lib/request';
import {
  ensureIsoDateString,
  ensureOptionalString,
  ensureString,
} from '../_lib/validation';

interface MissionSchedulePayload {
  class_id: string;
  topic_id?: string;
  task_group_id?: string;
  starts_at: string;
  ends_at: string;
  goal_description?: string;
  owner_teacher_id: string;
}

type MissionInput = Partial<{
  classId: unknown;
  class_id: unknown;
  topicId: unknown;
  topic_id: unknown;
  taskGroupId: unknown;
  task_group_id: unknown;
  startsAt: unknown;
  starts_at: unknown;
  endsAt: unknown;
  ends_at: unknown;
  goalDescription: unknown;
  goal_description: unknown;
}>;

const parsePayload = (raw: Record<string, unknown>, teacher: AuthContext): MissionSchedulePayload => {
  const body = raw as MissionInput;
  return {
    class_id: ensureString(body.classId ?? body.class_id, 'classId'),
    topic_id: ensureOptionalString(body.topicId ?? body.topic_id, 'topicId'),
    task_group_id: ensureOptionalString(body.taskGroupId ?? body.task_group_id, 'taskGroupId'),
    starts_at: ensureIsoDateString(body.startsAt ?? body.starts_at, 'startsAt'),
    ends_at: ensureIsoDateString(body.endsAt ?? body.ends_at, 'endsAt'),
    goal_description: ensureOptionalString(body.goalDescription ?? body.goal_description, 'goalDescription'),
    owner_teacher_id: teacher.userId,
  };
};

const handler: NextApiHandler = async (req, res) => {
  try {
    const teacher = requireTeacher(req);
    const supabase = getSupabaseServerClient();

    if (req.method === 'POST') {
      const payload = parsePayload((req.body ?? {}) as Record<string, unknown>, teacher);
      const { data, error } = await supabase
        .from('bh_scheduled_missions')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        throw new ApiError('DB_ERROR', error.message, 500);
      }

      sendSuccess(res, { mission: data }, 201);
      return;
    }

    if (req.method === 'PUT') {
      const scheduleId = getQueryValue(req, 'id');
      if (!scheduleId) {
        throw new ApiError('INVALID_QUERY', 'Missing id for mission update');
      }
      const payload = parsePayload((req.body ?? {}) as Record<string, unknown>, teacher);
      const { data, error } = await supabase
        .from('bh_scheduled_missions')
        .update(payload)
        .eq('id', scheduleId)
        .select('*')
        .single();

      if (error) {
        throw new ApiError('DB_ERROR', error.message, 500);
      }

      sendSuccess(res, { mission: data });
      return;
    }

    throw new ApiError('METHOD_NOT_ALLOWED', 'Only POST/PUT are supported', 405);
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
