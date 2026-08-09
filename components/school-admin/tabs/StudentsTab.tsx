import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const StudentsTab: React.FC = () => {
  const {
    classById, classes, filteredStudents, handleEnrollStudent, pagedStudents, selectedClassId, selectedGrade, selectedStudentId, setSelectedClassId, setSelectedGrade, setSelectedStudentId, setStudentPage, setStudentPageSize, setStudentSearch, studentAssignments, studentPage, studentPageSize, studentSaving, studentSearch, studentTotalPages, students,
  } = useSchoolAdmin();
  const activeClasses = React.useMemo(() => classes.filter((schoolClass) => schoolClass.is_active), [classes]);
  const academicYears = React.useMemo(() => Array.from(new Set(activeClasses.map((schoolClass) => Number(schoolClass.grade_level)).filter(Number.isFinite))).sort((a, b) => a - b), [activeClasses]);
  const classesForAcademicYear = React.useMemo(() => activeClasses.filter((schoolClass) => selectedGrade !== '' && String(schoolClass.grade_level) === String(selectedGrade)), [activeClasses, selectedGrade]);

  const openGuardianAccess = React.useCallback((studentId: string) => {
    const url = new URL('/guardian-management.html', window.location.origin);
    url.searchParams.set('student', studentId);
    window.location.assign(url.toString());
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Enroll or Move Student</h3>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Student</label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                const studentId = e.target.value;
                const assignedClassId = studentAssignments[studentId] || '';
                const assignedClass = classes.find((schoolClass) => schoolClass.id === assignedClassId);
                setSelectedStudentId(studentId);
                const student = students.find(s => s.user_id === studentId);
                setSelectedGrade(assignedClass?.grade_level ?? student?.grade ?? '');
                setSelectedClassId(assignedClassId);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select student</option>
              {students.map((student) => (
                <option key={student.user_id} value={student.user_id}>
                  {student.username} (Grade {student.grade || 'N/A'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Academic year (grade)</label>
            <select
              value={selectedGrade}
              onChange={(event) => {
                setSelectedGrade(event.target.value ? Number(event.target.value) : '');
                setSelectedClassId('');
              }}
              aria-label="Academic year (grade)"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select academic year</option>
              {academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Class</label>
            <select
              value={selectedClassId}
              disabled={selectedGrade === ''}
              onChange={(e) => {
                const classId = e.target.value;
                const selectedClass = classes.find((schoolClass) => schoolClass.id === classId);
                setSelectedClassId(classId);
                setSelectedGrade(selectedClass?.grade_level ?? '');
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">{selectedGrade === '' ? 'Select academic year first' : 'Select class'}</option>
              {classesForAcademicYear.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.class_code} — {cls.class_name} · Grade {cls.grade_level ?? 'not set'}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleEnrollStudent}
              disabled={studentSaving || !selectedStudentId || !selectedClassId}
              className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
            >
              {studentSaving ? 'Saving...' : 'Save Enrollment'}
            </button>
          </div>
        </div>
        {selectedStudentId && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-900/40 px-3 py-2">
            <p className="text-xs text-gray-500">
              Current class:{' '}
              {studentAssignments[selectedStudentId] && classById[studentAssignments[selectedStudentId] || '']
                ? `${classById[studentAssignments[selectedStudentId] || '']?.class_code}`
                : 'None'}
            </p>
            <button
              type="button"
              onClick={() => openGuardianAccess(selectedStudentId)}
              className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/20"
            >
              Guardian Access
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-300">Students in School</h4>
            <p className="mt-1 text-xs text-gray-500">Manage class placement and verified parent or guardian access from the student roster.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="student-search" className="sr-only">Search students</label>
            <input
              id="student-search"
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students..."
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
            />
            <select
              value={studentPageSize}
              onChange={(e) => setStudentPageSize(Number(e.target.value))}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        <div className="admin-table-scroll" role="region" aria-label="Students table" tabIndex={0}>
          <table className="min-w-[760px] w-full">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Student</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Class</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {pagedStudents.map((student) => {
                const classId = studentAssignments[student.user_id];
                const cls = classId ? classById[classId] : null;
                return (
                  <tr key={student.user_id} className="hover:bg-gray-750">
                    <td className="px-4 py-3 text-sm text-gray-200">{student.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{student.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{cls ? `${cls.class_code} — ${cls.class_name}` : 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setSelectedStudentId(student.user_id);
                            setSelectedClassId(classId || '');
                          }}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={() => openGuardianAccess(student.user_id)}
                          className="text-fuchsia-300 hover:text-fuchsia-200 text-sm"
                        >
                          Guardian Access
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
            <span>Page {studentPage} of {studentTotalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setStudentPage((prev) => Math.max(1, prev - 1))} disabled={studentPage === 1} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50">Previous</button>
              <button onClick={() => setStudentPage((prev) => Math.min(studentTotalPages, prev + 1))} disabled={studentPage >= studentTotalPages} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
        {filteredStudents.length === 0 && <div className="p-8 text-center text-gray-400">No students found.</div>}
      </div>
    </div>
  );
};

export default StudentsTab;
