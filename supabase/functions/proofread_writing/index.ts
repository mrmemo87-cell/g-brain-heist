import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";
import { normalizePart2CommunicativeAchievement } from "../../../src/lib/writingCommunicativeAchievement.ts";

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

    const writingTaskPrompts: Record<string, { part1: string; part2: string }> = {
      "Cambridge Writing Test 2": {
        part1: [
          "Task: Band Email to Sam.",
          "You recently saw a really good band and want to tell your English-speaking friend, Sam, about it.",
          "Write an email to Sam that covers ALL of the following points:",
          "- where you saw the band",
          "- how you found out about the band",
          "- why you like the band",
        ].join("\n"),
        part2: [
          "Task: Midnight Phone Call Story.",
          "Your English teacher has asked you to write a story.",
          "Your story MUST begin with this exact sentence:",
          "\"Just after midnight, I woke up to the sound of my phone ringing.\"",
          "Write your story in an appropriate style.",
        ].join("\n"),
      },
    };

    const getTaskPrompt = (isPart1: boolean, selectedTestType: string) => {
      const testPrompt = writingTaskPrompts[selectedTestType];
      if (!testPrompt) return "";
      return isPart1 ? testPrompt.part1 : testPrompt.part2;
    };

    const getPartDescriptor = (isPart1: boolean, selectedTestType: string) => {
      if (selectedTestType === "Cambridge Writing Test 2") {
        return isPart1 ? "Part 1 email" : "Part 2 story";
      }
      return isPart1 ? "Part 1 email" : "Part 2 writing task";
    };

    // GPT proofreading function
    async function proofread(text: string, isPart1: boolean, selectedTestType: string) {
      const partInfo = isPart1 ? "Part 1 (45-55 words)" : "Part 2 (110-130 words)";
      const wordCount = text.trim().split(/\s+/).length;
      const taskPrompt = getTaskPrompt(isPart1, selectedTestType);
      const partDescriptor = getPartDescriptor(isPart1, selectedTestType);

      console.log(`Calling OpenAI for ${partInfo}, ${wordCount} words...`);

      const systemPrompt = `You are a Cambridge ESOL Senior Examiner marking a B2 First ${partDescriptor}.

TASK: Analyse the student text and return a JSON object with ALL of the following fields.

${taskPrompt ? `TASK PROMPT:\n${taskPrompt}\n` : ""}

===== FIELD 1: spellingMistakes =====
An array where EACH spelling error is a SEPARATE object.
GO THROUGH THE TEXT WORD BY WORD. For each misspelled word, add an entry.
Format: {"wrong": "misspeled", "correct": "misspelled", "explanation": "Remember: mis-spell-ed (double l)"}

===== FIELD 2: grammarMistakes =====
An array where EACH grammar/punctuation error is a SEPARATE object.
Check for: capitalisation, punctuation, verb tenses, subject-verb agreement, articles, prepositions, word order.
Format: {"wrong": "i want", "correct": "I want", "explanation": "The pronoun I is always capitalised in English"}

===== FIELD 3: suggestedMarks =====
Object with marks 0-5 for each criterion:
${isPart1 
  ? '{"content": X, "organisation": X, "language": X}' 
  : '{"content": X, "organisation": X, "language": X, "communicativeAchievement": X}'}

===== FIELD 4: markJustifications =====
Object with 3-4 sentence justification for EACH mark. Quote specific errors from the text.
${isPart1 
  ? '{"content": "...", "organisation": "...", "language": "..."}' 
  : '{"content": "...", "organisation": "...", "language": "...", "communicativeAchievement": "..."}'}

===== FIELD 5: correctedVersion =====
Rewrite the student's text fixing ALL errors but keeping their exact ideas and structure.

===== FIELD 6: feedback =====
2-3 paragraphs of examiner commentary on strengths and weaknesses.

===== FIELD 7: overallComments =====
Personalised tips: praise something specific, then give 2-3 actionable improvement suggestions.

===== FIELD 8: modelAnswer =====
Write a BRAND NEW high-band response to the SAME task.
CRITICAL REQUIREMENTS:
- Word count MUST be ${isPart1 ? '45-55' : '110-130'} words (count them!)
- ${isPart1 ? 'Structure: Greeting → Answer all 3 points → Polite closing → Sign off' : 'Structure: Hook introduction → 2-3 developed paragraphs with examples → Strong conclusion'}
- Use sophisticated vocabulary and varied grammar
- This is a MODEL ANSWER showing excellence, NOT just a correction
- Score: ${isPart1 ? '14-15/15' : '18-20/20'}

Student word count: ${wordCount} words (target: ${isPart1 ? '45-55' : '110-130'})`;

      const userMessage = `${taskPrompt ? `TASK PROMPT:\n${taskPrompt}\n\n` : ""}STUDENT'S TEXT:
"""
${text}
"""

INSTRUCTIONS:
1. Read the text word by word
2. List EVERY spelling error as a separate item in spellingMistakes array
3. List EVERY grammar/punctuation error as a separate item in grammarMistakes array  
4. Give marks 0-5 with detailed justifications quoting the student's errors
5. Write correctedVersion fixing all errors
6. Write modelAnswer as a NEW ${isPart1 ? '45-55' : '110-130'} word high-band response

Return valid JSON only.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      console.log("OpenAI response received");
      
      if (!content) throw new Error("No GPT response");

      const parsed = JSON.parse(content);

      if (!isPart1 && parsed && typeof parsed === "object") {
        const validation = normalizePart2CommunicativeAchievement(parsed);
        if (validation.errors.length > 0) {
          throw new Error(`Invalid Part 2 communicative achievement payload: ${validation.errors.join("; ")}`);
        }
      }

      return parsed;
    }

    const result: { part1?: unknown; part2?: unknown } = {};

    if (part1Text?.trim()) {
      result.part1 = await proofread(part1Text, true, testType);
    }

    if (part2Text?.trim()) {
      result.part2 = await proofread(part2Text, false, testType);
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
