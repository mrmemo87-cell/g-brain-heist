import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { getAuthContext } from '../_lib/auth';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';
import { getQueryValue } from '../_lib/request';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use GET to fetch scheduled missions', 405);
    }

    const context = getAuthContext(req);
    const supabase = getSupabaseServerClient();
    const windowFilter = (getQueryValue(req, 'window') ?? 'all').toLowerCase();
    const nowIso = new Date().toISOString();

    const query = supabase
      .from('bh_scheduled_missions')
      .select('*')
      .order('starts_at', { ascending: false });

    if (context.role === 'teacher') {
      const classId = getQueryValue(req, 'classId');
      if (!classId) {
        throw new ApiError('INVALID_QUERY', 'classId is required for teacher scheduling lookups');
      }
      query.eq('class_id', classId).eq('owner_teacher_id', context.userId);
    } else {
      const classId = context.classId;
      if (!classId) {
        throw new ApiError('INVALID_CONTEXT', 'Class id header required for students');
      }
      query.eq('class_id', classId);
    }

    if (windowFilter === 'active') {
      query.lte('starts_at', nowIso).gte('ends_at', nowIso);
    } else if (windowFilter === 'future') {
      query.gt('starts_at', nowIso);
    } else if (windowFilter === 'past') {
      query.lt('ends_at', nowIso);
    }

    const { data, error } = await query;

    if (error) {
      throw new ApiError('DB_ERROR', error.message, 500);
    }

    sendSuccess(res, { missions: data ?? [] });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
