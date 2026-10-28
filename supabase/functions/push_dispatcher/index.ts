// Drains public.push_notification_outbox and sends Web Push messages to each user's devices.
// Called every minute by the `brains-heist-push-dispatcher` cron with the dispatch key from
// public.push_dispatch_config (same pattern as school_email_dispatcher). verify_jwt is off;
// the header key is the credential. VAPID keys live in the same server-only config row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import webpush from "npm:web-push@3.6.7";
import { requiredEnv, serverSupabaseKey } from "../_shared/email.ts";

type OutboxRow = {
  id: string; user_id: string; event_type: string; title: string; body: string; url: string;
  payload: Record<string, unknown>; attempts: number;
};
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

const MAX_ATTEMPTS = 5;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: config, error: configError } = await db
      .from("push_dispatch_config")
      .select("dispatch_key, vapid_public_key, vapid_private_key, vapid_subject")
      .eq("singleton", true).maybeSingle();
    if (configError) throw new Error(`config: ${configError.message}`);
    const supplied = req.headers.get("x-push-dispatch-key")?.trim() || "";
    if (!supplied || !config?.dispatch_key || supplied !== config.dispatch_key) {
      return json(401, { error: "Unauthorized" });
    }
    if (!config.vapid_public_key || !config.vapid_private_key || !config.vapid_subject) {
      return json(200, { skipped: "vapid_not_configured" });
    }
    webpush.setVapidDetails(config.vapid_subject, config.vapid_public_key, config.vapid_private_key);

    const { data: claims, error: claimError } = await db.rpc("rpc_claim_push_notifications", { p_limit: 50 });
    if (claimError) throw new Error(`claim: ${claimError.message}`);
    const rows = (claims ?? []) as OutboxRow[];
    if (rows.length === 0) return json(200, { processed: 0 });

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: subs, error: subsError } = await db
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, failure_count")
      .in("user_id", userIds).is("disabled_at", null);
    if (subsError) throw new Error(`subscriptions: ${subsError.message}`);
    const byUser = new Map<string, Subscription[]>();
    for (const s of (subs ?? []) as Array<Subscription & { user_id: string }>) {
      byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    }

    let sent = 0, skipped = 0, failed = 0, disabled = 0;
    for (const row of rows) {
      const devices = byUser.get(row.user_id) ?? [];
      if (devices.length === 0) {
        await db.from("push_notification_outbox").update({ status: "skipped", last_error: "no_active_subscription", updated_at: new Date().toISOString() }).eq("id", row.id);
        skipped += 1;
        continue;
      }
      const message = JSON.stringify({
        title: row.title, body: row.body, url: row.url || "/", tag: `${row.event_type}:${(row.payload?.assignment_id as string) ?? row.id}`,
        event_type: row.event_type, payload: row.payload ?? {},
      });
      let delivered = 0;
      let lastError = "";
      for (const device of devices) {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            message,
            { TTL: 60 * 60 * 24, urgency: "normal" },
          );
          delivered += 1;
          await db.from("push_subscriptions").update({ last_seen_at: new Date().toISOString(), failure_count: 0 }).eq("id", device.id);
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          lastError = `${statusCode ?? "?"}: ${(error as Error).message?.slice(0, 200)}`;
          if (statusCode === 404 || statusCode === 410) {
            // The device removed the app or revoked permission; stop sending to it.
            await db.from("push_subscriptions").update({ disabled_at: new Date().toISOString(), disabled_reason: `gone_${statusCode}` }).eq("id", device.id);
            disabled += 1;
          } else {
            await db.from("push_subscriptions").update({ failure_count: (device.failure_count ?? 0) + 1 }).eq("id", device.id);
          }
        }
      }
      if (delivered > 0) {
        await db.from("push_notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: lastError || null, updated_at: new Date().toISOString() }).eq("id", row.id);
        sent += 1;
      } else if (row.attempts >= MAX_ATTEMPTS) {
        await db.from("push_notification_outbox").update({ status: "failed", last_error: lastError || "undeliverable", updated_at: new Date().toISOString() }).eq("id", row.id);
        failed += 1;
      } else {
        const delayMinutes = Math.min(60, 2 ** row.attempts);
        await db.from("push_notification_outbox").update({
          status: "pending", last_error: lastError || "retry",
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        failed += 1;
      }
    }
    return json(200, { processed: rows.length, sent, skipped, failed, disabled });
  } catch (error) {
    console.error("push_dispatcher failed", error);
    return json(500, { error: (error as Error).message });
  }
});
