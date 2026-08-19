import React, { useMemo } from 'react';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import {
  academicProgressBackDestination,
  academicProgressViewerLabel,
  type AcademicProgressExperienceContext,
} from '../../services/academicProgressExperienceService';
import './AcademicProgressSuite.css';

export interface AcademicStudentOption {
  student_id: string;
  student_name: string;
  grade?: string | number | null;
  class_name?: string | null;
  subjects?: string[];
}

interface AcademicProgressHeaderProps {
  context?: AcademicProgressExperienceContext | null;
  eyebrow?: string;
  title: string;
  subtitle: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
}

export const AcademicProgressHeader: React.FC<AcademicProgressHeaderProps> = ({
  context,
  eyebrow = 'Academic Progress',
  title,
  subtitle,
  onBack,
  backLabel,
  actions,
}) => {
  const fallback = academicProgressBackDestination(context?.viewer.role);
  const brand = createSchoolBrand({
    schoolId: context?.school.id,
    schoolName: context?.school.name,
    schoolLogoUrl: context?.school.logo_url,
  });
  const goBack = () => {
    if (onBack) return onBack();
    if (window.history.length > 1) return window.history.back();
    window.location.assign(fallback.href);
  };

  return (
    <header className="aps-header" data-viewer-role={context?.viewer.role || 'unknown'}>
      <div className="aps-brand-row">
        <SchoolBrand brand={brand} className="aps-school-brand" imageClassName="aps-school-logo" />
        <span className="aps-viewer-chip">{academicProgressViewerLabel(context?.viewer.role)}</span>
      </div>
      <div className="aps-header-main">
        <div>
          <span className="aps-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="aps-header-actions">
          {actions}
          <button type="button" className="aps-secondary-button" onClick={goBack}>{backLabel || fallback.label}</button>
        </div>
      </div>
    </header>
  );
};

interface AcademicStudentPickerProps {
  students: AcademicStudentOption[];
  grade: string;
  className: string;
  studentId: string;
  subject?: string;
  showSubject?: boolean;
  onGradeChange: (value: string) => void;
  onClassChange: (value: string) => void;
  onStudentChange: (value: string) => void;
  onSubjectChange?: (value: string) => void;
  subjectLabel?: string;
  subjectAllLabel?: string;
}

const displayGrade = (value: string) => /^\d+$/.test(value) ? `Grade ${value}` : value;
const gradeKey = (value: string | number | null | undefined) => String(value ?? '').trim() || 'Unspecified grade';
const hasUppercase = (value: string) => /[A-Z]/.test(value);

export const normalizeAcademicSubjectOptions = (values: Iterable<string>): string[] => {
  const byKey = new Map<string, string>();
  for (const rawValue of values) {
    const value = String(rawValue || '').trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    const current = byKey.get(key);
    if (!current || (!hasUppercase(current) && hasUppercase(value))) byKey.set(key, value);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

export const AcademicStudentPicker: React.FC<AcademicStudentPickerProps> = ({
  students,
  grade,
  className,
  studentId,
  subject = 'all',
  showSubject = true,
  onGradeChange,
  onClassChange,
  onStudentChange,
  onSubjectChange,
  subjectLabel = 'Subject',
  subjectAllLabel = 'All available subjects',
}) => {
  const grades = useMemo(() => {
    const values = [...new Set(students.map((student) => gradeKey(student.grade)))];
    return values.sort((a, b) => {
      if (a === 'Unspecified grade') return 1;
      if (b === 'Unspecified grade') return -1;
      const an = Number(a); const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.localeCompare(b);
    });
  }, [students]);

  const classes = useMemo(() => [...new Set(students
    .filter((student) => gradeKey(student.grade) === grade)
    .map((student) => student.class_name || 'Unassigned'))].sort(), [students, grade]);

  const classStudents = useMemo(() => students.filter((student) => (
    gradeKey(student.grade) === grade && (student.class_name || 'Unassigned') === className
  )).sort((a, b) => a.student_name.localeCompare(b.student_name)), [students, grade, className]);

  const selectedStudent = students.find((student) => student.student_id === studentId);
  const subjects = normalizeAcademicSubjectOptions(selectedStudent?.subjects || []);
  const canonicalSubject = subject === 'all'
    ? 'all'
    : subjects.find((value) => value.toLocaleLowerCase() === subject.toLocaleLowerCase()) || subject;

  return (
    <section className="aps-picker" aria-label="Student selection">
      <div className="aps-picker-heading">
        <div><span>Student selection</span><h2>Find the right student in three steps</h2></div>
        <p>Choose the academic year first, then the class, then the student. This mirrors the normal school workflow.</p>
      </div>
      <div className={`aps-picker-grid ${showSubject ? 'has-subject' : ''}`}>
        <label><span><b>1</b> Grade</span><select value={grade} onChange={(event) => onGradeChange(event.target.value)}><option value="">Choose grade</option>{grades.map((value) => <option key={value} value={value}>{displayGrade(value)}</option>)}</select></label>
        <label><span><b>2</b> Class</span><select value={className} disabled={!grade} onChange={(event) => onClassChange(event.target.value)}><option value="">{grade ? 'Choose class' : 'Choose grade first'}</option>{classes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span><b>3</b> Student</span><select value={studentId} disabled={!className} onChange={(event) => onStudentChange(event.target.value)}><option value="">{className ? 'Choose student' : 'Choose class first'}</option>{classStudents.map((student) => <option key={student.student_id} value={student.student_id}>{student.student_name}</option>)}</select></label>
        {showSubject ? <label><span><b>4</b> {subjectLabel}</span><select value={canonicalSubject} disabled={!studentId} onChange={(event) => onSubjectChange?.(event.target.value)}><option value="all">{studentId ? subjectAllLabel : 'Choose student first'}</option>{subjects.map((value) => <option key={value.toLocaleLowerCase()} value={value}>{value}</option>)}</select></label> : null}
      </div>
    </section>
  );
};

export function selectionFromStudent(students: AcademicStudentOption[], studentId: string): { grade: string; className: string } | null {
  const student = students.find((item) => item.student_id === studentId);
  if (!student) return null;
  return { grade: gradeKey(student.grade), className: student.class_name || 'Unassigned' };
}
