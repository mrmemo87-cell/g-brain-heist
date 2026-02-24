import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import ClassRoster from '../../ClassRoster';

const RosterTab: React.FC = () => {
  const {
    addToast, loadAdminTools, school,
  } = useSchoolAdmin();

  return (
    <ClassRoster
      schoolId={school.id}
      addToast={addToast}
      onRefresh={() => loadAdminTools(school.id)}
    />
  );
};

export default RosterTab;
