import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import OpenAI from "https://esm.sh/openai@4.52.3";

type JsonValue = Record<string, unknown> | null;

type CreatePackPayload = {
  mode: "create-pack";
  module: "general" | "academic";
  targetBand?: number | null;
};

type FinalisePayload = {
  mode: "finalise-session";
  sessionId: string;
  readingAnswers: Record<string, string>;
  listeningAnswers: Record<string, string>;
  writingAnswer: string;
};

type ReferencePayload = {
  mode: "get-by-reference";
  referenceCode: string;
};

type RequestPayload = CreatePackPayload | FinalisePayload | ReferencePayload;

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceKey || !openAiKey) {
  throw new Error("Missing required environment variables.");
}

const supabase = createClient(supabaseUrl, serviceKey);
const openai = new OpenAI({ apiKey: openAiKey });

const jsonHeaders = { "content-type": "application/json" };

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

function generateReferenceCode(): string {
  const now = new Date();
  const y = String(now.getUTCFullYear()).slice(-2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const random = crypto.getRandomValues(new Uint8Array(2))
    .reduce((acc, val) => acc + val.toString(16).padStart(2, "0"), "")
    .toUpperCase();
  return `IELTS-${y}${m}${d}-${random}`;
}

async function getAuthenticatedUser(token: string | null) {
  if (!token) {
    return { user: null, error: new Error("Missing token") };
  }
  const { data, error } = await supabase.auth.getUser(token);
  return { user: data?.user ?? null, error };
}

function ensureCreatePackPayload(payload: RequestPayload): payload is CreatePackPayload {
  if (payload.mode !== "create-pack") return false;
  if (payload.module !== "general" && payload.module !== "academic") return false;
  if (
    payload.targetBand !== undefined &&
    payload.targetBand !== null &&
    typeof payload.targetBand !== "number"
  ) {
    return false;
  }
  return true;
}

function ensureFinalisePayload(payload: RequestPayload): payload is FinalisePayload {
  if (payload.mode !== "finalise-session") return false;
  if (!payload.sessionId || typeof payload.sessionId !== "string") return false;
  if (typeof payload.writingAnswer !== "string" || !payload.writingAnswer.trim()) return false;
  if (typeof payload.readingAnswers !== "object" || payload.readingAnswers === null) return false;
  if (typeof payload.listeningAnswers !== "object" || payload.listeningAnswers === null) return false;
  return true;
}

function ensureReferencePayload(payload: RequestPayload): payload is ReferencePayload {
  if (payload.mode !== "get-by-reference") return false;
  if (!payload.referenceCode || typeof payload.referenceCode !== "string") return false;
  return true;
}

async function requestPackFromOpenAI(module: string, targetBand: number | null) {
  const targetText = targetBand ? `Target band: ${targetBand}.` : "No target band provided.";
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are an IELTS preparation assistant. Generate realistic IELTS reading, listening, and writing practice content. Do not mention games, XP, coins, hacks, or Brains Heist. Respond with strict JSON only.",
      },
      {
        role: "user",
        content:
          `Create a ${module} IELTS practice pack with 6-8 reading questions and 6-8 listening questions using the exact JSON schema provided earlier. ${targetText}`,
      },
    ],
  });
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }
  return JSON.parse(content);
}

async function requestMarkingFromOpenAI(payload: {
  reading_block: unknown;
  listening_block: unknown;
  writing_task: unknown;
  readingAnswers: Record<string, string>;
  listeningAnswers: Record<string, string>;
  writingAnswer: string;
  targetBand: number | null;
}) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an IELTS examiner. Provide accurate scoring and constructive feedback. Respond with strict JSON only and never mention XP, coins, hacks, raids, or Brains Heist.",
      },
      {
        role: "user",
        content: `Assess the IELTS session below and respond with the required JSON schema.\nSession materials: ${JSON.stringify({
          reading: payload.reading_block,
          listening: payload.listening_block,
          writing: payload.writing_task,
        })}\nStudent submissions: ${JSON.stringify({
          readingAnswers: payload.readingAnswers,
          listeningAnswers: payload.listeningAnswers,
          writingAnswer: payload.writingAnswer,
        })}\n${payload.targetBand ? `Target band: ${payload.targetBand}.` : "No target band specified."}`,
      },
    ],
  });
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let payload: RequestPayload;
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

  try {
    if (ensureCreatePackPayload(payload)) {
      const referenceCode = generateReferenceCode();
      const aiPack = await requestPackFromOpenAI(payload.module, payload.targetBand ?? null);
      const reading = aiPack?.reading;
      const listening = aiPack?.listening;
      const writing = aiPack?.writing;
      if (!reading || !listening || !writing) {
        return jsonResponse(500, { error: "AI response missing required sections" });
      }

      const { data, error } = await supabase
        .from("ielts_sessions")
        .insert({
          student_id: user.id,
          module: payload.module,
          target_band: payload.targetBand ?? null,
          reference_code: referenceCode,
          reading_block: reading,
          listening_block: listening,
          writing_task: writing,
        })
        .select("id, reference_code, reading_block, listening_block, writing_task")
        .single();

      if (error) {
        console.error("Database insert error", error);
        return jsonResponse(500, { error: "Failed to create session" });
      }

      return jsonResponse(200, {
        sessionId: data.id,
        referenceCode: data.reference_code,
        reading: data.reading_block,
        listening: data.listening_block,
        writing: data.writing_task,
      });
    }

    if (ensureFinalisePayload(payload)) {
      const { data: session, error } = await supabase
        .from("ielts_sessions")
        .select("*")
        .eq("id", payload.sessionId)
        .eq("student_id", user.id)
        .single();

      if (error || !session) {
        return jsonResponse(404, { error: "Session not found" });
      }

      const evaluation = await requestMarkingFromOpenAI({
        reading_block: session.reading_block,
        listening_block: session.listening_block,
        writing_task: session.writing_task,
        readingAnswers: payload.readingAnswers,
        listeningAnswers: payload.listeningAnswers,
        writingAnswer: payload.writingAnswer,
        targetBand: session.target_band,
      });

      const bandReading = evaluation?.bands?.reading ?? null;
      const bandListening = evaluation?.bands?.listening ?? null;
      const bandWriting = evaluation?.bands?.writing?.overall ?? evaluation?.bands?.writing ?? null;
      const bandOverall = evaluation?.bands?.overall ?? null;

      const { data: updated, error: updateError } = await supabase
        .from("ielts_sessions")
        .update({
          completed_at: new Date().toISOString(),
          reading_answers: payload.readingAnswers,
          listening_answers: payload.listeningAnswers,
          writing_answer: payload.writingAnswer,
          analytics: evaluation,
          band_reading: bandReading,
          band_listening: bandListening,
          band_writing: bandWriting,
          band_overall: bandOverall,
        })
        .eq("id", payload.sessionId)
        .eq("student_id", user.id)
        .select("*")
        .single();

      if (updateError) {
        console.error("Database update error", updateError);
        return jsonResponse(500, { error: "Failed to finalise session" });
      }

      return jsonResponse(200, updated as JsonValue);
    }

    if (ensureReferencePayload(payload)) {
      const { data, error } = await supabase
        .from("ielts_sessions")
        .select("*")
        .eq("reference_code", payload.referenceCode)
        .eq("student_id", user.id)
        .single();

      if (error || !data) {
        return jsonResponse(404, { error: "Session not found" });
      }

      return jsonResponse(200, data as JsonValue);
    }

    return badRequest("Invalid mode or payload");
  } catch (err) {
    console.error("IELTS session function error", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});

/*
Manual testing examples (replace placeholders with actual values):

Create pack:
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  https://<project-ref>.supabase.co/functions/v1/ielts_session \
  -d '{
    "mode": "create-pack",
    "module": "general",
    "targetBand": 6.5
  }'

Finalise session:
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  https://<project-ref>.supabase.co/functions/v1/ielts_session \
  -d '{
    "mode": "finalise-session",
    "sessionId": "<session-uuid>",
    "readingAnswers": {"R1": "B"},
    "listeningAnswers": {"L1": "C"},
    "writingAnswer": "Full essay text"
  }'

Fetch by reference code:
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  https://<project-ref>.supabase.co/functions/v1/ielts_session \
  -d '{
    "mode": "get-by-reference",
    "referenceCode": "IELTS-YYMMDD-XXXX"
  }'
*/
