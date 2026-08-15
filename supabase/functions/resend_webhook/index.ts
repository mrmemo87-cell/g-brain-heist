import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { cleanText, requiredEnv, serverSupabaseKey } from "../_shared/email.ts";

type ResendWebhook = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
  };
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};
const timingSafeEqual = (left: string, right: string) => {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
};
const verifyWebhook = async (req: Request, rawBody: string) => {
  const messageId = req.headers.get("svix-id") || "";
  const timestamp = req.headers.get("svix-timestamp") || "";
  const signatureHeader = req.headers.get("svix-signature") || "";
  if (!messageId || !timestamp || !signatureHeader) return null;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return null;
  const configuredSecret = requiredEnv("RESEND_WEBHOOK_SECRET");
  const encodedSecret = configuredSecret.startsWith("whsec_")
    ? configuredSecret.slice(6)
    : configuredSecret;
  const key = await crypto.subtle.importKey(
    "raw", base64ToBytes(encodedSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${messageId}.${timestamp}.${rawBody}`),
  );
  const expected = bytesToBase64(new Uint8Array(signatureBytes));
  const valid = signatureHeader.split(" ").some((part) => {
    const [version, signature] = part.split(",", 2);
    return version === "v1" && Boolean(signature) && timingSafeEqual(signature, expected);
  });
  return valid ? messageId : null;
};
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(value.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const rawBody = await req.text();
    const providerEventId = await verifyWebhook(req, rawBody);
    if (!providerEventId) return json(400, { error: "Invalid webhook signature" });

    const event = JSON.parse(rawBody) as ResendWebhook;
    const providerMessageId = cleanText(event.data?.email_id, 180);
    const eventType = cleanText(event.type, 80);
    if (!providerMessageId || !eventType.startsWith("email.")) {
      return json(202, { ok: true, ignored: true });
    }
    const statusMap: Record<string, string> = {
      "email.sent": "accepted",
      "email.delivered": "delivered",
      "email.delivery_delayed": "delayed",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.suppressed": "suppressed",
      "email.failed": "failed",
    };
    const status = statusMap[eventType];
    if (!status) return json(202, { ok: true, ignored: true });

    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const recipient = cleanText(event.data?.to?.[0], 254).toLowerCase();
    const recipientHash = recipient ? await sha256(recipient) : null;
    const { data: inserted, error: eventError } = await db.from("email_provider_events")
      .upsert({
        provider_event_id: providerEventId,
        provider_message_id: providerMessageId,
        event_type: eventType,
        recipient_hash: recipientHash,
        occurred_at: event.created_at || null,
      }, { onConflict: "provider_event_id", ignoreDuplicates: true })
      .select("provider_event_id").maybeSingle();
    if (eventError) throw eventError;
    if (!inserted) return json(200, { ok: true, duplicate: true });

    const now = event.created_at || new Date().toISOString();
    const update: Record<string, unknown> = { status, updated_at: now };
    const legacyUpdate: Record<string, unknown> = { delivery_status: status, updated_at: now };
    if (status === "delivered") {
      update.delivered_at = now;
      legacyUpdate.delivered_at = now;
    } else if (status === "bounced") {
      update.bounced_at = now;
      legacyUpdate.bounced_at = now;
    } else if (status === "complained") {
      update.complained_at = now;
      legacyUpdate.complained_at = now;
    } else if (status === "failed") {
      update.last_error = "Provider reported final delivery failure";
      legacyUpdate.last_error = "Provider reported final delivery failure";
    }

    const nonRegressingFrom: Record<string, string[]> = {
      accepted: ["pending", "processing", "accepted"],
      delayed: ["pending", "processing", "accepted", "delayed"],
      delivered: ["pending", "processing", "accepted", "delayed"],
      bounced: ["pending", "processing", "accepted", "delayed", "delivered", "bounced"],
      complained: ["pending", "processing", "accepted", "delayed", "delivered", "bounced", "complained"],
      suppressed: ["pending", "processing", "accepted", "delayed", "delivered", "bounced", "suppressed"],
      failed: ["pending", "processing", "accepted", "delayed", "failed"],
    };
    const legacyNonRegressingFrom: Record<string, string[]> = {
      accepted: ["not_sent", "accepted"],
      delayed: ["not_sent", "accepted", "delayed"],
      delivered: ["not_sent", "accepted", "delayed"],
      bounced: ["not_sent", "accepted", "delayed", "delivered", "bounced"],
      complained: ["not_sent", "accepted", "delayed", "delivered", "bounced", "complained"],
      suppressed: ["not_sent", "accepted", "delayed", "delivered", "bounced", "suppressed"],
      failed: ["not_sent", "accepted", "delayed", "failed"],
    };
    await Promise.all([
      db.from("transactional_email_outbox").update(update)
        .eq("provider_message_id", providerMessageId)
        .in("status", nonRegressingFrom[status]),
      db.from("assignment_email_notifications").update(legacyUpdate)
        .eq("provider_message_id", providerMessageId)
        .in("delivery_status", legacyNonRegressingFrom[status]),
      db.from("guardian_invitation_email_notifications").update(legacyUpdate)
        .eq("provider_message_id", providerMessageId)
        .in("delivery_status", legacyNonRegressingFrom[status]),
      db.from("school_request_email_deliveries").update(legacyUpdate)
        .eq("provider_message_id", providerMessageId)
        .in("delivery_status", legacyNonRegressingFrom[status]),
    ]);

    if (recipientHash && ["bounced", "complained", "suppressed"].includes(status)) {
      const { error: suppressionError } = await db.from("email_suppressions").upsert({
        recipient_hash: recipientHash,
        reason: status,
        provider_event_id: providerEventId,
        updated_at: now,
      }, { onConflict: "recipient_hash" });
      if (suppressionError) throw suppressionError;
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error("resend_webhook", cleanText(error instanceof Error ? error.message : error, 300));
    return json(500, { error: "Webhook processing failed" });
  }
});
