import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DemoRequestPayload = {
  name?: unknown;
  school_name?: unknown;
  email?: unknown;
  country?: unknown;
  student_count?: unknown;
  website?: unknown;
  notes?: unknown;
};

type DemoRequestLead = {
  name: string;
  school_name: string;
  email: string;
  country: string | null;
  student_count: number | null;
  website: string | null;
  notes: string | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");

const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

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

const readString = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const readOptionalString = (value: unknown, maxLength: number) => {
  const normalized = readString(value, maxLength);
  return normalized || null;
};

const normalizeStudentCount = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Math.round(numericValue);
};

const normalizeEmail = (value: unknown) => readString(value, 254).toLowerCase();

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

const normalizeDemoRequest = (payload: DemoRequestPayload): DemoRequestLead => ({
  name: readString(payload.name, 120),
  school_name: readString(payload.school_name, 180),
  email: normalizeEmail(payload.email),
  country: readOptionalString(payload.country, 100),
  student_count: normalizeStudentCount(payload.student_count),
  website: readOptionalString(payload.website, 220),
  notes: readOptionalString(payload.notes, 1200),
});

const validateDemoRequest = (lead: DemoRequestLead) => {
  if (!lead.name) return "Please enter your name.";
  if (!lead.school_name) return "Please enter your school name.";
  if (!isValidEmail(lead.email)) return "Please enter a valid work email.";
  return null;
};

const buildTelegramLeadMessage = (lead: DemoRequestLead) =>
  [
    "🔥 New Brains Heist Demo Request",
    "",
    "Source: Demo form",
    `Name: ${lead.name}`,
    `School: ${lead.school_name}`,
    `Email: ${lead.email}`,
    `Website: ${lead.website || "Not provided"}`,
    `Notes: ${lead.notes || "Not provided"}`,
  ].join("\n");

const logTelegramError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[demo_request] Telegram notification failed", {
    message: message.slice(0, 300),
  });
};

const sendTelegramLeadNotification = async (lead: DemoRequestLead) => {
  if (!telegramBotToken || !telegramChatId) return;

  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: buildTelegramLeadMessage(lead),
      }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const description =
      typeof payload?.description === "string" ? payload.description : null;
    throw new Error(
      description
        ? `Telegram API returned ${response.status}: ${description}`
        : `Telegram API returned ${response.status}.`,
    );
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!supabaseAdmin) {
    return json(200, {
      ok: false,
      error: "Demo requests are temporarily unavailable. Please try again soon.",
    });
  }

  try {
    const payload = (await req.json().catch(() => null)) as
      | DemoRequestPayload
      | null;

    if (!payload || typeof payload !== "object") {
      return json(200, { ok: false, error: "Please complete the demo request form." });
    }

    const lead = normalizeDemoRequest(payload);
    const validationError = validateDemoRequest(lead);
    if (validationError) {
      return json(200, { ok: false, error: validationError });
    }

    const { error: insertError } = await supabaseAdmin
      .from("demo_requests")
      .insert({
        name: lead.name,
        school_name: lead.school_name,
        email: lead.email,
        country: lead.country,
        student_count: lead.student_count,
        website: lead.website,
        notes: lead.notes,
        source: "demo_form",
      });

    if (insertError) {
      console.error("[demo_request] insert failed", {
        code: insertError.code,
        message: insertError.message.slice(0, 300),
      });
      return json(200, {
        ok: false,
        error:
          "We could not save your request right now. Please try again in a moment.",
      });
    }

    // Telegram is intentionally best-effort: a saved lead should still be a user-facing success.
    try {
      await sendTelegramLeadNotification(lead);
    } catch (error) {
      logTelegramError(error);
    }

    return json(200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[demo_request]", { message: message.slice(0, 300) });
    return json(200, {
      ok: false,
      error:
        "We could not send your demo request right now. Please try again in a moment.",
    });
  }
});
