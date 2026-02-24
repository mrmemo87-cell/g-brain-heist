import React from 'react';
import { useAdmin } from '../AdminContext';
import IeltsAdminDashboard from '../../IeltsAdminDashboard';

const IeltsTab: React.FC = () => {

  return (
    <div className="card-glass p-6 border-2 border-emerald-400/50">
      <h3 className="text-3xl font-heading font-bold text-emerald-300 mb-6">🎯 IELTS Prep Dashboard</h3>
      <IeltsAdminDashboard />
    </div>
  );
};

export default IeltsTab;
