import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import {
  cleanText,
  publishableSupabaseKey,
  requiredEnv,
  serverSupabaseKey,
} from "../_shared/email.ts";

type SchoolRequestEmailEvent = "submitted" | "status_updated";
type SchoolRequestStatus = "pending" | "needs_more_info" | "approved" | "rejected" | "duplicate";
type SchoolRequest = {
  id: string;
  requested_by: string;
  requested_name: string;
  status: SchoolRequestStatus;
  approved_school_id: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, publishableSupabaseKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(supabaseUrl, serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => null) as {
      requestId?: unknown;
      event?: unknown;
    } | null;
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const event = body?.event as SchoolRequestEmailEvent | undefined;
    if (!requestId || !["submitted", "status_updated"].includes(event ?? "")) {
      return json(400, { error: "Invalid school request email event" });
    }

    const { data, error } = await serviceClient.from("school_requests")
      .select("id,requested_by,requested_name,status,approved_school_id")
      .eq("id", requestId).maybeSingle();
    if (error) throw error;
    if (!data) return json(404, { error: "School request not found" });
    const request = data as SchoolRequest;

    if (event === "submitted") {
      if (request.requested_by !== user.id || request.status !== "pending") {
        return json(403, { error: "Not allowed for this school request" });
      }
    } else {
      const { data: isSuperadmin, error: adminError } = await userClient
        .rpc("is_superadmin", { p_user_id: user.id });
      if (adminError || isSuperadmin !== true) {
        return json(403, { error: "Superadmin access required" });
      }
    }

    // The database trigger normally creates this event in the same transaction
    // as the request change. This compatibility endpoint safely ensures it
    // exists without sending from the browser or duplicating delivery.
    const idempotencyKey = `school-request-${request.id}-${request.status}`;
    const { data: queued, error: queueError } = await serviceClient
      .from("transactional_email_outbox")
      .upsert({
        event_type: `school_request_${request.status}`,
        category: "school_operations",
        audience: "applicant",
        recipient_user_id: request.requested_by,
        school_id: request.approved_school_id,
        school_name_override: cleanText(request.requested_name, 180),
        template_key: "school_request_status",
        payload: {
          request_id: request.id,
          school_name: cleanText(request.requested_name, 180),
          status: request.status,
        },
        idempotency_key: idempotencyKey,
        available_at: new Date().toISOString(),
      }, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id,status").maybeSingle();
    if (queueError) throw queueError;

    return json(202, {
      ok: true,
      queued: true,
      deliveryId: queued?.id ?? null,
      deliveryStatus: queued?.status ?? "pending",
    });
  } catch (error) {
    console.error("school_request_email", cleanText(error instanceof Error ? error.message : error, 300));
    return json(503, {
      error: "School request saved, but its email is temporarily queued for retry",
    });
  }
});
