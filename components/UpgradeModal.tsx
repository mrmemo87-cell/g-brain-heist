import React, { useEffect, useState } from 'react';
import { fetchSchoolPlanDetails, type SchoolPlan } from '../services/tierService';
import { getMySchoolCapabilities } from '../services/schoolAdminService';
import DotLottieAnimation from './DotLottieAnimation';
import VisualFallbackImage from './VisualFallbackImage';
import { neonIcon, visualAssets } from './visualAssets';

// ============================================================================
// UpgradeModal — route school pricing decisions to the canonical Billing Studio
// ============================================================================

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureLabel?: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, featureLabel }) => {
  const [loading, setLoading] = useState(true);
  const [viewerIsSchoolMember, setViewerIsSchoolMember] = useState(false);
  const [canManageSchoolBilling, setCanManageSchoolBilling] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<SchoolPlan>('none');

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);

    Promise.all([fetchSchoolPlanDetails(), getMySchoolCapabilities()])
      .then(([details, capabilities]) => {
        if (!active) return;
        setViewerIsSchoolMember(Boolean(capabilities?.school_id));
        setCanManageSchoolBilling(Boolean(capabilities?.can_manage_billing));
        setCurrentPlan(details.plan);
      })
      .catch(() => {
        if (!active) return;
        // Fail closed: an unresolved role never gets a billing action.
        setViewerIsSchoolMember(true);
        setCanManageSchoolBilling(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isSchoolHead = !loading && viewerIsSchoolMember && canManageSchoolBilling;
  const isSchoolMember = !loading && viewerIsSchoolMember && !canManageSchoolBilling;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
      <button type="button" className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close upgrade dialog" />

      <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-emerald-500/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.25), transparent 70%)' }} />
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">✕</button>

        <div className="relative p-5 sm:p-8">
          <div className="mb-5 text-center">
            <div className="mb-2 flex justify-center">
              <DotLottieAnimation src="/lotties/Premium Gold.lottie" width={80} height={80} loop />
            </div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-300">
              <img src={neonIcon('premium')} alt="" className="h-5 w-5 object-contain" />
              Brains Heist for Schools
            </div>
            <h2 id="upgrade-modal-title" className="text-xl font-bold text-white sm:text-2xl">School packages are built around your learners</h2>
            {featureLabel && <p className="mt-2 text-sm text-slate-400"><span className="font-medium text-amber-300">{featureLabel}</span> requires an active school programme.</p>}
          </div>

          <VisualFallbackImage
            src={visualAssets.prime.upgrade}
            alt="Brains Heist school programme access"
            className="mb-5 w-full overflow-hidden rounded-2xl border border-emerald-500/20"
            imgClassName="block h-auto w-full object-contain"
            fallback={<div className="mb-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 p-5"><p className="font-semibold text-white">One platform fee, then add only the programmes you need.</p><p className="mt-1 text-sm text-emerald-100">Teachers and administrators are included at no extra charge.</p></div>}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-800/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Platform</p><p className="mt-1 text-sm text-slate-300">Per active student, with a 50-student minimum.</p></div>
            <div className="rounded-2xl border border-slate-700/60 bg-slate-800/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Programmes</p><p className="mt-1 text-sm text-slate-300">Cambridge, IELTS, Writing and Admissions are selected separately.</p></div>
            <div className="rounded-2xl border border-slate-700/60 bg-slate-800/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Pilot</p><p className="mt-1 text-sm text-slate-300">30 days, all programmes, no card required.</p></div>
          </div>

          <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
            {loading && <p className="text-center text-sm text-cyan-100" role="status">Checking your school access…</p>}

            {isSchoolHead && (
              <>
                <p className="font-semibold text-white">Open Plan &amp; Billing to get the exact school quote.</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">Your current plan is <span className="font-semibold text-cyan-200">{currentPlan}</span>. Choose learner counts, programmes, term and eligible launch pricing; the server calculates and records the quote before approval.</p>
                <a href="/?view=school_admin&amp;adminTab=billing" className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Open Plan &amp; Billing</a>
              </>
            )}

            {isSchoolMember && (
              <>
                <p className="font-semibold text-white">Your School Head manages programme access.</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">You do not need to purchase anything from a student or teacher account. Ask your School Head to start the pilot or request a package in Plan &amp; Billing.</p>
                <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Got it</button>
              </>
            )}

            {!loading && !viewerIsSchoolMember && (
              <>
                <p className="font-semibold text-white">School access is purchased and assigned by the school.</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">Explore the live school pricing model, then ask your school administrator to create or approve the package.</p>
                <a href="/pricing.html" className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Explore school pricing</a>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <span>Server-calculated quotes</span><span>Approval before activation</span><span>No surprise overages</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
