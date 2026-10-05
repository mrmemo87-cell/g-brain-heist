import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Skill = "writing" | "speaking";

const allowedRoles = new Set(["school_admin", "admin", "superadmin"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { attemptId, skill } = await req.json() as { attemptId?: string; skill?: Skill };
    if (!attemptId || (skill !== "writing" && skill !== "speaking")) {
      return new Response(JSON.stringify({ error: "Invalid attemptId or skill" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Server configuration is incomplete");
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: "AI review is not configured" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: caller, error: callerError } = await supabase
      .from("users")
      .select("id, role, is_admin, school_id")
      .eq("id", userData.user.id)
      .single();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const role = String(caller.role ?? "").toLowerCase();
    if (!caller.is_admin && !allowedRoles.has(role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const assertSameSchool = async (studentUserId: string) => {
      if (caller.is_admin) return;
      const { data: student, error: studentError } = await supabase
        .from("users")
        .select("id, school_id")
        .eq("id", studentUserId)
        .single();
      if (studentError || !student || !caller.school_id || !student.school_id || student.school_id !== caller.school_id) {
        throw new Error("Forbidden");
      }
    };

    if (skill === "writing") {
      const { data: attempt, error } = await supabase
        .from("ielts_writing_attempts")
        .select("id, answer_text, word_count, task_id, user_id, ielts_writing_tasks(prompt, title, task_type)")
        .eq("id", attemptId)
        .single();
      if (error || !attempt) throw new Error("Writing attempt not found");
      await assertSameSchool(String(attempt.user_id));

      const prompt = `You are a Brains Heist assessment assistant applying public IELTS-style Writing criteria. Return strict JSON only with keys: band_estimate, task_response, coherence, lexical_resource, grammar, strengths, priority_fixes, suggested_feedback, confidence_note.\n\nTask:\n${attempt.ielts_writing_tasks?.prompt ?? ""}\n\nStudent writing:\n${attempt.answer_text ?? ""}\n\nRubric focus: task response, coherence/cohesion, lexical resource, grammatical range/accuracy.\nThe band_estimate is a provisional TASK-SPECIFIC draft for this submission only. It is not an official IELTS score and must not be presented as a complete Writing readiness band. A human reviewer must finalize feedback.`;
      const draft = await completeJson(openAiKey, prompt);
      return new Response(JSON.stringify({ skill, attemptId, draft, finalized: false, storage_status: "not_persisted" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: speakingAttempt, error: speakingError } = await supabase
      .from("ielts_speaking_attempts")
      .select("id, transcript, audio_url, duration_seconds, task_id, user_id, ielts_speaking_tasks(prompt, part)")
      .eq("id", attemptId)
      .single();
    if (speakingError || !speakingAttempt) throw new Error("Speaking attempt not found");
    await assertSameSchool(String(speakingAttempt.user_id));

    let transcript = (speakingAttempt.transcript ?? "").trim();
    if (!transcript) {
      transcript = "Transcript unavailable for this draft. Please verify directly with audio.";
    }

    const speakingPrompt = `You are a Brains Heist assessment assistant reviewing a TRANSCRIPT only. Return strict JSON only with keys: band_estimate, fluency, lexical_resource, grammar, pronunciation_note, strengths, priority_fixes, suggested_feedback, transcript, confidence_note.\n\nPrompt:\n${speakingAttempt.ielts_speaking_tasks?.prompt ?? ""}\n\nTranscript:\n${transcript}\n\nRules:\n- This is a DRAFT for a human reviewer, not a final grade or official IELTS result.\n- Set band_estimate to null. A transcript alone cannot support a complete Speaking band.\n- Set fluency to null unless the supplied text contains explicit timing/pause evidence; ordinary transcript wording is not sufficient to score fluency reliably.\n- You may give provisional lexical_resource and grammar observations from the transcript.\n- Do NOT score pronunciation from transcript text. pronunciation_note must state that human audio review is required.\n- Do not infer stress, rhythm, intonation, connected speech, intelligibility, or pronunciation quality without audio evidence.\n- confidence_note must clearly state the limitations of transcript-only review.\nA human reviewer must listen to the audio and finalize all Speaking criteria.`;
    const speakingDraft = await completeJson(openAiKey, speakingPrompt);
    const mergedDraft = { ...speakingDraft, transcript };
    return new Response(JSON.stringify({ skill, attemptId, draft: mergedDraft, finalized: false, storage_status: "not_persisted" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

const completeJson = async (openAiKey: string, prompt: string): Promise<Record<string, unknown>> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You produce concise, provisional Brains Heist IELTS-style draft feedback for human reviewers. Never claim to be an official IELTS examiner and never infer evidence that is not present." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "OpenAI request failed");
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty draft");
  return JSON.parse(raw) as Record<string, unknown>;
};
