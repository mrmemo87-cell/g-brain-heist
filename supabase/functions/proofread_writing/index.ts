import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Helper for JSON responses with CORS
  const jsonResponse = (status: number, data: unknown) =>
    new Response(JSON.stringify(data ?? {}), {
      status,
      headers: { "content-type": "application/json", ...corsHeaders },
    });

  try {
    // Check environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    console.log("Env check - SUPABASE_URL:", !!supabaseUrl);
    console.log("Env check - SERVICE_KEY:", !!serviceKey);
    console.log("Env check - OPENAI_KEY:", !!openAiKey);

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(500, { error: "Missing Supabase environment variables" });
    }

    if (!openAiKey) {
      return jsonResponse(500, { error: "Missing OPENAI_API_KEY" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const openai = new OpenAI({ apiKey: openAiKey });

    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    // Parse request body
    let payload: { part1Text?: string; part2Text?: string; testType?: string };
    try {
      payload = await req.json();
    } catch (_) {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    console.log("Payload received:", { 
      part1Length: payload.part1Text?.length || 0, 
      part2Length: payload.part2Text?.length || 0 
    });

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authData?.user) {
      console.error("Auth error:", authError);
      return jsonResponse(401, { error: "Unauthorized" });
    }

    console.log("User authenticated:", authData.user.id);

    // Check if user is teacher or admin
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("is_admin, role")
      .eq("id", authData.user.id)
      .single();

    console.log("User data:", userData, "Error:", userError);

    const isTeacherOrAdmin = userData?.is_admin === true || 
                             userData?.role === 'teacher' || 
                             userData?.role === 'admin';

    if (!isTeacherOrAdmin) {
      return jsonResponse(403, { error: "Only teachers can use AI proofread" });
    }

    const { part1Text, part2Text, testType = "Cambridge B2 First Writing" } = payload;

    if (!part1Text && !part2Text) {
      return jsonResponse(400, { error: "At least one of part1Text or part2Text is required" });
    }

    // Proofread function
    async function proofreadWithGPT(text: string, isPart1: boolean) {
      const partInfo = isPart1 
        ? "Part 1 (email/letter, 45-55 words target)" 
        : "Part 2 (article/essay/review/story, 110-130 words target)";
      
      const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      
      console.log(`Calling OpenAI for ${partInfo}, ${wordCount} words`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are an experienced English teacher and Cambridge exam marker. Proofread and mark student writing for ${testType}. 

Respond with JSON only:
{
  "feedback": "2-4 sentences highlighting positives and areas to improve",
  "correctedVersion": "The fully corrected version",
  "spellingMistakes": [{"wrong": "word", "correct": "word", "explanation": "reason"}],
  "grammarMistakes": [{"wrong": "phrase", "correct": "phrase", "explanation": "reason"}],
  "suggestedMarks": {"content": 4, "organisation": 3, "language": 3, "communicativeAchievement": 4},
  "overallComments": "Summary of performance"
}`
          },
          {
            role: "user",
            content: `Proofread this ${partInfo} submission (${wordCount} words):\n\n"${text}"`
          },
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      console.log("OpenAI response:", content?.substring(0, 100));
      
      if (!content) {
        throw new Error("OpenAI returned no content");
      }
      
      return JSON.parse(content);
    }

    // Process parts
    const result: { part1?: unknown; part2?: unknown } = {};

    if (part1Text?.trim()) {
      console.log("Processing Part 1...");
      result.part1 = await proofreadWithGPT(part1Text, true);
    }

    if (part2Text?.trim()) {
      console.log("Processing Part 2...");
      result.part2 = await proofreadWithGPT(part2Text, false);
    }

    console.log("Proofread complete!");
    return jsonResponse(200, result);

  } catch (error) {
    console.error("Function error:", error);
    return jsonResponse(500, { 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});
