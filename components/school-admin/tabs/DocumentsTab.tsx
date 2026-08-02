import React from 'react';
import SchoolDocumentCenter, { type SchoolDocumentStaffOption } from '../../../src/components/SchoolDocumentCenter';
import { useSchoolAdmin } from '../SchoolAdminContext';

const DocumentsTab: React.FC = () => {
  const { school, teachers = [], schoolAdmins = [], setActiveTab } = useSchoolAdmin();
  const staffOptions = React.useMemo(() => {
    const people = [...teachers, ...schoolAdmins];
    const unique = new Map<string, SchoolDocumentStaffOption>();
    people.forEach((person: any) => {
      if (!person?.user_id) return;
      unique.set(person.user_id, { userId: person.user_id, label: person.full_name || person.username || 'School staff member' });
    });
    return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [schoolAdmins, teachers]);

  if (!school?.id) return null;

  return <SchoolDocumentCenter
    schoolId={school.id}
    mode="admin"
    staffOptions={staffOptions}
    onOpenSource={(source) => setActiveTab(source)}
  />;
};

export default DocumentsTab;
