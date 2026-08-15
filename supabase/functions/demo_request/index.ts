import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { cleanText, requiredEnv, serverSupabaseKey } from "../_shared/email.ts";

type DemoRequestPayload = {
  name?: unknown; school_name?: unknown; email?: unknown; country?: unknown;
  student_count?: unknown; website?: unknown; notes?: unknown;
};
type DemoRequestLead = {
  name: string; school_name: string; email: string; country: string | null;
  student_count: number | null; website: string | null; notes: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders },
});
const optional = (value: unknown, max: number) => cleanText(value, max) || null;
const normalizeEmail = (value: unknown) => cleanText(value, 254).toLowerCase();
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const normalizeCount = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
};
const normalize = (payload: DemoRequestPayload): DemoRequestLead => ({
  name: cleanText(payload.name, 120),
  school_name: cleanText(payload.school_name, 180),
  email: normalizeEmail(payload.email),
  country: optional(payload.country, 100),
  student_count: normalizeCount(payload.student_count),
  website: optional(payload.website, 220),
  notes: optional(payload.notes, 1200),
});
const validate = (lead: DemoRequestLead) => {
  if (!lead.name) return "Please enter your name.";
  if (!lead.school_name) return "Please enter your school name.";
  if (!isValidEmail(lead.email)) return "Please enter a valid work email.";
  return null;
};
const telegramMessage = (lead: DemoRequestLead) => [
  "🔥 New Brains Heist Demo Request", "", "Source: Demo form",
  `Name: ${lead.name}`, `School: ${lead.school_name}`,
  `Email: ${lead.email}`, `Website: ${lead.website || "Not provided"}`,
].join("\n");

const notifyTelegram = async (lead: DemoRequestLead) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();
  if (!token || !chatId) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: telegramMessage(lead) }),
  });
  if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const payload = await req.json().catch(() => null) as DemoRequestPayload | null;
    if (!payload || typeof payload !== "object") {
      return json(200, { ok: false, error: "Please complete the demo request form." });
    }
    const lead = normalize(payload);
    const validationError = validate(lead);
    if (validationError) return json(200, { ok: false, error: validationError });

    const { data: saved, error: insertError } = await db.from("demo_requests")
      .insert({
        name: lead.name, school_name: lead.school_name, email: lead.email,
        country: lead.country, student_count: lead.student_count,
        website: lead.website, notes: lead.notes, source: "demo_form",
      }).select("id").single();
    if (insertError) throw insertError;

    const events = [
      {
        event_type: "demo_request_confirmation",
        category: "school_operations",
        audience: "applicant",
        recipient_email: lead.email,
        school_name_override: lead.school_name,
        template_key: "demo_request_confirmation",
        payload: { demo_request_id: saved.id, school_name: lead.school_name },
        idempotency_key: `demo-confirmation-${saved.id}`,
      },
      {
        event_type: "demo_request_received",
        category: "platform_operations",
        audience: "platform_owner",
        school_name_override: lead.school_name,
        template_key: "owner_demo_request",
        payload: { demo_request_id: saved.id, school_name: lead.school_name },
        idempotency_key: `owner-demo-request-${saved.id}`,
      },
    ];
    const { error: queueError } = await db.from("transactional_email_outbox").insert(events);
    if (queueError) throw queueError;

    try {
      await notifyTelegram(lead);
    } catch (error) {
      console.error("[demo_request] Telegram notification failed", {
        message: cleanText(error instanceof Error ? error.message : error, 300),
      });
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error("[demo_request]", {
      message: cleanText(error instanceof Error ? error.message : error, 300),
    });
    return json(200, {
      ok: false,
      error: "We could not save your demo request right now. Please try again in a moment.",
    });
  }
});
