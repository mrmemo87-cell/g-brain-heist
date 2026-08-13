import { supabase } from './supabaseClient';

export const SCHOOL_MODULES = ['core', 'cambridge', 'ielts', 'writing', 'admissions'] as const;
export type SchoolModuleKey = typeof SCHOOL_MODULES[number];

export interface SchoolBillingOverview {
  school_id: string;
  school_name: string;
  school_plan: string;
  subscription: null | {
    id: string;
    provider: string;
    payment_method: string | null;
    status: string;
    plan: string;
    amount_minor: number | null;
    currency: string | null;
    payment_reference: string | null;
    current_period_end: string | null;
    module_keys: string[] | null;
    verified_at: string | null;
    created_at: string;
  };
  modules: Partial<Record<SchoolModuleKey, boolean>>;
}

export interface ManualSubscriptionInput {
  schoolId: string;
  plan: 'pilot' | 'core' | 'standard' | 'pro' | 'enterprise';
  paymentMethod: 'cash' | 'bank_transfer' | 'invoice' | 'complimentary';
  status: 'pending' | 'active';
  amountMinor: number;
  currency: string;
  reference: string;
  periodEnd: string;
  modules: SchoolModuleKey[];
  notes: string;
}

export interface ProgrammeTransferException {
  id: string;
  school_id: string;
  school_name: string;
  module_key: 'cambridge' | 'ielts' | 'writing';
  requested_transfers: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AcceptedQuoteActivationInput {
  quoteId: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'invoice' | 'complimentary';
  amountMinor: number;
  currency: string;
  reference: string;
  periodEnd: string;
  notes: string;
}

export async function listSchoolBillingOverview(schoolId?: string | null): Promise<SchoolBillingOverview[]> {
  const { data, error } = await supabase.rpc('admin_list_school_billing_overview', { p_school_id: schoolId || null });
  if (error) throw new Error(error.message || 'School billing records could not be loaded.');
  const payload = data as { success?: boolean; schools?: SchoolBillingOverview[] } | null;
  if (!payload?.success) throw new Error('School billing records returned an invalid response.');
  return payload.schools ?? [];
}

export async function recordManualSubscription(input: ManualSubscriptionInput): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_record_manual_school_subscription', {
    p_school_id: input.schoolId,
    p_plan: input.plan,
    p_payment_method: input.paymentMethod,
    p_status: input.status,
    p_amount_minor: input.paymentMethod === 'complimentary' ? 0 : input.amountMinor,
    p_currency: input.currency,
    p_reference: input.reference || null,
    p_period_end: input.periodEnd,
    p_modules: Array.from(new Set(['core', ...input.modules])),
    p_notes: input.notes || null,
  });
  if (error) return { success: false, error: error.message };
  const payload = data as { success?: boolean; error?: string } | null;
  return payload?.success ? { success: true } : { success: false, error: payload?.error || 'The billing record was not saved.' };
}

export async function activateAcceptedQuote(input: AcceptedQuoteActivationInput): Promise<void> {
  const { data, error } = await supabase.rpc('admin_activate_accepted_school_quote', {
    p_quote_id: input.quoteId, p_payment_method: input.paymentMethod,
    p_amount_minor: input.paymentMethod === 'complimentary' ? 0 : input.amountMinor,
    p_currency: input.currency, p_reference: input.reference || null,
    p_period_end: input.periodEnd, p_notes: input.notes || null,
  });
  if (error) throw new Error(error.message || 'The accepted agreement could not be activated.');
  const payload = data as { success?: boolean; error?: string } | null;
  if (!payload?.success) throw new Error(payload?.error || 'The accepted agreement could not be activated.');
}

export async function listProgrammeTransferExceptions(): Promise<ProgrammeTransferException[]> {
  const { data, error } = await supabase.rpc('admin_list_programme_transfer_exceptions', { p_status: 'pending' });
  if (error) throw new Error(error.message || 'Transfer exceptions could not be loaded.');
  const payload = data as { success?: boolean; requests?: ProgrammeTransferException[]; error?: string } | null;
  if (!payload?.success) throw new Error(payload?.error || 'Transfer exceptions could not be loaded.');
  return payload.requests ?? [];
}

export async function reviewProgrammeTransferException(requestId: string, action: 'approve' | 'reject', note: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_review_programme_transfer_exception', {
    p_request_id: requestId, p_action: action, p_note: note,
  });
  if (error) throw new Error(error.message || 'The exception could not be reviewed.');
  const payload = data as { success?: boolean; error?: string } | null;
  if (!payload?.success) throw new Error(payload?.error || 'The exception could not be reviewed.');
}
