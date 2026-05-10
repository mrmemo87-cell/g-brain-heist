import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type VisitorAssistantRole = "visitor" | "assistant";

type VisitorAssistantMessage = {
  role: VisitorAssistantRole;
  text: string;
};

type VisitorAssistantPayload = {
  messages?: VisitorAssistantMessage[];
};

const geminiKey = Deno.env.get("GEMINI_API_KEY");
const model = Deno.env.get("GEMINI_VISITOR_ASSISTANT_MODEL") || "gemini-2.5-flash";

const maxMessages = 10;
const maxMessageChars = 1200;
const maxReplyChars = 1400;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
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

const callGemini = async (messages: VisitorAssistantMessage[]): Promise<string> => {
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: assistantInstructions }],
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

  return extractGeminiText(payload as Record<string, unknown>).slice(0, maxReplyChars);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = (await req.json().catch(() => null)) as VisitorAssistantPayload | null;
    const messages = normalizeMessages(payload?.messages);
    const lastVisitorMessage = [...messages].reverse().find((message) => message.role === "visitor");

    if (!lastVisitorMessage) {
      return json(400, { error: "A visitor message is required." });
    }

    const reply = await callGemini(messages);

    if (!reply) {
      return json(502, { error: "The AI assistant returned an empty response." });
    }

    return json(200, { reply, model });
  } catch (error) {
    console.error("[visitor_assistant]", error);
    const message = error instanceof Error ? error.message : "AI assistant request failed.";
    return json(500, { error: message });
  }
});
