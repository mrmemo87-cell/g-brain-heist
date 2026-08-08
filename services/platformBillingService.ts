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
