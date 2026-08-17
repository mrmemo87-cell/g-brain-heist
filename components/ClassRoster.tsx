import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import * as SchoolAdminService from '../services/schoolAdminService';
import type { ClassRosterStudent, ClassWithRosterInfo, ClassStatistics } from '../services/schoolAdminService';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../src/lib/schoolDocument';
import type { SchoolAdminConfirmDialog } from './school-admin/schoolAdminConfirm';

interface ClassRosterProps {
  schoolId: string;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onRefresh?: () => void;
  schoolName?: string;
  schoolLogoUrl?: string | null;
  setConfirmDialog: React.Dispatch<React.SetStateAction<SchoolAdminConfirmDialog | null>>;
}

interface ExpandedClass {
  classId: string;
  students: ClassRosterStudent[];
  loading: boolean;
  stats: ClassStatistics | null;
}

const getClassDescriptor = (classInfo: ClassWithRosterInfo): string => {
  const gradeLabel = classInfo.grade_level ? `Grade ${classInfo.grade_level}` : '';
  const className = classInfo.class_name?.trim() || '';
  if (!className) return gradeLabel || 'Grade level not set';
  if (gradeLabel && className.toLocaleLowerCase() === gradeLabel.toLocaleLowerCase()) return gradeLabel;
  return gradeLabel ? `${gradeLabel} · ${className}` : className;
};

const ClassRoster: React.FC<ClassRosterProps> = ({ schoolId, addToast, onRefresh, schoolName = 'Brains Heist', schoolLogoUrl, setConfirmDialog }) => {
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [classes, setClasses] = useState<ClassWithRosterInfo[]>([]);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, ExpandedClass>>({});
  const [unassignedStudents, setUnassignedStudents] = useState<ClassRosterStudent[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  
  // Move student modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetClassId, setMoveTargetClassId] = useState('');
  const [studentToMove, setStudentToMove] = useState<{ student: ClassRosterStudent; fromClassId: string | null } | null>(null);
  const [placementReason, setPlacementReason] = useState('Administrator-approved class placement');
  const [placementEffectiveDate, setPlacementEffectiveDate] = useState(localToday);
  
  // Bulk action modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'add' | 'remove' | 'move'>('add');
  const [bulkTargetClassId, setBulkTargetClassId] = useState('');
  const [bulkSourceClassId, setBulkSourceClassId] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Load classes with roster info
  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const [classData, unassigned] = await Promise.all([
        SchoolAdminService.getSchoolClassRosters(schoolId),
        SchoolAdminService.getUnassignedStudents(schoolId),
      ]);
      setClasses(classData);
      setUnassignedStudents(unassigned);
    } catch (err) {
      console.error('Error loading classes:', err);
      addToast('Failed to load class roster data', 'error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, addToast]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Toggle expand class to show students
  const toggleExpandClass = async (classId: string) => {
    if (expandedClasses[classId]) {
      // Collapse
      setExpandedClasses((prev) => {
        const newState = { ...prev };
        delete newState[classId];
        return newState;
      });
    } else {
      // Expand - load roster
      setExpandedClasses((prev) => ({
        ...prev,
        [classId]: { classId, students: [], loading: true, stats: null },
      }));

      try {
        const [roster, stats] = await Promise.all([
          SchoolAdminService.getClassRoster(classId),
          SchoolAdminService.getClassStatistics(classId),
        ]);
        setExpandedClasses((prev) => ({
          ...prev,
          [classId]: { classId, students: roster, loading: false, stats },
        }));
      } catch (err) {
        console.error('Error loading class roster:', err);
        setExpandedClasses((prev) => ({
          ...prev,
          [classId]: { classId, students: [], loading: false, stats: null },
        }));
      }
    }
  };

  // Handle student selection
  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  // Select all students in a class
  const selectAllInClass = (classId: string) => {
    const expanded = expandedClasses[classId];
    if (!expanded) return;
    
    setSelectedStudents((prev) => {
      const newSet = new Set(prev);
      expanded.students.forEach((s) => newSet.add(s.student_id));
      return newSet;
    });
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedStudents(new Set());
  };

  // Remove student from class
  const handleRemoveStudent = (classId: string, studentId: string, studentName: string) => {
    setConfirmDialog({
      title: `Remove ${studentName} from this class?`,
      description: 'The student will become unassigned. Their placement history will remain in the school record.',
      confirmLabel: 'Confirm unassignment',
      cancelLabel: 'Keep in class',
      requiresReason: true,
      reasonRequired: true,
      reasonLabel: 'Unassignment reason',
      reasonInitialValue: 'Administrator-approved unassignment',
      reasonMinimumLength: 3,
      requiresEffectiveDate: true,
      effectiveDateInitialValue: localToday,
      onConfirm: async (reason, values) => {
        if (!reason || !values?.effectiveDate) return;
        setActionLoading(true);
        try {
          const result = await SchoolAdminService.unassignStudentPlacement({ schoolId, studentId, expectedFromClassId: classId, reason, effectiveDate: values.effectiveDate });
          if (result.success) {
            addToast(`Removed ${studentName} from class`, 'success');
            const [roster, unassigned] = await Promise.all([
              SchoolAdminService.getClassRoster(classId),
              SchoolAdminService.getUnassignedStudents(schoolId),
            ]);
            setExpandedClasses((prev) => ({ ...prev, [classId]: { ...prev[classId], students: roster } }));
            setUnassignedStudents(unassigned);
            void loadClasses();
          } else {
            addToast(result.error || 'Failed to remove student', 'error');
          }
        } catch (err) {
          addToast('An error occurred', 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Open move modal
  const openMoveModal = (student: ClassRosterStudent, fromClassId: string | null) => {
    setStudentToMove({ student, fromClassId });
    setMoveTargetClassId('');
    setPlacementReason(fromClassId ? 'Administrator-approved class transfer' : 'Administrator-approved initial placement');
    setPlacementEffectiveDate(localToday);
    setShowMoveModal(true);
  };

  // Handle move student
  const handleMoveStudent = async () => {
    if (!studentToMove || !moveTargetClassId) return;
    
    setActionLoading(true);
    try {
      const result = await SchoolAdminService.transferStudentPlacement({
        schoolId,
        studentId: studentToMove.student.student_id,
        expectedFromClassId: studentToMove.fromClassId,
        toClassId: moveTargetClassId,
        reason: placementReason,
        effectiveDate: placementEffectiveDate,
      });
      
      if (result.success) {
        addToast(result.message || 'Student moved successfully', 'success');
        setShowMoveModal(false);
        setStudentToMove(null);
        
        // Reload data
        loadClasses();
        setExpandedClasses({});
      } else {
        addToast(result.error || 'Failed to move student', 'error');
      }
    } catch (err) {
      addToast('An error occurred', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle bulk action
  const handleBulkAction = async () => {
    if (selectedStudents.size === 0) {
      addToast('No students selected', 'warning');
      return;
    }
    
    setActionLoading(true);
    const studentIds = Array.from(selectedStudents);
    
    try {
      let result;
      
      if ((bulkAction === 'add' || bulkAction === 'move') && bulkTargetClassId) {
        result = await SchoolAdminService.bulkTransferStudentPlacements({ schoolId, studentIds, toClassId: bulkTargetClassId, reason: placementReason, effectiveDate: placementEffectiveDate });
      } else if (bulkAction === 'remove' && bulkSourceClassId) {
        const outcomes = await Promise.all(studentIds.map((studentId) => SchoolAdminService.unassignStudentPlacement({ schoolId, studentId, expectedFromClassId: bulkSourceClassId, reason: placementReason, effectiveDate: placementEffectiveDate })));
        const changed = outcomes.filter((outcome) => outcome.success).length;
        result = { success: true, message: `Reviewed unassignment saved for ${changed} students; ${outcomes.length - changed} require individual review.` };
      }
      
      if (result?.success) {
        addToast(result.message || 'Bulk action completed', 'success');
        setShowBulkModal(false);
        clearSelection();
        loadClasses();
        setExpandedClasses({});
      } else {
        addToast(result?.error || 'Bulk action failed', 'error');
      }
    } catch (err) {
      addToast('An error occurred', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-enroll by grade
  const handleAutoEnroll = (classId: string, classCode: string) => {
    const targetClass = classes.find((item) => item.class_id === classId);
    const matching = unassignedStudents.filter((student) => String(student.grade) === String(targetClass?.grade_level)).map((student) => student.student_id);
    if (matching.length === 0) { addToast('No unassigned students match this class year.', 'info'); return; }
    setConfirmDialog({
      title: `Place ${matching.length} students in ${classCode}?`,
      description: 'This applies a reviewed class and grade placement to every matching unassigned student.',
      confirmLabel: 'Save placements',
      requiresReason: true,
      reasonRequired: true,
      reasonLabel: 'Placement reason',
      reasonInitialValue: 'Administrator-approved year-group placement',
      reasonMinimumLength: 3,
      requiresEffectiveDate: true,
      effectiveDateInitialValue: localToday,
      onConfirm: async (reason, values) => {
        if (!reason || !values?.effectiveDate) return;
        setActionLoading(true);
        try {
          const result = await SchoolAdminService.bulkTransferStudentPlacements({ schoolId, studentIds: matching, toClassId: classId, reason, effectiveDate: values.effectiveDate });
          if (result.success) {
            addToast(result.message || `Reviewed placement saved for ${matching.length} students`, 'success');
            void loadClasses();
            if (expandedClasses[classId]) {
              const roster = await SchoolAdminService.getClassRoster(classId);
              setExpandedClasses((prev) => ({ ...prev, [classId]: { ...prev[classId], students: roster } }));
            }
          } else {
            addToast(result.error || 'Failed to auto-enroll', 'error');
          }
        } catch (err) {
          addToast('An error occurred', 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Add unassigned student to class
  const handleAddUnassignedToClass = (studentId: string, classId: string) => {
    const student = unassignedStudents.find((candidate) => candidate.student_id === studentId);
    const destination = classes.find((candidate) => candidate.class_id === classId);
    setConfirmDialog({
      title: 'Confirm student placement',
      description: `Place ${student?.username || 'this student'} in ${destination?.class_code || 'the selected class'} and update the official grade and class record.`,
      confirmLabel: 'Save placement',
      requiresReason: true,
      reasonRequired: true,
      reasonLabel: 'Placement reason',
      reasonInitialValue: 'Administrator-approved initial placement',
      reasonMinimumLength: 3,
      requiresEffectiveDate: true,
      effectiveDateInitialValue: localToday,
      onConfirm: async (reason, values) => {
        if (!reason || !values?.effectiveDate) return;
        setActionLoading(true);
        try {
          const result = await SchoolAdminService.transferStudentPlacement({ schoolId, studentId, expectedFromClassId: null, toClassId: classId, reason, effectiveDate: values.effectiveDate });
          if (result.success) {
            addToast(result.message || 'Student added to class', 'success');
            void loadClasses();
            const unassigned = await SchoolAdminService.getUnassignedStudents(schoolId);
            setUnassignedStudents(unassigned);
          } else {
            addToast(result.error || 'Failed to add student', 'error');
          }
        } catch (err) {
          addToast('An error occurred', 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Filter classes by search
  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) return classes;
    const q = searchQuery.toLowerCase();
    return classes.filter(
      (c) =>
        c.class_code.toLowerCase().includes(q) ||
        c.class_name.toLowerCase().includes(q) ||
        (c.grade_level && c.grade_level.toString().includes(q))
    );
  }, [classes, searchQuery]);

  const printClassRoster = (classInfo: ClassWithRosterInfo, roster: ExpandedClass) => {
    const rows = roster.students.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(student.username)}</td><td>${escapeSchoolDocumentHtml(student.grade || '—')}</td><td></td></tr>`).join('');
    try {
      openSchoolDocumentPreview({
        meta: { documentId: createSchoolDocumentId('roster'), templateVersion: 'admin-class-roster-v1', title: 'Official Class Roster', subtitle: `${classInfo.class_code} · ${classInfo.class_name}`, schoolName, schoolLogoUrl, audience: 'internal', status: 'final', confidentiality: 'confidential', generatedAt: new Date().toISOString(), schoolId, classId: classInfo.class_id, visibilityScope: 'class_staff', sourceType: 'class_roster', sourceId: classInfo.class_id, className: classInfo.class_code },
        bodyHtml: `<p><strong>Grade level:</strong> ${escapeSchoolDocumentHtml(classInfo.grade_level || '—')} · <strong>Enrolled:</strong> ${roster.students.length}</p><table><thead><tr><th>No.</th><th>Official student name</th><th>Grade level</th><th>Administrative notes</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No students are enrolled in this class.</td></tr>'}</tbody></table>`,
        orientation: 'portrait', inkSaver: true, fileName: schoolDocumentFileName(schoolName, classInfo.class_code, 'Class_Roster'),
      });
    } catch (error) { addToast(error instanceof Error ? error.message : 'Unable to open the class document.', 'error'); }
  };

  if (loading) {
    return (
      <div className="class-roster-loading" role="status">
        <span className="class-roster-spinner" aria-hidden="true" />
        <span>Loading class rosters…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 class-roster-admin">
      {/* Header with actions */}
      <div className="class-roster-summary">
        <div>
          <h3>Student placement</h3>
          <p>
            {classes.length} classes • {classes.reduce((acc, c) => acc + c.student_count, 0)} enrolled students • {unassignedStudents.length} unassigned
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {selectedStudents.size > 0 && (
            <>
              <button
                onClick={() => {
                  setBulkAction('add');
                  setPlacementReason('Administrator-approved bulk placement');
                  setPlacementEffectiveDate(localToday);
                  setShowBulkModal(true);
                }}
                className="class-roster-primary-action"
              >
                Add selected ({selectedStudents.size})
              </button>
              <button
                onClick={clearSelection}
                className="class-roster-secondary-action"
              >
                Clear selection
              </button>
            </>
          )}
          <button
            onClick={() => setShowUnassigned(!showUnassigned)}
            className={showUnassigned ? 'class-roster-secondary-action is-active' : 'class-roster-secondary-action'}
          >
            Unassigned ({unassignedStudents.length})
          </button>
          <button
            onClick={() => {
              loadClasses();
              setExpandedClasses({});
            }}
            className="class-roster-secondary-action"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="class-roster-search">
        <input
          type="text"
          placeholder="Search classes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search classes"
        />
      </div>

      {classes.length > 0 && classes.every((classInfo) => classInfo.student_count === 0) && unassignedStudents.length === 0 && (
        <div className="class-roster-guidance" role="status">
          <strong>No registered students yet</strong>
          <span>These classes are ready for enrolment. Students will appear here for placement after they register and join this school.</span>
        </div>
      )}

      {/* Unassigned Students Panel */}
      {showUnassigned && unassignedStudents.length > 0 && (
        <section className="class-roster-unassigned" aria-labelledby="unassigned-students-title">
          <div className="class-roster-panel-heading">
            <div><h4 id="unassigned-students-title">Unassigned students</h4><p>Place each registered student into an active class.</p></div>
            <strong>{unassignedStudents.length}</strong>
          </div>
          <div className="class-roster-table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grade level</th>
                  <th className="is-right">Place in class</th>
                </tr>
              </thead>
              <tbody>
                {unassignedStudents.slice(0, 20).map((student) => (
                  <tr key={student.student_id}>
                    <td>
                      <div className="class-roster-student-identity">
                        {student.avatar_url ? (
                          <img src={student.avatar_url} alt="" />
                        ) : (
                          <span aria-hidden="true">
                            {student.username.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <strong>{student.username}</strong>
                      </div>
                    </td>
                    <td>{student.grade ? `Grade ${student.grade}` : 'Not recorded'}</td>
                    <td className="is-right">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddUnassignedToClass(student.student_id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        disabled={actionLoading}
                        aria-label={`Place ${student.username} in a class`}
                      >
                        <option value="">Select class...</option>
                        {classes.filter((c) => c.is_active).map((c) => (
                          <option key={c.class_id} value={c.class_id}>
                            {c.class_code} - {c.class_name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unassignedStudents.length > 20 && (
              <p className="class-roster-table-note">
                {unassignedStudents.length - 20} more students are available
              </p>
            )}
          </div>
        </section>
      )}

      {/* Class List with Expandable Rosters */}
      <div className="space-y-3">
        {filteredClasses.map((classInfo) => {
          const expanded = expandedClasses[classInfo.class_id];
          const isExpanded = !!expanded;
          
          return (
            <section
              key={classInfo.class_id}
              className={isExpanded ? 'class-roster-card is-expanded' : 'class-roster-card'}
            >
              {/* Class Header - Clickable */}
              <button
                type="button"
                onClick={() => toggleExpandClass(classInfo.class_id)}
                className="class-roster-card-trigger"
                aria-expanded={isExpanded}
              >
                <div className="class-roster-class-identity">
                    <div>
                      <h4>{classInfo.class_code}</h4>
                      {!classInfo.is_active && (
                        <span className="class-roster-status is-inactive">
                          Inactive
                        </span>
                      )}
                      {classInfo.is_active && classInfo.student_count === 0 && <span className="class-roster-status">Ready for enrolment</span>}
                    </div>
                    <p>{getClassDescriptor(classInfo)}</p>
                </div>
                
                <div className="class-roster-card-meta">
                  <span><strong>{classInfo.student_count}</strong> students</span>
                  <span><strong>{classInfo.teacher_count}</strong> teachers</span>
                  <i aria-hidden="true">{isExpanded ? '−' : '+'}</i>
                </div>
              </button>

              {/* Expanded Roster */}
              {isExpanded && (
                <div className="class-roster-expanded">
                  {expanded.loading ? (
                    <div className="class-roster-inline-loading" role="status">
                      <span className="class-roster-spinner" aria-hidden="true" />
                      Loading students…
                    </div>
                  ) : (
                    <>
                      {/* Keep the register focused on school operations rather than game statistics. */}
                      {expanded.stats && expanded.stats.teachers.length > 0 && (
                        <div className="class-roster-teacher-summary">
                          <div>
                            <span>Assigned teaching staff</span>
                            <strong>
                              {expanded.stats.teachers.map((t) => `${t.username} (${t.subject})`).join(', ')}
                            </strong>
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="class-roster-toolbar">
                        <button type="button" onClick={(event) => { event.stopPropagation(); printClassRoster(classInfo, expanded); }} className="class-roster-primary-action">Print class roster</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectAllInClass(classInfo.class_id);
                          }}
                          className="class-roster-secondary-action"
                        >
                          Select all
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAutoEnroll(classInfo.class_id, classInfo.class_code);
                          }}
                          disabled={actionLoading}
                          className="class-roster-secondary-action"
                        >
                          Place students by grade level
                        </button>
                      </div>
                      
                      {/* Student Table */}
                      {expanded.students.length > 0 ? (
                        <div className="class-roster-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th className="is-checkbox">
                                  <input
                                    type="checkbox"
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        selectAllInClass(classInfo.class_id);
                                      } else {
                                        expanded.students.forEach((s) => {
                                          setSelectedStudents((prev) => {
                                            const newSet = new Set(prev);
                                            newSet.delete(s.student_id);
                                            return newSet;
                                          });
                                        });
                                      }
                                    }}
                                    aria-label={`Select every student in ${classInfo.class_code}`}
                                  />
                                </th>
                                <th>Student</th>
                                <th>Email</th>
                                <th className="is-center">Status</th>
                                <th className="is-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expanded.students.map((student) => (
                                <tr 
                                  key={student.student_id} 
                                  className={selectedStudents.has(student.student_id) ? 'is-selected' : ''}
                                >
                                  <td className="is-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={selectedStudents.has(student.student_id)}
                                      onChange={() => toggleStudentSelection(student.student_id)}
                                      aria-label={`Select ${student.username}`}
                                    />
                                  </td>
                                  <td>
                                    <div className="class-roster-student-identity">
                                      {student.avatar_url ? (
                                        <img src={student.avatar_url} alt="" />
                                      ) : (
                                        <span aria-hidden="true">
                                          {student.username.charAt(0).toUpperCase()}
                                        </span>
                                      )}
                                      <div>
                                        <strong>{student.username}</strong>
                                        <small>{student.grade ? `Grade ${student.grade}` : 'Grade level not recorded'}</small>
                                      </div>
                                    </div>
                                  </td>
                                  <td>{student.email}</td>
                                  <td className="is-center">
                                    {student.is_banned ? (
                                      <span className="class-roster-account-status is-restricted">
                                        Banned
                                      </span>
                                    ) : (
                                      <span className="class-roster-account-status">
                                        Active
                                      </span>
                                    )}
                                  </td>
                                  <td className="is-right">
                                    <div className="class-roster-row-actions">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveModal(student, classInfo.class_id);
                                        }}
                                        disabled={actionLoading}
                                        className="class-roster-link-action"
                                        title="Move to another class"
                                      >
                                        Move
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveStudent(classInfo.class_id, student.student_id, student.username);
                                        }}
                                        disabled={actionLoading}
                                        className="class-roster-link-action is-danger"
                                        title="Remove from class"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="class-roster-empty">
                          <strong>No students enrolled in this class</strong>
                          <p>Registered students for this grade level can be placed here when they become available.</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoEnroll(classInfo.class_id, classInfo.class_code);
                            }}
                            disabled={actionLoading}
                            className="class-roster-primary-action"
                          >
                            Place students by grade level
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {filteredClasses.length === 0 && (
        <div className="class-roster-empty">
          <strong>No classes found</strong>
          <p>Complete a grade plan or create a class in Class setup first.</p>
        </div>
      )}

      {/* Move Student Modal */}
      {showMoveModal && studentToMove && ReactDOM.createPortal(
        <div className="school-admin-modal-overlay class-roster-modal-overlay" role="presentation">
          <div className="school-admin-modal class-roster-modal" role="dialog" aria-modal="true" aria-labelledby="move-student-title">
            <h3 id="move-student-title">Move student to another class</h3>
            <p>
              Choose a destination for <strong>{studentToMove.student.username}</strong>.
            </p>
            <select
              value={moveTargetClassId}
              onChange={(e) => setMoveTargetClassId(e.target.value)}
              aria-label="Destination class"
            >
              <option value="">Select destination class...</option>
              {classes
                .filter((c) => c.is_active && c.class_id !== studentToMove.fromClassId)
                .map((c) => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.class_code} - {c.class_name} ({c.student_count} students)
                  </option>
                ))}
            </select>
            <label>Reason
              <textarea value={placementReason} onChange={(event) => setPlacementReason(event.target.value)} rows={2} />
            </label>
            <label>Effective date
              <input type="date" value={placementEffectiveDate} onChange={(event) => setPlacementEffectiveDate(event.target.value)} />
            </label>
            <div className="class-roster-modal-actions">
              <button
                onClick={() => {
                  setShowMoveModal(false);
                  setStudentToMove(null);
                }}
                className="class-roster-secondary-action"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveStudent}
                disabled={!moveTargetClassId || placementReason.trim().length < 3 || !placementEffectiveDate || actionLoading}
                className="class-roster-primary-action"
              >
                {actionLoading ? 'Moving…' : 'Move student'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && ReactDOM.createPortal(
        <div className="school-admin-modal-overlay class-roster-modal-overlay" role="presentation">
          <div className="school-admin-modal class-roster-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-place-title">
            <h3 id="bulk-place-title">Place selected students</h3>
            <p>
              Choose a destination class for <strong>{selectedStudents.size}</strong> selected students.
            </p>
            <select
              value={bulkTargetClassId}
              onChange={(e) => setBulkTargetClassId(e.target.value)}
              aria-label="Destination class"
            >
              <option value="">Select destination class...</option>
              {classes
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.class_code} - {c.class_name} ({c.student_count} students)
                  </option>
                ))}
            </select>
            <label>Reason
              <textarea value={placementReason} onChange={(event) => setPlacementReason(event.target.value)} rows={2} />
            </label>
            <label>Effective date
              <input type="date" value={placementEffectiveDate} onChange={(event) => setPlacementEffectiveDate(event.target.value)} />
            </label>
            <div className="class-roster-modal-actions">
              <button
                onClick={() => {
                  setShowBulkModal(false);
                }}
                className="class-roster-secondary-action"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAction}
                disabled={!bulkTargetClassId || placementReason.trim().length < 3 || !placementEffectiveDate || actionLoading}
                className="class-roster-primary-action"
              >
                {actionLoading ? 'Processing…' : 'Place students'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ClassRoster;
