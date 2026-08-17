import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import BillingTabUI from '../BillingTabUI';
import BillingStudio from '../BillingStudio';
import ProgrammeSeatManager from '../ProgrammeSeatManager';
import {
  fetchSchoolPlanDetails,
  startPilot,
  invalidateTierCache,
} from '../../../services/tierService';

const BillingTab: React.FC = () => {
  const {
    addToast, billingAction, billingLoading, currentCapabilities, planDetails, school, setBillingAction, setBillingLoading, setPlanDetails,
  } = useSchoolAdmin();

  return (
    <div className="school-admin-themed-tab space-y-6"><section className="admin-section-heading"><div><p className="school-admin-eyebrow">Subscription</p><h2>Plan &amp; Billing</h2><p>Review your school plan, billing cycle and available platform capacity.</p></div></section><BillingTabUI
      planDetails={planDetails}
      canManageBilling={Boolean(currentCapabilities?.can_manage_billing)}
      loading={billingLoading}
      billingAction={billingAction}
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
            addToast('30-day all-programme pilot activated.', 'success');
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
      billingStudio={school?.id ? <><ProgrammeSeatManager schoolId={school.id} addToast={addToast} /><BillingStudio schoolId={school.id} addToast={addToast} /></> : undefined}
    /></div>
  );
};

export default BillingTab;
