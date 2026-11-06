import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import {
  PRODUCT_APP_URL,
  cleanText,
  isRoutableEmailAddress,
  learnerOptOutToken,
  learnerSender,
  operationsSender,
  renderBrandedEmail,
  requiredEnv,
  sendWithResend,
  serverSupabaseKey,
  type BrandedEmail,
} from "../_shared/email.ts";

// Sends the IELTS learner emails (Russian follow-ups after the free unit, local-payment decisions) and the owner's
// "confirm this transfer" alert. It claims only these templates, so the school email dispatcher is never affected.
// Same auth as the school dispatcher: the x-school-email-dispatch-key header must match the stored key.

type Claimed = {
  id: string; category: string; audience: string; recipient_user_id: string | null; recipient_email: string | null;
  template_key: string; payload: Record<string, unknown>; idempotency_key: string; attempts: number;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const retryAt = (attempts: number) => new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString();
const appRoute = (path: string) =>
  `${(Deno.env.get("SCHOOL_EMAIL_APP_URL")?.trim() || PRODUCT_APP_URL).replace(/\/$/, "")}${path}`;
const PLAN_RU: Record<string, string> = { monthly: "1 месяц", quarterly: "3 месяца", yearly: "1 год" };
const fmtRu = (value: unknown) => {
  const date = new Date(cleanText(value, 80));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bishkek" }).format(date);
};
const som = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `${new Intl.NumberFormat("ru-RU").format(amount)} сом` : "";
};
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const ownerTemplate = (row: Claimed): BrandedEmail => {
  const p = row.payload || {};
  return {
    subject: `IELTS Prime transfer to confirm: ${som(p.amount_som)} | Brains Heist Operations`,
    preview: "A learner says they paid for IELTS Prime by transfer.",
    kicker: "Platform operations",
    headline: "Check your bank app and confirm the payment",
    intro: "A learner submitted a local transfer for IELTS Prime. Check that the money arrived, then approve or reject it on the IELTS growth page. Prime switches on as soon as you approve.",
    details: [
      { label: "Plan", value: cleanText(p.plan, 20) },
      { label: "Amount", value: som(p.amount_som) },
      { label: "Method", value: cleanText(p.method, 20) },
    ],
    action: { label: "Review payment", url: appRoute("/ielts/growth") },
  };
};

const learnerTemplate = (row: Claimed): BrandedEmail => {
  const p = row.payload || {};
  const name = cleanText(p.name, 40);
  const hi = name ? `${name}, ` : "";
  const course = appRoute("/ielts/course");
  const prime = appRoute("/ielts/prime");
  if (row.template_key === "ielts_manual_payment_approved") {
    return {
      subject: "IELTS Prime активирован 🔥",
      preview: "Оплата подтверждена — все юниты открыты.",
      kicker: "Оплата подтверждена",
      headline: "IELTS Prime активирован",
      intro: "Спасибо! Мы получили оплату. Все 20 юнитов, практика Writing и Speaking с обратной связью уже открыты.",
      details: [
        { label: "Тариф", value: PLAN_RU[cleanText(p.plan, 20)] || "IELTS Prime" },
        { label: "Сумма", value: som(p.amount_som) },
        { label: "Доступ до", value: fmtRu(p.ends_at) },
      ],
      action: { label: "Продолжить курс", url: course },
      note: "Подписка не продлевается автоматически. Перед окончанием срока продлить можно на странице IELTS Prime.",
    };
  }
  if (row.template_key === "ielts_manual_payment_rejected") {
    return {
      subject: "Не удалось подтвердить оплату IELTS Prime",
      preview: "Мы не нашли ваш перевод. Проверьте данные и отправьте ещё раз.",
      kicker: "Оплата",
      headline: "Мы не нашли ваш перевод",
      intro: `Мы проверили поступления, но не нашли перевод на ${som(p.amount_som) || "указанную сумму"}. Проверьте сумму и имя отправителя и отправьте данные ещё раз — или просто ответьте на это письмо.`,
      details: [{ label: "Комментарий", value: cleanText(p.note, 500) }],
      action: { label: "Открыть страницу оплаты", url: prime },
    };
  }
  const step = cleanText(p.step, 4);
  const cleared = p.cleared_unit1 === true;
  const started = p.started === true;
  const local = p.local_payment === true;
  const bank = cleanText(p.local_bank, 30) || "MBank";
  const price = local ? `от ${som(p.price_monthly_som)} в месяц` : "около 1 270 сом ($14.50) в месяц";
  const pay = local ? `Оплатить можно картой или переводом ${bank}.` : "Оплатить можно банковской картой.";
  if (step === "d1" && !cleared) {
    return {
      subject: "Блэйз ждёт тебя 🔥 Первый юнит — 15 минут",
      preview: "Первый юнит бесплатный и занимает около 15 минут.",
      kicker: "Brains Heist IELTS",
      headline: started ? "Ты почти прошёл первый юнит" : "Твой первый юнит ждёт",
      intro: `${hi}первый юнит Brains Heist IELTS бесплатный и занимает около 15 минут: короткий урок, новые слова и задания. Пройди его сегодня — и Блэйз загорится 🔥`,
      action: { label: started ? "Продолжить Unit 1" : "Начать Unit 1", url: course },
    };
  }
  if (step === "d1") {
    return {
      subject: "Unit 1 пройден 🎉 Что дальше?",
      preview: "Впереди ещё 19 юнитов до экзамена.",
      kicker: "Отличное начало",
      headline: "Первый юнит пройден!",
      intro: `${hi}ты сделал(а) первый шаг. Впереди ещё 19 юнитов: Reading, Listening, Writing и Speaking с разбором ответов по критериям IELTS. Их открывает IELTS Prime — ${price}.`,
      action: { label: "Открыть все юниты", url: prime },
      note: pay,
    };
  }
  if (step === "d3") {
    return {
      subject: "Не дай Блэйзу погаснуть 🥺",
      preview: "15 минут в день — и IELTS станет привычкой.",
      kicker: "Серия",
      headline: "15 минут в день решают всё",
      intro: cleared
        ? `${hi}ты уже прошёл(ла) Unit 1. Каждый день практики приближает тебя к нужному баллу. Продолжай с IELTS Prime — ${price}.`
        : `${hi}самое сложное — начать. Первый юнит всё ещё ждёт тебя, и он бесплатный. 15 минут сегодня — и серия началась.`,
      action: cleared ? { label: "Продолжить с Prime", url: prime } : { label: "Начать Unit 1", url: course },
      note: cleared ? pay : null,
    };
  }
  return {
    subject: "Месяц подготовки к IELTS по цене ~5 шаурм 🌯",
    preview: "Все 4 части экзамена в телефоне, в удобное время.",
    kicker: "IELTS Prime",
    headline: "Подготовка к IELTS дешевле, чем кажется",
    intro: `${hi}курсы IELTS обычно стоят несколько тысяч сом в месяц и требуют ездить на занятия. IELTS Prime — ${price}: 20 юнитов, все четыре части экзамена и разбор Speaking и Writing, в любое время с телефона.`,
    details: [
      { label: "Что внутри", value: "20 юнитов · Reading · Listening · Writing · Speaking" },
      { label: "Сколько времени", value: "15 минут в день" },
    ],
    action: { label: "Посмотреть тарифы", url: prime },
    note: pay,
  };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: config } = await db.from("school_email_dispatch_config").select("dispatch_key").eq("singleton", true).maybeSingle();
    const supplied = req.headers.get("x-school-email-dispatch-key")?.trim() || "";
    if (!supplied || !config?.dispatch_key || supplied !== config.dispatch_key) return json(401, { error: "Unauthorized" });

    const resendApiKey = requiredEnv("RESEND_API_KEY");
    const configuredFrom = Deno.env.get("SCHOOL_EMAIL_FROM")?.trim() || Deno.env.get("SCHOOL_REQUEST_EMAIL_FROM")?.trim() ||
      Deno.env.get("NEW_USER_EMAIL_FROM")?.trim();
    if (!configuredFrom) throw new Error("Missing transactional email sender configuration");
    const replyTo = Deno.env.get("SCHOOL_EMAIL_REPLY_TO")?.trim() || Deno.env.get("SCHOOL_REQUEST_REPLY_TO")?.trim() || undefined;

    const { data: claims, error: claimError } = await db.rpc("rpc_claim_ielts_learner_outbox", { p_limit: 40 });
    if (claimError) throw new Error(`claim: ${claimError.message}`);

    let accepted = 0, skipped = 0, failed = 0;
    for (const row of (claims || []) as Claimed[]) {
      const now = () => new Date().toISOString();
      try {
        const isOwner = row.audience === "platform_owner";
        let to = cleanText(row.recipient_email, 254).toLowerCase();
        if (!to && isOwner) to = cleanText(Deno.env.get("PLATFORM_ALERT_EMAIL") || Deno.env.get("NEW_USER_ALERT_TO"), 254).toLowerCase();
        if (!to && row.recipient_user_id) {
          const { data } = await db.auth.admin.getUserById(row.recipient_user_id);
          const u = data?.user;
          if (u?.email && (u.email_confirmed_at || u.confirmed_at)) to = u.email.trim().toLowerCase();
        }
        if (!isRoutableEmailAddress(to)) {
          await db.from("transactional_email_outbox").update({ status: "skipped", last_error: "No verified, routable recipient email", updated_at: now() }).eq("id", row.id);
          skipped++; continue;
        }
        if (row.recipient_user_id && row.category === "reminders") {
          const { data: pref } = await db.from("email_communication_preferences").select("email_enabled,digest_frequency")
            .eq("user_id", row.recipient_user_id).eq("category", "reminders").maybeSingle();
          if (pref && (pref.email_enabled === false || pref.digest_frequency === "never")) {
            await db.from("transactional_email_outbox").update({ status: "skipped", last_error: "Recipient turned these emails off", updated_at: now() }).eq("id", row.id);
            skipped++; continue;
          }
        }
        const { data: suppressed } = await db.rpc("rpc_email_is_suppressed", { p_recipient_hash: await sha256(to) });
        if (suppressed === true) {
          await db.from("transactional_email_outbox").update({ status: "suppressed", last_error: "Recipient is on the suppression list", updated_at: now() }).eq("id", row.id);
          skipped++; continue;
        }

        let unsubscribeUrl = "";
        if (row.template_key === "ielts_learner_nudge" && row.recipient_user_id) {
          const token = await learnerOptOutToken(config.dispatch_key, row.recipient_user_id);
          unsubscribeUrl = `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/ielts_email_optout?u=${encodeURIComponent(row.recipient_user_id)}&t=${token}`;
        }
        const rendered = isOwner
          ? renderBrandedEmail({ id: null, name: "Brains Heist Operations", logo_url: null }, ownerTemplate(row), "platform_operations")
          : renderBrandedEmail({ id: null, name: "Brains Heist IELTS", logo_url: null }, { ...learnerTemplate(row), unsubscribeUrl }, "learner");
        const providerId = await sendWithResend({
          apiKey: resendApiKey,
          from: isOwner ? operationsSender(configuredFrom) : learnerSender(configuredFrom),
          to, replyTo, idempotencyKey: row.idempotency_key,
          headers: unsubscribeUrl ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
          ...rendered,
        });
        await db.from("transactional_email_outbox").update({
          status: "accepted", provider_message_id: providerId, accepted_at: now(), last_error: null, updated_at: now(),
        }).eq("id", row.id);
        accepted++;
      } catch (error) {
        const message = cleanText(error instanceof Error ? error.message : error, 500) || "Unknown email delivery error";
        await db.from("transactional_email_outbox").update({
          status: row.attempts >= 5 ? "failed" : "pending", next_attempt_at: retryAt(row.attempts), last_error: message, updated_at: now(),
        }).eq("id", row.id);
        failed++;
      }
    }
    return json(200, { ok: true, accepted, skipped, failed });
  } catch (error) {
    const detail = cleanText(error instanceof Error ? error.message : error, 300) || "Unknown dispatcher error";
    console.error("ielts_learner_email_dispatcher", detail);
    return json(503, { error: "IELTS learner email dispatcher temporarily unavailable", detail });
  }
});
