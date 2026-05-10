import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type VisitorAssistantRole = "visitor" | "assistant";

type VisitorAssistantMessage = {
  role: VisitorAssistantRole;
  text: string;
};

type VisitorAssistantPayload = {
  messages?: VisitorAssistantMessage[];
};

type DemoLead = {
  name: string | null;
  school_name: string | null;
  email: string | null;
  country: string | null;
  student_count: number | null;
  notes: string | null;
};

type DemoLeadSaveResult =
  | "saved"
  | "duplicate"
  | "incomplete"
  | "error"
  | "unconfigured";

const followUpPromisePattern =
  /(?:^|[.!?]\s+)[^.!?]*(?:team|we|someone|representative|specialist|sales)[^.!?]*(?:follow up|reach out|contact|get in touch|email)[^.!?]*[.!?]?/gi;
const demoLeadIntentPattern =
  /\b(demo|pricing|price|quote|sales|procurement|onboarding|enterprise|pilot|trial|buy|purchase|subscription|school plan|request|follow[- ]?up)\b/i;

const geminiKey = Deno.env.get("GEMINI_API_KEY");
const model =
  Deno.env.get("GEMINI_VISITOR_ASSISTANT_MODEL") || "gemini-2.5-flash";
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

const maxMessages = 10;
const maxMessageChars = 1200;
const maxReplyChars = 1400;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
    },
  });

const normalizeMessages = (messages: unknown): VisitorAssistantMessage[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message): message is VisitorAssistantMessage => {
      if (!message || typeof message !== "object") return false;
      const value = message as Record<string, unknown>;
      return (
        (value.role === "visitor" || value.role === "assistant") &&
        typeof value.text === "string" &&
        value.text.trim().length > 0
      );
    })
    .slice(-maxMessages)
    .map((message) => ({
      role: message.role,
      text: message.text.trim().slice(0, maxMessageChars),
    }));
};

const assistantInstructions = [
  "You are Byte, the official AI visitor assistant for Brains Heist.",
  "Brains Heist is a gamified English and Math platform for schools with admissions tests, Cambridge-style placement support, student/class management, leaderboards, reports, and live class battle modes.",
  "Help prospective school leaders, teachers, parents, and students with clear, flexible, accurate answers.",
  "Be warm, concise, and practical. Ask one useful follow-up question when needed.",
  "When visitors ask for pricing, demos, procurement, onboarding, or enterprise questions, explain at a high level and invite them to book a demo or email sales@brainsheist.com.",
  "Only say the Brains Heist team will follow up, reach out, contact them, or use their email after the system confirms that the demo request was saved.",
  "When visitors need account, billing, cancellation, privacy, or technical support, route them to support@brainsheist.com and avoid claiming you changed account data.",
  "Do not ask visitors to share passwords, payment card details, government IDs, or sensitive student records in chat.",
  "If you are uncertain about an internal policy, say so and route to the sales/support team instead of inventing details.",
  `Keep responses under ${maxReplyChars} characters.`,
].join("\n");

const buildGeminiContents = (messages: VisitorAssistantMessage[]) =>
  messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.text }],
  }));

const extractGeminiText = (payload: Record<string, unknown>): string => {
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : [];
  const first = candidates[0] as Record<string, unknown> | undefined;
  const content = first?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];

  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
};

const callGemini = async (
  messages: VisitorAssistantMessage[],
  extraInstructions = "",
): Promise<string> => {
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const systemText = extraInstructions
    ? `${assistantInstructions}\n\nCurrent system context:\n${extraInstructions}`
    : assistantInstructions;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemText }],
        },
        contents: buildGeminiContents(messages),
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 500,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorPayload = payload as Record<string, unknown>;
    const error = errorPayload.error as Record<string, unknown> | undefined;
    const message =
      typeof error?.message === "string"
        ? error.message
        : `Gemini request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return extractGeminiText(payload as Record<string, unknown>).slice(
    0,
    maxReplyChars,
  );
};

const parseLeadJson = (text: string): DemoLead | null => {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return null;

  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const studentCount = parsed.student_count;

  return {
    name:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : null,
    school_name:
      typeof parsed.school_name === "string" && parsed.school_name.trim()
        ? parsed.school_name.trim()
        : null,
    email:
      typeof parsed.email === "string" && parsed.email.trim()
        ? parsed.email.trim().toLowerCase()
        : null,
    country:
      typeof parsed.country === "string" && parsed.country.trim()
        ? parsed.country.trim()
        : null,
    student_count:
      typeof studentCount === "number" && Number.isFinite(studentCount)
        ? Math.round(studentCount)
        : typeof studentCount === "string" &&
            Number.isFinite(Number(studentCount))
          ? Math.round(Number(studentCount))
          : null,
    notes:
      typeof parsed.notes === "string" && parsed.notes.trim()
        ? parsed.notes.trim()
        : null,
  };
};

const extractDemoLead = async (
  messages: VisitorAssistantMessage[],
): Promise<DemoLead | null> => {
  if (!geminiKey) return null;

  const transcript = messages
    .map(
      (message) =>
        `${message.role === "assistant" ? "Byte" : "Visitor"}: ${message.text}`,
    )
    .join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: [
                "Extract a completed Brains Heist demo/pricing lead from the conversation.",
                "Return only compact JSON with keys: name, school_name, email, country, student_count, notes.",
                "Use null for unknown fields. student_count must be a number or null.",
                "Only include information explicitly provided by the visitor; do not invent details.",
              ].join(" "),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: transcript }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 250,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorPayload = payload as Record<string, unknown>;
    const error = errorPayload.error as Record<string, unknown> | undefined;
    const message =
      typeof error?.message === "string"
        ? error.message
        : `Lead extraction failed with status ${response.status}.`;
    throw new Error(message);
  }

  return parseLeadJson(extractGeminiText(payload as Record<string, unknown>));
};

const isCompleteDemoLead = (
  lead: DemoLead | null,
): lead is DemoLead & {
  name: string;
  school_name: string;
  email: string;
  country: string;
  student_count: number;
} =>
  Boolean(
    lead?.name &&
    lead.school_name &&
    lead.email &&
    lead.country &&
    lead.student_count &&
    lead.student_count > 0,
  );

const hasDemoLeadIntent = (messages: VisitorAssistantMessage[]) =>
  demoLeadIntentPattern.test(
    messages.map((message) => message.text).join("\n"),
  );

const removeUnsavedFollowUpPromises = (reply: string) =>
  reply
    .replace(followUpPromisePattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() ||
  "Thanks — I can help with demo or pricing next. Please share your name, school name, school country, email, and approximate student count so I can collect the request.";

const saveDemoLead = async (
  lead: DemoLead | null,
  messages: VisitorAssistantMessage[],
): Promise<DemoLeadSaveResult> => {
  if (!isCompleteDemoLead(lead) || !hasDemoLeadIntent(messages))
    return "incomplete";
  if (!supabaseAdmin) return "unconfigured";

  const { data: existingLead, error: existingError } = await supabaseAdmin
    .from("demo_requests")
    .select("id")
    .ilike("email", lead.email)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingLead) return "duplicate";

  const { error: insertError } = await supabaseAdmin
    .from("demo_requests")
    .insert({
      name: lead.name,
      school_name: lead.school_name,
      email: lead.email,
      country: lead.country,
      student_count: lead.student_count,
      notes: lead.notes,
      source: "visitor_assistant",
    });

  if (insertError) throw insertError;

  return "saved";
};

const getLeadReplyInstructions = (saveResult: DemoLeadSaveResult) => {
  if (saveResult === "saved") {
    return "The visitor's completed demo request was saved successfully. You may acknowledge that the Brains Heist team can follow up using the email provided, but do not repeat the exact success line because the system appends it.";
  }

  if (saveResult === "duplicate") {
    return "The visitor provided an email that already has a demo request. Do not say the Brains Heist team will follow up, reach out, contact them, or use their email. Let them know a request with that email is already on file and they can use a different email or contact sales@brainsheist.com if they need to update it.";
  }

  return "The visitor's demo request has not been saved by the system. Do not say the Brains Heist team will follow up, reach out, contact them, or use their email. If they want a demo/pricing follow-up, naturally ask for any missing basics: name, school name, school country, email, and approximate student count.";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = (await req
      .json()
      .catch(() => null)) as VisitorAssistantPayload | null;
    const messages = normalizeMessages(payload?.messages);
    const lastVisitorMessage = [...messages]
      .reverse()
      .find((message) => message.role === "visitor");

    if (!lastVisitorMessage) {
      return json(400, { error: "A visitor message is required." });
    }

    let saveResult: DemoLeadSaveResult = "incomplete";

    try {
      const lead = await extractDemoLead(messages);
      saveResult = await saveDemoLead(lead, messages);
    } catch (error) {
      saveResult = "error";
      console.error("[visitor_assistant] demo lead save failed", error);
    }

    const reply = await callGemini(
      messages,
      getLeadReplyInstructions(saveResult),
    );

    if (!reply) {
      return json(502, {
        error: "The AI assistant returned an empty response.",
      });
    }

    const safeReply =
      saveResult === "saved" ? reply : removeUnsavedFollowUpPromises(reply);
    const finalReply =
      saveResult === "saved"
        ? `${safeReply}\n\n✅ Your demo request has been saved. The Brains Heist team can follow up using the email you provided.`
        : safeReply;

    return json(200, { reply: finalReply, model });
  } catch (error) {
    console.error("[visitor_assistant]", error);
    const message =
      error instanceof Error ? error.message : "AI assistant request failed.";
    return json(500, { error: message });
  }
});
