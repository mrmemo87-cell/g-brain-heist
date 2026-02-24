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
    addToast, billingAction, billingInterval, billingLoading, loading, planDetails, setBillingAction, setBillingInterval, setBillingLoading, setPlanDetails,
  } = useSchoolAdmin();

  return (
    <BillingTabUI
      planDetails={planDetails}
      loading={billingLoading}
      billingAction={billingAction}
      billingInterval={billingInterval}
      setBillingInterval={setBillingInterval}
      onRefreshPlan={async () => {
        setBillingLoading(true);
        const details = await fetchSchoolPlanDetails();
        setPlanDetails(details);
        setBillingLoading(false);
      }}
      onStartPilot={async () => {
        setBillingAction('pilot');
        const result = await startPilot();
        if (result.success) {
          addToast('🚀 30-day pilot activated! All features unlocked.', 'success');
          invalidateTierCache();
          const details = await fetchSchoolPlanDetails();
          setPlanDetails(details);
        } else {
          addToast(result.error || 'Failed to start pilot', 'error');
        }
        setBillingAction(null);
      }}
      onSubscribe={async (plan: PlanInfo) => {
        setBillingAction(plan.id);
        const result = await createCheckoutSession({
          plan: plan.id as 'core' | 'standard' | 'pro',
          interval: billingInterval,
        });
        if ('checkout_url' in result) {
          window.location.href = result.checkout_url;
        } else {
          addToast(result.error || 'Checkout failed', 'error');
          setBillingAction(null);
        }
      }}
    />
  );
};

export default BillingTab;
