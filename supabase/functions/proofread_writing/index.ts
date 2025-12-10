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

      const systemPrompt = `You are a SENIOR Cambridge ESOL Writing Examiner. Analyse this ${isPart1 ? 'Part 1 (email)' : 'Part 2 (essay/article/review/story)'} submission.

WORD COUNT: Student wrote ${wordCount} words. Target: ${isPart1 ? '45-55' : '110-130'} words.

MARKING CRITERIA (0-5 each):
${isPart1 ? `- Content: All 3 bullet points answered?
- Organisation: Opening, body, closing? Linking words?
- Language: Vocabulary variety? Grammar accuracy?` : `- Content: Task fully addressed with developed ideas?
- Communicative Achievement: Right tone/register for reader?
- Organisation: Clear paragraphs? Cohesive devices?
- Language: Range of vocabulary and grammar? Accuracy?`}

YOU MUST RETURN JSON WITH THESE EXACT FIELDS:

1. "spellingMistakes" - ARRAY listing EACH spelling error separately:
   Example: [
     {"wrong": "helo", "correct": "hello", "explanation": "Double 'l' in hello"},
     {"wrong": "pictshars", "correct": "pictures", "explanation": "pictures = pict-ures"},
     {"wrong": "nex", "correct": "next", "explanation": "Missing 't' at the end"}
   ]
   List EVERY misspelled word. Do NOT summarise. Do NOT skip any.

2. "grammarMistakes" - ARRAY listing EACH grammar/punctuation error separately:
   Example: [
     {"wrong": "i want", "correct": "I want", "explanation": "Pronoun 'I' is always capitalised"},
     {"wrong": "is takeing", "correct": "is taking", "explanation": "take → taking (drop 'e' before -ing)"},
     {"wrong": "how match cost", "correct": "how much does it cost", "explanation": "Question structure: how much + does + subject + verb"}
   ]
   List EVERY error. Include: capitalisation, punctuation, verb forms, articles, prepositions.

3. "suggestedMarks" - Object with numerical marks:
   {"content": 2, "organisation": 1, "language": 1${isPart1 ? '' : ', "communicativeAchievement": 2'}}

4. "markJustifications" - Object with DETAILED explanations (3-4 sentences each):
   {
     "content": "The candidate attempted to address the task but only partially covered the required points. They asked about lesson location and cost but did not specify their availability or preferred schedule. The request lacks clarity. Mark: 2/5.",
     "organisation": "There is no clear structure - no greeting, no sign-off, ideas are jumbled together. No linking words used. Mark: 1/5.",
     "language": "Multiple spelling errors (helo, pictshars, nex, dint, wher, match). Grammar errors throughout (i instead of I, takeing, how match cost). Very limited vocabulary range. Mark: 1/5."${isPart1 ? '' : ',\n     "communicativeAchievement": "The register is too informal for the task. The purpose is partially achieved but the message is unclear due to errors. Mark: 2/5."'}
   }

5. "correctedVersion" - The student's EXACT text with ALL errors fixed:
   Keep their ideas, fix spelling, grammar, punctuation. Do NOT add content.

6. "feedback" - 2-3 paragraph examiner commentary summarising strengths and weaknesses.

7. "overallComments" - Personalised encouragement with 2-3 specific improvement tips.

8. "modelAnswer" - A COMPLETELY NEW high-band answer (NOT just corrections):
   - MUST be EXACTLY ${isPart1 ? '45-55' : '110-130'} words (count carefully!)
   - Show sophisticated vocabulary, complex grammar, perfect accuracy
   - ${isPart1 ? 'Include: greeting, 3 clear paragraphs addressing all points, polite closing, sign-off' : 'Include: introduction with thesis, 2-3 body paragraphs with examples, strong conclusion'}
   - This should score ${isPart1 ? '14-15/15' : '18-20/20'}
   - Write a FULL model text, not advice

CRITICAL: spellingMistakes and grammarMistakes must list EVERY error individually as separate array items. Do not combine or summarise them.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Student's ${partInfo} submission to analyse:\n\n"${text}"\n\nList every spelling mistake and every grammar mistake as separate array items. Then provide marks with justifications and write a ${isPart1 ? '45-55' : '110-130'} word model answer.` },
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
