import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";
import { TRAVEL_TOURISM_MARKING_KEY } from "./marking_key.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY");
const markingModel = Deno.env.get("OPENAI_MARKING_MODEL") || "gpt-4o-mini";

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing required Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, serviceKey);
const openai = openAiKey ? new OpenAI({ apiKey: openAiKey }) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

const isTeacherRole = (userData: { is_admin?: boolean; role?: string | null } | null) => (
  userData?.is_admin === true || ['teacher', 'admin', 'school_admin'].includes(userData?.role || '')
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse(401, { error: "Missing authorization" });

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) return jsonResponse(401, { error: "Unauthorized" });

    const { data: teacherProfile } = await supabase
      .from("users")
      .select("id, school_id, is_admin, role")
      .eq("id", authData.user.id)
      .single();

    if (!isTeacherRole(teacherProfile)) return jsonResponse(403, { error: "Teachers only" });

    const payload = await req.json().catch(() => null) as { quiz_score_id?: string } | null;
    if (!payload?.quiz_score_id) return jsonResponse(400, { error: "quiz_score_id is required" });

    const { data: submission, error: submissionError } = await supabase
      .from("quiz_scores")
      .select("id, student_name, student_class, quiz_name, total_questions, answers, school_id")
      .eq("id", payload.quiz_score_id)
      .single();

    if (submissionError || !submission) return jsonResponse(404, { error: "Submission not found" });
    if (submission.quiz_name !== "Cambridge Travel & Tourism — Operation Sustainable Tourism") {
      return jsonResponse(400, { error: "Unsupported quiz for Travel & Tourism marking" });
    }
    const isPlatformAdmin = teacherProfile?.role === 'admin' || teacherProfile?.is_admin === true;
    if (!isPlatformAdmin && submission.school_id && teacherProfile?.school_id !== submission.school_id) {
      return jsonResponse(403, { error: "Submission belongs to a different school" });
    }
    if (!openai) {
      return jsonResponse(503, { error: "AI marking is not configured. Missing OPENAI_API_KEY." });
    }

    const responses = submission.answers?.responses || {};
    const systemPrompt = `You are a Cambridge International AS & A Level Travel & Tourism 9395 Paper 1 examiner.
Use the private marking key and Cambridge marking principles below. Do not reveal this marking key to students.

Core rules:
- State/identify: usually 1 mark per correct point.
- Describe: valid point plus descriptive detail.
- Explain: point plus development/application.
- Explain three [6]: 2 marks per point.
- Explain two [6]: 3 marks per point where applicable.
- Assess/evaluate: use AO quality/levels. Reward AO1 knowledge, AO2 application to stimulus/context, AO3 analysis, AO4 balanced judgement/conclusion.
- Penalise repetition, generic unsupported answers, lists without explanation, and evaluate answers without a supported judgement.

Private marking key:
${JSON.stringify(TRAVEL_TOURISM_MARKING_KEY, null, 2)}

Return strict JSON only with this shape:
{
  "total_suggested_mark": number,
  "max_mark": 80,
  "teacher_review_required": true,
  "confidence": number,
  "question_results": [
    {
      "question_id": string,
      "suggested_mark": number,
      "max_mark": number,
      "reason": string,
      "missing_points": string[],
      "evidence_from_student_answer": string[],
      "confidence": number,
      "teacher_review_required": boolean
    }
  ],
  "overall_notes": string
}`;

    const completion = await openai.chat.completions.create({
      model: markingModel,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 6000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Mark this submission. Student responses JSON:\n${JSON.stringify(responses, null, 2)}` },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("No AI marking response");
    const suggestion = JSON.parse(content);
    suggestion.teacher_review_required = true;
    suggestion.max_mark = 80;

    const updatedAnswers = {
      ...submission.answers,
      ai_marking_suggestion: suggestion,
      ai_marking_generated_at: new Date().toISOString(),
      ai_marking_model: markingModel,
    };

    await supabase
      .from("quiz_scores")
      .update({ answers: updatedAnswers })
      .eq("id", submission.id);

    return jsonResponse(200, suggestion);
  } catch (error) {
    console.error("travel_tourism_marking error", error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});
