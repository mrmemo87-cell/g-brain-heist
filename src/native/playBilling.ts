// IELTS Prime through Google Play Billing, used only inside the Android app.
// Google requires digital subscriptions bought in an Android app to go through Play,
// so the app never opens Paddle. The website keeps its Paddle checkout.
//
// Play Console setup: one subscription product "ielts_prime" with base plans
// "monthly", "quarterly" and "yearly". Every purchase is sent to the play_billing
// edge function, which checks it with Google before unlocking Prime.

import { supabase } from '../../services/supabaseClient';
import { nativePlatform } from '../lib/nativePlatform';
import type { IeltsPrimePlan } from '../../services/ieltsPrimeBillingService';

export const PLAY_PRIME_PRODUCT_ID = 'ielts_prime';

export type StorePrice = { plan: IeltsPrimePlan; priceString: string; offerToken?: string };

export type StorePurchaseResult =
  | { ok: true; active: boolean }
  | { ok: false; cancelled?: boolean; error: string };

/** True when Prime must be bought through Google Play (the Android app). */
export const usesPlayBilling = (): boolean => nativePlatform() === 'android';

/** True in the iPhone app, where Prime cannot be bought until App Store billing is added. */
export const storeBillingUnavailable = (): boolean => nativePlatform() === 'ios';

const loadPlugin = () => import('@capgo/native-purchases');

async function callPlayBilling(body: Record<string, unknown>): Promise<{ ok?: boolean; active?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('play_billing', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    return { error: detail?.error || 'Could not reach Brains Heist. Check your connection and try again.' };
  }
  return data ?? {};
}

/** Local prices from Google Play for each plan, in the user's currency. */
export async function getPlayPrimePrices(): Promise<StorePrice[]> {
  if (!usesPlayBilling()) return [];
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [PLAY_PRIME_PRODUCT_ID],
      productType: PURCHASE_TYPE.SUBS,
    });
    return products
      .filter((p) => p.planIdentifier === 'monthly' || p.planIdentifier === 'quarterly' || p.planIdentifier === 'yearly')
      .map((p) => ({ plan: p.planIdentifier as IeltsPrimePlan, priceString: p.priceString, offerToken: p.offerToken }));
  } catch {
    return [];
  }
}

/** Buy a plan with Google Play, then have the server verify it and switch Prime on. */
export async function buyPrimeWithPlay(plan: IeltsPrimePlan, offerToken?: string): Promise<StorePurchaseResult> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Please sign in first.' };

  let purchaseToken: string | undefined;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: PLAY_PRIME_PRODUCT_ID,
      planIdentifier: plan,
      offerToken,
      productType: PURCHASE_TYPE.SUBS,
      // Ties the purchase to this account; the server rejects it for anyone else.
      appAccountToken: auth.user.id,
    });
    purchaseToken = transaction.purchaseToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return { ok: false, cancelled: true, error: 'Purchase cancelled.' };
    return { ok: false, error: 'Google Play could not complete the purchase. Please try again.' };
  }

  if (!purchaseToken) return { ok: false, error: 'Google Play did not return a purchase. Please try again.' };
  const result = await callPlayBilling({ purchaseToken, productId: PLAY_PRIME_PRODUCT_ID });
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, active: Boolean(result.active) };
}

/**
 * Re-send any Play purchases this phone knows about and re-check stored ones,
 * so renewals, cancellations and a new phone are picked up.
 */
export async function restorePlayPurchases(): Promise<StorePurchaseResult> {
  if (!usesPlayBilling()) return { ok: true, active: false };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Please sign in first.' };

  let active = false;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    for (const purchase of purchases) {
      if (purchase.productIdentifier !== PLAY_PRIME_PRODUCT_ID || !purchase.purchaseToken) continue;
      const result = await callPlayBilling({ purchaseToken: purchase.purchaseToken, productId: PLAY_PRIME_PRODUCT_ID });
      if (result.active) active = true;
    }
  } catch { /* Fall through to the server-side re-check. */ }

  const refreshed = await callPlayBilling({});
  if (refreshed.error && !active) return { ok: false, error: refreshed.error };
  return { ok: true, active: active || Boolean(refreshed.active) };
}

/** Opens Google Play's own subscription management screen. */
export async function openPlaySubscriptions(): Promise<void> {
  try {
    const { NativePurchases } = await loadPlugin();
    await NativePurchases.manageSubscriptions();
  } catch {
    window.open('https://play.google.com/store/account/subscriptions?package=com.brainsheist.app', '_blank');
  }
}
