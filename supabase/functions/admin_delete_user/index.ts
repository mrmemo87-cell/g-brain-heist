import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

type DeleteRequest = {
  user_id?: string;
  dry_run?: boolean;
};

type DeleteResponse = {
  version: string;
  success: boolean;
  auth_deleted: boolean;
  rows_deleted: Record<string, number>;
  storage_deleted: number;
  warnings: string[];
  storage_paths?: string[];
  error?: string;
};

const buildCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") ?? "*";
  const requestedHeaders =
    req.headers.get("access-control-request-headers") ??
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": requestedHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
};

const FUNCTION_VERSION = "admin_delete_user_debug_v5";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (req: Request, status: number, payload: DeleteResponse) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...buildCorsHeaders(req) },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const asObjectArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];

const unique = (values: string[]) => [...new Set(values)];

const formatPgError = (error: unknown) => {
  const e = error as { message?: string; details?: string; hint?: string; code?: string } | null;
  const parts = [e?.message, e?.details, e?.hint, e?.code].filter((v): v is string => Boolean(v));
  return parts.join(" | ") || JSON.stringify(error);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(req),
    });
  }

  if (req.method !== "POST") {
    return json(req, 405, {
      version: FUNCTION_VERSION,
      success: false,
      auth_deleted: false,
      rows_deleted: {},
      storage_deleted: 0,
      warnings: ["Only POST is allowed."],
      error: "method_not_allowed",
    });
  }

  const warnings: string[] = [];
  const rowsDeleted: Record<string, number> = {};
  const storagePaths: string[] = [];
  let storageDeleted = 0;
  let actorId = "";
  let targetUserId = "";
  let targetUserEmail = "";
  let dryRun = false;

  const audit = async (result: "success" | "failure") => {
    await admin.from("rpc_event_log").insert({
      function_name: "admin_delete_user_v2",
      log_level: result === "success" ? "info" : "error",
      message: result,
      user_id: actorId || null,
      context: {
        actor_id: actorId || null,
        target_user_id: targetUserId || null,
        target_user_email: targetUserEmail || null,
        timestamp: new Date().toISOString(),
        dry_run: dryRun,
        result,
        rows_deleted: rowsDeleted,
        storage_deleted: storageDeleted,
        warnings,
      },
    });
  };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json(req, 401, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: "missing_bearer_token",
      });
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) {
      return json(req, 401, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: authError?.message || "invalid_token",
      });
    }
    actorId = authData.user.id;

    const { data: superadminRow, error: superadminError } = await admin
      .from("superadmins")
      .select("user_id")
      .eq("user_id", actorId)
      .maybeSingle();

    if (superadminError) {
      return json(req, 403, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: `superadmin_check_failed: ${superadminError.message}`,
      });
    }

    if (!superadminRow?.user_id) {
      return json(req, 403, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: "forbidden_superadmin_only",
      });
    }

    let body: DeleteRequest | null = null;
    try {
      body = (await req.json()) as DeleteRequest;
    } catch {
      return json(req, 400, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings: ["Request body must be valid JSON."],
        error: "invalid_json_body",
      });
    }

    targetUserId = String(body?.user_id ?? "").trim();
    dryRun = Boolean(body?.dry_run);

    if (!isUuid(targetUserId)) {
      return json(req, 400, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: "invalid_user_id",
      });
    }

    if (targetUserId === actorId) {
      return json(req, 400, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: "cannot_delete_self",
      });
    }

    const { data: targetAuthUser, error: targetAuthLookupError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetAuthLookupError || !targetAuthUser?.user) {
      return json(req, 404, {
        version: FUNCTION_VERSION,
        success: false,
        auth_deleted: false,
        rows_deleted: {},
        storage_deleted: 0,
        warnings,
        error: targetAuthLookupError?.message || "target_auth_user_not_found",
      });
    }

    targetUserEmail = String(targetAuthUser.user.email ?? "").trim().toLowerCase();

    // Step 1: Storage discovery/cleanup
    const storageTargets = [
      { bucket: "avatars", prefix: `${targetUserId}/` },
      { bucket: "question-images", prefix: `questions/${targetUserId}/` },
    ];

    for (const storageTarget of storageTargets) {
      let offset = 0;
      while (true) {
        const { data, error } = await admin.storage.from(storageTarget.bucket).list(storageTarget.prefix, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

        if (error) {
          warnings.push(`storage_list_failed:${storageTarget.bucket}:${error.message}`);
          break;
        }

        const rows = asObjectArray(data);
        if (rows.length === 0) break;

        const chunkPaths = rows
          .map((row) => String(row.name ?? ""))
          .filter(Boolean)
          .map((name) => `${storageTarget.prefix}${name}`);

        storagePaths.push(...chunkPaths);
        if (rows.length < 100) break;
        offset += 100;
      }
    }

    if (!dryRun && storagePaths.length > 0) {
      const byBucket = new Map<string, string[]>();
      for (const path of unique(storagePaths)) {
        const bucket = path.startsWith("questions/") ? "question-images" : "avatars";
        const arr = byBucket.get(bucket) ?? [];
        arr.push(path);
        byBucket.set(bucket, arr);
      }

      for (const [bucket, paths] of byBucket.entries()) {
        for (let i = 0; i < paths.length; i += 100) {
          const slice = paths.slice(i, i + 100);
          const { error } = await admin.storage.from(bucket).remove(slice);
          if (error) {
            throw new Error(`storage_delete_failed:${bucket}:${error.message}`);
          }
          storageDeleted += slice.length;
        }
      }
    }

    // Deletion helpers
    const countRows = async (table: string, apply: (q: any) => any): Promise<number | null> => {
      const query = apply(admin.from(table).select("*", { count: "exact", head: true }));
      const { count, error } = await query;
      if (error) {
        if (error.code === "42P01") {
          warnings.push(`table_missing:${table}`);
          return 0;
        }
        warnings.push(`count_failed:${table}:${formatPgError(error)}`);
        return null;
      }
      return count ?? 0;
    };

    const deleteRows = async (table: string, apply: (q: any) => any) => {
      const count = await countRows(table, apply);
      rowsDeleted[table] = count ?? 0;
      if (dryRun) return;
      if (count === 0) return;
      if (count === null) {
        warnings.push(`count_unknown_delete_attempted:${table}`);
      }

      const query = apply(admin.from(table).delete());
      const { error } = await query;
      if (error) {
        if (error.code === "42P01") {
          warnings.push(`table_missing:${table}`);
          return;
        }
        throw new Error(`delete_failed:${table}:${formatPgError(error)}`);
      }
    };

  // Step 2 temporarily disabled while isolating JSON filter crash

    // Step 3: Explicit FK/non-cascade cleanup where schema may vary
    const directUserDeletes: Array<{ table: string; columns: string[] }> = [
      { table: "ielts_sessions", columns: ["user_id", "student_id"] },
      { table: "ielts_violation_logs", columns: ["user_id"] },
      { table: "ielts_admin_notes", columns: ["user_id"] },
      { table: "ielts_admin_user_tags", columns: ["user_id"] },
      { table: "ielts_memberships", columns: ["user_id"] },
      { table: "ielts_prime_applications", columns: ["user_id"] },
      { table: "ielts_notification_preferences", columns: ["user_id"] },
      { table: "user_onboarding", columns: ["user_id"] },
      { table: "onboarding_events", columns: ["user_id"] },
      { table: "user_sessions", columns: ["user_id"] },
      { table: "auth_tokens", columns: ["user_id"] },
      { table: "password_reset_tokens", columns: ["user_id"] },
      { table: "email_verification_tokens", columns: ["user_id"] },
      { table: "bh_writing_student_profiles", columns: ["student_id"] },
      { table: "bh_writing_student_states", columns: ["student_id"] },
      { table: "bh_writing_calibration_followups", columns: ["student_id"] },
      // Preserve admin audit history; schema is not user_id-based in production.
      { table: "question_attempts", columns: ["student_id"] },
      { table: "attempts", columns: ["user_id"] },
      { table: "activity_reactions", columns: ["user_id"] },
      { table: "activities", columns: ["actor_id", "target_id"] },
      { table: "clan_chat", columns: ["user_id"] },
      { table: "clan_join_requests", columns: ["user_id", "approved_by"] },
      { table: "clan_members", columns: ["user_id"] },
      { table: "clans", columns: ["leader_id"] },
      { table: "inventory", columns: ["user_id"] },
      { table: "sessions", columns: ["user_id"] },
      { table: "tasks", columns: ["user_id"] },
      { table: "caps", columns: ["user_id"] },
      { table: "shop_purchases", columns: ["user_id"] },
      { table: "announcement_receipts", columns: ["user_id"] },
      { table: "class_students", columns: ["student_id"] },
      { table: "teachers", columns: ["user_id"] },
      { table: "school_members", columns: ["user_id"] },
      { table: "school_requests", columns: ["requested_by", "reviewed_by"] },
      { table: "superadmins", columns: ["user_id"] },
      { table: "pvp_attack_attempts", columns: ["attacker_id", "defender_id"] },
      { table: "brains_heist_class_memberships", columns: ["student_id"] },
      { table: "brains_heist_student_attempts", columns: ["student_id"] },
      { table: "brains_heist_topic_stats", columns: ["student_id"] },
      { table: "brains_heist_task_group_stats", columns: ["student_id"] },
      { table: "brains_heist_progress_map", columns: ["student_id"] },
      { table: "brains_heist_adaptive_snapshots", columns: ["student_id"] },
      { table: "brains_heist_battle_events", columns: ["student_id"] },
      { table: "brains_heist_battles", columns: ["challenger_id", "opponent_id", "winner_id"] },
      { table: "brains_heist_raid_participants", columns: ["student_id"] },
      { table: "brains_heist_raids", columns: ["created_by"] },
      { table: "brains_heist_homework_schedule", columns: ["teacher_id"] },
      { table: "brains_heist_assignments", columns: ["teacher_id"] },
      { table: "brains_heist_questions", columns: ["teacher_id"] },
      { table: "brains_heist_task_groups", columns: ["teacher_id"] },
      { table: "ielts_users", columns: ["id"] },
    ];

    const resolveValidUserColumns = async (table: string, columns: string[]) => {
      const validColumns: string[] = [];

      for (const column of unique(columns)) {
        const { error } = await admin.from(table).select(column, { count: "exact", head: true }).eq(column, targetUserId);

        if (!error) {
          validColumns.push(column);
          continue;
        }

        if (error.code === "42703") {
          warnings.push(`invalid_user_column:${table}.${column}`);
          continue;
        }

        if (error.code === "42P01") {
          warnings.push(`table_missing:${table}`);
          return [];
        }

        warnings.push(`column_probe_failed:${table}.${column}:${formatPgError(error)}`);
      }

      return validColumns;
    };

    for (const spec of directUserDeletes) {
      const validColumns = await resolveValidUserColumns(spec.table, spec.columns);
      if (validColumns.length === 0) {
        rowsDeleted[spec.table] = 0;
        warnings.push(`no_valid_user_columns:${spec.table}`);
        continue;
      }

      const filter = validColumns.map((c) => `${c}.eq.${targetUserId}`).join(",");
      await deleteRows(spec.table, (q) => q.or(filter));
    }

    // Step 4: delete public.users rows by id and (defensively) by email.
    // Older data may contain orphan rows where email is still occupied by a previously deleted account.
    await deleteRows("users", (q) => q.eq("id", targetUserId));
    if (targetUserEmail) {
      await deleteRows("users", (q) => q.eq("email", targetUserEmail));
    }

    // Step 5: delete auth user last
    if (!dryRun) {
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) {
        throw new Error(`auth_delete_failed:${error.message}`);
      }
    }

    await audit("success");

    return json(req, 200, {
      version: FUNCTION_VERSION,
      success: true,
      auth_deleted: dryRun ? false : true,
      rows_deleted: rowsDeleted,
      storage_deleted: storageDeleted,
      storage_paths: unique(storagePaths),
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    warnings.push(message);
    await audit("failure");
    return json(req, 500, {
      version: FUNCTION_VERSION,
      success: false,
      auth_deleted: false,
      rows_deleted: rowsDeleted,
      storage_deleted: storageDeleted,
      storage_paths: unique(storagePaths),
      warnings,
      error: message,
    });
  }
});
