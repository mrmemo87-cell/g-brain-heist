import React from 'react';
import type { StudentAcademicProfile } from '../../services/studentAcademicProfileService';
import AcademicReportBuilder from './AcademicReportBuilder';

interface IndividualStudentAcademicReportProps {
  profile: StudentAcademicProfile;
  schoolName?: string;
  schoolLogoUrl?: string;
  teacherName?: string;
  onClose: () => void;
}

/**
 * Compatibility entry point for the student profile. The report itself is now
 * generated from the authoritative year/term snapshot RPC, not the live page state.
 */
const IndividualStudentAcademicReport: React.FC<IndividualStudentAcademicReportProps> = ({
  profile, schoolName, schoolLogoUrl, onClose,
}) => <AcademicReportBuilder
  studentId={profile.student.id}
  studentName={profile.student.name}
  fixedReportType="student"
  initialSubject={profile.scope.subject}
  schoolId={profile.student.school_id}
  schoolName={schoolName}
  schoolLogoUrl={schoolLogoUrl}
  onClose={onClose}
/>;

export default IndividualStudentAcademicReport;
