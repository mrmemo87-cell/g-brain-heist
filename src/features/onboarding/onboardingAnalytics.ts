import { supabase } from '../../../services/supabaseClient';
import type { OnboardingAnalyticsEvent } from './onboardingTypes';

const isMissingTableError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  return error.code === '42P01' || /onboarding_events|does not exist/i.test(error.message ?? '');
};

/**
 * Lightweight analytics hook for Phase 1. It emits a browser event for local
 * instrumentation and attempts a best-effort Supabase insert when the optional
 * `onboarding_events` table has been deployed. Analytics must never block FTUE.
 */
export const emitOnboardingEvent = async ({ event, user_id, segment, context_type, step, metadata = {} }: OnboardingAnalyticsEvent) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('brains-heist:onboarding-event', {
      detail: { event, user_id, segment, context_type, step, metadata },
    }));
  }

  try {
    const { error } = await supabase.from('onboarding_events').insert({
      event,
      user_id: user_id ?? null,
      segment: segment === 'none' ? null : segment,
      context_type: context_type === 'none' ? null : context_type,
      step: step ?? null,
      metadata,
    });

    if (error && !isMissingTableError(error)) {
      console.warn('[onboarding] analytics insert failed:', error.message);
    }
  } catch (error) {
    console.warn('[onboarding] analytics emit failed:', error);
  }
};
