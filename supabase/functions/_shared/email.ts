export const PRODUCT_NAME = "Brains Heist";
export const PRODUCT_LOGO_URL = "https://www.brainsheist.com/logo.png";
export const PRODUCT_APP_URL = "https://www.brainsheist.com";

export type EmailSchoolBrand = {
  id?: string | null;
  name?: string | null;
  logo_url?: string | null;
};

export type BrandedEmail = {
  subject: string;
  preview: string;
  kicker: string;
  headline: string;
  intro: string;
  details?: Array<{ label: string; value: string }>;
  action?: { label: string; url: string } | null;
  note?: string | null;
};

export const cleanText = (value: unknown, maxLength = 500) =>
  String(value ?? "").trim().slice(0, maxLength);

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);

export const safeHttpsUrl = (value: unknown) => {
  const candidate = cleanText(value, 1600);
  return /^https:\/\//i.test(candidate) ? candidate : "";
};

export const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server secret: ${name}`);
  return value;
};

export const serverSupabaseKey = () => {
  const keySet = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
  if (keySet) {
    const parsed = JSON.parse(keySet) as Record<string, unknown>;
    if (typeof parsed.default === "string" && parsed.default.trim()) {
      return parsed.default.trim();
    }
  }
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
};

export const publishableSupabaseKey = () => {
  const keySet = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")?.trim();
  if (keySet) {
    const parsed = JSON.parse(keySet) as Record<string, unknown>;
    if (typeof parsed.default === "string" && parsed.default.trim()) {
      return parsed.default.trim();
    }
  }
  return requiredEnv("SUPABASE_ANON_KEY");
};

export const schoolSender = (configuredFrom: string, schoolName: string) => {
  const match = configuredFrom.match(/<([^>]+)>/);
  const address = cleanText(match?.[1] || configuredFrom, 254);
  const display = cleanText(schoolName, 90).replace(/[\r\n"<>]/g, "") || "Your school";
  return `${display} via ${PRODUCT_NAME} <${address}>`;
};

const schoolMark = (school: EmailSchoolBrand) => {
  const schoolName = cleanText(school.name, 140) || "Your school";
  const schoolLogo = safeHttpsUrl(school.logo_url);
  if (schoolLogo) {
    return `<img src="${escapeHtml(schoolLogo)}" alt="${escapeHtml(schoolName)} logo" width="50" height="50" style="display:block;width:50px;height:50px;object-fit:contain;border-radius:12px;background:#fff;padding:5px"/>`;
  }

  return `<span role="img" aria-label="${escapeHtml(schoolName)} school mark" style="display:inline-block;width:50px;height:50px;line-height:50px;text-align:center;border-radius:12px;background:#fff;color:#0f172a;font-size:22px;font-weight:800">${escapeHtml(schoolName.slice(0, 1).toUpperCase() || "S")}</span>`;
};

export const renderBrandedEmail = (school: EmailSchoolBrand, email: BrandedEmail) => {
  const schoolName = cleanText(school.name, 140) || "Your school";
  const details = (email.details || []).filter((item) => cleanText(item.value));
  const detailHtml = details.length
    ? `<div style="margin:20px 0;padding:17px;border-radius:12px;background:#111f33;color:#cbd5e1">${details.map((item) => `<p style="margin:0 0 8px"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</p>`).join("").replace(/<\/p>$/, "</p>")}</div>`
    : "";
  const actionUrl = safeHttpsUrl(email.action?.url);
  const actionHtml = email.action && actionUrl
    ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:6px;padding:13px 20px;border-radius:10px;background:#22d3ee;color:#04111f;font-weight:800;text-decoration:none">${escapeHtml(email.action.label)}</a>`
    : "";
  const noteHtml = cleanText(email.note, 1200)
    ? `<p style="margin:18px 0 0;color:#94a3b8;font-size:13px;line-height:1.6">${escapeHtml(email.note)}</p>`
    : "";
  const productMark = `<img src="${PRODUCT_LOGO_URL}" alt="Brains Heist logo" width="46" height="46" style="display:block;width:46px;height:46px;object-fit:contain;border-radius:11px;background:#08111f;padding:3px"/>`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#07111f;font-family:Arial,sans-serif;color:#e2e8f0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(email.preview)}</div><div style="padding:30px 14px"><div style="max-width:640px;margin:0 auto;border:1px solid #1e3a5f;border-radius:18px;overflow:hidden;background:#0b1728"><div style="padding:26px 28px;background:linear-gradient(135deg,#082f49,#312e81,#581c87)"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="62" valign="middle">${schoolMark(school)}</td><td valign="middle" style="padding-right:12px"><div style="color:#fff;font-size:17px;font-weight:800">${escapeHtml(schoolName)}</div><div style="color:#cbd5e1;font-size:11px;margin-top:3px">School communication</div></td><td width="18" align="center" style="color:#94a3b8;font-size:18px">×</td><td width="54" align="right">${productMark}</td><td valign="middle" style="padding-left:9px"><div style="color:#fff;font-size:14px;font-weight:800;white-space:nowrap">Brains Heist</div><div style="color:#67e8f9;font-size:10px;margin-top:2px;white-space:nowrap">Academic progress platform</div></td></tr></table></div><div style="padding:28px"><p style="margin:0 0 8px;color:#67e8f9;font-size:12px;font-weight:800;letter-spacing:1.6px">${escapeHtml(email.kicker.toUpperCase())}</p><h1 style="margin:0 0 16px;color:#fff;font-size:27px;line-height:1.25">${escapeHtml(email.headline)}</h1><p style="margin:0 0 20px;color:#cbd5e1;line-height:1.65">${escapeHtml(email.intro)}</p>${detailHtml}${actionHtml}${noteHtml}<p style="margin:26px 0 0;color:#64748b;font-size:12px;line-height:1.55">This school-authorized transactional message was delivered securely through Brains Heist. Sign in to view private academic information; sensitive results are never placed in email.</p></div></div></div></body></html>`;

  const text = [
    `${schoolName} × Brains Heist`,
    email.headline,
    email.intro,
    ...details.map((item) => `${item.label}: ${item.value}`),
    email.action && actionUrl ? `${email.action.label}: ${actionUrl}` : "",
    cleanText(email.note, 1200),
    "This school-authorized transactional message was delivered securely through Brains Heist.",
  ].filter(Boolean).join("\n\n");

  return { subject: cleanText(email.subject, 180), html, text };
};

export const sendWithResend = async (params: {
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  idempotencyKey: string;
  subject: string;
  html: string;
  text: string;
}) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": cleanText(params.idempotencyKey, 256),
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      reply_to: params.replyTo || undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  const payload = await response.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(cleanText(payload?.message || payload?.name || `Resend returned ${response.status}`, 500));
  }
  return payload.id;
};
