import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import BillingTabUI from '../BillingTabUI';
import {
  fetchSchoolPlanDetails,
  startPilot,
  createCheckoutSession,
  invalidateTierCache,
  type PlanInfo,
} from '../../../services/tierService';

const BillingTab: React.FC = () => {
  const {
    addToast, billingAction, billingInterval, billingLoading, planDetails, setBillingAction, setBillingInterval, setBillingLoading, setPlanDetails,
  } = useSchoolAdmin();

  return (
    <div className="school-admin-themed-tab"><BillingTabUI
      planDetails={planDetails}
      loading={billingLoading}
      billingAction={billingAction}
      billingInterval={billingInterval}
      setBillingInterval={setBillingInterval}
      onRefreshPlan={async () => {
        setBillingLoading(true);
        try {
          const details = await fetchSchoolPlanDetails();
          setPlanDetails(details);
        } catch {
          addToast('Unable to load plan details. Please try again.', 'error');
        } finally {
          setBillingLoading(false);
        }
      }}
      onStartPilot={async () => {
        setBillingAction('pilot');
        try {
          const result = await startPilot();
          if (result.success) {
            addToast('🚀 30-day pilot activated! All features unlocked.', 'success');
            invalidateTierCache();
            const details = await fetchSchoolPlanDetails();
            setPlanDetails(details);
          } else {
            addToast(result.error || 'Failed to start pilot', 'error');
          }
        } catch {
          addToast('Unable to start the pilot right now. Please try again.', 'error');
        } finally {
          setBillingAction(null);
        }
      }}
      onSubscribe={async (plan: PlanInfo) => {
        setBillingAction(plan.id);
        try {
          const result = await createCheckoutSession({
            plan: plan.id as 'core' | 'standard' | 'pro',
            interval: billingInterval,
          });
          if ('checkout_url' in result && typeof result.checkout_url === 'string') {
            const checkoutUrl = new URL(result.checkout_url);
            if (checkoutUrl.protocol === 'https:' || checkoutUrl.protocol === 'http:') {
              window.location.href = checkoutUrl.href;
              return;
            }
          }
          addToast('error' in result ? result.error || 'Checkout failed' : 'Checkout failed. Please try again.', 'error');
          setBillingAction(null);
        } catch {
          addToast('Unable to open checkout right now. Please try again.', 'error');
          setBillingAction(null);
        }
      }}
    /></div>
  );
};

export default BillingTab;
