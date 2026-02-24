import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';
import * as SchoolAdminService from '../../../services/schoolAdminService';

const TeachersTab: React.FC = () => {
  const {
    addToast, assignmentActive, assignmentClassId, assignmentFilterClassId, assignmentFilterTeacherId, assignmentPage, assignmentPageSize, assignmentSaving, assignmentSubjectInput, assignmentTeacherId, assignmentTotalPages, classById, classes, dbSubjects, filteredTeacherAssignments, handleAssignTeacher, loadAdminTools, pagedTeacherAssignments, school, setAssignmentActive, setAssignmentClassId, setAssignmentFilterClassId, setAssignmentFilterTeacherId, setAssignmentPage, setAssignmentPageSize, setAssignmentSubjectInput, setAssignmentTeacherId, setConfirmDialog, setConfirmReason, teachers,
  } = useSchoolAdmin();

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Assign Teacher to Class + Subject</h3>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Class</label>
            <select
              value={assignmentClassId}
              onChange={(e) => setAssignmentClassId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.class_code} — {cls.class_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Teacher</label>
            <select
              value={assignmentTeacherId}
              onChange={(e) => setAssignmentTeacherId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.user_id} value={teacher.user_id}>
                  {teacher.username}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">Subject</label>
            <select
              value={assignmentSubjectInput}
              onChange={(e) => setAssignmentSubjectInput(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select subject</option>
              {dbSubjects.map((subject) => (
                <option key={subject.id} value={subject.name}>
                  {subject.name} {subject.code && `(${subject.code})`}
                </option>
              ))}
            </select>
            {dbSubjects.length === 0 && (
              <p className="text-xs text-yellow-500 mt-1">
                ⚠️ No subjects available. Go to the Subjects tab to add some.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={assignmentActive}
              onChange={(e) => setAssignmentActive(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
            />
            Active assignment
          </label>
          <button
            onClick={handleAssignTeacher}
            disabled={assignmentSaving || !assignmentClassId || !assignmentTeacherId || !assignmentSubjectInput}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {assignmentSaving ? 'Assigning...' : 'Assign Teacher'}
          </button>
        </div>
        {teachers.length === 0 && (
          <p className="text-xs text-gray-500 mt-3">No teachers found for this school yet.</p>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h4 className="text-sm font-semibold text-gray-300">Current Assignments</h4>
          <div className="flex flex-wrap gap-3">
            <select
              value={assignmentPageSize}
              onChange={(e) => setAssignmentPageSize(Number(e.target.value))}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
            <select
              value={assignmentFilterClassId}
              onChange={(e) => setAssignmentFilterClassId(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
            >
              <option value="">All classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.class_code}
                </option>
              ))}
            </select>
            <select
              value={assignmentFilterTeacherId}
              onChange={(e) => setAssignmentFilterTeacherId(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
            >
              <option value="">All teachers</option>
              {teachers.map((teacher) => (
                <option key={teacher.user_id} value={teacher.user_id}>
                  {teacher.username}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Class</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Teacher</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {pagedTeacherAssignments.map((assignment) => {
                const cls = classById[assignment.class_id];
                const teacher = teachers.find((t) => t.user_id === assignment.teacher_user_id);
                return (
                  <tr key={assignment.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3 text-sm text-gray-200">
                      {cls ? `${cls.class_code} — ${cls.class_name}` : <span className="text-yellow-400 italic text-xs">Unknown class</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-200">
                      {teacher ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{teacher.username}</span>
                          {teacher.verified && <span className="text-cyan-400 text-xs">✓</span>}
                        </div>
                      ) : (
                        <span className="text-yellow-400 italic text-xs">Unknown teacher</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{assignment.subject}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${assignment.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600/40 text-gray-300'}`}>
                        {assignment.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setConfirmReason('');
                          setConfirmDialog({
                            title: 'Delete assignment',
                            description: `Remove ${teacher?.username || 'this teacher'} from teaching ${assignment.subject} in ${cls?.class_code || 'this class'}?`,
                            confirmLabel: 'Delete assignment',
                            cancelLabel: 'Cancel',
                            isDestructive: true,
                            onConfirm: async () => {
                              const result = await SchoolAdminService.deleteTeacherAssignment(assignment.id, school?.id);
                              if (result.success) {
                                addToast('Assignment deleted successfully', 'success');
                                if (school) await loadAdminTools(school.id);
                              } else {
                                addToast(`Failed to delete: ${result.error}`, 'error');
                              }
                            },
                          });
                        }}
                        className="text-red-400 hover:text-red-300 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredTeacherAssignments.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
            <span>
              Page {assignmentPage} of {assignmentTotalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAssignmentPage((prev) => Math.max(1, prev - 1))}
                disabled={assignmentPage === 1}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setAssignmentPage((prev) => Math.min(assignmentTotalPages, prev + 1))}
                disabled={assignmentPage >= assignmentTotalPages}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
        {filteredTeacherAssignments.length === 0 && (
          <div className="p-8 text-center text-gray-400">No assignments found.</div>
        )}
      </div>
    </div>
  );
};

export default TeachersTab;
