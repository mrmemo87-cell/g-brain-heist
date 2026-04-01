import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
    headers: { "content-type": "application/json" },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const getEnvOrDefault = (key: string, fallback: string): string => {
  const value = Deno.env.get(key);
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value;
};

const extractUsername = (payload: AuthHookPayload): string => {
  const metadata = payload.user?.user_metadata ?? {};
  const rawUsername = metadata?.username;
  if (typeof rawUsername === "string" && rawUsername.trim().length > 0) {
    return rawUsername.trim();
  }
  const email = payload.user?.email ?? "";
  return email.includes("@") ? email.split("@")[0] : "new-user";
};

async function sendEmailViaResend(params: {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: [params.toEmail],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error (${response.status}): ${errorText}`);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const expectedSecret = getEnv("NEW_USER_EMAIL_HOOK_SECRET");
    const providedSecret = req.headers.get("x-hook-secret") ?? "";
    if (providedSecret !== expectedSecret) {
      return json(401, { error: "Unauthorized" });
    }

    const payload = (await req.json()) as AuthHookPayload;
    const userId = payload.user?.id ?? "";
    const userEmail = payload.user?.email ?? "";
    const eventType = payload.type ?? "";

    if (!userId || !userEmail) {
      return json(400, { error: "Missing user id/email in payload" });
    }

    if (eventType && eventType !== "user.created") {
      return json(200, { ok: true, skipped: true, reason: "not user.created" });
    }

    const resendApiKey = getEnv("RESEND_API_KEY");
    const fromEmail = getEnv("NEW_USER_EMAIL_FROM");
    const adminEmail = getEnvOrDefault("NEW_USER_ALERT_TO", "mr.memo87@gmail.com");
    const username = extractUsername(payload);
    const createdAt = payload.user?.created_at ?? new Date().toISOString();

    await sendEmailViaResend({
      resendApiKey,
      fromEmail,
      toEmail: adminEmail,
      subject: `New user signup: ${username}`,
      html:
        `<h2>New user created</h2>` +
        `<p><strong>User ID:</strong> ${userId}</p>` +
        `<p><strong>Email:</strong> ${userEmail}</p>` +
        `<p><strong>Username:</strong> ${username}</p>` +
        `<p><strong>Created:</strong> ${createdAt}</p>`,
    });

    return json(200, { ok: true });
  } catch (error) {
    console.error("new_user_email error", error);
    return json(500, { error: (error as Error).message });
  }
});
