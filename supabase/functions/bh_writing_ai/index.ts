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
    return { strengths, weaknesses, next_steps };
  }
  const focus = typeof value.focus === "string" ? value.focus : "";
  const drills = Array.isArray(value.drills) ? value.drills.map(String) : [];
  const checkpoints = Array.isArray(value.checkpoints) ? value.checkpoints.map(String) : [];
  return { focus, drills, checkpoints };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json(401, { error: "Missing authorization" });

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

  const { data: userData } = await supabase
    .from("users")
    .select("is_admin, role")
    .eq("id", authData.user.id)
    .single();

  const isTeacherOrAdmin = userData?.is_admin === true || userData?.role === "teacher" || userData?.role === "admin";
  if (!isTeacherOrAdmin) return json(403, { error: "Teacher/admin role required" });

  const payload = (await req.json().catch(() => null)) as Payload | null;
  const payloadError = validatePayload(payload);
  if (payloadError) return json(400, { error: payloadError });

  const userPrompt = payload.mode === "feedback"
    ? `Provide concise writing feedback in JSON with keys strengths, weaknesses, next_steps. Grade=${payload.grade ?? "unknown"}, genre=${payload.genre ?? "unknown"}. Prompt: ${payload.promptText}. Response: ${payload.studentResponse ?? ""}`
    : `Create a weekly writing plan assist JSON with keys focus, drills, checkpoints. Grade=${payload.grade ?? "unknown"}, genre=${payload.genre ?? "unknown"}, weaknesses=${JSON.stringify(payload.weaknesses ?? [])}. Prompt: ${payload.promptText}`;

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You are a writing coach assistant for Brains Heist. Return strict JSON only.",
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
