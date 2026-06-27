import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import {
  createIeltsPrimeCheckout,
  getIeltsPrimeSubscriptionStatus,
  type IeltsPrimePlan,
} from '../../../services/ieltsPrimeBillingService';
import { getUserTier, isIeltsPrime } from '../../../services/ieltsService';
import * as IELTSAuthService from '../../../services/ieltsAuthService';
import { openPaddleCheckoutForTransaction } from '../../../services/paddleCheckoutClient';
import { trackIeltsFunnelEvent, type IeltsFunnelUserType } from '../../../services/ieltsFunnelAnalytics';

type PlanCard = {
  id: IeltsPrimePlan;
  name: string;
  originalPrice: number;
  discountedPrice: number;
  period: string;
  badge?: string;
  features: string[];
};

const plans: PlanCard[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    originalPrice: 29,
    discountedPrice: 14.5,
    period: '/month',
    features: ['Full task access', 'Cancel anytime', 'Best for a short sprint'],
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    originalPrice: 69,
    discountedPrice: 34.5,
    period: '/3 months',
    badge: 'Most popular',
    features: ['Best for exam prep', '3 months of access', 'Save vs monthly'],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    originalPrice: 199,
    discountedPrice: 99.5,
    period: '/year',
    badge: 'Best value',
    features: ['Maximum savings', 'Full year access', 'Long-term progress tracking'],
  },
];

const formatPrice = (value: number) =>
  `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;

function getCheckoutState() {
  const search = new URLSearchParams(window.location.search);
  const transactionId = search.get('_ptxn');

  const checkoutSuccess =
    !transactionId &&
    (['success', 'completed'].includes(search.get('checkout') || '') ||
      ['success', 'completed'].includes(search.get('upgrade') || ''));
  const requestedPlan = search.get('plan');
  const autostartCheckout = search.get('autostart') === '1';

  return {
    transactionId,
    checkoutSuccess,
    requestedPlan: ['monthly', 'quarterly', 'yearly'].includes(requestedPlan || '')
      ? (requestedPlan as IeltsPrimePlan)
      : null,
    autostartCheckout,
  };
}

const IeltsPrime: React.FC = () => {
  const navigate = useNavigate();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPrimeUser, setIsPrimeUser] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<IeltsPrimePlan | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [userType, setUserType] = useState<IeltsFunnelUserType>('independent');

  const autoCheckoutStartedRef = useRef(false);
  const checkoutSuccessTrackedRef = useRef(false);
  const { transactionId, checkoutSuccess, requestedPlan, autostartCheckout } = useMemo(() => getCheckoutState(), []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'IELTS Prime | Brains Heist';
  }, []);

  useEffect(() => {
    if (!transactionId) return;

    let cancelled = false;

    async function openCheckoutFromUrl() {
      try {
        setError(null);
        setStatusMessage('Opening secure Paddle checkout…');

        await openPaddleCheckoutForTransaction(transactionId as string);
        trackIeltsFunnelEvent('checkout_opened', { checkout_surface: 'url_transaction' });

        if (!cancelled) {
          window.history.replaceState({}, '', `${window.location.origin}/ielts/apply-prime`);
          setStatusMessage('Complete your secure Paddle checkout to activate Prime.');
        }
      } catch (err) {
        if (!cancelled) {
          setStatusMessage(null);
          setError(err instanceof Error ? err.message : 'Could not open Paddle checkout.');
        }
      }
    }

    void openCheckoutFromUrl();

    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  useEffect(() => {
    let active = true;

    const refreshState = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      setIsAuthenticated(Boolean(data.session));
      if (!data.session) return;

      const tier = await getUserTier();
      if (!active) return;

      const prime = isIeltsPrime({ tier });
      setIsPrimeUser(prime);

      const subscription = await getIeltsPrimeSubscriptionStatus();
      if (!active) return;

      setManageUrl(subscription.management_url || subscription.update_payment_url);

      if (prime) {
        setStatusMessage('Your IELTS Prime access is active.');
        if (!activeAccessTrackedRef.current) {
          activeAccessTrackedRef.current = true;
          trackIeltsFunnelEvent('subscription_activated', { checkout_surface: checkoutSuccess ? 'success_redirect_active_access' : 'active_access_page', user_type: userType });
        }
      } else if (checkoutSuccess) {
        setStatusMessage('Payment received. Activating your Prime access…');
      }
    };

    void refreshState();

    let interval: number | undefined;
    if (checkoutSuccess) {
      interval = window.setInterval(refreshState, 3000);
    }

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
    };
  }, [checkoutSuccess, userType]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUserType('independent');
      return;
    }

    let active = true;
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return;
      const { data: profile } = await supabase
        .from('users')
        .select('school_id')
        .eq('id', auth.user.id)
        .maybeSingle();
      if (active) setUserType((profile as { school_id?: string | null } | null)?.school_id ? 'school' : 'independent');
    }).catch(() => {
      if (active) setUserType('independent');
    });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);


  useEffect(() => {
    if (!checkoutSuccess || checkoutSuccessTrackedRef.current) return;
    checkoutSuccessTrackedRef.current = true;
    trackIeltsFunnelEvent('checkout_completed', { checkout_surface: 'success_redirect', user_type: userType });
  }, [checkoutSuccess, userType]);

  const showActiveAccessState = checkoutSuccess || isPrimeUser;
  const activeAccessIsConfirmed = isPrimeUser;

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      window.sessionStorage.setItem('ielts_auth_intent', '/ielts/apply-prime');
      await IELTSAuthService.loginWithGoogle();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

  const handleCheckout = async (plan: IeltsPrimePlan) => {
    setError(null);

    if (!isAuthenticated) {
      await handleGoogleSignIn();
      return;
    }

    setCheckoutPlan(plan);
    setStatusMessage('Creating secure Paddle checkout…');
    trackIeltsFunnelEvent('checkout_started', { plan, user_type: userType });

    try {
      const result = await createIeltsPrimeCheckout(plan);

      if (result.error) {
        trackIeltsFunnelEvent('funnel_error', { plan, user_type: userType });
        setError(result.error);
        setStatusMessage(null);
        return;
      }

      if (result.transaction_id) {
        setStatusMessage('Opening secure Paddle checkout…');
        await openPaddleCheckoutForTransaction(result.transaction_id);
        trackIeltsFunnelEvent('checkout_opened', { plan, user_type: userType });
        setStatusMessage('Complete your secure Paddle checkout to activate Prime.');
        return;
      }

      if (result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }

      trackIeltsFunnelEvent('funnel_error', { plan, user_type: userType });
      setError('Checkout failed — please try again.');
      setStatusMessage(null);
    } catch (checkoutError) {
      trackIeltsFunnelEvent('funnel_error', { plan, user_type: userType });
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Checkout failed — please try again.',
      );
      setStatusMessage(null);
    } finally {
      setCheckoutPlan(null);
    }
  };

  useEffect(() => {
    if (!autostartCheckout || !requestedPlan || !isAuthenticated || autoCheckoutStartedRef.current || checkoutPlan) {
      return;
    }

    autoCheckoutStartedRef.current = true;
    trackIeltsFunnelEvent('checkout_started', { plan: requestedPlan, user_type: userType });
    void handleCheckout(requestedPlan);
  }, [autostartCheckout, requestedPlan, isAuthenticated, checkoutPlan, userType]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #07111f 0%, #0f172a 52%, #172554 100%)',
        color: '#fff',
        padding: '1.25rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#dbeafe',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 999,
            padding: '0.55rem 0.9rem',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          ← Back to IELTS tasks
        </button>

        <header style={{ textAlign: 'center', padding: '3rem 0 2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #fde68a, #f59e0b)',
              color: '#111827',
              borderRadius: 999,
              padding: '0.45rem 0.9rem',
              fontWeight: 900,
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}
          >
            Temporary 50% launch discount
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(2.3rem, 7vw, 4.8rem)',
              lineHeight: 0.95,
              fontWeight: 950,
            }}
          >
            Start IELTS Prime instantly.
          </h1>

          <p
            style={{
              maxWidth: 720,
              margin: '1rem auto 0',
              color: '#cbd5e1',
              fontSize: '1.08rem',
              lineHeight: 1.7,
            }}
          >
            No application form. No waiting. Secure checkout powered by Paddle, and your access
            activates after checkout.
          </p>

          {!isAuthenticated && (
            <p style={{ margin: '1rem auto 0', color: '#93c5fd', fontWeight: 800 }}>
              Sign in with Google to buy Prime — no school required.
            </p>
          )}

          {statusMessage && (
            <div
              style={{
                margin: '1.25rem auto 0',
                maxWidth: 620,
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(74,222,128,0.35)',
                borderRadius: '1rem',
                padding: '0.9rem 1rem',
                color: '#bbf7d0',
                fontWeight: 800,
              }}
            >
              {statusMessage}
            </div>
          )}

          {error && (
            <div
              style={{
                margin: '1.25rem auto 0',
                maxWidth: 620,
                background: 'rgba(239,68,68,0.13)',
                border: '1px solid rgba(248,113,113,0.45)',
                borderRadius: '1rem',
                padding: '0.9rem 1rem',
                color: '#fecaca',
                fontWeight: 800,
              }}
            >
              {error}
            </div>
          )}
        </header>

        {showActiveAccessState ? (
          <section
            style={{
              maxWidth: 820,
              margin: '0 auto 2rem',
              background: 'linear-gradient(180deg, rgba(30,64,175,0.94), rgba(15,23,42,0.96))',
              border: '1px solid rgba(96,165,250,0.6)',
              borderRadius: '1.35rem',
              padding: '2rem',
              textAlign: 'center',
              boxShadow: '0 28px 80px rgba(2,6,23,0.35)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(34,197,94,0.18)',
                color: '#bbf7d0',
                border: '1px solid rgba(74,222,128,0.45)',
                borderRadius: 999,
                padding: '0.45rem 0.85rem',
                fontWeight: 950,
                fontSize: '0.78rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '1rem',
              }}
            >
              IELTS Prime Active
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(2rem, 5vw, 3.4rem)', lineHeight: 1, fontWeight: 950 }}>
              You’re in. IELTS Prime is active.
            </h2>
            <p style={{ maxWidth: 620, margin: '1rem auto 1.5rem', color: '#dbeafe', fontSize: '1.05rem', lineHeight: 1.7 }}>
              {activeAccessIsConfirmed
                ? 'Your checkout was successful and your IELTS Prime access is ready.'
                : 'Checkout received. We’re activating your access now, and you can refresh once if Prime does not appear immediately.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => navigate('/ielts')} style={{ border: 'none', borderRadius: '0.85rem', padding: '0.9rem 1.15rem', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#052e16', fontWeight: 950, cursor: 'pointer' }}>Start Prime Tasks</button>
              <button type="button" onClick={() => navigate('/ielts')} style={{ border: '1px solid rgba(191,219,254,0.45)', borderRadius: '0.85rem', padding: '0.9rem 1.15rem', background: 'rgba(255,255,255,0.08)', color: '#dbeafe', fontWeight: 950, cursor: 'pointer' }}>Back to IELTS Dashboard</button>
            </div>
            <p style={{ margin: '1.25rem 0 0', color: '#bfdbfe', fontSize: '0.9rem' }}>
              If access does not appear immediately, refresh once or contact support.
            </p>
          </section>
        ) : (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          {plans.map((plan) => (
            <article
              key={plan.id}
              style={{
                position: 'relative',
                background:
                  plan.badge === 'Most popular'
                    ? 'linear-gradient(180deg, rgba(30,64,175,0.96), rgba(15,23,42,0.96))'
                    : 'rgba(255,255,255,0.08)',
                border:
                  plan.badge === 'Most popular'
                    ? '1px solid rgba(96,165,250,0.75)'
                    : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '1.25rem',
                padding: '1.35rem',
                boxShadow: '0 24px 70px rgba(2,6,23,0.35)',
              }}
            >
              {plan.badge && (
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    background: '#22c55e',
                    color: '#052e16',
                    borderRadius: 999,
                    padding: '0.28rem 0.62rem',
                    fontWeight: 900,
                    fontSize: '0.7rem',
                  }}
                >
                  {plan.badge}
                </div>
              )}

              <h2 style={{ margin: '0 0 0.7rem', fontSize: '1.35rem', fontWeight: 950 }}>
                {plan.name}
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.65rem',
                  marginBottom: '0.35rem',
                }}
              >
                <span
                  style={{
                    color: '#94a3b8',
                    textDecoration: 'line-through',
                    fontSize: '1.15rem',
                    fontWeight: 800,
                  }}
                >
                  {formatPrice(plan.originalPrice)}
                </span>
                <span style={{ fontSize: '2.35rem', fontWeight: 950, color: '#fef3c7' }}>
                  {formatPrice(plan.discountedPrice)}
                </span>
                <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{plan.period}</span>
              </div>

              <p style={{ margin: '0 0 1rem', color: '#fde68a', fontWeight: 900 }}>
                50% off at checkout
              </p>

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 1.25rem',
                  display: 'grid',
                  gap: '0.55rem',
                  color: '#dbeafe',
                }}
              >
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout(plan.id)}
                disabled={Boolean(checkoutPlan) || googleLoading}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: '0.85rem',
                  padding: '0.9rem 1rem',
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#052e16',
                  fontWeight: 950,
                  cursor: checkoutPlan || googleLoading ? 'wait' : 'pointer',
                  opacity: checkoutPlan || googleLoading ? 0.75 : 1,
                }}
              >
                {checkoutPlan === plan.id
                  ? 'Opening Paddle…'
                  : googleLoading
                    ? 'Connecting to Google…'
                    : isAuthenticated
                      ? 'Checkout with Paddle'
                      : 'Sign in with Google to continue'}
              </button>
            </article>
          ))}
        </section>
        )}

        <section
          style={{
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: '1.25rem',
            padding: '1.25rem',
            marginBottom: '2rem',
          }}
        >
          <h2 style={{ margin: '0 0 0.8rem', fontWeight: 950 }}>What Prime unlocks</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
              color: '#cbd5e1',
            }}
          >
            <div>📚 Full Reading practice access</div>
            <div>🎧 Listening practice and test mode</div>
            <div>✍️ Writing prompts and feedback flow</div>
            <div>🎤 Speaking practice and review flow</div>
          </div>
        </section>

        {isPrimeUser && manageUrl && (
          <section style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <a
              href={manageUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#bfdbfe', fontWeight: 900 }}
            >
              Manage your Paddle subscription
            </a>
          </section>
        )}
      </div>
    </div>
  );
};

export default IeltsPrime;
