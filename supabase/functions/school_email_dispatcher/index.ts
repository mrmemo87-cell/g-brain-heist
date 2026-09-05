import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import {
  PRODUCT_APP_URL,
  cleanText,
  isRoutableEmailAddress,
  operationsSender,
  renderBrandedEmail,
  requiredEnv,
  schoolSender,
  sendWithResend,
  serverSupabaseKey,
  type BrandedEmail,
  type EmailSchoolBrand,
} from "../_shared/email.ts";

type ClaimedAssignment = { id: string; assignment_id: string; student_id: string; attempts: number };
type ClaimedGuardian = { id: string; invitation_id: string; school_id: string; student_id: string; attempts: number };
type ClaimedOutbox = {
  id: string; event_type: string; category: string; audience: string;
  recipient_user_id: string | null; recipient_email: string | null;
  school_id: string | null; school_name_override: string | null;
  template_key: string; payload: Record<string, unknown>;
  idempotency_key: string; attempts: number;
};

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const retryAt = (attempts: number) =>
  new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString();
const fmt = (value: unknown) => {
  const raw = cleanText(value, 80);
  if (!raw) return "Not specified";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(date) + " UTC";
};
const fmtMoney = (amountMinor: unknown, currency: unknown) => {
  const amount = Number(cleanText(amountMinor, 40));
  const code = cleanText(currency, 3).toUpperCase() || "USD";
  if (!Number.isFinite(amount)) return "Not specified";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
};
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const appRoute = (path: string) =>
  `${(Deno.env.get("SCHOOL_EMAIL_APP_URL")?.trim() || PRODUCT_APP_URL).replace(/\/$/, "")}${path}`;

const templateFor = (row: ClaimedOutbox, schoolName: string): BrandedEmail => {
  const payload = row.payload || {};
  const title = cleanText(payload.title, 180);
  const subjectName = cleanText(payload.subject, 100);
  const status = cleanText(payload.status, 80).replaceAll("_", " ");
  const attemptType = cleanText(payload.attempt_type, 30) || "IELTS";
  const role = cleanText(payload.role, 60).replaceAll("_", " ");
  const contextSchoolName = cleanText(payload.school_name, 140) ||
    cleanText(row.school_name_override, 140) || schoolName;
  const decisionAlerts = Array.isArray(payload.alerts)
    ? payload.alerts.slice(0, 10).flatMap((value): Array<Record<string, unknown>> => (
      value && typeof value === "object" && !Array.isArray(value) ? [value as Record<string, unknown>] : []
    ))
    : [];

  switch (row.template_key) {
    case "school_request_status":
      return {
        subject: `${schoolName} request update | Brains Heist`,
        preview: `Your ${schoolName} request is ${status || "being reviewed"}.`,
        kicker: "School workspace",
        headline: status === "pending" ? "We received your school request" : "Your school request has been updated",
        intro: status === "approved"
          ? "Your school workspace is ready. Sign in securely to continue setup and obtain any onboarding access you need."
          : `The current request status is ${status || "under review"}. Sign in for the complete, private update.`,
        details: [{ label: "School", value: schoolName }, { label: "Status", value: status || "Under review" }],
        action: { label: "Open Brains Heist", url: appRoute("/") },
        note: "Internal reviewer notes and reusable school codes are never included in email.",
      };
    case "owner_school_request":
      return {
        subject: `School request: ${contextSchoolName} | Brains Heist Operations`,
        preview: `${contextSchoolName} has a school-request update.`,
        kicker: "Platform operations",
        headline: "School request requires attention",
        intro: "A school request was created or changed. Review it in the protected administration workspace.",
        details: [{ label: "School", value: contextSchoolName }, { label: "Status", value: status || "Updated" }, { label: "Request ID", value: cleanText(payload.request_id, 80) }],
        action: { label: "Open administration", url: appRoute("/") },
      };
    case "assignment_result_ready":
      return {
        subject: `Your result is ready: ${title || "assignment"} | Brains Heist`,
        preview: "Your assignment result is ready in your secure workspace.",
        kicker: "Result ready", headline: "Your assignment result is ready",
        intro: "Open your secure student workspace to review the result and feedback. Scores are kept out of email for privacy.",
        details: [{ label: "Assignment", value: title || "Assignment" }, { label: "Subject", value: subjectName }],
        action: { label: "View result securely", url: appRoute("/") },
      };
    case "assignment_submission_received":
      return {
        subject: `New submission: ${title || "assignment"} | Brains Heist`,
        preview: "A student submission is ready for teacher review.",
        kicker: "Teacher workflow", headline: "A student submission is ready",
        intro: "Open the teacher workspace to review the submission. Student evidence is not included in this email.",
        details: [{ label: "Assignment", value: title || "Assignment" }, { label: "Subject", value: subjectName }],
        action: { label: "Open teacher workspace", url: appRoute("/") },
      };
    case "assignment_due_reminder":
      return {
        subject: `Due soon: ${title || "assignment"} | Brains Heist`,
        preview: "Your assignment is due in about 24 hours.",
        kicker: "Due soon", headline: "Your assignment is due soon",
        intro: "This is a friendly reminder to finish and submit your work in the secure student workspace.",
        details: [{ label: "Assignment", value: title || "Assignment" }, { label: "Subject", value: subjectName }, { label: "Due", value: fmt(payload.due_at) }],
        action: { label: "Open assignment", url: appRoute("/") },
      };
    case "assignment_updated":
      return {
        subject: `Assignment updated: ${title || "assignment"} | Brains Heist`,
        preview: "A school assignment has been updated.",
        kicker: "Assignment update", headline: "Your assignment has been updated",
        intro: "Open the secure student workspace to review the latest instructions and schedule.",
        details: [{ label: "Assignment", value: title || "Assignment" }, { label: "Subject", value: subjectName }, { label: "Due", value: fmt(payload.due_at) }],
        action: { label: "Review assignment", url: appRoute("/") },
      };
    case "assignment_cancelled":
      return {
        subject: `Assignment withdrawn: ${title || "assignment"} | Brains Heist`,
        preview: "A school assignment is no longer active.",
        kicker: "Assignment update", headline: "An assignment has been withdrawn",
        intro: "The school has withdrawn this assignment. Open your workspace for the current assignment list.",
        details: [{ label: "Assignment", value: title || "Assignment" }, { label: "Subject", value: subjectName }],
        action: { label: "Open student workspace", url: appRoute("/") },
      };
    case "guardian_invitation_reminder":
      return {
        subject: `Parent invitation expires soon | ${schoolName} × Brains Heist`,
        preview: "Your secure parent invitation expires in about 24 hours.",
        kicker: "Parent access reminder", headline: "Your parent invitation expires soon",
        intro: "Use the original secure invitation email before it expires. If you cannot find it, ask the school to issue a fresh link.",
        details: [{ label: "School", value: schoolName }, { label: "Expires", value: fmt(payload.expires_at) }],
        action: { label: "Open parent portal", url: appRoute("/parent-portal.html") },
      };
    case "ielts_result_ready":
      return {
        subject: `${attemptType.toUpperCase()} result ready | Brains Heist`,
        preview: "Your IELTS result is ready in your secure workspace.",
        kicker: "IELTS result", headline: "Your IELTS result is ready",
        intro: "Sign in to review your result and next steps. Band information and response details remain inside the secure platform.",
        details: [{ label: "Skill", value: attemptType }],
        action: {
          label: "View IELTS result",
          url: appRoute(`/ielts/${encodeURIComponent(attemptType)}/result/${encodeURIComponent(cleanText(payload.attempt_id, 100))}`),
        },
      };
    case "ielts_feedback_ready":
      return {
        subject: `${attemptType.toUpperCase()} feedback ready | Brains Heist`,
        preview: "Your reviewed IELTS feedback is ready.",
        kicker: "IELTS feedback", headline: "Your reviewed feedback is ready",
        intro: "Your review has been finalized. Sign in to read the feedback and recommended next steps securely.",
        details: [{ label: "Skill", value: attemptType }],
        action: {
          label: "View reviewed feedback",
          url: appRoute(`/ielts/review-result/${encodeURIComponent(attemptType)}/${encodeURIComponent(cleanText(payload.attempt_id, 100))}`),
        },
      };
    case "academic_report_ready":
      return {
        subject: `Academic report ready | ${schoolName} × Brains Heist`,
        preview: "A finalized academic report is ready in your secure portal.",
        kicker: "Academic report", headline: "A finalized academic report is ready",
        intro: "Open the secure portal to view the report. Marks, support needs, and other private academic information are never placed in email.",
        details: [
          { label: "Report", value: cleanText(payload.report_type, 100).replaceAll("_", " ") || "Academic report" },
          { label: "Period ending", value: cleanText(payload.period_end, 40) },
        ],
        action: {
          label: row.audience === "parent" ? "Open parent portal" : "View report securely",
          url: row.audience === "parent" ? appRoute("/parent-portal.html") : appRoute("/"),
        },
      };
    case "school_membership_active":
      return {
        subject: `Welcome to ${schoolName} on Brains Heist`,
        preview: `Your ${schoolName} workspace access is active.`,
        kicker: "Access activated", headline: `Welcome to ${schoolName}`,
        intro: "Your school membership is active. Sign in to access the tools and information authorized for your role.",
        details: [{ label: "Role", value: role || "School member" }],
        action: { label: "Open school workspace", url: appRoute("/") },
      };
    case "school_membership_changed":
      return {
        subject: `School access updated | ${schoolName} × Brains Heist`,
        preview: "Your school workspace access has changed.",
        kicker: "Access update", headline: "Your school access has changed",
        intro: "Your school membership status was updated. Contact the school directly if you believe this was unexpected.",
        details: [{ label: "Role", value: role || "School member" }, { label: "Status", value: status || "Updated" }],
        action: { label: "Open Brains Heist", url: appRoute("/") },
      };
    case "guardian_access_status":
      return {
        subject: `Parent access ${status || "updated"} | ${schoolName} × Brains Heist`,
        preview: "Your secure parent access status has changed.",
        kicker: "Parent access", headline: status === "active" ? "Your parent access is active" : "Your parent access has changed",
        intro: status === "active"
          ? "The school has confirmed your secure parent access. Sign in to view the school-approved progress experience."
          : "The school updated your parent access. Contact the school directly if you need clarification.",
        details: [{ label: "Status", value: status || "Updated" }, { label: "Relationship", value: cleanText(payload.relationship, 80) }],
        action: { label: "Open parent portal", url: appRoute("/parent-portal.html") },
      };
    case "teacher_allocation_active":
      return {
        subject: `Teaching allocation confirmed | ${schoolName} × Brains Heist`,
        preview: "A class and subject allocation is active in your teacher workspace.",
        kicker: "Teacher allocation", headline: "Your teaching allocation is active",
        intro: "The school assigned a class and subject to your teacher workspace.",
        details: [{ label: "Class", value: cleanText(payload.class_name, 120) }, { label: "Subject", value: subjectName }],
        action: { label: "Open teacher workspace", url: appRoute("/") },
      };
    case "programme_access_requested": {
      const moduleName = cleanText(payload.module_key, 40).replaceAll("_", " ") || "programme";
      const studentName = cleanText(payload.student_name, 120) || "A student";
      return {
        subject: `Student programme request | ${schoolName} × Brains Heist`,
        preview: `${studentName} requested access to ${moduleName}.`,
        kicker: "School administration",
        headline: "A student requested programme access",
        intro: "Review the student’s request in the protected school administration workspace. A request does not reserve or allocate a seat automatically.",
        details: [
          { label: "Student", value: studentName },
          { label: "Programme", value: moduleName.charAt(0).toUpperCase() + moduleName.slice(1) },
          { label: "Current access", value: cleanText(payload.access_reason, 60).replaceAll("_", " ") || "Not available" },
        ],
        action: { label: "Review programme seats", url: appRoute("/?view=school_admin&adminTab=programme-seats") },
        note: "Allocate a seat only when it matches the school’s academic plan and available programme capacity.",
      };
    }
    case "admission_status":
      return {
        subject: `Admission application ${status || "updated"} | ${schoolName} × Brains Heist`,
        preview: "Your school admission application has been updated.",
        kicker: "Admissions", headline: "Your admission application has been updated",
        intro: "The school has updated your application status. Contact the admissions team if you need more information.",
        details: [{ label: "Candidate", value: cleanText(payload.candidate_name, 140) }, { label: "Applied grade", value: cleanText(payload.applied_grade, 20) }, { label: "Status", value: status || "Updated" }],
        action: { label: "Open Brains Heist", url: appRoute("/") },
      };
    case "billing_quote_status":
      return {
        subject: `Quote ${status || "update"} | ${schoolName} × Brains Heist`,
        preview: "Your school billing quote has been updated.",
        kicker: "Plan and billing", headline: "Your school quote has been updated",
        intro: "Open the protected Plan & Billing workspace to review the official quote and next action.",
        details: [{ label: "Quote", value: title || "School package" }, { label: "Status", value: status || "Updated" }, { label: "Expires", value: fmt(payload.expires_at) }],
        action: { label: "Review plan and billing", url: appRoute("/") },
      };
    case "billing_payment_status":
      return {
        subject: `Payment ${status || "update"} | ${schoolName} × Brains Heist`,
        preview: "Your school billing payment status has changed.",
        kicker: "Plan and billing", headline: "Your school payment has been updated",
        intro: "Review the current payment status and any required action in the protected billing workspace.",
        details: [
          { label: "Status", value: status || "Updated" },
          { label: "Amount", value: fmtMoney(payload.amount_minor, payload.currency) },
          { label: "Method", value: cleanText(payload.method, 60).replaceAll("_", " ") },
        ],
        action: { label: "Review plan and billing", url: appRoute("/") },
      };
    case "billing_subscription_status":
      return {
        subject: `Subscription ${status || "update"} | ${schoolName} × Brains Heist`,
        preview: "Your school subscription status has changed.",
        kicker: "Billing status", headline: "Your subscription has been updated",
        intro: "Review the current plan status and any required action in the protected billing workspace.",
        details: [{ label: "Plan", value: cleanText(payload.plan, 80) }, { label: "Status", value: status || "Updated" }, { label: "Current period ends", value: fmt(payload.period_end) }],
        action: { label: "Manage billing securely", url: cleanText(payload.management_url, 1500) || appRoute("/") },
      };
    case "billing_renewal_reminder":
      return {
        subject: `Upcoming school-plan renewal | ${schoolName} × Brains Heist`,
        preview: "Your school plan renews in about seven days.",
        kicker: "Renewal reminder", headline: "Your school plan renews soon",
        intro: "Review your plan and billing details before the next period begins.",
        details: [{ label: "Plan", value: cleanText(payload.plan, 80) }, { label: "Renewal date", value: fmt(payload.period_end) }],
        action: { label: "Review billing", url: cleanText(payload.management_url, 1500) || appRoute("/") },
      };
    case "school_head_decision_digest":
      return {
        subject: `${payload.has_critical === true ? "Action required" : "Decision Center update"} | ${schoolName} × Brains Heist`,
        preview: `${cleanText(payload.alert_count, 10) || decisionAlerts.length} school leadership item(s) need attention.`,
        kicker: payload.has_critical === true ? "School Head · action required" : "School Head · decision digest",
        headline: payload.has_critical === true ? "Important school decisions need your attention" : "Your Decision Center has new priorities",
        intro: "Open the protected School Head workspace for the complete school-scoped evidence and recommended action. Sensitive student and staff details stay inside Brains Heist.",
        details: decisionAlerts.map((alert) => ({
          label: `${cleanText(alert.severity, 20).toUpperCase()} · ${cleanText(alert.title, 140)}`,
          value: `${cleanText(alert.count, 10) || "1"} affected`,
        })),
        action: { label: "Open Decision Center", url: appRoute("/?view=school_head&headTab=decisions") },
        note: "Resolved alerts close automatically. Reminder emails are deduplicated and follow the school leadership notification cadence.",
      };
    case "demo_request_confirmation":
      return {
        subject: "Demo request received | Brains Heist",
        preview: "We received your Brains Heist school demo request.",
        kicker: "Demo request", headline: "Thanks — your demo request is in",
        intro: "The Brains Heist team will review your school’s needs and contact you using the submitted work email.",
        details: [{ label: "School", value: schoolName }],
        action: { label: "Explore Brains Heist", url: appRoute("/") },
      };
    case "owner_demo_request":
      return {
        subject: `New demo request: ${contextSchoolName} | Brains Heist Operations`,
        preview: `${contextSchoolName} requested a Brains Heist demo.`,
        kicker: "Platform operations", headline: "A new school requested a demo",
        intro: "Open the protected administration workspace to review and follow up with the lead.",
        details: [{ label: "School", value: contextSchoolName }, { label: "Lead ID", value: cleanText(payload.demo_request_id, 80) }],
        action: { label: "Open administration", url: appRoute("/") },
      };
    case "owner_new_user":
      return {
        subject: "New account created | Brains Heist Operations",
        preview: "A new Brains Heist account was created.",
        kicker: "Platform operations", headline: "A new account was created",
        intro: "Review the account in the protected administration workspace if operational follow-up is required.",
        details: [{ label: "Username", value: cleanText(payload.username, 100) }, { label: "User ID", value: cleanText(payload.user_id, 80) }],
        action: { label: "Open administration", url: appRoute("/") },
      };
    case "owner_billing_payment":
      return {
        subject: `Billing payment ${status || "update"}: ${contextSchoolName} | Brains Heist Operations`,
        preview: `${contextSchoolName} has a billing payment update.`,
        kicker: "Platform operations", headline: "A school billing payment was updated",
        intro: "Review the payment event in the protected administration workspace before taking any operational action.",
        details: [
          { label: "School", value: contextSchoolName },
          { label: "Status", value: status || "Updated" },
          { label: "Amount", value: fmtMoney(payload.amount_minor, payload.currency) },
          { label: "Payment ID", value: cleanText(payload.payment_attempt_id, 80) },
        ],
        action: { label: "Open administration", url: appRoute("/") },
      };
    default:
      throw new Error(`Unsupported email template: ${row.template_key}`);
  }
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const resendApiKey = requiredEnv("RESEND_API_KEY");
    const configuredFrom = Deno.env.get("SCHOOL_EMAIL_FROM")?.trim() ||
      Deno.env.get("SCHOOL_REQUEST_EMAIL_FROM")?.trim() ||
      Deno.env.get("NEW_USER_EMAIL_FROM")?.trim();
    if (!configuredFrom) throw new Error("Missing school transactional email sender configuration");
    const replyTo = Deno.env.get("SCHOOL_EMAIL_REPLY_TO")?.trim() ||
      Deno.env.get("SCHOOL_REQUEST_REPLY_TO")?.trim() || undefined;

    const supplied = req.headers.get("x-school-email-dispatch-key")?.trim() || "";
    const { data: config, error: configError } = await db
      .from("school_email_dispatch_config").select("dispatch_key")
      .eq("singleton", true).maybeSingle();
    if (configError) throw new Error(`config: ${configError.message}`);
    if (!supplied || !config?.dispatch_key || supplied !== config.dispatch_key) {
      return json(401, { error: "Unauthorized" });
    }

    const [
      { data: assignmentClaims, error: assignmentClaimError },
      { data: guardianClaims, error: guardianClaimError },
      { data: outboxClaims, error: outboxClaimError },
    ] = await Promise.all([
      db.rpc("rpc_claim_assignment_email_notifications", { p_limit: 30 }),
      db.rpc("rpc_claim_guardian_invitation_email_notifications", { p_limit: 30 }),
      db.rpc("rpc_claim_transactional_email_outbox", { p_limit: 50 }),
    ]);
    if (assignmentClaimError) throw new Error(`assignment claim: ${assignmentClaimError.message}`);
    if (guardianClaimError) throw new Error(`guardian claim: ${guardianClaimError.message}`);
    if (outboxClaimError) throw new Error(`outbox claim: ${outboxClaimError.message}`);

    let assignmentAccepted = 0;
    let guardianAccepted = 0;
    let outboxAccepted = 0;
    let skipped = 0;
    let failed = 0;

    for (const claim of (assignmentClaims || []) as ClaimedAssignment[]) {
      try {
        const [{ data: notification }, { data: assignment }, { data: student }] = await Promise.all([
          db.from("assignment_email_notifications").select("id,status,attempts").eq("id", claim.id).single(),
          db.from("assignments").select("id,teacher_id,school_id,title,subject_name,subject_id,description,assigned_at,due_at,publish_status,notify_students_by_email").eq("id", claim.assignment_id).single(),
          db.from("users").select("id,full_name,username,school_id").eq("id", claim.student_id).single(),
        ]);
        if (!notification || !assignment || !student || assignment.notify_students_by_email !== true ||
            assignment.publish_status === "draft" || new Date(assignment.assigned_at).getTime() > Date.now()) {
          await db.from("assignment_email_notifications").update({
            status: "cancelled", last_error: null, updated_at: new Date().toISOString(),
          }).eq("id", claim.id);
          skipped++;
          continue;
        }
        const { data: authResult } = await db.auth.admin.getUserById(student.id);
        const authUser = authResult?.user;
        const to = authUser?.email?.trim().toLowerCase();
        if (!to || !(authUser.email_confirmed_at || authUser.confirmed_at)) {
          await db.from("assignment_email_notifications").update({
            status: "skipped", delivery_status: "not_sent",
            last_error: "Student does not have a verified email address",
            updated_at: new Date().toISOString(),
          }).eq("id", claim.id);
          skipped++;
          continue;
        }
        if (!isRoutableEmailAddress(to)) {
          await db.from("assignment_email_notifications").update({
            status: "skipped", delivery_status: "not_sent",
            last_error: "Student email address is not routable",
            updated_at: new Date().toISOString(),
          }).eq("id", claim.id);
          skipped++;
          continue;
        }
        const { data: teacher } = await db.from("teachers").select("user_id")
          .eq("id", assignment.teacher_id).maybeSingle();
        const teacherUser = teacher?.user_id
          ? (await db.from("users").select("full_name,username,school_id")
            .eq("id", teacher.user_id).maybeSingle()).data
          : null;
        const schoolId = assignment.school_id || student.school_id || teacherUser?.school_id;
        const schoolData = schoolId
          ? (await db.from("schools").select("id,name,logo_url").eq("id", schoolId).maybeSingle()).data
          : null;
        const school: EmailSchoolBrand = schoolData || { id: schoolId, name: "Your school", logo_url: null };
        const schoolName = cleanText(school.name, 140) || "Your school";
        const studentName = cleanText(student.full_name || student.username, 100) || "Student";
        const teacherName = cleanText(teacherUser?.full_name || teacherUser?.username, 100) || "Your teacher";
        const title = cleanText(assignment.title, 180) || "New assignment";
        const subjectName = cleanText(assignment.subject_name || assignment.subject_id, 100) || "School assignment";
        const rendered = renderBrandedEmail(school, {
          subject: `${schoolName} — ${title} | Brains Heist`,
          preview: `New assignment from ${schoolName}`,
          kicker: "New assignment", headline: title,
          intro: `Hi ${studentName}, ${teacherName} has published a ${subjectName} assignment for you.`,
          details: [{ label: "Subject", value: subjectName }, { label: "Due", value: fmt(assignment.due_at) }],
          action: { label: "Open assignment in Brains Heist", url: appRoute("/") },
          note: cleanText(assignment.description, 1000) || null,
        });
        const providerId = await sendWithResend({
          apiKey: resendApiKey, from: schoolSender(configuredFrom, schoolName), to,
          replyTo, idempotencyKey: `assignment-${claim.id}`, ...rendered,
        });
        await db.from("assignment_email_notifications").update({
          status: "sent", delivery_status: "accepted", sent_at: new Date().toISOString(),
          provider_message_id: providerId, last_error: null, updated_at: new Date().toISOString(),
        }).eq("id", claim.id);
        assignmentAccepted++;
      } catch (error) {
        const message = cleanText(error instanceof Error ? error.message : error, 500) ||
          "Unknown email delivery error";
        await db.from("assignment_email_notifications").update({
          status: claim.attempts >= 5 ? "failed" : "pending",
          delivery_status: claim.attempts >= 5 ? "failed" : "not_sent",
          next_attempt_at: retryAt(claim.attempts), last_error: message,
          updated_at: new Date().toISOString(),
        }).eq("id", claim.id);
        failed++;
      }
    }

    for (const claim of (guardianClaims || []) as ClaimedGuardian[]) {
      try {
        const [{ data: queue }, { data: invitation }, { data: student }, { data: schoolData }] =
          await Promise.all([
            db.from("guardian_invitation_email_notifications")
              .select("id,invited_email,raw_token,status,attempts").eq("id", claim.id).single(),
            db.from("guardian_invitations")
              .select("id,invited_email,relationship_label,expires_at,claimed_at,revoked_at")
              .eq("id", claim.invitation_id).single(),
            db.from("users").select("full_name,username").eq("id", claim.student_id).single(),
            db.from("schools").select("id,name,logo_url").eq("id", claim.school_id).single(),
          ]);
        if (!queue || !invitation || !schoolData || !queue.raw_token || invitation.claimed_at ||
            invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) {
          await db.from("guardian_invitation_email_notifications").update({
            status: "cancelled", raw_token: null, last_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", claim.id);
          skipped++;
          continue;
        }
        const guardianTo = cleanText(queue.invited_email, 254).toLowerCase();
        if (!isRoutableEmailAddress(guardianTo)) {
          await db.from("guardian_invitation_email_notifications").update({
            status: "skipped", delivery_status: "not_sent", raw_token: null,
            last_error: "Guardian invitation email address is not routable",
            updated_at: new Date().toISOString(),
          }).eq("id", claim.id);
          skipped++;
          continue;
        }
        const school = schoolData as EmailSchoolBrand;
        const schoolName = cleanText(school.name, 140) || "Your school";
        const studentName = cleanText(student?.full_name || student?.username, 100) || "your child";
        const relationship = cleanText(invitation.relationship_label, 80) || "Parent / Guardian";
        const inviteUrl = `${appRoute("/parent-portal.html")}?invite=${encodeURIComponent(queue.raw_token)}`;
        const rendered = renderBrandedEmail(school, {
          subject: `${schoolName} invited you to follow ${studentName} | Brains Heist`,
          preview: `Secure parent invitation from ${schoolName}`,
          kicker: "Secure parent access",
          headline: `You’ve been invited to follow ${studentName}’s progress`,
          intro: `${schoolName} has invited you as ${relationship} to a private, school-approved parent view in Brains Heist.`,
          details: [{ label: "Student", value: studentName }, { label: "Invitation expires", value: fmt(invitation.expires_at) }],
          action: { label: "Accept secure invitation", url: inviteUrl },
          note: "For privacy, sign in or create the parent account using the exact invited email address. The link is time-limited and can be revoked by the school.",
        });
        const providerId = await sendWithResend({
          apiKey: resendApiKey, from: schoolSender(configuredFrom, schoolName),
          to: guardianTo, replyTo,
          idempotencyKey: `guardian-invitation-${claim.id}`, ...rendered,
        });
        await db.from("guardian_invitation_email_notifications").update({
          status: "sent", delivery_status: "accepted", sent_at: new Date().toISOString(),
          provider_message_id: providerId, raw_token: null, last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", claim.id);
        guardianAccepted++;
      } catch (error) {
        const message = cleanText(error instanceof Error ? error.message : error, 500) ||
          "Unknown email delivery error";
        await db.from("guardian_invitation_email_notifications").update({
          status: claim.attempts >= 5 ? "failed" : "pending",
          delivery_status: claim.attempts >= 5 ? "failed" : "not_sent",
          next_attempt_at: retryAt(claim.attempts), last_error: message,
          updated_at: new Date().toISOString(),
        }).eq("id", claim.id);
        failed++;
      }
    }

    for (const row of (outboxClaims || []) as ClaimedOutbox[]) {
      try {
        let to = cleanText(row.recipient_email, 254).toLowerCase();
        if (!to && row.audience === "platform_owner") {
          to = cleanText(
            Deno.env.get("PLATFORM_ALERT_EMAIL") || Deno.env.get("NEW_USER_ALERT_TO"),
            254,
          ).toLowerCase();
        }
        if (!to && row.recipient_user_id) {
          const { data: authResult } = await db.auth.admin.getUserById(row.recipient_user_id);
          const authUser = authResult?.user;
          if (authUser?.email && (authUser.email_confirmed_at || authUser.confirmed_at)) {
            to = authUser.email.trim().toLowerCase();
          }
        }
        if (!isRoutableEmailAddress(to)) {
          await db.from("transactional_email_outbox").update({
            status: "skipped", last_error: "No verified, routable recipient email is available",
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          skipped++;
          continue;
        }
        if (row.recipient_user_id && !["security", "platform_operations"].includes(row.category)) {
          const { data: preference } = await db.from("email_communication_preferences")
            .select("email_enabled,digest_frequency").eq("user_id", row.recipient_user_id)
            .eq("category", row.category).maybeSingle();
          if (preference &&
              (preference.email_enabled === false || preference.digest_frequency === "never")) {
            await db.from("transactional_email_outbox").update({
              status: "skipped", last_error: "Recipient disabled this email category",
              updated_at: new Date().toISOString(),
            }).eq("id", row.id);
            skipped++;
            continue;
          }
        }
        const recipientHash = await sha256(to);
        const { data: suppressed } = await db.rpc("rpc_email_is_suppressed", {
          p_recipient_hash: recipientHash,
        });
        if (suppressed === true) {
          await db.from("transactional_email_outbox").update({
            status: "suppressed", last_error: "Recipient is on the transactional suppression list",
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          skipped++;
          continue;
        }
        const schoolData = row.school_id
          ? (await db.from("schools").select("id,name,logo_url")
            .eq("id", row.school_id).maybeSingle()).data
          : null;
        const contextSchool: EmailSchoolBrand = schoolData || {
          id: row.school_id,
          name: row.school_name_override || "Your school",
          logo_url: null,
        };
        const contextSchoolName = cleanText(contextSchool.name, 140) || "Your school";
        const isPlatformOperations = row.audience === "platform_owner";
        const renderBrand: EmailSchoolBrand = isPlatformOperations
          ? { id: null, name: "Brains Heist Operations", logo_url: null }
          : contextSchool;
        const rendered = renderBrandedEmail(
          renderBrand,
          templateFor(row, contextSchoolName),
          isPlatformOperations ? "platform_operations" : "school",
        );
        const providerId = await sendWithResend({
          apiKey: resendApiKey,
          from: isPlatformOperations
            ? operationsSender(configuredFrom)
            : schoolSender(configuredFrom, contextSchoolName),
          to,
          replyTo,
          idempotencyKey: row.idempotency_key,
          ...rendered,
        });
        const acceptedAt = new Date().toISOString();
        await db.from("transactional_email_outbox").update({
          status: "accepted", provider_message_id: providerId, accepted_at: acceptedAt,
          last_error: null, updated_at: acceptedAt,
        }).eq("id", row.id);
        if (row.template_key === "ielts_result_ready" && row.payload?.preference_id) {
          await db.from("ielts_notification_preferences").update({
            email_sent_at: acceptedAt, updated_at: acceptedAt,
          }).eq("id", row.payload.preference_id);
        }
        outboxAccepted++;
      } catch (error) {
        const message = cleanText(error instanceof Error ? error.message : error, 500) ||
          "Unknown email delivery error";
        await db.from("transactional_email_outbox").update({
          status: row.attempts >= 5 ? "failed" : "pending",
          next_attempt_at: retryAt(row.attempts), last_error: message,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        failed++;
      }
    }

    return json(200, {
      ok: true, assignmentAccepted, guardianAccepted, outboxAccepted, skipped, failed,
    });
  } catch (error) {
    const detail = cleanText(error instanceof Error ? error.message : error, 300) ||
      "Unknown dispatcher error";
    console.error("school_email_dispatcher", detail);
    return json(503, { error: "School email dispatcher temporarily unavailable", detail });
  }
});