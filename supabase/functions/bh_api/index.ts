import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

type Role = "teacher" | "student" | "admin" | "school_admin";

type AuthContext = {
  userId: string;
  role: Role;
  schoolId?: string;
  classIds: string[];
};

type Handler = (req: Request, context: AuthContext) => Promise<Response>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-brains-class-id, x-bh-api-route",
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
    .select("role, school_id")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile?.role) {
    throw new ApiError("FORBIDDEN", "Unable to resolve user role", 403, profileError?.message);
  }

  let classIds: string[] = [];
  const role = profile.role as Role;
  if (role === "teacher") {
    const { data: teacherProfile, error: teacherError } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (teacherError || !teacherProfile?.id) {
      throw new ApiError("FORBIDDEN", "Teacher profile not found", 403, teacherError?.message);
    }
    const { data: classes, error: classesError } = await supabaseAdmin
      .from("classes")
      .select("id")
      .eq("teacher_id", teacherProfile.id)
      .eq("is_active", true);
    if (classesError) {
      throw new ApiError("FORBIDDEN", "Unable to resolve teacher classes", 403, classesError.message);
    }
    classIds = (classes ?? []).map((row) => String((row as { id: string }).id));
  } else if (role === "student") {
    const { data: classes, error: classesError } = await supabaseAdmin
      .from("class_students")
      .select("class_id")
      .eq("student_id", authData.user.id);
    if (classesError) {
      throw new ApiError("FORBIDDEN", "Unable to resolve student classes", 403, classesError.message);
    }
    classIds = (classes ?? []).map((row) => String((row as { class_id: string }).class_id));
  }

  return {
    userId: authData.user.id,
    role,
    schoolId: (profile as { school_id?: string | null }).school_id ?? undefined,
    classIds,
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

const requireTeacherClassAccess = (context: AuthContext, classId: string): string => {
  if (!context.classIds.includes(classId)) {
    throw new ApiError("FORBIDDEN", "Class not accessible for this teacher", 403);
  }
  return classId;
};

const resolveStudentClassScope = (context: AuthContext, req: Request): string => {
  if (context.classIds.length === 0) {
    throw new ApiError("FORBIDDEN", "Student is not enrolled in any class", 403);
  }
  const url = new URL(req.url);
  const requested = getQueryValue(url, "classId");
  if (requested) {
    if (!context.classIds.includes(requested)) {
      throw new ApiError("FORBIDDEN", "Class not accessible for this student", 403);
    }
    return requested;
  }
  if (context.classIds.length > 1) {
    throw new ApiError("INVALID_QUERY", "classId is required when enrolled in multiple classes", 400);
  }
  return context.classIds[0];
};

const createCrudHandler = <TPayload extends Record<string, unknown>, TResult = TPayload>(
  options: {
    table: string;
    select?: string;
    mapPayload: (payload: unknown, action: "create" | "update", context: AuthContext) => TPayload;
    mapResult?: (result: TResult | TResult[]) => unknown;
    idColumn?: string;
    ownerColumn?: string;
  },
): Handler => {
  const { table, select = "*", mapPayload, mapResult, idColumn = "id", ownerColumn } = options;

  return async (req, context) => {
    try {
      requireTeacher(context);
      const url = new URL(req.url);
      const id = getQueryValue(url, "id");
      const body = await parseJsonBody(req);

      switch (req.method) {
        case "GET": {
          if (id) {
            let readQuery = supabaseAdmin.from(table).select(select).eq(idColumn, id);
            if (ownerColumn) {
              readQuery = readQuery.eq(ownerColumn, context.userId);
            }
            const { data, error } = await readQuery.single();
            if (error) throw new ApiError("DB_ERROR", error.message, 500);
            const normalized = data as TResult;
            return sendSuccess(mapResult ? mapResult(normalized) : normalized);
          }
          let listQuery = supabaseAdmin.from(table).select(select).order("created_at", { ascending: true });
          if (ownerColumn) {
            listQuery = listQuery.eq(ownerColumn, context.userId);
          }
          const { data, error } = await listQuery;
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
          let updateQuery = supabaseAdmin.from(table).update(payload).eq(idColumn, id);
          if (ownerColumn) {
            updateQuery = updateQuery.eq(ownerColumn, context.userId);
          }
          const { data, error } = await updateQuery.select(select).single();
          if (error) throw new ApiError("DB_ERROR", error.message, 500);
          const normalized = data as TResult;
          return sendSuccess(mapResult ? mapResult(normalized) : normalized);
        }
        case "DELETE": {
          if (!id) throw new ApiError("INVALID_QUERY", "Missing id for delete");
          let deleteQuery = supabaseAdmin.from(table).delete().eq(idColumn, id);
          if (ownerColumn) {
            deleteQuery = deleteQuery.eq(ownerColumn, context.userId);
          }
          const { error } = await deleteQuery;
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
    ownerColumn: "owner_teacher_id",
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
    ownerColumn: "owner_teacher_id",
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
    ownerColumn: "owner_teacher_id",
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
    ownerColumn: "owner_teacher_id",
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
      const classId = requireTeacherClassAccess(teacher, requireQueryValue(url, "classId"));
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
        class_id: requireTeacherClassAccess(teacher, ensureString(body["classId"] ?? body["class_id"], "classId")),
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
        query.eq("class_id", requireTeacherClassAccess(context, classId)).eq("owner_teacher_id", context.userId);
      } else {
        query.eq("class_id", resolveStudentClassScope(context, req));
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
      if (
        body["xpDelta"] !== undefined || body["xp_delta"] !== undefined ||
        body["coinsDelta"] !== undefined || body["coins_delta"] !== undefined ||
        body["gemstonesDelta"] !== undefined || body["gemstones_delta"] !== undefined
      ) {
        throw new ApiError("INVALID_REWARD_SOURCE", "Reward deltas are not accepted. Submit event_type and event_id only.", 400);
      }

      const eventType = ensureString(body["eventType"] ?? body["event_type"], "eventType");
      const eventId = ensureString(body["eventId"] ?? body["event_id"], "eventId");
      const idempotencyKey = ensureOptionalString(body["idempotencyKey"] ?? body["idempotency_key"], "idempotencyKey") ?? eventId;

      if (eventType === "question_attempt") {
        const { data: attempt, error: attemptError } = await supabaseAdmin
          .from("question_attempts")
          .select("id")
          .eq("id", eventId)
          .eq("student_id", student.userId)
          .maybeSingle();
        if (attemptError || !attempt) {
          throw new ApiError("INVALID_EVENT_CONTEXT", "Question attempt event not found for this student", 403);
        }
      } else if (eventType === "pvp_attack") {
        const { data: attack, error: attackError } = await supabaseAdmin
          .from("pvp_attack_attempts")
          .select("request_id")
          .eq("request_id", eventId)
          .or(`attacker_id.eq.${student.userId},defender_id.eq.${student.userId}`)
          .maybeSingle();
        if (attackError || !attack) {
          throw new ApiError("INVALID_EVENT_CONTEXT", "PvP attack event not found for this user", 403);
        }
      } else if (eventType === "shop_purchase") {
        const { data: purchase, error: purchaseError } = await supabaseAdmin
          .from("shop_purchases")
          .select("id")
          .eq("id", eventId)
          .eq("user_id", student.userId)
          .maybeSingle();
        if (purchaseError || !purchase) {
          throw new ApiError("INVALID_EVENT_CONTEXT", "Shop purchase event not found for this user", 403);
        }
      } else {
        throw new ApiError("EVENT_TYPE_UNSUPPORTED", "Unsupported reward event type", 400);
      }

      const { data: receipt, error: receiptError } = await supabaseAdmin
        .from("reward_event_receipts")
        .insert({
          user_id: student.userId,
          event_type: eventType,
          event_id: eventId,
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .maybeSingle();
      if (receiptError && receiptError.code !== "23505") {
        throw new ApiError("IDEMPOTENCY_ERROR", "Failed to record reward event receipt", 500, receiptError.message);
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("xp, coins, level, gemstones, username")
        .eq("id", student.userId)
        .single();
      if (profileError || !profile) {
        throw new ApiError("PROFILE_NOT_FOUND", "Failed to load profile", 404, profileError);
      }

      return sendSuccess({
        profile,
        event_type: eventType,
        event_id: eventId,
        idempotent: !receipt,
      });
    } catch (error) {
      return handleApiError(error);
    }
  },
  "tasks/claim": async (req, context) => {
    try {
      if (req.method !== "POST") {
        throw new ApiError("METHOD_NOT_ALLOWED", "Use POST to claim task rewards", 405);
      }
      const student = requireStudent(context);
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const taskId = ensureString(body["taskId"] ?? body["task_id"], "taskId");

      const taskCatalog: Record<string, { kind: "daily" | "weekly"; target: number; xp: number; coins: number; gemstones: number }> = {
        task_d1: { kind: "daily", target: 3, xp: 175, coins: 350, gemstones: 1 },
        task_d2: { kind: "daily", target: 1, xp: 100, coins: 50, gemstones: 1 },
        task_w1: { kind: "weekly", target: 15, xp: 500, coins: 400, gemstones: 5 },
      };
      const task = taskCatalog[taskId];
      if (!task) {
        throw new ApiError("TASK_NOT_FOUND", "Task not found", 404);
      }

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      let progress = 0;
      if (taskId === "task_d1") {
        const { data: quests, error } = await supabaseAdmin
          .from("activities")
          .select("id")
          .eq("actor_id", student.userId)
          .eq("kind", "quest_complete")
          .gte("created_at", todayStart.toISOString())
          .lte("created_at", todayEnd.toISOString());
        if (error) throw new ApiError("DB_ERROR", error.message, 500);
        progress = quests?.length ?? 0;

        if (progress === 0) {
          const { data: attempts, error: attemptError } = await supabaseAdmin
            .from("question_attempts")
            .select("quest_session_id")
            .eq("student_id", student.userId)
            .gte("created_at", todayStart.toISOString())
            .lte("created_at", todayEnd.toISOString())
            .not("quest_session_id", "is", null);
          if (attemptError) throw new ApiError("DB_ERROR", attemptError.message, 500);
          progress = new Set((attempts ?? []).map((row) => (row as { quest_session_id?: string | null }).quest_session_id).filter(Boolean)).size;
        }
      } else if (taskId === "task_d2") {
        const { data: wins, error } = await supabaseAdmin
          .from("activities")
          .select("id")
          .eq("actor_id", student.userId)
          .eq("kind", "pvp_win")
          .gte("created_at", todayStart.toISOString())
          .lte("created_at", todayEnd.toISOString());
        if (error) throw new ApiError("DB_ERROR", error.message, 500);
        progress = wins?.length ?? 0;
      } else if (taskId === "task_w1") {
        const { data: claims, error } = await supabaseAdmin
          .from("activities")
          .select("id")
          .eq("actor_id", student.userId)
          .eq("kind", "task_claimed")
          .gte("created_at", weekStart.toISOString());
        if (error) throw new ApiError("DB_ERROR", error.message, 500);
        progress = claims?.length ?? 0;
      }

      if (progress < task.target) {
        throw new ApiError("TASK_NOT_COMPLETED", "Task not completed yet", 400);
      }

      const claimWindowStart = task.kind === "daily" ? todayStart.toISOString() : weekStart.toISOString();
      const { data: alreadyClaimed, error: claimLookupError } = await supabaseAdmin
        .from("activities")
        .select("id")
        .eq("actor_id", student.userId)
        .eq("kind", "task_claimed")
        .eq("data->>task_id", taskId)
        .eq("data->>task_kind", task.kind)
        .gte("created_at", claimWindowStart)
        .limit(1);
      if (claimLookupError) throw new ApiError("DB_ERROR", claimLookupError.message, 500);
      if ((alreadyClaimed?.length ?? 0) > 0) {
        throw new ApiError("TASK_ALREADY_CLAIMED", "Task already claimed", 409);
      }

      const periodKey = task.kind === "daily"
        ? todayStart.toISOString().slice(0, 10)
        : weekStart.toISOString().slice(0, 10);
      const eventId = `task:${taskId}:${periodKey}`;
      const idempotencyKey = `task-claim:${student.userId}:${eventId}`;

      const { data: receipt, error: receiptError } = await supabaseAdmin
        .from("reward_event_receipts")
        .insert({
          user_id: student.userId,
          event_type: "task_reward_claim",
          event_id: eventId,
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .maybeSingle();
      if (receiptError && receiptError.code !== "23505") {
        throw new ApiError("IDEMPOTENCY_ERROR", "Failed to record reward event receipt", 500, receiptError.message);
      }

      const { data: profileBefore, error: profileBeforeError } = await supabaseAdmin
        .from("users")
        .select("xp, coins, level, gemstones")
        .eq("id", student.userId)
        .single();
      if (profileBeforeError || !profileBefore) {
        throw new ApiError("PROFILE_NOT_FOUND", "Failed to load profile", 404, profileBeforeError?.message);
      }

      const alreadyProcessed = !receipt;
      const nextXp = (profileBefore.xp ?? 0) + (alreadyProcessed ? 0 : task.xp);
      const nextCoins = (profileBefore.coins ?? 0) + (alreadyProcessed ? 0 : task.coins);
      const nextGemstones = (profileBefore.gemstones ?? 0) + (alreadyProcessed ? 0 : task.gemstones);

      if (!alreadyProcessed) {
        const { error: profileUpdateError } = await supabaseAdmin
          .from("users")
          .update({
            xp: nextXp,
            coins: nextCoins,
            gemstones: nextGemstones,
          })
          .eq("id", student.userId);
        if (profileUpdateError) {
          throw new ApiError("DB_ERROR", "Failed to apply task reward", 500, profileUpdateError.message);
        }

        const { error: activityError } = await supabaseAdmin
          .from("activities")
          .insert({
            actor_id: student.userId,
            kind: "task_claimed",
            data: {
              task_id: taskId,
              task_kind: task.kind,
              event_id: eventId,
              xp: task.xp,
              coins: task.coins,
              gemstones: task.gemstones,
            },
          });
        if (activityError) {
          throw new ApiError("DB_ERROR", "Failed to record task claim activity", 500, activityError.message);
        }
      }

      return sendSuccess({
        idempotent: alreadyProcessed,
        event_type: "task_reward_claim",
        event_id: eventId,
        task_id: taskId,
        profile: {
          xp: nextXp,
          coins: nextCoins,
          level: profileBefore.level,
          gemstones: nextGemstones,
        },
        reward: {
          xp: task.xp,
          coins: task.coins,
          gemstones: task.gemstones,
        },
      });
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
    const pathFromPathname = url.pathname.replace(/^\/bh_api\/?/, "").replace(/\/$/, "");
    const pathFromQuery = (url.searchParams.get("route") ?? "").replace(/^\/+/, "").replace(/\/$/, "");
    const pathFromHeader = (req.headers.get("x-bh-api-route") ?? "").replace(/^\/+/, "").replace(/\/$/, "");
    const path = pathFromPathname || pathFromQuery || pathFromHeader;
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
