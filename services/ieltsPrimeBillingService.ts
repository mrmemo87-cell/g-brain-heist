import { supabase } from './supabaseClient';

export type IeltsPrimePlan = 'monthly' | 'quarterly' | 'yearly';

export interface IeltsPrimeCheckoutResult {
  checkout_url?: string;
  transaction_id?: string;
  error?: string;
}

export interface IeltsPrimeSubscriptionStatus {
  has_subscription: boolean;
  status: string | null;
  plan: IeltsPrimePlan | string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  management_url: string | null;
  update_payment_url: string | null;
}

export async function createIeltsPrimeCheckout(plan: IeltsPrimePlan): Promise<IeltsPrimeCheckoutResult> {
  try {
    const { data, error } = await supabase.functions.invoke('paddle', {
      body: {
        action: 'ielts_prime_checkout',
        product: 'ielts_prime',
        plan,
        billing_interval: plan,
        discount: 'launch_50',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (error) {
      return { error: error.message || 'Failed to create checkout session' };
    }

    if (data?.checkout_url) {
      return { checkout_url: data.checkout_url, transaction_id: data.transaction_id };
    }

    return { error: data?.error || 'Checkout failed — please try again.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Checkout failed — please try again.' };
  }
}

export async function getIeltsPrimeSubscriptionStatus(): Promise<IeltsPrimeSubscriptionStatus> {
  try {
    const { data, error } = await supabase.rpc('get_ielts_prime_subscription_status');
    if (error || !data) {
      return {
        has_subscription: false,
        status: null,
        plan: null,
        current_period_end: null,
        cancel_at_period_end: false,
        management_url: null,
        update_payment_url: null,
      };
    }
    return data as IeltsPrimeSubscriptionStatus;
  } catch {
    return {
      has_subscription: false,
      status: null,
      plan: null,
      current_period_end: null,
      cancel_at_period_end: false,
      management_url: null,
      update_payment_url: null,
    };
  }
}
