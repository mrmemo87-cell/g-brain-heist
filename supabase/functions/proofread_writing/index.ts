import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

// Same pattern as ielts_session - top-level initialization
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

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    let payload: { part1Text?: string; part2Text?: string; testType?: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    console.log("Received payload, part1:", !!payload.part1Text, "part2:", !!payload.part2Text);

    // Authenticate
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authData?.user) {
      console.error("Auth error:", authError);
      return jsonResponse(401, { error: "Unauthorized" });
    }

    console.log("User authenticated:", authData.user.id);

    // Check teacher/admin
    const { data: userData } = await supabase
      .from("users")
      .select("is_admin, role")
      .eq("id", authData.user.id)
      .single();

    const isTeacher = userData?.is_admin === true || 
                      userData?.role === 'teacher' || 
                      userData?.role === 'admin';

    if (!isTeacher) {
      return jsonResponse(403, { error: "Teachers only" });
    }

    console.log("User is teacher/admin");

    const { part1Text, part2Text, testType = "Cambridge B2 First Writing" } = payload;

    if (!part1Text && !part2Text) {
      return jsonResponse(400, { error: "No text provided" });
    }

    // GPT proofreading function
    async function proofread(text: string, isPart1: boolean) {
      const partInfo = isPart1 ? "Part 1 (45-55 words)" : "Part 2 (110-130 words)";
      const wordCount = text.trim().split(/\s+/).length;

      console.log(`Calling OpenAI for ${partInfo}, ${wordCount} words...`);

      // =====================================================================
      // EDIT THIS PROMPT TO CUSTOMIZE GPT'S ANALYSIS
      // See PROMPT_CONFIG.md for documentation
      // =====================================================================
      const systemPrompt = `You are a Cambridge-style Writing Examiner AI.
Your task is to analyse students' ${isPart1 ? 'Part 1' : 'Part 2'} writing submissions and produce fully structured, professional examiner feedback.
Your tone must be formal, objective, and consistent with accredited Cambridge ESOL examiners.
No emojis.

GENERAL RULES
- Always begin by counting the words precisely in the student's text.
- Apply the official word-count expectations:
  ${isPart1 ? '- Part 1 target: 45-55 words' : '- Part 2 target: 110-130 words'}
- Actual word count: ${wordCount} words
- Give marks using Cambridge marking criteria.

${isPart1 ? `PART 1 MARKING CRITERIA
- Content (0-5): Has the candidate addressed all parts of the task? Is content relevant?
- Organisation (0-5): Is the text well-organised? Are linking words used appropriately?
- Language (0-5): Is vocabulary appropriate and varied? Is grammar accurate?` : `PART 2 MARKING CRITERIA
- Content (0-5): Has the candidate addressed all parts of the task? Is content relevant?
- Communicative Achievement (0-5): Does the text achieve its purpose? Is register appropriate?
- Organisation (0-5): Is the text well-organised with clear paragraphing?
- Language (0-5): Wide range of vocabulary and grammar with accuracy?`}

LANGUAGE EXPECTATIONS
- Use examiner-style academic phrasing.
- Highlight grammar, punctuation, vocabulary, and structural weaknesses.
- When correcting the text, preserve the student's intentions but fix all errors.
- When producing model answers, aim for accuracy, cohesion, and a wide range of structures.

OUTPUT REQUIREMENT
You MUST respond with valid JSON only in this exact format:
{
  "feedback": "Examiner's Commentary for the Candidate - formal, detailed, constructive feedback explaining strengths and weaknesses. No emojis. Academic tone.",
  "correctedVersion": "Corrected Version - the student's text with all errors fixed while preserving their meaning and intentions.",
  "spellingMistakes": [{"wrong": "misspelled word", "correct": "correct spelling", "explanation": "brief note on the error"}],
  "grammarMistakes": [{"wrong": "incorrect phrase", "correct": "corrected phrase", "explanation": "grammar rule explanation"}],
  "suggestedMarks": {
    "content": 3,
    "organisation": 3,
    "language": 3${isPart1 ? '' : ',\n    "communicativeAchievement": 3'}
  },
  "overallComments": "High-Band Model Answer (${isPart1 ? '14-15/15, 45-55 words' : '18-20/20, 110-130 words'}) - Write a new model answer that demonstrates advanced language use, cohesion, and appropriate register.",
  "markJustifications": {
    "content": "Justification for content mark",
    "organisation": "Justification for organisation mark",
    "language": "Justification for language mark"${isPart1 ? '' : ',\n    "communicativeAchievement": "Justification for communicative achievement mark"'}
  }
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyse and mark this ${partInfo} submission:\n\n"${text}"` },
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      console.log("OpenAI response received");
      
      if (!content) throw new Error("No GPT response");
      return JSON.parse(content);
    }

    const result: { part1?: unknown; part2?: unknown } = {};

    if (part1Text?.trim()) {
      result.part1 = await proofread(part1Text, true);
    }

    if (part2Text?.trim()) {
      result.part2 = await proofread(part2Text, false);
    }

    console.log("Proofread complete!");
    return jsonResponse(200, result);

  } catch (error) {
    console.error("Error:", error);
    return jsonResponse(500, { 
      error: "Server error", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});
