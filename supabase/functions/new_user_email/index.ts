import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { cleanText, requiredEnv, serverSupabaseKey } from "../_shared/email.ts";

type AuthHookPayload = {
  type?: string;
  user?: {
    id?: string;
    email?: string;
    created_at?: string;
    user_metadata?: Record<string, unknown> | null;
  };
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const usernameFor = (payload: AuthHookPayload) => {
  const value = payload.user?.user_metadata?.username;
  if (typeof value === "string" && value.trim()) return cleanText(value, 100);
  const email = payload.user?.email || "";
  return cleanText(email.includes("@") ? email.split("@")[0] : "new-user", 100);
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const expectedSecret = requiredEnv("NEW_USER_EMAIL_HOOK_SECRET");
    const providedSecret = req.headers.get("x-hook-secret") ?? "";
    if (!providedSecret || providedSecret !== expectedSecret) {
      return json(401, { error: "Unauthorized" });
    }
    const payload = await req.json().catch(() => null) as AuthHookPayload | null;
    const userId = cleanText(payload?.user?.id, 80);
    if (!userId) return json(400, { error: "Missing user id in payload" });
    if (payload?.type && payload.type !== "user.created") {
      return json(200, { ok: true, skipped: true, reason: "not user.created" });
    }

    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.from("transactional_email_outbox").upsert({
      event_type: "new_user_created",
      category: "platform_operations",
      audience: "platform_owner",
      template_key: "owner_new_user",
      payload: {
        user_id: userId,
        username: usernameFor(payload || {}),
        created_at: payload?.user?.created_at || new Date().toISOString(),
      },
      idempotency_key: `owner-new-user-${userId}`,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) throw error;
    return json(202, { ok: true, queued: true });
  } catch (error) {
    console.error("new_user_email", cleanText(error instanceof Error ? error.message : error, 300));
    return json(503, { error: "New-user notification is temporarily queued for retry" });
  }
});
