import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import * as SchoolAdminService from '../services/schoolAdminService';
import type { ClassRosterStudent, ClassWithRosterInfo, ClassStatistics } from '../services/schoolAdminService';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../src/lib/schoolDocument';
import PlacementExceptionQueue from './school-admin/PlacementExceptionQueue';

interface ClassRosterProps {
  schoolId: string;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onRefresh?: () => void;
  schoolName?: string;
  schoolLogoUrl?: string | null;
}

interface ExpandedClass {
  classId: string;
  students: ClassRosterStudent[];
  loading: boolean;
  stats: ClassStatistics | null;
}

const ClassRoster: React.FC<ClassRosterProps> = ({ schoolId, addToast, onRefresh, schoolName = 'Brains Heist', schoolLogoUrl }) => {
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
  const handleRemoveStudent = async (classId: string, studentId: string, studentName: string) => {
    const reason = window.prompt(`Reason for removing ${studentName} from this class:`, 'Administrator-approved unassignment')?.trim();
    if (!reason || reason.length < 3) return;
    const effectiveDate = window.prompt('Effective date (YYYY-MM-DD):', localToday)?.trim();
    if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return;
    if (!confirm(`Confirm this reviewed unassignment effective ${effectiveDate}?`)) return;
    
    setActionLoading(true);
    try {
      const result = await SchoolAdminService.unassignStudentPlacement({ schoolId, studentId, expectedFromClassId: classId, reason, effectiveDate });
      if (result.success) {
        addToast(`Removed ${studentName} from class`, 'success');
        // Reload both the class roster and unassigned students
        const [roster, unassigned] = await Promise.all([
          SchoolAdminService.getClassRoster(classId),
          SchoolAdminService.getUnassignedStudents(schoolId),
        ]);
        setExpandedClasses((prev) => ({
          ...prev,
          [classId]: { ...prev[classId], students: roster },
        }));
        setUnassignedStudents(unassigned);
        loadClasses(); // Update counts
      } else {
        addToast(result.error || 'Failed to remove student', 'error');
      }
    } catch (err) {
      addToast('An error occurred', 'error');
    } finally {
      setActionLoading(false);
    }
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
  const handleAutoEnroll = async (classId: string, classCode: string) => {
    const targetClass = classes.find((item) => item.class_id === classId);
    const matching = unassignedStudents.filter((student) => String(student.grade) === String(targetClass?.grade_level)).map((student) => student.student_id);
    if (matching.length === 0) { addToast('No unassigned students match this class year.', 'info'); return; }
    const reason = window.prompt(`Reason for placing ${matching.length} students into ${classCode}:`, 'Administrator-approved year-group placement')?.trim();
    if (!reason || reason.length < 3) return;
    if (!confirm(`Confirm ${matching.length} reviewed placements effective ${localToday}?`)) return;
    
    setActionLoading(true);
    try {
      const result = await SchoolAdminService.bulkTransferStudentPlacements({ schoolId, studentIds: matching, toClassId: classId, reason, effectiveDate: localToday });
      if (result.success) {
        addToast(result.message || `Reviewed placement saved for ${matching.length} students`, 'success');
        loadClasses();
        // Refresh expanded class if open
        if (expandedClasses[classId]) {
          const roster = await SchoolAdminService.getClassRoster(classId);
          setExpandedClasses((prev) => ({
            ...prev,
            [classId]: { ...prev[classId], students: roster },
          }));
        }
      } else {
        addToast(result.error || 'Failed to auto-enroll', 'error');
      }
    } catch (err) {
      addToast('An error occurred', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Add unassigned student to class
  const handleAddUnassignedToClass = async (studentId: string, classId: string) => {
    const reason = window.prompt('Placement reason:', 'Administrator-approved initial placement')?.trim();
    if (!reason || reason.length < 3) return;
    setActionLoading(true);
    try {
      const result = await SchoolAdminService.transferStudentPlacement({ schoolId, studentId, expectedFromClassId: null, toClassId: classId, reason, effectiveDate: localToday });
      if (result.success) {
        addToast(result.message || 'Student added to class', 'success');
        loadClasses();
        // Refresh unassigned
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

  const printClassRoster = (classInfo: ClassWithRosterInfo, roster: ExpandedClass, register: boolean) => {
    const rows = roster.students.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(student.username)}</td><td>${escapeSchoolDocumentHtml(student.grade || '—')}</td>${register ? '<td>□</td><td>□</td><td>□</td><td></td>' : '<td></td>'}</tr>`).join('');
    try {
      openSchoolDocumentPreview({
        meta: { documentId: createSchoolDocumentId(register ? 'attendance' : 'roster'), templateVersion: register ? 'admin-class-register-v1' : 'admin-class-roster-v1', title: register ? 'Class Attendance Register' : 'Official Class Roster', subtitle: `${classInfo.class_code} · ${classInfo.class_name}`, schoolName, schoolLogoUrl, audience: 'internal', status: 'final', confidentiality: 'confidential', generatedAt: new Date().toISOString(), schoolId, classId: classInfo.class_id, visibilityScope: 'class_staff', sourceType: register ? 'class_register' : 'class_roster', sourceId: classInfo.class_id, className: classInfo.class_code },
        bodyHtml: `<p><strong>Grade:</strong> ${escapeSchoolDocumentHtml(classInfo.grade_level || '—')} · <strong>Enrolled:</strong> ${roster.students.length}</p><table><thead><tr><th>No.</th><th>Official student name</th><th>Grade</th>${register ? '<th>Present</th><th>Absent</th><th>Late</th><th>Notes</th>' : '<th>Administrative notes</th>'}</tr></thead><tbody>${rows || `<tr><td colspan="${register ? 7 : 4}">No students are enrolled in this class.</td></tr>`}</tbody></table>`,
        orientation: 'portrait', inkSaver: true, fileName: schoolDocumentFileName(schoolName, classInfo.class_code, register ? 'Attendance_Register' : 'Class_Roster'),
      });
    } catch (error) { addToast(error instanceof Error ? error.message : 'Unable to open the class document.', 'error'); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
        <span className="ml-3 text-gray-400">Loading class rosters...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PlacementExceptionQueue schoolId={schoolId} classes={classes} addToast={addToast} onChanged={() => { void loadClasses(); setExpandedClasses({}); }} />
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">📋</span> Class Roster Management
          </h3>
          <p className="text-sm text-gray-400 mt-1">
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
                className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
              >
                📦 Bulk Add ({selectedStudents.size})
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                ✕ Clear
              </button>
            </>
          )}
          <button
            onClick={() => setShowUnassigned(!showUnassigned)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showUnassigned
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            👤 Unassigned ({unassignedStudents.length})
          </button>
          <button
            onClick={() => {
              loadClasses();
              setExpandedClasses({});
            }}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search classes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 pl-10 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
        />
        <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
      </div>

      {/* Unassigned Students Panel */}
      {showUnassigned && unassignedStudents.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl p-4">
          <h4 className="text-md font-semibold text-amber-300 mb-3 flex items-center gap-2">
            <span>👤</span> Unassigned Students ({unassignedStudents.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-amber-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-amber-400">Student</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-amber-400">Grade</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-amber-400">Level</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-amber-400">Assign To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-800/30">
                {unassignedStudents.slice(0, 20).map((student) => (
                  <tr key={student.student_id} className="hover:bg-amber-900/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {student.avatar_url ? (
                          <img src={student.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-amber-700 flex items-center justify-center text-xs">
                            {student.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-white text-sm">{student.username}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-amber-200">{student.grade || '-'}</td>
                    <td className="px-3 py-2 text-sm text-amber-200">Lv.{student.level}</td>
                    <td className="px-3 py-2 text-right">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddUnassignedToClass(student.student_id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="px-2 py-1 bg-amber-800/50 border border-amber-600/50 rounded text-sm text-white focus:outline-none"
                        disabled={actionLoading}
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
              <p className="text-center text-amber-400 text-sm mt-2">
                + {unassignedStudents.length - 20} more students
              </p>
            )}
          </div>
        </div>
      )}

      {/* Class List with Expandable Rosters */}
      <div className="space-y-3">
        {filteredClasses.map((classInfo) => {
          const expanded = expandedClasses[classInfo.class_id];
          const isExpanded = !!expanded;
          
          return (
            <div
              key={classInfo.class_id}
              className={`bg-gray-800 border rounded-xl overflow-hidden transition-all ${
                isExpanded ? 'border-cyan-500/50' : 'border-gray-700'
              }`}
            >
              {/* Class Header - Clickable */}
              <div
                onClick={() => toggleExpandClass(classInfo.class_id)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl">
                    {isExpanded ? '📂' : '📁'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-white">{classInfo.class_code}</h4>
                      {!classInfo.is_active && (
                        <span className="px-2 py-0.5 bg-gray-600 text-gray-300 text-xs rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      {classInfo.class_name}
                      {classInfo.grade_level && ` • Grade ${classInfo.grade_level}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-cyan-400">
                        <span>👥</span> {classInfo.student_count}
                      </span>
                      <span className="flex items-center gap-1 text-purple-400">
                        <span>🧑‍🏫</span> {classInfo.teacher_count}
                      </span>
                    </div>
                  </div>
                  <div className="text-gray-400 text-lg">
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </div>
              </div>

              {/* Expanded Roster */}
              {isExpanded && (
                <div className="border-t border-gray-700">
                  {expanded.loading ? (
                    <div className="p-6 text-center text-gray-400">
                      <div className="animate-spin inline-block w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full mr-2"></div>
                      Loading students...
                    </div>
                  ) : (
                    <>
                      {/* Keep the register focused on school operations rather than game statistics. */}
                      {expanded.stats && expanded.stats.teachers.length > 0 && (
                        <div className="p-3 bg-gray-750 border-b border-gray-700 flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Assigned teachers:</span>
                            <span className="text-green-400">
                              {expanded.stats.teachers.map((t) => `${t.username} (${t.subject})`).join(', ')}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="p-3 bg-gray-800 border-b border-gray-700 flex gap-2 flex-wrap">
                        <button type="button" onClick={(event) => { event.stopPropagation(); printClassRoster(classInfo, expanded, false); }} className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded text-sm transition-colors">Print roster</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); printClassRoster(classInfo, expanded, true); }} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-sm transition-colors">Attendance register</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectAllInClass(classInfo.class_id);
                          }}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                        >
                          ☑ Select All
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAutoEnroll(classInfo.class_id, classInfo.class_code);
                          }}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-blue-600/50 hover:bg-blue-600 rounded text-sm transition-colors disabled:opacity-50"
                        >
                          🎯 Auto-Enroll by Grade
                        </button>
                      </div>
                      
                      {/* Student Table */}
                      {expanded.students.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-750 border-b border-gray-700">
                              <tr>
                                <th className="w-10 px-3 py-2">
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
                                    className="rounded border-gray-600 bg-gray-700 text-cyan-500"
                                  />
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Student</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Email</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-400">Level</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-400">XP</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-400">Status</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                              {expanded.students.map((student) => (
                                <tr 
                                  key={student.student_id} 
                                  className={`hover:bg-gray-750 ${
                                    selectedStudents.has(student.student_id) ? 'bg-cyan-900/20' : ''
                                  }`}
                                >
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedStudents.has(student.student_id)}
                                      onChange={() => toggleStudentSelection(student.student_id)}
                                      className="rounded border-gray-600 bg-gray-700 text-cyan-500"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      {student.avatar_url ? (
                                        <img src={student.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                                      ) : (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center text-xs font-bold">
                                          {student.username.charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div>
                                        <div className="text-white text-sm font-medium">{student.username}</div>
                                        <div className="text-gray-500 text-xs">Grade {student.grade || '?'}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-sm text-gray-400">{student.email}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className="px-2 py-0.5 bg-cyan-600/30 text-cyan-300 rounded text-sm font-medium">
                                      Lv.{student.level}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center text-sm text-purple-300">
                                    {student.xp.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {student.is_banned ? (
                                      <span className="px-2 py-0.5 bg-red-600/30 text-red-300 rounded-full text-xs">
                                        Banned
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-green-600/30 text-green-300 rounded-full text-xs">
                                        Active
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveModal(student, classInfo.class_id);
                                        }}
                                        disabled={actionLoading}
                                        className="px-2 py-1 text-blue-400 hover:bg-blue-600/20 rounded text-xs transition-colors"
                                        title="Move to another class"
                                      >
                                        🔄 Move
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveStudent(classInfo.class_id, student.student_id, student.username);
                                        }}
                                        disabled={actionLoading}
                                        className="px-2 py-1 text-red-400 hover:bg-red-600/20 rounded text-xs transition-colors"
                                        title="Remove from class"
                                      >
                                        ✕ Remove
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-gray-500">
                          <p className="text-3xl mb-2">📭</p>
                          <p>No students enrolled in this class</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoEnroll(classInfo.class_id, classInfo.class_code);
                            }}
                            disabled={actionLoading}
                            className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"
                          >
                            🎯 Auto-Enroll Students by Grade
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredClasses.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-500">
          <p className="text-4xl mb-2">📚</p>
          <p>No classes found. Create classes first in the Classes tab.</p>
        </div>
      )}

      {/* Move Student Modal */}
      {showMoveModal && studentToMove && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              Move Student to Another Class
            </h3>
            <p className="text-gray-400 mb-4">
              Moving <strong className="text-white">{studentToMove.student.username}</strong> to:
            </p>
            <select
              value={moveTargetClassId}
              onChange={(e) => setMoveTargetClassId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 mb-4"
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
            <label className="block text-sm text-gray-300 mb-3">Reason
              <textarea value={placementReason} onChange={(event) => setPlacementReason(event.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" rows={2} />
            </label>
            <label className="block text-sm text-gray-300 mb-4">Effective date
              <input type="date" value={placementEffectiveDate} onChange={(event) => setPlacementEffectiveDate(event.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </label>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowMoveModal(false);
                  setStudentToMove(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveStudent}
                disabled={!moveTargetClassId || placementReason.trim().length < 3 || !placementEffectiveDate || actionLoading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors"
              >
                {actionLoading ? 'Moving...' : 'Move Student'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              Bulk Add Students to Class
            </h3>
            <p className="text-gray-400 mb-4">
              Adding <strong className="text-cyan-400">{selectedStudents.size}</strong> selected students to:
            </p>
            <select
              value={bulkTargetClassId}
              onChange={(e) => setBulkTargetClassId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 mb-4"
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
            <label className="block text-sm text-gray-300 mb-3">Reason
              <textarea value={placementReason} onChange={(event) => setPlacementReason(event.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" rows={2} />
            </label>
            <label className="block text-sm text-gray-300 mb-4">Effective date
              <input type="date" value={placementEffectiveDate} onChange={(event) => setPlacementEffectiveDate(event.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </label>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBulkModal(false);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAction}
                disabled={!bulkTargetClassId || placementReason.trim().length < 3 || !placementEffectiveDate || actionLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Add Students'}
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
