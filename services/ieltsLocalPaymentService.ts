import { supabase } from './supabaseClient';
import type { IeltsPrimePlan } from './ieltsPrimeBillingService';

/** Local transfers (MBank, O!Dengi, Elsom…) for IELTS Prime: the learner pays, the owner confirms, Prime runs for the paid period. */

export type LocalPaymentMethod = 'mbank' | 'odengi' | 'elsom' | 'optima' | 'other';
export type LocalPaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LocalPaymentOptions {
  enabled: boolean;
  bank_label: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  instructions: string | null;
  prices: Record<IeltsPrimePlan, number>;
  latest: {
    id: string;
    plan: IeltsPrimePlan;
    amount_som: number;
    status: LocalPaymentStatus;
    created_at: string;
    reviewed_at: string | null;
    review_note: string | null;
  } | null;
}

export interface LocalPaymentSettings {
  enabled: boolean;
  bank_label: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  instructions: string | null;
  price_monthly_som: number;
  price_quarterly_som: number;
  price_yearly_som: number;
  updated_at?: string;
}

export interface AdminLocalPayment {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  plan: IeltsPrimePlan;
  amount_som: number;
  method: LocalPaymentMethod;
  payer_name: string;
  payer_phone: string | null;
  reference: string | null;
  status: LocalPaymentStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  campaign: string | null;
}

const ERRORS_RU: Record<string, string> = {
  manual_payment_disabled: 'Оплата переводом сейчас недоступна. Попробуйте оплатить картой.',
  payment_already_pending: 'Мы уже проверяем ваш перевод. Подождите подтверждения.',
  payer_name_required: 'Укажите имя отправителя, как в банковском приложении.',
  too_many_requests: 'Слишком много попыток за сутки. Напишите нам: support@brainsheist.com',
  invalid_plan: 'Выберите тариф.',
  not_authenticated: 'Войдите в аккаунт, чтобы продолжить.',
};

export const localPaymentErrorRu = (message?: string | null) => {
  const key = Object.keys(ERRORS_RU).find((k) => (message || '').includes(k));
  return key ? ERRORS_RU[key]! : 'Не удалось отправить. Попробуйте ещё раз.';
};

export async function getLocalPaymentOptions(): Promise<LocalPaymentOptions | null> {
  const { data, error } = await supabase.rpc('rpc_ielts_manual_payment_options');
  if (error || !data) return null;
  return data as LocalPaymentOptions;
}

function attribution() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('ielts_funnel_attribution') || '{}');
    return {
      source: stored.source ?? undefined,
      medium: stored.medium ?? undefined,
      campaign: stored.campaign ?? undefined,
      content: stored.content ?? undefined,
      term: stored.term ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function submitLocalPayment(input: {
  plan: IeltsPrimePlan;
  method: LocalPaymentMethod;
  payerName: string;
  payerPhone?: string;
  reference?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('rpc_ielts_manual_payment_submit', {
    p_plan: input.plan,
    p_method: input.method,
    p_payer_name: input.payerName,
    p_payer_phone: input.payerPhone || null,
    p_reference: input.reference || null,
    p_attribution: attribution(),
  });
  return error ? { ok: false, error: localPaymentErrorRu(error.message) } : { ok: true };
}

export async function cancelLocalPayment(id: string) {
  const { error } = await supabase.rpc('rpc_ielts_manual_payment_cancel', { p_id: id });
  return !error;
}

export async function getAdminLocalPayments(status: 'pending' | 'all' = 'pending') {
  const { data, error } = await supabase.rpc('rpc_ielts_manual_payments_admin', { p_status: status });
  if (error) throw error;
  return data as { payments: AdminLocalPayment[]; settings: LocalPaymentSettings };
}

export async function reviewLocalPayment(id: string, approve: boolean, note?: string) {
  const { data, error } = await supabase.rpc('rpc_ielts_manual_payment_review', {
    p_id: id,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw error;
  return data as { status: string; ends_at?: string };
}

export async function saveLocalPaymentSettings(settings: Partial<LocalPaymentSettings>) {
  const { data, error } = await supabase.rpc('rpc_ielts_manual_payment_settings_save', { p_settings: settings });
  if (error) throw error;
  return data as LocalPaymentSettings;
}
