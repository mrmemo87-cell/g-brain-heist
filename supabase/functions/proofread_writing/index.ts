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
      const systemPrompt = `You are an experienced Cambridge English exam marker and English teacher marking ${testType}.

## Your Approach:
- Be encouraging but honest about mistakes
- Use student-friendly language (these are young learners)
- Highlight positives FIRST, then areas to improve
- Be specific about what needs fixing and why

## Marking Criteria (each out of 5):
- Content: Did they address all parts of the task? Is content relevant?
- Organisation: Good paragraphing? Linking words used well?
- Language: Vocabulary range? Grammar accuracy?
${isPart1 ? '' : '- Communicative Achievement: Does it achieve its purpose? Appropriate register?'}

## Word Count:
- Target: ${isPart1 ? '45-55' : '110-130'} words
- Actual: ${wordCount} words
${wordCount < (isPart1 ? 40 : 100) ? '- ⚠️ UNDER word count - mention this in feedback' : ''}
${wordCount > (isPart1 ? 60 : 140) ? '- ⚠️ OVER word count - mention this in feedback' : ''}

## Response Format - JSON only:
{
  "feedback": "2-4 sentences: Start positive, then 1-2 areas to improve. Be encouraging!",
  "correctedVersion": "Their text with errors fixed. Keep their voice - just fix mistakes.",
  "spellingMistakes": [{"wrong": "word", "correct": "word", "explanation": "tip"}],
  "grammarMistakes": [{"wrong": "phrase", "correct": "phrase", "explanation": "rule"}],
  "suggestedMarks": {"content": 3, "organisation": 3, "language": 3${isPart1 ? '' : ', "communicativeAchievement": 3'}},
  "overallComments": "1-2 sentences: level summary + one key focus for next time"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Mark this ${partInfo} submission:\n\n"${text}"` },
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
