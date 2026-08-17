import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import ClassRoster from '../../ClassRoster';

const RosterTab: React.FC = () => {
  const {
    addToast, loadAdminTools, school, setConfirmDialog,
  } = useSchoolAdmin();

  return (
    <ClassRoster
      schoolId={school.id}
      schoolName={school.name}
      schoolLogoUrl={school.logo_url}
      addToast={addToast}
      setConfirmDialog={setConfirmDialog}
      onRefresh={() => loadAdminTools(school.id)}
    />
  );
};

export default RosterTab;
