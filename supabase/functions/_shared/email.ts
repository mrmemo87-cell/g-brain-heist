export const PRODUCT_NAME = "Brains Heist";
export const PRODUCT_LOGO_URL = "https://www.brainsheist.com/logo.png";
export const PRODUCT_APP_URL = "https://www.brainsheist.com";

export type EmailSchoolBrand = {
  id?: string | null;
  name?: string | null;
  logo_url?: string | null;
  time_zone?: string | null;
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

export type EmailRenderMode = "school" | "platform_operations";

export const cleanText = (value: unknown, maxLength = 500) =>
  String(value ?? "").trim().slice(0, maxLength);

/** "Fri, 24 Oct 2026 at 6:00 PM (Bishkek time)" in the school's time zone; schools without one get "UTC". */
export const fmtIn = (value: unknown, timeZone?: string | null) => {
  const raw = cleanText(value, 80);
  if (!raw) return "Not specified";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  let zone = cleanText(timeZone, 64) || "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { zone = "UTC"; }
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }).format(date);
  const label = zone === "UTC" || zone === "Etc/UTC" ? "UTC" : `${zone.slice(zone.lastIndexOf("/") + 1).replaceAll("_", " ")} time`;
  return `${day.replace(/^(\w{3}) /, "$1, ")} at ${time} (${label})`;
};

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

const senderAddress = (configuredFrom: string) => {
  const match = configuredFrom.match(/<([^>]+)>/);
  return cleanText(match?.[1] || configuredFrom, 254);
};

export const schoolSender = (configuredFrom: string, schoolName: string) => {
  const address = senderAddress(configuredFrom);
  const display = cleanText(schoolName, 90).replace(/[\r\n"<>]/g, "") || "Your school";
  return `${display} via ${PRODUCT_NAME} <${address}>`;
};

export const operationsSender = (configuredFrom: string) =>
  `${PRODUCT_NAME} Operations <${senderAddress(configuredFrom)}>`;

const NON_ROUTABLE_EMAIL_SUFFIXES = [".local", ".localhost", ".invalid", ".test", ".example"];

export const isRoutableEmailAddress = (value: unknown) => {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1).replace(/\.$/, "");
  if (!domain || ["localhost", "local", "invalid", "test", "example"].includes(domain)) return false;
  return !NON_ROUTABLE_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
};

const schoolMark = (school: EmailSchoolBrand) => {
  const schoolName = cleanText(school.name, 140) || "Your school";
  const schoolLogo = safeHttpsUrl(school.logo_url);
  if (schoolLogo) {
    return `<img src="${escapeHtml(schoolLogo)}" alt="${escapeHtml(schoolName)} logo" width="44" height="44" style="display:block;width:44px;height:44px;object-fit:contain;border-radius:8px;background:#ffffff;border:1px solid #e5e7eb"/>`;
  }

  return `<span role="img" aria-label="${escapeHtml(schoolName)} school mark" style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;border-radius:8px;background:#eef2ff;color:#3730a3;font-size:20px;font-weight:700">${escapeHtml(schoolName.slice(0, 1).toUpperCase() || "S")}</span>`;
};

// Light, quiet layout: one accent colour, a clear headline, a details table and one button. Reads well on phones and
// in clients that force light mode. Private results are never placed in email.
const INK = "#111827", BODY = "#374151", MUTED = "#6b7280", LINE = "#e5e7eb", ACCENT = "#4338ca";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const renderBrandedEmail = (
  school: EmailSchoolBrand,
  email: BrandedEmail,
  mode: EmailRenderMode = "school",
) => {
  const schoolName = cleanText(school.name, 140) || "Your school";
  const isOperations = mode === "platform_operations";
  const details = (email.details || []).filter((item) => cleanText(item.value));
  const detailHtml = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid ${LINE};border-radius:8px;border-collapse:separate;background:#f9fafb">${details.map((item, index) => `<tr><td valign="top" style="padding:12px 16px;${index ? `border-top:1px solid ${LINE};` : ""}width:96px;color:${MUTED};font-size:13px;line-height:1.5">${escapeHtml(item.label)}</td><td valign="top" style="padding:12px 16px 12px 0;${index ? `border-top:1px solid ${LINE};` : ""}color:${INK};font-size:14px;font-weight:600;line-height:1.5">${escapeHtml(item.value)}</td></tr>`).join("")}</table>`
    : "";
  const actionUrl = safeHttpsUrl(email.action?.url);
  const actionHtml = email.action && actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px"><tr><td style="border-radius:8px;background:${ACCENT}"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 24px;border-radius:8px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(email.action.label)}</a></td></tr></table><p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5">If the button doesn’t work, open <a href="${escapeHtml(actionUrl)}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(actionUrl.replace(/^https:\/\//, ""))}</a></p>`
    : "";
  const noteHtml = cleanText(email.note, 1200)
    ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${LINE};color:${MUTED};font-size:13px;line-height:1.6">${escapeHtml(email.note)}</p>`
    : "";
  const productMark = `<img src="${PRODUCT_LOGO_URL}" alt="Brains Heist logo" width="20" height="20" style="display:inline-block;width:20px;height:20px;vertical-align:middle;border-radius:5px;background:#08111f"/>`;
  const brandHeader = isOperations
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:12px"><img src="${PRODUCT_LOGO_URL}" alt="Brains Heist logo" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:8px;background:#08111f"/></td><td valign="middle"><div style="color:${INK};font-size:16px;font-weight:700">Brains Heist Operations</div><div style="color:${MUTED};font-size:12px;margin-top:2px">Internal platform notification</div></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:12px">${schoolMark(school)}</td><td valign="middle"><div style="color:${INK};font-size:16px;font-weight:700;line-height:1.3">${escapeHtml(schoolName)}</div><div style="color:${MUTED};font-size:12px;margin-top:2px">School communication</div></td></tr></table>`;
  const footer = isOperations
    ? "This Brains Heist operational notification was generated for an authorized platform administrator. Review sensitive details only inside the protected administration workspace."
    : `Sent on behalf of ${schoolName}. Marks, results and feedback are never included in email. Sign in to Brains Heist to see them.`;
  const signature = isOperations
    ? `${productMark}&nbsp; <span style="color:${BODY};font-weight:600">Brains Heist</span>`
    : `${productMark}&nbsp; <span style="color:${BODY};font-weight:600">${escapeHtml(schoolName)} <span style="color:${MUTED};font-weight:400">×</span> Brains Heist</span> <span style="color:${MUTED}">· Academic progress platform</span>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(email.subject)}</title></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};color:${BODY};-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(email.preview)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;overflow:hidden"><tr><td style="height:4px;line-height:4px;font-size:0;background:${ACCENT}">&nbsp;</td></tr><tr><td style="padding:22px 28px;border-bottom:1px solid ${LINE}">${brandHeader}</td></tr><tr><td style="padding:28px 28px 30px"><p style="margin:0 0 10px;color:${ACCENT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(email.kicker)}</p><h1 style="margin:0 0 14px;color:${INK};font-size:23px;line-height:1.3;font-weight:700">${escapeHtml(email.headline)}</h1><p style="margin:0 0 24px;color:${BODY};font-size:15px;line-height:1.65">${escapeHtml(email.intro)}</p>${detailHtml}${actionHtml}${noteHtml}</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px"><tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${MUTED}"><p style="margin:0 0 6px">${signature}</p><p style="margin:0">${escapeHtml(footer)}</p></td></tr></table></td></tr></table></body></html>`;

  const text = [
    isOperations ? "Brains Heist Operations" : `${schoolName} × Brains Heist`,
    email.headline,
    email.intro,
    ...details.map((item) => `${item.label}: ${item.value}`),
    email.action && actionUrl ? `${email.action.label}: ${actionUrl}` : "",
    cleanText(email.note, 1200),
    footer,
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
  if (!isRoutableEmailAddress(params.to)) {
    throw new Error("Recipient email address is not routable");
  }
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