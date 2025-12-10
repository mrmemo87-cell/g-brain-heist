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
      const systemPrompt = `You are a SENIOR Cambridge ESOL Writing Examiner with 15+ years experience marking B2 First exams.
Your task is to provide DETAILED, THOROUGH examiner feedback for ${isPart1 ? 'Part 1' : 'Part 2'} writing submissions.
Your standards are EXTREMELY HIGH. You must catch EVERY error and provide COMPREHENSIVE feedback.

STUDENT'S WORD COUNT: ${wordCount} words
TARGET WORD COUNT: ${isPart1 ? '45-55 words (Part 1)' : '110-130 words (Part 2)'}

${isPart1 ? `PART 1 MARKING CRITERIA (Each criterion 0-5 marks, total 15)
- Content (0-5): All content points addressed? Information relevant and complete?
- Organisation (0-5): Logical structure? Opening/closing? Linking words (firstly, also, finally, however)?
- Language (0-5): Vocabulary range and accuracy? Grammar accuracy? Spelling accuracy?` : `PART 2 MARKING CRITERIA (Each criterion 0-5 marks, total 20)
- Content (0-5): All task requirements addressed? Ideas developed with relevant details?
- Communicative Achievement (0-5): Appropriate register/tone? Purpose achieved for target reader?
- Organisation (0-5): Clear paragraphs? Cohesive devices? Logical progression of ideas?
- Language (0-5): Wide vocabulary range? Complex grammar? Accuracy in spelling/punctuation?`}

MARK BAND DESCRIPTORS:
5 = Excellent: All requirements fully met, wide range, minimal errors
4 = Good: Requirements mostly met, good range, occasional errors
3 = Satisfactory: Basic requirements met, adequate range, some errors affecting clarity
2 = Below standard: Requirements partially met, limited range, frequent errors
1 = Poor: Requirements barely met, very limited range, errors impede communication
0 = Not addressed or incomprehensible

YOUR ABSOLUTE REQUIREMENTS - YOU MUST DO ALL OF THESE:

1. SPELLING MISTAKES - List EVERY SINGLE spelling error separately:
   - Find each misspelled word in the text
   - Provide the correct spelling
   - Explain the spelling rule or memory trick
   - If there are no spelling mistakes, return an empty array []

2. GRAMMAR MISTAKES - List EVERY SINGLE grammar/punctuation error separately:
   - Quote the exact error from the text
   - Provide the corrected version
   - Explain the grammar rule (e.g., "Third person singular requires -s")
   - Include: verb tenses, subject-verb agreement, articles, prepositions, punctuation, capitalisation
   - If there are no grammar mistakes, return an empty array []

3. MARK JUSTIFICATIONS - For EACH criterion, write 3-4 sentences explaining:
   - What specifically the student did well
   - What specifically the student did poorly
   - How this translates to the numerical mark given
   - Reference specific examples from the student's text

4. CORRECTED VERSION - Rewrite the student's EXACT text with:
   - ALL spelling errors fixed
   - ALL grammar errors fixed
   - ALL punctuation errors fixed
   - Keep the student's original ideas and structure
   - Do NOT add new content or change their meaning

5. MODEL ANSWER - Write a COMPLETELY NEW high-band response that:
   - Addresses the SAME task/question the student was answering
   - Is EXACTLY within word count: ${isPart1 ? '45-55 words' : '110-130 words'}
   - Demonstrates VARIED vocabulary (synonyms, collocations, phrasal verbs)
   - Uses COMPLEX grammar (conditionals, relative clauses, passive voice)
   - Includes APPROPRIATE linking words and cohesive devices
   - Follows the CORRECT structure for the text type (email, article, review, essay, report, story)
   - Would score ${isPart1 ? '14-15/15' : '18-20/20'} marks

RESPOND WITH VALID JSON ONLY in this exact format:
{
  "feedback": "Overall Examiner Commentary (2-3 paragraphs)",
  "correctedVersion": "Student text with ALL errors fixed",
  "spellingMistakes": [{"wrong": "misspeled", "correct": "misspelled", "explanation": "Rule explanation"}],
  "grammarMistakes": [{"wrong": "error phrase", "correct": "corrected phrase", "explanation": "Grammar rule"}],
  "suggestedMarks": {"content": 0-5, "organisation": 0-5, "language": 0-5${isPart1 ? '' : ', "communicativeAchievement": 0-5'}},
  "markJustifications": {"content": "3-4 sentences with specific examples", "organisation": "3-4 sentences", "language": "3-4 sentences"${isPart1 ? '' : ', "communicativeAchievement": "3-4 sentences"'}},
  "overallComments": "Personalised tips and encouragement",
  "modelAnswer": "Complete new high-band answer in ${isPart1 ? '45-55' : '110-130'} words"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",  // Full GPT-4o for maximum accuracy
        response_format: { type: "json_object" },
        temperature: 0.2,  // Lower temperature for more consistent, accurate output
        max_tokens: 4000,  // Ensure enough space for detailed feedback
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyse this ${partInfo} submission thoroughly. Find and list EVERY spelling and grammar mistake individually. Provide detailed mark justifications. Create a high-band model answer within the exact word count.\n\nSTUDENT'S TEXT:\n"${text}"` },
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
