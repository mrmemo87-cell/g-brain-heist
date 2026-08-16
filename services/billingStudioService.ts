import { supabase } from './supabaseClient';

export type BillingContractTerm = 'monthly' | 'annual' | 'two_year' | 'three_year';
export type BillingProgrammeKey = 'cambridge' | 'ielts' | 'writing' | 'admissions';
export type BillingQuoteStatus = 'draft' | 'submitted' | 'revision_requested' | 'approved' | 'accepted' | 'payment_pending' | 'payment_failed' | 'scheduled' | 'active' | 'superseded' | 'rejected' | 'expired' | 'cancelled';
export type SchoolPaymentMethod = 'paddle_checkout' | 'paddle_invoice' | 'bank_transfer' | 'cash';

export interface BillingQuoteInputs {
  contractTerm: BillingContractTerm;
  platformSeats: number;
  cambridgeSeats: number;
  ieltsSeats: number;
  writingSeats: number;
  admissionsCandidates: number;
  launchDiscountRequested: boolean;
}

export interface BillingCatalogueItem {
  key: 'platform' | BillingProgrammeKey;
  name: string;
  unit_amount_minor: number;
  minimum_quantity: number;
  quantity_label: string;
  included_allowance: Record<string, unknown>;
}

export interface BillingLineItem {
  key: 'platform' | BillingProgrammeKey;
  name: string;
  quantity: number;
  unit_amount_minor: number;
  monthly_amount_minor: number;
}

export interface BillingCalculation {
  success: true;
  pricing_version: { code: string; name: string; currency: string };
  usage: { current_students: number; application_estimate: number | null };
  inputs: {
    contract_term: BillingContractTerm;
    platform_seats: number;
    cambridge_seats: number;
    ielts_seats: number;
    writing_seats: number;
    admissions_candidates: number;
    launch_discount_requested: boolean;
  };
  catalogue: BillingCatalogueItem[];
  line_items: BillingLineItem[];
  discounts: {
    combination_bps: number;
    combination_monthly_minor: number;
    term_bps: number;
    term_minor: number;
    launch_bps: number;
    launch_minor: number;
    maximum_bps: number;
  };
  totals: {
    months: number;
    monthly_list_minor: number;
    monthly_after_combination_minor: number;
    contract_total_minor: number;
    first_year_total_minor: number;
    renewal_total_minor: number;
    effective_monthly_minor: number;
    effective_platform_student_month_minor: number;
  };
  rules: {
    teachers_and_admins_free: boolean;
    seat_increases: 'immediate';
    seat_decreases: 'renewal';
    surprise_overages: false;
    launch_subject_to_approval: boolean;
  };
}

export interface SchoolBillingQuote {
  id: string;
  school_id: string;
  school_name?: string;
  title: string;
  status: BillingQuoteStatus;
  contract_term: BillingContractTerm;
  platform_seats: number;
  cambridge_seats: number;
  ielts_seats: number;
  writing_seats: number;
  admissions_candidates: number;
  launch_discount_requested: boolean;
  calculation: BillingCalculation;
  school_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  activated_at: string | null;
  activated_subscription_id: string | null;
  payment_status?: string;
  selected_payment_method?: SchoolPaymentMethod | null;
  agreement_kind?: 'new_agreement' | 'upgrade' | 'renewal_change' | null;
  effective_at?: string | null;
  scheduled_at?: string | null;
  settlement_amount_minor?: number | null;
  settlement_currency?: string | null;
  settlement_calculation?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  school_head?: { name: string; email: string } | null;
}

type BillingRpcFailure = { success?: false; error?: string } | null;

const rpcInput = (schoolId: string, input: BillingQuoteInputs) => ({
  p_school_id: schoolId,
  p_contract_term: input.contractTerm,
  p_platform_seats: input.platformSeats,
  p_cambridge_seats: input.cambridgeSeats,
  p_ielts_seats: input.ieltsSeats,
  p_writing_seats: input.writingSeats,
  p_admissions_candidates: input.admissionsCandidates,
  p_launch_discount_requested: input.launchDiscountRequested,
});

export function formatBillingMoney(amountMinor: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format((Number.isFinite(amountMinor) ? amountMinor : 0) / 100);
}

export function billingPercent(basisPoints: number): string {
  return `${Math.max(0, basisPoints) / 100}%`;
}

export async function calculateSchoolQuote(schoolId: string, input: BillingQuoteInputs): Promise<BillingCalculation> {
  const { data, error } = await supabase.rpc('calculate_school_quote', { ...rpcInput(schoolId, input), p_pricing_version_code: null });
  if (error) throw new Error(error.message || 'The quote could not be calculated.');
  const payload = data as BillingCalculation | BillingRpcFailure;
  if (!payload?.success) throw new Error(payload?.error || 'The quote could not be calculated.');
  return payload;
}

export async function listSchoolBillingQuotes(schoolId: string): Promise<SchoolBillingQuote[]> {
  const { data, error } = await supabase.rpc('school_head_list_billing_quotes', { p_school_id: schoolId });
  if (error) throw new Error(error.message || 'Saved scenarios could not be loaded.');
  const payload = data as { success?: boolean; quotes?: SchoolBillingQuote[]; error?: string } | null;
  if (!payload?.success) throw new Error(payload?.error || 'Saved scenarios could not be loaded.');
  return payload.quotes ?? [];
}

export async function saveSchoolBillingQuote(
  schoolId: string,
  input: BillingQuoteInputs & { quoteId?: string | null; title: string; note?: string; submit?: boolean },
): Promise<SchoolBillingQuote> {
  const { data, error } = await supabase.rpc('school_head_save_billing_quote', {
    ...rpcInput(schoolId, input),
    p_quote_id: input.quoteId || null,
    p_title: input.title,
    p_school_note: input.note || null,
    p_submit: Boolean(input.submit),
  });
  if (error) throw new Error(error.message || 'The scenario could not be saved.');
  const payload = data as { success?: boolean; quote?: SchoolBillingQuote; error?: string } | null;
  if (!payload?.success || !payload.quote) throw new Error(payload?.error || 'The scenario could not be saved.');
  return payload.quote;
}

export async function listAdminBillingQuotes(status?: BillingQuoteStatus | null): Promise<SchoolBillingQuote[]> {
  const { data, error } = await supabase.rpc('admin_list_school_billing_quotes', { p_status: status || null });
  if (error) throw new Error(error.message || 'The quote review queue could not be loaded.');
  const payload = data as { success?: boolean; quotes?: SchoolBillingQuote[]; error?: string } | null;
  if (!payload?.success) throw new Error(payload?.error || 'The quote review queue could not be loaded.');
  return payload.quotes ?? [];
}

export async function reviewSchoolBillingQuote(
  quoteId: string,
  action: 'approve' | 'request_revision' | 'reject',
  note?: string,
): Promise<SchoolBillingQuote> {
  const { data, error } = await supabase.rpc('admin_review_school_billing_quote', {
    p_quote_id: quoteId,
    p_action: action,
    p_note: note || null,
    p_expires_at: null,
  });
  if (error) throw new Error(error.message || 'The quote could not be reviewed.');
  const payload = data as { success?: boolean; quote?: SchoolBillingQuote; error?: string } | null;
  if (!payload?.success || !payload.quote) throw new Error(payload?.error || 'The quote could not be reviewed.');
  return payload.quote;
}

export async function acceptSchoolBillingQuote(quoteId: string): Promise<SchoolBillingQuote> {
  const { data, error } = await supabase.rpc('school_head_accept_billing_quote', { p_quote_id: quoteId });
  if (error) throw new Error(error.message || 'The approved quote could not be accepted.');
  const payload = data as { success?: boolean; quote?: SchoolBillingQuote; error?: string } | null;
  if (!payload?.success || !payload.quote) throw new Error(payload?.error || 'The approved quote could not be accepted.');
  return payload.quote;
}

export async function chooseSchoolQuotePayment(
  quoteId: string,
  method: SchoolPaymentMethod,
): Promise<SchoolBillingQuote> {
  const { data, error } = await supabase.rpc('school_head_choose_quote_payment', {
    p_quote_id: quoteId,
    p_method: method,
  });
  if (error) throw new Error(error.message || 'The payment route could not be selected.');
  const payload = data as { success?: boolean; quote?: SchoolBillingQuote; error?: string } | null;
  if (!payload?.success || !payload.quote) throw new Error(payload?.error || 'The payment route could not be selected.');
  return payload.quote;
}

export interface PaddleInvoiceBillingDetails {
  legal_name: string;
  first_line: string;
  city: string;
  region: string;
  postal_code: string;
  country_code: string;
}

export interface SchoolPaddleCheckoutResult {
  success: true;
  transaction_id?: string;
  checkout_url?: string | null;
  invoice_url?: string | null;
  subscription_updated?: boolean;
  awaiting_webhook?: boolean;
  message?: string;
}

export async function createSchoolPaddleCheckout(
  quoteId: string,
  mode: 'checkout' | 'invoice',
  billingDetails?: PaddleInvoiceBillingDetails,
): Promise<SchoolPaddleCheckoutResult> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error('Your session expired. Sign in again before paying.');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Secure payment configuration is missing.');

  const response = await fetch(`${supabaseUrl}/functions/v1/paddle/school-quote-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'school_quote_checkout',
      quote_id: quoteId,
      mode,
      billing_details: billingDetails,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true || (!payload?.transaction_id && !payload?.subscription_updated)) {
    throw new Error(payload?.error || `Paddle could not start payment (${response.status}).`);
  }
  return payload as SchoolPaddleCheckoutResult;
}
