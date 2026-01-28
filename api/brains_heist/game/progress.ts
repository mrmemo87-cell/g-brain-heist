import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';
import { getQueryValue } from '../_lib/request';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use GET to fetch progress', 405);
    }

    const student = requireStudent(req);
    const supabase = getSupabaseServerClient();
    const topicId = getQueryValue(req, 'topicId') ?? getQueryValue(req, 'topic_id');

    const progressQuery = supabase
      .from('bh_topic_progress')
      .select('*')
      .eq('student_id', student.userId)
      .order('topic_name', { ascending: true });

    if (topicId) {
      progressQuery.eq('topic_id', topicId);
    }

    const statusQuery = supabase
      .from('bh_topic_status_view')
      .select('*')
      .eq('student_id', student.userId);

    if (topicId) {
      statusQuery.eq('topic_id', topicId);
    }

    const [progress, statuses] = await Promise.all([progressQuery, statusQuery]);

    if (progress.error) {
      throw new ApiError('DB_ERROR', progress.error.message, 500);
    }

    if (statuses.error) {
      throw new ApiError('DB_ERROR', statuses.error.message, 500);
    }

    sendSuccess(res, {
      progress: progress.data ?? [],
      statuses: statuses.data ?? [],
    });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
