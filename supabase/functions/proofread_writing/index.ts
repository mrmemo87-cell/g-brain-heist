import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

type JsonValue = Record<string, unknown> | null;

interface ProofreadRequest {
  part1Text?: string;
  part2Text?: string;
  testType?: string; // e.g., "Cambridge B2 First Writing"
}

interface PartFeedback {
  feedback: string;
  correctedVersion: string;
  spellingMistakes: Array<{ wrong: string; correct: string; explanation: string }>;
  grammarMistakes: Array<{ wrong: string; correct: string; explanation: string }>;
  suggestedMarks: {
    content: number;
    organisation: number;
    language: number;
    communicativeAchievement?: number;
  };
  overallComments: string;
}

interface ProofreadResponse {
  part1?: PartFeedback;
  part2?: PartFeedback;
}

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

const jsonHeaders = { 
  "content-type": "application/json",
  ...corsHeaders 
};

const jsonResponse = (status: number, data: JsonValue) =>
  new Response(JSON.stringify(data ?? {}), {
    status,
    headers: jsonHeaders,
  });

const unauthorized = () => jsonResponse(401, { error: "Unauthorized" });
const badRequest = (message: string) => jsonResponse(400, { error: message });

function parseAuthHeader(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

async function getAuthenticatedUser(token: string | null) {
  if (!token) {
    return { user: null, error: new Error("Missing token") };
  }
  const { data, error } = await supabase.auth.getUser(token);
  return { user: data?.user ?? null, error };
}

async function proofreadWithGPT(text: string, isPart1: boolean, testType: string): Promise<PartFeedback> {
  const partInfo = isPart1 
    ? "Part 1 (email/letter, 45-55 words target)" 
    : "Part 2 (article/essay/review/story, 110-130 words target)";
  
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are an experienced English teacher and Cambridge exam marker. Your task is to proofread and mark student writing for ${testType}. 

Provide detailed, constructive feedback that helps students improve. Be encouraging but honest about mistakes.

For each piece of writing, you must:
1. Identify ALL spelling mistakes with the correct spelling and a brief explanation
2. Identify ALL grammar mistakes with corrections and explanations
3. Write encouraging, detailed feedback highlighting strengths and areas to improve
4. Provide a fully corrected version that maintains the student's voice and ideas
5. Give marks out of 5 for each criterion based on Cambridge B2 First standards
6. Write overall comments summarizing the student's performance

Respond with strict JSON only in this exact format:
{
  "feedback": "Detailed encouraging feedback about the writing (2-4 sentences highlighting positives first, then areas to improve)",
  "correctedVersion": "The fully corrected version of the student's text",
  "spellingMistakes": [{"wrong": "word", "correct": "word", "explanation": "brief reason"}],
  "grammarMistakes": [{"wrong": "phrase", "correct": "phrase", "explanation": "brief reason"}],
  "suggestedMarks": {
    "content": 4,
    "organisation": 3,
    "language": 3,
    "communicativeAchievement": 4
  },
  "overallComments": "Summary of overall performance and key improvement areas"
}`
      },
      {
        role: "user",
        content: `Please proofread and mark this ${partInfo} writing submission.

Word count: ${wordCount} words

Student's text:
"""
${text}
"""

Provide comprehensive feedback, corrections, and marks. Be thorough in identifying mistakes but also highlight what the student did well.`
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }
  
  return JSON.parse(content) as PartFeedback;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let payload: ProofreadRequest;
  try {
    payload = await req.json();
  } catch (_) {
    return badRequest("Invalid JSON body");
  }

  const token = parseAuthHeader(req.headers.get("authorization"));
  const { user, error: userError } = await getAuthenticatedUser(token);
  if (userError || !user) {
    console.error("Auth error", userError);
    return unauthorized();
  }

  // Check if user is a teacher or admin
  const { data: userData } = await supabase
    .from("users")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  const isTeacherOrAdmin = userData?.is_admin === true || 
                           userData?.role === 'teacher' || 
                           userData?.role === 'admin';

  if (!isTeacherOrAdmin) {
    return jsonResponse(403, { error: "Only teachers can use auto-proofread" });
  }

  try {
    const { part1Text, part2Text, testType = "Cambridge B2 First Writing" } = payload;
    
    if (!part1Text && !part2Text) {
      return badRequest("At least one of part1Text or part2Text is required");
    }

    const response: ProofreadResponse = {};

    // Process parts in parallel if both exist
    const promises: Promise<void>[] = [];
    
    if (part1Text && part1Text.trim()) {
      promises.push(
        proofreadWithGPT(part1Text, true, testType).then(result => {
          response.part1 = result;
        })
      );
    }
    
    if (part2Text && part2Text.trim()) {
      promises.push(
        proofreadWithGPT(part2Text, false, testType).then(result => {
          response.part2 = result;
        })
      );
    }

    await Promise.all(promises);

    return jsonResponse(200, response as unknown as JsonValue);
  } catch (error) {
    console.error("Proofread error:", error);
    return jsonResponse(500, { 
      error: "Failed to proofread writing", 
      details: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});
