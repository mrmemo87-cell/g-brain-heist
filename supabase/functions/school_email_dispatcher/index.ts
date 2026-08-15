import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

type ClaimedAssignment = { id: string; assignment_id: string; student_id: string; attempts: number };
type ClaimedGuardian = { id: string; invitation_id: string; school_id: string; student_id: string; attempts: number };
type School = { id: string; name: string | null; logo_url: string | null };

const PRODUCT_NAME = "Brains Heist";
const PRODUCT_LOGO_URL = "https://brainsheist.com/logo.png";

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const env = (name: string) => {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing required server secret: ${name}`);
  return v;
};
const supabaseKey = (jsonName: string, legacyName: string) => {
  const raw = Deno.env.get(jsonName)?.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.default === "string" && parsed.default.trim()) return parsed.default.trim();
  }
  return env(legacyName);
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[c] ?? c));
const safeUrl = (v: unknown) => {
  const s = clean(v, 1500);
  return /^https:\/\//i.test(s) ? s : "";
};
const fmt = (v: string | null | undefined) => {
  if (!v) return "No due date";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
};
const fromForSchool = (base: string, name: string) => {
  const m = base.match(/<([^>]+)>/);
  const address = (m?.[1] || base).trim();
  const display = clean(name, 90).replace(/[\r\n"<>]/g, "") || "Your school";
  return `${display} via ${PRODUCT_NAME} <${address}>`;
};

const brandHeader = (s: School) => {
  const name = esc(clean(s.name, 140) || "Your school");
  const logo = safeUrl(s.logo_url);
  const schoolMark = logo
    ? `<img src="${esc(logo)}" alt="${name} logo" width="48" height="48" style="display:block;width:48px;height:48px;object-fit:contain;border-radius:10px;background:#fff;padding:4px"/>`
    : `<span style="display:inline-block;width:48px;height:48px;line-height:48px;text-align:center;border-radius:10px;background:#fff;color:#0f172a;font-size:22px;font-weight:800">${name.slice(0, 1)}</span>`;
  const productMark = `<img src="${PRODUCT_LOGO_URL}" alt="Brains Heist logo" width="44" height="44" style="display:block;width:44px;height:44px;object-fit:contain;border-radius:10px;background:#08111f;padding:2px"/>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="58" valign="middle">${schoolMark}</td>
    <td valign="middle" style="padding-right:14px"><div style="color:#fff;font-size:17px;font-weight:800">${name}</div><div style="color:#94a3b8;font-size:12px;margin-top:3px">School communication</div></td>
    <td width="18" valign="middle" align="center" style="color:#94a3b8;font-size:18px">×</td>
    <td width="54" valign="middle" align="right">${productMark}</td>
    <td valign="middle" style="padding-left:9px"><div style="color:#fff;font-size:14px;font-weight:800;white-space:nowrap">Brains Heist</div><div style="color:#67e8f9;font-size:10px;margin-top:2px;white-space:nowrap">Academic progress platform</div></td>
  </tr></table>`;
};

const shell = (s: School, pre: string, content: string) => `<!doctype html><html><body style="margin:0;background:#07111f;font-family:Arial,sans-serif;color:#e2e8f0"><div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div><div style="padding:30px 14px"><div style="max-width:640px;margin:0 auto;border:1px solid #1e3a5f;border-radius:18px;overflow:hidden;background:#0b1728"><div style="padding:26px 28px;background:linear-gradient(135deg,#082f49,#312e81,#581c87)">${brandHeader(s)}</div><div style="padding:28px">${content}<p style="margin:26px 0 0;color:#64748b;font-size:12px;line-height:1.55">This is a school-authorized transactional message delivered through Brains Heist. If you were not expecting it, contact the school directly.</p></div></div></div></body></html>`;

const send = async (p: { key: string; from: string; to: string; reply?: string; subject: string; html: string; text: string; idem: string }) => {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json", "Idempotency-Key": p.idem },
    body: JSON.stringify({ from: p.from, to: [p.to], reply_to: p.reply || undefined, subject: p.subject, html: p.html, text: p.text }),
  });
  const x = await r.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
  if (!r.ok || !x?.id) throw new Error(clean(x?.message || x?.name || `Resend returned ${r.status}`, 500));
  return x.id;
};
const retryAt = (a: number) => new Date(Date.now() + Math.min(60, Math.pow(2, Math.max(0, a - 1))) * 60000).toISOString();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const url = env("SUPABASE_URL");
    const serviceKey = supabaseKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const resend = env("RESEND_API_KEY");
    const configuredFrom = Deno.env.get("SCHOOL_EMAIL_FROM")?.trim() || Deno.env.get("SCHOOL_REQUEST_EMAIL_FROM")?.trim() || Deno.env.get("NEW_USER_EMAIL_FROM")?.trim();
    if (!configuredFrom) throw new Error("Missing school transactional email sender configuration");
    const app = (Deno.env.get("SCHOOL_EMAIL_APP_URL")?.trim() || "https://www.brainsheist.com").replace(/\/$/, "");
    const reply = Deno.env.get("SCHOOL_EMAIL_REPLY_TO")?.trim() || Deno.env.get("SCHOOL_REQUEST_REPLY_TO")?.trim() || undefined;
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const supplied = req.headers.get("x-school-email-dispatch-key")?.trim() || "";
    const { data: cfg, error: cfgErr } = await db.from("school_email_dispatch_config").select("dispatch_key").eq("singleton", true).maybeSingle();
    if (cfgErr) throw new Error(`config: ${cfgErr.message}`);
    if (!supplied || !cfg?.dispatch_key || supplied !== cfg.dispatch_key) return json(401, { error: "Unauthorized" });

    const { data: ac, error: ae } = await db.rpc("rpc_claim_assignment_email_notifications", { p_limit: 30 });
    if (ae) throw new Error(`assignment claim: ${ae.message}`);
    const { data: gc, error: ge } = await db.rpc("rpc_claim_guardian_invitation_email_notifications", { p_limit: 30 });
    if (ge) throw new Error(`guardian claim: ${ge.message}`);

    let assignmentSent = 0, guardianSent = 0, skipped = 0, failed = 0;

    for (const c of (ac || []) as ClaimedAssignment[]) {
      try {
        const [{ data: n }, { data: a }, { data: u }] = await Promise.all([
          db.from("assignment_email_notifications").select("id,status,attempts").eq("id", c.id).single(),
          db.from("assignments").select("id,teacher_id,school_id,title,subject_name,subject_id,description,assigned_at,due_at,publish_status,notify_students_by_email").eq("id", c.assignment_id).single(),
          db.from("users").select("id,full_name,username,school_id").eq("id", c.student_id).single(),
        ]);
        if (!n || !a || !u || a.notify_students_by_email !== true || a.publish_status === "draft" || new Date(a.assigned_at).getTime() > Date.now()) {
          await db.from("assignment_email_notifications").update({ status: "cancelled", last_error: null, updated_at: new Date().toISOString() }).eq("id", c.id);
          skipped++;
          continue;
        }

        const { data: auth } = await db.auth.admin.getUserById(u.id);
        const au = auth?.user;
        const to = au?.email?.trim().toLowerCase();
        if (!to || !(au.email_confirmed_at || au.confirmed_at)) {
          await db.from("assignment_email_notifications").update({ status: "skipped", last_error: "Student does not have a verified email address", updated_at: new Date().toISOString() }).eq("id", c.id);
          skipped++;
          continue;
        }

        const { data: t } = await db.from("teachers").select("user_id").eq("id", a.teacher_id).maybeSingle();
        const tu = t?.user_id ? (await db.from("users").select("full_name,username,school_id").eq("id", t.user_id).maybeSingle()).data : null;
        const sid = a.school_id || u.school_id || tu?.school_id;
        const sd = sid ? (await db.from("schools").select("id,name,logo_url").eq("id", sid).maybeSingle()).data : null;
        const school: School = sd || { id: sid || "", name: "Your school", logo_url: null };
        const sn = clean(school.name, 140) || "Your school";
        const un = clean(u.full_name || u.username, 100) || "Student";
        const tn = clean(tu?.full_name || tu?.username, 100) || "Your teacher";
        const title = clean(a.title, 180) || "New assignment";
        const subject = clean(a.subject_name || a.subject_id, 100) || "School assignment";
        const due = fmt(a.due_at);
        const open = `${app}/`;
        const content = `<p style="margin:0 0 8px;color:#67e8f9;font-size:12px;font-weight:800;letter-spacing:1.6px">NEW ASSIGNMENT</p><h1 style="margin:0 0 16px;color:#fff;font-size:27px">${esc(title)}</h1><p style="margin:0 0 20px;color:#cbd5e1;line-height:1.65">Hi ${esc(un)}, ${esc(tn)} has published a ${esc(subject)} assignment for you.</p><div style="padding:17px;border-radius:12px;background:#111f33;color:#cbd5e1"><p style="margin:0 0 8px"><strong>Subject:</strong> ${esc(subject)}</p><p style="margin:0"><strong>Due:</strong> ${esc(due)}</p></div>${a.description ? `<p style="margin:18px 0 0;color:#cbd5e1;line-height:1.6">${esc(clean(a.description, 1000))}</p>` : ""}<a href="${esc(open)}" style="display:inline-block;margin-top:22px;padding:13px 20px;border-radius:10px;background:#22d3ee;color:#04111f;font-weight:800;text-decoration:none">Open assignment in Brains Heist</a>`;
        const text = [`${sn} × Brains Heist`, `New assignment: ${title}`, `Student: ${un}`, `Teacher: ${tn}`, `Subject: ${subject}`, `Due: ${due}`, a.description ? clean(a.description, 1000) : "", `Open Brains Heist: ${open}`].filter(Boolean).join("\n\n");
        const pid = await send({ key: resend, from: fromForSchool(configuredFrom, sn), to, reply, subject: `${sn} — ${title} | Brains Heist`, html: shell(school, `New assignment from ${sn}`, content), text, idem: `assignment-${c.id}` });
        await db.from("assignment_email_notifications").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: pid, last_error: null, updated_at: new Date().toISOString() }).eq("id", c.id);
        assignmentSent++;
      } catch (e) {
        const m = clean(e instanceof Error ? e.message : e, 500) || "Unknown email delivery error";
        await db.from("assignment_email_notifications").update({ status: c.attempts >= 5 ? "failed" : "pending", next_attempt_at: retryAt(c.attempts), last_error: m, updated_at: new Date().toISOString() }).eq("id", c.id);
        failed++;
      }
    }

    for (const c of (gc || []) as ClaimedGuardian[]) {
      try {
        const [{ data: q }, { data: i }, { data: u }, { data: sd }] = await Promise.all([
          db.from("guardian_invitation_email_notifications").select("id,invited_email,raw_token,status,attempts").eq("id", c.id).single(),
          db.from("guardian_invitations").select("id,invited_email,relationship_label,expires_at,claimed_at,revoked_at").eq("id", c.invitation_id).single(),
          db.from("users").select("full_name,username").eq("id", c.student_id).single(),
          db.from("schools").select("id,name,logo_url").eq("id", c.school_id).single(),
        ]);
        if (!q || !i || !sd || !q.raw_token || i.claimed_at || i.revoked_at || new Date(i.expires_at).getTime() <= Date.now()) {
          await db.from("guardian_invitation_email_notifications").update({ status: "cancelled", raw_token: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", c.id);
          skipped++;
          continue;
        }

        const school = sd as School;
        const sn = clean(school.name, 140) || "Your school";
        const un = clean(u?.full_name || u?.username, 100) || "your child";
        const rel = clean(i.relationship_label, 80) || "Parent / Guardian";
        const invite = `${app}/parent-portal.html?invite=${encodeURIComponent(q.raw_token)}`;
        const expires = fmt(i.expires_at);
        const content = `<p style="margin:0 0 8px;color:#67e8f9;font-size:12px;font-weight:800;letter-spacing:1.6px">SECURE PARENT ACCESS</p><h1 style="margin:0 0 16px;color:#fff;font-size:27px">You’ve been invited to follow ${esc(un)}’s progress</h1><p style="margin:0 0 20px;color:#cbd5e1;line-height:1.65">${esc(sn)} has invited you as ${esc(rel)} to a private, school-approved parent view in Brains Heist.</p><div style="padding:17px;border-radius:12px;background:#111f33;color:#cbd5e1"><p style="margin:0 0 8px"><strong>Student:</strong> ${esc(un)}</p><p style="margin:0"><strong>Invitation expires:</strong> ${esc(expires)}</p></div><a href="${esc(invite)}" style="display:inline-block;margin-top:22px;padding:13px 20px;border-radius:10px;background:#22d3ee;color:#04111f;font-weight:800;text-decoration:none">Accept secure invitation</a><p style="margin:18px 0 0;color:#94a3b8;font-size:13px;line-height:1.55">For privacy, you must sign in or create your parent account using this exact invited email address. This link is time-limited and can be revoked by the school.</p>`;
        const text = [`${sn} × Brains Heist`, `Secure parent invitation for ${un}`, `${sn} invited you as ${rel}.`, `Invitation expires: ${expires}`, `Accept invitation: ${invite}`, `For privacy, sign in with this exact invited email address: ${q.invited_email}`].join("\n\n");
        const pid = await send({ key: resend, from: fromForSchool(configuredFrom, sn), to: q.invited_email, reply, subject: `${sn} invited you to follow ${un} | Brains Heist`, html: shell(school, `Secure parent invitation from ${sn}`, content), text, idem: `guardian-invitation-${c.id}` });
        await db.from("guardian_invitation_email_notifications").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: pid, raw_token: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", c.id);
        guardianSent++;
      } catch (e) {
        const m = clean(e instanceof Error ? e.message : e, 500) || "Unknown email delivery error";
        await db.from("guardian_invitation_email_notifications").update({ status: c.attempts >= 5 ? "failed" : "pending", next_attempt_at: retryAt(c.attempts), last_error: m, updated_at: new Date().toISOString() }).eq("id", c.id);
        failed++;
      }
    }

    return json(200, { ok: true, assignmentSent, guardianSent, skipped, failed });
  } catch (e) {
    const detail = clean(e instanceof Error ? e.message : e, 300) || "Unknown dispatcher error";
    console.error("school_email_dispatcher", detail);
    return json(503, { error: "School email dispatcher temporarily unavailable", detail });
  }
});
