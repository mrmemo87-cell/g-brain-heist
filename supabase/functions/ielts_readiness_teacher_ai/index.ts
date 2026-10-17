import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import {
  READINESS_DRAFT_PROMPT,
  readinessDraftSchema,
  validateReadinessDraft,
} from "../_shared/ieltsReadinessDraft.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const model =
  Deno.env.get("IELTS_READINESS_DRAFT_MODEL")?.trim() || "gpt-4.1-2025-04-14";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("authorization");
  if (!auth?.match(/^Bearer\s+\S+$/i))
    return json(401, { error: "sign_in_required" });
  if (Number(req.headers.get("content-length") || 0) > 2000)
    return json(413, { error: "invalid_request" });
  const raw = await req.text();
  if (raw.length > 2000) return json(413, { error: "invalid_request" });
  const body = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  if (
    !body ||
    !uuid.test(String(body.schoolId || "")) ||
    !uuid.test(String(body.studentId || "")) ||
    Object.keys(body).some((key) => !["schoolId", "studentId"].includes(key))
  )
    return json(400, { error: "invalid_request" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!url || !anon || !secret || !apiKey)
    return json(503, { error: "ai_unavailable" });
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: authError } = await caller.auth.getUser();
  if (authError || !identity.user)
    return json(401, { error: "sign_in_required" });
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // This RPC repeats the current teacher/group/school authorization before any AI request.
  const { data: claim, error: claimError } = await caller.rpc(
    "rpc_ielts_claim_readiness_ai",
    { p_school: body.schoolId, p_student: body.studentId, p_model: model },
  );
  if (claimError) {
    const reason = claimError.message;
    return json(
      reason === "ai_rate_limit" || reason === "ai_already_working" ? 429 : 403,
      {
        error:
          reason === "ai_rate_limit"
            ? "ai_rate_limit"
            : reason === "ai_already_working"
              ? "ai_already_working"
              : "review_not_available",
      },
    );
  }
  const envelope = (fields: unknown) => ({
    id: claim.id,
    fields,
    source_hash: claim.source_hash,
    teacher_confirmation_required: true,
  });
  if (claim.fields) return json(200, envelope(claim.fields));
  try {
    const context = claim.context;
    // Authoritative bounded task context; no browser-supplied work or keys.
    const signal = AbortSignal.timeout(45000);
    let fields;
    let providerId: string | null = null;
    let validationReason = "invalid_output";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            store: false,
            max_completion_tokens: 3000,
            messages: [
              {
                role: "system",
                content:
                  READINESS_DRAFT_PROMPT +
                  (attempt
                    ? `\nThe previous output failed ${validationReason}. Use null unsupported ranges, all required fields, and the stated text limits. Check source references character-for-character. Do not invent evidence.`
                    : ""),
              },
              { role: "user", content: JSON.stringify(context) },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "ielts_readiness_discussion_draft",
                strict: true,
                schema: readinessDraftSchema(context.evidence.map((e: { source_id: string }) => e.source_id)),
              },
            },
          }),
        },
      );
      if (!response.ok) {
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        )
          continue;
        console.warn("Readiness discussion AI provider rejected", { status: response.status });
        throw new Error("provider_unavailable");
      }
      const output = await response.json();
      const choice = output.choices?.[0];
      try {
        if (
          choice?.finish_reason !== "stop" ||
          choice.message?.refusal ||
          !choice.message?.content
        )
          throw new Error("incomplete_draft");
        fields = validateReadinessDraft(
          JSON.parse(choice.message.content),
          context.evidence,
        );
        providerId = String(output.id || "");
        break;
      } catch (error) {
        validationReason = error instanceof Error && ["invalid_plan", "invalid_study_goal", "invalid_next_action", "invalid_review_date", "invalid_goal_count", "invalid_pathway", "evidence_required", "invalid_goal", "incomplete_draft"].includes(error.message) ? error.message : "invalid_output";
        console.warn("Readiness discussion AI validation rejected", { attempt, reason: validationReason });
        if (attempt > 0) throw new Error("draft_validation_failed");
      }
    }
    if (!fields) throw new Error("draft_validation_failed");
    const { error: finishError } = await admin.rpc("rpc_ielts_finish_readiness_ai", {
      p_id: claim.id,
      p_fields: fields,
      p_provider: providerId,
    });
    if (finishError) {
      console.warn("Readiness discussion AI save rejected", { code: finishError.code });
      throw new Error("draft_save_failed");
    }
    // Recheck revoked allocation/banned account before returning private feedback.
    const { data: access, error: accessError } = await caller.rpc(
      "rpc_ielts_learning_report_context",
      { p_school: body.schoolId, p_student: body.studentId },
    );
    if (accessError || !access?.can_manage)
      return json(403, { error: "review_not_available" });
    return json(200, envelope(fields));
  } catch (error) {
    await admin.rpc("rpc_ielts_finish_readiness_ai", {
      p_id: claim.id,
      p_fields: null,
      p_provider: null,
    });
    // Never log student text, provider bodies, personal data or credentials.
    console.warn("Readiness discussion AI draft unavailable", { draftId: claim.id, reason: error instanceof Error && ["provider_unavailable", "draft_validation_failed", "draft_save_failed", "TimeoutError"].includes(error.message) ? error.message : "request_failed" });
    return json(503, { error: "ai_unavailable" });
  }
});
