import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const REVIEW_MODEL = Deno.env.get("SHORT_ANSWER_REVIEW_MODEL") || "gpt-5.6-sol";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing required Supabase environment variables.");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResponse = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...corsHeaders } });
const bearerToken = (header: string | null) => header?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const extractResponseText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text;
    }
  }
  return null;
};

type ReviewDecision = { is_correct: boolean; confidence: number; rationale: string };

const judgeAnswer = async (snapshot: Record<string, unknown>, studentAnswer: string): Promise<ReviewDecision> => {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const acceptedAnswers = Array.isArray(snapshot.accepted_answers) ? snapshot.accepted_answers.map(String).map((v) => v.trim()).filter(Boolean).slice(0, 12) : [];
  const correctAnswer = String(snapshot.correct_answer || "").trim();
  const explanation = String(snapshot.explanation || "").trim().slice(0, 4000);
  const question = String(snapshot.question_text || "").trim().slice(0, 4000);
  const prompt = [
    "You are a conservative school-assessment marker reviewing one short-answer response.",
    "Decide only whether the student's answer is meaningfully equivalent to a fully correct answer.",
    "Do not award credit merely for being related, mentioning one keyword, or showing partial knowledge.",
    "Ignore harmless capitalization, punctuation, notation, abbreviation, or wording differences when meaning is fully preserved.",
    "Use the explanation only to understand the intended answer; do not invent facts beyond the supplied marking information.",
    "If the response is ambiguous, incomplete, contradictory, or materially broader/narrower than the expected answer, mark it incorrect.",
    "Return a concise rationale for audit purposes; it is not student-facing.",
    "",
    `Question: ${question}`,
    `Canonical answer: ${correctAnswer}`,
    `Accepted deterministic answers: ${acceptedAnswers.length ? acceptedAnswers.join(" | ") : correctAnswer}`,
    explanation ? `Teacher/source explanation: ${explanation}` : "",
    `Student answer: ${studentAnswer}`,
  ].filter(Boolean).join("\n");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: REVIEW_MODEL,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
          text: { format: { type: "json_schema", name: "short_answer_review", strict: true, schema: {
            type: "object", additionalProperties: false, required: ["is_correct", "confidence", "rationale"],
            properties: { is_correct: { type: "boolean" }, confidence: { type: "number", minimum: 0, maximum: 1 }, rationale: { type: "string" } },
          } } },
        }),
      });
      if (!response.ok) throw new Error(`AI review failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
      const payload = await response.json() as Record<string, unknown>;
      const text = extractResponseText(payload);
      if (!text) throw new Error("AI review returned no structured output.");
      const parsed = JSON.parse(text) as Partial<ReviewDecision>;
      if (typeof parsed.is_correct !== "boolean" || !Number.isFinite(Number(parsed.confidence))) throw new Error("AI review returned an invalid decision.");
      return { is_correct: parsed.is_correct, confidence: Math.max(0, Math.min(1, Number(parsed.confidence))), rationale: String(parsed.rationale || "").slice(0, 2000) };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError || new Error("AI review failed.");
};

const processReview = async (answerId: string) => {
  const { data: claimed, error: claimError } = await admin.rpc("rpc_claim_short_answer_review", { p_answer_id: answerId });
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.claimed) return;
  try {
    const assignmentId = String(claimed.assignment_id || "");
    const questionId = String(claimed.question_id || "");
    const { data: aq, error: snapshotError } = await admin.from("assignment_questions").select("question_snapshot").eq("assignment_id", assignmentId).eq("question_id", questionId).single();
    if (snapshotError || !aq?.question_snapshot) throw new Error(snapshotError?.message || "Assignment question snapshot not found.");
    const snapshot = aq.question_snapshot as Record<string, unknown>;
    if (String(snapshot.question_type || "") !== "short_answer") throw new Error("Semantic review is restricted to short-answer questions.");
    const decision = await judgeAnswer(snapshot, String(claimed.student_answer || ""));
    const { error: applyError } = await admin.rpc("rpc_apply_short_answer_review", { p_answer_id: answerId, p_is_correct: decision.is_correct, p_confidence: decision.confidence, p_model: REVIEW_MODEL, p_rationale: decision.rationale });
    if (applyError) throw new Error(applyError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.rpc("rpc_release_short_answer_review", { p_answer_id: answerId, p_error: message.slice(0, 2000) });
    console.error("[short-answer-review] review failed", { answerId, message });
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return jsonResponse(401, { error: "authentication_required" });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse(401, { error: "authentication_required" });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const assignmentId = body?.assignmentId;
  const questionId = body?.questionId;
  if (!isUuid(assignmentId) || !isUuid(questionId)) return jsonResponse(400, { error: "invalid_review_target" });
  const { data: answer, error: answerError } = await admin.from("student_assignment_answers").select("id, grading_status").eq("assignment_id", assignmentId).eq("question_id", questionId).eq("student_id", userData.user.id).maybeSingle();
  if (answerError) return jsonResponse(500, { error: "review_lookup_failed" });
  if (!answer || answer.grading_status === "graded") return jsonResponse(200, { accepted: false, alreadyResolved: true });
  if (answer.grading_status === "reviewing") return jsonResponse(202, { accepted: true, alreadyProcessing: true });
  EdgeRuntime.waitUntil(processReview(answer.id));
  return jsonResponse(202, { accepted: true });
});
