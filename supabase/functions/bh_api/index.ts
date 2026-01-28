import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

type Role = "teacher" | "student";

type AuthContext = {
  userId: string;
  role: Role;
  classId?: string;
};

type Handler = (req: Request, context: AuthContext) => Promise<Response>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-brains-class-id",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const sendSuccess = (data: unknown, status = 200) =>
  jsonResponse(status, { success: true, data });

const sendError = (
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) =>
  jsonResponse(status, {
    success: false,
    error: { code, message, details },
  });

class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const handleApiError = (error: unknown) => {
  if (error instanceof ApiError) {
    return sendError(error.code, error.message, error.status, error.details);
  }
  if (error instanceof Error) {
    return sendError("UNEXPECTED_ERROR", error.message, 500);
  }
  return sendError("UNEXPECTED_ERROR", "Unknown error", 500);
};

const ensureString = (value: unknown, field: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new ApiError("INVALID_BODY", `${field} is required`);
};

const ensureOptionalString = (value: unknown, _field: string): string | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new ApiError("INVALID_BODY", "Expected string");
};

const ensureNumber = (value: unknown, field: string): number => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  throw new ApiError("INVALID_BODY", `${field} must be a number`);
};

const ensureOptionalNumber = (value: unknown, _field: string): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  throw new ApiError("INVALID_BODY", "Expected number");
};

const ensureArray = <T>(
  value: unknown,
  field: string,
  mapper: (entry: unknown, field: string) => T,
): T[] => {
  if (!Array.isArray(value)) {
    throw new ApiError("INVALID_BODY", `${field} must be an array`);
  }
  return value.map((entry, index) => mapper(entry, `${field}.${index}`));
};

const parseJsonBody = async (req: Request) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return {};
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }
  return await req.json();
};

const getQueryValue = (url: URL, key: string): string | undefined => {
  const value = url.searchParams.get(key);
  return value ?? undefined;
};

const requireQueryValue = (url: URL, key: string): string => {
  const value = getQueryValue(url, key);
  if (!value) {
    throw new ApiError("INVALID_QUERY", `Missing required query param: ${key}`);
  }
  return value;
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const supabaseUrl = getEnv("SUPABASE_URL");
const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const getAuthContext = async (req: Request): Promise<AuthContext> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    throw new ApiError("UNAUTHENTICATED", "Missing bearer token", 401);
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    throw new ApiError("UNAUTHENTICATED", "Invalid token", 401, authError?.message);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("role, class_id")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile?.role) {
    throw new ApiError("FORBIDDEN", "Unable to resolve user role", 403, profileError?.message);
  }

  const headerClassId = req.headers.get("x-brains-class-id") ?? undefined;
  return {
    userId: authData.user.id,
    role: profile.role as Role,
    classId: headerClassId ?? (profile as { class_id?: string | null }).class_id ?? undefined,
  };
};

const requireTeacher = (context: AuthContext): AuthContext => {
  if (context.role !== "teacher") {
    throw new ApiError("FORBIDDEN", "Teacher role required", 403);
  }
  return context;
};

const requireStudent = (context: AuthContext): AuthContext => {
  if (context.role !== "student") {
    throw new ApiError("FORBIDDEN", "Student role required", 403);
  }
  return context;
};

const createCrudHandler = <TPayload extends Record<string, unknown>, TResult = TPayload>(
  options: {
    table: string;
    select?: string;
    mapPayload: (payload: unknown, action: "create" | "update", context: AuthContext) => TPayload;
    mapResult?: (result: TResult | TResult[]) => unknown;
    idColumn?: string;
  },
): Handler => {
  const { table, select = "*", mapPayload, mapResult, idColumn = "id" } = options;

  return async (req, context) => {
    try {
      requireTeacher(context);
      const url = new URL(req.url);
      const id = getQueryValue(url, "id");
      const body = await parseJsonBody(req);

      switch (req.method) {
        case "GET": {
          if (id) {
            const { data, error } = await supabaseAdmin.from(table).select(select).eq(idColumn, id).single();
            if (error) throw new ApiError("DB_ERROR", error.message, 500);
            const normalized = data as TResult;
            return sendSuccess(mapResult ? mapResult(normalized) : normalized);
          }
          const { data, error } = await supabaseAdmin.from(table).select(select).order("created_at", { ascending: true });
          if (error) throw new ApiError("DB_ERROR", error.message, 500);
          const normalized = data as TResult[];
          return sendSuccess(mapResult ? mapResult(normalized) : normalized);
        }
        case "POST": {
          const payload = mapPayload(body, "create", context);
          const { data, error } = await supabaseAdmin.from(table).insert(payload).select(select).single();
          if (error) throw new ApiError("DB_ERROR", error.message, 500);
          const normalized = data as TResult;
          return sendSuccess(mapResult ? mapResult(normalized) : normalized);
        }
        case "PUT": {
          if (!id) throw new ApiError("INVALID_QUERY", "Missing id for update");
          const payload = mapPayload(body, "update", context);
          const { data, error } = await supabaseAdmin.from(table).update(payload).eq(idColumn, id).select(select).single();
          if (error) throw new ApiError("DB_ERROR", error.message, 500);
          const normalized = data as TResult;
          return sendSuccess(mapResult ? mapResult(normalized) : normalized);
        }
        case "DELETE": {
          if (!id) throw new ApiError("INVALID_QUERY", "Missing id for delete");
          const { error } = await supabaseAdmin.from(table).delete().eq(idColumn, id);
          if (error) throw new ApiError("DB_ERROR", error.message, 500);
          return sendSuccess({ deleted: true });
        }
        default:
          throw new ApiError("METHOD_NOT_ALLOWED", "Unsupported method", 405);
      }
    } catch (error) {
      return handleApiError(error);
    }
  };
};

const handlers: Record<string, Handler> = {
  "content/subjects": createCrudHandler({
    table: "bh_subjects",
    mapPayload: (payload, _action, context) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      return {
        name: ensureString(body["name"], "name"),
        description: ensureOptionalString(body["description"], "description"),
        grade_band: ensureOptionalString(body["gradeBand"] ?? body["grade_band"], "gradeBand"),
        owner_teacher_id: context.userId,
      };
    },
  }),
  "content/topics": createCrudHandler({
    table: "bh_topics",
    mapPayload: (payload, _action, context) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      return {
        subject_id: ensureString(body["subjectId"] ?? body["subject_id"], "subjectId"),
        name: ensureString(body["name"], "name"),
        difficulty_band: ensureOptionalString(body["difficultyBand"] ?? body["difficulty_band"], "difficultyBand"),
        syllabus_code: ensureOptionalString(body["syllabusCode"] ?? body["syllabus_code"], "syllabusCode"),
        owner_teacher_id: context.userId,
      };
    },
  }),
  "content/task-groups": createCrudHandler({
    table: "bh_task_groups",
    mapPayload: (payload, _action, context) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      return {
        topic_id: ensureString(body["topicId"] ?? body["topic_id"], "topicId"),
        title: ensureString(body["title"], "title"),
        mission_type: ensureOptionalString(body["missionType"] ?? body["mission_type"], "missionType"),
        recommended_level: ensureOptionalNumber(body["recommendedLevel"] ?? body["recommended_level"], "recommendedLevel"),
        owner_teacher_id: context.userId,
      };
    },
  }),
  "content/questions": createCrudHandler({
    table: "bh_questions",
    mapPayload: (payload, _action, context) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      return {
        task_group_id: ensureString(body["taskGroupId"] ?? body["task_group_id"], "taskGroupId"),
        prompt: ensureString(body["prompt"], "prompt"),
        options: ensureArray(body["options"], "options", ensureString),
        correct_option: ensureString(body["correctOption"] ?? body["correct_option"], "correctOption"),
        explanation: ensureOptionalString(body["explanation"], "explanation"),
        difficulty_rating: ensureOptionalNumber(body["difficultyRating"] ?? body["difficulty_rating"], "difficultyRating"),
        owner_teacher_id: context.userId,
      };
    },
  }),
  "game/start": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to start a mission", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const questionCount = ensureNumber(body["questionCount"] ?? body["question_count"] ?? 5, "questionCount");
      const payload = {
        topic_id: ensureOptionalString(body["topicId"] ?? body["topic_id"], "topicId"),
        task_group_id: ensureOptionalString(body["taskGroupId"] ?? body["task_group_id"], "taskGroupId"),
        question_count: questionCount,
        mission_difficulty: ensureOptionalString(body["missionDifficulty"] ?? body["mission_difficulty"], "missionDifficulty"),
      };
      const { data, error } = await supabaseAdmin.rpc("start_brains_heist_mission", {
        p_student_id: student.userId,
        p_topic_id: payload.topic_id,
        p_task_group_id: payload.task_group_id,
        p_question_count: payload.question_count,
        p_mission_difficulty: payload.mission_difficulty,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ mission: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "game/next-mission": async (req, context) => {
    try {
      if (req.method !== "GET" && req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use GET or POST for next mission", 405);
      }
      const student = requireStudent(context);
      const body = req.method === "POST" ? (await parseJsonBody(req)) as Record<string, unknown> : {};
      const topicHint = ensureOptionalString(body["topicId"] ?? body["topic_id"], "topicId");
      const { data, error } = await supabaseAdmin.rpc("get_next_brains_heist_mission", {
        p_student_id: student.userId,
        p_topic_id: topicHint,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ suggestion: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "game/answer": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to submit an answer", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        mission_id: ensureString(body["missionId"] ?? body["mission_id"], "missionId"),
        question_id: ensureString(body["questionId"] ?? body["question_id"], "questionId"),
        answer: ensureString(body["answer"], "answer"),
        time_taken: ensureOptionalNumber(body["timeTaken"] ?? body["time_taken"], "timeTaken"),
        support_note: ensureOptionalString(body["supportNote"] ?? body["support_note"], "supportNote"),
      };
      const { data, error } = await supabaseAdmin.rpc("submit_brains_heist_answer", {
        p_student_id: student.userId,
        p_mission_id: payload.mission_id,
        p_question_id: payload.question_id,
        p_answer: payload.answer,
        p_time_taken: payload.time_taken,
        p_support_note: payload.support_note,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ attempt: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "game/finish": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to finish a mission", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        mission_id: ensureString(body["missionId"] ?? body["mission_id"], "missionId"),
        abandoned: Boolean(body["abandoned"]),
        remaining_lives: ensureOptionalNumber(body["remainingLives"] ?? body["remaining_lives"], "remainingLives"),
      };
      const { data, error } = await supabaseAdmin.rpc("finish_brains_heist_mission", {
        p_student_id: student.userId,
        p_mission_id: payload.mission_id,
        p_abandoned: payload.abandoned,
        p_remaining_lives: payload.remaining_lives,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ summary: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "game/progress": async (req, context) => {
    try {
      if (req.method !== "GET") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use GET for mission progress", 405);
      }
      const student = requireStudent(context);
      const url = new URL(req.url);
      const topicId = getQueryValue(url, "topicId");
      const [progress, statuses] = await Promise.all([
        supabaseAdmin.rpc("get_brains_heist_progress", {
          p_student_id: student.userId,
          p_topic_id: topicId ?? null,
        }),
        supabaseAdmin.rpc("get_brains_heist_topic_statuses", {
          p_student_id: student.userId,
        }),
      ]);
      if (progress.error) throw new ApiError("RPC_ERROR", progress.error.message, 502);
      if (statuses.error) throw new ApiError("RPC_ERROR", statuses.error.message, 502);
      return sendSuccess({ progress: progress.data ?? [], statuses: statuses.data ?? [] });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "pvp/challenge": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to create PvP challenges", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        topic_id: ensureOptionalString(body["topicId"] ?? body["topic_id"], "topicId"),
        question_count: body["questionCount"] ? ensureNumber(body["questionCount"], "questionCount") : 5,
        time_limit_seconds: ensureOptionalNumber(body["timeLimitSeconds"] ?? body["time_limit_seconds"], "timeLimitSeconds"),
        wager_coins: ensureOptionalNumber(body["wagerCoins"] ?? body["wager_coins"], "wagerCoins"),
      };
      const { data, error } = await supabaseAdmin.rpc("create_bh_pvp_challenge", {
        p_creator_id: student.userId,
        p_topic_id: payload.topic_id,
        p_question_count: payload.question_count,
        p_time_limit_seconds: payload.time_limit_seconds,
        p_wager_coins: payload.wager_coins,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ challenge: data }, 201);
    } catch (error) {
      return handleApiError(error);
    }
  },
  "pvp/join": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to join a PvP battle", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        challenge_code: ensureString(body["challengeCode"] ?? body["challenge_code"], "challengeCode"),
      };
      const { data, error } = await supabaseAdmin.rpc("join_bh_pvp_challenge", {
        p_player_id: student.userId,
        p_challenge_code: payload.challenge_code,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ battle: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "pvp/state": async (req, context) => {
    try {
      if (req.method !== "GET") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use GET to fetch battle state", 405);
      }
      const student = requireStudent(context);
      const url = new URL(req.url);
      const battleId = requireQueryValue(url, "battleId");
      const { data, error } = await supabaseAdmin.rpc("get_bh_pvp_state", {
        p_player_id: student.userId,
        p_battle_id: battleId,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ state: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "pvp/answer": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to answer PvP questions", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        battle_id: ensureString(body["battleId"] ?? body["battle_id"], "battleId"),
        question_id: ensureString(body["questionId"] ?? body["question_id"], "questionId"),
        answer: ensureString(body["answer"], "answer"),
        time_taken: ensureOptionalNumber(body["timeTaken"] ?? body["time_taken"], "timeTaken"),
      };
      const { data, error } = await supabaseAdmin.rpc("submit_bh_pvp_answer", {
        p_player_id: student.userId,
        p_battle_id: payload.battle_id,
        p_question_id: payload.question_id,
        p_answer: payload.answer,
        p_time_taken: payload.time_taken,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ answer: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "pvp/resolve": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to resolve a PvP battle", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        battle_id: ensureString(body["battleId"] ?? body["battle_id"], "battleId"),
      };
      const { data, error } = await supabaseAdmin.rpc("resolve_bh_pvp_battle", {
        p_player_id: student.userId,
        p_battle_id: payload.battle_id,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ result: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "teacher/summary": async (req, context) => {
    try {
      if (req.method !== "GET") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use GET for teacher analytics", 405);
      }
      const teacher = requireTeacher(context);
      const url = new URL(req.url);
      const classId = requireQueryValue(url, "classId");
      const [topics, taskGroups] = await Promise.all([
        supabaseAdmin.rpc("get_bh_class_topic_summary", {
          p_teacher_id: teacher.userId,
          p_class_id: classId,
        }),
        supabaseAdmin.rpc("get_bh_task_group_summary", {
          p_teacher_id: teacher.userId,
          p_class_id: classId,
        }),
      ]);
      if (topics.error) throw new ApiError("RPC_ERROR", topics.error.message, 502);
      if (taskGroups.error) throw new ApiError("RPC_ERROR", taskGroups.error.message, 502);
      return sendSuccess({ topics: topics.data ?? [], taskGroups: taskGroups.data ?? [] });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "teacher/student": async (req, context) => {
    try {
      if (req.method !== "GET") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use GET for student analytics", 405);
      }
      const teacher = requireTeacher(context);
      const url = new URL(req.url);
      const studentId = requireQueryValue(url, "studentId");
      const [missions, mastery] = await Promise.all([
        supabaseAdmin.rpc("get_bh_student_missions", {
          p_teacher_id: teacher.userId,
          p_student_id: studentId,
        }),
        supabaseAdmin.rpc("get_bh_student_mastery", {
          p_teacher_id: teacher.userId,
          p_student_id: studentId,
        }),
      ]);
      if (missions.error) throw new ApiError("RPC_ERROR", missions.error.message, 502);
      if (mastery.error) throw new ApiError("RPC_ERROR", mastery.error.message, 502);
      return sendSuccess({ missions: missions.data ?? [], mastery: mastery.data ?? [] });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "scheduling/missions": async (req, context) => {
    try {
      if (req.method !== "POST" && req.method !== "PUT") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST or PUT for scheduling missions", 405);
      }
      const teacher = requireTeacher(context);
      const url = new URL(req.url);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const missionId = getQueryValue(url, "id");
      const payload = {
        class_id: ensureString(body["classId"] ?? body["class_id"], "classId"),
        topic_id: ensureOptionalString(body["topicId"] ?? body["topic_id"], "topicId"),
        task_group_id: ensureOptionalString(body["taskGroupId"] ?? body["task_group_id"], "taskGroupId"),
        starts_at: ensureString(body["startsAt"] ?? body["starts_at"], "startsAt"),
        ends_at: ensureString(body["endsAt"] ?? body["ends_at"], "endsAt"),
        goal_description: ensureOptionalString(body["goalDescription"] ?? body["goal_description"], "goalDescription"),
      };
      if (req.method === "POST") {
        const { data, error } = await supabaseAdmin
          .from("bh_scheduled_missions")
          .insert({
            class_id: payload.class_id,
            topic_id: payload.topic_id,
            task_group_id: payload.task_group_id,
            starts_at: payload.starts_at,
            ends_at: payload.ends_at,
            goal_description: payload.goal_description,
            owner_teacher_id: teacher.userId,
          })
          .select("*")
          .single();
        if (error) throw new ApiError("DB_ERROR", error.message, 500);
        return sendSuccess({ mission: data }, 201);
      }
      if (!missionId) {
        throw new ApiError("INVALID_QUERY", "Missing id for update");
      }
      const { data, error } = await supabaseAdmin
        .from("bh_scheduled_missions")
        .update({
          class_id: payload.class_id,
          topic_id: payload.topic_id,
          task_group_id: payload.task_group_id,
          starts_at: payload.starts_at,
          ends_at: payload.ends_at,
          goal_description: payload.goal_description,
        })
        .eq("id", missionId)
        .eq("owner_teacher_id", teacher.userId)
        .select("*")
        .single();
      if (error) throw new ApiError("DB_ERROR", error.message, 500);
      return sendSuccess({ mission: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "scheduling/assignments": async (req, context) => {
    try {
      if (req.method !== "GET") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use GET to fetch scheduled missions", 405);
      }
      const url = new URL(req.url);
      const windowFilter = (getQueryValue(url, "window") ?? "all").toLowerCase();
      const nowIso = new Date().toISOString();
      const query = supabaseAdmin
        .from("bh_scheduled_missions")
        .select("*")
        .order("starts_at", { ascending: false });

      if (context.role === "teacher") {
        const classId = getQueryValue(url, "classId");
        if (!classId) {
          throw new ApiError("INVALID_QUERY", "classId is required for teacher scheduling lookups");
        }
        query.eq("class_id", classId).eq("owner_teacher_id", context.userId);
      } else {
        if (!context.classId) {
          throw new ApiError("INVALID_CONTEXT", "Class id header required for students");
        }
        query.eq("class_id", context.classId);
      }

      if (windowFilter === "active") {
        query.lte("starts_at", nowIso).gte("ends_at", nowIso);
      } else if (windowFilter === "future") {
        query.gt("starts_at", nowIso);
      } else if (windowFilter === "past") {
        query.lt("ends_at", nowIso);
      }

      const { data, error } = await query;
      if (error) throw new ApiError("DB_ERROR", error.message, 500);
      return sendSuccess({ missions: data ?? [] });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "rewards/apply": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to apply rewards", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const xpDelta = ensureOptionalNumber(body["xpDelta"] ?? body["xp_delta"], "xpDelta") ?? 0;
      const coinsDelta = ensureOptionalNumber(body["coinsDelta"] ?? body["coins_delta"], "coinsDelta") ?? 0;
      const gemstonesDelta = ensureOptionalNumber(body["gemstonesDelta"] ?? body["gemstones_delta"], "gemstonesDelta") ?? 0;
      const applyLevelMilestone = Boolean(body["applyLevelMilestone"] ?? body["apply_level_milestone"]);

      const { data: currentProfile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("id, xp, coins, gemstones, level, username")
        .eq("id", student.userId)
        .single();

      if (profileError || !currentProfile) {
        throw new ApiError("PROFILE_NOT_FOUND", "Failed to load profile", 404, profileError);
      }

      const previousLevel = currentProfile.level ?? 1;
      const nextXp = Math.max(0, (currentProfile.xp ?? 0) + xpDelta);
      const nextCoins = Math.max(0, (currentProfile.coins ?? 0) + coinsDelta);
      let nextGemstones = Math.max(0, (currentProfile.gemstones ?? 0) + gemstonesDelta);

      let xpStatus: Record<string, unknown> | null = null;
      if (xpDelta !== 0) {
        const { data: statusData } = await supabaseAdmin.rpc("xp_status", { p_xp: nextXp });
        if (statusData && typeof statusData === "object" && "level" in statusData) {
          xpStatus = statusData as Record<string, unknown>;
        }
      }

      const LEVEL_MILESTONE_INTERVAL = 5;
      const LEVEL_MILESTONE_GEMSTONE_REWARD = 3;

      if (
        applyLevelMilestone &&
        xpStatus &&
        typeof xpStatus["level"] === "number" &&
        xpStatus["level"] > previousLevel
      ) {
        if (xpStatus["level"] % LEVEL_MILESTONE_INTERVAL === 0) {
          nextGemstones += LEVEL_MILESTONE_GEMSTONE_REWARD;
        }
      }

      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          xp: nextXp,
          coins: nextCoins,
          gemstones: nextGemstones,
        })
        .eq("id", student.userId)
        .select("xp, coins, level, gemstones, username")
        .single();

      if (updateError || !updatedProfile) {
        throw new ApiError("REWARD_UPDATE_FAILED", "Failed to apply rewards", 500, updateError);
      }

      return sendSuccess({ profile: updatedProfile, xpStatus, previousLevel });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "clan-territory/finish": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to complete a territory mission", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const payload = {
        mission_id: ensureString(body["missionId"] ?? body["mission_id"], "missionId"),
        region_id: ensureString(body["regionId"] ?? body["region_id"], "regionId"),
        attempt_id: ensureOptionalString(body["attemptId"] ?? body["attempt_id"], "attemptId"),
        answers: body["answers"] ?? body["attempts"] ?? [],
      };

      const { data, error } = await supabaseAdmin.rpc("finish_bh_clan_territory_mission", {
        p_student_id: student.userId,
        p_mission_id: payload.mission_id,
        p_region_id: payload.region_id,
        p_attempt_id: payload.attempt_id ?? null,
        p_answers: payload.answers,
      });
      if (error) throw new ApiError("RPC_ERROR", error.message, 502);
      return sendSuccess({ summary: data });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/bh_api\/?/, "").replace(/\/$/, "");
    if (!path) {
      return sendError("NOT_FOUND", "Route not found", 404);
    }

    const handler = handlers[path];
    if (!handler) {
      return sendError("NOT_FOUND", "Route not found", 404);
    }

    const context = await getAuthContext(req);
    return await handler(req, context);
  } catch (error) {
    return handleApiError(error);
  }
});
