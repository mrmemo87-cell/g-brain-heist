import React from 'react';
import SchoolDocumentCenter, { type SchoolDocumentStaffOption } from '../../../src/components/SchoolDocumentCenter';
import SchoolPrintHub, { type SchoolPrintSource } from '../SchoolPrintHub';
import { useSchoolAdmin } from '../SchoolAdminContext';

const DocumentsTab: React.FC = () => {
  const { school, teachers = [], schoolAdmins = [], setActiveTab } = useSchoolAdmin();
  const [section, setSection] = React.useState<'print' | 'history'>('print');
  const staffOptions = React.useMemo(() => {
    const people = [...teachers, ...schoolAdmins];
    const unique = new Map<string, SchoolDocumentStaffOption>();
    people.forEach((person: any) => {
      if (!person?.user_id) return;
      unique.set(person.user_id, { userId: person.user_id, label: person.full_name || person.username || 'School staff member' });
    });
    return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [schoolAdmins, teachers]);

  const openPrintSource = React.useCallback((source: SchoolPrintSource) => {
    setActiveTab(source);
  }, [setActiveTab]);

  if (!school?.id) return null;

  return <section className="space-y-5" aria-label="School Document Center">
    <div className="inline-flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto" role="tablist" aria-label="Document Center sections">
      <button type="button" role="tab" aria-selected={section === 'print'} onClick={() => setSection('print')} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition sm:flex-none ${section === 'print' ? 'bg-[#1e4b82] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>What do we need to print?</button>
      <button type="button" role="tab" aria-selected={section === 'history'} onClick={() => setSection('history')} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition sm:flex-none ${section === 'history' ? 'bg-[#1e4b82] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Document history</button>
    </div>

    {section === 'print'
      ? <SchoolPrintHub onOpenSource={openPrintSource} />
      : <SchoolDocumentCenter
          schoolId={school.id}
          mode="admin"
          staffOptions={staffOptions}
          onOpenSource={(source) => setActiveTab(source)}
        />}
  </section>;
};

export default DocumentsTab;
