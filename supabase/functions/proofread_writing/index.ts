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

CRITICAL REQUIREMENTS
1. You MUST list EVERY spelling mistake found - do not skip any
2. You MUST list EVERY grammar mistake found - do not skip any
3. For each mistake, explain WHY it is wrong and HOW to avoid it
4. Each mark justification must be detailed (2-3 sentences minimum)
5. The model answer must be a complete, new text (not just advice)

OUTPUT REQUIREMENT
You MUST respond with valid JSON only in this exact format:
{
  "feedback": "Overall Examiner's Commentary (2-3 paragraphs): Paragraph 1 - Summarise what the candidate did well. Paragraph 2 - Explain the main weaknesses. Paragraph 3 - Specific advice for improvement.",
  
  "correctedVersion": "The student's EXACT text rewritten with ALL errors fixed. Preserve their ideas and structure but correct every spelling, grammar, and punctuation error.",
  
  "spellingMistakes": [
    {"wrong": "writting", "correct": "writing", "explanation": "Common error: 'write' drops the 'e' and adds '-ing', not '-ting'. Remember: write → writing."},
    {"wrong": "freind", "correct": "friend", "explanation": "The rule 'i before e except after c' applies here. Remember: fr-i-e-nd."}
  ],
  
  "grammarMistakes": [
    {"wrong": "I am enjoy", "correct": "I enjoy / I am enjoying", "explanation": "Verb form error: Use simple present 'enjoy' for habits, or present continuous 'am enjoying' for current actions. Do not mix 'am' with base verb."},
    {"wrong": "She don't like", "correct": "She doesn't like", "explanation": "Subject-verb agreement: Third person singular (he/she/it) requires 'doesn't', not 'don't'."}
  ],
  
  "suggestedMarks": {
    "content": 3,
    "organisation": 3,
    "language": 3${isPart1 ? '' : ',\n    "communicativeAchievement": 3'}
  },
  
  "markJustifications": {
    "content": "Detailed justification (2-3 sentences): State what content points were addressed or missed. Explain how this affected the mark. Example: 'The candidate addressed 2 of 3 required points. The question about timing was omitted entirely. This results in a mark of 3 as the response is only partially complete.'",
    "organisation": "Detailed justification (2-3 sentences): Comment on paragraphing, linking words, logical flow. Example: 'The text follows a logical sequence with an opening and closing. However, no linking words (firstly, also, finally) were used to connect ideas. A mark of 3 reflects adequate but basic organisation.'",
    "language": "Detailed justification (2-3 sentences): Comment on vocabulary range, grammar accuracy, spelling. Example: 'The candidate uses basic vocabulary appropriately but lacks variety. There are 3 grammatical errors affecting clarity. The mark of 2 reflects limited range with noticeable errors.'"${isPart1 ? '' : ',\n    "communicativeAchievement": "Detailed justification (2-3 sentences): Comment on register, tone, and whether the text achieves its purpose for the intended reader."'}
  },
  
  "overallComments": "OVERALL COMMENTS & TIPS (Personalised, positive tone): Start with genuine praise for specific strengths shown in THIS student's work. Then identify 2-3 specific areas for improvement based on their actual mistakes. End with encouraging advice and one clear next step. Example: 'You have shown good understanding of the task requirements and your message is clear. Your main areas for development are: (1) verb tense consistency - practise using past simple throughout narratives, (2) punctuation - remember to use commas after introductory phrases. Keep practising and focus on proofreading your work before submission. You are making good progress!'",
  
  "modelAnswer": "HIGH-BAND MODEL ANSWER (${isPart1 ? '14-15/15' : '18-20/20'}): Write a COMPLETE new answer to the same task in ${isPart1 ? '45-55' : '110-130'} words. This should demonstrate: varied vocabulary, accurate grammar, appropriate register, good organisation with linking words, and full task completion. This is NOT advice - it is a full model text the student can study."
}

IMPORTANT: 
- spellingMistakes array must contain ALL spelling errors found (empty array [] only if no errors)
- grammarMistakes array must contain ALL grammar/punctuation errors found (empty array [] only if no errors)
- Each explanation must teach the student how to avoid the mistake in future`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyse and mark this ${partInfo} submission. List ALL spelling and grammar mistakes individually with explanations:\n\n"${text}"` },
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
