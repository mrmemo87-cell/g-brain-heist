import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

type Mode = "feedback" | "plan_assist" | "prompt_rewrite";

type Payload = {
  mode: Mode;
  promptText: string;
  studentResponse?: string;
  weaknesses?: string[];
  grade?: number;
  genre?: string;
};

type UserRole = "student" | "teacher" | "admin";

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
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
    },
  });

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

const normalizeGrade = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 6 || n > 12) return undefined;
  return n;
};

const normalizeRole = (value: unknown): UserRole | null => {
  if (value === "student" || value === "teacher" || value === "admin") return value;
  return null;
};

const validatePayload = (payload: Payload | null): string | null => {
  if (!payload) return "Invalid payload";
  if (payload.mode !== "feedback" && payload.mode !== "plan_assist" && payload.mode !== "prompt_rewrite") {
    return "Invalid mode";
  }
  if (!payload.promptText || payload.promptText.trim().length < 8) {
    return "Prompt text is required";
  }
  if (payload.studentResponse && payload.studentResponse.length > 10000) {
    return "studentResponse is too long";
  }
  if (payload.weaknesses && payload.weaknesses.length > 20) {
    return "Too many weaknesses";
  }
  if (payload.grade !== undefined && normalizeGrade(payload.grade) === undefined) {
    return "grade must be an integer between 6 and 12";
  }
  return null;
};

const getUserRole = async (
  userId: string,
  fallbackRole?: unknown,
  fallbackIsAdmin?: unknown,
): Promise<UserRole> => {
  const { data, error } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[bh_writing_ai] failed to load role from users table, falling back to auth metadata", error.message);
  }

  if (data?.is_admin === true || data?.role === "admin" || fallbackIsAdmin === true) {
    return "admin";
  }

  if (data?.role === "teacher") return "teacher";
  if (data?.role === "student") return "student";

  const fallback = normalizeRole(fallbackRole);
  return fallback ?? "student";
};

const normalizeAiResult = (mode: Mode, raw: unknown): AiResult | null => {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (mode === "feedback") {
    return {
      strengths: Array.isArray(value.strengths) ? value.strengths.map(String) : [],
      weaknesses: Array.isArray(value.weaknesses) ? value.weaknesses.map(String) : [],
      next_steps: Array.isArray(value.next_steps) ? value.next_steps.map(String) : [],
      monthly_report_summary:
        typeof value.monthly_report_summary === "string" ? value.monthly_report_summary : "",
    };
  }

  if (mode === "plan_assist") {
    return {
      focus: typeof value.focus === "string" ? value.focus : "",
      drills: Array.isArray(value.drills) ? value.drills.map(String) : [],
      checkpoints: Array.isArray(value.checkpoints) ? value.checkpoints.map(String) : [],
      coaching_points: Array.isArray(value.coaching_points) ? value.coaching_points.map(String) : [],
      rewritten_prompt: typeof value.rewritten_prompt === "string" ? value.rewritten_prompt : "",
      daily_task: typeof value.daily_task === "string" ? value.daily_task : "",
    };
  }

  if (mode === "prompt_rewrite") {
    return {
      rewritten_prompt:
        typeof value.rewritten_prompt === "string"
          ? value.rewritten_prompt
          : typeof value.prompt === "string"
          ? value.prompt
          : "",
    };
  }

  return null;
};

const buildUserPrompt = (payload: Payload): string => {
  const grade = normalizeGrade(payload.grade) ?? "unknown";
  const genre = payload.genre?.trim() || "unknown";

  if (payload.mode === "feedback") {
    return [
      `Grade: ${grade}`,
      `Genre: ${genre}`,
      `Task prompt: ${payload.promptText}`,
      `Student response: ${payload.studentResponse ?? ""}`,
      "Return strict JSON only with keys:",
      "- strengths: 2 short specific positives",
      "- weaknesses: 2 short plain-English weakness summaries",
      "- next_steps: 2 or 3 clear actionable next steps",
      "- monthly_report_summary: 1 short progress summary sentence",
      "Keep the tone natural, helpful, and concise.",
    ].join("\n");
  }

  if (payload.mode === "plan_assist") {
    return [
      `Grade: ${grade}`,
      `Genre: ${genre}`,
      `Known weaknesses: ${JSON.stringify(payload.weaknesses ?? [])}`,
      `Current task/prompt: ${payload.promptText}`,
      "Return strict JSON only with keys:",
      "- focus: short weekly focus title",
      "- coaching_points: 2 or 3 plain-English weekly coaching points",
      "- drills: 2 realistic short practice ideas",
      "- checkpoints: 2 short success checks",
      "- rewritten_prompt: clearer, fuller version of the task prompt",
      "- daily_task: one short student-friendly task instruction",
      "Keep it grade-appropriate, natural, and non-technical.",
    ].join("\n");
  }

  return [
    `Grade: ${grade}`,
    `Genre: ${genre}`,
    `Current prompt: ${payload.promptText}`,
    "Return strict JSON only with key:",
    "- rewritten_prompt: rewrite the task so it is clearer and easier for a student to understand without changing the task itself",
    "Keep it natural, concise, and student-friendly.",
  ].join("\n");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return json(401, { error: "Missing authorization" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json(401, { error: "Missing authorization token" });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return json(401, { error: "Unauthorized" });
  }

  const payload = (await req.json().catch(() => null)) as Payload | null;
  const payloadError = validatePayload(payload);
  if (payloadError) {
    return json(400, { error: payloadError });
  }

  // Authenticated students are allowed for all current modes.
  // Keep role lookup for future admin-only expansion, but do not block student-safe modes.
  await getUserRole(
    authData.user.id,
    authData.user.app_metadata?.role,
    authData.user.app_metadata?.is_admin,
  );

  const userPrompt = buildUserPrompt(payload!);

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
              "You are a strong student writing coach for Brains Heist. Return strict JSON only. No markdown.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
      25000,
    );

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return json(502, { error: "No model response" });
    }

    const parsed = JSON.parse(content);
    const normalized = normalizeAiResult(payload!.mode, parsed);
    if (!normalized) {
      return json(502, { error: "Model response schema invalid" });
    }

    return json(200, {
      mode: payload!.mode,
      result: normalized,
    });
  } catch (error) {
    console.error("[bh_writing_ai] request failed", error);
    return json(502, {
      error: error instanceof Error ? error.message : "AI request failed",
    });
  }
});
