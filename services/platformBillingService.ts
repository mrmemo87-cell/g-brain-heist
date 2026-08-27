import { supabase } from './supabaseClient';

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

/**
 * Activate only a School Head-accepted quote after payment/authority verification.
 * The database copies immutable quoted capacities into the subscription and
 * programme entitlements atomically; callers never submit seat limits here.
 */
export async function activateAcceptedQuote(input: AcceptedQuoteActivationInput): Promise<void> {
  const { data, error } = await supabase.rpc('admin_activate_accepted_school_quote', {
    p_quote_id: input.quoteId,
    p_payment_method: input.paymentMethod,
    p_amount_minor: input.paymentMethod === 'complimentary' ? 0 : input.amountMinor,
    p_currency: input.currency,
    p_reference: input.reference || null,
    p_period_end: input.periodEnd,
    p_notes: input.notes || null,
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

export async function reviewProgrammeTransferException(
  requestId: string,
  action: 'approve' | 'reject',
  note: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('admin_review_programme_transfer_exception', {
    p_request_id: requestId,
    p_action: action,
    p_note: note,
  });
  if (error) throw new Error(error.message || 'The exception could not be reviewed.');
  const payload = data as { success?: boolean; error?: string } | null;
  if (!payload?.success) throw new Error(payload?.error || 'The exception could not be reviewed.');
}
