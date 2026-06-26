import React from 'react';
import { useNavigate } from 'react-router-dom';
import IeltsAdminDashboard from '../../IeltsAdminDashboard';
import IeltsContentManager from '../../../src/pages/ielts/IeltsContentManager';

const IeltsTab: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="card-glass p-6 border-2 border-emerald-400/50">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Platform admin IELTS dashboard</p>
          <h3 className="text-3xl font-heading font-bold text-emerald-300">🎯 IELTS Prep Dashboard</h3>
          <p className="mt-2 max-w-3xl text-sm text-gray-300">
            This embedded dashboard is for day-to-day IELTS prep operations. Use the control center for the separate
            school-facing IELTS admin tools, including the public launch funnel analytics page.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/ielts/funnel')}
            className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-3 font-heading text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cyan-200"
          >
            📈 Open Launch Funnel
          </button>
          <button
            type="button"
            onClick={() => navigate('/ielts')}
            className="rounded-xl border border-emerald-300/50 bg-emerald-400/10 px-5 py-3 font-heading text-sm font-bold text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            🧭 Open IELTS Control Center
          </button>
        </div>
      </div>
      <IeltsAdminDashboard />
      <div className="mt-6">
        <IeltsContentManager />
      </div>
    </div>
  );
};

export default IeltsTab;
