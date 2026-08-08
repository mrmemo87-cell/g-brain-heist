import React from 'react';
import { useSchoolAdmin } from '../SchoolAdminContext';

const ClassesTab: React.FC = () => {
  const {
    classForm, classSaving, classes, classesLoading, handleEditClass, handleSaveClass, setClassForm,
  } = useSchoolAdmin();
  const [academicYearFilter, setAcademicYearFilter] = React.useState('');
  const academicYears = React.useMemo(() => Array.from(new Set([
    ...Array.from({ length: 13 }, (_, index) => index + 1),
    ...classes.map((schoolClass: any) => Number(schoolClass.grade_level)).filter(Number.isFinite),
  ])).sort((a, b) => a - b), [classes]);
  const visibleClasses = React.useMemo(() => classes.filter((schoolClass: any) => schoolClass.is_active && (!academicYearFilter || String(schoolClass.grade_level) === academicYearFilter)), [academicYearFilter, classes]);

  return (
    <div className="space-y-6">
      <section className="admin-form-card">
        <div className="admin-card-heading"><div><h3>{classForm.id ? 'Edit class' : 'Create class'}</h3><p>Use a unique code and place the class in its correct grade.</p></div></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Class Code</label>
            <input
              type="text"
              value={classForm.class_code}
              onChange={(e) => setClassForm((prev) => ({ ...prev, class_code: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g. 9A"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">Class Name</label>
            <input
              type="text"
              value={classForm.class_name}
              onChange={(e) => setClassForm((prev) => ({ ...prev, class_name: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="e.g. Grade 9 Blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Academic year (grade)</label>
            <select
              value={classForm.grade_level}
              onChange={(e) => setClassForm((prev) => ({ ...prev, grade_level: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select academic year</option>
              {academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 px-6 pb-6">
          <button
            onClick={handleSaveClass}
            disabled={classSaving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {classSaving ? 'Saving...' : classForm.id ? 'Update Class' : 'Create Class'}
          </button>
          {classForm.id && (
            <button
              onClick={() => setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true })}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </section>

      <section className="admin-table-card">
        <div className="admin-card-heading">
          <div><h3>Classes in school</h3><p>{visibleClasses.length} active class records arranged by academic year and code.</p></div>
          <div className="admin-assignment-filters"><label><span>Academic year (grade)</span><select aria-label="Filter classes by academic year (grade)" value={academicYearFilter} onChange={(event) => setAcademicYearFilter(event.target.value)}><option value="">All academic years</option>{academicYears.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>{classesLoading && <span className="text-xs text-gray-500">Refreshing...</span>}</div>
        </div>
        <div className="admin-table-scroll" role="region" aria-label="Classes table" tabIndex={0}>
          <table className="min-w-[640px] w-full">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Academic year (grade)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {visibleClasses.map((schoolClass: any) => (
                <tr key={schoolClass.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-sm text-white font-semibold">{schoolClass.class_code}</td>
                  <td className="px-4 py-3 text-sm text-gray-200">{schoolClass.class_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{schoolClass.grade_level ? `Grade ${schoolClass.grade_level}` : 'Not set'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleEditClass(schoolClass)}
                      className="text-cyan-400 hover:text-cyan-300 text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleClasses.length === 0 && (
          <div className="p-8 text-center text-gray-400">No classes created yet.</div>
        )}
      </section>
    </div>
  );
};

export default ClassesTab;
