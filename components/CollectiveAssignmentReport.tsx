import React, { useEffect, useMemo, useState } from 'react';
import type { StudentForAssignment } from '../types';
import * as GameService from '../services/gameService';
import CollectiveAssignmentReportView from './CollectiveAssignmentReportView';

export type { CollectiveReportData } from './CollectiveAssignmentReportView';

type CollectiveAssignmentReportProps = React.ComponentProps<typeof CollectiveAssignmentReportView>;

/**
 * Hydration barrier for collective reports.
 *
 * The editable report view initializes its selected-student set from the first
 * roster it receives. Historical submitters can legitimately be absent from a
 * current assignment-eligible roster (for example after suspension, transfer,
 * or leaving the class), so we merge historical report identities before the
 * view mounts. That prevents real submissions from being filtered out by an
 * early, current-roster-only selection snapshot.
 */
const CollectiveAssignmentReport: React.FC<CollectiveAssignmentReportProps> = (props) => {
  const { assignments, students = [] } = props;
  const [historicalStudents, setHistoricalStudents] = useState<StudentForAssignment[] | null>(
    assignments.length ? null : students,
  );

  const assignmentKey = useMemo(
    () => assignments.map((assignment) => assignment.id).sort().join('|'),
    [assignments],
  );
  const rosterKey = useMemo(
    () => students.map((student) => `${student.id}:${student.batch || ''}:${student.display_name}`).sort().join('|'),
    [students],
  );

  useEffect(() => {
    let cancelled = false;

    if (!assignments.length) {
      setHistoricalStudents(students);
      return () => { cancelled = true; };
    }

    setHistoricalStudents(null);

    const hydrate = async () => {
      try {
        const reports = await GameService.get_all_assignment_reports(assignments.map((assignment) => assignment.id));
        if (cancelled) return;

        const merged = new Map<string, StudentForAssignment>();
        students.forEach((student) => merged.set(student.id, student));

        Object.values(reports).forEach((rows) => {
          rows.forEach((row) => {
            if (merged.has(row.student_id)) return;
            const historicalClass = row.historical_batch || row.batch || null;
            const officialName = row.student_name?.trim() || 'Student';
            merged.set(row.student_id, {
              id: row.student_id,
              username: officialName,
              display_name: officialName,
              grade: 0,
              batch: historicalClass as StudentForAssignment['batch'],
              avatar_url: null,
            });
          });
        });

        setHistoricalStudents([...merged.values()]);
      } catch (error) {
        console.error('Could not pre-hydrate historical report students:', error);
        if (!cancelled) setHistoricalStudents(students);
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, [assignmentKey, rosterKey]); // stable keys intentionally prevent identity-only prop churn from refetching

  if (historicalStudents === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" role="status" aria-live="polite">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-medium">Preparing complete student history…</p>
      </div>
    );
  }

  return <CollectiveAssignmentReportView {...props} students={historicalStudents} />;
};

export default CollectiveAssignmentReport;
