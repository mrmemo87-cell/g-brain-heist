import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireTeacher } from '../_lib/auth';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';
import { requireQueryValue } from '../_lib/request';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use GET for teacher analytics', 405);
    }

    const teacher = requireTeacher(req);
    const classId = requireQueryValue(req, 'classId');
    const supabase = getSupabaseServerClient();

    const [topics, taskGroups] = await Promise.all([
      supabase.rpc('get_bh_class_topic_summary', {
        p_teacher_id: teacher.userId,
        p_class_id: classId,
      }),
      supabase.rpc('get_bh_task_group_summary', {
        p_teacher_id: teacher.userId,
        p_class_id: classId,
      }),
    ]);

    if (topics.error) {
      throw new ApiError('RPC_ERROR', topics.error.message, 502);
    }

    if (taskGroups.error) {
      throw new ApiError('RPC_ERROR', taskGroups.error.message, 502);
    }

    sendSuccess(res, {
      topics: topics.data ?? [],
      taskGroups: taskGroups.data ?? [],
    });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
