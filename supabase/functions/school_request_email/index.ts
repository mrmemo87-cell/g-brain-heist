import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

type SchoolRequestEmailEvent = "submitted" | "status_updated";
type SchoolRequestStatus =
  | "pending"
  | "needs_more_info"
  | "approved"
  | "rejected"
  | "duplicate";

type SchoolRequest = {
  id: string;
  requested_by: string;
  requested_name: string;
  status: SchoolRequestStatus;
  admin_notes: string | null;
  approved_school_id: string | null;
  updated_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server secret: ${name}`);
  return value;
};

const supabaseKey = (jsonEnvName: string, legacyEnvName: string) => {
  const keySet = Deno.env.get(jsonEnvName)?.trim();
  if (keySet) {
    try {
      const parsed = JSON.parse(keySet) as Record<string, unknown>;
      if (typeof parsed.default === "string" && parsed.default.trim()) {
        return parsed.default.trim();
      }
    } catch {
      throw new Error(`Invalid server key set: ${jsonEnvName}`);
    }
  }
  return requiredEnv(legacyEnvName);
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );

const cleanText = (value: string | null | undefined, maxLength = 1500) =>
  (value ?? "").trim().slice(0, maxLength);

const statusCopy: Record<
  SchoolRequestStatus,
  { label: string; subjectPrefix: string; headline: string; intro: string }
> = {
  pending: {
    label: "Pending review",
    subjectPrefix: "School request received",
    headline: "We received your school request",
    intro:
      "The Brains Heist superadmin team will review the details. We will email this verified address whenever the status changes.",
  },
  needs_more_info: {
    label: "More information needed",
    subjectPrefix: "More information needed",
    headline: "We need a little more information",
    intro:
      "A Brains Heist superadmin reviewed your request and needs additional details before continuing.",
  },
  approved: {
    label: "Approved",
    subjectPrefix: "School approved",
    headline: "Your school request is approved",
    intro:
      "Your school workspace has been created. Sign in to Brains Heist to continue the school setup flow.",
  },
  rejected: {
    label: "Not approved",
    subjectPrefix: "School request update",
    headline: "Your school request has been reviewed",
    intro:
      "The Brains Heist superadmin team could not approve this request in its current form.",
  },
  duplicate: {
    label: "School already exists",
    subjectPrefix: "School already registered",
    headline: "This school already exists in Brains Heist",
    intro:
      "Your request was matched to an existing school. Sign in to continue with the existing school workspace.",
  },
};

const buildEmail = (params: {
  request: SchoolRequest;
  inviteCode: string | null;
  existingSchoolName: string | null;
  appUrl: string;
}) => {
  const { request, inviteCode, existingSchoolName, appUrl } = params;
  const copy = statusCopy[request.status];
  const schoolName = escapeHtml(cleanText(request.requested_name, 180));
  const note = escapeHtml(cleanText(request.admin_notes));
  const safeAppUrl = escapeHtml(appUrl);
  const detailRows = [
    `<p style="margin:0 0 8px"><strong>School:</strong> ${schoolName}</p>`,
    `<p style="margin:0 0 8px"><strong>Status:</strong> ${copy.label}</p>`,
    `<p style="margin:0"><strong>Request ID:</strong> ${escapeHtml(request.id)}</p>`,
  ];

  if (existingSchoolName) {
    detailRows.splice(
      1,
      0,
      `<p style="margin:0 0 8px"><strong>Matched school:</strong> ${escapeHtml(cleanText(existingSchoolName, 180))}</p>`,
    );
  }

  const actionDetail = inviteCode
    ? `<div style="margin:20px 0;padding:16px;border:1px solid #22d3ee;border-radius:12px;background:#0f2740"><p style="margin:0 0 6px;color:#a5f3fc">School invite code</p><p style="margin:0;font-size:24px;font-weight:800;letter-spacing:4px;color:#ffffff">${escapeHtml(inviteCode)}</p></div>`
    : "";
  const adminMessage = note
    ? `<div style="margin:20px 0;padding:16px;border-left:4px solid #a855f7;border-radius:8px;background:#21143a"><p style="margin:0 0 6px;color:#d8b4fe;font-weight:700">Message from Brains Heist</p><p style="margin:0;white-space:pre-wrap;color:#e2e8f0">${note}</p></div>`
    : "";

  const text = [
    copy.headline,
    copy.intro,
    `School: ${cleanText(request.requested_name, 180)}`,
    existingSchoolName ? `Matched school: ${cleanText(existingSchoolName, 180)}` : "",
    `Status: ${copy.label}`,
    `Request ID: ${request.id}`,
    inviteCode ? `School invite code: ${inviteCode}` : "",
    note ? `Message from Brains Heist: ${cleanText(request.admin_notes)}` : "",
    `Open Brains Heist: ${appUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = `<!doctype html><html><body style="margin:0;background:#07111f;font-family:Arial,sans-serif;color:#e2e8f0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(copy.headline)}</div><div style="padding:32px 16px"><div style="max-width:620px;margin:0 auto;border:1px solid #1e3a5f;border-radius:18px;overflow:hidden;background:#0b1728"><div style="padding:28px;background:linear-gradient(135deg,#082f49,#312e81,#581c87)"><p style="margin:0 0 8px;color:#67e8f9;font-size:12px;font-weight:800;letter-spacing:2px">BRAINS HEIST</p><h1 style="margin:0;color:#ffffff;font-size:26px;line-height:1.25">${escapeHtml(copy.headline)}</h1></div><div style="padding:28px"><p style="margin:0 0 20px;color:#cbd5e1;line-height:1.65">${escapeHtml(copy.intro)}</p><div style="padding:16px;border-radius:12px;background:#111f33;color:#cbd5e1">${detailRows.join("")}</div>${actionDetail}${adminMessage}<a href="${safeAppUrl}" style="display:inline-block;margin-top:8px;padding:13px 20px;border-radius:10px;background:#22d3ee;color:#04111f;font-weight:800;text-decoration:none">Open Brains Heist</a><p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.5">This transactional email was sent to the verified email address on the Brains Heist account that submitted the request.</p></div></div></div></body></html>`;

  return {
    subject: `${copy.subjectPrefix} — ${cleanText(request.requested_name, 120)}`,
    html,
    text,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = supabaseKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_ANON_KEY",
    );
    const serviceRoleKey = supabaseKey(
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const resendApiKey = requiredEnv("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("SCHOOL_REQUEST_EMAIL_FROM")?.trim() ||
      Deno.env.get("NEW_USER_EMAIL_FROM")?.trim();
    if (!fromEmail) {
      throw new Error(
        "Missing required server secret: SCHOOL_REQUEST_EMAIL_FROM or NEW_USER_EMAIL_FROM",
      );
    }

    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const body = (await req.json().catch(() => null)) as {
      requestId?: unknown;
      event?: unknown;
    } | null;
    const requestId =
      typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const event = body?.event as SchoolRequestEmailEvent | undefined;
    if (!requestId || !["submitted", "status_updated"].includes(event ?? "")) {
      return json(400, { error: "Invalid school request email event" });
    }

    const { data: requestData, error: requestError } = await serviceClient
      .from("school_requests")
      .select(
        "id, requested_by, requested_name, status, admin_notes, approved_school_id, updated_at",
      )
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestData) return json(404, { error: "School request not found" });
    const request = requestData as SchoolRequest;

    if (event === "submitted") {
      if (request.requested_by !== user.id || request.status !== "pending") {
        return json(403, { error: "Not allowed for this school request" });
      }
    } else {
      const { data: isSuperadmin, error: adminError } = await userClient.rpc(
        "is_superadmin",
        { p_user_id: user.id },
      );
      if (adminError || isSuperadmin !== true) {
        return json(403, { error: "Superadmin access required" });
      }
      if (request.status === "pending") {
        return json(409, { error: "No superadmin status update is available" });
      }
    }

    const { data: authUserResult, error: authUserError } =
      await serviceClient.auth.admin.getUserById(request.requested_by);
    const recipient = authUserResult?.user;
    if (
      authUserError ||
      !recipient?.email ||
      !(recipient.email_confirmed_at || recipient.confirmed_at)
    ) {
      return json(409, { error: "Requester no longer has a verified email" });
    }

    let inviteCode: string | null = null;
    let existingSchoolName: string | null = null;
    if (request.approved_school_id) {
      const { data: school } = await serviceClient
        .from("schools")
        .select("name, invite_code")
        .eq("id", request.approved_school_id)
        .maybeSingle();
      existingSchoolName = school?.name ?? null;
      inviteCode = school?.invite_code ?? null;
    }

    const eventType =
      event === "submitted" ? "submitted" : request.status;
    const eventKey = `${eventType}:${request.updated_at}`;
    const { data: existingDelivery, error: existingError } = await serviceClient
      .from("school_request_email_deliveries")
      .select("id, status, attempts, provider_message_id")
      .eq("request_id", request.id)
      .eq("event_key", eventKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingDelivery?.status === "sent") {
      return json(200, {
        ok: true,
        duplicate: true,
        messageId: existingDelivery.provider_message_id,
      });
    }

    const now = new Date().toISOString();
    const deliveryRecord = {
      request_id: request.id,
      event_key: eventKey,
      event_type: eventType,
      recipient_email: recipient.email.toLowerCase(),
      status: "sending",
      attempts: (existingDelivery?.attempts ?? 0) + 1,
      last_error: null,
      updated_at: now,
    };
    const { data: claimedDelivery, error: claimError } = await serviceClient
      .from("school_request_email_deliveries")
      .upsert(
        existingDelivery
          ? {
              ...deliveryRecord,
              id: existingDelivery.id,
            }
          : deliveryRecord,
        { onConflict: "request_id,event_key" },
      )
      .select("id")
      .single();
    if (claimError) throw claimError;

    const appUrl =
      Deno.env.get("SCHOOL_REQUEST_APP_URL")?.trim() ||
      "https://brainsheist.com";
    const email = buildEmail({
      request,
      inviteCode,
      existingSchoolName,
      appUrl,
    });
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `school-request-${request.id}-${eventKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient.email],
        reply_to: Deno.env.get("SCHOOL_REQUEST_REPLY_TO")?.trim() || undefined,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    const resendPayload = (await resendResponse.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;
    if (!resendResponse.ok || !resendPayload?.id) {
      const providerError = cleanText(
        resendPayload?.message ||
          resendPayload?.name ||
          `Resend returned ${resendResponse.status}`,
        500,
      );
      await serviceClient
        .from("school_request_email_deliveries")
        .update({ status: "failed", last_error: providerError, updated_at: now })
        .eq("id", claimedDelivery.id);
      return json(502, {
        error: "School request saved, but the email could not be sent",
      });
    }

    await serviceClient
      .from("school_request_email_deliveries")
      .update({
        status: "sent",
        provider_message_id: resendPayload.id,
        last_error: null,
        sent_at: now,
        updated_at: now,
      })
      .eq("id", claimedDelivery.id);

    return json(200, { ok: true, messageId: resendPayload.id });
  } catch (error) {
    console.error("school_request_email error", error);
    return json(503, {
      error:
        "School request saved, but email delivery is temporarily unavailable",
    });
  }
});
