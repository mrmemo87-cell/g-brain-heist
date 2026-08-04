import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import IeltsExamModeAdminGuard from '../../ielts/IeltsExamModeAdminGuard';
import IeltsExamManager from '../../../src/pages/ielts/IeltsExamManager';

interface IeltsExamsTabProps {
  onOpenMonitor?: (examEventId: string) => void;
}

const IeltsExamsTab: React.FC<IeltsExamsTabProps> = ({ onOpenMonitor }) => {
  const { school } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-900/95 to-blue-950/90 rounded-2xl border border-blue-500/30 p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">IELTS Academy</p>
            <h3 className="mt-2 text-2xl font-bold text-white">IELTS Exams</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Create and monitor controlled IELTS mock exams for {school?.name ?? 'this school'} using the secure Exam Mode manager.
              Exam content, assignments, timers, autosaves, and emergency controls are limited to authorised staff at this school.
            </p>
          </div>
          <span className="inline-flex items-center justify-center rounded-xl bg-blue-500/15 px-5 py-3 font-semibold text-blue-100 ring-1 ring-blue-400/30">
            Secure exam workspace
          </span>
        </div>
      </div>

      <IeltsExamModeAdminGuard>
        <IeltsExamManager embedded onOpenMonitor={onOpenMonitor} />
      </IeltsExamModeAdminGuard>
    </div>
  );
};

export default IeltsExamsTab;
