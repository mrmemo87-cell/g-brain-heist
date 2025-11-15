import { getSupabaseServerClient } from '../_lib/supabaseServer';
import { requireStudent } from '../_lib/auth';
import { ensureNumber, ensureOptionalString } from '../_lib/validation';
import { sendSuccess } from '../_lib/responses';
import { ApiError, handleApiError } from '../_lib/errors';
import type { NextApiHandler } from '../_lib/types';

interface MissionRequestBody {
  topic_id?: string;
  task_group_id?: string;
  question_count: number;
  mission_difficulty?: string;
}

const handler: NextApiHandler = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST to start a mission', 405);
    }

    const student = requireStudent(req);
    type StartBody = Partial<{
      topicId: unknown;
      topic_id: unknown;
      taskGroupId: unknown;
      task_group_id: unknown;
      questionCount: unknown;
      question_count: unknown;
      missionDifficulty: unknown;
      mission_difficulty: unknown;
    }>;
    const body = (req.body ?? {}) as StartBody;
    const questionCount = ensureNumber(body.questionCount ?? body.question_count ?? 5, 'questionCount');
    const payload: MissionRequestBody = {
      topic_id: ensureOptionalString(body.topicId ?? body.topic_id, 'topicId'),
      task_group_id: ensureOptionalString(body.taskGroupId ?? body.task_group_id, 'taskGroupId'),
      question_count: questionCount,
      mission_difficulty: ensureOptionalString(body.missionDifficulty ?? body.mission_difficulty, 'missionDifficulty'),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc('start_brains_heist_mission', {
      p_student_id: student.userId,
      p_topic_id: payload.topic_id,
      p_task_group_id: payload.task_group_id,
      p_question_count: payload.question_count,
      p_mission_difficulty: payload.mission_difficulty,
    });

    if (error) {
      throw new ApiError('RPC_ERROR', error.message, 502);
    }

    sendSuccess(res, { mission: data });
  } catch (error) {
    handleApiError(res, error);
  }
};

export default handler;
