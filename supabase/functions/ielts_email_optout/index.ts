import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { cleanText, learnerOptOutToken, requiredEnv, serverSupabaseKey } from "../_shared/email.ts";

// One-click unsubscribe from Brains Heist IELTS follow-up emails. The link carries the learner id and an HMAC made
// with the email dispatch key, so nobody can turn emails off for someone else. Turns off the 'reminders' category.

const page = (status: number, title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0f0a2e;color:#fff;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div style="max-width:420px"><div style="font-size:56px">🔥</div><h1 style="font-size:24px;margin:12px 0">${title}</h1><p style="color:#cbd5e1;line-height:1.6">${body}</p><p><a href="https://www.brainsheist.com/ielts/course" style="color:#ffd23f">Вернуться к курсу</a></p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return page(405, "Ошибка", "Метод не поддерживается.");
  const url = new URL(req.url);
  const userId = cleanText(url.searchParams.get("u"), 64);
  const token = cleanText(url.searchParams.get("t"), 128).toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f]{64}$/.test(token)) {
    return page(400, "Ссылка недействительна", "Откройте ссылку из письма ещё раз.");
  }
  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), serverSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: config } = await db.from("school_email_dispatch_config").select("dispatch_key").eq("singleton", true).maybeSingle();
    if (!config?.dispatch_key || !equal(await learnerOptOutToken(config.dispatch_key, userId), token)) {
      return page(400, "Ссылка недействительна", "Откройте ссылку из письма ещё раз.");
    }
    const { error } = await db.from("email_communication_preferences").upsert(
      { user_id: userId, category: "reminders", email_enabled: false, updated_at: new Date().toISOString() },
      { onConflict: "user_id,category" },
    );
    if (error) throw error;
    await db.from("transactional_email_outbox").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("recipient_user_id", userId).eq("template_key", "ielts_learner_nudge").eq("status", "pending");
    return page(200, "Готово", "Больше не будем присылать напоминания. Письма об оплате и доступе продолжат приходить.");
  } catch (error) {
    console.error("ielts_email_optout", cleanText(error instanceof Error ? error.message : error, 300));
    return page(503, "Что-то пошло не так", "Попробуйте ещё раз через минуту.");
  }
});
