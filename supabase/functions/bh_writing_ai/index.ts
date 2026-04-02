import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

type Payload = {
  mode: "feedback" | "plan_assist";
  promptText: string;
  studentResponse?: string;
  weaknesses?: string[];
  grade?: number;
  genre?: string;
};
type AiResult = {
  strengths?: string[];
  weaknesses?: string[];
  next_steps?: string[];
  focus?: string;
  drills?: string[];
  checkpoints?: string[];
  coaching_points?: string[];
  rewritten_prompt?: string;
  daily_task?: string;
  monthly_report_summary?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceKey || !openAiKey) {
  throw new Error("Missing required environment variables.");
}

const supabase = createClient(supabaseUrl, serviceKey);
const openai = new OpenAI({ apiKey: openAiKey });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders } });

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
};

const validatePayload = (payload: Payload | null): string | null => {
  if (!payload) return "Invalid payload";
  if (payload.mode !== "feedback" && payload.mode !== "plan_assist") return "Invalid mode";
  if (!payload.promptText || payload.promptText.trim().length < 12) return "Prompt text is required";
  if (payload.studentResponse && payload.studentResponse.length > 10000) return "studentResponse is too long";
  if (payload.weaknesses && payload.weaknesses.length > 20) return "Too many weaknesses";
  return null;
};

const normalizeAiResult = (mode: Payload["mode"], raw: unknown): AiResult | null => {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (mode === "feedback") {
    const strengths = Array.isArray(value.strengths) ? value.strengths.map(String) : [];
    const weaknesses = Array.isArray(value.weaknesses) ? value.weaknesses.map(String) : [];
    const next_steps = Array.isArray(value.next_steps) ? value.next_steps.map(String) : [];
    const monthly_report_summary = typeof value.monthly_report_summary === "string" ? value.monthly_report_summary : "";
    return { strengths, weaknesses, next_steps, monthly_report_summary };
  }
  const focus = typeof value.focus === "string" ? value.focus : "";
  const drills = Array.isArray(value.drills) ? value.drills.map(String) : [];
  const checkpoints = Array.isArray(value.checkpoints) ? value.checkpoints.map(String) : [];
  const coaching_points = Array.isArray(value.coaching_points) ? value.coaching_points.map(String) : [];
  const rewritten_prompt = typeof value.rewritten_prompt === "string" ? value.rewritten_prompt : "";
  const daily_task = typeof value.daily_task === "string" ? value.daily_task : "";
  return { focus, drills, checkpoints, coaching_points, rewritten_prompt, daily_task };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json(401, { error: "Missing authorization" });

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

  const payload = (await req.json().catch(() => null)) as Payload | null;
  const payloadError = validatePayload(payload);
  if (payloadError) return json(400, { error: payloadError });

  const userPrompt = payload.mode === "feedback"
    ? [
      `Grade: ${payload.grade ?? "unknown"}`,
      `Genre: ${payload.genre ?? "unknown"}`,
      `Task prompt: ${payload.promptText}`,
      `Student response: ${payload.studentResponse ?? ""}`,
      "Return JSON keys:",
      "- strengths: 2 short specific positives",
      "- weaknesses: 2 short plain-English weakness summaries",
      "- next_steps: 2 or 3 actionable coaching steps for the next draft",
      "- monthly_report_summary: 1 short examiner-style summary line for progress reporting",
      "Rules: keep it human, natural, and not robotic.",
    ].join("\n")
    : [
      `Grade: ${payload.grade ?? "unknown"}`,
      `Genre: ${payload.genre ?? "unknown"}`,
      `Known weaknesses: ${JSON.stringify(payload.weaknesses ?? [])}`,
      `Current/seed prompt: ${payload.promptText}`,
      "Return JSON keys:",
      "- focus: plain-English weekly focus title",
      "- coaching_points: 2 or 3 student-facing coaching bullets tied to the weaknesses",
      "- drills: 2 realistic daily task lines",
      "- checkpoints: 2 success checks",
      "- rewritten_prompt: a fuller contextualized writing prompt with clear purpose, audience, and context when suitable",
      "- daily_task: one realistic daily writing task instruction",
      "Rules: grade-sensitive, genre-sensitive, concise, and natural.",
    ].join("\n");

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a strong writing coach/examiner for Brains Heist. Improve wording realism while staying concise. Return strict JSON only.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
      25000
    );

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return json(502, { error: "No model response" });

    const parsed = JSON.parse(content);
    const normalized = normalizeAiResult(payload.mode, parsed);
    if (!normalized) return json(502, { error: "Model response schema invalid" });

    return json(200, { mode: payload.mode, result: normalized });
  } catch (error) {
    console.error("[bh_writing_ai] request failed", error);
    return json(502, { error: error instanceof Error ? error.message : "AI request failed" });
  }
});
