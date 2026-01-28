import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireTeacher } from '../_lib/auth';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';
import { requireQueryValue } from '../_lib/request';

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use GET for student analytics', 405);
    }

    const teacher = requireTeacher(req);
    const studentId = requireQueryValue(req, 'studentId');
    const supabase = getSupabaseServerClient();

    const [missions, mastery] = await Promise.all([
      supabase.rpc('get_bh_student_missions', {
        p_teacher_id: teacher.userId,
        p_student_id: studentId,
      }),
      supabase.rpc('get_bh_student_mastery', {
        p_teacher_id: teacher.userId,
        p_student_id: studentId,
      }),
    ]);

    if (missions.error) {
      throw new ApiError('RPC_ERROR', missions.error.message, 502);
    }

    if (mastery.error) {
      throw new ApiError('RPC_ERROR', mastery.error.message, 502);
    }

    sendSuccess(res, {
      missions: missions.data ?? [],
      mastery: mastery.data ?? [],
    });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
